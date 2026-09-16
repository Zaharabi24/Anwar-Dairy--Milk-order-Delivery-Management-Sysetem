import { createFileRoute, Link, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { AuthHeading, AuthShell, FieldError } from "@/components/auth/AuthShell";
import { PasswordField } from "@/components/auth/PasswordField";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROLE_HOME } from "@/lib/auth-constants";
import { guardSignInPage, signInSearch, type SignInSearch } from "@/lib/portal-guard";
import { SignedInNotice } from "@/components/auth/SignedInNotice";
import { authService } from "@/services/auth-service";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): SignInSearch => signInSearch(search),
  // Only an employee-portal session is already signed in *here*. A staff session belongs to the
  // other front door, so it still gets the form — that is how an employee signs in on a browser
  // where an admin is logged in.
  beforeLoad: ({ context, search }) => guardSignInPage(context.auth, "employee", search),
  head: () => ({
    meta: [
      { title: "Sign in — Anwar Organic" },
      {
        name: "description",
        content:
          "Employees sign in with their Employee ID or company email to book today's milk batch.",
      },
      { property: "og:title", content: "Sign in — Anwar Organic" },
      {
        property: "og:description",
        content: "Company sign-in for the Anwar Organic milk ordering system.",
      },
    ],
  }),
  component: LoginPage,
});

/** Employee portal. Staff (operators, coordinators, admins) use /staff/admin. */
function LoginPage() {
  const { redirect: redirectTo } = Route.useSearch();
  const { auth } = Route.useRouteContext();
  const navigate = useNavigate();
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!employeeId.trim()) next["employee_id"] = "Employee ID or company email is required.";
    if (!password) next["password"] = "Password is required.";
    setErrors(next);
    setMessage(null);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    const result = await authService.signIn({ employee_id: employeeId.trim(), password });
    if (!result.ok || !result.data) {
      setSubmitting(false);
      setMessage(result.message ?? "Sign in failed.");
      return;
    }
    // The server set the session cookie; reload the session, then go to the employee home.
    await router.invalidate();
    await navigate({ to: redirectTo ?? ROLE_HOME[result.data.profile.activeRole] });
  }

  return (
    <AuthShell>
      <AuthHeading
        title="Sign in"
        description="Employees: use your Employee ID or company email and password to book milk."
      />

      {auth ? <SignedInNotice auth={auth} /> : null}

      {message ? (
        <Alert variant="destructive" className="mb-5">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      <form className="space-y-4" onSubmit={submit} noValidate>
        <div className="space-y-2">
          <Label htmlFor="employee-id">Employee ID or company email</Label>
          <Input
            id="employee-id"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            placeholder="Enter your Employee ID or company email"
            autoComplete="username"
            aria-invalid={!!errors["employee_id"]}
            className={errors["employee_id"] ? "border-destructive" : ""}
          />
          <FieldError message={errors["employee_id"]} />
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

        <div className="flex items-center justify-between gap-4 pt-1 text-sm">
          <Link to="/signup" className="font-medium text-primary hover:underline">
            Request for an Account
          </Link>
          <Link to="/forgot-password" className="font-medium text-primary hover:underline">
            Forgot Password
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
