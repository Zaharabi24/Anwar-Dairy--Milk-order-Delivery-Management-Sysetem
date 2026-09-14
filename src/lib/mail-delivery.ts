import type { MailDelivery } from "./auth-types";

export interface DeliveryNotice {
  tone: "success" | "warning" | "error";
  text: string;
}

/** One wording for every screen that sends email, so "sent" is only ever claimed when it's true. */
export function deliveryNotice(
  delivery: MailDelivery | undefined,
  what: string,
  to: string,
  error?: string,
): DeliveryNotice {
  switch (delivery) {
    case "sent":
      return { tone: "success", text: `${what} was sent to ${to}.` };
    case "captured":
      return {
        tone: "warning",
        text: `${what} was caught by the local test inbox (Mailpit) and not delivered to ${to}. Configure SMTP or Microsoft 365 to send real email.`,
      };
    case "logged":
      return {
        tone: "warning",
        text: `Email isn't configured on this server, so ${what.toLowerCase()} wasn't sent to ${to}.`,
      };
    default:
      return {
        tone: "error",
        text: `${what} couldn't be emailed to ${to}${error ? `: ${error}` : "."}`,
      };
  }
}
