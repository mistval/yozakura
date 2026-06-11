import { useId, type CSSProperties, type SVGProps } from 'react';

/**
 * YozakuraLogo — a transparent, themeable SVG recreation of the yozakura
 * cherry-blossom (sakura) mark and wordmark.
 *
 * ── Theming ────────────────────────────────────────────────────────────────
 * Colors are driven by CSS custom properties, so you can restyle the whole
 * logo from a stylesheet without touching the component:
 *
 *   .my-logo {
 *     --yz-petal-from: #ffd1e8;   // top of the flower (lightest)
 *     --yz-petal-to:   #7a3f9e;   // bottom of the flower (darkest)
 *     --yz-text-from:  #d9a0c0;   // wordmark, top
 *     --yz-text-to:    #6b3a55;   // wordmark, bottom
 *     --yz-stamen:     #1e1426;   // the radiating stamens + center dot
 *   }
 *
 * You can also pass any of these as props (props win over inherited CSS).
 *
 * ── Font ───────────────────────────────────────────────────────────────────
 * The wordmark uses "Cormorant Garamond" (Google Fonts) — an elegant
 * high-contrast serif that matches the original. By default the component
 * @imports it for you. If you already load fonts globally, set
 * `loadFont={false}` and just make sure Cormorant Garamond is available.
 * Good alternatives: "EB Garamond", "Cormorant", or "Playfair Display".
 */

type Pt = [number, number];
type Seg =
  | { c: 'M' | 'L' | 'C'; p: Pt[] }
  // Circular arc: radius + flags + the single end point it sweeps to.
  | { c: 'A'; r: number; large: 0 | 1; sweep: 0 | 1; end: Pt }
  | { c: 'Z' };

// One petal, drawn pointing straight up with its base at the flower center.
// Each side is a SINGLE circular arc (the `A` command): just two endpoints and a
// radius, no off-curve control handles — so the edge is smooth by construction
// and can't develop a bump. The outline was traced from the reference image; the
// side happens to sit almost exactly on a circle of this radius. The base curves
// flare inward to the center so the five petals overlap there (no cavity), and
// the tip is a sharp, straight-edged triangular notch.
const PETAL_R = 100; // radius of the arc forming each petal side

const PETAL: Seg[] = [
  { c: 'M', p: [[0, -156]] }, // notch valley
  { c: 'L', p: [[17.5, -175]] }, // straight edge up to the right horn
  { c: 'A', r: PETAL_R, large: 0, sweep: 1, end: [26, -35] }, // right side: horn → base corner
  {
    c: 'C',
    p: [
      [16, -16],
      [7, -6],
      [0, -3],
    ],
  }, // base → center
  {
    c: 'C',
    p: [
      [-7, -6],
      [-16, -16],
      [-26, -35],
    ],
  }, // center → left base corner
  { c: 'A', r: PETAL_R, large: 0, sweep: 1, end: [-17.5, -175] }, // left side: base corner → left horn
  { c: 'L', p: [[0, -156]] }, // straight edge back to the notch valley
  { c: 'Z' },
];

function rotate([x, y]: Pt, deg: number, [cx, cy]: Pt, s = 1): Pt {
  const a = (deg * Math.PI) / 180;
  const X = x * s;
  const Y = y * s;
  return [X * Math.cos(a) - Y * Math.sin(a) + cx, X * Math.sin(a) + Y * Math.cos(a) + cy];
}

// Build an absolute path string for the petal rotated by `deg` around `center`.
// Paths are pre-rotated into user space (no per-element transforms) so a single
// vertical gradient flows correctly across the whole flower.
function petalPath(deg: number, center: Pt, s = 1): string {
  return PETAL.map((seg) => {
    if (seg.c === 'Z') return 'Z';
    if (seg.c === 'A') {
      const [ex, ey] = rotate(seg.end, deg, center, s);
      const r = (seg.r * s).toFixed(2);
      // A circle (rx === ry) is rotation-invariant, so x-axis-rotation stays 0
      // even when the whole petal is rotated into place.
      return `A${r} ${r} 0 ${seg.large} ${seg.sweep} ${ex.toFixed(2)},${ey.toFixed(2)}`;
    }
    const coords = seg.p
      .map((pt) => {
        const [rx, ry] = rotate(pt, deg, center, s);
        return `${rx.toFixed(2)},${ry.toFixed(2)}`;
      })
      .join(' ');
    return `${seg.c}${coords}`;
  }).join(' ');
}

const FONT_SIZE = 88;
const LETTER_SPACING = 10; // user units (= 0.2em at this size)
const FONT_STACK = "'Cormorant Garamond', 'EB Garamond', 'Cormorant', Georgia, serif";

interface YozakuraLogoProps extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> {
  /** Rendered width in px; height scales to keep the aspect ratio. Default 240. */
  size?: number;
  /** Show the "yozakura" wordmark and side petals. Default true. */
  showWordmark?: boolean;
  /** Inject the Cormorant Garamond @font-face import. Default true. */
  loadFont?: boolean;
  /** Color overrides (equivalent to the matching CSS variables). */
  petalFrom?: string;
  petalTo?: string;
  textFrom?: string;
  textTo?: string;
  stamenColor?: string;
  /** Accessible label. Default "yozakura". */
  title?: string;
}

export default function YozakuraLogo({
  size = 240,
  showWordmark = true,
  loadFont = true,
  petalFrom,
  petalTo,
  textFrom,
  textTo,
  stamenColor,
  title = 'yozakura',
  style,
  ...rest
}: YozakuraLogoProps) {
  const uid = useId().replace(/:/g, '');
  const pg = `${uid}-petal`;
  const tg = `${uid}-text`;

  const vbW = showWordmark ? 400 : 360;
  const vbH = showWordmark ? 470 : 345;
  const center: Pt = [showWordmark ? 200 : 180, 182];
  const width = size;
  const height = +(size * (vbH / vbW)).toFixed(2);

  // Five petals at 72° intervals, top petal pointing up.
  const PETALS = [0, 72, 144, 216, 288].map((d) => petalPath(d, center));

  // Radiating stamens: angle measured clockwise from straight up, length in user
  // units. Traced from the reference — 11 stamens, 5 above the horizontal and 6
  // below, with alternating short/long filaments.
  const STAMENS = [
    { angle: 0, len: 70 },
    { angle: 29, len: 49 },
    { angle: 68, len: 69 }, // above
    { angle: 292, len: 69 },
    { angle: 330, len: 49 }, //                      above
    { angle: 99, len: 48 },
    { angle: 131, len: 68 },
    { angle: 160, len: 52 }, // below
    { angle: 200, len: 52 },
    { angle: 229, len: 69 },
    { angle: 262, len: 49 }, // below
  ].map(({ angle, len }) => {
    const a = (angle * Math.PI) / 180;
    return {
      x: +(center[0] + len * Math.sin(a)).toFixed(2),
      y: +(center[1] - len * Math.cos(a)).toFixed(2),
    };
  });

  // Only set a variable when a prop is supplied, so inherited CSS still works.
  const themeVars: Record<string, string> = {};
  if (petalFrom) themeVars['--yz-petal-from'] = petalFrom;
  if (petalTo) themeVars['--yz-petal-to'] = petalTo;
  if (textFrom) themeVars['--yz-text-from'] = textFrom;
  if (textTo) themeVars['--yz-text-to'] = textTo;
  if (stamenColor) themeVars['--yz-stamen'] = stamenColor;

  const stamenStyle: CSSProperties = {
    fill: 'var(--yz-stamen, #1e1426)',
    stroke: 'var(--yz-stamen, #1e1426)',
  };

  return (
    <>
      {loadFont && (
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500&display=swap');`}</style>
      )}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${vbW} ${vbH}`}
        width={width}
        height={height}
        role="img"
        aria-label={title}
        style={{ ...themeVars, ...style } as CSSProperties}
        {...rest}
      >
        <title>{title}</title>
        <defs>
          {/* Petal gradient: light at the top of the flower → deep at the bottom */}
          <linearGradient id={pg} gradientUnits="userSpaceOnUse" x1="200" y1="12" x2="200" y2="358">
            <stop offset="0%" style={{ stopColor: 'var(--yz-petal-from, #e8a3bd)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--yz-petal-to, #934b74)' }} />
          </linearGradient>

          {/* Separate, deeper gradient for the wordmark + side petals */}
          <linearGradient id={tg} gradientUnits="userSpaceOnUse" x1="200" y1="384" x2="200" y2="418">
            <stop offset="0%" style={{ stopColor: 'var(--yz-text-from, #c97d9f)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--yz-text-to, #7c4360)' }} />
          </linearGradient>
        </defs>

        {/* Flower */}
        <g fill={`url(#${pg})`}>
          {/* center fill — guarantees the petals read as one continuous shape */}
          <circle cx={center[0]} cy={center[1]} r={14} />
          {PETALS.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>

        {/* Stamens (drawn on top of the petals) */}
        <g style={stamenStyle} strokeLinecap="round">
          {STAMENS.map((s, i) => (
            <line key={`l${i}`} x1={center[0]} y1={center[1]} x2={s.x} y2={s.y} strokeWidth={2.4} />
          ))}
          {STAMENS.map((s, i) => (
            <circle key={`c${i}`} cx={s.x} cy={s.y} r={3.8} />
          ))}
          <circle cx={center[0]} cy={center[1]} r={7} />
        </g>

        {/* Wordmark */}
        {showWordmark && (
          <g fill={`url(#${tg})`}>
            <text
              x={200}
              y={415}
              textAnchor="middle"
              fontFamily={FONT_STACK}
              fontWeight={500}
              fontSize={FONT_SIZE}
              letterSpacing={LETTER_SPACING}
            >
              yozakura
            </text>
          </g>
        )}
      </svg>
    </>
  );
}
