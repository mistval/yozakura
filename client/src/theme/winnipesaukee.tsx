// Deterministic seeded RNG (no SSR hydration mismatch).
function makeRng(seed: number) {
  let rng = seed;
  return () => {
    rng = (rng * 9301 + 49297) % 233280;
    return rng / 233280;
  };
}

const HORIZON_Y = 240;
// Text-clear zone reserved for overlay text in the upper-mid-left of the sky.
function inTextZone(x: number, y: number) {
  return x > 350 && x < 700 && y < 100;
}

// ─── Moon ─────────────────────────────────────────────────────────
// Position drives the moonglade — directly below the moon on the water.
const MOON_X = 980;
const MOON_Y = 125;
const MOON_R = 28;

// ─── Stars ────────────────────────────────────────────────────────
interface Star {
  x: number;
  y: number;
  r: number;
  opacity: number;
  warm: boolean;
  glint: boolean;
}

const stars: Star[] = (() => {
  const next = makeRng(444);
  const list: Star[] = [];
  for (let i = 0; i < 280; i++) {
    const r = 0.3 + next() * 1.8;
    const x = next() * 1400;
    const y = 10 + next() * (HORIZON_Y - 20);
    const opacity = 0.4 + next() * 0.6;
    const warm = next() > 0.65;
    const glint = r > 1.5 && next() > 0.5;
    if (inTextZone(x, y)) continue;
    list.push({ x, y, r, opacity, warm, glint });
  }
  return list;
})();

// ─── Milky Way (dense diagonal star band) ─────────────────────────
interface MwStar {
  x: number;
  y: number;
  r: number;
  opacity: number;
  warm: boolean;
}
const milkyWayStars: MwStar[] = (() => {
  const next = makeRng(2222);
  const list: MwStar[] = [];
  for (let i = 0; i < 260; i++) {
    const t = next();
    const x = -50 + t * 1500 + (next() - 0.5) * 90;
    const y = 25 + t * 130 + (next() - 0.5) * 80;
    const r = 0.2 + next() * 0.8;
    const opacity = 0.35 + next() * 0.5;
    const warm = next() > 0.8;
    if (inTextZone(x, y)) continue;
    list.push({ x, y, r, opacity, warm });
  }
  return list;
})();

// ─── Mountain paths ───────────────────────────────────────────────
type Peak = [number, number];
function mountainPath(peaks: Peak[], closeY = HORIZON_Y): string {
  let d = `M -10 ${peaks[0]![1]} `;
  for (let i = 0; i < peaks.length - 1; i++) {
    const [x1, y1] = peaks[i]!;
    const [x2, y2] = peaks[i + 1]!;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    d += `Q ${x1} ${y1} ${mx} ${my} `;
  }
  const last = peaks[peaks.length - 1]!;
  d += `Q ${last[0]} ${last[1]} 1410 ${last[1] + 10} `;
  d += `L 1410 ${closeY} L -10 ${closeY} Z`;
  return d;
}

function makePeaks(seed: number, baseY: number, amplitude: number, count: number): Peak[] {
  const peaks: Peak[] = [];
  const next = makeRng(seed);
  const step = 1400 / count;
  for (let i = 0; i <= count; i++) {
    const x = i * step + (next() - 0.5) * step * 0.4;
    const variation = (next() - 0.5) * amplitude * 1.4;
    peaks.push([x, baseY + variation]);
  }
  return peaks;
}

const farMountainPath = mountainPath(makePeaks(1, 180, 35, 8));
const midMountainPath = mountainPath(makePeaks(7, 215, 18, 12));
const shorePath = mountainPath(makePeaks(13, 238, 8, 20));

// ─── Shore trees ──────────────────────────────────────────────────
interface ShoreTree {
  x: number;
  y: number;
  h: number;
  w: number;
}
const shoreTrees: ShoreTree[] = (() => {
  const next = makeRng(3333);
  const list: ShoreTree[] = [];
  for (let i = 0; i < 60; i++) {
    const h = 6 + next() * 10;
    list.push({
      x: next() * 1400,
      y: 240 + (next() - 0.5) * 6,
      h,
      w: h * 0.4,
    });
  }
  return list;
})();

// ─── Islands ──────────────────────────────────────────────────────
interface Island {
  cx: number;
  cy: number;
  halfW: number;
  h: number;
  trees: { x: number; baseY: number; h: number; w: number }[];
}

const islands: Island[] = (() => {
  const specs: [number, number, number, number, number][] = [
    [220, 320, 50, 8, 4],
    [430, 360, 70, 10, 6],
    [770, 335, 40, 6, 3],
    [1050, 380, 65, 10, 5],
    [1220, 325, 35, 6, 3],
  ];
  return specs.map(([cx, cy, halfW, h, treeCount], i) => {
    const next = makeRng(5000 + i);
    const trees: Island['trees'] = [];
    for (let j = 0; j < treeCount; j++) {
      const tx = cx - halfW * 0.7 + (j / Math.max(1, treeCount - 1)) * halfW * 1.4 + (next() - 0.5) * 6;
      const th = 5 + next() * 6;
      trees.push({ x: tx, baseY: cy - h * 0.5, h: th, w: th * 0.4 });
    }
    return { cx, cy, halfW, h, trees };
  });
})();

// ─── Moonglade wavelets ───────────────────────────────────────────
// Many short horizontal glints concentrated below the moon, brightest at the
// mirror point at the horizon and broadening/dimming toward the viewer.
interface Wavelet {
  x1: number;
  x2: number;
  y: number;
  opacity: number;
  color: string;
  strokeWidth: number;
}

const moongladeWavelets: Wavelet[] = (() => {
  const next = makeRng(8888);
  const list: Wavelet[] = [];
  const COUNT = 380;
  for (let i = 0; i < COUNT; i++) {
    const yT = Math.pow(next(), 0.6);
    const y = HORIZON_Y + 4 + yT * 350;
    const distBelow = y - HORIZON_Y;

    const halfWidth = 12 + Math.pow(distBelow / 350, 0.7) * 175;
    const normalish = next() + next() - 1;
    const x = MOON_X + normalish * halfWidth;

    const len = 2 + Math.pow(next(), 1.5) * (4 + distBelow * 0.08);

    const distFromCenter = Math.abs(x - MOON_X) / Math.max(halfWidth, 1);
    const distFade = 1 - yT * 0.55;
    const centerFade = Math.pow(1 - Math.min(1, distFromCenter), 1.2);
    const opacity = 0.14 + distFade * centerFade * 0.7;

    if (opacity < 0.16) continue;

    list.push({
      x1: x - len / 2,
      x2: x + len / 2,
      y,
      opacity,
      color: next() > 0.5 ? '#fff5d8' : '#fde8b8',
      strokeWidth: 0.6 + next() * 0.7,
    });
  }
  return list;
})();

// ─── Water texture ────────────────────────────────────────────────
// Subtle wavelet hints across the rest of the lake (outside the moonglade) —
// short scattered cool-tinted marks at low opacity. Gives the water a sense
// of surface without competing with the moonglade.
interface WaterMark {
  x1: number;
  x2: number;
  y: number;
  opacity: number;
  color: string;
  strokeWidth: number;
}

const waterTexture: WaterMark[] = (() => {
  const next = makeRng(9999);
  const list: WaterMark[] = [];
  const COUNT = 260;
  for (let i = 0; i < COUNT; i++) {
    const x = next() * 1400;
    const y = HORIZON_Y + 15 + next() * 340;
    const distBelow = y - HORIZON_Y;

    // Skip if inside the moonglade's broad zone
    const gladeHalfWidth = 30 + Math.pow(distBelow / 350, 0.7) * 200;
    if (Math.abs(x - MOON_X) < gladeHalfWidth * 0.75) continue;

    const len = 2 + next() * (4 + distBelow * 0.025);
    const opacity = 0.08 + next() * 0.16;
    const color = next() > 0.85 ? '#5a6878' : '#3a4858';
    const strokeWidth = 0.4 + next() * 0.4;

    list.push({
      x1: x - len / 2,
      x2: x + len / 2,
      y,
      opacity,
      color,
      strokeWidth,
    });
  }
  return list;
})();

// ─── Lake shimmer (subtle background sparkle) ────────────────────
interface Shimmer {
  x: number;
  y: number;
  rx: number;
  ry: number;
  color: string;
  opacity: number;
}
const lakeShimmer: Shimmer[] = (() => {
  const next = makeRng(6666);
  const list: Shimmer[] = [];
  for (let i = 0; i < 30; i++) {
    list.push({
      x: next() * 1400,
      y: HORIZON_Y + 80 + Math.pow(next(), 0.7) * 250,
      rx: 0.3 + next() * 0.6,
      ry: 1.5 + next() * 2,
      color: next() > 0.7 ? '#fff0c8' : '#c0d0e8',
      opacity: 0.2 + next() * 0.25,
    });
  }
  return list;
})();

// ─── Foreground tree silhouettes (the hill we're standing on) ────
interface FgTree {
  x: number;
  baseY: number;
  h: number;
}
const foregroundTrees: FgTree[] = [
  { x: -20, baseY: 600, h: 180 },
  { x: 25, baseY: 600, h: 220 },
  { x: 70, baseY: 600, h: 165 },
  { x: 115, baseY: 600, h: 195 },
  { x: 1280, baseY: 600, h: 175 },
  { x: 1330, baseY: 600, h: 215 },
  { x: 1380, baseY: 600, h: 190 },
  { x: 1420, baseY: 600, h: 165 },
];

function ForegroundTree({ tree }: { tree: FgTree }) {
  const { x, baseY, h } = tree;
  const w = h * 0.32;
  const trunkH = h * 0.08;
  const trunkW = h * 0.04;
  const foliageTop = baseY - h;
  const foliageBottom = baseY - trunkH;
  return (
    <g>
      <rect x={x - trunkW / 2} y={foliageBottom} width={trunkW} height={trunkH} fill="#020407" />
      {[0, 1, 2].map((i) => {
        const tt = i / 3;
        const yTop = foliageTop + (foliageBottom - foliageTop) * tt * 0.7;
        const yBot = foliageTop + (foliageBottom - foliageTop) * (tt * 0.7 + 0.4);
        const tw = w * (0.4 + tt * 0.6);
        return <polygon key={i} points={`${x},${yTop} ${x - tw},${yBot} ${x + tw},${yBot}`} fill="#020407" />;
      })}
    </g>
  );
}

// ─── Moon component ──────────────────────────────────────────────
function Moon() {
  return (
    <g>
      {/* Halo rings — outer faint, inner brighter */}
      <circle cx={MOON_X} cy={MOON_Y} r={MOON_R * 4} fill="#fff5d0" opacity={0.04} />
      <circle cx={MOON_X} cy={MOON_Y} r={MOON_R * 2.6} fill="#fff0c8" opacity={0.08} />
      <circle cx={MOON_X} cy={MOON_Y} r={MOON_R * 1.7} fill="#fff0c8" opacity={0.14} />
      <circle cx={MOON_X} cy={MOON_Y} r={MOON_R * 1.25} fill="#fdf4d8" opacity={0.28} />
      {/* Moon body */}
      <circle cx={MOON_X} cy={MOON_Y} r={MOON_R} fill="#fdf4d8" />
      {/* Subtle surface craters */}
      <circle
        cx={MOON_X - MOON_R * 0.3}
        cy={MOON_Y - MOON_R * 0.1}
        r={MOON_R * 0.16}
        fill="#e8dfb8"
        opacity={0.45}
      />
      <circle
        cx={MOON_X + MOON_R * 0.25}
        cy={MOON_Y + MOON_R * 0.25}
        r={MOON_R * 0.11}
        fill="#e8dfb8"
        opacity={0.35}
      />
      <circle
        cx={MOON_X - MOON_R * 0.08}
        cy={MOON_Y + MOON_R * 0.42}
        r={MOON_R * 0.13}
        fill="#e8dfb8"
        opacity={0.3}
      />
      <circle
        cx={MOON_X + MOON_R * 0.45}
        cy={MOON_Y - MOON_R * 0.2}
        r={MOON_R * 0.07}
        fill="#e8dfb8"
        opacity={0.3}
      />
    </g>
  );
}

export default function LakeWinnipesaukee() {
  // Moonlight wash — a single elongated ellipse positioned so its TOP edge
  // sits exactly at the horizon (where the moon's mirror point is). The
  // radial gradient hot spot is at cy=0% (top of the ellipse), so the
  // brightest moonlight emerges from horizon and fades down into the lake.
  const washRx = 70;
  const washRy = 280;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1400 600"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className="winnipesaukee-svg"
    >
      <defs>
        <linearGradient id="winniSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#050818" />
          <stop offset="60%" stopColor="#0a1428" />
          <stop offset="100%" stopColor="#152038" />
        </linearGradient>
        <linearGradient id="winniLake" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0c1626" />
          <stop offset="50%" stopColor="#0a121f" />
          <stop offset="100%" stopColor="#060c14" />
        </linearGradient>
        <radialGradient id="moonlightWash" cx="50%" cy="0%" r="55%">
          <stop offset="0%" stopColor="#fff0c8" stopOpacity={0.32} />
          <stop offset="40%" stopColor="#fff0c8" stopOpacity={0.1} />
          <stop offset="100%" stopColor="#fff0c8" stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* Sky */}
      <rect width="1400" height="600" fill="url(#winniSky)" />

      {/* Milky Way diagonal star density */}
      {milkyWayStars.map((s, i) => (
        <circle
          key={`mw-${i}`}
          cx={s.x.toFixed(1)}
          cy={s.y.toFixed(1)}
          r={s.r.toFixed(1)}
          fill={s.warm ? '#ffe8c0' : '#f8f4e8'}
          opacity={s.opacity.toFixed(2)}
        />
      ))}

      {/* Stars */}
      {stars.map((s, i) => {
        const color = s.warm ? '#fff0c8' : '#f0f4ff';
        return (
          <g key={`star-${i}`}>
            <circle
              cx={s.x.toFixed(1)}
              cy={s.y.toFixed(1)}
              r={s.r.toFixed(1)}
              fill={color}
              opacity={s.opacity.toFixed(2)}
            />
            {s.glint && (
              <>
                <line
                  x1={(s.x - s.r * 3).toFixed(1)}
                  y1={s.y.toFixed(1)}
                  x2={(s.x + s.r * 3).toFixed(1)}
                  y2={s.y.toFixed(1)}
                  stroke={color}
                  strokeWidth={0.3}
                  opacity={(s.opacity * 0.6).toFixed(2)}
                />
                <line
                  x1={s.x.toFixed(1)}
                  y1={(s.y - s.r * 3).toFixed(1)}
                  x2={s.x.toFixed(1)}
                  y2={(s.y + s.r * 3).toFixed(1)}
                  stroke={color}
                  strokeWidth={0.3}
                  opacity={(s.opacity * 0.6).toFixed(2)}
                />
              </>
            )}
          </g>
        );
      })}

      {/* Moon */}
      <Moon />

      {/* Mountain silhouettes — far to near */}
      <path d={farMountainPath} fill="#1a2030" />
      <path d={midMountainPath} fill="#10162a" />
      <path d={shorePath} fill="#080c1a" />

      {/* Shore trees */}
      {shoreTrees.map((t, i) => (
        <polygon
          key={`st-${i}`}
          points={`${t.x.toFixed(1)},${(t.y - t.h).toFixed(1)} ${(t.x - t.w).toFixed(1)},${t.y.toFixed(1)} ${(t.x + t.w).toFixed(1)},${t.y.toFixed(1)}`}
          fill="#040810"
        />
      ))}

      {/* Lake water */}
      <rect x={0} y={HORIZON_Y} width={1400} height={600 - HORIZON_Y} fill="url(#winniLake)" />

      {/* Subtle cool water texture across the lake (outside the moonglade) */}
      {waterTexture.map((w, i) => (
        <line
          key={`wt-${i}`}
          x1={w.x1.toFixed(1)}
          y1={w.y.toFixed(1)}
          x2={w.x2.toFixed(1)}
          y2={w.y.toFixed(1)}
          stroke={w.color}
          strokeWidth={w.strokeWidth.toFixed(1)}
          opacity={w.opacity.toFixed(2)}
          strokeLinecap="round"
        />
      ))}

      {/* Moonlight wash — soft warm glow extending down from the horizon */}
      <ellipse cx={MOON_X} cy={HORIZON_Y + washRy} rx={washRx} ry={washRy} fill="url(#moonlightWash)" />

      {/* Moonglade wavelet glints */}
      {moongladeWavelets.map((w, i) => (
        <line
          key={`mg-${i}`}
          x1={w.x1.toFixed(1)}
          y1={w.y.toFixed(1)}
          x2={w.x2.toFixed(1)}
          y2={w.y.toFixed(1)}
          stroke={w.color}
          strokeWidth={w.strokeWidth.toFixed(1)}
          opacity={w.opacity.toFixed(2)}
          strokeLinecap="round"
        />
      ))}

      {/* Subtle lake shimmer */}
      {lakeShimmer.map((s, i) => (
        <ellipse
          key={`shim-${i}`}
          cx={s.x.toFixed(1)}
          cy={s.y.toFixed(1)}
          rx={s.rx.toFixed(1)}
          ry={s.ry.toFixed(1)}
          fill={s.color}
          opacity={s.opacity.toFixed(2)}
        />
      ))}

      {/* Islands */}
      {islands.map((isl, i) => (
        <g key={`isl-${i}`}>
          <ellipse cx={isl.cx} cy={isl.cy} rx={isl.halfW} ry={isl.h} fill="#0a1018" />
          <ellipse
            cx={isl.cx}
            cy={isl.cy - isl.h * 0.3}
            rx={isl.halfW * 0.9}
            ry={isl.h * 0.8}
            fill="#080d14"
          />
          {isl.trees.map((t, j) => (
            <polygon
              key={j}
              points={`${t.x.toFixed(1)},${(t.baseY - t.h).toFixed(1)} ${(t.x - t.w).toFixed(1)},${t.baseY.toFixed(1)} ${(t.x + t.w).toFixed(1)},${t.baseY.toFixed(1)}`}
              fill="#040810"
            />
          ))}
          <ellipse
            cx={isl.cx}
            cy={isl.cy + isl.h * 1.2}
            rx={isl.halfW * 0.9}
            ry={isl.h * 0.5}
            fill="#0a1018"
            opacity={0.5}
          />
        </g>
      ))}

      {/* Foreground trees — the wooded hill we're standing on */}
      {foregroundTrees.map((t, i) => (
        <ForegroundTree key={`fg-${i}`} tree={t} />
      ))}
    </svg>
  );
}
