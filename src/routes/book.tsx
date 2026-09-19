import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import logoUrl from "@/assets/anwar-organic-logo.png";
import { Button } from "@/components/ui/button";
import { openBookingLinkFn } from "@/functions/auth.functions";

/**
 * The link mailed to every employee when a batch is published.
 *
 * It signs them in and sends them to the landing page, where the batch card and the booking
 * button are. The work happens in beforeLoad so the session cookie is set on the redirect itself
 * -- the landing page is then rendered for someone already signed in, with no flash of the
 * signed-out version.
 *
 * A link that has expired or been withdrawn is answered here rather than being bounced to the
 * sign-in form with no explanation.
 */
export const Route = createFileRoute("/book")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search["token"] === "string" ? search["token"] : "",
  }),
  loader: async ({ location }) => {
    const token = (location.search as { token?: string }).token ?? "";
    const result = await openBookingLinkFn({ data: { token } });
    if (result.ok) throw redirect({ to: "/" });
    return { reason: result.reason };
  },
  component: LinkProblem,
  head: () => ({
    meta: [{ title: "Booking link — Anwar Organic" }, { name: "robots", content: "noindex" }],
  }),
});

function LinkProblem() {
  const { reason } = Route.useLoaderData();
  const expired = reason === "expired";
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-16">
      <div className="w-full max-w-md text-center">
        <img
          src={logoUrl}
          alt="Anwar Organic"
          width={83}
          height={80}
          className="mx-auto h-16 w-auto"
        />
        <div className="mt-8 rounded-xl border border-border bg-card p-8">
          <h1 className="font-display text-xl font-bold">
            {expired ? "This booking link has expired" : "This booking link can't be used"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {expired
              ? "Booking links last two weeks. Sign in to see whether a batch is open today."
              : "The link may have been withdrawn, or the address may be incomplete. Sign in to see today's batch."}
          </p>
          <Button asChild className="mt-6 w-full">
            <Link to="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
