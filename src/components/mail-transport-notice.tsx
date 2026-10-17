import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { MailTransportStatus } from "@/lib/records-types";

/**
 * Tells the operator when a publish will email nobody.
 *
 * The server sends to its bundled test inbox (Mailpit) until a real transport is configured, and
 * does so quietly: the publish reports its recipients, the records say "Captured locally", and no
 * employee has anything in their inbox. Shown above the Publish button and on Publish Records, and
 * nothing at all when email is really going out.
 */
export function MailTransportNotice({
  transport,
  className,
}: {
  transport: MailTransportStatus;
  className?: string;
}) {
  if (transport.delivers) return null;
  const capture = transport.kind === "capture";
  return (
    <Alert className={`border-accent/40 bg-accent/10 ${className ?? ""}`}>
      <AlertTriangle className="size-4 text-accent-foreground" />
      <AlertTitle>Employees will not receive the booking email</AlertTitle>
      <AlertDescription>
        {capture
          ? "This server sends email to its test inbox (Mailpit), not to real mailboxes. Publishing still opens bookings, but every message is only recorded as “Captured locally”."
          : "No email transport is configured on this server, so no booking email can go out."}{" "}
        Ask the system administrator to set Microsoft 365 (MS_*) or SMTP (SMTP_*) in the
        server&apos;s environment and redeploy. Email is going to: {transport.description}.
      </AlertDescription>
    </Alert>
  );
}
