import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, useInView, animate, useReducedMotion } from "framer-motion";
import logoUrl from "@/assets/anwar-organic-logo.png";
import farmImageUrl from "@/assets/Farm Image.png";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  Factory,
  HeartPulse,
  Leaf,
  Milk,
  PackageCheck,
  Send,
  ShieldCheck,
  ShoppingBasket,
  Tractor,
  Truck,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import { AccountMenu } from "@/components/auth/AccountMenu";
import { EmployeeLoginDialog, type LoginIntent } from "@/components/auth/EmployeeLoginDialog";
import { LiveBatchCard } from "@/components/landing/LiveBatchCard";
import { publicBatchStatusFn } from "@/functions/public.functions";
import { Button } from "@/components/ui/button";
import { ROLE_HOME, ROLE_HOME_LABEL } from "@/lib/auth-constants";
import type { AuthUser } from "@/lib/auth-types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Anwar Organic | Fresh Whole Milk" },
      {
        name: "description",
        content:
          "Fresh Whole Milk from Anwar Organic Dairy Farm, Gazaria. Reserve your litres from today's fresh batch in under a minute.",
      },
      { property: "og:title", content: "Anwar Organic | Fresh Whole Milk" },
      {
        property: "og:description",
        content:
          "Fresh Whole Milk from Anwar Organic Dairy Farm, Gazaria. An Anwar Group Initiative.",
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
          whatever scrolls past, so it is kept slim, and slimmer still below sm. */}
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:h-20">
        <img
          src={logoUrl}
          alt="Anwar Organic"
          className="h-11 w-auto sm:h-14"
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

type Stage = { icon: LucideIcon; title: string; copy: string };

// How the system runs a day's batch, from the dairy unit to collection.
const systemStages: Stage[] = [
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

// How the milk itself is produced at the farm.
const farmStages: Stage[] = [
  { icon: HeartPulse, title: "Cow Care", copy: "Good milk starts with good care." },
  { icon: Wheat, title: "Nutrition", copy: "Quality focused feed management." },
  { icon: Milk, title: "Milking", copy: "Hygienic milk collection process." },
  { icon: Leaf, title: "Freshness", copy: "Maintaining natural milk quality." },
  { icon: Truck, title: "Delivery", copy: "Fresh batch reaches you." },
];

// Seconds the timeline takes to travel from one farm stage to the next.
const FARM_STEP = 0.5;

/**
 * From farm to home, as a timeline: numbered markers joined by a line that fills in, stage by
 * stage, once the section scrolls into view, with each stage's card lighting up as the line
 * reaches it. Across the page from md up; down the left edge on a phone.
 */
function FarmJourney() {
  const ref = useRef<HTMLOListElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  const reduce = useReducedMotion();
  const delay = (i: number) => (reduce ? 0 : i * FARM_STEP);
  const last = farmStages.length - 1;

  return (
    <section
      id="farm-to-home"
      className="scroll-mt-20 border-y border-border bg-secondary/60 sm:scroll-mt-0"
    >
      <div className="mx-auto max-w-6xl px-5 py-12 sm:py-20">
        <SectionHeading
          eyebrow="At the farm"
          title="From Farm To Your Home"
          lead="From the herd at Anwar Organic Dairy Farm, Gazaria, to your delivery point, every step is handled with care."
        />
        <ol ref={ref} className="mt-10 grid md:mt-14 md:grid-cols-5 md:gap-6">
          {farmStages.map((s, i) => (
            <li
              key={s.title}
              className="relative grid grid-cols-[2.5rem_1fr] gap-4 pb-5 last:pb-0 md:flex md:flex-col md:gap-0 md:pb-0"
            >
              {i < last ? (
                // The connector to the next stage: a grey track, and a green fill drawn over it
                // once the stage before it has lit. Down from the marker on a phone, across to
                // the next marker (a column plus the gap) from md up.
                <>
                  <span
                    aria-hidden="true"
                    className="absolute bottom-0 left-5 top-10 w-0.5 -translate-x-1/2 bg-border md:bottom-auto md:left-1/2 md:top-5 md:h-0.5 md:w-[calc(100%+1.5rem)] md:-translate-y-1/2 md:translate-x-0"
                  />
                  <span
                    aria-hidden="true"
                    className={`absolute bottom-0 left-5 top-10 w-0.5 -translate-x-1/2 origin-top bg-primary transition-[scale] ease-linear md:bottom-auto md:left-1/2 md:top-5 md:h-0.5 md:w-[calc(100%+1.5rem)] md:origin-left md:-translate-y-1/2 md:translate-x-0 ${
                      inView ? "scale-100" : "scale-y-0 md:scale-x-0 md:scale-y-100"
                    }`}
                    style={{
                      transitionDuration: `${reduce ? 0 : FARM_STEP}s`,
                      transitionDelay: `${delay(i)}s`,
                    }}
                  />
                </>
              ) : null}

              <span
                className={`relative z-10 flex size-10 items-center justify-center rounded-full border-2 text-sm font-bold tabular-nums ring-4 ring-secondary transition-colors duration-300 md:mx-auto ${
                  inView
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground"
                }`}
                style={{ transitionDelay: `${delay(i)}s` }}
              >
                {i + 1}
              </span>

              <motion.div
                className="group rounded-2xl border border-border bg-card p-5 shadow-sm transition-[translate,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-md md:mt-6 md:flex-1 md:text-center"
                initial={{ opacity: 0, y: 12 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: delay(i), duration: 0.4 }}
              >
                {/* Icon beside the title on a phone, above it from md up. */}
                <div className="flex items-center gap-3 md:block">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors duration-300 group-hover:bg-primary group-hover:text-primary-foreground md:mx-auto">
                    <s.icon className="size-5" aria-hidden="true" />
                  </div>
                  <h3 className="text-lg font-semibold md:mt-4">{s.title}</h3>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.copy}</p>
              </motion.div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// The "How it works" steps: a row of icons along a line a dot travels down.
function StepsSection({
  id,
  eyebrow,
  title,
  stages,
}: {
  id: string;
  eyebrow: string;
  title: string;
  stages: Stage[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const reduce = useReducedMotion();

  return (
    <section id={id} ref={ref} className="scroll-mt-20 sm:scroll-mt-0">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:py-20">
        <SectionHeading eyebrow={eyebrow} title={title} />
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
                  <div className="relative flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-background text-primary shadow-sm ring-4 ring-primary/5 transition-transform duration-300 hover:-translate-y-1 hover:shadow-md sm:size-12 sm:bg-card">
                    <s.icon className="size-5" />
                    {/* The step number rides on the icon, as the HTML page numbers its steps. */}
                    <span className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                      {i + 1}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold sm:mt-4 sm:text-lg">{s.title}</h3>
                </div>
                <p className="mt-2 text-sm text-muted-foreground sm:mt-1">{s.copy}</p>
              </motion.li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

// A small label over each section heading, so the page reads as a set of chapters.
/**
 * The way in for people outside the organisation's system: no company email, no Employee ID, so
 * no account and no emailed link. The order form they reach asks for their own details instead.
 */
function ExternalOrderSection() {
  return (
    <section id="external-order" className="scroll-mt-20 sm:scroll-mt-0">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:py-20">
        <div className="flex flex-col gap-6 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-10 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Don&apos;t have an organization email or Employee ID?
            </p>
            <h2 className="mt-2 text-3xl font-bold sm:text-4xl">Non-Management Order</h2>
            <p className="mt-3 text-lg leading-relaxed text-muted-foreground">
              For customers who are not part of the organization system, use the external order
              option below.
            </p>
          </div>
          <Button asChild size="lg" className="shrink-0">
            <Link to="/guest-order">Order Now</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  lead,
}: {
  eyebrow: string;
  title: string;
  lead?: string;
}) {
  return (
    <div className="max-w-xl">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-bold sm:text-4xl">{title}</h2>
      {lead ? <p className="mt-3 text-lg leading-relaxed text-muted-foreground">{lead}</p> : null}
    </div>
  );
}

const trustCards = [
  {
    icon: Tractor,
    title: "From Our Farm",
    copy: "Fresh Whole Milk produced at Anwar Organic Dairy Farm, Gazaria.",
  },
  {
    icon: Milk,
    title: "Fresh Whole Milk",
    copy: "Fresh whole milk collected from our dairy farm while maintaining natural freshness and quality.",
  },
  {
    icon: HeartPulse,
    title: "Healthy Cow Care",
    copy: "Responsible care practices for our dairy cows.",
  },
  {
    icon: ShieldCheck,
    title: "Quality Handling",
    copy: "Careful hygiene practices from milking to delivery.",
  },
];

function Capabilities() {
  // The track slides by exactly half its width, so the strip has to be two identical halves or
  // the loop jumps, and a half has to be at least as wide as the screen or it leaves a gap at the
  // seam. Four equal 19rem cards repeated twice make a half of eight cards (162rem, 2592px).
  // The stylesheet times the animation for a 182.25rem half, so the duration is shortened here in
  // proportion (88s x 162/182.25 = 78s) to keep the cards moving at the same speed as before.
  const half = [...trustCards, ...trustCards];
  const strip = [...half, ...half];
  return (
    <section
      id="for-your-team"
      className="scroll-mt-20 overflow-hidden border-y border-border bg-card py-12 sm:scroll-mt-0 sm:py-20"
    >
      <div className="mx-auto max-w-6xl px-5">
        <SectionHeading
          eyebrow="Our promise"
          title="Milk You Can Trust Starts At The Farm"
          lead="Freshness begins long before milk reaches your home."
        />
      </div>
      {/* The strip fades in and out at the edges instead of being cut off by the screen. */}
      <div
        className="group mt-8 overflow-hidden sm:mt-10"
        style={{
          maskImage: "linear-gradient(to right, transparent, black 6%, black 94%, transparent)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent, black 6%, black 94%, transparent)",
        }}
      >
        <div
          className="marquee-track flex w-max gap-5 px-5 group-hover:[animation-play-state:paused]"
          style={{ animationDuration: "78s" }}
        >
          {strip.map((c, i) => (
            // Every card is the same width, icon, heading and body, so the four read as equals.
            // A 19rem card is wider than a phone, so it comes down below sm.
            <article
              key={i}
              className="flex w-[15rem] shrink-0 flex-col rounded-xl border border-border bg-background p-5 transition-shadow duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg sm:w-[19rem] sm:p-6"
            >
              <span className="flex size-11 items-center justify-center rounded-full bg-secondary text-primary">
                <c.icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-lg font-semibold leading-snug">{c.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.copy}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/** The farm itself: a few words on the left, photographs of the sheds and the herd on the right. */
function FarmShowcase() {
  return (
    <section id="our-farm" className="scroll-mt-20 sm:scroll-mt-0">
      <div className="mx-auto grid max-w-6xl items-center gap-8 px-5 py-12 sm:py-20 md:grid-cols-2 md:gap-14">
        <SectionHeading
          eyebrow="Our farm"
          title="Inside Anwar Organic Dairy Farm"
          lead="Located in Gazaria, Anwar Organic Dairy Farm represents our commitment towards responsible farming, careful milk handling and delivering fresh whole milk to families."
        />
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
          <img
            src={farmImageUrl}
            alt="Anwar Organic Dairy Farm, Gazaria: the cow sheds, a cow with her calf, and cows resting on their mats"
            className="h-auto w-full transition-transform duration-700 hover:scale-[1.03]"
            width={1448}
            height={1086}
            loading="lazy"
            decoding="async"
          />
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
  value: number | string;
  suffix?: string;
  prefix?: string;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  // Numbers count up; words (a place, a promise) are shown as they are.
  const isNumber = typeof value === "number";
  const v = useCountUp(isNumber ? value : 0, inView && isNumber);
  return (
    <div ref={ref}>
      <p className="font-display text-3xl font-extrabold sm:text-4xl">
        {isNumber ? (
          <>
            {prefix}
            {Math.round(v)}
            {suffix}
          </>
        ) : (
          value
        )}
      </p>
      <p className="mt-2 text-sm opacity-80">{label}</p>
    </div>
  );
}

const heroTags = ["Fresh Daily Batch", "Fresh Whole Milk", "Unpasteurized"];

function Landing() {
  const { auth } = Route.useRouteContext();
  const [loginIntent, setLoginIntent] = useState<LoginIntent | null>(null);
  const onLogin = setLoginIntent;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav auth={auth} onLogin={onLogin} />

      <div className="relative overflow-hidden bg-gradient-to-b from-secondary/70 via-background to-background md:flex md:min-h-[calc(100svh-5rem)] md:items-center">
        {/* Soft washes of the brand colours drift behind the hero, and show through the frosted
            batch card, so it is not a flat page. */}
        <div
          aria-hidden="true"
          className="hero-blob pointer-events-none absolute -left-32 -top-32 size-[30rem] rounded-full bg-primary/15 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="hero-blob pointer-events-none absolute -bottom-40 right-0 size-[28rem] rounded-full bg-accent/25 blur-3xl [animation-delay:-6s]"
        />
        <div
          aria-hidden="true"
          className="hero-blob pointer-events-none absolute right-1/4 top-10 size-72 rounded-full bg-primary/10 blur-3xl [animation-delay:-11s] [animation-duration:22s]"
        />
        <section className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-5 py-10 md:grid-cols-[50fr_50fr] md:py-8 short:py-3 lg:grid-cols-[46fr_54fr]">
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-primary shadow-sm">
              <Leaf className="size-3.5" aria-hidden="true" />
              An Anwar Group Initiative
            </p>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] sm:text-6xl short:mt-3 short:text-5xl">
              Today&apos;s Milk, <br className="hidden sm:block" />
              <span className="bg-gradient-to-r from-primary to-primary-deep bg-clip-text text-transparent">
                Booked in Under a Minute.
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-lg short:mt-3 short:text-base leading-relaxed text-muted-foreground">
              Fresh Whole Milk from{" "}
              <strong className="font-semibold">Anwar Organic Dairy Farm, Gazaria</strong> — where
              responsible cow care, quality nutrition and careful farm practices come together.
            </p>
            <ul className="mt-6 flex flex-wrap gap-2 short:mt-4">
              {heroTags.map((t) => (
                <li
                  key={t}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/80 px-4 py-1.5 text-sm short:py-1 font-semibold shadow-sm backdrop-blur transition-transform duration-300 hover:-translate-y-0.5"
                >
                  <Check className="size-3.5 text-primary" aria-hidden="true" />
                  {t}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3 short:mt-5">
              {auth?.withoutAccount ? (
                // Booking is the point of the visit, so it leads; the batch is still one click away
                // for anyone who wants to look before they order.
                <>
                  <Button asChild size="lg">
                    <Link to="/app/order/new">Book Milk</Link>
                  </Button>
                  <Button asChild size="lg" variant="outline">
                    <a href="#how-it-works">See today&apos;s batch</a>
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
          {/* Top-aligned with the headline rather than centred: the offset is the height of the
              "An Anwar Group Initiative" pill and the gap under it. */}
          <div className="animate-in fade-in zoom-in-95 slide-in-from-bottom-6 duration-1000 md:mt-[3.5rem] md:self-start short:mt-0 short:self-center">
            <BatchWidget />
          </div>
        </section>
      </div>

      <Capabilities />
      <FarmJourney />
      <ExternalOrderSection />
      <StepsSection
        id="how-it-works"
        eyebrow="How it works"
        title="One batch a day, start to finish"
        stages={systemStages}
      />
      <FarmShowcase />

      {/* A band of brand green, as on the HTML page. Two per row on a phone: one stat per row
          left four tall, near-empty bands. */}
      <section className="bg-gradient-to-br from-primary to-primary-deep text-primary-foreground">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-8 px-5 py-12 text-center sm:gap-10 sm:py-16 lg:grid-cols-4">
          <Stat value="Gazaria" label="Anwar Organic Dairy Farm" />
          <Stat value={100} suffix="%" label="Fresh Whole Milk" />
          <Stat value="Daily" label="Fresh Batch" />
          <Stat value="Every Drop" label="Handled With Care" />
        </div>
      </section>

      <SiteFooter />

      <EmployeeLoginDialog intent={loginIntent} onClose={() => setLoginIntent(null)} />
    </div>
  );
}

/**
 * The footer: the mark, who makes the milk, what is promised about how it is made, and how to
 * keep it. The year is read from the clock rather than written in, so the line does not quietly
 * go stale in January.
 */
function SiteFooter() {
  return (
    <footer className="bg-card">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:py-14">
        <img src={logoUrl} alt="Anwar Organic" className="h-16 w-auto" width={66} height={64} />

        {/* Uppercased in the stylesheet rather than typed in capitals, so a screen reader says
            the name instead of spelling it. */}
        <p className="mt-4 text-sm font-semibold uppercase tracking-wider text-foreground">
          Anwar Organic
        </p>

        <div className="mt-3 max-w-xl space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>Fresh Whole Milk from Anwar Organic Dairy Farm, Gazaria.</p>
          <p>
            Anwar Organic offers fresh unpasteurized whole milk that provides protein, calcium and
            other essential nutrients and is chilled to 4°C. As it is unpasteurized, please
            refrigerate it immediately upon reaching home to help prevent spoilage and curdling,
            and boil thoroughly before consumption.
          </p>
        </div>

        <p className="mt-10 border-t border-border pt-6 text-sm text-muted-foreground sm:mt-12">
          © {new Date().getFullYear()} Anwar Organic | An Anwar Group Initiative
        </p>
      </div>
    </footer>
  );
}
