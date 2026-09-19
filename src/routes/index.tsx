import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, useInView, animate, useReducedMotion } from "framer-motion";
import logoUrl from "@/assets/anwar-organic-logo.png";
import { useEffect, useRef, useState } from "react";
import {
  Factory,
  Send,
  ShoppingBasket,
  Truck,
  PackageCheck,
  User,
  ClipboardList,
  Wallet,
  Settings2,
} from "lucide-react";
import { AccountMenu } from "@/components/auth/AccountMenu";
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

function Nav({ auth }: { auth: AuthUser | null }) {
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
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          <a href="#how-it-works" className="hover:text-foreground">
            How it works
          </a>
          <a href="#for-your-team" className="hover:text-foreground">
            For your team
          </a>
        </nav>
        <div className="flex items-center gap-2">
          {auth ? (
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
            <>
              <Button asChild size="sm" variant="outline">
                <Link to="/login">Sign In</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/signup">Sign Up</Link>
              </Button>
            </>
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

const roleCards = [
  {
    icon: User,
    title: "Employee",
    copy: "Book your litres before the cut-off and see your order code instantly.",
    wide: true,
  },
  {
    icon: Factory,
    title: "Factory Operator",
    copy: "Publish today's batch and watch it fill up live.",
  },
  {
    icon: ClipboardList,
    title: "Head Office Coordinator",
    copy: "Work one delivery list, grouped by pickup point.",
  },
  { icon: Wallet, title: "Finance", copy: "See who paid, how, and what's still outstanding." },
  { icon: Settings2, title: "System Admin", copy: "Manage people, pickup points and daily caps." },
];

function Capabilities() {
  const strip = [...roleCards, ...roleCards];
  return (
    <section
      id="for-your-team"
      className="scroll-mt-20 overflow-hidden border-y border-border bg-card py-12 sm:scroll-mt-0 sm:py-20"
    >
      <div className="mx-auto max-w-6xl px-5">
        <h2 className="max-w-xl text-3xl font-bold sm:text-4xl">Built for everyone in the chain</h2>
      </div>
      <div className="group mt-8 overflow-hidden sm:mt-10">
        <div className="marquee-track flex w-max gap-5 px-5 group-hover:[animation-play-state:paused]">
          {strip.map((c, i) => (
            <article
              key={i}
              // A 26rem card is wider than a phone, so the widths come down below sm.
              className={`shrink-0 rounded-xl border border-border bg-background p-5 sm:p-6 ${
                c.wide ? "w-[18rem] sm:w-[26rem]" : "w-[15rem] sm:w-[19rem]"
              }`}
            >
              <c.icon className={`text-primary ${c.wide ? "size-7" : "size-5"}`} />
              <h3 className={`mt-4 font-semibold ${c.wide ? "text-xl sm:text-2xl" : "text-lg"}`}>
                {c.title}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">{c.copy}</p>
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
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav auth={auth} />

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 md:grid-cols-[55fr_45fr] md:py-24">
        <div>
          <h1 className="text-4xl font-extrabold leading-[1.05] sm:text-6xl">
            Today's milk, booked in under a minute.
          </h1>
          <p className="mt-5 max-w-lg text-lg text-muted-foreground">
            Every production day the Savar dairy unit publishes one batch of fresh whole milk — you
            pick your litres before the cut-off and collect it at your usual point.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {auth ? (
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
                <Button asChild size="lg">
                  <a href="#how-it-works">See today's batch</a>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/login">Sign in</Link>
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
              Every production day the Savar dairy unit publishes one batch of fresh whole milk,
              booked by the Anwar Agro team and collected the same day.
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
            {auth ? (
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
                  <Link to="/login" className={FOOTER_LINK}>
                    Sign in
                  </Link>
                </li>
                <li>
                  <Link to="/signup" className={FOOTER_LINK}>
                    Sign up
                  </Link>
                </li>
                <li>
                  <Link to="/forgot-password" className={FOOTER_LINK}>
                    Forgot password
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
