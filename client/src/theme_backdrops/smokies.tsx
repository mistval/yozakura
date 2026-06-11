type Peak = [number, number];

// Smooth mountain path through peaks (quadratic curves between midpoints)
function mountainPath(peaks: Peak[], baseY = 600): string {
  let d = `M 0 ${peaks[0]![1]} `;
  for (let i = 0; i < peaks.length - 1; i++) {
    const [x1, y1] = peaks[i]!;
    const [x2, y2] = peaks[i + 1]!;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    d += `Q ${x1} ${y1} ${mx} ${my} `;
  }
  const last = peaks[peaks.length - 1]!;
  d += `Q ${last[0]} ${last[1]} 1400 ${last[1] + 10} `;
  d += `L 1400 ${baseY} L 0 ${baseY} Z`;
  return d;
}

// Seeded RNG so peaks are deterministic (no SSR hydration mismatch)
function makePeaks(seed: number, baseY: number, amplitude: number, count: number): Peak[] {
  const peaks: Peak[] = [];
  let rng = seed;
  const next = () => {
    rng = (rng * 9301 + 49297) % 233280;
    return rng / 233280;
  };
  const step = 1400 / count;
  for (let i = 0; i <= count; i++) {
    const x = i * step + (next() - 0.5) * step * 0.4;
    const variation = (next() - 0.5) * amplitude * 1.4;
    peaks.push([x, baseY + variation]);
  }
  return peaks;
}

// Carve a smooth valley in a peak series so the sun can show through
function carveValley(peaks: Peak[], centerX: number, depth: number, width: number): Peak[] {
  return peaks.map(([x, y]) => {
    const dist = Math.abs(x - centerX);
    if (dist < width) {
      const factor = Math.cos((dist / width) * (Math.PI / 2));
      return [x, y + depth * factor] as Peak;
    }
    return [x, y] as Peak;
  });
}

// Build all peak series once at module load (pure, deterministic)
const farPeaks = carveValley(makePeaks(1, 425, 55, 10), 780, 30, 240);
const midPeaks = carveValley(makePeaks(7, 475, 38, 11), 780, 22, 200);
const nearPeaks = makePeaks(13, 510, 28, 12);
const hillPeaks = makePeaks(21, 555, 12, 18);

const farPath = mountainPath(farPeaks);
const midPath = mountainPath(midPeaks);
const nearPath = mountainPath(nearPeaks);
const hillPath = mountainPath(hillPeaks);

interface CirrusSpec {
  x: number;
  y: number;
  w: number;
  angle: number;
  strokes: number;
  opacity: number;
}

const cirrusSpecs: CirrusSpec[] = [
  { x: 80, y: 70, w: 200, angle: -3, strokes: 7, opacity: 0.75 },
  { x: 340, y: 105, w: 160, angle: 2, strokes: 5, opacity: 0.6 },
  { x: 820, y: 90, w: 180, angle: 4, strokes: 6, opacity: 0.65 },
  { x: 1020, y: 135, w: 140, angle: -1, strokes: 5, opacity: 0.55 },
  { x: 1140, y: 60, w: 220, angle: 3, strokes: 7, opacity: 0.75 },
  { x: 230, y: 175, w: 130, angle: 5, strokes: 4, opacity: 0.5 },
  { x: 680, y: 195, w: 150, angle: -2, strokes: 5, opacity: 0.55 },
];

interface CirrusStroke {
  d: string;
  strokeWidth: number;
  opacity: number;
}

function buildWisp(c: CirrusSpec, idx: number): { groupOpacity: number; strokes: CirrusStroke[] } {
  let rng = idx * 7 + 11;
  const next = () => {
    rng = (rng * 9301 + 49297) % 233280;
    return rng / 233280;
  };
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

const trees: Array<[number, number, number, 'dark' | 'mid' | 'light']> = [
  [60, 545, 70, 'mid'],
  [130, 555, 58, 'dark'],
  [195, 548, 75, 'mid'],
  [255, 558, 52, 'light'],
  [320, 542, 80, 'dark'],
  [395, 552, 62, 'mid'],
  [460, 548, 70, 'dark'],
  [535, 556, 55, 'light'],
  [600, 545, 78, 'mid'],
  [675, 550, 65, 'dark'],
  [745, 555, 58, 'mid'],
  [815, 545, 74, 'dark'],
  [885, 552, 62, 'light'],
  [955, 547, 72, 'mid'],
  [1025, 555, 56, 'dark'],
  [1095, 548, 68, 'mid'],
  [1165, 553, 60, 'light'],
  [1235, 545, 76, 'dark'],
  [1310, 552, 64, 'mid'],
  [1370, 557, 54, 'dark'],
];

const treeColors = { dark: '#2a4536', mid: '#3a5945', light: '#4e7058' } as const;
const treeShadows = { dark: '#1f3528', mid: '#2d4836', light: '#3d5c47' } as const;

function Pine({
  x,
  baseY,
  height,
  palette,
}: {
  x: number;
  baseY: number;
  height: number;
  palette: 'dark' | 'mid' | 'light';
}) {
  const w = height * 0.5;
  const trunkH = height * 0.1;
  const trunkW = height * 0.06;
  const foliageTop = baseY - height;
  const foliageBottom = baseY - trunkH;
  const halfW = w / 2;
  const fill = treeColors[palette];
  const shadow = treeShadows[palette];
  const h = foliageBottom - foliageTop;
  return (
    <g>
      <rect x={x - trunkW / 2} y={foliageBottom} width={trunkW} height={trunkH} fill="#3a2a1f" />
      <polygon
        points={`${x},${foliageTop} ${x - halfW},${foliageBottom} ${x + halfW},${foliageBottom}`}
        fill={fill}
      />
      {[1, 2].map((i) => {
        const yLine = foliageTop + h * (i / 3);
        const hw = halfW * (i / 3);
        return (
          <polygon
            key={i}
            points={`${x},${yLine - 4} ${x - hw - 2},${yLine + 6} ${x + hw + 2},${yLine + 6}`}
            fill={shadow}
            opacity={0.35}
          />
        );
      })}
    </g>
  );
}

export default function Smokies() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1400 600"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className="smokies-svg"
    >
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#bcc9dc" />
          <stop offset="40%" stopColor="#e0ccbd" />
          <stop offset="72%" stopColor="#f3c498" />
          <stop offset="100%" stopColor="#eab088" />
        </linearGradient>
        <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff4d6" stopOpacity="0.95" />
          <stop offset="35%" stopColor="#ffd89a" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffb878" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="mtnFar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a4b2c2" />
          <stop offset="100%" stopColor="#bcc4cf" />
        </linearGradient>
        <linearGradient id="mtnMid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#73838f" />
          <stop offset="100%" stopColor="#8a98a6" />
        </linearGradient>
        <linearGradient id="mtnNear" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4a5d66" />
          <stop offset="100%" stopColor="#5e727c" />
        </linearGradient>
        <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5a7560" />
          <stop offset="100%" stopColor="#3a4e3e" />
        </linearGradient>
      </defs>

      {/* Sky */}
      <rect width="1400" height="600" fill="url(#sky)" />

      {/* Sun glow halo — drawn before mountains so they overlap its edges */}
      <circle cx="780" cy="415" r="220" fill="url(#sunGlow)" />

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

      {/* Sun disc */}
      <circle cx="780" cy="415" r="52" fill="#fff0c8" opacity={0.92} />
      <circle cx="780" cy="415" r="42" fill="#ffe8a8" />

      {/* Mountain layers (back to front) */}
      <path d={farPath} fill="url(#mtnFar)" />
      <path d={midPath} fill="url(#mtnMid)" />
      <path d={nearPath} fill="url(#mtnNear)" />

      {/* Foreground hill */}
      <path d={hillPath} fill="url(#ground)" />

      {/* Trees */}
      {trees.map(([x, baseY, h, palette], i) => (
        <Pine key={`tree-${i}`} x={x} baseY={baseY} height={h} palette={palette} />
      ))}
    </svg>
  );
}
