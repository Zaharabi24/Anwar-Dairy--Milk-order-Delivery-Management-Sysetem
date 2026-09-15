import { createFileRoute, Link, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { AuthHeading, AuthShell, FieldError } from "@/components/auth/AuthShell";
import { PasswordField } from "@/components/auth/PasswordField";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EMAIL_PLACEHOLDER, ROLE_HOME } from "@/lib/auth-constants";
import { safeRedirect } from "@/lib/safe-redirect";
import { authService } from "@/services/auth-service";

export const Route = createFileRoute("/staff/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    const target = safeRedirect(search["redirect"]);
    return target ? { redirect: target } : {};
  },
  beforeLoad: ({ context }) => {
    if (context.auth?.portal === "staff")
      throw redirect({ to: ROLE_HOME[context.auth.activeRole] });
  },
  head: () => ({
    meta: [
      { title: "Super Admin Sign In — Anwar Fresh" },
      { name: "description", content: "Super Admin sign in for Anwar Fresh." },
    ],
  }),
  component: StaffLoginPage,
});

/** Staff portal: invited operators, coordinators, System Admins and Super Admins. */
function StaffLoginPage() {
  const { redirect: redirectTo } = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!email.trim()) next["email"] = "Company email is required.";
    if (!password) next["password"] = "Password is required.";
    setErrors(next);
    setMessage(null);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    const result = await authService.staffSignIn({ email: email.trim(), password });
    if (!result.ok || !result.data) {
      setSubmitting(false);
      setMessage(result.message ?? "Sign in failed.");
      return;
    }
    // Replaces any employee-portal session in this browser.
    await router.invalidate();
    await navigate({ to: redirectTo ?? ROLE_HOME[result.data.profile.activeRole] });
  }

  return (
    <AuthShell>
      <AuthHeading title="Super Admin Sign In" />

      {message ? (
        <Alert variant="destructive" className="mb-5">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      <form className="space-y-4" onSubmit={submit} noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">Company email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={EMAIL_PLACEHOLDER}
            autoComplete="username"
            aria-invalid={!!errors["email"]}
            className={errors["email"] ? "border-destructive" : ""}
          />
          <FieldError message={errors["email"]} />
        </div>

        <PasswordField
          id="password"
          label="Password"
          value={password}
          onChange={setPassword}
          placeholder="Enter your password"
          autoComplete="current-password"
          error={errors["password"]}
          showStrength={false}
        />

        <Button type="submit" className="w-full" size="lg" disabled={submitting}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
          Sign in
        </Button>

        <div className="flex items-center justify-end gap-4 pt-1 text-sm">
          <Link to="/staff/forgot-password" className="font-medium text-primary hover:underline">
            Forgot Password
          </Link>
        </div>

        <p className="border-t border-border pt-4 text-center text-xs text-muted-foreground">
          Staff accounts are created by invitation. If you were invited, use the link in your email
          to set up your account.
        </p>
      </form>
    </AuthShell>
  );
}
