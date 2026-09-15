import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { TableShell, Td, Th, ToneBadge, useAdminList } from "@/components/admin/account-ui";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type { AccountRow, PasswordResetRow } from "@/lib/auth-types";
import { dateTime } from "@/lib/format";
import { authService } from "@/services/auth-service";

export const Route = createFileRoute("/app/admin/password-resets")({
  head: () => ({
    meta: [
      { title: "Password resets — Anwar Organic" },
      { name: "description", content: "Password setup and reset links sent in the last 30 days." },
    ],
  }),
  component: PasswordResetsPage,
});

const tone = { sent: "pending", completed: "success", expired: "muted" } as const;

function PasswordResetsPage() {
  const load = useCallback(() => authService.listPasswordResets(), []);
  const { data, error, loading, reload } = useAdminList(load);
  const rows = useMemo(() => data ?? [], [data]);
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Password resets"
        description="Setup and reset links from the last 30 days."
        action={<Button onClick={() => setDialogOpen(true)}>Send reset link</Button>}
      />

      {loading && !data ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : error ? (
        <EmptyState title="Couldn't load password resets" hint={error} />
      ) : rows.length === 0 ? (
        <EmptyState title="No links sent in the last 30 days" />
      ) : (
        <TableShell minWidth={880}>
          <thead className="border-b border-border text-left text-muted-foreground">
            <tr>
              <Th>Employee</Th>
              <Th>Employee ID</Th>
              <Th>Type</Th>
              <Th>Requested at</Th>
              <Th>Status</Th>
              <Th>Completed at</Th>
              <Th>IP</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: PasswordResetRow) => (
              <tr key={r.id} className="border-b border-border/60 last:border-0">
                <Td className="font-medium">{r.fullName}</Td>
                <Td>{r.employeeId}</Td>
                <Td>{r.purpose === "setup" ? "Setup" : "Reset"}</Td>
                <Td>{dateTime(r.requestedAt)}</Td>
                <Td>
                  <ToneBadge tone={tone[r.status]}>
                    {r.status[0]!.toUpperCase() + r.status.slice(1)}
                  </ToneBadge>
                </Td>
                <Td>{r.completedAt ? dateTime(r.completedAt) : "—"}</Td>
                <Td className="font-mono text-xs">{r.ip ?? "—"}</Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      <SendResetDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSent={async () => {
          setDialogOpen(false);
          await reload();
        }}
      />
    </div>
  );
}

function SendResetDialog({
  open,
  onOpenChange,
  onSent,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSent: () => Promise<void>;
}) {
  const [employeeId, setEmployeeId] = useState("");
  const [account, setAccount] = useState<AccountRow | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function lookUp() {
    setBusy(true);
    setAccount(null);
    setLookupError(null);
    const result = await authService.listAccounts();
    setBusy(false);
    if (!result.ok || !result.data) {
      setLookupError(result.message ?? "Couldn't look up accounts.");
      return;
    }
    const match = result.data.find(
      (a) => a.employeeId.toLowerCase() === employeeId.trim().toLowerCase(),
    );
    if (!match) setLookupError("No account has this Employee ID.");
    else if (match.status !== "active")
      setLookupError(`This account is ${match.status.replace("_", " ")}, so it can't reset.`);
    else setAccount(match);
  }

  async function send() {
    if (!account) return;
    setBusy(true);
    const result = await authService.accountAction({
      employee_id: account.employeeId,
      action: "send_reset",
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.message ?? "Couldn't send the link.");
      return;
    }
    toast.success(result.message ?? "Reset link sent.");
    setEmployeeId("");
    setAccount(null);
    await onSent();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setAccount(null);
          setLookupError(null);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send reset link</DialogTitle>
          <DialogDescription>
            Look up an account by Employee ID and email them a reset link.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void lookUp();
          }}
        >
          <Label htmlFor="reset-employee-id">Employee ID</Label>
          <div className="flex gap-2">
            <Input
              id="reset-employee-id"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              placeholder="Enter employee ID"
            />
            <Button type="submit" variant="outline" disabled={busy || !employeeId.trim()}>
              Look up
            </Button>
          </div>
          {lookupError ? <p className="text-xs text-destructive">{lookupError}</p> : null}
        </form>
        {account ? (
          <div className="rounded-lg border border-border p-3 text-sm">
            <p className="font-medium">{account.fullName}</p>
            <p className="text-muted-foreground">{account.companyMail}</p>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!account || busy} onClick={() => void send()}>
            Send link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
