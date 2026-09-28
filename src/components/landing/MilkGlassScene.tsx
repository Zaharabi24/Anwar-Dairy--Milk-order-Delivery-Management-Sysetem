import { useId } from "react";

/**
 * A glass of milk on a wooden table, shot like a product photo: the farm behind it is thrown out
 * of focus, so the glass is the one sharp thing in the frame.
 *
 * Purely visual: it knows nothing about batches or orders. `level` is how full the glass is, from
 * 0 (empty) to 1 (full), and defaults to half. The milk eases to a new level rather than jumping.
 *
 * Motion: two layers of waves roll across the milk at different speeds while the whole surface
 * tilts gently, a glint of light sweeps the glass, and specks of out-of-focus light drift behind.
 * Every animation is switched off for anyone who has asked their system for reduced motion (the
 * `milk-animate` rule in styles.css).
 */
export function MilkGlassScene({
  level = 0.5,
  className,
  label = "A glass of fresh milk on a farmhouse table",
}: {
  level?: number;
  className?: string;
  label?: string;
}) {
  // Ids must be unique per instance, and colons are not safe inside url(#...).
  const uid = useId().replace(/:/g, "");
  const id = (name: string) => `${name}-${uid}`;
  const url = (name: string) => `url(#${id(name)})`;

  // The inside of the glass runs from the rim (y=66) down to the thick base (y=256).
  const fill = Math.min(1, Math.max(0, level));
  const lift = -(INNER_BOTTOM - INNER_TOP) * fill;

  return (
    <svg
      viewBox="-50 36 420 300"
      role="img"
      aria-label={label}
      className={`milk-animate block h-full w-full ${className ?? ""}`}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id={id("air")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--meadow-sky-top)" />
          <stop offset="0.55" stopColor="var(--meadow-sky-bottom)" />
          <stop offset="1" stopColor="var(--meadow-hill-far)" />
        </linearGradient>
        <radialGradient id={id("window")} cx="0.15" cy="0.1" r="0.8">
          <stop offset="0" stopColor="var(--scene-light)" stopOpacity="0.85" />
          <stop offset="1" stopColor="var(--scene-light)" stopOpacity="0" />
        </radialGradient>
        <filter id={id("far")} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <filter id={id("bokeh")} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>

        {/* The table: warm wood, lit from behind, darker towards the viewer. */}
        <linearGradient id={id("table")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--table-top)" />
          <stop offset="1" stopColor="var(--table-edge)" />
        </linearGradient>
        {/* Wood grain: noise stretched far along the planks, turned into dark streaks. */}
        <filter id={id("wood")} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.16 0.008" numOctaves="4" seed="7" />
          <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  3.2 0 0 0 -1.35" />
          <feComponentTransfer result="streaks">
            <feFuncA type="linear" slope="0.9" />
          </feComponentTransfer>
          <feFlood style={{ floodColor: "var(--table-grain)" }} />
          <feComposite in2="streaks" operator="in" />
        </filter>
        <radialGradient id={id("table-sheen")} cx="0.5" cy="0.15" r="0.6" gradientTransform="translate(0.5 0.15) scale(1 0.45) translate(-0.5 -0.15)">
          <stop offset="0" stopColor="var(--scene-light)" stopOpacity="0.4" />
          <stop offset="1" stopColor="var(--scene-light)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id("table-back")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--scene-dark)" stopOpacity="0.22" />
          <stop offset="1" stopColor="var(--scene-dark)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={id("table-lip")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--scene-dark)" stopOpacity="0" />
          <stop offset="1" stopColor="var(--scene-dark)" stopOpacity="0.3" />
        </linearGradient>
        <radialGradient id={id("shadow")}>
          <stop offset="0" stopColor="var(--scene-dark)" stopOpacity="0.55" />
          <stop offset="0.55" stopColor="var(--scene-dark)" stopOpacity="0.18" />
          <stop offset="1" stopColor="var(--scene-dark)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id("reflection")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--milk-body)" stopOpacity="0.45" />
          <stop offset="1" stopColor="var(--milk-body)" stopOpacity="0" />
        </linearGradient>

        {/* Milk: bright near the top, creamier towards the foot, rounded at the sides. */}
        <linearGradient id={id("milk-body")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--scene-light)" />
          <stop offset="0.25" stopColor="var(--milk-body)" />
          <stop offset="1" stopColor="var(--milk-shade)" />
        </linearGradient>
        <linearGradient id={id("milk-round")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0.27" stopColor="var(--milk-deep)" stopOpacity="0.6" />
          <stop offset="0.4" stopColor="var(--milk-deep)" stopOpacity="0" />
          <stop offset="0.58" stopColor="var(--milk-deep)" stopOpacity="0" />
          <stop offset="0.73" stopColor="var(--milk-deep)" stopOpacity="0.65" />
        </linearGradient>

        {/* Glass: clear in the middle, catching light along both walls. */}
        <linearGradient id={id("glass")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--scene-light)" stopOpacity="0.45" />
          <stop offset="0.14" stopColor="var(--scene-light)" stopOpacity="0.08" />
          <stop offset="0.5" stopColor="var(--scene-light)" stopOpacity="0.03" />
          <stop offset="0.86" stopColor="var(--scene-light)" stopOpacity="0.1" />
          <stop offset="1" stopColor="var(--scene-light)" stopOpacity="0.42" />
        </linearGradient>
        <linearGradient id={id("glass-base")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--scene-light)" stopOpacity="0.6" />
          <stop offset="1" stopColor="var(--scene-light)" stopOpacity="0.22" />
        </linearGradient>
        <linearGradient id={id("streak")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--scene-light)" stopOpacity="0" />
          <stop offset="0.5" stopColor="var(--scene-light)" stopOpacity="0.9" />
          <stop offset="1" stopColor="var(--scene-light)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={id("glint")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--scene-light)" stopOpacity="0" />
          <stop offset="0.5" stopColor="var(--scene-light)" stopOpacity="0.5" />
          <stop offset="1" stopColor="var(--scene-light)" stopOpacity="0" />
        </linearGradient>

        <clipPath id={id("inner")}>
          <path d={INNER} />
        </clipPath>
        <clipPath id={id("outer")}>
          <path d={OUTER} />
        </clipPath>
      </defs>

      {/* The farm behind, well out of focus: pale sky, a tree line, green pasture */}
      <rect x="-80" width="480" height="260" fill={url("air")} />
      <g filter={url("far")}>
        <g fill="var(--meadow-grass-deep)" opacity="0.85">
          {trees.map((t, i) => (
            <ellipse key={i} cx={t.x} cy={t.y} rx={t.rx} ry={t.ry} />
          ))}
        </g>
        <path
          d="M-100 200 C -20 188, 80 196, 160 192 S 320 186, 420 196 V 270 H -100 Z"
          fill="var(--meadow-grass)"
        />
        <path
          d="M-100 226 C 0 218, 120 228, 220 222 S 360 220, 420 226 V 270 H -100 Z"
          fill="var(--meadow-hill-near)"
        />
      </g>
      <rect x="-80" width="480" height="260" fill={url("window")} />

      {/* Specks of light, blurred into soft discs */}
      <g fill="var(--scene-light)" filter={url("bokeh")}>
        {bokeh.map((b, i) => (
          <circle
            key={i}
            className="scene-bokeh"
            cx={b.x}
            cy={b.y}
            r={b.r}
            opacity={b.o}
            style={{ animationDelay: `${-b.delay}s` }}
          />
        ))}
      </g>

      {/* The table top: planks of wood running towards the viewer, real grain, light pooling
          behind the glass, and a shadowed front edge */}
      <rect x="-80" y="250" width="480" height="90" fill={url("table")} />
      <rect x="-80" y="250" width="480" height="90" filter={url("wood")} opacity="0.55" />
      <g stroke="var(--table-grain)" strokeWidth="1.2" opacity="0.7">
        {planks.map((p, i) => (
          <line key={i} x1={160 + p * 70} y1="250" x2={160 + p * 118} y2="340" />
        ))}
      </g>
      <g stroke="var(--scene-light)" strokeWidth="0.8" opacity="0.25">
        {planks.map((p, i) => (
          <line key={i} x1={161.5 + p * 70} y1="250" x2={162.5 + p * 118} y2="340" />
        ))}
      </g>
      <rect x="-80" y="250" width="480" height="90" fill={url("table-sheen")} />
      <rect x="-80" y="250" width="480" height="10" fill={url("table-back")} />
      <rect x="-80" y="250" width="480" height="1.2" fill="var(--scene-light)" opacity="0.6" />
      <rect x="-80" y="324" width="480" height="16" fill="var(--table-edge)" />
      <rect x="-80" y="324" width="480" height="1.2" fill="var(--scene-light)" opacity="0.35" />
      <rect x="-80" y="325.2" width="480" height="5" fill={url("table-lip")} />

      {/* The milk's reflection in the polished table, then the glass's contact shadow */}
      <path d="M112 280 L208 280 L202 330 L118 330 Z" fill={url("reflection")} />
      <ellipse cx="160" cy="279" rx="66" ry="7" fill={url("shadow")} />

      {/* Back of the glass: a faint body and the far half of the rim */}
      <path d={OUTER} fill="var(--glass-body)" />
      <path
        d="M104 66 A56 5 0 0 1 216 66"
        fill="none"
        stroke="var(--glass-edge)"
        strokeWidth="1.2"
        opacity="0.7"
      />

      {/* The milk, clipped to the inside of the glass and lifted to its level */}
      <g clipPath={url("inner")}>
        <g style={{ transform: `translateY(${lift}px)`, transition: "transform 1.2s ease-out" }}>
          <g className="scene-slosh">
            {/* The far side of the surface, a lighter wave rolling the other way */}
            <path
              d={wave(INNER_BOTTOM - 3, 5)}
              fill="var(--milk-top)"
              style={{ animation: "milk-wave 5.2s linear infinite reverse" }}
            />
            {/* The near side of the surface and the body of milk below it */}
            <g style={{ animation: "milk-wave 3.4s linear infinite" }}>
              <path
                d={wave(INNER_BOTTOM + 2, 6)}
                fill={url("milk-body")}
                stroke="var(--milk-deep)"
                strokeOpacity="0.35"
                strokeWidth="0.8"
              />
            </g>
            <rect x="40" y={INNER_BOTTOM + 8} width="240" height="220" fill={url("milk-round")} />
            {/* A few small bubbles riding the waterline */}
            <g fill="var(--scene-light)" stroke="var(--milk-deep)" strokeWidth="0.4">
              {bubbles.map((b, i) => (
                <circle
                  key={i}
                  className="scene-bubble"
                  cx={b.x}
                  cy={INNER_BOTTOM + b.dy}
                  r={b.r}
                  style={{ animationDelay: `${-b.delay}s` }}
                />
              ))}
            </g>
          </g>
        </g>
      </g>

      {/* The inner wall line, so the glass reads as having thickness */}
      <path d={INNER} fill="none" stroke="var(--glass-outline)" strokeWidth="1" opacity="0.6" />

      {/* The thick glass base, catching the light */}
      <path
        d="M115 250 Q116 256 122 256 L198 256 Q204 256 205 250 L210 262 Q208 278 192 278 L128 278 Q112 278 110 262 Z"
        fill={url("glass-base")}
      />
      <path
        d="M122 266 Q160 272 198 266"
        stroke="var(--scene-light)"
        strokeOpacity="0.75"
        strokeWidth="1.5"
        fill="none"
      />

      {/* Front of the glass: walls, sheen and outline */}
      <path d={OUTER} fill={url("glass")} />
      <path
        d={OUTER}
        fill="none"
        stroke="var(--glass-outline)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d={OUTER}
        fill="none"
        stroke="var(--glass-edge)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />

      {/* Long reflections down both walls, and a glint that sweeps across now and then */}
      <path d="M109 80 L116 80 L125 246 L119 246 Z" fill={url("streak")} opacity="0.9" />
      <path d="M200 84 L204 84 L200 180 L197 180 Z" fill={url("streak")} opacity="0.6" />
      <g clipPath={url("outer")}>
        <path className="scene-glint" d="M70 40 L96 40 L66 300 L40 300 Z" fill={url("glint")} />
      </g>

      {/* The near half of the rim, drawn over everything */}
      <path d="M98 64 A62 6 0 0 0 222 64" fill="none" stroke="var(--glass-edge)" strokeWidth="2" />
      <path
        d="M98 64 A62 6 0 0 1 222 64"
        fill="none"
        stroke="var(--glass-edge)"
        strokeWidth="1.2"
        opacity="0.8"
      />
      <path
        d="M112 68 A48 3.5 0 0 0 150 70.5"
        fill="none"
        stroke="var(--scene-light)"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.9"
      />
    </svg>
  );
}

const INNER_TOP = 66;
const INNER_BOTTOM = 256;
/** The tumbler: tapering slightly, with rounded corners at the foot. */
const OUTER = "M98 64 L110 262 Q112 278 128 278 L192 278 Q208 278 210 262 L222 64 Z";
/** The same shape inset by the thickness of the wall, above the solid base. */
const INNER = `M104 ${INNER_TOP} L115 250 Q116 ${INNER_BOTTOM} 122 ${INNER_BOTTOM} L198 ${INNER_BOTTOM} Q204 ${INNER_BOTTOM} 205 250 L216 ${INNER_TOP} Z`;

/**
 * A rolling surface: 24-unit half-waves, so one 48-unit wavelength. The milk-wave keyframes slide
 * it 96 units (two wavelengths) per loop, so the loop has no seam. It starts left of the glass and
 * runs well past it, so the glass is covered at every point of the slide.
 */
function wave(y: number, depth: number) {
  return `M40 ${y} q12 ${-depth} 24 0` + " t24 0".repeat(15) + ` V 600 H 40 Z`;
}

/** Bubbles along the waterline, near the walls where they collect. */
const bubbles = [
  { x: 122, dy: -1, r: 1.6, delay: 0.4 },
  { x: 128, dy: 1.5, r: 1.1, delay: 1.8 },
  { x: 134, dy: -2, r: 0.9, delay: 2.6 },
  { x: 190, dy: -1.5, r: 1.4, delay: 1.1 },
  { x: 196, dy: 0.8, r: 1.1, delay: 3 },
  { x: 184, dy: 2, r: 0.8, delay: 0.2 },
];

/** Crowns of trees along the far edge of the pasture. */
const trees = [
  { x: -70, y: 176, rx: 40, ry: 26 },
  { x: -20, y: 170, rx: 34, ry: 32 },
  { x: 30, y: 180, rx: 42, ry: 22 },
  { x: 250, y: 172, rx: 38, ry: 30 },
  { x: 300, y: 178, rx: 44, ry: 24 },
  { x: 360, y: 168, rx: 40, ry: 34 },
  { x: 405, y: 180, rx: 30, ry: 22 },
];

/** Out-of-focus light, fixed rather than random so the server and browser draw the same picture. */
const bokeh = [
  { x: -40, y: 70, r: 14, o: 0.35, delay: 0 },
  { x: 20, y: 120, r: 9, o: 0.45, delay: 3 },
  { x: 60, y: 40, r: 6, o: 0.5, delay: 6 },
  { x: 250, y: 90, r: 12, o: 0.35, delay: 2 },
  { x: 300, y: 140, r: 8, o: 0.5, delay: 5 },
  { x: 350, y: 60, r: 16, o: 0.3, delay: 1 },
  { x: 380, y: 130, r: 7, o: 0.45, delay: 4 },
  { x: -60, y: 150, r: 7, o: 0.4, delay: 7 },
];

/**
 * Seams between the planks, as multiples of a plank's width either side of the middle. The planks
 * run away from the viewer, so each seam fans out towards the front of the table.
 */
const planks = [-3.5, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 3.5];
