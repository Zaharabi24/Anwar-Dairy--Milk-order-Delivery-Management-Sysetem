import { createFileRoute, Link } from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { TableShell, Td, Th, ToneBadge, useAdminList } from "@/components/admin/account-ui";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { ALL_ROLES, BUSINESS_UNITS, roleLabel, type RoleValue } from "@/lib/auth-constants";
import type { AccountRow, AccountStatus, DeletedAccountRow } from "@/lib/auth-types";
import type { AccountActionInput } from "@/lib/auth.schemas";
import { dateTime } from "@/lib/format";
import { authService } from "@/services/auth-service";

export const Route = createFileRoute("/app/admin/accounts")({
  head: () => ({
    meta: [
      { title: "Accounts — Anwar Organic" },
      { name: "description", content: "Manage sign-in accounts and access." },
    ],
  }),
  component: AccountsPage,
});

/**
 * Accounts that were deleted. They keep an employees row so their past orders still have an
 * owner, which is why they are listed here rather than vanishing: this is where an admin sees
 * that those orders belong to someone who no longer has access.
 */
function DeletedAccounts({ rows }: { rows: DeletedAccountRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="mt-10">
      <h2 className="font-display text-lg font-bold">Deleted accounts</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Access has been removed and the company mail released, so these people can submit a new
        account request with the same address. Their past orders are kept for reporting and billing.
      </p>
      <TableShell minWidth={900}>
        <thead className="border-b border-border text-left text-muted-foreground">
          <tr>
            <Th>Employee ID</Th>
            <Th>Name</Th>
            <Th>Company Mail</Th>
            <Th>Business Unit</Th>
            <Th>Orders kept</Th>
            <Th>Deleted</Th>
            <Th>Deleted by</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.employeeId} className="border-b border-border/60 last:border-0">
              <Td className="font-medium">{d.employeeId}</Td>
              <Td>{d.fullName}</Td>
              <Td>{d.companyMail}</Td>
              <Td>{d.businessUnitName ?? "—"}</Td>
              <Td>{d.retainedOrders}</Td>
              <Td>{dateTime(d.deletedAt)}</Td>
              <Td>{d.deletedBy ?? "—"}</Td>
            </tr>
          ))}
        </tbody>
      </TableShell>
    </section>
  );
}

const statusLabel: Record<AccountStatus, string> = {
  active: "Active",
  awaiting_password: "Awaiting password",
  suspended: "Suspended",
  deactivated: "Deactivated",
};
const statusTone: Record<AccountStatus, "success" | "pending" | "danger" | "muted"> = {
  active: "success",
  awaiting_password: "pending",
  suspended: "danger",
  deactivated: "muted",
};

type Confirm = { account: AccountRow; action: "suspend" | "deactivate" | "delete" };

const confirmTitle = { suspend: "Suspend", deactivate: "Deactivate", delete: "Delete" } as const;

function AccountsPage() {
  const { user, can } = useAuth();
  const load = useCallback(() => authService.listAccounts(), []);
  const { data, error, loading, reload } = useAdminList(load);
  const accounts = useMemo(() => data ?? [], [data]);
  const loadDeleted = useCallback(() => authService.listDeletedAccounts(), []);
  const { data: deletedData, reload: reloadDeleted } = useAdminList(loadDeleted);
  const deleted = useMemo(() => deletedData ?? [], [deletedData]);

  const [status, setStatus] = useState<AccountStatus | "all">("all");
  const [unit, setUnit] = useState("all");
  const [role, setRole] = useState("all");
  const [query, setQuery] = useState("");
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts
      .filter((a) => status === "all" || a.status === status)
      .filter((a) => unit === "all" || a.businessUnitCode === unit)
      .filter((a) => role === "all" || a.roles.includes(role as RoleValue))
      .filter(
        (a) =>
          !q ||
          a.fullName.toLowerCase().includes(q) ||
          a.employeeId.toLowerCase().includes(q) ||
          a.companyMail.toLowerCase().includes(q),
      );
  }, [accounts, status, unit, role, query]);

  const count = (s: AccountStatus) => accounts.filter((a) => a.status === s).length;

  async function act(input: AccountActionInput) {
    setBusy(true);
    const result = await authService.accountAction(input);
    setBusy(false);
    const delivery = result.data?.delivery;
    if (!result.ok) toast.error(result.message ?? "That didn't work.");
    else if (delivery === "failed") toast.error(result.message ?? "The email couldn't be sent.");
    else if (delivery === "captured" || delivery === "logged")
      toast.warning(result.message ?? "Done.");
    else toast.success(result.message ?? "Done.");
    await Promise.all([reload(), reloadDeleted()]);
    return result.ok;
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Accounts"
        description={
          can("staff.manage")
            ? "Everyone who can sign in. Staff roles are managed from Team & invitations."
            : "Everyone who can sign in. You can manage employee accounts; staff accounts are managed by a Super Admin."
        }
        action={
          can("staff.invite") ? (
            <Button asChild variant="outline">
              <Link to="/app/admin/team">Team & invitations</Link>
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total" value={accounts.length} />
        <StatCard label="Active" value={count("active")} emphasis />
        <StatCard label="Awaiting password" value={count("awaiting_password")} />
        <StatCard label="Suspended" value={count("suspended")} />
        <StatCard label="Deactivated" value={count("deactivated")} />
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Select value={status} onValueChange={(v) => setStatus(v as AccountStatus | "all")}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(Object.keys(statusLabel) as AccountStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {statusLabel[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={unit} onValueChange={setUnit}>
          <SelectTrigger className="w-60">
            <SelectValue />
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
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {ALL_ROLES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="max-w-xs"
          placeholder="Search name, ID or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading && !data ? (
        <Skeleton className="mt-4 h-64 w-full rounded-xl" />
      ) : error ? (
        <div className="mt-4">
          <EmptyState title="Couldn't load accounts" hint={error} />
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No accounts match" hint="Approved account requests appear here." />
        </div>
      ) : (
        <TableShell minWidth={1100}>
          <thead className="border-b border-border text-left text-muted-foreground">
            <tr>
              <Th>Employee ID</Th>
              <Th>Name</Th>
              <Th>Company Mail</Th>
              <Th>Business Unit</Th>
              <Th>Office</Th>
              <Th>Roles</Th>
              <Th>Status</Th>
              <Th>Last login</Th>
              <Th> </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const self = a.employeeId === user?.employeeId;
              return (
                <tr key={a.employeeId} className="border-b border-border/60 last:border-0">
                  <Td className="font-medium">{a.employeeId}</Td>
                  <Td>
                    {a.fullName}
                    {self ? (
                      <span className="block text-xs text-muted-foreground">You</span>
                    ) : !a.manageable ? (
                      <span className="block text-xs text-muted-foreground">
                        Managed by a Super Admin
                      </span>
                    ) : null}
                  </Td>
                  <Td>{a.companyMail}</Td>
                  <Td>{a.businessUnitName ?? "—"}</Td>
                  <Td>{a.officeName ?? "—"}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {a.roles.map((r) => (
                        <Badge
                          key={r}
                          variant="secondary"
                          className="whitespace-nowrap font-normal"
                        >
                          {roleLabel(r)}
                        </Badge>
                      ))}
                    </div>
                  </Td>
                  <Td>
                    <ToneBadge tone={statusTone[a.status]}>{statusLabel[a.status]}</ToneBadge>
                  </Td>
                  <Td>{a.lastLoginAt ? dateTime(a.lastLoginAt) : "Never"}</Td>
                  <Td>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Actions for ${a.fullName}`}
                          disabled={!a.manageable || busy}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {a.status === "awaiting_password" ? (
                          <DropdownMenuItem
                            onSelect={() =>
                              void act({ employee_id: a.employeeId, action: "resend_setup" })
                            }
                          >
                            Resend password setup link
                          </DropdownMenuItem>
                        ) : null}
                        {a.status === "active" ? (
                          <DropdownMenuItem
                            onSelect={() =>
                              void act({ employee_id: a.employeeId, action: "send_reset" })
                            }
                          >
                            Send password reset link
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuSeparator />
                        {a.status === "active" ? (
                          <DropdownMenuItem
                            onSelect={() => setConfirm({ account: a, action: "suspend" })}
                          >
                            Suspend
                          </DropdownMenuItem>
                        ) : null}
                        {a.status === "suspended" || a.status === "deactivated" ? (
                          <DropdownMenuItem
                            onSelect={() =>
                              void act({ employee_id: a.employeeId, action: "reactivate" })
                            }
                          >
                            Reactivate
                          </DropdownMenuItem>
                        ) : null}
                        {a.status !== "deactivated" ? (
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => setConfirm({ account: a, action: "deactivate" })}
                          >
                            Deactivate
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem
                          onSelect={() =>
                            void act({ employee_id: a.employeeId, action: "revoke_sessions" })
                          }
                        >
                          Revoke all sessions
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => setConfirm({ account: a, action: "delete" })}
                        >
                          Delete account
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      )}

      <DeletedAccounts rows={deleted} />

      <AlertDialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmTitle[confirm?.action ?? "suspend"]} {confirm?.account.fullName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.action === "suspend"
                ? "They are signed out everywhere and can't sign in until reactivated."
                : confirm?.action === "deactivate"
                  ? "They are signed out everywhere and removed from booking. Their pending orders will be cancelled."
                  : `This cannot be undone. ${confirm?.account.fullName} loses access immediately and the account is removed from this list. Their past orders are kept for reporting and billing, and open orders are cancelled. ${confirm?.account.companyMail} is released, so they can submit a new account request with it.`}
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
                void act({ employee_id: confirm.account.employeeId, action: confirm.action }).then(
                  () => setConfirm(null),
                );
              }}
            >
              {confirmTitle[confirm?.action ?? "suspend"]}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
