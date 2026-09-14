import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { CheckCircle2, Loader2, MailWarning } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { AuthHeading, AuthShell, FieldError } from "@/components/auth/AuthShell";
import { PasswordField } from "@/components/auth/PasswordField";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ROLE_HOME, roleLabel } from "@/lib/auth-constants";
import type { AuthUser, InvitationPreview } from "@/lib/auth-types";
import { validateConfirm, validatePassword } from "@/lib/auth-validation";
import { dateTime } from "@/lib/format";
import { authService } from "@/services/auth-service";

export const Route = createFileRoute("/accept-invite")({
  validateSearch: (search: Record<string, unknown>): { token?: string } =>
    typeof search["token"] === "string" ? { token: search["token"] } : {},
  head: () => ({
    meta: [
      { title: "Accept invitation — Anwar Fresh" },
      { name: "robots", content: "noindex" },
      // Keep the token out of Referer headers sent to fonts or other hosts.
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: AcceptInvitePage,
});

type Preview = InvitationPreview | { state: "loading" } | { state: "error"; message: string };

function AcceptInvitePage() {
  const { token = "" } = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const [preview, setPreview] = useState<Preview>({ state: "loading" });
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [profile, setProfile] = useState<AuthUser | null>(null);

  // Checking the link never consumes it.
  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setPreview({ state: "invalid", message: "This invitation link is incomplete." });
      return;
    }
    void authService.previewInvitation(token).then((result) => {
      if (cancelled) return;
      if (!result.ok || !result.data) {
        setPreview({
          state: "error",
          message: result.message ?? "We couldn't check this invitation.",
        });
        return;
      }
      setPreview(result.data);
      if (result.data.state === "valid") setFullName(result.data.fullName ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (preview.state === "loading") {
    return (
      <AuthShell>
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="mt-3 h-4 w-full" />
        <Skeleton className="mt-8 h-10 w-full" />
        <Skeleton className="mt-4 h-10 w-full" />
        <Skeleton className="mt-6 h-11 w-full" />
      </AuthShell>
    );
  }

  if (preview.state !== "valid") {
    const accepted = preview.state === "accepted";
    return (
      <AuthShell>
        <div className="text-center">
          <MailWarning className="mx-auto size-12 text-muted-foreground" />
          <h1 className="mt-4 font-display text-2xl font-bold">
            {accepted ? "Invitation already accepted" : "This invitation can't be used"}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">{preview.message}</p>
          <Button asChild className="mt-6 w-full" size="lg">
            <Link to="/staff/login">Go to staff sign in</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  const existing = preview.existingAccount;
  const passwordError = password ? validatePassword(password) : null;
  const confirmError = confirm ? validateConfirm(password, confirm) : null;
  const canSubmit = existing
    ? currentPassword.length > 0
    : !!fullName.trim() && !validatePassword(password) && !validateConfirm(password, confirm);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setMessage(null);
    setErrors({});
    const result = await authService.acceptInvitation(
      existing
        ? { token, current_password: currentPassword }
        : { token, full_name: fullName.trim(), password },
    );
    setSubmitting(false);
    if (!result.ok || !result.data) {
      if (result.errors) setErrors(result.errors);
      setMessage(result.message ?? "We couldn't accept the invitation.");
      return;
    }
    setProfile(result.data.profile);
  }

  async function continueToDashboard() {
    if (!profile) return;
    await router.invalidate();
    await navigate({ to: ROLE_HOME[profile.activeRole] });
  }

  return (
    <AuthShell>
      <AuthHeading
        title="Join Anwar Fresh"
        description={`${preview.invitedBy ?? "An administrator"} invited you as ${roleLabel(preview.role)}.`}
      />

      <dl className="mb-5 grid gap-2 rounded-lg border border-border p-4 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Email</dt>
          <dd className="font-medium">{preview.email}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Role</dt>
          <dd className="font-medium">{roleLabel(preview.role)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Expires</dt>
          <dd className="font-medium">{dateTime(preview.expiresAt)}</dd>
        </div>
      </dl>

      {message ? (
        <Alert variant="destructive" className="mb-5">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      <form className="space-y-4" onSubmit={submit} noValidate>
        {existing ? (
          <>
            <p className="text-sm">
              You already have an Anwar Fresh account ({existing.employeeId}). Enter your current
              password to add the <strong>{roleLabel(preview.role)}</strong> role to it.
            </p>
            <PasswordField
              id="current-password"
              label="Current password"
              value={currentPassword}
              onChange={setCurrentPassword}
              autoComplete="current-password"
              error={errors["current_password"]}
            />
          </>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="full-name">Full Name</Label>
              <Input
                id="full-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full name"
                autoComplete="name"
                className={errors["full_name"] ? "border-destructive" : ""}
              />
              <FieldError message={errors["full_name"]} />
            </div>
            <PasswordField
              id="password"
              label="Password"
              value={password}
              onChange={setPassword}
              placeholder="Min 8 characters"
              autoComplete="new-password"
              error={errors["password"] ?? passwordError}
              showStrength
            />
            <PasswordField
              id="confirm-password"
              label="Confirm Password"
              value={confirm}
              onChange={setConfirm}
              placeholder="Re-enter your password"
              autoComplete="new-password"
              error={confirmError}
            />
          </>
        )}

        <Button type="submit" className="w-full" size="lg" disabled={!canSubmit || submitting}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
          {existing ? "Accept invitation" : "Accept & create account"}
        </Button>

        {existing ? (
          <p className="text-center text-sm">
            <Link to="/staff/forgot-password" className="font-medium text-primary hover:underline">
              Forgot your password?
            </Link>
          </p>
        ) : null}
      </form>

      <Dialog open={!!profile}>
        <DialogContent
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          className="[&>button.absolute]:hidden"
        >
          <DialogHeader className="items-center text-center sm:text-center">
            <CheckCircle2 className="size-12 text-primary" />
            <DialogTitle>Welcome to Anwar Fresh</DialogTitle>
            <DialogDescription>
              Your account is ready and you&apos;re signed in as {roleLabel(preview.role)}.
            </DialogDescription>
          </DialogHeader>
          <Button className="w-full" size="lg" onClick={() => void continueToDashboard()}>
            Continue to dashboard
          </Button>
        </DialogContent>
      </Dialog>
    </AuthShell>
  );
}
