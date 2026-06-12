// Deterministic seeded RNG (no SSR hydration mismatch).
function makeRng(seed: number) {
  let rng = seed;
  return () => {
    rng = (rng * 9301 + 49297) % 233280;
    return rng / 233280;
  };
}

// ─── Storm clouds ─────────────────────────────────────────────────
interface CloudPalette {
  base: string;
  mid: string;
  highlight: string;
  under: string;
}
interface CloudCircle {
  cx: number;
  cy: number;
  r: number;
  fill: string;
}

function buildCloud(
  cx: number,
  cy: number,
  scale: number,
  seed: number,
  palette: CloudPalette
): CloudCircle[] {
  const next = makeRng(seed);
  const w = 130 * scale;
  const h = 50 * scale;
  const circles: CloudCircle[] = [];
  // Base body
  for (let i = 0; i < 10; i++) {
    const t = i / 10;
    const angle = t * Math.PI + (next() - 0.5) * 0.8;
    const dx = Math.cos(angle) * w * (0.6 + next() * 0.4) + (next() - 0.5) * w * 0.2;
    const dy = (next() - 0.5) * h * 0.8 - next() * h * 0.3;
    circles.push({ cx: cx + dx, cy: cy + dy, r: (28 + next() * 18) * scale, fill: palette.base });
  }
  // Mid tone
  for (let i = 0; i < 6; i++) {
    const dx = (next() - 0.5) * w * 1.2;
    const dy = (next() - 0.5) * h * 0.6 - h * 0.3;
    circles.push({ cx: cx + dx, cy: cy + dy, r: (18 + next() * 14) * scale, fill: palette.mid });
  }
  // Dim highlights
  for (let i = 0; i < 3; i++) {
    const dx = (next() - 0.5) * w * 0.9;
    const dy = -h * 0.3 + (next() - 0.5) * h * 0.4;
    circles.push({ cx: cx + dx, cy: cy + dy, r: (10 + next() * 11) * scale, fill: palette.highlight });
  }
  // Dark underside (where the rain comes from)
  for (let i = 0; i < 4; i++) {
    const dx = (next() - 0.5) * w * 1.3;
    const dy = h * 0.35 + (next() - 0.5) * h * 0.3;
    circles.push({ cx: cx + dx, cy: cy + dy, r: (16 + next() * 14) * scale, fill: palette.under });
  }
  return circles;
}

const upperPalette: CloudPalette = {
  base: '#3a4452',
  mid: '#4a5462',
  highlight: '#5a6472',
  under: '#2a3340',
};
const midPalette: CloudPalette = { base: '#2e3742', mid: '#3a4250', highlight: '#4a5260', under: '#1e2530' };
const lowerPalette: CloudPalette = {
  base: '#1f2530',
  mid: '#2a3138',
  highlight: '#363c44',
  under: '#10141a',
};

// Cloud layouts — upper distant band, mid band, dense lower bank
const upperClouds = (() => {
  const next = makeRng(1);
  const list: [number, number, number, number][] = [];
  for (let i = 0; i < 10; i++) {
    let x = next() * 1500 - 50;
    const y = 60 + next() * 50;
    const scale = 0.6 + next() * 0.4;
    const seed = 100 + i;

    if (x > 350 && x < 800) {
      x += 350 + next() * 200;
    }

    list.push([x, y, scale, seed]);
  }

  return list;
})();
const midCloudsLayout = (() => {
  const next = makeRng(2);
  const list: [number, number, number, number][] = [];
  for (let i = 0; i < 9; i++) list.push([next() * 1500 - 50, 140 + next() * 60, 0.8 + next() * 0.5, 200 + i]);
  return list;
})();
const lowerClouds = (() => {
  const next = makeRng(3);
  const list: [number, number, number, number][] = [];
  let x = -100;
  let i = 0;
  while (x < 1500) {
    list.push([x, 240 + next() * 40, 0.9 + next() * 0.6, 300 + i]);
    x += 110 + next() * 70;
    i++;
  }
  return list;
})();

const upperCircles = upperClouds.flatMap(([x, y, s, seed]) => buildCloud(x, y, s, seed, upperPalette));
const midCircles = midCloudsLayout.flatMap(([x, y, s, seed]) => buildCloud(x, y, s, seed, midPalette));
const lowerCircles = lowerClouds.flatMap(([x, y, s, seed]) => buildCloud(x, y, s, seed, lowerPalette));

// ─── Rain ─────────────────────────────────────────────────────────
const RAIN_ANGLE_DEG = 28;
const angleRad = (RAIN_ANGLE_DEG * Math.PI) / 180;
const angleSin = Math.sin(angleRad);
const angleCos = Math.cos(angleRad);

interface RainStreak {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  opacity: number;
  strokeWidth: number;
}

function buildRainBatch(
  count: number,
  yRange: [number, number],
  lengthRange: [number, number],
  opacityRange: [number, number],
  swRange: [number, number],
  seed: number
): RainStreak[] {
  const next = makeRng(seed);
  const list: RainStreak[] = [];
  for (let i = 0; i < count; i++) {
    const x = next() * 1600 - 100;
    const y = yRange[0] + next() * (yRange[1] - yRange[0]);
    const length = lengthRange[0] + next() * (lengthRange[1] - lengthRange[0]);
    list.push({
      x1: x,
      y1: y,
      x2: x + length * angleSin,
      y2: y + length * angleCos,
      opacity: opacityRange[0] + next() * (opacityRange[1] - opacityRange[0]),
      strokeWidth: swRange[0] + next() * (swRange[1] - swRange[0]),
    });
  }
  return list;
}

const bgRain = buildRainBatch(500, [100, 580], [14, 30], [0.2, 0.45], [0.4, 0.8], 7000);
const midRain = buildRainBatch(320, [100, 580], [22, 50], [0.35, 0.65], [0.8, 1.4], 7001);
const fgRain = buildRainBatch(140, [100, 580], [35, 85], [0.5, 0.85], [1.3, 2.4], 7002);

// ─── Wheat field ─────────────────────────────────────────────────
interface WheatPalette {
  stalk: string;
  stalkWidth: number;
  head: string;
  headDark: string;
}
interface WheatStalk {
  stalkD: string;
  stalkColor: string;
  stalkWidth: number;
  grains: { cx: number; cy: number; rx: number; ry: number; fill: string }[];
  awns: { x1: number; y1: number; x2: number; y2: number }[];
  awnColor: string;
  awnWidth: number;
}

function buildStalk(
  baseX: number,
  baseY: number,
  height: number,
  leanAmount: number,
  palette: WheatPalette,
  seed: number
): WheatStalk {
  const next = makeRng(seed);
  const top = baseY - height;
  const lean = leanAmount * height * 0.55;
  const wobble = (next() - 0.5) * height * 0.06;
  const c1x = baseX + wobble;
  const c1y = baseY - height * 0.45;
  const c2x = baseX + lean * 0.4 + wobble;
  const c2y = top + height * 0.15;
  const tx = baseX + lean + wobble;
  const ty = top;
  const stalkD = `M ${baseX.toFixed(1)} ${baseY.toFixed(1)} C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${tx.toFixed(1)} ${ty.toFixed(1)}`;
  const dirX = tx - c2x;
  const dirY = ty - c2y;
  const dirLen = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
  const ux = dirX / dirLen;
  const uy = dirY / dirLen;
  const px = -uy;
  const py = ux;
  const headLen = height * 0.22 + next() * height * 0.05;
  const headWidth = palette.stalkWidth + 1.5 + next() * 1.5;
  const grains: WheatStalk['grains'] = [];
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const dist = t * headLen;
    const centerX = tx + ux * dist;
    const centerY = ty + uy * dist;
    const w = headWidth * (1 - Math.abs(t - 0.5) * 1.4) + 1;
    grains.push({
      cx: centerX + px * w * 0.6,
      cy: centerY + py * w * 0.6,
      rx: w * 0.55,
      ry: w * 0.4,
      fill: palette.head,
    });
    grains.push({
      cx: centerX - px * w * 0.6,
      cy: centerY - py * w * 0.6,
      rx: w * 0.55,
      ry: w * 0.4,
      fill: palette.head,
    });
    grains.push({ cx: centerX, cy: centerY, rx: w * 0.45, ry: w * 0.35, fill: palette.headDark });
  }
  const awns: WheatStalk['awns'] = [];
  for (let i = 0; i < 5; i++) {
    const startT = 0.4 + (i / 5) * 0.6;
    const sx = tx + ux * startT * headLen;
    const sy = ty + uy * startT * headLen;
    const awnLen = headLen * (0.6 + next() * 0.5);
    const angleJit = (next() - 0.5) * 0.3;
    const awnUx = ux * Math.cos(angleJit) - uy * Math.sin(angleJit);
    const awnUy = ux * Math.sin(angleJit) + uy * Math.cos(angleJit);
    awns.push({ x1: sx, y1: sy, x2: sx + awnUx * awnLen, y2: sy + awnUy * awnLen });
  }
  return {
    stalkD,
    stalkColor: palette.stalk,
    stalkWidth: palette.stalkWidth,
    grains,
    awns,
    awnColor: palette.head,
    awnWidth: palette.stalkWidth * 0.5,
  };
}

const backWheatPalette: WheatPalette = {
  stalk: '#504434',
  stalkWidth: 0.7,
  head: '#8a7848',
  headDark: '#5a4a32',
};
const midWheatPalette: WheatPalette = {
  stalk: '#3e3424',
  stalkWidth: 0.9,
  head: '#a08858',
  headDark: '#6a5638',
};
const frontWheatPalette: WheatPalette = {
  stalk: '#2a2218',
  stalkWidth: 1.3,
  head: '#b09868',
  headDark: '#705840',
};

function buildField(
  rowSeed: number,
  count: number,
  yBase: number,
  yJitter: number,
  hMin: number,
  hMax: number,
  leanBase: number,
  leanRange: number,
  palette: WheatPalette,
  seedOffset: number
): WheatStalk[] {
  const next = makeRng(rowSeed);
  const list: WheatStalk[] = [];
  for (let i = 0; i < count; i++) {
    const x = next() * 1500 - 50;
    const y = yBase + (next() - 0.5) * yJitter;
    const h = hMin + next() * (hMax - hMin);
    const lean = leanBase + next() * leanRange;
    list.push(buildStalk(x, y, h, lean, palette, seedOffset + i));
  }
  return list;
}

const backWheat = buildField(8001, 140, 478, 14, 36, 58, 0.55, 0.2, backWheatPalette, 8100);
const midWheat = buildField(8002, 110, 510, 16, 58, 88, 0.6, 0.25, midWheatPalette, 8200);
const frontWheat = buildField(8003, 80, 555, 18, 80, 125, 0.65, 0.25, frontWheatPalette, 8300);

function StalkG({ stalk }: { stalk: WheatStalk }) {
  return (
    <g>
      <path
        d={stalk.stalkD}
        stroke={stalk.stalkColor}
        strokeWidth={stalk.stalkWidth}
        fill="none"
        strokeLinecap="round"
      />
      {stalk.grains.map((g, i) => (
        <ellipse
          key={i}
          cx={g.cx.toFixed(1)}
          cy={g.cy.toFixed(1)}
          rx={g.rx.toFixed(1)}
          ry={g.ry.toFixed(1)}
          fill={g.fill}
        />
      ))}
      {stalk.awns.map((a, i) => (
        <line
          key={i}
          x1={a.x1.toFixed(1)}
          y1={a.y1.toFixed(1)}
          x2={a.x2.toFixed(1)}
          y2={a.y2.toFixed(1)}
          stroke={stalk.awnColor}
          strokeWidth={stalk.awnWidth}
          opacity={0.75}
          strokeLinecap="round"
        />
      ))}
    </g>
  );
}

export default function TempestScene() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1400 600"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className="tempest-svg"
    >
      <defs>
        <linearGradient id="stormSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a1f28" />
          <stop offset="35%" stopColor="#2a3040" />
          <stop offset="70%" stopColor="#3a4050" />
          <stop offset="100%" stopColor="#4a4e58" />
        </linearGradient>
        <linearGradient id="stormGround" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4a4e58" stopOpacity={0} />
          <stop offset="20%" stopColor="#3a3024" stopOpacity={0.8} />
          <stop offset="100%" stopColor="#1a1410" stopOpacity={1} />
        </linearGradient>
      </defs>

      {/* Sky */}
      <rect width="1400" height="600" fill="url(#stormSky)" />

      {/* Storm cloud layers — back to front */}
      {upperCircles.map((c, i) => (
        <circle
          key={`upper-${i}`}
          cx={c.cx.toFixed(1)}
          cy={c.cy.toFixed(1)}
          r={c.r.toFixed(1)}
          fill={c.fill}
        />
      ))}
      {midCircles.map((c, i) => (
        <circle key={`mid-${i}`} cx={c.cx.toFixed(1)} cy={c.cy.toFixed(1)} r={c.r.toFixed(1)} fill={c.fill} />
      ))}
      {lowerCircles.map((c, i) => (
        <circle
          key={`lower-${i}`}
          cx={c.cx.toFixed(1)}
          cy={c.cy.toFixed(1)}
          r={c.r.toFixed(1)}
          fill={c.fill}
        />
      ))}

      {/* Rain — three batches by depth */}
      <g>
        {bgRain.map((r, i) => (
          <line
            key={`bg-${i}`}
            x1={r.x1.toFixed(1)}
            y1={r.y1.toFixed(1)}
            x2={r.x2.toFixed(1)}
            y2={r.y2.toFixed(1)}
            stroke="#c4ccd8"
            strokeWidth={r.strokeWidth.toFixed(1)}
            opacity={r.opacity.toFixed(2)}
            strokeLinecap="round"
          />
        ))}
        {midRain.map((r, i) => (
          <line
            key={`mr-${i}`}
            x1={r.x1.toFixed(1)}
            y1={r.y1.toFixed(1)}
            x2={r.x2.toFixed(1)}
            y2={r.y2.toFixed(1)}
            stroke="#c4ccd8"
            strokeWidth={r.strokeWidth.toFixed(1)}
            opacity={r.opacity.toFixed(2)}
            strokeLinecap="round"
          />
        ))}
        {fgRain.map((r, i) => (
          <line
            key={`fg-${i}`}
            x1={r.x1.toFixed(1)}
            y1={r.y1.toFixed(1)}
            x2={r.x2.toFixed(1)}
            y2={r.y2.toFixed(1)}
            stroke="#c4ccd8"
            strokeWidth={r.strokeWidth.toFixed(1)}
            opacity={r.opacity.toFixed(2)}
            strokeLinecap="round"
          />
        ))}
      </g>

      {/* Dark ground that fades up into the sky */}
      <rect x={0} y={430} width={1400} height={170} fill="url(#stormGround)" />

      {/* Wheat field — back to front */}
      {backWheat.map((s, i) => (
        <StalkG key={`bw-${i}`} stalk={s} />
      ))}
      {midWheat.map((s, i) => (
        <StalkG key={`mw-${i}`} stalk={s} />
      ))}
      {frontWheat.map((s, i) => (
        <StalkG key={`fw-${i}`} stalk={s} />
      ))}
    </svg>
  );
}
