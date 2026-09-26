import { createFileRoute, useRouter } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Field, FilterBar, FilterRow } from "@/components/ui/field";
import { FILTER_CONTROL, FILTER_SEARCH } from "@/components/ui/control-styles";
import {
  listBatchEmailsFn,
  listPublishRecordsFn,
  resendFailedBatchMailFn,
  resumePublicationMailFn,
} from "@/functions/records.functions";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppData } from "@/context/app-data";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/permissions";
import { dateShort, taka, timeShort } from "@/lib/format";
import { EMPTY_EMAIL_QUERY, type EmailRecordQuery } from "@/lib/records.schemas";
import type {
  EmailRecordRow,
  EmailStatus,
  PublishRecord,
  PublishStatus,
} from "@/lib/records-types";

export const Route = createFileRoute("/app/operator/publish-records")({
  head: () => ({
    meta: [
      { title: "Publish records — Anwar Organic" },
      {
        name: "description",
        content: "Every batch you have published, who it was emailed to, and how the send went.",
      },
      { property: "og:title", content: "Publish records — Anwar Organic" },
      {
        property: "og:description",
        content: "A history of every published batch and its booking email.",
      },
    ],
  }),
  loader: () => listPublishRecordsFn(),
  component: PublishRecords,
});

const STATUS_LABEL: Record<PublishStatus, string> = {
  sending: "Sending",
  sent: "All sent",
  partial: "Partly sent",
  failed: "Send failed",
  no_recipients: "No recipients",
};

const STATUS_TONE: Record<PublishStatus, string> = {
  sending: "bg-secondary text-muted-foreground",
  sent: "bg-primary/10 text-primary-deep",
  partial: "bg-accent/15 text-accent-foreground",
  failed: "bg-destructive/10 text-destructive",
  no_recipients: "bg-secondary text-muted-foreground",
};

const EMAIL_LABEL: Record<EmailStatus, string> = {
  queued: "Queued",
  sending: "Sending",
  sent: "Sent",
  captured: "Captured locally",
  failed: "Failed",
  logged: "Logged only",
  skipped: "No address",
};

const EMAIL_TONE: Record<EmailStatus, string> = {
  queued: "bg-secondary text-muted-foreground",
  sending: "bg-secondary text-muted-foreground",
  sent: "bg-primary/10 text-primary-deep",
  captured: "bg-accent/15 text-accent-foreground",
  failed: "bg-destructive/10 text-destructive",
  logged: "bg-secondary text-muted-foreground",
  skipped: "bg-secondary text-muted-foreground",
};

function PublishRecords() {
  const records = Route.useLoaderData();
  const totalRecipients = records.reduce((n, r) => n + r.recipients, 0);
  const totalSent = records.reduce((n, r) => n + r.sentCount, 0);
  const totalFailed = records.reduce((n, r) => n + r.failedCount, 0);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Publish records"
        description="Every batch published from here, who was emailed, and what was booked afterwards."
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Batches published" value={records.length} />
        <StatCard label="Emails Sent Out" value={totalRecipients} />
        <StatCard label="Delivered" value={totalSent} emphasis />
        <StatCard label="Failed" value={totalFailed} />
      </div>

      {/* Two questions, two tabs. "Which batches have I published?" is a list of sends; "who
          didn't get it?" is a list of people, and answering the second from a table of the first
          meant opening every row in turn. */}
      <Tabs defaultValue="batches" className="mt-6">
        <TabsList>
          <TabsTrigger value="batches">Batches</TabsTrigger>
          <TabsTrigger value="delivery">Email delivery</TabsTrigger>
        </TabsList>
        <TabsContent value="batches" className="mt-6">
          <Batches records={records} />
        </TabsContent>
        <TabsContent value="delivery" className="mt-6">
          <Delivery records={records} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Batches

function Batches({ records }: { records: PublishRecord[] }) {
  const router = useRouter();
  const { user } = useAuth();
  const { deleteBatch } = useAppData();
  // Deleting a batch belongs to the Super Admin. The server refuses anyone else either way; this
  // is so an operator isn't shown a button that will only tell them no.
  const canDelete = hasPermission(user?.roles ?? [], "batches.delete");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<PublishRecord | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records
      .filter((r) => (status === "all" ? true : r.status === status))
      .filter(
        (r) =>
          !q ||
          r.batchNo.toLowerCase().includes(q) ||
          r.publishedBy.toLowerCase().includes(q) ||
          r.collectionPoints.toLowerCase().includes(q),
      );
  }, [records, query, status]);

  async function act(id: string, what: "resume" | "retry") {
    setBusy(id);
    try {
      const result =
        what === "resume"
          ? await resumePublicationMailFn({ data: { publicationId: id } })
          : await resendFailedBatchMailFn({ data: { publicationId: id } });
      toast.success(
        result.queued > 0
          ? `${result.queued} message${result.queued === 1 ? "" : "s"} back on the queue. They go out at the rate the mail server accepts.`
          : "Nothing left to send.",
      );
      await router.invalidate();
    } catch {
      toast.error("Couldn't queue those just now. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <FilterRow>
        <Input
          className={FILTER_SEARCH}
          placeholder="Search batch, publisher or collection point"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className={FILTER_CONTROL}>
            <SelectValue placeholder="Send status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            {(Object.keys(STATUS_LABEL) as PublishStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterRow>

      <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title={records.length ? "No publishes match" : "Nothing published yet"}
              hint={
                records.length
                  ? "Try clearing the filters."
                  : "Publishing a batch emails everyone it is addressed to, and records it here."
              }
            />
          </div>
        ) : (
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <Th>Batch</Th>
                <Th>Published</Th>
                <Th>Bookings close</Th>
                <Th>Collection point</Th>
                <Th>Emails Sent Out</Th>
                <Th>Delivery</Th>
                <Th>Booked</Th>
                {/* This column had no heading at all. It holds the things you can do to a send. */}
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <PublishRow
                  key={r.id}
                  record={r}
                  index={i}
                  open={open === r.id}
                  onToggle={() => setOpen(open === r.id ? null : r.id)}
                  busy={busy === r.id}
                  onResume={() => void act(r.id, "resume")}
                  onRetryFailed={() => void act(r.id, "retry")}
                  {...(canDelete ? { onDelete: () => setDeleting(r) } : {})}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <DeleteBatchDialog
        record={deleting}
        onClose={() => setDeleting(null)}
        onConfirm={async (batchNo, typed) => {
          const removed = await deleteBatch(batchNo, typed);
          if (!removed) return false;
          toast.success(
            `${batchNo} deleted — ${removed["orders"]} order${removed["orders"] === 1 ? "" : "s"}, ` +
              `${removed["collections"]} collection${removed["collections"] === 1 ? "" : "s"}, ` +
              `${removed["coupons"]} coupon${removed["coupons"] === 1 ? "" : "s"} and ` +
              `${removed["emails"]} email record${removed["emails"] === 1 ? "" : "s"} went with it.`,
          );
          setDeleting(null);
          await router.invalidate();
          return true;
        }}
      />
    </div>
  );
}

/**
 * Confirming a batch delete.
 *
 * It says what will go and how much of it, then asks for the batch number to be typed. A row of
 * buttons where one of them silently removes a day's orders, money owed and handover coupons is
 * not a row anybody should be one mis-click away from.
 */
function DeleteBatchDialog({
  record,
  onClose,
  onConfirm,
}: {
  record: PublishRecord | null;
  onClose: () => void;
  onConfirm: (batchNo: string, typed: string) => Promise<boolean>;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTyped("");
    setBusy(false);
  }, [record]);

  const matches = record ? typed.trim().toUpperCase() === record.batchNo.toUpperCase() : false;

  return (
    <Dialog open={!!record} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {record?.batchNo}?</DialogTitle>
        </DialogHeader>
        {record ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This cannot be undone. Everything belonging to the batch goes with it:
            </p>
            <ul className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
              <li>
                <span className="font-medium">{record.orderCount}</span>{" "}
                {record.orderCount === 1 ? "order" : "orders"} ({record.bookedLitres} L booked),
                with the payments collected against them and the coupons handed out
              </li>
              <li>
                <span className="font-medium">{record.recipients}</span> email record
                {record.recipients === 1 ? "" : "s"} and every booking link issued for the batch
              </li>
              <li>the batch itself, its collection points and its chosen recipients</li>
            </ul>
            <Field
              label={`Type ${record.batchNo} to confirm`}
              htmlFor="confirm-batch-no"
              {...(typed.trim() && !matches ? { error: "That isn't the batch number." } : {})}
            >
              <Input
                id="confirm-batch-no"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={record.batchNo}
                autoComplete="off"
              />
            </Field>
          </div>
        ) : null}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!matches || busy}
            onClick={() => {
              if (!record) return;
              setBusy(true);
              void onConfirm(record.batchNo, typed.trim().toUpperCase()).then((done) => {
                if (!done) setBusy(false);
              });
            }}
          >
            {busy ? "Deleting…" : "Delete batch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PublishRow({
  record: r,
  index,
  open,
  onToggle,
  busy,
  onResume,
  onRetryFailed,
  onDelete,
}: {
  record: PublishRecord;
  index: number;
  open: boolean;
  onToggle: () => void;
  busy: boolean;
  onResume: () => void;
  onRetryFailed: () => void;
  /** Given only to a Super Admin; absent for everybody else. */
  onDelete?: () => void;
}) {
  return (
    <>
      <motion.tr
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, delay: Math.min(index * 0.02, 0.2) }}
        className="border-b border-border/60 last:border-0"
      >
        <Td className="font-medium">
          {r.batchNo}
          <span className="block text-xs font-normal text-muted-foreground">{r.product}</span>
        </Td>
        <Td>
          {dateShort(r.publishedAt)}, {timeShort(r.publishedAt)}
          <span className="block text-xs text-muted-foreground">by {r.publishedBy}</span>
        </Td>
        <Td>
          {dateShort(r.bookingCutoff)}, {timeShort(r.bookingCutoff)}
          <span className="block text-xs text-muted-foreground">links expire</span>
        </Td>
        <Td>{r.collectionPoints || "—"}</Td>
        <Td>{r.recipients}</Td>
        <Td>
          <span
            className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_TONE[r.status]}`}
          >
            {STATUS_LABEL[r.status]}
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {r.sentCount} delivered
            {r.failedCount ? `, ${r.failedCount} failed` : ""}
            {r.skippedCount ? `, ${r.skippedCount} no address` : ""}
            {r.pendingCount ? `, ${r.pendingCount} to go` : ""}
          </span>
        </Td>
        <Td>
          {r.bookedLitres} L
          <span className="block text-xs text-muted-foreground">
            {r.orderCount} {r.orderCount === 1 ? "order" : "orders"}
          </span>
        </Td>
        <Td>
          <div className="flex flex-col items-start gap-2">
            <button
              type="button"
              onClick={onToggle}
              className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-secondary"
            >
              {open ? "Hide details" : "Details"}
            </button>
            {r.pendingCount ? (
              <Button variant="outline" size="sm" disabled={busy} onClick={onResume}>
                {busy ? "Queueing…" : "Send the rest"}
              </Button>
            ) : null}
            {r.failedCount ? (
              <Button variant="outline" size="sm" disabled={busy} onClick={onRetryFailed}>
                {busy ? "Queueing…" : `Resend ${r.failedCount} failed`}
              </Button>
            ) : null}
            {onDelete ? (
              <Button variant="outline" size="sm" onClick={onDelete}>
                Delete batch
              </Button>
            ) : null}
          </div>
        </Td>
      </motion.tr>
      {open ? (
        <tr className="border-b border-border/60 bg-secondary/40 last:border-0">
          <td colSpan={8} className="px-4 py-4">
            <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-3">
              <Detail label="Rate" value={`${taka(r.ratePerLitre)} per litre`} />
              <Detail label="Offered" value={`${r.saleableLitres} litres`} />
              <Detail
                label="Collect on"
                value={`${dateShort(r.deliveryDate)}, ${r.deliveryWindow}`}
              />
              <Detail label="Batch status now" value={r.batchStatus} />
              <Detail
                label="Send finished"
                value={
                  r.completedAt
                    ? `${dateShort(r.completedAt)}, ${timeShort(r.completedAt)}`
                    : "Still sending"
                }
              />
              <Detail
                label="Emails Sent Out"
                value={`${r.recipients} addressed, ${r.sentCount} delivered`}
              />
            </dl>
          </td>
        </tr>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Email delivery

const PAGE_SIZE = 100;

function Delivery({ records }: { records: PublishRecord[] }) {
  const router = useRouter();
  const [page, setPage] = useState<{ records: EmailRecordRow[]; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [batchNo, setBatchNo] = useState("all");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);

  // Newest first, and one entry per batch however many times it was published.
  const batches = useMemo(() => [...new Set(records.map((r) => r.batchNo))], [records]);

  const query = useMemo<EmailRecordQuery>(
    () => ({
      ...EMPTY_EMAIL_QUERY,
      from: from || null,
      to: to || null,
      batchNo: batchNo === "all" ? null : batchNo,
      status: status === "all" ? null : (status as EmailStatus),
      search,
      limit: PAGE_SIZE,
      offset,
    }),
    [from, to, batchNo, status, search, offset],
  );

  const load = useCallback(async (q: EmailRecordQuery) => {
    setLoading(true);
    try {
      setPage(await listBatchEmailsFn({ data: q }));
    } catch {
      toast.error("Couldn't load the delivery list.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => void load(query), 250);
    return () => clearTimeout(id);
  }, [query, load]);

  function filter(set: () => void) {
    setOffset(0);
    set();
  }

  // Resending is per publish, so it needs one batch chosen. Every publication of that batch is
  // covered, which is what "resend the failures for this batch" means to the person asking.
  const chosen = batchNo === "all" ? [] : records.filter((r) => r.batchNo === batchNo);
  const failedInBatch = chosen.reduce((n, r) => n + r.failedCount, 0);

  async function resendBatch() {
    setBusy(true);
    try {
      let queued = 0;
      for (const publication of chosen) {
        const result = await resendFailedBatchMailFn({ data: { publicationId: publication.id } });
        queued += result.queued;
      }
      toast.success(
        queued > 0
          ? `${queued} failed message${queued === 1 ? "" : "s"} back on the queue for ${batchNo}.`
          : "Nothing failed on this batch.",
      );
      await router.invalidate();
      await load(query);
    } catch {
      toast.error("Couldn't queue those just now. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const shownFrom = !page || page.total === 0 ? 0 : offset + 1;
  const shownTo = page ? Math.min(offset + page.records.length, page.total) : 0;

  return (
    <div>
      <FilterBar columns={5}>
        <Field label="Batch">
          <Select value={batchNo} onValueChange={(v) => filter(() => setBatchNo(v))}>
            <SelectTrigger>
              <SelectValue placeholder="Batch" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All batches</SelectItem>
              {batches.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Delivery status">
          <Select value={status} onValueChange={(v) => filter(() => setStatus(v))}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              {(Object.keys(EMAIL_LABEL) as EmailStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {EMAIL_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="From date">
          <Input type="date" value={from} onChange={(e) => filter(() => setFrom(e.target.value))} />
        </Field>
        <Field label="To date">
          <Input type="date" value={to} onChange={(e) => filter(() => setTo(e.target.value))} />
        </Field>
        <Field label="Search">
          <Input
            placeholder="Name, ID, email, department"
            value={search}
            onChange={(e) => filter(() => setSearch(e.target.value))}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => filter(() => setStatus("failed"))}
            disabled={status === "failed"}
          >
            Show failures only
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              filter(() => {
                setBatchNo("all");
                setStatus("all");
                setFrom("");
                setTo("");
                setSearch("");
              })
            }
          >
            Clear filters
          </Button>
          {batchNo !== "all" && failedInBatch > 0 ? (
            <Button size="sm" disabled={busy} onClick={() => void resendBatch()}>
              {busy ? "Queueing…" : `Resend ${failedInBatch} failed in ${batchNo}`}
            </Button>
          ) : null}
        </div>
      </FilterBar>

      <p className="mt-3 text-xs text-muted-foreground">
        {loading
          ? "Loading…"
          : !page || page.total === 0
            ? "Nothing matches these filters"
            : `Showing ${shownFrom}–${shownTo} of ${page.total}`}
      </p>

      <div className="mt-2 overflow-x-auto rounded-xl border border-border bg-card">
        {page && page.records.length === 0 && !loading ? (
          <div className="p-6">
            <EmptyState
              title="Nothing matches these filters"
              hint="Every message sent when a batch is published is listed here, with what happened to it."
            />
          </div>
        ) : (
          <table className="w-full min-w-[1040px] text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <Th>Employee</Th>
                <Th>Employee ID</Th>
                <Th>Company email</Th>
                <Th>Department</Th>
                <Th>Batch</Th>
                <Th>Sent</Th>
                <Th>Delivery status</Th>
                <Th>Ordered</Th>
              </tr>
            </thead>
            <tbody>
              {(page?.records ?? []).map((r, i) => (
                <motion.tr
                  key={r.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, delay: Math.min(i * 0.008, 0.2) }}
                  className="border-b border-border/60 last:border-0"
                >
                  <Td className="font-medium">{r.employeeName || "—"}</Td>
                  <Td>{r.employeeRef || "—"}</Td>
                  <Td>
                    {r.toAddress || <span className="text-muted-foreground">None on file</span>}
                  </Td>
                  <Td>{r.department || "—"}</Td>
                  <Td>{r.batchNo}</Td>
                  <Td>
                    {dateShort(r.sentAt ?? r.createdAt)}
                    <span className="block text-xs text-muted-foreground">
                      {timeShort(r.sentAt ?? r.createdAt)}
                    </span>
                  </Td>
                  <Td>
                    <span
                      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${EMAIL_TONE[r.status]}`}
                    >
                      {EMAIL_LABEL[r.status]}
                    </span>
                    {r.error ? (
                      <span className="mt-1 block max-w-[18rem] text-xs text-muted-foreground">
                        {r.error}
                      </span>
                    ) : null}
                  </Td>
                  <Td>{r.ordered ? "Yes" : "—"}</Td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          disabled={offset === 0 || loading}
          onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!page || offset + PAGE_SIZE >= page.total || loading}
          onClick={() => setOffset(offset + PAGE_SIZE)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-medium">{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
}
