import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, MailCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { AuthHeading, AuthShell } from "@/components/auth/AuthShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldRow } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { registerEmployeeFn, registrationOptionsFn } from "@/functions/public.functions";
import { ALLOWED_EMAIL_DOMAIN } from "@/lib/auth-constants";
import { registrationInput, type RegistrationOptions } from "@/lib/registration.schemas";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Register as an employee — Anwar Organic" },
      {
        name: "description",
        content:
          "Add yourself to the Anwar Organic employee list, then sign in with your company email and Employee ID.",
      },
    ],
  }),
  loader: async (): Promise<{ options: RegistrationOptions }> => {
    try {
      return { options: await registrationOptionsFn() };
    } catch {
      return { options: { businessUnits: [], departments: [], designations: [], locations: [] } };
    }
  },
  component: RegisterPage,
});

type Field =
  | "employeeId"
  | "name"
  | "companyEmail"
  | "phone"
  | "department"
  | "designation"
  | "site"
  | "floorNo"
  | "businessUnitCode";

const EMPTY: Record<Field, string> = {
  employeeId: "",
  name: "",
  companyEmail: "",
  phone: "",
  department: "",
  designation: "",
  site: "",
  floorNo: "",
  businessUnitCode: "",
};

/**
 * Employees adding themselves to the Employee Database: the same fields as the System Admin's
 * Add employee form. The row stays inactive until the link mailed to the company address is
 * followed, which proves the address is theirs; then they are signed in and on the batch list.
 */
function RegisterPage() {
  const { options } = Route.useLoaderData();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  function set(key: Field, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    const checked = registrationInput.safeParse(form);
    if (!checked.success) {
      const next: Partial<Record<Field, string>> = {};
      for (const issue of checked.error.issues) next[issue.path[0] as Field] ??= issue.message;
      setErrors(next);
      setMessage("Please fix the highlighted fields.");
      return;
    }
    setSubmitting(true);
    try {
      const { email } = await registerEmployeeFn({ data: form });
      setSentTo(email);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "You couldn't be registered just now.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sentTo) {
    return (
      <AuthShell width="wide">
        <div className="text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MailCheck className="size-6" />
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold">Check your email</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            We sent a confirmation link to <strong className="text-foreground">{sentTo}</strong>.
            Open it to finish: you&apos;ll be signed in, and every new batch will be emailed to you.
            The link works for 48 hours.
          </p>
          <p className="mx-auto mt-4 max-w-md text-xs text-muted-foreground">
            Nothing arrived? Check your junk folder, or{" "}
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => setSentTo(null)}
            >
              send it again
            </button>
            .
          </p>
        </div>
        <Button asChild variant="outline" className="mt-6 w-full">
          <Link to="/">Back to home</Link>
        </Button>
      </AuthShell>
    );
  }

  const input = (key: Field, props: React.ComponentProps<typeof Input> = {}) => (
    <Input
      value={form[key]}
      onChange={(e) => set(key, e.target.value)}
      aria-invalid={errors[key] ? true : undefined}
      className={errors[key] ? "border-destructive" : ""}
      {...props}
    />
  );

  return (
    <AuthShell width="wide">
      <AuthHeading
        title="Register as an employee"
        description="Add yourself to the employee list. After you confirm your company email, sign in any time with your company email and Employee ID — no password."
      />

      {message ? (
        <Alert variant="destructive" className="mb-5">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      <form className="space-y-4" onSubmit={submit} noValidate>
        <FieldRow columns={2}>
          <Field label="Full name" htmlFor="reg-name" required error={errors.name}>
            {input("name", { id: "reg-name", autoComplete: "name" })}
          </Field>
          <Field
            label="Employee ID"
            htmlFor="reg-id"
            required
            error={errors.employeeId}
            hint="The ID on your staff record, e.g. 019258."
          >
            {input("employeeId", { id: "reg-id", placeholder: "019258" })}
          </Field>
        </FieldRow>
        <FieldRow columns={2}>
          <Field
            label="Company email"
            htmlFor="reg-email"
            required
            error={errors.companyEmail}
            hint="Your confirmation link and the batch emails go here."
          >
            {input("companyEmail", {
              id: "reg-email",
              type: "email",
              autoComplete: "email",
              placeholder: `name@${ALLOWED_EMAIL_DOMAIN}`,
            })}
          </Field>
          <Field label="Official phone number" htmlFor="reg-phone" required error={errors.phone}>
            {input("phone", { id: "reg-phone", type: "tel", autoComplete: "tel" })}
          </Field>
        </FieldRow>
        <FieldRow columns={2}>
          <Field label="Department" htmlFor="reg-dept" required error={errors.department}>
            {input("department", { id: "reg-dept", list: "reg-department-options" })}
          </Field>
          <Field label="Designation" htmlFor="reg-desig" error={errors.designation}>
            {input("designation", { id: "reg-desig", list: "reg-designation-options" })}
          </Field>
        </FieldRow>
        <FieldRow columns={2}>
          <Field label="Location" htmlFor="reg-site" required error={errors.site}>
            {input("site", { id: "reg-site", list: "reg-location-options" })}
          </Field>
          <Field label="Floor" htmlFor="reg-floor" error={errors.floorNo}>
            {input("floorNo", {
              id: "reg-floor",
              maxLength: 20,
              placeholder: "e.g. 3 or Ground (optional)",
            })}
          </Field>
        </FieldRow>
        <Field label="Business Unit" htmlFor="reg-unit" required error={errors.businessUnitCode}>
          <Select value={form.businessUnitCode} onValueChange={(v) => set("businessUnitCode", v)}>
            <SelectTrigger
              id="reg-unit"
              className={errors.businessUnitCode ? "border-destructive" : ""}
            >
              <SelectValue placeholder="Select business unit" />
            </SelectTrigger>
            <SelectContent>
              {options.businessUnits.map((b) => (
                <SelectItem key={b.code} value={b.code}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <datalist id="reg-department-options">
          {options.departments.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
        <datalist id="reg-designation-options">
          {options.designations.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
        <datalist id="reg-location-options">
          {options.locations.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>

        <Button type="submit" className="w-full" size="lg" disabled={submitting}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
          Register
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Already on the list?{" "}
          <Link to="/" className="font-medium text-primary hover:underline">
            Sign in from the home page
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
