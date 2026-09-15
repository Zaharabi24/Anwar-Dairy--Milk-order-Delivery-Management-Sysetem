import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, MailCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { AuthHeading, AuthShell, FieldError } from "@/components/auth/AuthShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EMAIL_PLACEHOLDER } from "@/lib/auth-constants";
import { authService } from "@/services/auth-service";

export const Route = createFileRoute("/staff/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset staff password — Anwar Fresh" },
      { name: "description", content: "Get a link to choose a new staff password." },
    ],
  }),
  component: StaffForgotPasswordPage,
});

function StaffForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!email.trim()) {
      setError("Company email is required.");
      return;
    }
    setSubmitting(true);
    const result = await authService.staffForgotPassword(email.trim());
    setSubmitting(false);
    if (result.ok && result.data) {
      setSent(result.data.message);
      return;
    }
    if (result.errors?.["email"]) setError(result.errors["email"]);
    else setMessage(result.message ?? "We couldn't send a reset link.");
  }

  if (sent) {
    return (
      <AuthShell>
        <div className="text-center">
          <MailCheck className="mx-auto size-12 text-primary" />
          <h1 className="mt-4 font-display text-2xl font-bold">Check your email</h1>
          {/* The same answer whether or not the account exists. */}
          <p className="mt-3 text-sm">{sent}</p>
          <p className="mt-6 text-sm">
            <Link to="/staff/admin" className="font-medium text-primary hover:underline">
              Back to staff sign in
            </Link>
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <AuthHeading
        title="Reset your staff password"
        description="Enter your company email and we'll send you a link to choose a new password."
      />

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
            autoComplete="email"
            className={error ? "border-destructive" : ""}
          />
          <FieldError message={error} />
        </div>

        <Button type="submit" className="w-full" size="lg" disabled={submitting}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
          Send reset link
        </Button>

        <p className="text-center text-sm">
          <Link to="/staff/admin" className="font-medium text-primary hover:underline">
            Back to staff sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
