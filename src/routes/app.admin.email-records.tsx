import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Field, FilterBar } from "@/components/ui/field";
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
import {
  listEmailRecordsFn,
  listFailedEmailsFn,
  listPublishedBatchNumbersFn,
  resendEmailsFn,
} from "@/functions/records.functions";
import { dateShort, timeShort } from "@/lib/format";
import { EMPTY_EMAIL_QUERY, type EmailRecordQuery } from "@/lib/records.schemas";
import type { EmailRecordPage, EmailRecordRow, EmailStatus } from "@/lib/records-types";

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
    failures: await listFailedEmailsFn({ data: FAILURE_QUERY }),
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

/** Every outstanding failure, in one page: they are chosen from, so they all have to be there. */
const FAILURE_QUERY: EmailRecordQuery = { ...EMPTY_EMAIL_QUERY, status: "failed", limit: 500 };

function EmailRecords() {
  const initial = Route.useLoaderData();
  const [failures, setFailures] = useState(initial.failures);

  const reloadFailures = useCallback(async () => {
    try {
      setFailures(await listFailedEmailsFn({ data: FAILURE_QUERY }));
    } catch {
      toast.error("Couldn't refresh the failed emails.");
    }
  }, []);

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Email records"
        description="Which batch emails went out, on what day, and to whom — with the directory details each one carried."
      />

      {/* Two tabs rather than one long screen: reading the history and clearing the failures are
          different jobs. The history is looked at; the failures are acted on, and mixing a list you
          select from into a list you page through is what made the options hard to find. */}
      <Tabs defaultValue="records" className="mt-2">
        <TabsList>
          <TabsTrigger value="records">Sent records</TabsTrigger>
          <TabsTrigger value="resend">
            Resend
            {failures.total > 0 ? (
              <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                {failures.total}
              </span>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="records" className="mt-6">
          <Records initial={initial.page} batches={initial.batches} />
        </TabsContent>
        <TabsContent value="resend" className="mt-6">
          <Resend page={failures} onChanged={reloadFailures} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sent records

function Records({ initial, batches }: { initial: EmailRecordPage; batches: string[] }) {
  const [page, setPage] = useState(initial);
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

  const dirty = Boolean(from || to || search) || batchNo !== "all" || status !== "all";
  const shownFrom = page.total === 0 ? 0 : offset + 1;
  const shownTo = Math.min(offset + page.records.length, page.total);

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Emails Sent Out" value={page.total} />
        <StatCard label="Total Sent" value={page.sent} emphasis />
        <StatCard label="Total Failed" value={page.failed} />
        <StatCard label="Booked from Email" value={page.booked} />
      </div>

      <FilterBar columns={5} className="mt-6">
        <Field label="From date" htmlFor="rec-from">
          <Input
            id="rec-from"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => filter(() => setFrom(e.target.value))}
          />
        </Field>
        <Field label="To date" htmlFor="rec-to">
          <Input
            id="rec-to"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => filter(() => setTo(e.target.value))}
          />
        </Field>
        <Field label="Batch" htmlFor="rec-batch">
          <Select value={batchNo} onValueChange={(v) => filter(() => setBatchNo(v))}>
            <SelectTrigger id="rec-batch">
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
        <Field label="Delivery status" htmlFor="rec-status">
          <Select value={status} onValueChange={(v) => filter(() => setStatus(v))}>
            <SelectTrigger id="rec-status">
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
        <Field label="Search" htmlFor="rec-search">
          <Input
            id="rec-search"
            placeholder="Name, ID, email, department"
            value={search}
            onChange={(e) => filter(() => setSearch(e.target.value))}
          />
        </Field>

        {/* The shortcuts and the result count on one line under the filters, rather than five
            loose buttons wrapping into the grid and sitting where a filter should be. */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 sm:col-span-2 lg:col-span-5">
          <span className="mr-1 text-xs font-medium text-muted-foreground">Quick range</span>
          {(
            [
              ["Today", 0],
              ["Last 7 days", 6],
              ["Last 30 days", 29],
            ] as const
          ).map(([label, back]) => (
            <Button
              key={label}
              variant="outline"
              size="sm"
              onClick={() =>
                filter(() => {
                  setFrom(back === 0 ? dhakaToday() : daysAgo(back));
                  setTo(dhakaToday());
                })
              }
            >
              {label}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            disabled={!dirty}
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
          <span className="ml-auto text-xs text-muted-foreground">
            {loading
              ? "Loading…"
              : page.total === 0
                ? "No emails match"
                : `Showing ${shownFrom}–${shownTo} of ${page.total}`}
          </span>
        </div>
      </FilterBar>

      <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
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

// ---------------------------------------------------------------------------
// Resend

/**
 * The emails that didn't arrive, and the one action that can be taken about them.
 *
 * Everything outstanding is ticked when the tab opens, because sending all of it is what is
 * normally wanted: the list is the work, not a menu. Untick anybody who should be left out — a
 * departed employee, an address that is plainly wrong — and send the rest.
 *
 * A resend is a fresh attempt, recorded beside the failure rather than over it. Whatever arrives
 * shows up in Sent records as a new sent row; whatever fails again comes back to this list, so the
 * tab always holds exactly what is still outstanding and nothing that has been dealt with.
 */
function Resend({ page, onChanged }: { page: EmailRecordPage; onChanged: () => Promise<void> }) {
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  // Held as who is *left out*, not who is in: the list refreshes after a send, and a set of ids to
  // include would have to be reseeded every time or it would quietly stop covering new failures.
  const rows = page.records;
  const chosen = useMemo(() => rows.filter((r) => !skip.has(r.id)), [rows, skip]);

  const matching = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.employeeName.toLowerCase().includes(q) ||
        r.employeeRef.toLowerCase().includes(q) ||
        r.toAddress.toLowerCase().includes(q) ||
        r.batchNo.toLowerCase().includes(q) ||
        r.department.toLowerCase().includes(q),
    );
  }, [rows, query]);

  async function send() {
    if (chosen.length === 0) return;
    setBusy(true);
    try {
      const result = await resendEmailsFn({ data: { ids: chosen.map((r) => r.id) } });
      toast.success(
        result.queued > 0
          ? `${result.queued} email${result.queued === 1 ? "" : "s"} back on the queue — they are sent one at a time, so give it a few minutes.`
          : "Those were already dealt with — nothing left to resend.",
      );
      setSkip(new Set());
      await onChanged();
    } catch {
      toast.error("Couldn't queue the resend. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Awaiting resend" value={rows.length} emphasis />
        <StatCard label="Selected to send" value={chosen.length} />
        <StatCard label="Left out" value={rows.length - chosen.length} />
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-border bg-card p-6">
          <EmptyState
            title="Nothing failed"
            hint="Emails the mail server refused for good appear here, already selected, ready to send again."
          />
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
            <Input
              className="w-full sm:w-72"
              placeholder="Search by email address, Employee ID or name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={matching.every((r) => !skip.has(r.id))}
              onClick={() =>
                setSkip((prev) => {
                  const next = new Set(prev);
                  for (const r of matching) next.delete(r.id);
                  return next;
                })
              }
            >
              Select {query.trim() ? "matching" : "all"} ({matching.length})
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={matching.every((r) => skip.has(r.id))}
              onClick={() =>
                setSkip((prev) => {
                  const next = new Set(prev);
                  for (const r of matching) next.add(r.id);
                  return next;
                })
              }
            >
              Deselect {query.trim() ? "matching" : "all"} (
              {matching.filter((r) => !skip.has(r.id)).length})
            </Button>
            <Button
              className="ml-auto"
              disabled={busy || chosen.length === 0}
              onClick={() => void send()}
            >
              {busy
                ? "Queueing…"
                : `Resend ${chosen.length} selected email${chosen.length === 1 ? "" : "s"}`}
            </Button>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[1080px] text-sm">
              <thead className="border-b border-border text-left text-muted-foreground">
                <tr>
                  <Th>
                    <Checkbox
                      aria-label="Select every failed email"
                      checked={matching.length > 0 && matching.every((r) => !skip.has(r.id))}
                      onCheckedChange={(on) =>
                        setSkip((prev) => {
                          const next = new Set(prev);
                          for (const r of matching) {
                            if (on) next.delete(r.id);
                            else next.add(r.id);
                          }
                          return next;
                        })
                      }
                    />
                  </Th>
                  <Th>Employee</Th>
                  <Th>Employee ID</Th>
                  <Th>Company email</Th>
                  <Th>Department</Th>
                  <Th>Batch</Th>
                  <Th>Last tried</Th>
                  <Th>Attempts</Th>
                  <Th>Why it failed</Th>
                </tr>
              </thead>
              <tbody>
                {matching.map((r) => {
                  const when = r.sentAt ?? r.createdAt;
                  const included = !skip.has(r.id);
                  return (
                    <tr
                      key={r.id}
                      className={`border-b border-border/60 last:border-0 ${included ? "" : "opacity-50"}`}
                    >
                      <Td>
                        <Checkbox
                          aria-label={`Resend to ${r.employeeName || r.toAddress}`}
                          checked={included}
                          onCheckedChange={() =>
                            setSkip((prev) => {
                              const next = new Set(prev);
                              if (next.has(r.id)) next.delete(r.id);
                              else next.add(r.id);
                              return next;
                            })
                          }
                        />
                      </Td>
                      <Td className="font-medium">{r.employeeName || "—"}</Td>
                      <Td>{r.employeeRef || "—"}</Td>
                      <Td>
                        {r.toAddress || <span className="text-muted-foreground">None on file</span>}
                      </Td>
                      <Td>{r.department || "—"}</Td>
                      <Td>{r.batchNo}</Td>
                      <Td>
                        {dateShort(when)}
                        <span className="block text-xs text-muted-foreground">
                          {timeShort(when)}
                        </span>
                      </Td>
                      <Td>{r.attempts}</Td>
                      <Td className="max-w-[20rem] text-xs text-muted-foreground">
                        {r.error ?? "The mail server refused the message."}
                      </Td>
                    </tr>
                  );
                })}
                {matching.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                      Nobody matches that search.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Each resend is recorded as a new attempt: the failure stays in Sent records, and
            whatever arrives is added beside it as a new sent record. Anything that fails again
            comes back to this tab.
          </p>
        </>
      )}
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
        {/* A failure that was tried again says so, so the history reads as a sequence rather than
            as two rows that appear to contradict each other. */}
        {r.resent ? (
          <span className="mt-1 block text-xs text-muted-foreground">
            Resent — see later record
          </span>
        ) : null}
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
