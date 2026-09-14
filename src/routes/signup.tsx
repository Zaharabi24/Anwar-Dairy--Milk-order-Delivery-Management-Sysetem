import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { AuthHeading, AuthShell, FieldError } from "@/components/auth/AuthShell";
import { DateOfBirthField } from "@/components/auth/DateOfBirthField";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BUSINESS_UNITS,
  DOB_HELPER,
  EMAIL_PLACEHOLDER,
  OFFICES,
  ROLE_HOME,
} from "@/lib/auth-constants";
import { validateCompanyEmail, validateDob, validateEmployeeId } from "@/lib/auth-validation";
import { authService } from "@/services/auth-service";

export const Route = createFileRoute("/signup")({
  beforeLoad: ({ context }) => {
    if (context.auth) throw redirect({ to: ROLE_HOME[context.auth.activeRole] });
  },
  head: () => ({
    meta: [
      { title: "Request an account — Anwar Fresh" },
      {
        name: "description",
        content: "Request access to Anwar Fresh. An administrator reviews every request.",
      },
    ],
  }),
  component: RequestAccountPage,
});

// Sign Up is for employees only. Staff accounts are created by invitation from a Super Admin.
type Field =
  | "business_unit_code"
  | "full_name"
  | "company_mail"
  | "employee_id"
  | "date_of_birth"
  | "office_code";

function RequestAccountPage() {
  const [form, setForm] = useState({
    business_unit_code: "",
    full_name: "",
    company_mail: "",
    employee_id: "",
    date_of_birth: "",
    office_code: OFFICES.length === 1 ? OFFICES[0]!.code : "",
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ reference: string; email: string } | null>(null);

  const validate = (field: Field, value: string): string | undefined => {
    switch (field) {
      case "business_unit_code":
        return value ? undefined : "Select your business unit.";
      case "office_code":
        return value ? undefined : "Select your office.";
      case "full_name":
        return value.trim() ? undefined : "Full name is required.";
      case "company_mail":
        return validateCompanyEmail(value) ?? undefined;
      case "employee_id":
        return validateEmployeeId(value) ?? undefined;
      case "date_of_birth":
        return validateDob(value) ?? undefined;
    }
  };

  const setField = (field: Field, value: string, live = false) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (live || errors[field]) setErrors((e) => ({ ...e, [field]: validate(field, value) }));
  };
  const blur = (field: Field) =>
    setErrors((e) => ({ ...e, [field]: validate(field, form[field]) }));

  // The domain check runs on every keystroke and blocks submission while it fails.
  const emailBlocked = !!form.company_mail && validateCompanyEmail(form.company_mail) !== null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: Partial<Record<Field, string>> = {};
    (Object.keys(form) as Field[]).forEach((field) => {
      const error = validate(field, form[field]);
      if (error) next[field] = error;
    });
    setErrors(next);
    setMessage(null);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    const result = await authService.submitAccountRequest({ ...form, requested_role: "employee" });
    setSubmitting(false);
    if (result.ok && result.data) {
      setDone({ reference: result.data.reference, email: form.company_mail.trim() });
      return;
    }
    if (result.errors) setErrors(result.errors as Partial<Record<Field, string>>);
    setMessage(result.message ?? "We couldn't submit your request.");
  }

  if (done) {
    return (
      <AuthShell width="wide">
        <div className="text-center">
          <CheckCircle2 className="mx-auto size-12 text-primary" />
          <h1 className="mt-4 font-display text-2xl font-bold">Request submitted</h1>
          <div className="mx-auto mt-5 inline-block rounded-lg border border-border px-6 py-3 font-mono text-2xl font-semibold tracking-wide">
            {done.reference}
          </div>
        </div>
        <ol className="mx-auto mt-6 max-w-md list-decimal space-y-2 pl-5 text-sm">
          <li>An administrator will review your request.</li>
          <li>Once approved, you will receive an email at {done.email}.</li>
          <li>That email contains a link to set your password.</li>
        </ol>
        <p className="mt-5 text-center text-sm text-muted-foreground">
          Most requests are reviewed within one working day.
        </p>
        <p className="mt-6 text-center text-sm">
          <Link to="/login" className="font-medium text-primary hover:underline">
            Back to Sign In
          </Link>
        </p>
      </AuthShell>
    );
  }

  const selectClass = (field: Field) => (errors[field] ? "border-destructive" : "");

  return (
    <AuthShell width="wide">
      <AuthHeading
        title="Request an account"
        description="Your account request will be reviewed and approved by an administrator before you can sign in."
      />

      <p className="-mt-3 mb-5 rounded-lg border border-border bg-secondary/50 px-4 py-3 text-sm text-muted-foreground">
        This form is for employees booking milk. Factory, head office and admin staff are invited
        by email — ask your Super Admin.
      </p>

      {message ? (
        <Alert variant="destructive" className="mb-5">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      <form className="space-y-4" onSubmit={submit} noValidate>
        <div className="space-y-2">
          <Label htmlFor="business-unit">Business Unit</Label>
          <Select
            value={form.business_unit_code}
            onValueChange={(v) => setField("business_unit_code", v, true)}
          >
            <SelectTrigger id="business-unit" className={selectClass("business_unit_code")}>
              <SelectValue placeholder="Select business unit" />
            </SelectTrigger>
            <SelectContent>
              {BUSINESS_UNITS.map((b) => (
                <SelectItem key={b.code} value={b.code}>
                  {b.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError message={errors.business_unit_code} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="full-name">Full Name</Label>
            <Input
              id="full-name"
              value={form.full_name}
              onChange={(e) => setField("full_name", e.target.value)}
              onBlur={() => blur("full_name")}
              placeholder="Enter your full name"
              autoComplete="name"
              className={errors.full_name ? "border-destructive" : ""}
            />
            <FieldError message={errors.full_name} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="company-mail">Company Mail</Label>
            <Input
              id="company-mail"
              type="email"
              value={form.company_mail}
              onChange={(e) => setField("company_mail", e.target.value, true)}
              placeholder={EMAIL_PLACEHOLDER}
              autoComplete="email"
              className={errors.company_mail ? "border-destructive" : ""}
            />
            <FieldError message={errors.company_mail} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="employee-id">Employee ID</Label>
            <Input
              id="employee-id"
              value={form.employee_id}
              onChange={(e) => setField("employee_id", e.target.value)}
              onBlur={() => blur("employee_id")}
              placeholder="Enter your employee ID"
              className={errors.employee_id ? "border-destructive" : ""}
            />
            {errors.employee_id ? (
              <FieldError message={errors.employee_id} />
            ) : (
              <p className="text-xs text-muted-foreground">{DOB_HELPER}</p>
            )}
          </div>
          <DateOfBirthField
            id="date-of-birth"
            label="Date of Birth"
            value={form.date_of_birth}
            onChange={(v) => setField("date_of_birth", v)}
            onBlur={() => blur("date_of_birth")}
            error={errors.date_of_birth}
            helperText={DOB_HELPER}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="office">Office</Label>
          <Select value={form.office_code} onValueChange={(v) => setField("office_code", v, true)}>
            <SelectTrigger id="office" className={selectClass("office_code")}>
              <SelectValue placeholder="Select office" />
            </SelectTrigger>
            <SelectContent>
              {OFFICES.map((o) => (
                <SelectItem key={o.code} value={o.code}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError message={errors.office_code} />
        </div>

        <Button type="submit" className="w-full" size="lg" disabled={submitting || emailBlocked}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
          Submit Request
        </Button>

        <p className="text-center text-sm">
          <Link to="/login" className="font-medium text-primary hover:underline">
            Back to Sign In
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
