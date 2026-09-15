import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  TableShell,
  Td,
  Th,
  ToneBadge,
  useAdminList,
  workingDaysBetween,
} from "@/components/admin/account-ui";
import { EmptyState, PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  ALLOWED_EMAIL_DOMAIN,
  BUSINESS_UNITS,
  SIGNIN_ROLES,
  roleLabel,
} from "@/lib/auth-constants";
import type { AccountRequestRow, RequestStatus } from "@/lib/auth-types";
import { dateShort, dateTime } from "@/lib/format";
import type { Department, Site } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TestEmailButton } from "@/components/admin/TestEmailButton";
import { deliveryNotice } from "@/lib/mail-delivery";
import { authService } from "@/services/auth-service";

export const Route = createFileRoute("/app/admin/account-requests")({
  head: () => ({
    meta: [
      { title: "Account requests — Anwar Organic" },
      { name: "description", content: "Review and approve who gets access to Anwar Organic." },
    ],
  }),
  component: AccountRequestsPage,
});

const statusTone: Record<RequestStatus, "pending" | "success" | "danger" | "muted"> = {
  pending: "pending",
  approved: "success",
  rejected: "danger",
  expired: "muted",
};

const departments: Department[] = [
  "Production",
  "Finance",
  "HR",
  "Sales",
  "IT",
  "Admin",
  "Procurement",
];
const sites: Site[] = ["Head Office – Gulshan", "Savar Factory"];

const isThisMonth = (iso: string | null) => {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
};

function AccountRequestsPage() {
  const load = useCallback(() => authService.listAccountRequests(), []);
  const { data, error, loading, reload } = useAdminList(load);
  const requests = useMemo(() => data ?? [], [data]);

  const [status, setStatus] = useState<RequestStatus | "all">("pending");
  const [unit, setUnit] = useState("all");
  const [requestedRole, setRequestedRole] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<AccountRequestRow | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return requests
      .filter((r) => status === "all" || r.status === status)
      .filter((r) => unit === "all" || r.businessUnitCode === unit)
      .filter((r) => requestedRole === "all" || r.requestedRole === requestedRole)
      .filter(
        (r) =>
          !q ||
          r.fullName.toLowerCase().includes(q) ||
          r.employeeId.toLowerCase().includes(q) ||
          r.reference.toLowerCase().includes(q) ||
          r.companyMail.toLowerCase().includes(q),
      );
  }, [requests, status, unit, requestedRole, query]);

  const reviewed = requests.filter((r) => r.reviewedAt);
  const avgHours = reviewed.length
    ? reviewed.reduce(
        (s, r) => s + (new Date(r.reviewedAt!).getTime() - new Date(r.submittedAt).getTime()),
        0,
      ) /
      reviewed.length /
      36e5
    : 0;

  const selectedRows = requests.filter((r) => selected.has(r.id));
  const canBulkApprove =
    selectedRows.length > 0 &&
    selectedRows.every((r) => r.status === "pending" && r.requestedRole === "employee");

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  async function bulkApprove() {
    setBulkBusy(true);
    let approved = 0;
    const failures: string[] = [];
    const undelivered: string[] = [];
    for (const r of selectedRows) {
      const result = await authService.reviewAccountRequest({
        request_id: r.id,
        decision: "approve",
      });
      if (!result.ok) failures.push(`${r.reference}: ${result.message}`);
      else {
        approved++;
        if (result.data?.delivery !== "sent") undelivered.push(r.companyMail);
      }
    }
    setBulkBusy(false);
    setSelected(new Set());
    if (approved) {
      const plural = approved === 1 ? "" : "s";
      if (undelivered.length === 0) {
        toast.success(`${approved} request${plural} approved — setup emails sent.`);
      } else {
        toast.warning(
          `${approved} request${plural} approved, but ${undelivered.length} setup email(s) weren't delivered.`,
          {
            description: `Not delivered to ${undelivered.join(", ")}. Check email settings, then use “Resend password setup link” in Accounts.`,
            duration: 12_000,
          },
        );
      }
    }
    failures.forEach((f) => toast.error(f));
    await reload();
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Account requests"
        description="Review and approve who gets access to Anwar Organic."
        action={
          <div className="flex flex-wrap gap-2">
            <TestEmailButton />
            <Button disabled={!canBulkApprove || bulkBusy} onClick={() => void bulkApprove()}>
              Bulk approve{selectedRows.length ? ` (${selectedRows.length})` : ""}
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Pending review"
          value={requests.filter((r) => r.status === "pending").length}
          emphasis
        />
        <StatCard
          label="Approved this month"
          value={
            requests.filter((r) => r.status === "approved" && isThisMonth(r.reviewedAt)).length
          }
        />
        <StatCard
          label="Rejected this month"
          value={
            requests.filter((r) => r.status === "rejected" && isThisMonth(r.reviewedAt)).length
          }
        />
        <StatCard label="Average review time" value={avgHours} format={(v) => `${v} h`} />
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Select value={status} onValueChange={(v) => setStatus(v as RequestStatus | "all")}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <Select value={unit} onValueChange={setUnit}>
          <SelectTrigger className="w-60">
            <SelectValue placeholder="Business unit" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All business units</SelectItem>
            {BUSINESS_UNITS.map((b) => (
              <SelectItem key={b.code} value={b.code}>
                {b.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={requestedRole} onValueChange={setRequestedRole}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Requested role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All requested roles</SelectItem>
            {SIGNIN_ROLES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="max-w-xs"
          placeholder="Search name, ID, email or reference"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading && !data ? (
        <Skeleton className="mt-4 h-64 w-full rounded-xl" />
      ) : error ? (
        <div className="mt-4">
          <EmptyState title="Couldn't load account requests" hint={error} />
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="No requests match"
            hint="New sign-up requests appear here for review."
          />
        </div>
      ) : (
        <TableShell minWidth={1180}>
          <thead className="border-b border-border text-left text-muted-foreground">
            <tr>
              <Th className="w-10">
                <Checkbox
                  aria-label="Select all"
                  checked={rows.length > 0 && rows.every((r) => selected.has(r.id))}
                  onCheckedChange={(v) =>
                    setSelected(v ? new Set(rows.map((r) => r.id)) : new Set())
                  }
                />
              </Th>
              <Th>Reference</Th>
              <Th>Submitted</Th>
              <Th>Full Name</Th>
              <Th>Employee ID</Th>
              <Th>Company Mail</Th>
              <Th>Business Unit</Th>
              <Th>Requested Role</Th>
              <Th>Age</Th>
              <Th>Status</Th>
              <Th> </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const age = workingDaysBetween(
                r.submittedAt,
                r.reviewedAt ? new Date(r.reviewedAt) : new Date(),
              );
              const pending = r.status === "pending";
              return (
                <tr
                  key={r.id}
                  onClick={() => setOpen(r)}
                  className={cn(
                    "cursor-pointer border-b border-border/60 last:border-0 hover:bg-secondary/50",
                    pending && age >= 7 && "bg-destructive/10",
                    pending && age >= 3 && age < 7 && "bg-accent/15",
                  )}
                >
                  <Td>
                    <span onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        aria-label={`Select ${r.reference}`}
                        checked={selected.has(r.id)}
                        onCheckedChange={(v) => toggle(r.id, !!v)}
                      />
                    </span>
                  </Td>
                  <Td className="font-mono font-medium">{r.reference}</Td>
                  <Td>{dateShort(r.submittedAt)}</Td>
                  <Td className="font-medium">{r.fullName}</Td>
                  <Td>{r.employeeId}</Td>
                  <Td>{r.companyMail}</Td>
                  <Td>{r.businessUnitName}</Td>
                  <Td>{roleLabel(r.requestedRole)}</Td>
                  <Td>
                    {age} {age === 1 ? "day" : "days"}
                  </Td>
                  <Td>
                    <ToneBadge tone={statusTone[r.status]}>
                      {r.status[0]!.toUpperCase() + r.status.slice(1)}
                    </ToneBadge>
                  </Td>
                  <Td>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpen(r);
                      }}
                    >
                      {pending ? "Review" : "View"}
                    </Button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      )}

      <RequestSheet
        request={open}
        onClose={() => setOpen(null)}
        onDecided={async () => {
          setOpen(null);
          await reload();
        }}
      />
    </div>
  );
}

function RequestSheet({
  request,
  onClose,
  onDecided,
}: {
  request: AccountRequestRow | null;
  onClose: () => void;
  onDecided: () => Promise<void>;
}) {
  const [department, setDepartment] = useState<Department>("Admin");
  const [site, setSite] = useState<Site>("Head Office – Gulshan");
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"approve" | "reject" | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);

  // Reset the form each time a different request opens.
  if (request && request.id !== lastId) {
    setLastId(request.id);
    setDepartment("Admin");
    setSite("Head Office – Gulshan");
    setNote("");
    setNoteError(null);
  }

  async function decide(decision: "approve" | "reject") {
    if (!request) return;
    setBusy(true);
    const result = await authService.reviewAccountRequest({
      request_id: request.id,
      decision,
      ...(decision === "approve" ? { department, site } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    setBusy(false);
    setConfirming(null);
    if (!result.ok) {
      if (result.errors?.["note"]) setNoteError(result.errors["note"]);
      toast.error(result.message ?? "Couldn't save the decision.");
      return;
    }
    // Report what actually happened to the email, not just that the decision was saved.
    const { delivery, emailedTo, mailError } = result.data ?? {};
    const notice = deliveryNotice(
      delivery,
      decision === "approve" ? "The password setup email" : "The decision email",
      emailedTo ?? request.companyMail,
      mailError,
    );
    const decided =
      decision === "approve"
        ? `${request.fullName} approved as Employee.`
        : `${request.reference} rejected.`;
    if (notice.tone === "success") toast.success(`${decided} ${notice.text}`);
    else
      (notice.tone === "warning" ? toast.warning : toast.error)(decided, {
        description:
          decision === "approve"
            ? `${notice.text} Once email works, use “Resend password setup link” in Accounts.`
            : notice.text,
        duration: 12_000,
      });
    await onDecided();
  }

  const pending = request?.status === "pending";

  return (
    <>
      <Sheet open={!!request} onOpenChange={(v) => !v && onClose()}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {request ? (
            <>
              <SheetHeader>
                <SheetTitle>{request.fullName}</SheetTitle>
                <SheetDescription>
                  {request.reference} · {request.status[0]!.toUpperCase() + request.status.slice(1)}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6 text-sm">
                <Section title="Request">
                  <Row label="Reference" value={request.reference} />
                  <Row label="Submitted" value={dateTime(request.submittedAt)} />
                  <Row label="Requested role" value={roleLabel(request.requestedRole)} />
                  <Row label="Business Unit" value={request.businessUnitName} />
                  <Row label="Office" value={request.officeName} />
                  {request.reviewedAt ? (
                    <Row
                      label="Decision"
                      value={`${request.status} ${dateTime(request.reviewedAt)} by ${request.reviewedBy}${
                        request.grantedRole ? ` as ${roleLabel(request.grantedRole)}` : ""
                      }${request.decisionNote ? ` — ${request.decisionNote}` : ""}`}
                    />
                  ) : null}
                </Section>

                <Section title="Identity">
                  <Row label="Full name" value={request.fullName} />
                  <Row label="Employee ID" value={request.employeeId} />
                  <Row label="Company mail" value={request.companyMail} />
                  {/* The date itself is never shown on screen. */}
                  <Row
                    label="Date of birth"
                    value={request.hasDateOfBirth ? "On file ✓" : "Missing"}
                  />
                </Section>

                <Section title="Checks">
                  <Check ok icon="ok" text={`Company domain verified (@${ALLOWED_EMAIL_DOMAIN})`} />
                  <Check
                    ok={!request.existingAccount}
                    icon={request.existingAccount ? "warn" : "ok"}
                    text={
                      request.existingAccount
                        ? "An account already exists for this Employee ID or email"
                        : "No existing account for this Employee ID"
                    }
                  />
                  <Check
                    ok
                    icon="info"
                    text={`Submitted from ${request.submittedIp ?? "unknown IP"}`}
                  />
                </Section>

                {pending ? (
                  <Section title="Decision">
                    <p className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
                      Account requests grant the <strong>Employee</strong> role. Staff roles are
                      given by invitation from a Super Admin.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Department</Label>
                        <Select
                          value={department}
                          onValueChange={(v) => setDepartment(v as Department)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {departments.map((d) => (
                              <SelectItem key={d} value={d}>
                                {d}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Site</Label>
                        <Select value={site} onValueChange={(v) => setSite(v as Site)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {sites.map((s) => (
                              <SelectItem key={s} value={s}>
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Department and site are used for the employee directory when this person
                      isn&apos;t on it yet.
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="decision-note">Note</Label>
                      <Textarea
                        id="decision-note"
                        rows={3}
                        value={note}
                        onChange={(e) => {
                          setNote(e.target.value);
                          setNoteError(null);
                        }}
                        placeholder="Optional when approving, required when rejecting"
                        className={noteError ? "border-destructive" : ""}
                      />
                      {noteError ? <p className="text-xs text-destructive">{noteError}</p> : null}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button onClick={() => setConfirming("approve")} disabled={busy}>
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        className="border-destructive text-destructive hover:bg-destructive/10"
                        disabled={busy}
                        onClick={() => {
                          if (note.trim().length < 3) {
                            setNoteError("A reason is required to reject.");
                            return;
                          }
                          setConfirming("reject");
                        }}
                      >
                        Reject
                      </Button>
                      <Button variant="ghost" onClick={onClose}>
                        Close
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Approving sends the applicant an email with a link to set their password.
                    </p>
                  </Section>
                ) : null}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!confirming} onOpenChange={(v) => !v && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming === "approve"
                ? `Approve ${request?.fullName} as Employee?`
                : `Reject ${request?.fullName}'s request for ${roleLabel(request?.requestedRole ?? "employee")}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming === "approve"
                ? `An account is created and a password setup link is emailed to ${request?.companyMail}.`
                : `${request?.companyMail} will be told the request was not approved, with your note.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className={
                confirming === "reject"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : ""
              }
              onClick={(e) => {
                e.preventDefault();
                if (confirming) void decide(confirming);
              }}
            >
              {confirming === "approve" ? "Approve" : "Reject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="font-display text-base font-bold">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium break-words">{value}</span>
    </div>
  );
}

function Check({ ok, icon, text }: { ok: boolean; icon: "ok" | "warn" | "info"; text: string }) {
  const Icon = icon === "ok" ? CheckCircle2 : icon === "warn" ? TriangleAlert : Info;
  return (
    <p className="flex items-start gap-2">
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          icon === "info" ? "text-info" : ok ? "text-primary" : "text-destructive",
        )}
      />
      <span>{text}</span>
    </p>
  );
}
