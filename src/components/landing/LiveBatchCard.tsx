import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import type { PublicBatchStatus } from "@/server/public-batch.server";
import { countdown, dateShort, taka } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Today's batch: what is left, what it costs, and how long there is to book it.
 *
 * The glass is the one piece of illustration, and it earns its place by carrying a number -- the
 * milk level is the batch's remaining litres, on the same rule the signed-in offer screen uses.
 * Everything else is type and space, because this is read for its numbers.
 */
export function LiveBatchCard({ batch }: { batch: PublicBatchStatus | null }) {
  const reduce = useReducedMotion();
  const fill = batch
    ? Math.min(1, Math.max(0, batch.remainingLitres / Math.max(1, batch.saleableLitres)))
    : 0;

  return (
    <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <span className="relative flex size-2">
            {batch && !reduce ? (
              <motion.span
                className="absolute inline-flex size-full rounded-full bg-primary"
                animate={{ opacity: [0.7, 0, 0.7], scale: [1, 2.4, 1] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut" }}
              />
            ) : null}
            <span
              className={cn(
                "relative inline-flex size-2 rounded-full",
                batch ? "bg-primary" : "bg-muted-foreground",
              )}
            />
          </span>
          {batch ? "Active batch" : "No batch published yet"}
          {batch ? <span className="font-semibold">· {batch.batchNo}</span> : null}
        </p>
        {batch ? (
          <p className="rounded-full bg-secondary px-3 py-1 text-sm font-medium text-secondary-foreground">
            {taka(batch.ratePerLitre)} <span className="text-muted-foreground">/ litre</span>
          </p>
        ) : null}
      </header>

      <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
        <MilkGlass fill={fill} reduce={!!reduce} />
        <Readout batch={batch} />
      </div>

      {batch ? (
        <footer className="mt-5 border-t border-border pt-4 text-sm text-muted-foreground">
          Delivery {dateShort(batch.deliveryDate)}, {batch.deliveryWindow}
          {batch.deliveryPoints.length ? ` · ${batch.deliveryPoints.join(" & ")}` : ""}
        </footer>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------

const W = 96;
const H = 160;
/** The inside of the glass, top to bottom: the milk moves between these. */
const RIM = 16;
const BASE = 146;
/** A tumbler, tapering very slightly, with a rounded base. */
const GLASS = `M18 ${RIM} L24 130 Q26 ${BASE} 48 ${BASE} Q70 ${BASE} 72 130 L78 ${RIM} Z`;

function MilkGlass({ fill, reduce }: { fill: number; reduce: boolean }) {
  // Never quite empty, never quite to the rim: at either extreme the surface stops reading as
  // liquid, and the surface is the whole point.
  const level = Math.min(0.93, Math.max(0.07, fill));
  // The milk is drawn once, full height, and slid down to the right level. Geometry stays in plain
  // SVG attributes so the server renders it correctly at first paint, and a transform is the one
  // thing every browser will animate smoothly.
  const drop = (1 - level) * (BASE - RIM);

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg p-4 sm:p-5",
        !reduce && "milk-animate",
      )}
      style={{
        background: "var(--milk-panel)",
        boxShadow: "inset 0 0 0 1px var(--milk-panel-edge)",
      }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-36 w-auto sm:h-40"
        role="img"
        aria-label={`Glass showing ${Math.round(fill * 100)} per cent of the batch remaining`}
      >
        <defs>
          <clipPath id="glass-inside">
            <path d={GLASS} />
          </clipPath>
        </defs>

        {/* The glass itself: barely there, so the milk is what you see. */}
        <path d={GLASS} fill="var(--glass-body)" />

        <g clipPath="url(#glass-inside)">
          <g
            transform={`translate(0 ${drop})`}
            style={{
              transition: reduce ? undefined : "transform 900ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            {/* A gentle settle, on its own layer so it doesn't fight the level transition. */}
            <g style={{ animation: reduce ? undefined : "milk-settle 5.5s ease-in-out infinite" }}>
              {/* The body, drawn past the base and clipped by the glass. */}
              <rect x="0" y={RIM} width={W} height={BASE - RIM + 24} fill="var(--milk-body)" />
              {/* One shade at the foot of the column gives depth without a gradient. */}
              <rect
                x="0"
                y={BASE - 24}
                width={W}
                height="48"
                fill="var(--milk-shade)"
                opacity="0.65"
              />
              {/* The surface: two wavelengths wide, travelling exactly one, so the loop is seamless. */}
              <g style={{ animation: reduce ? undefined : "milk-wave 6s linear infinite" }}>
                <path
                  d={`M0 ${RIM} Q24 ${RIM - 5} 48 ${RIM} T96 ${RIM} T144 ${RIM} T192 ${RIM} L192 ${RIM + 12} L0 ${RIM + 12} Z`}
                  fill="var(--milk-body)"
                />
              </g>
              <g
                style={{
                  animation: reduce ? undefined : "milk-wave 9s linear infinite reverse",
                  opacity: 0.4,
                }}
              >
                <path
                  d={`M0 ${RIM + 2} Q24 ${RIM - 2} 48 ${RIM + 2} T96 ${RIM + 2} T144 ${RIM + 2} T192 ${RIM + 2} L192 ${RIM + 12} L0 ${RIM + 12} Z`}
                  fill="var(--milk-shade)"
                />
              </g>
            </g>
          </g>
        </g>

        {/* Glass over the milk: one rim, one highlight. Nothing else. */}
        <path
          d={GLASS}
          fill="none"
          stroke="var(--glass-edge)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <line
          x1="29"
          y1="32"
          x2="33"
          y2="120"
          stroke="var(--glass-edge)"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.5"
        />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Readout({ batch }: { batch: PublicBatchStatus | null }) {
  const [, tick] = useState(0);
  // The cut-off is a clock, so it has to move on its own.
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!batch) {
    return (
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">Litres remaining</p>
        <p className="font-display text-5xl font-extrabold leading-none text-muted-foreground">—</p>
        <p className="mt-3 text-sm text-muted-foreground">
          Today&apos;s batch appears here once the operator publishes it.
        </p>
      </div>
    );
  }

  const left = countdown(batch.bookingCutoff);
  const soldOut = batch.remainingLitres === 0;

  return (
    <div className="min-w-0">
      <p className="text-sm text-muted-foreground">Litres remaining</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span
          key={batch.remainingLitres}
          className="font-display text-5xl font-extrabold leading-none tabular-nums sm:text-6xl motion-safe:animate-[milk-count_450ms_ease-out]"
        >
          {batch.remainingLitres}
        </span>
        <span className="text-sm text-muted-foreground">of {batch.saleableLitres} L</span>
      </p>
      <p
        className={cn(
          "mt-3 text-sm",
          soldOut || !left ? "font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        {soldOut
          ? "Sold out — every litre is booked"
          : left
            ? `Bookings close in ${left.h}h ${left.m}m`
            : "Bookings are closed for today"}
      </p>
    </div>
  );
}
