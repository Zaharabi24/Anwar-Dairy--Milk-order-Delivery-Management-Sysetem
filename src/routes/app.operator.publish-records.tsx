import { createFileRoute, useRouter } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
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
import { EmptyState, PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { listPublishRecordsFn, resumePublicationMailFn } from "@/functions/records.functions";
import { dateShort, taka, timeShort } from "@/lib/format";
import type { PublishRecord, PublishStatus } from "@/lib/records-types";

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

/** Colours come from theme tokens, so the badge follows the palette rather than fixing its own. */
const STATUS_TONE: Record<PublishStatus, string> = {
  sending: "bg-secondary text-muted-foreground",
  sent: "bg-primary/10 text-primary-deep",
  partial: "bg-accent/15 text-accent-foreground",
  failed: "bg-destructive/10 text-destructive",
  no_recipients: "bg-secondary text-muted-foreground",
};

function StatusBadge({ status }: { status: PublishStatus }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_TONE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function PublishRecords() {
  const records = Route.useLoaderData();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState<string | null>(null);
  const [resuming, setResuming] = useState<string | null>(null);

  // Opening this page already resumed anything unfinished. This is for the operator who wants to
  // push the rest out now rather than wait, and it can be pressed again until nothing is left.
  async function resume(id: string) {
    setResuming(id);
    try {
      const result = await resumePublicationMailFn({ data: { publicationId: id } });
      toast.success(
        result.remaining > 0
          ? `${result.sent} more sent, ${result.remaining} still to go.`
          : `${result.sent} more sent. Nothing left to send.`,
      );
      await router.invalidate();
    } catch {
      toast.error("Couldn't send the rest just now. Try again.");
    } finally {
      setResuming(null);
    }
  }

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

  const totalRecipients = records.reduce((n, r) => n + r.recipients, 0);
  const totalSent = records.reduce((n, r) => n + r.sentCount, 0);
  const totalFailed = records.reduce((n, r) => n + r.failedCount, 0);
  const totalPending = records.reduce((n, r) => n + r.pendingCount, 0);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Publish records"
        description="Every batch published from here, who was emailed, and what was booked afterwards."
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Batches published" value={records.length} />
        <StatCard label="Emails addressed" value={totalRecipients} />
        <StatCard label="Delivered" value={totalSent} emphasis />
        <StatCard
          label={totalPending ? "Still to send" : "Failed"}
          value={totalPending || totalFailed}
          {...(totalPending ? { hint: "Resumes on its own each time this page is opened" } : {})}
        />
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Input
          className="max-w-xs"
          placeholder="Search batch, publisher or collection point"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44">
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
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title={records.length ? "No publishes match" : "Nothing published yet"}
              hint={
                records.length
                  ? "Try clearing the filters."
                  : "Publishing a batch emails everyone active in the Employee Database, and records it here."
              }
            />
          </div>
        ) : (
          <table className="w-full min-w-[1040px] text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <Th>Batch</Th>
                <Th>Published</Th>
                <Th>Bookings close</Th>
                <Th>Collection point</Th>
                <Th>Recipients</Th>
                <Th>Email status</Th>
                <Th>Booked</Th>
                <Th> </Th>
                <Th> </Th>
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
                  resuming={resuming === r.id}
                  onResume={() => void resume(r.id)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function PublishRow({
  record: r,
  index,
  open,
  onToggle,
  resuming,
  onResume,
}: {
  record: PublishRecord;
  index: number;
  open: boolean;
  onToggle: () => void;
  resuming: boolean;
  onResume: () => void;
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
          <StatusBadge status={r.status} />
          <span className="mt-1 block text-xs text-muted-foreground">
            {r.sentCount} sent
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
          <button
            type="button"
            onClick={onToggle}
            className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-secondary"
          >
            {open ? "Hide" : "Details"}
          </button>
        </Td>
        <Td>
          {r.pendingCount ? (
            <Button variant="outline" size="sm" disabled={resuming} onClick={onResume}>
              {resuming ? "Sending…" : "Send the rest"}
            </Button>
          ) : null}
        </Td>
      </motion.tr>
      {open ? (
        <tr className="border-b border-border/60 bg-secondary/40 last:border-0">
          <td colSpan={9} className="px-4 py-4">
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
                label="Addressed"
                value={`${r.recipients} in the directory, ${r.sentCount} delivered`}
              />
              {r.pendingCount ? (
                <Detail
                  label="Still to send"
                  value={`${r.pendingCount} — the send was interrupted and picks up again whenever this page is opened`}
                />
              ) : null}
            </dl>
          </td>
        </tr>
      ) : null}
    </>
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
