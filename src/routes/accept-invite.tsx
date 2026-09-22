import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MailWarning, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordField } from "@/components/auth/PasswordField";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { roleLabel } from "@/lib/auth-constants";
import { validateConfirm, validatePassword } from "@/lib/auth-validation";
import type { InvitationPreview } from "@/lib/auth-types";
import { authService } from "@/services/auth-service";

export const Route = createFileRoute("/accept-invite")({
  validateSearch: (search: Record<string, unknown>): { token?: string } =>
    typeof search["token"] === "string" ? { token: search["token"] } : {},
  head: () => ({
    meta: [
      { title: "Accept invitation — Anwar Organic" },
      { name: "robots", content: "noindex" },
      // Keep the token out of Referer headers sent to fonts or other hosts.
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: AcceptInvitePage,
});

type Stage = InvitationPreview | { state: "loading" } | { state: "error"; message: string };

/**
 * The invitation link.
 *
 * Checking the link and accepting it are two steps, and the second one is the person's own: they
 * choose the password that will be theirs from then on, and the invitation is not spent until
 * they submit it. That ordering matters beyond tidiness -- mail scanners and Outlook Safe Links
 * fetch a URL before anyone sees it, and an invitation consumed on load would be spent by a
 * scanner, leaving the real person told their link had already been used. The check runs in the
 * browser, which scanners do not execute, and nothing is consumed until the form is sent.
 *
 * Somebody who already has a working account is the exception. There is no password to choose --
 * they have one -- so accepting only adds the new role to the account they already sign in with.
 */
function AcceptInvitePage() {
  const { token = "" } = Route.useSearch();
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>({ state: "loading" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // React runs effects twice in development; the check is cheap but only needs doing once.
  const checked = useRef(false);

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    if (!token) {
      setStage({ state: "invalid", message: "This invitation link is incomplete." });
      return;
    }
    void (async () => {
      const preview = await authService.previewInvitation(token);
      if (!preview.ok || !preview.data) {
        setStage({
          state: "error",
          message: preview.message ?? "We couldn't check this invitation.",
        });
        return;
      }
      setStage(preview.data);
    })();
  }, [token]);

  if (stage.state === "loading") {
    return (
      <AuthShell>
        <div className="text-center">
          <Skeleton className="mx-auto h-8 w-2/3" />
          <Skeleton className="mx-auto mt-3 h-4 w-1/2" />
        </div>
        <Skeleton className="mt-8 h-24 w-full" />
        <Skeleton className="mt-6 h-11 w-full" />
        <p className="mt-6 text-center text-sm text-muted-foreground">Checking your invitation…</p>
      </AuthShell>
    );
  }

  if (stage.state !== "valid") {
    const accepted = stage.state === "accepted";
    return (
      <AuthShell>
        <div className="text-center">
          <MailWarning className="mx-auto size-12 text-muted-foreground" />
          <h1 className="mt-4 font-display text-2xl font-bold">
            {accepted ? "Invitation already accepted" : "This invitation can't be used"}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">{stage.message}</p>
          <Button asChild className="mt-6 w-full" size="lg">
            <Link to="/login">Go to sign in</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  // Somebody who already has an account has a password; the role is simply added to it.
  const joining = stage.existingAccount === null;
  const passwordError = password ? validatePassword(password) : null;
  const confirmError = confirm ? validateConfirm(password, confirm) : null;
  const canSubmit = joining
    ? !validatePassword(password) && !validateConfirm(password, confirm)
    : true;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !canSubmit) return;
    setBusy(true);
    setFailure(null);
    const result = await authService.acceptInvitation(
      joining ? { token, password, confirm } : { token },
    );
    if (!result.ok) {
      setFailure(result.message ?? "We couldn't accept this invitation.");
      setBusy(false);
      return;
    }
    // Straight to Sign In, deliberately: the account is theirs now, and the first thing it should
    // do is prove the password they just chose actually works.
    await navigate({ to: "/login", replace: true });
  }

  return (
    <AuthShell>
      <div className="text-center">
        <ShieldCheck className="mx-auto size-12 text-primary" />
        <h1 className="mt-4 font-display text-2xl font-bold">
          {joining ? "Set your password" : "Accept your invitation"}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {joining ? (
            <>
              You have been invited to Anwar Organic as{" "}
              <span className="font-medium text-foreground">{roleLabel(stage.role)}</span>. Choose a
              password to finish setting up <span className="font-medium">{stage.email}</span>.
            </>
          ) : (
            <>
              <span className="font-medium text-foreground">{roleLabel(stage.role)}</span> will be
              added to your existing account, <span className="font-medium">{stage.email}</span>.
              Your password stays as it is.
            </>
          )}
        </p>
      </div>

      <form className="mt-8 space-y-4" onSubmit={submit} noValidate>
        {joining ? (
          <>
            <PasswordField
              id="new-password"
              label="New Password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              required
              showStrength
              error={passwordError}
            />
            <PasswordField
              id="confirm-password"
              label="Confirm Password"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              required
              error={confirmError}
            />
          </>
        ) : null}

        {failure ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {failure}
          </p>
        ) : null}

        <Button type="submit" className="w-full" size="lg" disabled={busy || !canSubmit}>
          {busy ? "Setting up your account…" : joining ? "Activate account" : "Accept invitation"}
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        This link is for you alone and can only be used once.
      </p>
    </AuthShell>
  );
}
