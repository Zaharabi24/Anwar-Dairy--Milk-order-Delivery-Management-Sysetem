import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import logoUrl from "@/assets/anwar-organic-logo.png";
import { Button } from "@/components/ui/button";
import { openBookingLinkFn } from "@/functions/auth.functions";

/**
 * The link mailed to everyone in the Employee Database when a batch is published.
 *
 * It opens a booking session and sends them to the landing page, where the batch card and the
 * Book Milk button are. The work happens in the loader so the session cookie is set on the
 * redirect itself -- the landing page is then rendered for someone already recognised, with no
 * flash of the signed-out version.
 *
 * A link that has expired or been withdrawn is answered here rather than being bounced to a
 * sign-in form the person has no account for.
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
            {expired ? "Bookings for this batch have closed" : "This booking link can't be used"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {expired
              ? "A booking link works until the batch's booking close time, and that time has passed. The next batch comes with a fresh link."
              : "The link may have been withdrawn, or the address may be incomplete. Your next batch email will carry a new one."}
          </p>
          <Button asChild className="mt-6 w-full">
            <Link to="/">Back to Anwar Organic</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
