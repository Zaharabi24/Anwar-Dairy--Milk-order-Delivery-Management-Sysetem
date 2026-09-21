import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { authService } from "@/services/auth-service";
import { ALLOWED_EMAIL_DOMAIN } from "@/lib/auth-constants";

/** Where to send the employee once they are in. */
export type LoginIntent = "book" | "batch";

const DESTINATION: Record<LoginIntent, string> = {
  book: "/app/order/new",
  batch: "/app/offer",
};

const HEADING: Record<LoginIntent, string> = {
  book: "Sign in to book your milk",
  batch: "Sign in to see today's batch",
};

/**
 * The employee sign-in, as a dialog on the landing page.
 *
 * Company email and Employee ID, checked against the Employee Database — the same list the batch
 * email goes to. There is no password to remember and no account to create, which is the point:
 * the two things asked for are already on everyone's desk.
 *
 * It opens over the page rather than navigating away, so the batch someone was looking at is
 * still behind them and they land back on what they were doing rather than on a dashboard.
 */
export function EmployeeLoginDialog({
  intent,
  onClose,
}: {
  /** Null when closed; the reason they were asked when open. */
  intent: LoginIntent | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await authService.signInFromDirectory({ companyEmail, employeeId });
    if (!result.ok) {
      setError(result.message ?? "We couldn't sign you in. Try again.");
      setBusy(false);
      return;
    }
    // The session cookie is set, so the router has to re-read who is signed in before the
    // destination is rendered -- otherwise the guard on /app bounces a signed-in person back.
    await router.invalidate();
    await router.navigate({ to: DESTINATION[intent ?? "book"] });
  }

  return (
    <Dialog
      open={intent !== null}
      onOpenChange={(open) => {
        if (open) return;
        setError(null);
        onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{HEADING[intent ?? "book"]}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Enter the company email and Employee ID you are listed under. No password, and nothing to
          set up — if you are on the employee list, that is all it takes.
        </p>

        <form className="space-y-4" onSubmit={submit} noValidate>
          <Field label="Company email" htmlFor="login-email" required>
            <Input
              id="login-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              placeholder={`name@${ALLOWED_EMAIL_DOMAIN}`}
              value={companyEmail}
              onChange={(e) => setCompanyEmail(e.target.value)}
            />
          </Field>

          <Field
            label="Employee ID"
            htmlFor="login-employee-id"
            required
            hint="The ID on your staff record, e.g. 019258."
          >
            <Input
              id="login-employee-id"
              inputMode="numeric"
              autoComplete="username"
              placeholder="019258"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            />
          </Field>

          {/* One message for either half being wrong, so a wrong guess can't be used to find out
              whose address is real. */}
          {error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !companyEmail.trim() || !employeeId.trim()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </DialogFooter>
        </form>

        <p className="text-xs text-muted-foreground">
          Not on the list? A System Admin can add you to the Employee Database. Staff accounts sign
          in from the link in the footer.
        </p>
      </DialogContent>
    </Dialog>
  );
}
