import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AuthHeading, AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { verifyRegistrationFn } from "@/functions/public.functions";
import type { VerifyRegistrationResult } from "@/lib/registration.schemas";

export const Route = createFileRoute("/verify-registration")({
  validateSearch: (search: Record<string, unknown>): { token: string } => ({
    token: typeof search["token"] === "string" ? search["token"] : "",
  }),
  head: () => ({ meta: [{ title: "Confirm your registration — Anwar Organic" }] }),
  component: VerifyRegistrationPage,
});

/**
 * Where the emailed confirmation link lands.
 *
 * The confirmation runs from the browser, not from a loader: mail scanners fetch links before a
 * person ever sees them, and one that confirmed on a plain page load would spend the link (and
 * open a session nobody asked for) before it was clicked.
 */
function VerifyRegistrationPage() {
  const { token } = Route.useSearch();
  const router = useRouter();
  const [result, setResult] = useState<VerifyRegistrationResult | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void verifyRegistrationFn({ data: { token } })
      .then(async (r) => {
        // A session was opened, so the router has to learn who is signed in before /app.
        if (r.status === "verified") await router.invalidate();
        setResult(r);
      })
      .catch(() => setResult({ status: "invalid" }));
  }, [token, router]);

  if (!result) {
    return (
      <AuthShell>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Confirming your registration…</p>
        </div>
      </AuthShell>
    );
  }

  if (result.status === "verified") {
    return (
      <AuthShell>
        <div className="text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckCircle2 className="size-6" />
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold">You&apos;re registered</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Welcome, {result.name}. You&apos;re signed in, and every new batch will be emailed to
            you. Next time, sign in with your company email and Employee ID.
          </p>
        </div>
        <Button asChild className="mt-6 w-full" size="lg">
          <Link to="/app/order/new">Book Milk</Link>
        </Button>
      </AuthShell>
    );
  }

  const text: Record<Exclude<VerifyRegistrationResult["status"], "verified">, string> = {
    already:
      "This link was already used, so your registration is confirmed. Sign in with your company email and Employee ID.",
    expired: "This link has expired. Register again and we'll send a new one.",
    invalid: "This link isn't valid. Register again, or ask a System Admin to add you.",
  };

  return (
    <AuthShell>
      <div className="mb-4 flex justify-center">
        <XCircle
          className={`size-10 ${result.status === "already" ? "text-primary" : "text-destructive"}`}
        />
      </div>
      <AuthHeading
        title={result.status === "already" ? "Already confirmed" : "Link not valid"}
        description={text[result.status]}
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild className="flex-1">
          <Link to="/">Sign in from the home page</Link>
        </Button>
        {result.status === "already" ? null : (
          <Button asChild variant="outline" className="flex-1">
            <Link to="/register">Register again</Link>
          </Button>
        )}
      </div>
    </AuthShell>
  );
}
