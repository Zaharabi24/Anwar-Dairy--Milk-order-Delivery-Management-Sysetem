import { createFileRoute } from "@tanstack/react-router";
import { Loader2, MoreHorizontal } from "lucide-react";
import { useCallback, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { TableShell, Td, Th, ToneBadge, useAdminList } from "@/components/admin/account-ui";
import { TestEmailButton } from "@/components/admin/TestEmailButton";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  EMAIL_PLACEHOLDER,
  INVITABLE_ROLES,
  isStaffRole,
  roleLabel,
  type InvitableRole,
  type RoleValue,
} from "@/lib/auth-constants";
import type {
  AccountStatus,
  InvitationRow,
  InvitationStatus,
  MailDelivery,
  StaffMemberRow,
} from "@/lib/auth-types";
import { validateCompanyEmail, validateEmployeeId } from "@/lib/auth-validation";
import { dateTime } from "@/lib/format";
import { deliveryNotice } from "@/lib/mail-delivery";
import { cn } from "@/lib/utils";
import { authService } from "@/services/auth-service";

export const Route = createFileRoute("/app/admin/team")({
  head: () => ({
    meta: [
      { title: "Team & invitations — Anwar Organic" },
      { name: "description", content: "Invite staff and manage who operates Anwar Organic." },
    ],
  }),
  component: TeamPage,
});

const inviteTone: Record<InvitationStatus, "pending" | "success" | "danger" | "muted"> = {
  pending: "pending",
  accepted: "success",
  revoked: "danger",
  expired: "muted",
};
const accountTone: Record<AccountStatus, "success" | "pending" | "danger" | "muted"> = {
  active: "success",
  awaiting_password: "pending",
  suspended: "danger",
  deactivated: "muted",
};
const capital = (s: string) => s[0]!.toUpperCase() + s.slice(1).replace(/_/g, " ");

const STAFF_ROLE_CARDS: { role: RoleValue; label: string }[] = [
  { role: "system_admin", label: "System Admins" },
  { role: "head_office_coordinator", label: "Head Office Coordinators" },
  { role: "factory_operator", label: "Factory Operators" },
];

const MEMBER_ROLE_FILTERS: { value: RoleValue | "all"; label: string }[] = [
  { value: "all", label: "All staff roles" },
  { value: "super_admin", label: "Super Admin" },
  { value: "system_admin", label: "System Admin" },
  { value: "head_office_coordinator", label: "Head Office Coordinator" },
  { value: "factory_operator", label: "Factory Operator" },
];

/** Says exactly what happened to the invitation email; never claims delivery that didn't happen. */
function deliveryToast(delivery: MailDelivery | undefined, email: string, error?: string) {
  const notice = deliveryNotice(delivery, "The invitation", email, error);
  if (notice.tone === "success") {
    toast.success(notice.text);
    return;
  }
  const show = notice.tone === "warning" ? toast.warning : toast.error;
  show(notice.text, {
    description: "The invitation is saved. Use “Copy invite link” to share it another way.",
    duration: 12_000,
  });
}

function TeamPage() {
  const load = useCallback(() => authService.listTeam(), []);
  const { data, error, loading, reload } = useAdminList(load);
  const invitations = useMemo(() => data?.invitations ?? [], [data]);
  const members = useMemo(() => data?.members ?? [], [data]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [tab, setTab] = useState("members");
  const [roleFilter, setRoleFilter] = useState<RoleValue | "all">("all");

  const monthAgo = Date.now() - 30 * 864e5;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Team & invitations"
        description="Invite factory operators, head office coordinators and System Admins by email."
        action={
          <div className="flex flex-wrap gap-2">
            <TestEmailButton />
            <Button onClick={() => setInviteOpen(true)}>Invite member</Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Staff members"
          value={members.filter((m) => m.status === "active").length}
          emphasis
        />
        <StatCard
          label="Pending invitations"
          value={invitations.filter((i) => i.status === "pending").length}
        />
        <StatCard
          label="Accepted (30 days)"
          value={
            invitations.filter((i) => i.acceptedAt && new Date(i.acceptedAt).getTime() > monthAgo)
              .length
          }
        />
        <StatCard
          label="Expired"
          value={invitations.filter((i) => i.status === "expired").length}
        />
      </div>

      {/* Every staff account, grouped by role. Each card opens the Members list filtered to it. */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {STAFF_ROLE_CARDS.map((card) => {
          const count = members.filter((m) => m.roles.includes(card.role)).length;
          const selected = tab === "members" && roleFilter === card.role;
          return (
            <button
              key={card.role}
              type="button"
              onClick={() => {
                setRoleFilter(card.role);
                setTab("members");
              }}
              className={cn(
                "rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-secondary/40",
                selected && "border-primary bg-secondary/60",
              )}
            >
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <p className="mt-1 font-display text-2xl font-extrabold">{count}</p>
              <p className="mt-1 text-xs text-primary">View accounts →</p>
            </button>
          );
        })}
      </div>

      {loading && !data ? (
        <Skeleton className="mt-6 h-64 w-full rounded-xl" />
      ) : error ? (
        <div className="mt-6">
          <EmptyState title="Couldn't load the team" hint={error} />
        </div>
      ) : (
        <Tabs value={tab} onValueChange={setTab} className="mt-6">
          <TabsList>
            <TabsTrigger value="members">Members ({members.length})</TabsTrigger>
            <TabsTrigger value="invitations">
              Invitations ({invitations.filter((i) => i.status === "pending").length} pending)
            </TabsTrigger>
          </TabsList>
          <TabsContent value="members">
            <MembersTable
              members={members}
              roleFilter={roleFilter}
              onRoleFilterChange={setRoleFilter}
              onChanged={reload}
            />
          </TabsContent>
          <TabsContent value="invitations">
            <InvitationsTable invitations={invitations} onChanged={reload} />
          </TabsContent>
        </Tabs>
      )}

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={async () => {
          setInviteOpen(false);
          // Show the invitation that was just sent.
          setTab("invitations");
          await reload();
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function InviteDialog({
  open,
  onOpenChange,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onInvited: () => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<InvitableRole | "">("");
  const [employeeId, setEmployeeId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setEmail("");
    setFullName("");
    setRole("");
    setEmployeeId("");
    setErrors({});
    setMessage(null);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    const mailError = validateCompanyEmail(email);
    if (mailError) next["email"] = mailError;
    if (!role) next["role"] = "Choose a role.";
    if (employeeId.trim()) {
      const idError = validateEmployeeId(employeeId);
      if (idError) next["employee_id"] = idError;
    }
    setErrors(next);
    setMessage(null);
    if (Object.keys(next).length || !role) return;

    setBusy(true);
    const result = await authService.createInvitation({
      email: email.trim(),
      role,
      ...(fullName.trim() ? { full_name: fullName.trim() } : {}),
      ...(employeeId.trim() ? { employee_id: employeeId.trim() } : {}),
    });
    setBusy(false);
    if (!result.ok || !result.data) {
      if (result.errors) setErrors(result.errors);
      setMessage(result.message ?? "Couldn't send the invitation.");
      return;
    }
    deliveryToast(result.data.delivery, result.data.invitation.email, result.data.mailError);
    reset();
    await onInvited();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite a team member</DialogTitle>
          <DialogDescription>
            They'll get an email with a secure link to set up their account. The link expires in 72
            hours and works once.
          </DialogDescription>
        </DialogHeader>

        <form id="invite-form" className="space-y-4" onSubmit={submit} noValidate>
          {message ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {message}
            </p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="invite-email">Company email</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors["email"]) setErrors(({ email: _removed, ...rest }) => rest);
              }}
              placeholder={EMAIL_PLACEHOLDER}
              className={errors["email"] ? "border-destructive" : ""}
            />
            {errors["email"] ? <p className="text-xs text-destructive">{errors["email"]}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="invite-role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as InvitableRole)}>
              <SelectTrigger
                id="invite-role"
                className={errors["role"] ? "border-destructive" : ""}
              >
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {INVITABLE_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {role ? (
              <p className="text-xs text-muted-foreground">
                {INVITABLE_ROLES.find((r) => r.value === role)?.description}
              </p>
            ) : null}
            {errors["role"] ? <p className="text-xs text-destructive">{errors["role"]}</p> : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="invite-name">Full name (optional)</Label>
              <Input
                id="invite-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Pre-fills their setup form"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-employee-id">Employee ID (optional)</Label>
              <Input
                id="invite-employee-id"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                placeholder="Auto-assigned if blank"
                className={errors["employee_id"] ? "border-destructive" : ""}
              />
              {errors["employee_id"] ? (
                <p className="text-xs text-destructive">{errors["employee_id"]}</p>
              ) : null}
            </div>
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="invite-form" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Send invitation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

function InvitationsTable({
  invitations,
  onChanged,
}: {
  invitations: InvitationRow[];
  onChanged: () => Promise<void>;
}) {
  const [status, setStatus] = useState<InvitationStatus | "all">("pending");
  const [query, setQuery] = useState("");
  const [revoking, setRevoking] = useState<InvitationRow | null>(null);
  const [link, setLink] = useState<{ email: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = invitations
    .filter((i) => status === "all" || i.status === status)
    .filter((i) => {
      const q = query.trim().toLowerCase();
      return !q || i.email.includes(q) || (i.fullName ?? "").toLowerCase().includes(q);
    });

  async function resend(inv: InvitationRow) {
    setBusy(true);
    const result = await authService.resendInvitation(inv.id);
    setBusy(false);
    if (!result.ok || !result.data) toast.error(result.message ?? "Couldn't resend.");
    else deliveryToast(result.data.delivery, inv.email, result.data.mailError);
    await onChanged();
  }

  async function copyLink(inv: InvitationRow) {
    setBusy(true);
    const result = await authService.copyInvitationLink(inv.id);
    setBusy(false);
    if (!result.ok || !result.data?.link) {
      toast.error(result.message ?? "Couldn't create a link.");
      return;
    }
    setLink({ email: inv.email, url: result.data.link });
    await navigator.clipboard?.writeText(result.data.link).catch(() => {});
    await onChanged();
  }

  async function revoke() {
    if (!revoking) return;
    setBusy(true);
    const result = await authService.revokeInvitation(revoking.id);
    setBusy(false);
    setRevoking(null);
    if (result.ok) toast.success(result.message ?? "Invitation revoked.");
    else toast.error(result.message ?? "Couldn't revoke.");
    await onChanged();
  }

  return (
    <>
      <div className="mt-4 flex flex-wrap gap-3">
        <Select value={status} onValueChange={(v) => setStatus(v as InvitationStatus | "all")}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="revoked">Revoked</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <Input
          className="max-w-xs"
          placeholder="Search email or name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="No invitations here"
            hint="Use “Invite member” to add someone to the team."
          />
        </div>
      ) : (
        <TableShell minWidth={1000}>
          <thead className="border-b border-border text-left text-muted-foreground">
            <tr>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th>Invited by</Th>
              <Th>Last sent</Th>
              <Th>Expires</Th>
              <Th>Status</Th>
              <Th> </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((inv) => {
              const open = inv.status === "pending" || inv.status === "expired";
              return (
                <tr key={inv.id} className="border-b border-border/60 last:border-0">
                  <Td>
                    <span className="font-medium">{inv.email}</span>
                    {inv.fullName ? (
                      <span className="block text-xs text-muted-foreground">{inv.fullName}</span>
                    ) : null}
                  </Td>
                  <Td>{roleLabel(inv.role)}</Td>
                  <Td>{inv.invitedBy ?? "System"}</Td>
                  <Td>
                    {dateTime(inv.lastSentAt)}
                    {inv.sendCount > 1 ? (
                      <span className="block text-xs text-muted-foreground">
                        sent {inv.sendCount}×
                      </span>
                    ) : null}
                  </Td>
                  <Td>
                    {inv.status === "accepted" && inv.acceptedAt
                      ? `Accepted ${dateTime(inv.acceptedAt)}`
                      : inv.status === "revoked"
                        ? "—"
                        : dateTime(inv.expiresAt)}
                  </Td>
                  <Td>
                    <ToneBadge tone={inviteTone[inv.status]}>{capital(inv.status)}</ToneBadge>
                  </Td>
                  <Td>
                    {open && inv.role !== "super_admin" ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Actions for ${inv.email}`}
                            disabled={busy}
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => void resend(inv)}>
                            {inv.status === "expired" ? "Renew and resend" : "Resend email"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => void copyLink(inv)}>
                            Copy invite link
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => setRevoking(inv)}
                          >
                            Revoke
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      )}

      <AlertDialog open={!!revoking} onOpenChange={(v) => !v && setRevoking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke the invitation for {revoking?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              The link stops working immediately. You can invite them again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void revoke();
              }}
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!link} onOpenChange={(v) => !v && setLink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite link for {link?.email}</DialogTitle>
            <DialogDescription>
              Copied to your clipboard. Share it only with this person — anyone with the link can
              accept. Earlier links for this invitation no longer work.
            </DialogDescription>
          </DialogHeader>
          <Input readOnly value={link?.url ?? ""} onFocus={(e) => e.currentTarget.select()} />
          <DialogFooter>
            <Button onClick={() => setLink(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------

type MemberConfirm = { member: StaffMemberRow; action: "suspend" | "remove_staff_access" };

function MembersTable({
  members: allMembers,
  roleFilter,
  onRoleFilterChange,
  onChanged,
}: {
  members: StaffMemberRow[];
  roleFilter: RoleValue | "all";
  onRoleFilterChange: (role: RoleValue | "all") => void;
  onChanged: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const members = allMembers
    .filter((m) => roleFilter === "all" || m.roles.includes(roleFilter))
    .filter((m) => {
      const q = query.trim().toLowerCase();
      return (
        !q ||
        m.fullName.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.employeeId.toLowerCase().includes(q)
      );
    });
  const [confirm, setConfirm] = useState<MemberConfirm | null>(null);
  const [roleFor, setRoleFor] = useState<StaffMemberRow | null>(null);
  const [nextRole, setNextRole] = useState<InvitableRole>("factory_operator");
  const [busy, setBusy] = useState(false);

  async function act(
    member: StaffMemberRow,
    action:
      | "suspend"
      | "reactivate"
      | "revoke_sessions"
      | "send_reset"
      | "change_role"
      | "remove_staff_access",
    role?: InvitableRole,
  ) {
    setBusy(true);
    const result = await authService.accountAction({
      employee_id: member.employeeId,
      action,
      ...(role ? { role } : {}),
    });
    setBusy(false);
    const delivery = result.data?.delivery;
    if (!result.ok) toast.error(result.message ?? "That didn't work.");
    else if (delivery === "failed") toast.error(result.message ?? "The email couldn't be sent.");
    else if (delivery === "captured" || delivery === "logged")
      toast.warning(result.message ?? "Done.");
    else toast.success(result.message ?? "Done.");
    await onChanged();
    return result.ok;
  }

  const filters = (
    <div className="mt-4 flex flex-wrap gap-3">
      <Select value={roleFilter} onValueChange={(v) => onRoleFilterChange(v as RoleValue | "all")}>
        <SelectTrigger className="w-60" aria-label="Filter by role">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MEMBER_ROLE_FILTERS.map((f) => (
            <SelectItem key={f.value} value={f.value}>
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        className="max-w-xs"
        placeholder="Search name, email or ID"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
    </div>
  );

  if (members.length === 0) {
    return (
      <>
        {filters}
        <div className="mt-4">
          <EmptyState
            title={allMembers.length === 0 ? "No staff yet" : "No staff match these filters"}
            hint={
              allMembers.length === 0
                ? "Accepted invitations appear here."
                : "Choose “All staff roles” or clear the search."
            }
          />
        </div>
      </>
    );
  }

  return (
    <>
      {filters}
      <TableShell minWidth={960}>
        <thead className="border-b border-border text-left text-muted-foreground">
          <tr>
            <Th>Name</Th>
            <Th>Email</Th>
            <Th>Roles</Th>
            <Th>Status</Th>
            <Th>Last login</Th>
            <Th> </Th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.employeeId} className="border-b border-border/60 last:border-0">
              <Td>
                <span className="font-medium">{m.fullName}</span>
                <span className="block text-xs text-muted-foreground">{m.employeeId}</span>
              </Td>
              <Td>{m.email}</Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {m.roles.map((r) => (
                    <Badge
                      key={r}
                      variant={isStaffRole(r) ? "default" : "secondary"}
                      className="whitespace-nowrap font-normal"
                    >
                      {roleLabel(r)}
                    </Badge>
                  ))}
                </div>
              </Td>
              <Td>
                <ToneBadge tone={accountTone[m.status]}>{capital(m.status)}</ToneBadge>
              </Td>
              <Td>{m.lastLoginAt ? dateTime(m.lastLoginAt) : "Never"}</Td>
              <Td>
                {m.manageable ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Actions for ${m.fullName}`}
                        disabled={busy}
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() => {
                          const current = m.roles.find((r): r is InvitableRole =>
                            INVITABLE_ROLES.some((i) => i.value === r),
                          );
                          setNextRole(current ?? "factory_operator");
                          setRoleFor(m);
                        }}
                      >
                        Change role
                      </DropdownMenuItem>
                      {m.status === "active" ? (
                        <DropdownMenuItem onSelect={() => void act(m, "send_reset")}>
                          Send password reset link
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuItem onSelect={() => void act(m, "revoke_sessions")}>
                        Revoke all sessions
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {m.status === "active" ? (
                        <DropdownMenuItem
                          onSelect={() => setConfirm({ member: m, action: "suspend" })}
                        >
                          Suspend
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onSelect={() => void act(m, "reactivate")}>
                          Reactivate
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => setConfirm({ member: m, action: "remove_staff_access" })}
                      >
                        Remove staff access
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {m.roles.includes("super_admin") ? "Super Admin" : "You"}
                  </span>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </TableShell>

      <AlertDialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.action === "suspend"
                ? `Suspend ${confirm.member.fullName}?`
                : `Remove staff access for ${confirm?.member.fullName}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.action === "suspend"
                ? "They're signed out everywhere and can't sign in until reactivated."
                : confirm?.member.roles.includes("employee")
                  ? "Their staff roles are removed and staff sessions end. Their employee account stays."
                  : "Their staff roles are removed and the account is deactivated."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (!confirm) return;
                void act(confirm.member, confirm.action).then(() => setConfirm(null));
              }}
            >
              {confirm?.action === "suspend" ? "Suspend" : "Remove access"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!roleFor} onOpenChange={(v) => !v && setRoleFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change role for {roleFor?.fullName}</DialogTitle>
            <DialogDescription>
              Replaces their current staff role. The change applies on their next request.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={nextRole} onValueChange={(v) => setNextRole(v as InvitableRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVITABLE_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleFor(null)}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                if (!roleFor) return;
                void act(roleFor, "change_role", nextRole).then((done) => done && setRoleFor(null));
              }}
            >
              Save role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
