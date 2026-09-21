import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import logoUrl from "@/assets/anwar-organic-logo.png";
import { Button } from "@/components/ui/button";
import { openBookingLinkFn } from "@/functions/auth.functions";

/**
 * The link mailed to everyone in the Employee Database when a batch is published.
 *
 * It opens a booking session and sends them to Today's Offer, where the batch and the Book Milk
 * button are. The work happens in the loader so the session cookie is set on the redirect itself
 * -- the offer is then rendered for someone already recognised, with no flash of a signed-out
 * page and no sign-in step anywhere in between.
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
    // No token at all means somebody followed Book Milk from the landing page rather than from
    // their email. That is not a broken link, it is a person who doesn't know where the link
    // lives -- so they are told, instead of being shown an error about a link they never had.
    if (!token) return { reason: "no-link" as const };
    const result = await openBookingLinkFn({ data: { token } });
    // Straight to Today's Offer. The link is already theirs -- it opened a session for one
    // person -- so the offer, and the booking that follows it, are their own without anything
    // being carried in the address.
    if (result.ok) throw redirect({ to: "/app/offer" });
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
  const noLink = reason === "no-link";
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
            {noLink
              ? "Booking opens from your email"
              : expired
                ? "Bookings for this batch have closed"
                : "This booking link can't be used"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {noLink
              ? "Every time a batch is published we email everyone in the Employee Database a Book Milk link. Open that link and you can order straight away — there is no account to create and nothing to sign in to."
              : expired
                ? "A booking link works until the batch's booking close time, and that time has passed. The next batch comes with a fresh link."
                : "The link may have been withdrawn, or the address may be incomplete. Your next batch email will carry a new one."}
          </p>
          {noLink ? (
            <p className="mt-3 text-xs text-muted-foreground">
              No email yet? A System Admin can check you are listed and active in the Employee
              Database.
            </p>
          ) : null}
          <Button asChild className="mt-6 w-full">
            <Link to="/">Back to Anwar Organic</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
