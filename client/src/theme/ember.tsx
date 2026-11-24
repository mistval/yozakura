// Deterministic seeded RNG (no SSR hydration mismatch).
function makeRng(seed: number) {
  let rng = seed;
  return () => {
    rng = (rng * 9301 + 49297) % 233280;
    return rng / 233280;
  };
}

type Peak = [number, number];

function ridgePath(peaks: Peak[], baseY = 600): string {
  let d = `M -10 ${peaks[0]![1]} `;
  for (let i = 0; i < peaks.length - 1; i++) {
    const [x1, y1] = peaks[i]!;
    const [x2, y2] = peaks[i + 1]!;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    d += `Q ${x1} ${y1} ${mx} ${my} `;
  }
  const last = peaks.at(-1)!;
  d += `Q ${last[0]} ${last[1]} 1410 ${last[1] + 10} `;
  d += `L 1410 ${baseY} L -10 ${baseY} Z`;
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

const farRidgePath = ridgePath(makePeaks(11, 385, 28, 10));
const midRidgePath = ridgePath(makePeaks(23, 425, 22, 12));
const clearingGroundPath = ridgePath(makePeaks(37, 505, 10, 14));

// ─── Stars ──────────────────────────────────────────────────────────
interface Star {
  x: number;
  y: number;
  r: number;
  opacity: number;
  warm: boolean;
}

const stars: Star[] = (() => {
  const next = makeRng(612);
  const list: Star[] = [];
  for (let i = 0; i < 110; i++) {
    const x = next() * 1400;
    const y = 8 + next() * 320;
    if (x > 360 && x < 760 && y < 100) continue;
    list.push({
      x,
      y,
      r: 0.35 + next() * 1.3,
      opacity: 0.28 + next() * 0.55,
      warm: next() > 0.35,
    });
  }
  return list;
})();

// ─── Pine treeline silhouettes ──────────────────────────────────────
interface PineSpec {
  x: number;
  baseY: number;
  h: number;
  layer: 'back' | 'front';
}

const pines: PineSpec[] = (() => {
  const next = makeRng(904);
  const list: PineSpec[] = [];

  for (let i = 0; i < 42; i++) {
    const x = i * 34 + (next() - 0.5) * 18;
    // Leave a quiet clearing around the campfire on the right-center
    if (x > 790 && x < 1130) continue;
    list.push({
      x,
      baseY: 440 + next() * 35,
      h: 48 + next() * 52,
      layer: 'back',
    });
  }

  const fgSpecs: [number, number, number][] = [
    [-15, 600, 210],
    [35, 600, 245],
    [88, 600, 175],
    [140, 600, 145],
    [1220, 600, 160],
    [1275, 600, 205],
    [1335, 600, 240],
    [1390, 600, 195],
  ];
  for (const [x, baseY, h] of fgSpecs) {
    list.push({ x, baseY, h, layer: 'front' });
  }

  return list;
})();

function PineTree({ tree }: { tree: PineSpec }) {
  const { x, baseY, h, layer } = tree;
  const w = h * 0.31;
  const trunkH = h * 0.09;
  const trunkW = h * 0.04;
  const foliageTop = baseY - h;
  const foliageBottom = baseY - trunkH;
  const fill = layer === 'front' ? '#070403' : '#130c09';
  const tiers = layer === 'front' ? 4 : 3;

  return (
    <g>
      <rect x={x - trunkW / 2} y={foliageBottom} width={trunkW} height={trunkH} fill={fill} />
      {Array.from({ length: tiers }, (_, i) => {
        const tt = i / tiers;
        const yTop = foliageTop + (foliageBottom - foliageTop) * tt * 0.68;
        const yBot = foliageTop + (foliageBottom - foliageTop) * (tt * 0.68 + 0.42);
        const tw = w * (0.38 + tt * 0.62);
        return (
          <polygon
            key={i}
            points={`${x.toFixed(1)},${yTop.toFixed(1)} ${(x - tw).toFixed(1)},${yBot.toFixed(1)} ${(x + tw).toFixed(1)},${yBot.toFixed(1)}`}
            fill={fill}
          />
        );
      })}
    </g>
  );
}

// ─── Fireflies ──────────────────────────────────────────────────────
interface Firefly {
  x: number;
  y: number;
  r: number;
  haloOpacity: number;
  coreColor: string;
  haloColor: string;
}

const fireflies: Firefly[] = (() => {
  const next = makeRng(2026);
  const list: Firefly[] = [];
  for (let i = 0; i < 64; i++) {
    const x = 30 + next() * 1340;
    // Concentrate fireflies above the clearing and among the trees
    const y = 175 + Math.pow(next(), 0.85) * 385;
    const r = 1.1 + next() * 1.9;
    const warmAmber = next() > 0.42;
    list.push({
      x,
      y,
      r,
      haloOpacity: 0.16 + next() * 0.24,
      coreColor: warmAmber ? '#fff1b0' : '#f4fc9c',
      haloColor: warmAmber ? '#ffb347' : '#e6e86c',
    });
  }
  return list;
})();

// ─── Campfire & Rising Embers ───────────────────────────────────────
const FIRE_X = 960;
const FIRE_Y = 552;

interface EmberSpark {
  x: number;
  y: number;
  r: number;
  opacity: number;
  color: string;
}

const emberSparks: EmberSpark[] = (() => {
  const next = makeRng(7711);
  const list: EmberSpark[] = [];
  const colors = ['#ff6a2b', '#ff9442', '#ffc266', '#ffe49e'];
  for (let i = 0; i < 34; i++) {
    const rise = next();
    const spread = 14 + rise * 78;
    const drift = (next() + next() - 1) * spread;
    list.push({
      x: FIRE_X + drift,
      y: FIRE_Y - 18 - rise * 210,
      r: 0.7 + (1 - rise * 0.5) * 1.5,
      opacity: 0.35 + (1 - rise) * 0.6,
      color: colors[Math.floor(next() * colors.length)]!,
    });
  }
  return list;
})();

// ─── Foreground grass tufts ─────────────────────────────────────────
interface GrassTuft {
  x: number;
  y: number;
  h: number;
  lean: number;
}

const grassTufts: GrassTuft[] = (() => {
  const next = makeRng(3141);
  const list: GrassTuft[] = [];
  for (let i = 0; i < 85; i++) {
    const x = next() * 1400;
    const y = 585 + next() * 18;
    list.push({
      x,
      y,
      h: 14 + next() * 24,
      lean: (next() - 0.5) * 12,
    });
  }
  return list;
})();

function Campfire() {
  return (
    <g>
      {/* Warm firelight pools on clearing ground */}
      <ellipse cx={FIRE_X} cy={FIRE_Y + 6} rx={210} ry={48} fill="url(#fireGroundGlow)" />
      <ellipse cx={FIRE_X} cy={FIRE_Y - 18} rx={165} ry={130} fill="url(#fireAirGlow)" />

      {/* Stone fire ring */}
      {[-34, -22, -8, 8, 22, 34].map((dx, i) => (
        <ellipse
          key={`stone-${i}`}
          cx={FIRE_X + dx}
          cy={FIRE_Y + 8 - Math.abs(dx) * 0.08}
          rx={7.5}
          ry={4.5}
          fill="#221713"
        />
      ))}

      {/* Charred crossed logs */}
      <path
        d={`M ${FIRE_X - 32} ${FIRE_Y + 4} L ${FIRE_X + 26} ${FIRE_Y - 8} L ${FIRE_X + 29} ${FIRE_Y - 1} L ${FIRE_X - 29} ${FIRE_Y + 11} Z`}
        fill="#24130c"
      />
      <path
        d={`M ${FIRE_X + 32} ${FIRE_Y + 5} L ${FIRE_X - 24} ${FIRE_Y - 9} L ${FIRE_X - 27} ${FIRE_Y - 2} L ${FIRE_X + 29} ${FIRE_Y + 12} Z`}
        fill="#1a0d08"
      />
      {/* Glowing ember bed */}
      <ellipse cx={FIRE_X} cy={FIRE_Y + 1} rx={22} ry={5} fill="#c43d18" opacity={0.85} />
      <ellipse cx={FIRE_X} cy={FIRE_Y} rx={15} ry={3.5} fill="#ff7c32" opacity={0.9} />

      {/* Outer flame */}
      <path
        d={`M ${FIRE_X - 18} ${FIRE_Y}
            C ${FIRE_X - 22} ${FIRE_Y - 18}, ${FIRE_X - 8} ${FIRE_Y - 36}, ${FIRE_X - 2} ${FIRE_Y - 52}
            C ${FIRE_X + 4} ${FIRE_Y - 36}, ${FIRE_X + 22} ${FIRE_Y - 22}, ${FIRE_X + 18} ${FIRE_Y}
            Z`.replace(/\s+/g, ' ')}
        fill="#ea5a24"
        opacity={0.9}
      />
      {/* Mid flame */}
      <path
        d={`M ${FIRE_X - 12} ${FIRE_Y}
            C ${FIRE_X - 14} ${FIRE_Y - 15}, ${FIRE_X - 4} ${FIRE_Y - 28}, ${FIRE_X + 1} ${FIRE_Y - 40}
            C ${FIRE_X + 7} ${FIRE_Y - 26}, ${FIRE_X + 14} ${FIRE_Y - 15}, ${FIRE_X + 12} ${FIRE_Y}
            Z`.replace(/\s+/g, ' ')}
        fill="#ff9638"
        opacity={0.92}
      />
      {/* Inner core flame */}
      <path
        d={`M ${FIRE_X - 6} ${FIRE_Y}
            C ${FIRE_X - 7} ${FIRE_Y - 10}, ${FIRE_X - 2} ${FIRE_Y - 18}, ${FIRE_X} ${FIRE_Y - 25}
            C ${FIRE_X + 3} ${FIRE_Y - 17}, ${FIRE_X + 7} ${FIRE_Y - 9}, ${FIRE_X + 6} ${FIRE_Y}
            Z`.replace(/\s+/g, ' ')}
        fill="#ffe28a"
        opacity={0.95}
      />
    </g>
  );
}

export default function EmberBackground() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1400 600"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className="ember-svg"
    >
      <defs>
        <linearGradient id="emberSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#09070a" />
          <stop offset="55%" stopColor="#160d0b" />
          <stop offset="100%" stopColor="#28150e" />
        </linearGradient>
        <linearGradient id="emberGround" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#140c09" />
          <stop offset="100%" stopColor="#0a0605" />
        </linearGradient>
        <radialGradient id="fireGroundGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ff8838" stopOpacity={0.34} />
          <stop offset="55%" stopColor="#d95820" stopOpacity={0.14} />
          <stop offset="100%" stopColor="#d95820" stopOpacity={0} />
        </radialGradient>
        <radialGradient id="fireAirGlow" cx="50%" cy="55%" r="50%">
          <stop offset="0%" stopColor="#ffaa4c" stopOpacity={0.28} />
          <stop offset="55%" stopColor="#e86826" stopOpacity={0.1} />
          <stop offset="100%" stopColor="#e86826" stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* Night sky */}
      <rect width="1400" height="600" fill="url(#emberSky)" />

      {/* Quiet stars */}
      {stars.map((s, i) => (
        <circle
          key={`star-${i}`}
          cx={s.x.toFixed(1)}
          cy={s.y.toFixed(1)}
          r={s.r.toFixed(1)}
          fill={s.warm ? '#ffe6c2' : '#f2ede6'}
          opacity={s.opacity.toFixed(2)}
        />
      ))}

      {/* Distant woodland ridges */}
      <path d={farRidgePath} fill="#180f0c" />
      <path d={midRidgePath} fill="#120b09" />

      {/* Back pines */}
      {pines
        .filter((tree) => tree.layer === 'back')
        .map((tree, i) => (
          <PineTree key={`bp-${i}`} tree={tree} />
        ))}

      {/* Forest clearing ground */}
      <path d={clearingGroundPath} fill="url(#emberGround)" />

      {/* Campfire & rising sparks */}
      <Campfire />
      {emberSparks.map((spark, i) => (
        <g key={`spark-${i}`}>
          <circle
            cx={spark.x.toFixed(1)}
            cy={spark.y.toFixed(1)}
            r={(spark.r * 2.6).toFixed(1)}
            fill={spark.color}
            opacity={(spark.opacity * 0.22).toFixed(2)}
          />
          <circle
            cx={spark.x.toFixed(1)}
            cy={spark.y.toFixed(1)}
            r={spark.r.toFixed(1)}
            fill={spark.color}
            opacity={spark.opacity.toFixed(2)}
          />
        </g>
      ))}

      {/* Fireflies */}
      {fireflies.map((f, i) => (
        <g key={`ff-${i}`}>
          <circle
            cx={f.x.toFixed(1)}
            cy={f.y.toFixed(1)}
            r={(f.r * 6.5).toFixed(1)}
            fill={f.haloColor}
            opacity={(f.haloOpacity * 0.35).toFixed(2)}
          />
          <circle
            cx={f.x.toFixed(1)}
            cy={f.y.toFixed(1)}
            r={(f.r * 3).toFixed(1)}
            fill={f.haloColor}
            opacity={f.haloOpacity.toFixed(2)}
          />
          <circle
            cx={f.x.toFixed(1)}
            cy={f.y.toFixed(1)}
            r={f.r.toFixed(1)}
            fill={f.coreColor}
            opacity={0.95}
          />
        </g>
      ))}

      {/* Foreground framing pines */}
      {pines
        .filter((tree) => tree.layer === 'front')
        .map((tree, i) => (
          <PineTree key={`fp-${i}`} tree={tree} />
        ))}

      {/* Foreground grass silhouette */}
      {grassTufts.map((g, i) => (
        <path
          key={`grass-${i}`}
          d={`M ${g.x.toFixed(1)} 600 Q ${(g.x + g.lean * 0.5).toFixed(1)} ${(g.y - g.h * 0.5).toFixed(1)} ${(g.x + g.lean).toFixed(1)} ${(g.y - g.h).toFixed(1)}`}
          stroke="#060403"
          strokeWidth={1.6}
          fill="none"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}
