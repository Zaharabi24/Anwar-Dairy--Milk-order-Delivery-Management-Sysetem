import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FilterBar } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { listEmailRecordsFn, listPublishedBatchNumbersFn } from "@/functions/records.functions";
import { dateShort, timeShort } from "@/lib/format";
import { EMPTY_EMAIL_QUERY, type EmailRecordQuery } from "@/lib/records.schemas";
import type { EmailRecordRow, EmailStatus } from "@/lib/records-types";

export const Route = createFileRoute("/app/admin/email-records")({
  head: () => ({
    meta: [
      { title: "Email records — Anwar Organic" },
      {
        name: "description",
        content:
          "Day by day, which batch emails went out and to which employees, with their directory details.",
      },
      { property: "og:title", content: "Email records — Anwar Organic" },
      {
        property: "og:description",
        content: "Track and verify the automated batch email history.",
      },
    ],
  }),
  loader: async () => ({
    page: await listEmailRecordsFn({ data: EMPTY_EMAIL_QUERY }),
    batches: await listPublishedBatchNumbersFn(),
  }),
  component: EmailRecords,
});

const STATUS_LABEL: Record<EmailStatus, string> = {
  queued: "Queued",
  sending: "Sending",
  sent: "Sent",
  captured: "Captured locally",
  failed: "Failed",
  logged: "Logged only",
  skipped: "No address",
};

const STATUS_TONE: Record<EmailStatus, string> = {
  queued: "bg-secondary text-muted-foreground",
  sending: "bg-secondary text-muted-foreground",
  sent: "bg-primary/10 text-primary-deep",
  captured: "bg-accent/15 text-accent-foreground",
  failed: "bg-destructive/10 text-destructive",
  logged: "bg-secondary text-muted-foreground",
  skipped: "bg-secondary text-muted-foreground",
};

/** Today in Dhaka, as a yyyy-mm-dd the date inputs and the server both read the same way. */
function dhakaToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
}

function daysAgo(days: number): string {
  const d = new Date(Date.now() - days * 86_400_000);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
}

const PAGE_SIZE = 100;

function EmailRecords() {
  const initial = Route.useLoaderData();
  const [page, setPage] = useState(initial.page);
  const [loading, setLoading] = useState(false);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [batchNo, setBatchNo] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);

  const query = useMemo<EmailRecordQuery>(
    () => ({
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
      setPage(await listEmailRecordsFn({ data: q }));
    } catch {
      toast.error("Couldn't load the email records. Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Typing in the search box shouldn't fire a query per keystroke.
  useEffect(() => {
    const id = setTimeout(() => void load(query), 250);
    return () => clearTimeout(id);
  }, [query, load]);

  // Any change to the filters starts again at the first page, or page three of the old filter
  // would be shown as page three of the new one.
  function filter(set: () => void) {
    setOffset(0);
    set();
  }

  const shownFrom = page.total === 0 ? 0 : offset + 1;
  const shownTo = Math.min(offset + page.records.length, page.total);
  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Email records"
        description="Which batch emails went out, on what day, and to whom — with the directory details each one carried."
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Emails Sent Out" value={page.total} />
        <StatCard label="Total Sent" value={page.sent} emphasis />
        <StatCard label="Total Failed" value={page.failed} />
        <StatCard label="Booked from Email" value={page.booked} />
      </div>

      <FilterBar columns={5} className="mt-6">
        <Field label="From date">
          <Input type="date" value={from} onChange={(e) => filter(() => setFrom(e.target.value))} />
        </Field>
        <Field label="To date">
          <Input type="date" value={to} onChange={(e) => filter(() => setTo(e.target.value))} />
        </Field>
        <Field label="Batch">
          <Select value={batchNo} onValueChange={(v) => filter(() => setBatchNo(v))}>
            <SelectTrigger>
              <SelectValue placeholder="Batch" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All batches</SelectItem>
              {initial.batches.map((b) => (
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
              {(Object.keys(STATUS_LABEL) as EmailStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            onClick={() =>
              filter(() => {
                setFrom(dhakaToday());
                setTo(dhakaToday());
              })
            }
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              filter(() => {
                setFrom(daysAgo(6));
                setTo(dhakaToday());
              })
            }
          >
            Last 7 days
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              filter(() => {
                setFrom(daysAgo(29));
                setTo(dhakaToday());
              })
            }
          >
            Last 30 days
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              filter(() => {
                setFrom("");
                setTo("");
                setBatchNo("all");
                setStatus("all");
                setSearch("");
              })
            }
          >
            Clear filters
          </Button>
        </div>
      </FilterBar>

      <p className="mt-3 text-xs text-muted-foreground">
        {loading
          ? "Loading…"
          : page.total === 0
            ? "No emails match"
            : `Showing ${shownFrom}–${shownTo} of ${page.total}`}
      </p>

      <div className="mt-2 overflow-x-auto rounded-xl border border-border bg-card">
        {page.records.length === 0 && !loading ? (
          <div className="p-6">
            <EmptyState
              title="No emails match"
              hint="Publishing a batch emails everyone active in the Employee Database, and each message is recorded here."
            />
          </div>
        ) : (
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <Th>Employee</Th>
                <Th>Employee ID</Th>
                <Th>Company email</Th>
                <Th>Department</Th>
                <Th>Designation</Th>
                <Th>Phone</Th>
                <Th>Location</Th>
                <Th>Batch</Th>
                <Th>Sent</Th>
                <Th>Status</Th>
                <Th>Ordered</Th>
              </tr>
            </thead>
            <tbody>
              {page.records.map((r, i) => (
                <Row key={r.id} record={r} index={i} />
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
          disabled={offset + PAGE_SIZE >= page.total || loading}
          onClick={() => setOffset(offset + PAGE_SIZE)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function Row({ record: r, index }: { record: EmailRecordRow; index: number }) {
  const when = r.sentAt ?? r.createdAt;
  return (
    <motion.tr
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: Math.min(index * 0.008, 0.2) }}
      className="border-b border-border/60 last:border-0"
    >
      <Td className="font-medium">{r.employeeName || "—"}</Td>
      <Td>{r.employeeRef || "—"}</Td>
      <Td>{r.toAddress || <span className="text-muted-foreground">None on file</span>}</Td>
      <Td>{r.department || "—"}</Td>
      <Td>{r.designation || "—"}</Td>
      <Td>{r.phone || "—"}</Td>
      <Td>{r.location || "—"}</Td>
      <Td>
        {r.batchNo}
        <span className="block text-xs text-muted-foreground">{r.collectionPoints || "—"}</span>
      </Td>
      <Td>
        {dateShort(when)}
        <span className="block text-xs text-muted-foreground">{timeShort(when)}</span>
      </Td>
      <Td>
        <span
          className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_TONE[r.status]}`}
        >
          {STATUS_LABEL[r.status]}
        </span>
        {r.error ? (
          <span className="mt-1 block max-w-[16rem] text-xs text-muted-foreground">{r.error}</span>
        ) : null}
      </Td>
      <Td>{r.ordered ? "Yes" : "—"}</Td>
    </motion.tr>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-medium">{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
}
