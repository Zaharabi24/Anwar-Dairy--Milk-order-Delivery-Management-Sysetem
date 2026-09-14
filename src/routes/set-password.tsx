import { createFileRoute } from "@tanstack/react-router";
import { SetPasswordPage } from "@/components/auth/SetPasswordPage";

export const Route = createFileRoute("/set-password")({
  validateSearch: (search: Record<string, unknown>): { token?: string } =>
    typeof search["token"] === "string" ? { token: search["token"] } : {},
  head: () => ({
    meta: [
      { title: "Set your password — Anwar Fresh" },
      { name: "robots", content: "noindex" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: function SetPasswordRoute() {
    const { token } = Route.useSearch();
    return <SetPasswordPage token={token ?? ""} />;
  },
});
