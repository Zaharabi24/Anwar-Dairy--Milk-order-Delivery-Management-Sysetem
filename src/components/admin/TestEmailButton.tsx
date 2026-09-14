import { Loader2, Mail } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deliveryNotice } from "@/lib/mail-delivery";
import { authService } from "@/services/auth-service";

/** Sends a test email to the signed-in admin and reports honestly what happened to it. */
export function TestEmailButton() {
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    const result = await authService.sendTestEmail();
    setBusy(false);
    if (!result.ok || !result.data) {
      toast.error(result.message ?? "Couldn't run the email test.");
      return;
    }
    const { delivery, to, transport, error } = result.data;
    const notice = deliveryNotice(delivery, "The test email", to, error);
    const show =
      notice.tone === "success"
        ? toast.success
        : notice.tone === "warning"
          ? toast.warning
          : toast.error;
    show(notice.text, { description: `Transport: ${transport}`, duration: 12_000 });
  }

  return (
    <Button variant="outline" onClick={() => void send()} disabled={busy}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
      Send test email
    </Button>
  );
}
