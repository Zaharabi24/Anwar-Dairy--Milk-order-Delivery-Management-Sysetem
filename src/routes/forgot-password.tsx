import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Loader2, MailCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { AuthHeading, AuthShell, FieldError } from "@/components/auth/AuthShell";
import { DateOfBirthField } from "@/components/auth/DateOfBirthField";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DOB_HELPER, EMAIL_PLACEHOLDER, ROLE_HOME } from "@/lib/auth-constants";
import { validateCompanyEmail } from "@/lib/auth-validation";
import { authService } from "@/services/auth-service";

export const Route = createFileRoute("/forgot-password")({
  beforeLoad: ({ context }) => {
    if (context.auth) throw redirect({ to: ROLE_HOME[context.auth.activeRole] });
  },
  head: () => ({
    meta: [
      { title: "Reset your password — Anwar Fresh" },
      { name: "description", content: "Get a link to choose a new Anwar Fresh password." },
    ],
  }),
  component: ForgotPasswordPage,
});

type Field = "employee_id" | "company_mail" | "date_of_birth";

function ForgotPasswordPage() {
  const [employeeId, setEmployeeId] = useState("");
  const [companyMail, setCompanyMail] = useState("");
  const [dob, setDob] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, string | undefined>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const emailBlocked = !!companyMail && validateCompanyEmail(companyMail) !== null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: Partial<Record<Field, string | undefined>> = {};
    if (!employeeId.trim()) next.employee_id = "Employee ID is required.";
    const mailError = validateCompanyEmail(companyMail);
    if (mailError) next.company_mail = mailError;
    if (!dob) next.date_of_birth = "Date of birth is required.";
    setErrors(next);
    setMessage(null);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    const result = await authService.verifyResetIdentity({
      employee_id: employeeId.trim(),
      company_mail: companyMail.trim(),
      date_of_birth: dob,
    });
    setSubmitting(false);
    if (result.ok && result.data) {
      setSentTo(result.data.email_masked);
      return;
    }
    // Field-level answers render under their own field, exactly as returned.
    if (result.errors) setErrors(result.errors as Partial<Record<Field, string>>);
    else setMessage(result.message ?? "We couldn't verify those details.");
  }

  if (sentTo) {
    return (
      <AuthShell>
        <div className="text-center">
          <MailCheck className="mx-auto size-12 text-primary" />
          <h1 className="mt-4 font-display text-2xl font-bold">Check your email</h1>
          <p className="mt-3 text-sm">We&apos;ve sent a password reset link to {sentTo}.</p>
          <p className="mt-2 text-sm text-muted-foreground">The link expires in 30 minutes.</p>
          <p className="mt-6 text-sm">
            <Link to="/login" className="font-medium text-primary hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <AuthHeading
        title="Reset your password"
        description="We will email you a link to choose a new password."
      />

      {message ? (
        <Alert variant="destructive" className="mb-5">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      <form className="space-y-4" onSubmit={submit} noValidate>
        <div className="space-y-2">
          <Label htmlFor="employee-id">Employee ID</Label>
          <Input
            id="employee-id"
            value={employeeId}
            onChange={(e) => {
              setEmployeeId(e.target.value);
              if (errors.employee_id) setErrors((x) => ({ ...x, employee_id: undefined }));
            }}
            placeholder="Enter your employee ID"
            className={errors.employee_id ? "border-destructive" : ""}
          />
          <FieldError message={errors.employee_id} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="company-mail">Company email</Label>
          <Input
            id="company-mail"
            type="email"
            value={companyMail}
            onChange={(e) => {
              setCompanyMail(e.target.value);
              setErrors((x) => ({
                ...x,
                company_mail: validateCompanyEmail(e.target.value) ?? undefined,
              }));
            }}
            placeholder={EMAIL_PLACEHOLDER}
            className={errors.company_mail ? "border-destructive" : ""}
          />
          <FieldError message={errors.company_mail} />
        </div>

        <DateOfBirthField
          id="date-of-birth"
          label="Date of Birth"
          value={dob}
          onChange={(v) => {
            setDob(v);
            if (errors.date_of_birth) setErrors((x) => ({ ...x, date_of_birth: undefined }));
          }}
          error={errors.date_of_birth}
          helperText={DOB_HELPER}
        />

        <Button type="submit" className="w-full" size="lg" disabled={submitting || emailBlocked}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
          Send reset link
        </Button>

        <p className="text-center text-sm">
          <Link to="/login" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
