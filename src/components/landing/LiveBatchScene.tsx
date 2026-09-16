import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { PublicBatchStatus } from "@/server/public-batch.server";
import { countdown, dateShort, taka } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Today's batch, over a pasture.
 *
 * The scene is layered SVG and CSS rather than WebGL: depth comes from haze, blur and parallax,
 * which costs nothing to download and runs on the phones this is actually read on. Everything
 * animates on transform and opacity only, so it stays on the compositor.
 *
 * The milk level is the batch's real remaining litres, not decoration -- it is the same number the
 * signed-in offer screen shows, so the two can never disagree.
 */
export function LiveBatchScene({ batch }: { batch: PublicBatchStatus | null }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  // A little parallax under the pointer. Small on purpose: enough to read as depth, not enough to
  // distract someone trying to read a number.
  useEffect(() => {
    const el = ref.current;
    if (!el || reduce) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      setTilt({
        x: ((e.clientX - r.left) / r.width - 0.5) * 2,
        y: ((e.clientY - r.top) / r.height - 0.5) * 2,
      });
    };
    const leave = () => setTilt({ x: 0, y: 0 });
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, [reduce]);

  const fill = batch
    ? Math.min(1, Math.max(0, batch.remainingLitres / Math.max(1, batch.saleableLitres)))
    : 0;

  return (
    <div
      ref={ref}
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-card",
        !reduce && "scene-animate",
      )}
      style={{ perspective: "900px" }}
    >
      <Pasture tilt={tilt} reduce={!!reduce} />

      {/* Everything readable sits above the scene, on its own soft scrim. */}
      <div className="relative z-10 p-6">
        <Header batch={batch} reduce={!!reduce} />
        <div className="mt-6 flex items-end gap-6">
          <Glass fill={fill} reduce={!!reduce} />
          <Readout batch={batch} />
        </div>
        <Footer batch={batch} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The scene

function Pasture({ tilt, reduce }: { tilt: { x: number; y: number }; reduce: boolean }) {
  // Each layer shifts by a different amount; that difference is the depth cue.
  const shift = (depth: number) => ({
    transform: `translate3d(${tilt.x * depth}px, ${tilt.y * depth * 0.4}px, 0)`,
  });

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {/* Sky, with the sun low and warm behind the hills. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, var(--scene-sky-top) 0%, var(--scene-sky-low) 52%, var(--scene-field-far) 52%, var(--scene-field-near) 100%)",
        }}
      />
      <div
        className="absolute left-[18%] top-[6%] size-40 rounded-full blur-3xl"
        style={{ background: "var(--scene-sun)", opacity: 0.75, ...shift(-3) }}
      />

      {/* Far hills: pale, soft-edged, barely moving. */}
      <svg
        className="absolute inset-x-0 top-[30%] h-[26%] w-full"
        style={{ filter: "blur(1.5px)", ...shift(-5) }}
        viewBox="0 0 400 60"
        preserveAspectRatio="none"
      >
        <path
          d="M0 60 L0 36 Q40 18 84 30 Q130 43 172 22 Q214 3 258 24 Q304 46 344 28 Q374 15 400 26 L400 60 Z"
          fill="var(--scene-hill-far)"
        />
      </svg>
      <svg
        className="absolute inset-x-0 top-[38%] h-[22%] w-full"
        style={{ filter: "blur(0.6px)", ...shift(-9) }}
        viewBox="0 0 400 50"
        preserveAspectRatio="none"
      >
        <path
          d="M0 50 L0 30 Q52 12 104 26 Q150 39 196 20 Q248 0 300 22 Q350 43 400 24 L400 50 Z"
          fill="var(--scene-hill-near)"
        />
      </svg>

      {/* Haze over the far field, which is what stops the layers looking stacked. */}
      <div
        className="absolute inset-x-0 top-[48%] h-[14%]"
        style={{
          background: "linear-gradient(to bottom, var(--scene-sky-low), transparent)",
          animation: reduce ? undefined : "scene-drift 19s ease-in-out infinite",
        }}
      />

      {/* The herd, grazing in the middle distance. Silhouettes: at this size a drawn cow reads as
          a cartoon, where a silhouette reads as a cow. */}
      <div className="absolute inset-x-0 top-[47%] h-[18%]" style={shift(-14)}>
        <Cow left="12%" scale={0.62} delay={0} distance={46} blur={1.1} />
        <Cow left="38%" scale={0.5} delay={-7} distance={30} blur={1.6} />
        <Cow left="63%" scale={0.72} delay={-3.5} distance={58} blur={0.7} />
        <Cow left="83%" scale={0.44} delay={-11} distance={24} blur={2} />
      </div>

      {/* Foreground grass, blurred for depth of field and swaying off a shared rhythm. */}
      <div className="absolute inset-x-0 bottom-0 h-[34%]" style={{ ...shift(16) }}>
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(to top, var(--scene-field-near), transparent)",
          }}
        />
        <svg
          className="absolute inset-x-0 bottom-0 h-full w-full"
          style={{ filter: "blur(0.8px)" }}
          viewBox="0 0 400 80"
          preserveAspectRatio="none"
        >
          {Array.from({ length: 56 }, (_, i) => {
            const x = (i * 400) / 56 + ((i * 37) % 7);
            const h = 26 + ((i * 53) % 34);
            return (
              <g
                key={i}
                style={{
                  transformOrigin: `${x}px 80px`,
                  animation: reduce
                    ? undefined
                    : `scene-sway ${3.4 + ((i * 13) % 17) / 10}s ease-in-out ${(i % 11) * -0.37}s infinite`,
                }}
              >
                <path
                  d={`M${x} 80 Q${x + 2} ${80 - h / 2} ${x + 7} ${80 - h}`}
                  stroke="var(--scene-grass-blade)"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  fill="none"
                  opacity={0.55 + ((i * 7) % 4) / 10}
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* A wash of card colour behind the text so the numbers stay readable over the pasture. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to right, var(--color-card) 0%, color-mix(in oklab, var(--color-card) 82%, transparent) 42%, transparent 78%)",
        }}
      />
    </div>
  );
}

function Cow({
  left,
  scale,
  delay,
  distance,
  blur,
}: {
  left: string;
  scale: number;
  delay: number;
  distance: number;
  blur: number;
}) {
  return (
    <div
      className="absolute bottom-0"
      style={{
        left,
        transform: `scale(${scale})`,
        transformOrigin: "bottom left",
        filter: `blur(${blur}px)`,
        opacity: 0.72,
      }}
    >
      <div
        style={{
          ["--graze-distance" as string]: `${distance}px`,
          animation: `scene-graze ${44 + distance}s ease-in-out ${delay}s infinite`,
        }}
      >
        <svg width="52" height="34" viewBox="0 0 52 34" fill="var(--scene-cow)">
          {/* Body, haunch and legs as one silhouette. */}
          <path d="M9 14 Q7 9 12 8 L34 8 Q41 8 43 13 L44 19 Q44 23 40 23 L12 23 Q8 23 8 19 Z" />
          <rect x="11" y="22" width="3.2" height="10" rx="1.4" />
          <rect x="17" y="22" width="3.2" height="10" rx="1.4" />
          <rect x="34" y="22" width="3.2" height="10" rx="1.4" />
          <rect x="39" y="22" width="3.2" height="10" rx="1.4" />
          {/* Tail. */}
          <path d="M8.6 12 Q5 16 6.4 24" stroke="var(--scene-cow)" strokeWidth="1.5" fill="none" />
          {/* Head, on its own pivot so it can drop to the grass. */}
          <g
            style={{
              transformOrigin: "42px 12px",
              animation: "scene-browse 9s ease-in-out infinite",
            }}
          >
            <path d="M42 9 Q49 8 50 13 L50.5 18 Q50.5 21 47 21 L43 20 Q41 15 42 9 Z" />
            <path
              d="M43 8.5 Q42 5.5 44.6 6"
              stroke="var(--scene-cow)"
              strokeWidth="1.3"
              fill="none"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The glass

function Glass({ fill, reduce }: { fill: number; reduce: boolean }) {
  // Never quite empty and never quite brim-full, so the surface always reads as liquid.
  const level = Math.min(0.94, Math.max(0.06, fill));

  return (
    <div className="relative h-44 w-28 shrink-0" style={{ transform: "translateZ(40px)" }}>
      {/* The shadow the glass casts on the grass, which is what sits it in the scene. */}
      <div
        aria-hidden
        className="absolute -bottom-2 left-1/2 h-4 w-24 -translate-x-1/2 rounded-[50%] blur-md"
        style={{ background: "var(--scene-grass-blade)", opacity: 0.4 }}
      />

      <div
        className="relative h-full w-full overflow-hidden rounded-b-[2.6rem] rounded-t-lg"
        style={{
          background: "var(--scene-glass-tint)",
          boxShadow:
            "inset 0 0 0 2px var(--scene-glass-edge), inset -10px 0 18px -12px var(--color-primary-deep), inset 10px 0 20px -14px var(--scene-glass-edge)",
          backdropFilter: "blur(1px)",
        }}
      >
        {/* The milk. The column height is the batch; the wave and swell are the animation. */}
        <motion.div
          className="absolute inset-x-0 bottom-0"
          initial={false}
          animate={{ height: `${level * 100}%` }}
          transition={{ duration: reduce ? 0 : 1.1, ease: [0.22, 1, 0.36, 1] }}
        >
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to bottom, var(--scene-milk-top), var(--scene-milk-body) 42%, var(--scene-milk-deep))",
              animation: reduce ? undefined : "scene-swell 6.5s ease-in-out infinite",
            }}
          />
          {/* Two surfaces at different speeds: one wave looks mechanical, two look like liquid. */}
          <Surface duration={7} opacity={0.95} reduce={reduce} />
          <Surface duration={4.6} opacity={0.55} reduce={reduce} offset={-6} />
          {/* Light pooling at the bottom of the column. */}
          <div
            className="absolute inset-x-0 bottom-0 h-10"
            style={{
              background: "linear-gradient(to top, var(--scene-milk-deep), transparent)",
              opacity: 0.8,
            }}
          />
        </motion.div>

        {/* Glass over the milk: a specular streak down the left, a soft one on the right. */}
        <div
          aria-hidden
          className="absolute inset-y-3 left-3 w-2 rounded-full"
          style={{
            background: "linear-gradient(to bottom, var(--scene-glass-edge), transparent 70%)",
            opacity: 0.85,
          }}
        />
        <div
          aria-hidden
          className="absolute inset-y-8 right-3.5 w-1 rounded-full"
          style={{ background: "var(--scene-glass-edge)", opacity: 0.4 }}
        />
      </div>

      {/* The rim, drawn over the top so the glass reads as open. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-3 rounded-t-lg"
        style={{ boxShadow: "inset 0 2px 0 0 var(--scene-glass-edge)" }}
      />
    </div>
  );
}

/** One moving milk surface: a wave twice the width of the glass, sliding across it. */
function Surface({
  duration,
  opacity,
  reduce,
  offset = 0,
}: {
  duration: number;
  opacity: number;
  reduce: boolean;
  offset?: number;
}) {
  return (
    <div className="absolute inset-x-0 -top-2 h-4 overflow-hidden" style={{ opacity }}>
      <svg
        className="h-full w-[200%]"
        viewBox="0 0 200 16"
        preserveAspectRatio="none"
        style={{
          animation: reduce ? undefined : `scene-wave ${duration}s linear infinite`,
          transform: `translateY(${offset}px)`,
        }}
      >
        <path
          d="M0 9 Q12.5 2 25 9 T50 9 T75 9 T100 9 T125 9 T150 9 T175 9 T200 9 L200 16 L0 16 Z"
          fill="var(--scene-milk-top)"
        />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The numbers

function Header({ batch, reduce }: { batch: PublicBatchStatus | null; reduce: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <motion.span
          className="inline-block size-2 rounded-full bg-primary"
          animate={reduce || !batch ? {} : { opacity: [1, 0.25, 1], scale: [1, 1.35, 1] }}
          transition={{ duration: 1.8, repeat: Infinity }}
        />
        {batch ? `Active batch · ${batch.batchNo}` : "No batch published yet"}
      </div>
      {batch ? (
        <span className="shrink-0 text-sm text-muted-foreground">
          {taka(batch.ratePerLitre)} / litre
        </span>
      ) : null}
    </div>
  );
}

function Readout({ batch }: { batch: PublicBatchStatus | null }) {
  const [, tick] = useState(0);
  // The cut-off is a clock, so it has to move on its own.
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!batch) {
    return (
      <div>
        <p className="text-sm text-muted-foreground">Litres remaining</p>
        <p className="font-display text-6xl font-extrabold leading-none text-muted-foreground">—</p>
        <p className="mt-3 text-sm text-muted-foreground">
          Today's batch appears here once the operator publishes it.
        </p>
      </div>
    );
  }

  const left = countdown(batch.bookingCutoff);
  return (
    <div>
      <p className="text-sm text-muted-foreground">Litres remaining</p>
      <motion.p
        key={batch.remainingLitres}
        initial={{ opacity: 0.45, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className="font-display text-6xl font-extrabold leading-none"
      >
        {batch.remainingLitres}
      </motion.p>
      <p className="mt-3 text-sm text-muted-foreground">
        {batch.remainingLitres === 0
          ? "Sold out — every litre is booked"
          : left
            ? `Bookings close in ${left.h}h ${left.m}m`
            : "Bookings are closed for today"}
      </p>
    </div>
  );
}

function Footer({ batch }: { batch: PublicBatchStatus | null }) {
  if (!batch) return null;
  const points = batch.deliveryPoints.length ? batch.deliveryPoints.join(" & ") : "—";
  return (
    <p className="mt-6 border-t border-border pt-4 text-sm text-muted-foreground">
      Delivery {dateShort(batch.deliveryDate)}, {batch.deliveryWindow} · {points}
    </p>
  );
}
