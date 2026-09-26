import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, useInView, animate, useReducedMotion } from "framer-motion";
import logoUrl from "@/assets/anwar-organic-logo.png";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  BadgeCheck,
  Factory,
  Send,
  ShoppingBasket,
  Truck,
  PackageCheck,
} from "lucide-react";
import { AccountMenu } from "@/components/auth/AccountMenu";
import { EmployeeLoginDialog, type LoginIntent } from "@/components/auth/EmployeeLoginDialog";
import { LiveBatchCard } from "@/components/landing/LiveBatchCard";
import { publicBatchStatusFn } from "@/functions/public.functions";
import { Button } from "@/components/ui/button";
import { ALLOWED_EMAIL_DOMAIN, ROLE_HOME, ROLE_HOME_LABEL } from "@/lib/auth-constants";
import type { AuthUser } from "@/lib/auth-types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Anwar Organic — Daily farm milk for the Anwar Agro team" },
      {
        name: "description",
        content:
          "Book your litres from today's fresh milk batch before the cut-off, pick your delivery point, and collect the same day.",
      },
      { property: "og:title", content: "Anwar Organic — Daily farm milk for the Anwar Agro team" },
      {
        property: "og:description",
        content:
          "One daily batch, live stock, and a booking that takes under a minute. An Anwar Agro Farms system.",
      },
    ],
  }),
  loader: () => publicBatchStatusFn(),
  component: Landing,
});

function useCountUp(target: number, start: boolean, duration = 1.6) {
  const [value, setValue] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!start) return;
    if (reduce) {
      setValue(target);
      return;
    }
    const controls = animate(0, target, {
      duration,
      ease: "easeOut",
      onUpdate: (v) => setValue(v),
    });
    return () => controls.stop();
  }, [start, target, duration, reduce]);
  return value;
}

function Nav({ auth, onLogin }: { auth: AuthUser | null; onLogin: (i: LoginIntent) => void }) {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur">
      {/* The bar is sticky, so on a phone its full height is taken off every screen and sits over
          whatever scrolls past. It shrinks below sm and is unchanged from sm up. */}
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-5 sm:h-28">
        <img
          src={logoUrl}
          alt="Anwar Organic"
          className="h-12 w-auto sm:h-20"
          width={83}
          height={80}
        />
        <div className="flex items-center gap-2">
          {auth?.withoutAccount ? (
            // Arrived from the link mailed when the batch was published. They have no account and
            // need none: the link is their authorisation, and booking is the single thing they
            // came to do. Sign In, Sign Up and the account menu are all beside the point for
            // someone with nothing to sign in to, so the bar carries the one button that matters.
            <Button asChild size="sm">
              <Link to="/app/order/new">Book Milk</Link>
            </Button>
          ) : auth ? (
            // Signed in: the logo brought them here, so offer the way back into their own
            // workspace, with the account menu beside it for Profile, security and signing out.
            // Sign In and Sign Up would both be wrong for someone who already has a session, and
            // were what made a logo click look like a sign-out.
            <>
              <Button asChild size="sm">
                <Link to={ROLE_HOME[auth.activeRole]}>{ROLE_HOME_LABEL[auth.activeRole]}</Link>
              </Button>
              <AccountMenu />
            </>
          ) : (
            // Nobody signed in. Employees have no account and no password: they sign in by
            // matching the employee list, which the dialog asks for without leaving the page.
            <Button size="sm" onClick={() => onLogin("book")}>
              Login
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

function BatchWidget() {
  const initial = Route.useLoaderData();
  const [batch, setBatch] = useState(initial);

  // The batch is live, so it is re-read while the page is open: an approved order taking litres
  // out of the batch should show here without a refresh.
  useEffect(() => {
    setBatch(initial);
    const id = setInterval(() => {
      void publicBatchStatusFn()
        .then(setBatch)
        .catch(() => {
          // A dropped poll is not worth showing anyone; the next one will do.
        });
    }, 30_000);
    return () => clearInterval(id);
  }, [initial]);

  return <LiveBatchCard batch={batch} />;
}

const stages = [
  {
    icon: Factory,
    title: "Factory",
    copy: "The dairy unit records what was produced this morning.",
  },
  {
    icon: Send,
    title: "Publish",
    copy: "The operator sets litres, rate and cut-off, then sends it out.",
  },
  {
    icon: ShoppingBasket,
    title: "Book",
    copy: "Employees pick a quantity; stock drops the moment they confirm.",
  },
  { icon: Truck, title: "Deliver", copy: "Orders are packed and grouped by delivery point." },
  {
    icon: PackageCheck,
    title: "Collect",
    copy: "Collection is marked and the day is reconciled at close.",
  },
];

function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const reduce = useReducedMotion();

  return (
    <section
      id="how-it-works"
      ref={ref}
      className="mx-auto max-w-6xl scroll-mt-20 px-5 py-12 sm:scroll-mt-0 sm:py-20"
    >
      <h2 className="max-w-xl text-3xl font-bold sm:text-4xl">One batch a day, start to finish</h2>
      <div className="relative mt-8 sm:mt-14">
        <div className="absolute left-0 right-0 top-6 hidden h-px bg-border md:block" />
        <motion.div
          className="absolute top-[1.15rem] hidden size-3 rounded-full bg-accent md:block"
          initial={{ left: "0%" }}
          animate={inView ? { left: "97%" } : {}}
          transition={{ duration: reduce ? 0 : 3.2, ease: "easeInOut" }}
        />
        <ol className="grid gap-3 sm:gap-8 md:grid-cols-5">
          {stages.map((s, i) => (
            <motion.li
              key={s.title}
              // Below sm each step is a card, so five steps read as five things rather than
              // fifteen stacked blocks. From sm up the card styling is removed entirely.
              className="rounded-xl border border-border bg-card p-4 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0"
              initial={{ opacity: 0, y: 12 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: reduce ? 0 : i * 0.6, duration: 0.4 }}
            >
              <div className="flex items-center gap-3 sm:block">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-background text-primary sm:size-12 sm:bg-card">
                  <s.icon className="size-5" />
                </div>
                <h3 className="text-base font-semibold sm:mt-4 sm:text-lg">{s.title}</h3>
              </div>
              <p className="mt-2 text-sm text-muted-foreground sm:mt-1">{s.copy}</p>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const reasonCards = [
  {
    icon: ShoppingBasket,
    title: "Order Online Easily",
    copy: "Book your litres from the link in your email, before the cut-off. Nothing to sign up for.",
  },
  {
    icon: Activity,
    title: "Real-Time Order Updates",
    copy: "Watch the litres remaining fall as the batch fills, and your order change the moment it is confirmed.",
  },
  {
    icon: BadgeCheck,
    title: "Digital Order Confirmation",
    copy: "Your order number and collection point, on your phone. Nothing to print or carry.",
  },
];

function Capabilities() {
  // The track slides by exactly half its width, so the strip has to be two identical halves or
  // the loop jumps. A half has to be at least as wide as the screen too, or it runs out mid-view
  // and leaves a gap at the seam -- which the old four-card strip did, at 1388px, on any ordinary
  // laptop. Three equal 19rem cards come to 966px, so the half repeats them three times and
  // covers 2916px. The animation is timed against that width, so the cards move at the speed they
  // always did rather than at whatever the new distance would have made it.
  const half = [...reasonCards, ...reasonCards, ...reasonCards];
  const strip = [...half, ...half];
  return (
    <section
      id="for-your-team"
      className="scroll-mt-20 overflow-hidden border-y border-border bg-card py-12 sm:scroll-mt-0 sm:py-20"
    >
      <div className="mx-auto max-w-6xl px-5">
        <h2 className="max-w-xl text-3xl font-bold sm:text-4xl">Why Order with Anwar Organic?</h2>
      </div>
      <div className="group mt-8 overflow-hidden sm:mt-10">
        <div className="marquee-track flex w-max gap-5 px-5 group-hover:[animation-play-state:paused]">
          {strip.map((c, i) => (
            // One card, three times over. The first used to be singled out as the wide one --
            // a 26rem box with a larger icon and a heading two steps up -- which read as a
            // difference in importance where there is none: three reasons of equal weight. Now
            // every card is the same width, icon, heading and body, so the eye can compare them
            // instead of ranking them. A 19rem card is wider than a phone, so it comes down
            // below sm.
            <article
              key={i}
              className="flex w-[15rem] shrink-0 flex-col rounded-xl border border-border bg-background p-5 sm:w-[19rem] sm:p-6"
            >
              <c.icon className="size-6 text-primary" aria-hidden="true" />
              <h3 className="mt-4 text-lg font-semibold leading-snug">{c.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.copy}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Stat({
  value,
  suffix,
  prefix,
  label,
}: {
  value: number;
  suffix?: string;
  prefix?: string;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const v = useCountUp(value, inView);
  return (
    <div ref={ref}>
      <p className="font-display text-3xl font-extrabold sm:text-4xl">
        {prefix}
        {Math.round(v)}
        {suffix}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function Landing() {
  const { auth } = Route.useRouteContext();
  const [loginIntent, setLoginIntent] = useState<LoginIntent | null>(null);
  const onLogin = setLoginIntent;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav auth={auth} onLogin={onLogin} />

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 md:grid-cols-[55fr_45fr] md:py-24">
        <div>
          <h1 className="text-4xl font-extrabold leading-[1.05] sm:text-6xl">
            Today's milk, booked in under a minute.
          </h1>
          {/* Two sentences rather than one, so it reads at max-w-xl: at the narrower measure the
              heading used it would fall to six short lines and stop being a standfirst. */}
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
            With Anwar Organic, the journey begins at our own Gazaria dairy facility. From the care
            of our cows and management of their feed to hygienic milking and careful handling, we
            focus on the fundamentals that matter when producing fresh milk.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {auth?.withoutAccount ? (
              // Booking is the point of the visit, so it leads; the batch is still one click away
              // for anyone who wants to look before they order.
              <>
                <Button asChild size="lg">
                  <Link to="/app/order/new">Book Milk</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <a href="#how-it-works">See today's batch</a>
                </Button>
              </>
            ) : auth ? (
              <>
                <Button asChild size="lg">
                  <Link to={ROLE_HOME[auth.activeRole]}>{ROLE_HOME_LABEL[auth.activeRole]}</Link>
                </Button>
                {auth.roles.includes("employee") ? (
                  <Button asChild size="lg" variant="outline">
                    <Link to="/app/my-orders">My orders</Link>
                  </Button>
                ) : (
                  <Button asChild size="lg" variant="outline">
                    <a href="#how-it-works">How it works</a>
                  </Button>
                )}
              </>
            ) : (
              <>
                {/* Both lead into the app, so both ask who is asking. The dialog opens over the
                    page and takes them on to what they clicked, rather than sending them off to
                    a sign-in page and back. */}
                <Button size="lg" onClick={() => onLogin("book")}>
                  Book Milk
                </Button>
                <Button size="lg" variant="outline" onClick={() => onLogin("batch")}>
                  See today&apos;s batch
                </Button>
              </>
            )}
          </div>
        </div>
        <BatchWidget />
      </section>

      <HowItWorks />
      <Capabilities />

      {/* Two per row on a phone: one stat per row left four tall, near-empty bands. */}
      <section className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-8 px-5 py-12 sm:grid-cols-2 sm:gap-10 sm:py-20 lg:grid-cols-4">
        <Stat value={60} prefix="<" suffix="s" label="Average booking time" />
        <Stat value={0} label="Overbooking incidents" />
        <Stat value={100} suffix="%" label="Of changes audited" />
        <Stat value={1} label="Batch, fully reconciled daily" />
      </section>

      <SiteFooter auth={auth} />

      <EmployeeLoginDialog intent={loginIntent} onClose={() => setLoginIntent(null)} />
    </div>
  );
}

/**
 * The site footer. The link columns point only at pages that exist, and the account column follows
 * the session the way the header does -- offering Sign in to someone who already has one is what
 * made a logo click look like a sign-out. Everything that isn't a link is something the system can
 * vouch for, such as the company domain, rather than contact details we don't hold on record.
 */
function SiteFooter({ auth }: { auth: AuthUser | null }) {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:py-14">
        {/* Below sm the two short link columns sit side by side; the brand and the wordier
            Access column span both. One column per block made the footer a long, empty scroll. */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-2 sm:gap-10 md:grid-cols-[1.6fr_1fr_1fr_1.2fr]">
          <div className="col-span-2 sm:col-span-1">
            <img src={logoUrl} alt="Anwar Organic" className="h-16 w-auto" width={66} height={64} />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              {/* The tagline takes a line of its own, which is how it was written. Same size and
                  colour as the sentence under it -- the break is the only distinction, because
                  emphasis was not asked for. */}
              <span className="block">Fresh From Our Farm. Whole By Nature.</span>
              Fresh Whole Milk produced at our Gazaria dairy facility with attention to cow care,
              feed quality, farm hygiene and careful handling.
            </p>
            <p className="mt-5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              An Anwar Agro Farms system
            </p>
          </div>

          <FooterNav title="Platform">
            <li>
              <a href="#how-it-works" className={FOOTER_LINK}>
                How it works
              </a>
            </li>
            <li>
              <a href="#for-your-team" className={FOOTER_LINK}>
                For your team
              </a>
            </li>
          </FooterNav>

          <FooterNav title="Your account">
            {auth?.withoutAccount ? (
              // No account to link to, so the column offers the two things the link does allow.
              <>
                <li>
                  <Link to="/app/order/new" className={FOOTER_LINK}>
                    Book Milk
                  </Link>
                </li>
                <li>
                  <Link to="/app/my-orders" className={FOOTER_LINK}>
                    My orders
                  </Link>
                </li>
              </>
            ) : auth ? (
              <>
                <li>
                  <Link to={ROLE_HOME[auth.activeRole]} className={FOOTER_LINK}>
                    {ROLE_HOME_LABEL[auth.activeRole]}
                  </Link>
                </li>
                {auth.roles.includes("employee") ? (
                  <li>
                    <Link to="/app/my-orders" className={FOOTER_LINK}>
                      My orders
                    </Link>
                  </li>
                ) : null}
                <li>
                  <Link to="/app/profile" className={FOOTER_LINK}>
                    Profile
                  </Link>
                </li>
              </>
            ) : (
              <>
                <li>
                  <Link to="/book" search={{ token: "" }} className={FOOTER_LINK}>
                    Book Milk
                  </Link>
                </li>
                {/* The one door left, and it is deliberately quiet. Employees have no account to
                    sign in to, but the operators, coordinators and admins who run the platform
                    do, and taking away the only link they can see would leave them typing the
                    address from memory. */}
                <li>
                  <Link to="/login" className={FOOTER_LINK}>
                    Staff sign in
                  </Link>
                </li>
              </>
            )}
          </FooterNav>

          <FooterNav title="Access" className="col-span-2 sm:col-span-1">
            <li className="text-muted-foreground">
              Company accounts only, at{" "}
              <span className="font-medium text-foreground">@{ALLOWED_EMAIL_DOMAIN}</span>
            </li>
            <li className="text-muted-foreground">
              Bookings close at the cut-off shown on each batch.
            </li>
          </FooterNav>
        </div>

        <div className="mt-10 flex flex-col-reverse items-center gap-3 border-t border-border pt-6 text-center text-sm text-muted-foreground sm:mt-12 sm:flex-row sm:justify-between sm:text-left">
          <p>© {new Date().getFullYear()} Anwar Group of Industries. All rights reserved.</p>
          <p>Anwar Agro Farms</p>
        </div>
      </div>
    </footer>
  );
}

const FOOTER_LINK = "text-muted-foreground transition-colors hover:text-foreground";

function FooterNav({
  title,
  className = "",
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <ul className="mt-4 space-y-3 text-sm">{children}</ul>
    </div>
  );
}
