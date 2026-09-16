import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, Monitor } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { humanize, useAdminList } from "@/components/admin/account-ui";
import { PasswordField } from "@/components/auth/PasswordField";
import { PageHeader } from "@/components/page-header";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { validateConfirm, validatePassword } from "@/lib/auth-validation";
import { dateTime } from "@/lib/format";
import { authService } from "@/services/auth-service";

export const Route = createFileRoute("/app/security")({
  head: () => ({
    meta: [
      { title: "Privacy & security — Anwar Organic" },
      { name: "description", content: "Your password, where you're signed in, and what we hold." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SecurityPage,
});

function SecurityPage() {
  const { user } = useAuth();
  const loadSessions = useCallback(() => authService.mySessions(), []);
  const loadActivity = useCallback(() => authService.myActivity(), []);
  const { data: sessions, loading, reload: reloadSessions } = useAdminList(loadSessions);
  const { data: activity, reload: reloadActivity } = useAdminList(loadActivity);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [signingOutAll, setSigningOutAll] = useState(false);

  const others = (sessions ?? []).filter((s) => !s.current);

  async function changePassword() {
    const next_errors: Record<string, string> = {};
    if (!current) next_errors["current_password"] = "Enter your current password.";
    const bad = validatePassword(next);
    if (bad) next_errors["new_password"] = bad;
    const mismatch = validateConfirm(next, confirm);
    if (mismatch) next_errors["confirm"] = mismatch;
    setErrors(next_errors);
    if (Object.keys(next_errors).length) return;

    setSaving(true);
    const result = await authService.changePassword({
      current_password: current,
      new_password: next,
    });
    setSaving(false);
    if (!result.ok) {
      if (result.errors) setErrors(result.errors);
      toast.error(result.message ?? "We couldn't change your password.");
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    toast.success(result.message ?? "Password changed.");
    await Promise.all([reloadSessions(), reloadActivity()]);
  }

  async function signOutOthers() {
    setSigningOutAll(true);
    const result = await authService.revokeMyOtherSessions();
    setSigningOutAll(false);
    (result.ok ? toast.success : toast.error)(result.message ?? "Done.");
    await Promise.all([reloadSessions(), reloadActivity()]);
  }

  async function signOutOne(id: string) {
    const result = await authService.revokeMySession(id);
    (result.ok ? toast.success : toast.error)(result.message ?? "Done.");
    await Promise.all([reloadSessions(), reloadActivity()]);
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="Privacy &amp; security"
        description="Your password, where you're signed in, and what we hold about you."
        action={
          <Button asChild variant="outline">
            <Link to="/app/profile">Profile</Link>
          </Button>
        }
      />

      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-display text-base font-bold">Change password</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Changing it signs out every other device, and any password reset link you were sent stops
          working.
        </p>
        <div className="mt-5 space-y-4">
          <PasswordField
            id="current-password"
            label="Current password"
            value={current}
            onChange={(v) => {
              setCurrent(v);
              setErrors((p) => ({ ...p, current_password: "" }));
            }}
            error={errors["current_password"]}
            autoComplete="current-password"
          />
          <PasswordField
            id="new-password"
            label="New password"
            value={next}
            onChange={(v) => {
              setNext(v);
              setErrors((p) => ({ ...p, new_password: "" }));
            }}
            error={errors["new_password"]}
            showStrength
            autoComplete="new-password"
          />
          <PasswordField
            id="confirm-password"
            label="Confirm new password"
            value={confirm}
            onChange={(v) => {
              setConfirm(v);
              setErrors((p) => ({ ...p, confirm: "" }));
            }}
            error={errors["confirm"]}
            autoComplete="new-password"
          />
          <Button onClick={() => void changePassword()} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Change password
          </Button>
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold">Where you're signed in</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign out anything you don't recognise, then change your password.
            </p>
          </div>
          <SignOutOthers count={others.length} busy={signingOutAll} onConfirm={signOutOthers} />
        </div>

        {loading && !sessions ? (
          <Skeleton className="mt-5 h-24 w-full rounded-lg" />
        ) : (
          <ul className="mt-5 space-y-3">
            {(sessions ?? []).map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4"
              >
                <div className="flex items-start gap-3">
                  <Monitor className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">
                      {s.device}
                      {s.current ? (
                        <Badge className="ml-2 font-normal" variant="secondary">
                          This device
                        </Badge>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.ip ?? "Unknown address"} · last active {dateTime(s.lastSeenAt)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Signed in {dateTime(s.startedAt)}
                    </p>
                  </div>
                </div>
                {s.current ? null : (
                  <Button size="sm" variant="outline" onClick={() => void signOutOne(s.id)}>
                    Sign out
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-border bg-card p-6">
        <h2 className="font-display text-base font-bold">Recent account activity</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign-ins and changes to your account. If something here wasn't you, contact IT.
        </p>
        {(activity ?? []).length === 0 ? (
          <p className="mt-5 text-sm text-muted-foreground">Nothing recorded yet.</p>
        ) : (
          <ul className="mt-5 divide-y divide-border text-sm">
            {(activity ?? []).map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span className="font-medium">{humanize(a.event)}</span>
                <span className="text-muted-foreground">
                  {dateTime(a.at)}
                  {a.ip ? ` · ${a.ip}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-border bg-card p-6">
        <h2 className="font-display text-base font-bold">Your privacy</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <Row
            term="What this account holds"
            detail="Your name, Employee ID, company email, phone, department, site and business unit, plus your milk orders and collections."
          />
          <Row
            term="Date of birth"
            detail="Held only to verify you when you reset your password. It is never shown back to you or to an administrator."
          />
          <Row
            term="Sign-in records"
            detail="Sign-ins, password changes and account changes are recorded with the time and IP address, so misuse can be traced."
          />
          <Row
            term="Who can see it"
            detail={
              user?.roles.some((r) => r !== "employee")
                ? "Your own account is visible to System Admins and Super Admins, who manage accounts and can see the audit trail."
                : "Your account details are visible to System Admins and Super Admins, who approve and manage employee accounts."
            }
          />
          <Row
            term="Corrections and deletion"
            detail="Name and phone you can change on your Profile. Everything else, including closing your account, is handled by HR or a Super Admin."
          />
        </dl>
      </section>
    </div>
  );
}

function Row({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[200px_1fr] sm:gap-3">
      <dt className="text-muted-foreground">{term}</dt>
      <dd>{detail}</dd>
    </div>
  );
}

function SignOutOthers({
  count,
  busy,
  onConfirm,
}: {
  count: number;
  busy: boolean;
  onConfirm: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" disabled={count === 0 || busy} onClick={() => setOpen(true)}>
        Sign out other devices{count ? ` (${count})` : ""}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out {count} other device(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              They'll need to sign in again. This device stays signed in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void onConfirm().then(() => setOpen(false));
              }}
            >
              Sign them out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
