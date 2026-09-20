import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { MailWarning } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ROLE_HOME } from "@/lib/auth-constants";
import type { InvitationPreview } from "@/lib/auth-types";
import { authService } from "@/services/auth-service";

export const Route = createFileRoute("/accept-invite")({
  validateSearch: (search: Record<string, unknown>): { token?: string } =>
    typeof search["token"] === "string" ? { token: search["token"] } : {},
  head: () => ({
    meta: [
      { title: "Accept invitation — Anwar Organic" },
      { name: "robots", content: "noindex" },
      // Keep the token out of Referer headers sent to fonts or other hosts.
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: AcceptInvitePage,
});

type Stage = InvitationPreview | { state: "loading" } | { state: "error"; message: string };

/**
 * The invitation link.
 *
 * Clicking it is the whole of accepting: the link is checked, the account is joined to the role it
 * names, and the person arrives on that role's dashboard signed in. Nothing is asked of them --
 * no name to confirm, no password to choose, no button to press -- because the link that reached
 * their mailbox is already the proof that this is them.
 *
 * It runs in the browser rather than in the route loader on purpose. Mail scanners and Outlook
 * Safe Links fetch a URL before anyone sees it, and accepting consumes the invitation; doing this
 * on the server would let a scanner spend the link and leave the real person told it was already
 * used. Scanners do not run JavaScript.
 */
function AcceptInvitePage() {
  const { token = "" } = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ state: "loading" });
  // React runs effects twice in development; accepting is single-use, so it happens once.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!token) {
      setStage({ state: "invalid", message: "This invitation link is incomplete." });
      return;
    }

    void (async () => {
      // Checked first so an expired or withdrawn link is explained rather than failing silently.
      const preview = await authService.previewInvitation(token);
      if (!preview.ok || !preview.data) {
        setStage({
          state: "error",
          message: preview.message ?? "We couldn't check this invitation.",
        });
        return;
      }
      if (preview.data.state !== "valid") {
        setStage(preview.data);
        return;
      }

      const accepted = await authService.acceptInvitation({ token });
      if (!accepted.ok || !accepted.data) {
        setStage({
          state: "error",
          message: accepted.message ?? "We couldn't accept this invitation.",
        });
        return;
      }

      // The session cookie is set; reload it, then go to the dashboard for the role granted.
      await router.invalidate();
      await navigate({ to: ROLE_HOME[accepted.data.profile.activeRole], replace: true });
    })();
  }, [token, navigate, router]);

  // "valid" is a moment in flight: the link checked out and accepting is under way.
  if (stage.state === "loading" || stage.state === "valid") {
    return (
      <AuthShell>
        <div className="text-center">
          <Skeleton className="mx-auto h-8 w-2/3" />
          <Skeleton className="mx-auto mt-3 h-4 w-1/2" />
        </div>
        <Skeleton className="mt-8 h-24 w-full" />
        <Skeleton className="mt-6 h-11 w-full" />
        <p className="mt-6 text-center text-sm text-muted-foreground">Setting up your account…</p>
      </AuthShell>
    );
  }

  const accepted = stage.state === "accepted";
  return (
    <AuthShell>
      <div className="text-center">
        <MailWarning className="mx-auto size-12 text-muted-foreground" />
        <h1 className="mt-4 font-display text-2xl font-bold">
          {accepted ? "Invitation already accepted" : "This invitation can't be used"}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">{stage.message}</p>
        <Button asChild className="mt-6 w-full" size="lg">
          <Link to="/login">Go to sign in</Link>
        </Button>
      </div>
    </AuthShell>
  );
}
