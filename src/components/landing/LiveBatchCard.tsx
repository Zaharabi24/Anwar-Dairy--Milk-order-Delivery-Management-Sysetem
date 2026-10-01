import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { Clock, MapPin, Truck } from "lucide-react";
import type { PublicBatchStatus } from "@/server/public-batch.server";
import { countdown, dateShort, taka } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MilkGlassScene } from "@/components/landing/MilkGlassScene";

/**
 * Today's batch: what is left, what it costs, and how long there is to book it.
 *
 * A frosted-glass card over the hero. The glass of milk is the one piece of illustration, and it
 * earns its place by carrying a number -- the milk level is the batch's remaining litres, on the
 * same rule the signed-in offer screen uses. With no batch published it simply stands half full.
 *
 * `compact` is the smaller card that sits above a form (the guest order page): a narrow glass
 * beside the numbers, left out altogether on a phone, and tighter type and spacing throughout.
 */
export function LiveBatchCard({
  batch,
  compact = false,
}: {
  batch: PublicBatchStatus | null;
  compact?: boolean;
}) {
  const fill = batch
    ? Math.min(1, Math.max(0, batch.remainingLitres / Math.max(1, batch.saleableLitres)))
    : 0;
  // Never quite empty, never quite to the rim: at either extreme the surface stops reading as
  // liquid, and the surface is the whole point.
  const level = batch ? Math.min(0.93, Math.max(0.07, fill)) : 0.5;

  return (
    // The glass stands on the left and the numbers read on the right, once the card is wide enough
    // for both; on a narrow card the glass sits on top.
    <section
      className={cn(
        "glass-card @container relative",
        compact ? "rounded-2xl p-2" : "rounded-3xl p-2.5 sm:p-3",
      )}
    >
      <div
        className={cn(
          "flex gap-2",
          compact ? "flex-row items-stretch" : "flex-col @md:flex-row @md:items-stretch",
        )}
      >
        <div
          className={cn(
            "relative shrink-0 overflow-hidden",
            compact
              ? "hidden rounded-xl @md:block @md:w-[28%]"
              : "h-64 rounded-2xl @md:h-auto @md:min-h-80 @md:w-[44%]",
          )}
        >
          <MilkGlassScene
            level={level}
            label={
              batch
                ? `Glass showing ${Math.round(fill * 100)} per cent of the batch remaining`
                : "A glass of fresh milk on a farmhouse table"
            }
            className="absolute inset-0"
          />
        </div>

        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col justify-center",
            compact ? "px-2 py-2 @md:px-3" : "px-3 pb-2 pt-4 @md:py-4 @md:pl-4",
          )}
        >
          <div
            className={cn(
              "flex flex-wrap items-center gap-2",
              compact ? "mb-3 text-xs [&>p]:px-2.5 [&>p]:py-1 [&>p]:text-xs" : "mb-5 short:mb-3",
            )}
          >
            <LiveBadge batch={batch} />
            {batch ? (
              <p className="glass-pill rounded-full px-3 py-1.5 text-sm font-semibold">
                {taka(batch.ratePerLitre)}{" "}
                <span className="font-normal text-muted-foreground">/ litre</span>
              </p>
            ) : null}
          </div>
          <Readout batch={batch} fill={fill} compact={compact} />
          {batch ? (
            <footer
              className={cn(
                "flex flex-wrap gap-x-5 gap-y-2 border-t border-border/70 text-muted-foreground",
                compact ? "mt-3 gap-x-4 gap-y-1 pt-2.5 text-xs" : "mt-5 pt-4 text-sm short:mt-3 short:pt-3",
              )}
            >
              <span className="inline-flex items-center gap-1.5">
                <Truck className="size-4 text-primary" aria-hidden="true" />
                Delivery {dateShort(batch.deliveryDate)}, {batch.deliveryWindow}
              </span>
              {batch.deliveryPoints.length ? (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-4 text-primary" aria-hidden="true" />
                  {batch.deliveryPoints.join(" & ")}
                </span>
              ) : null}
            </footer>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function LiveBadge({ batch }: { batch: PublicBatchStatus | null }) {
  const reduce = useReducedMotion();
  return (
    <p className="glass-pill flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium">
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
  );
}

// ---------------------------------------------------------------------------

function Readout({
  batch,
  fill,
  compact,
}: {
  batch: PublicBatchStatus | null;
  fill: number;
  compact: boolean;
}) {
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
        <p className="mt-1 font-display text-5xl font-extrabold leading-none text-muted-foreground">
          —
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Today&apos;s batch appears here once the operator publishes it.
        </p>
      </div>
    );
  }

  const left = countdown(batch.bookingCutoff);
  const soldOut = batch.remainingLitres === 0;
  const percent = Math.round(fill * 100);

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Litres remaining</p>
          <p className="mt-1 flex items-baseline gap-2">
            <span
              key={batch.remainingLitres}
              className={cn(
                "font-display font-extrabold leading-none tabular-nums motion-safe:animate-[milk-count_450ms_ease-out]",
                compact ? "text-4xl" : "text-5xl sm:text-6xl",
              )}
            >
              {batch.remainingLitres}
            </span>
            <span className="text-sm text-muted-foreground">of {batch.saleableLitres} L</span>
          </p>
        </div>
        {left && !soldOut ? (
          <div className="flex gap-1.5" aria-label={`Bookings close in ${left.label}`}>
            <TimeBox value={left.h} unit="h" compact={compact} />
            <TimeBox value={left.m} unit="m" compact={compact} />
            <TimeBox value={left.s} unit="s" compact={compact} />
          </div>
        ) : null}
      </div>

      {/* How much of the batch is still there, as a bar under the number */}
      <div className={cn("overflow-hidden rounded-full bg-secondary", compact ? "mt-3 h-1.5" : "mt-4 h-2")}>
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-primary-deep transition-[width] duration-700 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>

      <p
        className={cn(
          "flex items-center gap-1.5",
          compact ? "mt-2 text-xs" : "mt-3 text-sm",
          soldOut || !left ? "font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        <Clock className="size-4 text-primary" aria-hidden="true" />
        {soldOut
          ? "Sold out — every litre is booked"
          : left
            ? `${percent}% still available · bookings close at ${closingTime(batch.bookingCutoff)}`
            : "Bookings are closed for today"}
      </p>
    </div>
  );
}

// The cut-off as a clock time ("4:00 PM"). Read in Dhaka time, so the server render and the
// browser agree whatever zone either one is in.
function closingTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "Asia/Dhaka",
    hour: "numeric",
    minute: "2-digit",
  });
}

function TimeBox({ value, unit, compact }: { value: number; unit: string; compact: boolean }) {
  return (
    <span
      className={cn(
        "flex flex-col items-center rounded-lg border border-border bg-background/70 shadow-sm",
        compact ? "min-w-9 px-1.5 py-1 [&>span:first-child]:text-sm" : "min-w-11 px-2 py-1.5",
      )}
    >
      {/* The server and the browser read the clock a moment apart. */}
      <span className="font-display text-lg font-bold leading-none tabular-nums" suppressHydrationWarning>
        {value.toString().padStart(2, "0")}
      </span>
      <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {unit}
      </span>
    </span>
  );
}
