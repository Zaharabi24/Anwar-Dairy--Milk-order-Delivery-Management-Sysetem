import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import {
  TableShell,
  Td,
  Th,
  downloadCsv,
  humanize,
  useAdminList,
} from "@/components/admin/account-ui";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { dateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { authService } from "@/services/auth-service";

export const Route = createFileRoute("/app/admin/account-audit")({
  head: () => ({
    meta: [
      { title: "Account audit — Anwar Organic" },
      {
        name: "description",
        content: "Every account event: sign-ins, approvals, resets and role changes.",
      },
    ],
  }),
  component: AccountAuditPage,
});

const EVENTS = [
  "login_success",
  "logout",
  "request_submitted",
  "request_approved",
  "request_rejected",
  "password_set",
  "password_reset_requested",
  "password_reset_completed",
  "setup_link_resent",
  "reset_link_sent",
  "account_suspended",
  "account_reactivated",
  "account_deactivated",
  "sessions_revoked",
  "role_changed",
];

const PAGE_SIZE = 50;

function AccountAuditPage() {
  const [event, setEvent] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(
    () =>
      authService.listAuthAudit({
        page,
        ...(event !== "all" ? { event } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        ...(appliedSearch ? { search: appliedSearch } : {}),
      }),
    [page, event, from, to, appliedSearch],
  );
  const { data, error, loading } = useAdminList(load);
  const events = data?.events ?? [];
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  function exportCsv() {
    downloadCsv(`account-audit-page-${page}.csv`, [
      ["When", "Event", "Actor", "Subject", "Detail", "IP"],
      ...events.map((e) => [e.createdAt, e.event, e.actor, e.subject, e.detail, e.ip]),
    ]);
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Account audit"
        description="Every account event, newest first."
        action={
          <Button
            variant="outline"
            className="h-9"
            onClick={exportCsv}
            disabled={events.length === 0}
          >
            Export CSV
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={event}
          onValueChange={(v) => {
            setEvent(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All events</SelectItem>
            {EVENTS.map((e) => (
              <SelectItem key={e} value={e}>
                {humanize(e)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          className="w-40"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setPage(1);
          }}
          aria-label="From date"
        />
        <Input
          type="date"
          className="w-40"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setPage(1);
          }}
          aria-label="To date"
        />
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setAppliedSearch(search.trim());
            setPage(1);
          }}
        >
          <Input
            className="w-64"
            placeholder="Search by employee name or ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
      </div>

      {loading && !data ? (
        <Skeleton className="mt-4 h-64 w-full rounded-xl" />
      ) : error ? (
        <div className="mt-4">
          <EmptyState title="Couldn't load the account audit" hint={error} />
        </div>
      ) : events.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No events match" hint="Try clearing the filters." />
        </div>
      ) : (
        <>
          <TableShell minWidth={1000}>
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <Th>When</Th>
                <Th>Event</Th>
                <Th>Actor</Th>
                <Th>Subject</Th>
                <Th>Detail</Th>
                <Th>IP</Th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-border/60 last:border-0">
                  <Td className="whitespace-nowrap">{dateTime(e.createdAt)}</Td>
                  <Td className="font-medium">{humanize(e.event)}</Td>
                  <Td>{e.actor ?? "—"}</Td>
                  <Td>{e.subject ?? "—"}</Td>
                  <Td className="max-w-xs break-words font-mono text-xs text-muted-foreground">
                    {e.detail === "{}" ? "—" : e.detail}
                  </Td>
                  <Td className="font-mono text-xs">{e.ip ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
          <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {data?.total ?? 0} events · page {page} of {pages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      <h2 className="mt-10 font-display text-lg font-bold">Failed sign-in attempts</h2>
      <p className="text-sm text-muted-foreground">
        Last 24 hours, grouped by Employee ID. 5 or more are flagged.
      </p>
      {(data?.failedAttempts.length ?? 0) === 0 ? (
        <div className="mt-4">
          <EmptyState title="No failed attempts in the last 24 hours" />
        </div>
      ) : (
        <TableShell minWidth={640}>
          <thead className="border-b border-border text-left text-muted-foreground">
            <tr>
              <Th>Employee ID / email</Th>
              <Th>Attempts</Th>
              <Th>Last attempt</Th>
              <Th>Last IP</Th>
            </tr>
          </thead>
          <tbody>
            {data!.failedAttempts.map((f) => (
              <tr
                key={f.identifier}
                className={cn(
                  "border-b border-border/60 last:border-0",
                  f.attempts >= 5 && "bg-destructive/10 text-destructive",
                )}
              >
                <Td className="font-medium">{f.identifier}</Td>
                <Td>{f.attempts}</Td>
                <Td>{dateTime(f.lastAttemptAt)}</Td>
                <Td className="font-mono text-xs">{f.lastIp ?? "—"}</Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}
