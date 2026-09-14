import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { AuthHeading, AuthShell } from "./AuthShell";
import { PasswordField } from "./PasswordField";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ROLE_HOME } from "@/lib/auth-constants";
import type { AuthUser } from "@/lib/auth-types";
import { validateConfirm, validatePassword } from "@/lib/auth-validation";
import { authService } from "@/services/auth-service";

type TokenState =
  | { status: "loading" }
  | { status: "invalid"; message: string }
  | { status: "valid"; purpose: "setup" | "reset"; fullName: string };

/** Shared by /set-password and /reset-password. The token comes from the route's search params. */
export function SetPasswordPage({ token }: { token: string }) {
  const navigate = useNavigate();
  const router = useRouter();
  const [state, setState] = useState<TokenState>({ status: "loading" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [profile, setProfile] = useState<AuthUser | null>(null);

  // Checking the token never consumes it (mail scanners pre-open links).
  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setState({ status: "invalid", message: "This link is invalid or has expired." });
      return;
    }
    void authService.validatePasswordToken(token).then((result) => {
      if (cancelled) return;
      setState(
        result.ok && result.data
          ? { status: "valid", purpose: result.data.purpose, fullName: result.data.full_name }
          : {
              status: "invalid",
              message: result.message ?? "This link is invalid or has expired.",
            },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const passwordError = password ? validatePassword(password) : null;
  const confirmError = confirm ? validateConfirm(password, confirm) : null;
  const canSubmit = !validatePassword(password) && !validateConfirm(password, confirm);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setMessage(null);
    const result = await authService.setPassword(token, password);
    setSubmitting(false);
    if (!result.ok || !result.data) {
      setMessage(result.message ?? "We couldn't save your password.");
      return;
    }
    setProfile(result.data.profile);
  }

  async function continueToDashboard() {
    if (!profile) return;
    // The server already started the session; load it and go to the role's home.
    await router.invalidate();
    await navigate({ to: ROLE_HOME[profile.activeRole] });
  }

  if (state.status === "loading") {
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

  if (state.status === "invalid") {
    return (
      <AuthShell>
        <AuthHeading title="This link is invalid or has expired." description={state.message} />
        <Button asChild className="w-full" size="lg">
          <Link to="/forgot-password">Request a new link</Link>
        </Button>
        <p className="mt-4 text-center text-sm">
          <Link to="/login" className="font-medium text-primary hover:underline">
            Back to Sign In
          </Link>
        </p>
      </AuthShell>
    );
  }

  const isSetup = state.purpose === "setup";

  return (
    <AuthShell>
      <AuthHeading
        title={isSetup ? "Set your password" : "Reset your password"}
        description={
          isSetup
            ? "Create a password for your Anwar Fresh account."
            : "Choose a new password for your account."
        }
      />

      {message ? (
        <Alert variant="destructive" className="mb-5">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      <form className="space-y-4" onSubmit={submit} noValidate>
        <PasswordField
          id="password"
          label="Password"
          value={password}
          onChange={setPassword}
          placeholder="Min 8 characters"
          autoComplete="new-password"
          error={passwordError}
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
          showStrength={false}
        />
        <Button type="submit" className="w-full" size="lg" disabled={!canSubmit || submitting}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
          {isSetup ? "Set Password" : "Reset Password"}
        </Button>
      </form>

      <Dialog open={!!profile}>
        <DialogContent
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          className="[&>button.absolute]:hidden"
        >
          <DialogHeader className="items-center text-center sm:text-center">
            <CheckCircle2 className="size-12 text-primary" />
            <DialogTitle>
              {isSetup ? "Password set successfully" : "Password reset successfully"}
            </DialogTitle>
            <DialogDescription>
              You&apos;re all set. Continue straight to your dashboard.
            </DialogDescription>
          </DialogHeader>
          <Button className="w-full" size="lg" onClick={() => void continueToDashboard()}>
            Continue to dashboard
          </Button>
          <p className="text-center text-sm">
            <Link to="/login" className="font-medium text-primary hover:underline">
              Back to Sign In
            </Link>
          </p>
        </DialogContent>
      </Dialog>
    </AuthShell>
  );
}
