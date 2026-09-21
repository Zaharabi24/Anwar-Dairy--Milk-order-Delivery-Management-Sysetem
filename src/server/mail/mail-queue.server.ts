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
import {
  recordCampaignAttempt,
  sendCampaignEmail,
  updateCampaignTotals,
} from "./campaign-mail.server";
import { MAIL_INTERVAL_MS, MAIL_RATE_PER_MINUTE, MAX_ATTEMPTS } from "./rate.server";

type Row = Record<string, string | number | boolean | Date | null>;

const QUEUE_NAME = "batch-mail";

/**
 * A batch email, or a message from the System Admin's mailbox.
 *
 * Both kinds go on the same queue on purpose. The 30 a minute Microsoft 365 allows belongs to the
 * mailbox, not to either queue, so a notice sent while a batch is still going out has to come out
 * of the same allowance -- two queues with a limiter each would add up to twice the limit and get
 * both of them throttled.
 */
interface JobData {
  kind?: "batch" | "campaign";
  /** batch_emails.id, or mail_campaign_recipients.id for a campaign. */
  emailId: string;
  /** batch_publications.id, or mail_campaigns.id for a campaign. */
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
      const campaign = job.data.kind === "campaign";
      const send = campaign ? sendCampaignEmail : sendQueuedEmail;
      const note = campaign ? recordCampaignAttempt : recordAttempt;
      const total = campaign ? updateCampaignTotals : updatePublicationTotals;

      const outcome = await send(job.data.emailId);
      if (outcome.result === "sent" || outcome.result === "done") {
        await total(job.data.publicationId);
        return;
      }
      // One attempt left means this is the last one, so the row is settled as failed rather than
      // left saying it will be retried.
      const attemptsMade = job.attemptsMade + 1;
      const attemptsLeft = attemptsMade < (job.opts.attempts ?? MAX_ATTEMPTS);
      await note(
        job.data.emailId,
        outcome,
        attemptsLeft && outcome.result === "retry",
        attemptsMade,
      );
      await total(job.data.publicationId);
      // Thrown so BullMQ schedules the retry. A permanent failure is thrown too, but with no
      // attempts left after this one it simply comes to rest in the failed set.
      if (outcome.result === "retry" && attemptsLeft) throw new Error(outcome.error);
      if (outcome.result === "failed") return;
      throw new Error(outcome.error);
    },
    {
      connection: connect(),
      // One message every MAIL_INTERVAL_MS, not a burst inside a minute.
      //
      // "25 per 60 seconds" is the same average as "one per 2.4 seconds" and behaves nothing
      // like it: the first form lets BullMQ fire all twenty-five back to back in a couple of
      // seconds and then idle, and twenty-five SMTP transactions in two seconds is the shape
      // that trips Exchange's throttle however modest the per-minute figure looks. Spacing them
      // is what the mail server is actually asking for.
      //
      // Expressed through the limiter rather than a sleep in the handler so it is enforced in
      // Redis: two app instances still share one steady trickle instead of two.
      concurrency: 1,
      limiter: { max: 1, duration: MAIL_INTERVAL_MS },
    },
  );

  worker.on("failed", (job, error) => {
    console.warn(
      `[mail] job ${job?.id ?? "?"} attempt ${job?.attemptsMade ?? 0}/${MAX_ATTEMPTS} failed: ${error.message}`,
    );
  });
  worker.on("error", (error) => console.error("[mail] queue worker error", error));

  console.info(
    `[mail] queue ready on Redis — one message every ${(MAIL_INTERVAL_MS / 1000).toFixed(1)}s ` +
      `(${MAIL_RATE_PER_MINUTE}/minute), ${MAX_ATTEMPTS} attempts each`,
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

// ---------------------------------------------------------------------------
// The System Admin's mailbox, on the same queue and the same rate limit.

/** Puts a campaign's unsent messages on the queue. Safe to call again: the row id is the job id. */
export async function enqueueCampaign(campaignId: string): Promise<number> {
  const q = getQueue();
  const sql = await getDb();
  const rows = await sql<Row[]>`
    select id from mail_campaign_recipients
    where campaign_id = ${campaignId} and status = 'queued' and attempts < ${MAX_ATTEMPTS}
    order by id`;
  if (!rows.length) return 0;

  if (!q) {
    void runCampaignInProcess(campaignId).catch((error) =>
      console.error("[mail] in-process campaign send failed", error),
    );
    return rows.length;
  }

  await q.addBulk(
    rows.map((r) => ({
      name: "send",
      data: { kind: "campaign" as const, emailId: String(r["id"]), publicationId: campaignId },
      opts: { jobId: `campaign-${String(r["id"])}` },
    })),
  );
  return rows.length;
}

/** Restarts any campaign that still has messages waiting, the way publications are resumed. */
export async function resumePendingCampaigns(): Promise<{ pending: number }> {
  const sql = await getDb();
  const rows = await sql<Row[]>`
    select distinct c.id
    from mail_campaigns c
    join mail_campaign_recipients r on r.campaign_id = c.id
    where c.status = 'sending' and r.status = 'queued' and r.attempts < ${MAX_ATTEMPTS}
    order by c.id desc
    limit 10`;
  let pending = 0;
  for (const row of rows) pending += await enqueueCampaign(row["id"] as string);
  return { pending };
}

/** The no-Redis path, at the same pace and the same attempt ceiling as the worker. */
async function runCampaignInProcess(campaignId: string): Promise<void> {
  const key = `campaign:${campaignId}`;
  if (running.has(key)) return;
  running.add(key);
  try {
    const sql = await getDb();
    for (;;) {
      const [next] = (await sql<Row[]>`
        update mail_campaign_recipients
        set status = 'sending', claimed_at = now(), attempts = attempts + 1
        where id = (
          select id from mail_campaign_recipients
          where campaign_id = ${campaignId} and status = 'queued' and attempts < ${MAX_ATTEMPTS}
          order by id limit 1 for update skip locked
        )
        returning id`) as unknown as [Row | undefined];
      if (!next) break;

      const recipientId = String(next["id"]);
      const outcome = await sendCampaignEmail(recipientId);
      if (outcome.result === "retry" || outcome.result === "failed") {
        const [attempt] = (await sql<Row[]>`
          select attempts from mail_campaign_recipients where id = ${recipientId}`) as unknown as [
          { attempts: number },
        ];
        await recordCampaignAttempt(
          recipientId,
          outcome,
          outcome.result === "retry" && attempt.attempts < MAX_ATTEMPTS,
          attempt.attempts,
        );
      }
      await updateCampaignTotals(campaignId);
      await new Promise((resolve) => setTimeout(resolve, MAIL_INTERVAL_MS));
    }
    await updateCampaignTotals(campaignId);
  } finally {
    running.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Retrying what finally failed.
//
// A message that used up its attempts stops being picked up: every resume path looks for 'queued'
// rows, so a row sitting at 'failed' is done with as far as the queue is concerned. That is the
// right default -- a queue that retries forever is a queue that never tells you anything is wrong
// -- but it leaves no way back once the cause has been dealt with. A mailbox that was over its
// limit for an hour, a relay that was down, a password that had expired: the address was never
// bad, and the only thing standing between it and delivery is somebody saying "go on then".
//
// Resending clears the attempt count as well as the status, so the message gets a full set of
// tries again rather than one.

/**
 * Clears finished jobs out of the way so the same messages can be queued again.
 *
 * The job id is the row id, which is what makes resuming safe to call as often as you like: a
 * message already on the queue is not added twice. It also means a *finished* job blocks a new
 * one, because BullMQ keeps completed and failed jobs around for a day and ignores an add that
 * reuses their id. For a resume that is exactly right. For a deliberate resend it is the whole
 * problem -- the rows go back to 'queued' and then sit there, because nothing new was ever
 * queued. So the old job is removed first.
 */
async function forgetJobs(ids: string[], prefix: "email" | "campaign"): Promise<void> {
  const q = getQueue();
  if (!q) return;
  await Promise.all(
    ids.map(async (id) => {
      try {
        await q.remove(`${prefix}-${id}`);
      } catch {
        // Already gone, or still running. Either way there is nothing to clear.
      }
    }),
  );
}

/** Puts a publication's failed messages back on the queue. Returns how many were revived. */
export async function resendFailedPublication(publicationId: string): Promise<number> {
  const sql = await getDb();
  const revived = await sql<Row[]>`
    update batch_emails
    set status = 'queued', attempts = 0, claimed_at = null
    where publication_id = ${publicationId} and status = 'failed'
    returning id`;
  if (!revived.length) return 0;
  await sql`
    update batch_publications set status = 'sending', completed_at = null
    where id = ${publicationId}`;
  await forgetJobs(
    revived.map((r) => String(r["id"])),
    "email",
  );
  await enqueuePublication(publicationId);
  return revived.length;
}

/** The same for one of the System Admin's mailbox messages. */
export async function resendFailedCampaign(campaignId: string): Promise<number> {
  const sql = await getDb();
  const revived = await sql<Row[]>`
    update mail_campaign_recipients
    set status = 'queued', attempts = 0, claimed_at = null
    where campaign_id = ${campaignId} and status = 'failed'
    returning id`;
  if (!revived.length) return 0;
  await sql`
    update mail_campaigns set status = 'sending', completed_at = null where id = ${campaignId}`;
  await forgetJobs(
    revived.map((r) => String(r["id"])),
    "campaign",
  );
  await enqueueCampaign(campaignId);
  return revived.length;
}
