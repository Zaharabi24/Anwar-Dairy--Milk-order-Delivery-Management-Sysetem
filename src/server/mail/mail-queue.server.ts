// The batch mail queue: BullMQ on Redis, with an in-process fallback when Redis isn't there.
//
// Publishing to the Employee Database is 360 messages that Microsoft 365 will only accept 30 a
// minute of, so the send is a quarter of an hour of paced work that has to survive restarts,
// deploys and a mail server that says "not now". That is a job queue, and this is one.
//
// Redis is what makes it durable: the jobs outlive the process, one worker owns the rate limit
// however many app instances are running, and a retry is scheduled rather than attempted in a
// loop. Without REDIS_URL the same work runs in-process at the same pace -- slower to recover
// from a restart, but correct, and the app still starts on a machine that has no Redis.
import { Queue, Worker, type Job } from "bullmq";
import IORedis, { type Redis } from "ioredis";
import { getDb } from "../db/client.server";
import { recordAttempt, sendQueuedEmail, updatePublicationTotals } from "./batch-mail.server";
import { MAIL_INTERVAL_MS, MAIL_RATE_PER_MINUTE, MAX_ATTEMPTS } from "./rate.server";

type Row = Record<string, string | number | boolean | Date | null>;

const QUEUE_NAME = "batch-mail";

interface JobData {
  emailId: string;
  publicationId: string;
}

const redisUrl = () => process.env["REDIS_URL"]?.trim() || "";

/** Whether the durable queue is configured. Everything still works when it isn't. */
export const isQueueEnabled = () => redisUrl().length > 0;

let connection: Redis | undefined;
let queue: Queue<JobData> | undefined;
let worker: Worker<JobData> | undefined;
let announced = false;

function connect(): Redis {
  connection ??= new IORedis(redisUrl(), {
    // BullMQ blocks on Redis while waiting for work, so a retry ceiling would end the worker.
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  return connection;
}

function getQueue(): Queue<JobData> | null {
  if (!isQueueEnabled()) return null;
  queue ??= new Queue<JobData>(QUEUE_NAME, {
    connection: connect(),
    defaultJobOptions: {
      attempts: MAX_ATTEMPTS,
      // A throttled mailbox needs time, not another try a second later. Thirty seconds, then a
      // minute, then two -- by which point 365's per-minute window has long since rolled over.
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: { age: 86_400, count: 5_000 },
      removeOnFail: { age: 7 * 86_400 },
    },
  });
  return queue;
}

/**
 * Starts the worker that actually sends. Called once at boot, so a queue left part-sent by a
 * restart carries on without waiting for somebody to open a page.
 */
export function startMailWorker(): void {
  if (!isQueueEnabled() || worker) return;

  worker = new Worker<JobData>(
    QUEUE_NAME,
    async (job: Job<JobData>) => {
      const outcome = await sendQueuedEmail(job.data.emailId);
      if (outcome.result === "sent" || outcome.result === "done") {
        await updatePublicationTotals(job.data.publicationId);
        return;
      }
      // One attempt left means this is the last one, so the row is settled as failed rather than
      // left saying it will be retried.
      const attemptsMade = job.attemptsMade + 1;
      const attemptsLeft = attemptsMade < (job.opts.attempts ?? MAX_ATTEMPTS);
      await recordAttempt(
        job.data.emailId,
        outcome,
        attemptsLeft && outcome.result === "retry",
        attemptsMade,
      );
      await updatePublicationTotals(job.data.publicationId);
      // Thrown so BullMQ schedules the retry. A permanent failure is thrown too, but with no
      // attempts left after this one it simply comes to rest in the failed set.
      if (outcome.result === "retry" && attemptsLeft) throw new Error(outcome.error);
      if (outcome.result === "failed") return;
      throw new Error(outcome.error);
    },
    {
      connection: connect(),
      // One at a time, and no faster than the provider accepts. The limiter is what the whole
      // queue exists for: it is shared through Redis, so two app instances still send 25 a minute
      // between them rather than 25 each.
      concurrency: 1,
      limiter: { max: MAIL_RATE_PER_MINUTE, duration: 60_000 },
    },
  );

  worker.on("failed", (job, error) => {
    console.warn(
      `[mail] job ${job?.id ?? "?"} attempt ${job?.attemptsMade ?? 0}/${MAX_ATTEMPTS} failed: ${error.message}`,
    );
  });
  worker.on("error", (error) => console.error("[mail] queue worker error", error));

  console.info(
    `[mail] queue ready on Redis — ${MAIL_RATE_PER_MINUTE} messages/minute, ${MAX_ATTEMPTS} attempts each`,
  );
}

/** Puts every queued message for a publication on the queue. Safe to call again: ids are job ids. */
export async function enqueuePublication(publicationId: string): Promise<number> {
  const q = getQueue();
  const sql = await getDb();
  const rows = await sql<Row[]>`
    select id from batch_emails
    where publication_id = ${publicationId} and status = 'queued' and attempts < ${MAX_ATTEMPTS}
    order by id`;
  if (!rows.length) return 0;

  if (!q) {
    // No Redis: the in-process pacer takes it instead.
    void runInProcess(publicationId).catch((error) =>
      console.error("[mail] in-process send failed", error),
    );
    return rows.length;
  }

  await q.addBulk(
    rows.map((r) => ({
      name: "send",
      data: { emailId: String(r["id"]), publicationId },
      // The row id is the job id, so re-enqueuing the same message is ignored rather than
      // sending it twice -- which is what makes "resume" safe to call as often as you like.
      opts: { jobId: `email-${String(r["id"])}` },
    })),
  );
  return rows.length;
}

/**
 * Puts back anything a publication still owes, and returns how much is outstanding.
 *
 * With Redis this is cheap and idempotent -- the jobs are probably already there, and the job id
 * makes re-adding a no-op. Without it, this is what restarts the in-process pacer.
 */
export async function resumePendingPublications(): Promise<{ pending: number }> {
  const sql = await getDb();
  const rows = await sql<Row[]>`
    select distinct p.id
    from batch_publications p
    join batch_emails e on e.publication_id = p.id
    where p.status = 'sending' and e.status = 'queued' and e.attempts < ${MAX_ATTEMPTS}
    order by p.id desc
    limit 10`;

  let pending = 0;
  for (const row of rows) pending += await enqueuePublication(row["id"] as string);
  return { pending };
}

/** How many messages a publication still has to send. */
export async function pendingCount(publicationId: string): Promise<number> {
  const sql = await getDb();
  const [row] = (await sql<Row[]>`
    select count(*)::int as n from batch_emails
    where publication_id = ${publicationId}
      and attempts < ${MAX_ATTEMPTS} and status in ('queued', 'sending')`) as unknown as [
    { n: number },
  ];
  return row.n;
}

// ---------------------------------------------------------------------------
// The fallback, for a deployment without Redis.

const running = new Set<string>();

/**
 * Sends a publication's mail in this process, one message every `MAIL_INTERVAL_MS`.
 *
 * The same pace and the same attempt ceiling as the worker, so behaviour doesn't change with the
 * deployment -- only durability does. A restart stops it, and the next publish or the next look
 * at Publish Records starts it again from whatever is still queued.
 */
async function runInProcess(publicationId: string): Promise<void> {
  if (running.has(publicationId)) return;
  running.add(publicationId);
  if (!announced) {
    announced = true;
    console.info(
      `[mail] REDIS_URL is not set — sending in-process at ${MAIL_RATE_PER_MINUTE} messages/minute. ` +
        `Set REDIS_URL for a durable queue that survives a restart.`,
    );
  }
  try {
    const sql = await getDb();
    for (;;) {
      const [next] = (await sql<Row[]>`
        update batch_emails set status = 'sending', claimed_at = now(), attempts = attempts + 1
        where id = (
          select id from batch_emails
          where publication_id = ${publicationId}
            and status = 'queued' and attempts < ${MAX_ATTEMPTS}
          order by id limit 1 for update skip locked
        )
        returning id`) as unknown as [Row | undefined];
      if (!next) break;

      const emailId = String(next["id"]);
      const outcome = await sendQueuedEmail(emailId);
      if (outcome.result === "retry" || outcome.result === "failed") {
        const [attempt] = (await sql<Row[]>`
          select attempts from batch_emails where id = ${emailId}`) as unknown as [
          {
            attempts: number;
          },
        ];
        await recordAttempt(
          emailId,
          outcome,
          outcome.result === "retry" && attempt.attempts < MAX_ATTEMPTS,
          attempt.attempts,
        );
      }
      await updatePublicationTotals(publicationId);
      await new Promise((resolve) => setTimeout(resolve, MAIL_INTERVAL_MS));
    }
    await updatePublicationTotals(publicationId);
  } finally {
    running.delete(publicationId);
  }
}
