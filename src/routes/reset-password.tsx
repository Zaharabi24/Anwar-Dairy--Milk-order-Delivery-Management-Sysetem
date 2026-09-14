import { createFileRoute } from "@tanstack/react-router";
import { SetPasswordPage } from "@/components/auth/SetPasswordPage";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>): { token?: string } =>
    typeof search["token"] === "string" ? { token: search["token"] } : {},
  head: () => ({
    meta: [
      { title: "Reset your password — Anwar Fresh" },
      { name: "robots", content: "noindex" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: function ResetPasswordRoute() {
    const { token } = Route.useSearch();
    return <SetPasswordPage token={token ?? ""} />;
  },
});
