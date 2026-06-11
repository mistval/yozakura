// Seeded RNG — deterministic, so the same wave/foam pattern renders on
// every refresh (no SSR hydration mismatch).
function makeRng(seed: number) {
  let rng = seed;
  return () => {
    rng = (rng * 9301 + 49297) % 233280;
    return rng / 233280;
  };
}

// ─── Wave band ─────────────────────────────────────────────────────
// Each receding band is a wavy horizontal strip; composite sines give
// an organic, non-uniform top edge.
interface BandOptions {
  baseY: number;
  amps: number[];
  freqs: number[];
  phases: number[];
  bandHeight: number;
  jitter?: number;
  seed?: number;
}

interface Band {
  d: string;
  points: [number, number][];
}

function waveBand({ baseY, amps, freqs, phases, bandHeight, jitter = 0, seed = 1 }: BandOptions): Band {
  const next = makeRng(seed);
  const points: [number, number][] = [];
  const step = 8;
  for (let x = -30; x <= 1430; x += step) {
    let y = baseY;
    for (let i = 0; i < amps.length; i++) {
      y += Math.sin(x / freqs[i]! + phases[i]!) * amps[i]!;
    }
    y += (next() - 0.5) * jitter;
    points.push([x, y]);
  }
  let d = `M ${points[0]![0]} ${points[0]![1]} `;
  for (let i = 1; i < points.length; i++) {
    const [px, py] = points[i - 1]!;
    const [x, y] = points[i]!;
    const mx = (px + x) / 2;
    const my = (py + y) / 2;
    d += `Q ${px} ${py} ${mx} ${my} `;
  }
  d += `L 1430 ${baseY + bandHeight} L -30 ${baseY + bandHeight} Z`;
  return { d, points };
}

// Find crest points (local maxima — visually peaks) on a wave's top edge
interface CrestFinderOpts {
  minProminence: number;
  minSpacing: number;
  density: number;
  seed: number;
}

function findCrests(points: [number, number][], opts: CrestFinderOpts) {
  const next = makeRng(opts.seed);
  const crests: { x: number; y: number }[] = [];
  for (let i = 4; i < points.length - 4; i++) {
    const [x, y] = points[i]!;
    const isPeak =
      y < points[i - 2]![1] && y < points[i + 2]![1] && y < points[i - 4]![1] && y < points[i + 4]![1];
    if (!isPeak) continue;
    const neighborY = (points[i - 4]![1] + points[i + 4]![1]) / 2;
    if (neighborY - y < opts.minProminence) continue;
    if (crests.length && x - crests[crests.length - 1]!.x < opts.minSpacing) continue;
    if (next() > opts.density) continue;
    crests.push({ x, y });
  }
  return crests;
}

// Whitecaps: each is 2-4 small overlapping circles, suggesting a foam patch.
interface WhitecapOpts extends CrestFinderOpts {
  size: number;
  fill: string;
  opacity: number;
}

interface FoamCircle {
  cx: number;
  cy: number;
  r: number;
  fill: string;
  opacity: number;
}

function buildWhitecaps(points: [number, number][], opts: WhitecapOpts): FoamCircle[] {
  const next = makeRng(opts.seed);
  const crests = findCrests(points, opts);
  const circles: FoamCircle[] = [];
  for (const { x, y } of crests) {
    const n = 2 + Math.floor(next() * 3);
    for (let j = 0; j < n; j++) {
      const dx = (next() - 0.5) * opts.size * 3.5;
      const dy = (next() - 0.5) * opts.size * 0.8;
      const r = opts.size * (0.6 + next() * 0.6);
      circles.push({
        cx: x + dx,
        cy: y + dy,
        r,
        fill: opts.fill,
        opacity: opts.opacity * (0.7 + next() * 0.3),
      });
    }
  }
  return circles;
}

// ─── Build bands ───
const band1 = waveBand({
  baseY: 305,
  amps: [2, 1.2],
  freqs: [40, 18],
  phases: [0, 1.2],
  bandHeight: 50,
  jitter: 0.8,
  seed: 1,
});
const band2 = waveBand({
  baseY: 335,
  amps: [4, 2, 1],
  freqs: [55, 25, 12],
  phases: [1.5, 0.3, 2.1],
  bandHeight: 55,
  jitter: 1.2,
  seed: 2,
});
const band3 = waveBand({
  baseY: 370,
  amps: [7, 3.5, 1.5],
  freqs: [70, 30, 14],
  phases: [2.7, 1.1, 0.6],
  bandHeight: 60,
  jitter: 1.8,
  seed: 3,
});
const band4 = waveBand({
  baseY: 410,
  amps: [10, 5, 2],
  freqs: [85, 38, 16],
  phases: [0.9, 2.4, 1.8],
  bandHeight: 70,
  jitter: 2.5,
  seed: 4,
});
const band5 = waveBand({
  baseY: 455,
  amps: [14, 7, 3],
  freqs: [100, 45, 20],
  phases: [3.6, 1.7, 2.8],
  bandHeight: 80,
  jitter: 3.5,
  seed: 5,
});
const band6 = waveBand({
  baseY: 505,
  amps: [20, 10, 4],
  freqs: [120, 55, 24],
  phases: [1.9, 3.1, 0.4],
  bandHeight: 95,
  jitter: 4.5,
  seed: 6,
});

const caps = buildWhitecaps(band2.points, {
  size: 1.6,
  minProminence: 1.5,
  minSpacing: 110,
  density: 0.4,
  fill: '#c8cfd4',
  opacity: 0.55,
  seed: 22,
}).concat(
  buildWhitecaps(band3.points, {
    size: 2,
    minProminence: 2,
    minSpacing: 130,
    density: 0.4,
    fill: '#ced5da',
    opacity: 0.6,
    seed: 33,
  }),
  buildWhitecaps(band4.points, {
    size: 2.6,
    minProminence: 2.5,
    minSpacing: 160,
    density: 0.4,
    fill: '#d6dce0',
    opacity: 0.65,
    seed: 44,
  }),
  buildWhitecaps(band5.points, {
    size: 3.2,
    minProminence: 3,
    minSpacing: 200,
    density: 0.4,
    fill: '#dee4e8',
    opacity: 0.7,
    seed: 55,
  }),
  buildWhitecaps(band6.points, {
    size: 4,
    minProminence: 4,
    minSpacing: 240,
    density: 0.45,
    fill: '#e3e8eb',
    opacity: 0.72,
    seed: 66,
  })
);

// ─── Cresting foreground wave ──────────────────────────────────────
// Asymmetric: gentler rise on the left, steeper drop on the right.
const crestBaseY = 560;

function buildCrestContour() {
  const pts: [number, number][] = [];
  const step = 6;
  for (let x = -30; x <= 1430; x += step) {
    const swell = Math.sin((x - 200) / 280) * 5;
    const ripple = Math.sin((x - 100) / 90) * 2.5;
    const dx = x - 720;
    const widthScale = dx < 0 ? 280 : 180;
    const centralBoost = -82 * Math.exp(-Math.pow(dx / widthScale, 2));
    pts.push([x, crestBaseY + swell + ripple + centralBoost]);
  }
  return pts;
}

const crestContour = buildCrestContour();

function buildCrestBodyPath(pts: [number, number][]) {
  let d = `M ${pts[0]![0]} ${pts[0]![1]} `;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1]!;
    const [x, y] = pts[i]!;
    const mx = (px + x) / 2;
    const my = (py + y) / 2;
    d += `Q ${px} ${py} ${mx} ${my} `;
  }
  const last = pts[pts.length - 1]!;
  d += `L ${last[0]} ${last[1]} L 1430 620 L -30 620 Z`;
  return d;
}
const crestBodyPath = buildCrestBodyPath(crestContour);

// Foam: two passes of overlapping circles for volume, plus spray droplets.
function buildFoamCircles(): FoamCircle[] {
  const next = makeRng(777);
  const cx = 720;
  const halfWLeft = 310;
  const halfWRight = 210;
  const result: FoamCircle[] = [];
  // Base layer — chunky white
  for (const [x, y] of crestContour) {
    const dx = x - cx;
    const halfW = dx < 0 ? halfWLeft : halfWRight;
    if (Math.abs(dx) > halfW) continue;
    const edgeT = Math.abs(dx) / halfW;
    if (edgeT > 0.85) continue;
    if (next() > 0.95) continue;
    const r = (7 + next() * 5) * (1 - edgeT * 0.3);
    if (r < 3) continue;
    const yOff = -r * 0.35 + (next() - 0.5) * 2;
    const xOff = (next() - 0.5) * 3;
    const gs = Math.floor(next() * 14);
    result.push({
      cx: x + xOff,
      cy: y + yOff,
      r,
      fill: `rgb(${215 + gs},${222 + gs},${226 + gs})`,
      opacity: 1,
    });
  }
  // Highlight layer — slightly higher, gives the crown volume
  for (const [x, y] of crestContour) {
    const dx = x - cx;
    const halfW = (dx < 0 ? halfWLeft : halfWRight) * 0.7;
    if (Math.abs(dx) > halfW) continue;
    const edgeT = Math.abs(dx) / halfW;
    if (next() > 0.65 * (1 - edgeT * 0.4)) continue;
    const r = (4 + next() * 4) * (1 - edgeT * 0.3);
    if (r < 2.5) continue;
    const yOff = -r * 1.2 + (next() - 0.5) * 2;
    const xOff = (next() - 0.5) * 3;
    result.push({
      cx: x + xOff,
      cy: y + yOff,
      r,
      fill: '#ecf0f2',
      opacity: 1,
    });
  }
  // Spray droplets above the peak
  for (let i = 0; i < 18; i++) {
    const angle = -Math.PI / 2 + (next() - 0.5) * 1.4;
    const dist = 14 + next() * 55;
    const dx = cx + Math.cos(angle) * dist;
    const dy = 478 + Math.sin(angle) * dist * 0.45;
    const r = 1 + next() * 2.2;
    result.push({
      cx: dx,
      cy: dy,
      r,
      fill: '#e8edf0',
      opacity: 0.5 + next() * 0.4,
    });
  }
  return result;
}

const foamCircles = buildFoamCircles();

// ─── Birds ───
const birds = [
  { x: 180, y: 130, scale: 1.0, opacity: 0.7 },
  { x: 260, y: 165, scale: 0.7, opacity: 0.6 },
  { x: 540, y: 90, scale: 1.15, opacity: 0.75 },
  { x: 620, y: 145, scale: 0.85, opacity: 0.65 },
  { x: 760, y: 180, scale: 0.55, opacity: 0.5 },
  { x: 920, y: 110, scale: 1.0, opacity: 0.7 },
  { x: 1050, y: 160, scale: 0.75, opacity: 0.6 },
  { x: 1180, y: 95, scale: 0.9, opacity: 0.7 },
  { x: 1280, y: 175, scale: 0.6, opacity: 0.55 },
];

function birdPath({ x, y, scale }: { x: number; y: number; scale: number }) {
  const wing = 14 * scale;
  const arch = 5 * scale;
  return `M ${x - wing} ${y} Q ${x - wing / 2} ${y - arch * 2.2} ${x} ${y} Q ${x + wing / 2} ${y - arch * 2.2} ${x + wing} ${y}`;
}

// ─── Cirrus ───
interface CirrusSpec {
  x: number;
  y: number;
  w: number;
  angle: number;
  strokes: number;
  opacity: number;
}

const cirrusSpecs: CirrusSpec[] = [
  { x: 50, y: 60, w: 220, angle: -2, strokes: 7, opacity: 0.55 },
  { x: 380, y: 95, w: 180, angle: 3, strokes: 6, opacity: 0.5 },
  { x: 700, y: 50, w: 250, angle: -3, strokes: 8, opacity: 0.6 },
  { x: 1020, y: 80, w: 200, angle: 2, strokes: 6, opacity: 0.5 },
  { x: 1220, y: 130, w: 160, angle: 4, strokes: 5, opacity: 0.45 },
  { x: 240, y: 210, w: 140, angle: 2, strokes: 4, opacity: 0.4 },
  { x: 880, y: 220, w: 160, angle: -2, strokes: 5, opacity: 0.4 },
];

interface CirrusStroke {
  d: string;
  strokeWidth: number;
  opacity: number;
}

function buildWisp(c: CirrusSpec, idx: number): { groupOpacity: number; strokes: CirrusStroke[] } {
  const next = makeRng(idx * 7 + 11);
  const strokes: CirrusStroke[] = [];
  for (let s = 0; s < c.strokes; s++) {
    const t = s / (c.strokes - 1);
    const yOffset = (t - 0.5) * 14 + Math.sin(t * Math.PI) * -3;
    const lenFactor = 0.55 + next() * 0.5;
    const startOffset = next() * c.w * 0.25;
    const x1 = c.x + startOffset;
    const x2 = c.x + startOffset + c.w * lenFactor;
    const y1 = c.y + yOffset + c.angle * (startOffset / c.w);
    const y2 = c.y + yOffset + (c.angle * (x2 - c.x)) / c.w;
    const bow = 6 + Math.sin(t * Math.PI) * 8;
    const cx = (x1 + x2) / 2 + (next() - 0.5) * 20;
    const cy = (y1 + y2) / 2 - bow;
    const sw = 0.6 + Math.sin(t * Math.PI) * 1.3;
    const strokeOp = 0.4 + Math.sin(t * Math.PI) * 0.6;
    strokes.push({
      d: `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`,
      strokeWidth: parseFloat(sw.toFixed(2)),
      opacity: parseFloat(strokeOp.toFixed(2)),
    });
  }
  return { groupOpacity: c.opacity, strokes };
}

const cirrusData = cirrusSpecs.map((c, i) => buildWisp(c, i));

export default function SubduedOcean() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1400 600"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className="ocean-svg"
    >
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a8b4c0" />
          <stop offset="60%" stopColor="#bcc6cf" />
          <stop offset="100%" stopColor="#c8ced3" />
        </linearGradient>
        <linearGradient id="water1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7d8d99" />
          <stop offset="100%" stopColor="#6d808d" />
        </linearGradient>
        <linearGradient id="water2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#66798a" />
          <stop offset="100%" stopColor="#566a7c" />
        </linearGradient>
        <linearGradient id="water3" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#536a7b" />
          <stop offset="100%" stopColor="#445b6c" />
        </linearGradient>
        <linearGradient id="water4" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#425a6c" />
          <stop offset="100%" stopColor="#344c5d" />
        </linearGradient>
        <linearGradient id="water5" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#324a5b" />
          <stop offset="100%" stopColor="#243c4e" />
        </linearGradient>
        <linearGradient id="water6" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#223948" />
          <stop offset="100%" stopColor="#152734" />
        </linearGradient>
        <linearGradient id="crest" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0c1c2a" />
          <stop offset="100%" stopColor="#06121e" />
        </linearGradient>
      </defs>

      {/* Sky */}
      <rect width="1400" height="600" fill="url(#sky)" />

      {/* Cirrus wisps */}
      <g stroke="#ffffff" fill="none" strokeLinecap="round">
        {cirrusData.map((wisp, i) => (
          <g key={`cirrus-${i}`} opacity={wisp.groupOpacity}>
            {wisp.strokes.map((s, j) => (
              <path key={j} d={s.d} strokeWidth={s.strokeWidth} opacity={s.opacity} />
            ))}
          </g>
        ))}
      </g>

      {/* Birds */}
      {birds.map((b, i) => (
        <path
          key={`bird-${i}`}
          d={birdPath(b)}
          stroke="#4a5560"
          strokeWidth={1.4 * b.scale}
          fill="none"
          strokeLinecap="round"
          opacity={b.opacity}
        />
      ))}

      {/* Receding water bands (back to front) */}
      <path d={band1.d} fill="url(#water1)" />
      <path d={band2.d} fill="url(#water2)" />
      <path d={band3.d} fill="url(#water3)" />
      <path d={band4.d} fill="url(#water4)" />
      <path d={band5.d} fill="url(#water5)" />
      <path d={band6.d} fill="url(#water6)" />

      {/* Whitecaps on the receding bands */}
      {caps.map((c, i) => (
        <circle
          key={`cap-${i}`}
          cx={c.cx.toFixed(1)}
          cy={c.cy.toFixed(1)}
          r={c.r.toFixed(1)}
          fill={c.fill}
          opacity={c.opacity.toFixed(2)}
        />
      ))}

      {/* Cresting foreground wave body */}
      <path d={crestBodyPath} fill="url(#crest)" />

      {/* Foam crown + spray */}
      {foamCircles.map((c, i) => (
        <circle
          key={`foam-${i}`}
          cx={c.cx.toFixed(1)}
          cy={c.cy.toFixed(1)}
          r={c.r.toFixed(1)}
          fill={c.fill}
          opacity={c.opacity === 1 ? undefined : c.opacity.toFixed(2)}
        />
      ))}
    </svg>
  );
}
