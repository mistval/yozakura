// Deterministic seeded RNG (no SSR hydration mismatch).
function makeRng(seed: number) {
  let rng = seed;
  return () => {
    rng = (rng * 9301 + 49297) % 233280;
    return rng / 233280;
  };
}

type Peak = [number, number];

// ─── Stars ───────────────────────────────────────────────────────────
interface Star {
  x: number;
  y: number;
  r: number;
  opacity: number;
  glint: boolean;
}
const starList: Star[] = (() => {
  const next = makeRng(444);
  const list: Star[] = [];
  for (let i = 0; i < 90; i++) {
    const r = 0.4 + next() * 1.6;
    const x = next() * 1400;
    const y = next() * 360;
    const opacity = 0.4 + next() * 0.6;
    const glint = r > 1.6 && next() > 0.5;

    if (x > 400 && x < 800 && y > 20 && y < 100) {
      continue;
    }

    list.push({
      x,
      y,
      r,
      opacity,
      glint,
    });
  }
  return list;
})();

// ─── Hills ──────────────────────────────────────────────────────────
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

const farPath = mountainPath(makePeaks(1, 415, 30, 10));
const midPath = mountainPath(makePeaks(7, 445, 25, 12));
const groundPath = mountainPath(makePeaks(31, 540, 10, 16));

// ─── Mt Fuji (silhouette) ──────────────────────────────────────────
function buildFuji(cx: number, baseY: number, height: number, width: number) {
  const apexY = baseY - height;
  const baseLeft = cx - width;
  const baseRight = cx + width;
  const body = `M ${baseLeft} ${baseY}
    C ${cx - width * 0.95} ${baseY - height * 0.05},
      ${cx - width * 0.35} ${apexY + height * 0.45},
      ${cx} ${apexY}
    C ${cx + width * 0.35} ${apexY + height * 0.45},
      ${cx + width * 0.95} ${baseY - height * 0.05},
      ${baseRight} ${baseY}
    Z`.replace(/\s+/g, ' ');
  const snowLineY = apexY + height * 0.5;
  const snowHalfW = width * 0.36;
  const next = makeRng(101);
  const wavePoints: [number, number][] = [];
  for (let t = -1; t <= 1.001; t += 0.06) {
    const tx = cx + t * snowHalfW;
    const ty = snowLineY + Math.sin(t * 6) * 4 + Math.sin(t * 13) * 2 + (next() - 0.5) * 5;
    wavePoints.push([tx, ty]);
  }
  let snow = `M ${wavePoints[0]![0].toFixed(1)} ${wavePoints[0]![1].toFixed(1)} `;
  for (let i = 1; i < wavePoints.length; i++) {
    snow += `L ${wavePoints[i]![0].toFixed(1)} ${wavePoints[i]![1].toFixed(1)} `;
  }
  snow += `C ${cx + width * 0.2} ${apexY + height * 0.22}, ${cx + width * 0.08} ${apexY + height * 0.05}, ${cx} ${apexY} `;
  snow += `C ${cx - width * 0.08} ${apexY + height * 0.05}, ${cx - width * 0.2} ${apexY + height * 0.22}, ${wavePoints[0]![0].toFixed(1)} ${wavePoints[0]![1].toFixed(1)} Z`;
  return { body, snow };
}
const fuji = buildFuji(380, 470, 230, 380);

// ─── Cirrus (pale silver) ──────────────────────────────────────────
interface CirrusSpec {
  x: number;
  y: number;
  w: number;
  angle: number;
  strokes: number;
  opacity: number;
}
const cirrusSpecs: CirrusSpec[] = [
  { x: 60, y: 55, w: 220, angle: -2, strokes: 7, opacity: 0.4 },
  { x: 1020, y: 130, w: 180, angle: 2, strokes: 5, opacity: 0.32 },
  { x: 1200, y: 60, w: 160, angle: -1, strokes: 5, opacity: 0.38 },
  { x: 300, y: 180, w: 130, angle: 2, strokes: 4, opacity: 0.28 },
  { x: 880, y: 200, w: 160, angle: -2, strokes: 5, opacity: 0.28 },
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

// ─── Cherry blossom tree (night palette) ───────────────────────────
interface Branch {
  d: string;
  strokeWidth: number;
}
interface Blossom {
  cx: number;
  cy: number;
  r: number;
  fill: string;
  opacity?: number;
}
interface CherryTree {
  trunkD: string;
  branches: Branch[];
  blossoms: Blossom[];
}

function buildCherryTree(x: number, baseY: number, scale: number, seedOffset: number): CherryTree {
  const next = makeRng(7000 + seedOffset);
  const trunkH = 70 * scale;
  const trunkW = 12 * scale;
  const branchTop = baseY - trunkH;
  const trunkD = `M ${x - trunkW / 2} ${baseY} Q ${x - trunkW / 3} ${baseY - trunkH * 0.5} ${x - 2} ${branchTop} L ${x + 2} ${branchTop} Q ${x + trunkW / 3} ${baseY - trunkH * 0.5} ${x + trunkW / 2} ${baseY} Z`;
  const branchSpecs = [
    { angle: -1.3, length: 50 * scale },
    { angle: -0.7, length: 45 * scale },
    { angle: 0.7, length: 48 * scale },
    { angle: 1.3, length: 50 * scale },
    { angle: -0.1, length: 32 * scale },
    { angle: -1.8, length: 38 * scale },
    { angle: 1.8, length: 38 * scale },
  ];
  const branches: Branch[] = branchSpecs.map((b) => {
    const ex = x + Math.cos(b.angle) * b.length;
    const ey = branchTop + Math.sin(b.angle) * b.length * 0.6 - b.length * 0.4;
    return {
      d: `M ${x} ${branchTop} Q ${(x + ex) / 2} ${branchTop - 10} ${ex.toFixed(1)} ${ey.toFixed(1)}`,
      strokeWidth: parseFloat((3 * scale).toFixed(1)),
    };
  });
  const cloudCx = x;
  const cloudCy = branchTop - 25 * scale;
  const cloudRx = 85 * scale;
  const cloudRy = 60 * scale;
  const blossoms: Blossom[] = [];
  // Layer 1: dim pink background
  for (let i = 0; i < Math.floor(20 * scale); i++) {
    const angle = next() * Math.PI * 2;
    const dist = Math.sqrt(next()) * 1.0;
    blossoms.push({
      cx: cloudCx + Math.cos(angle) * dist * cloudRx,
      cy: cloudCy + Math.sin(angle) * dist * cloudRy,
      r: (14 + next() * 10) * scale,
      fill: '#a87298',
    });
  }
  // Layer 2: mid pink
  for (let i = 0; i < Math.floor(40 * scale); i++) {
    const angle = next() * Math.PI * 2;
    const dist = Math.sqrt(next()) * 0.9;
    blossoms.push({
      cx: cloudCx + Math.cos(angle) * dist * cloudRx,
      cy: cloudCy + Math.sin(angle) * dist * cloudRy,
      r: (8 + next() * 8) * scale,
      fill: '#d490b2',
    });
  }
  // Layer 3: deep wine shadows (downward bias)
  for (let i = 0; i < Math.floor(28 * scale); i++) {
    const angle = next() * Math.PI * 2;
    const dist = Math.sqrt(next()) * 0.7;
    blossoms.push({
      cx: cloudCx + Math.cos(angle) * dist * cloudRx,
      cy: cloudCy + Math.sin(angle) * dist * cloudRy + 6 * scale,
      r: (5 + next() * 7) * scale,
      fill: '#704258',
    });
  }
  // Layer 4: highlights — alternating warm (lantern from below) and cool (moon from above)
  for (let i = 0; i < Math.floor(28 * scale); i++) {
    const angle = next() * Math.PI * 2;
    const dist = Math.sqrt(next()) * 0.65;
    const fromBelow = i % 2 === 0;
    const yOff = fromBelow ? 4 * scale : -8 * scale;
    const xOff = fromBelow ? 0 : -6 * scale;
    const fill = fromBelow ? '#ffd8c0' : '#ffe8e0';
    blossoms.push({
      cx: cloudCx + Math.cos(angle) * dist * cloudRx + xOff,
      cy: cloudCy + Math.sin(angle) * dist * cloudRy + yOff,
      r: (3.5 + next() * 4) * scale,
      fill,
      opacity: 0.85,
    });
  }
  return { trunkD, branches, blossoms };
}

function CherryTreeG({ tree }: { tree: CherryTree }) {
  return (
    <g>
      <path d={tree.trunkD} fill="#2a1c14" />
      {tree.branches.map((b, i) => (
        <path
          key={i}
          d={b.d}
          stroke="#2a1c14"
          strokeWidth={b.strokeWidth}
          fill="none"
          strokeLinecap="round"
        />
      ))}
      {tree.blossoms.map((b, i) => (
        <circle
          key={i}
          cx={b.cx.toFixed(1)}
          cy={b.cy.toFixed(1)}
          r={b.r.toFixed(1)}
          fill={b.fill}
          opacity={b.opacity}
        />
      ))}
    </g>
  );
}

const backTrees = [
  [40, 540, 0.65, 21],
  [130, 540, 0.7, 22],
  [225, 540, 0.65, 23],
  [320, 540, 0.7, 24],
  [600, 540, 0.7, 26],
  [690, 540, 0.65, 27],
  [780, 540, 0.7, 28],
  [970, 540, 0.65, 29],
  [1055, 540, 0.7, 30],
  [1170, 540, 0.7, 31],
  [1260, 540, 0.65, 32],
  [1345, 540, 0.7, 33],
] as const;
const frontTrees = [
  [85, 558, 0.95, 1],
  [200, 555, 1.05, 2],
  [310, 558, 0.95, 3],
  [620, 558, 1.0, 4],
  [740, 555, 1.1, 5],
  [855, 558, 0.95, 6],
  [1020, 558, 1.0, 7],
  [1140, 555, 1.0, 8],
  [1265, 558, 0.95, 9],
  [1355, 558, 0.85, 10],
] as const;
const backCherryData = backTrees.map(([x, y, s, so]) => buildCherryTree(x, y, s, so));
const frontCherryData = frontTrees.map(([x, y, s, so]) => buildCherryTree(x, y, s, so));

// ─── Falling petals ────────────────────────────────────────────────
interface Petal {
  x: number;
  y: number;
  rx: number;
  ry: number;
  fill: string;
  opacity: number;
  angle: number;
}
const petals: Petal[] = (() => {
  const next = makeRng(9999);
  const list: Petal[] = [];
  const pinks = ['#f0a8c0', '#e090a8', '#ffd0e0'];
  for (let i = 0; i < 60; i++) {
    const x = next() * 1400;
    const y = next() * 580;
    const r = 1 + next() * 2;
    const fill = pinks[Math.floor(next() * pinks.length)]!;
    const opacity = 0.45 + next() * 0.4;
    const angle = next() * 60 - 30;

    if (x > 400 && x < 800 && y > 30 && y < 100) {
      continue;
    }

    list.push({
      x,
      y,
      rx: r,
      ry: r * 0.6,
      fill,
      opacity,
      angle,
    });
  }
  return list;
})();

// ─── Stepping stones ────────────────────────────────────────────────
interface Stone {
  x: number;
  y: number;
  rx: number;
  ry: number;
}
const stones: Stone[] = (() => {
  const next = makeRng(555);
  const list: Stone[] = [];
  let x = 100;
  let y = 590;
  while (x < 900 && y > 550) {
    list.push({ x, y, rx: 18 + next() * 8, ry: 7 + next() * 3 });
    x += 30 + next() * 15;
    y -= 4 + next() * 4;
  }
  return list;
})();

// ─── Moon ───────────────────────────────────────────────────────────
function Moon({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r * 3.5} fill="#f8e8b0" opacity={0.08} />
      <circle cx={cx} cy={cy} r={r * 2.2} fill="#f8e8b0" opacity={0.15} />
      <circle cx={cx} cy={cy} r={r * 1.5} fill="#fbecc0" opacity={0.3} />
      <circle cx={cx} cy={cy} r={r} fill="#fdf2d0" />
      <circle cx={cx - r * 0.25} cy={cy - r * 0.2} r={r * 0.6} fill="#ffffff" opacity={0.4} />
      <ellipse
        cx={cx + r * 0.3}
        cy={cy + r * 0.1}
        rx={r * 0.25}
        ry={r * 0.18}
        fill="#e8d8a0"
        opacity={0.35}
      />
      <ellipse cx={cx - r * 0.1} cy={cy + r * 0.4} rx={r * 0.18} ry={r * 0.12} fill="#e8d8a0" opacity={0.3} />
    </g>
  );
}

// ─── 赤提灯 (akachōchin) ──────────────────────────────────────────
function Akachochin({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  const s = scale;
  const w = 18 * s;
  const h = 22 * s;
  // Compute rib line positions following the ellipse silhouette
  const ribs: { x1: number; x2: number; y: number }[] = [];
  const ribCount = 6;
  for (let i = 1; i < ribCount; i++) {
    const ry = y - h + (2 * h * i) / ribCount;
    const yFromCenter = ry - y;
    const tFactor = Math.sqrt(Math.max(0, 1 - (yFromCenter * yFromCenter) / (h * h)));
    const halfRib = w * tFactor;
    ribs.push({ x1: x - halfRib, x2: x + halfRib, y: ry });
  }
  return (
    <g>
      {/* Glow halo */}
      <ellipse cx={x} cy={y} rx={w + 22} ry={h + 18} fill="#ff6840" opacity={0.08} />
      <ellipse cx={x} cy={y} rx={w + 12} ry={h + 8} fill="#ff7848" opacity={0.18} />
      <ellipse cx={x} cy={y} rx={w + 4} ry={h + 2} fill="#ff8a50" opacity={0.3} />
      {/* Body */}
      <ellipse cx={x} cy={y} rx={w} ry={h} fill="#d83020" />
      {/* Inner illumination layers */}
      <ellipse cx={x - w * 0.1} cy={y - h * 0.05} rx={w * 0.78} ry={h * 0.78} fill="#ff5a30" />
      <ellipse cx={x - w * 0.15} cy={y - h * 0.1} rx={w * 0.5} ry={h * 0.55} fill="#ff8a40" opacity={0.8} />
      <ellipse cx={x - w * 0.2} cy={y - h * 0.15} rx={w * 0.25} ry={h * 0.3} fill="#ffc878" opacity={0.65} />
      {/* Bamboo ribs */}
      {ribs.map((r, i) => (
        <line
          key={i}
          x1={r.x1.toFixed(1)}
          y1={r.y.toFixed(1)}
          x2={r.x2.toFixed(1)}
          y2={r.y.toFixed(1)}
          stroke="#5a1810"
          strokeWidth={0.8}
          opacity={0.7}
        />
      ))}
      <line
        x1={x}
        y1={(y - h + 2).toFixed(1)}
        x2={x}
        y2={(y + h - 2).toFixed(1)}
        stroke="#5a1810"
        strokeWidth={0.4}
        opacity={0.4}
      />
      {/* Caps */}
      <ellipse cx={x} cy={(y - h + 1).toFixed(1)} rx={w * 0.55} ry={2.5 * s} fill="#3a2018" />
      <ellipse cx={x} cy={(y - h - 1.5).toFixed(1)} rx={w * 0.4} ry={1.5 * s} fill="#5a3028" />
      <ellipse cx={x} cy={(y + h - 1).toFixed(1)} rx={w * 0.55} ry={2.5 * s} fill="#3a2018" />
      {/* Tassel */}
      <rect x={x - 1} y={y + h + 1} width={2} height={3 * s} fill="#3a2018" />
      {/* String up */}
      <line
        x1={x}
        y1={(y - h - 2).toFixed(1)}
        x2={x}
        y2={(y - h - 10 * s).toFixed(1)}
        stroke="#2a1810"
        strokeWidth={0.6}
      />
    </g>
  );
}

// String of akachōchin hung from a sagging cable
interface ChochinAnchor {
  x: number;
  y: number;
}
function ChochinString({
  from,
  to,
  sag,
  count,
  scale = 0.8,
}: {
  from: ChochinAnchor;
  to: ChochinAnchor;
  sag: number;
  count: number;
  scale?: number;
}) {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2 + sag;
  const lanterns: { cx: number; cy: number }[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const cx = (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * mx + t * t * to.x;
    const cy = (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * my + t * t * to.y;
    lanterns.push({ cx, cy: cy + 30 * scale });
  }
  return (
    <g>
      <path
        d={`M ${from.x} ${from.y} Q ${mx} ${my} ${to.x} ${to.y}`}
        stroke="#2a1810"
        strokeWidth={0.7}
        fill="none"
        opacity={0.65}
      />
      {lanterns.map((l, i) => (
        <Akachochin key={i} x={l.cx} y={l.cy} scale={scale} />
      ))}
    </g>
  );
}

// ─── Japanese house (night, glowing shoji) ─────────────────────────
function JapaneseHouse({ x, baseY, scale = 1 }: { x: number; baseY: number; scale?: number }) {
  const w = 110 * scale;
  const h = 50 * scale;
  const roofH = 35 * scale;
  const wallTop = baseY - h;
  const ridge = wallTop - roofH;
  const overhang = 18 * scale;
  const leftEave = x - w / 2 - overhang;
  const rightEave = x + w / 2 + overhang;
  const doorW = 18 * scale;
  const doorH = 30 * scale;
  return (
    <g>
      <rect x={x - w / 2 - 4} y={baseY - 5} width={w + 8} height={5} fill="#3a3028" />
      {/* Outer light spill */}
      <rect x={x - w / 2 - 10} y={wallTop - 6} width={w + 20} height={h + 12} fill="#ffb868" opacity={0.12} />
      {/* Lit shoji walls */}
      <rect x={x - w / 2} y={wallTop} width={w} height={h} fill="#ffd078" />
      <rect
        x={x - w / 2}
        y={wallTop}
        width={w}
        height={h}
        fill="none"
        stroke="#2a1810"
        strokeWidth={2.5 * scale}
      />
      {[1, 2, 3].map((i) => {
        const px = x - w / 2 + (w * i) / 4;
        return (
          <line
            key={i}
            x1={px}
            y1={wallTop}
            x2={px}
            y2={wallTop + h}
            stroke="#2a1810"
            strokeWidth={1.8 * scale}
          />
        );
      })}
      <line
        x1={x - w / 2}
        y1={wallTop + h / 2}
        x2={x + w / 2}
        y2={wallTop + h / 2}
        stroke="#2a1810"
        strokeWidth={1.4 * scale}
      />
      <path
        d={`M ${leftEave} ${wallTop + 4}
            Q ${leftEave - 6} ${wallTop - 4} ${leftEave + 8} ${wallTop - 2}
            L ${x - 4} ${ridge + 2} L ${x} ${ridge} L ${x + 4} ${ridge + 2}
            L ${rightEave - 8} ${wallTop - 2}
            Q ${rightEave + 6} ${wallTop - 4} ${rightEave} ${wallTop + 4} Z`.replace(/\s+/g, ' ')}
        fill="#2e363c"
      />
      <rect x={x - doorW / 2} y={baseY - doorH} width={doorW} height={doorH} fill="#a07848" />
      <rect
        x={x - doorW / 2}
        y={baseY - doorH}
        width={doorW}
        height={doorH}
        fill="none"
        stroke="#2a1810"
        strokeWidth={1.2}
      />
      <line x1={x} y1={baseY - doorH} x2={x} y2={baseY} stroke="#2a1810" strokeWidth={1} />
    </g>
  );
}

// ─── Pagoda (night) ────────────────────────────────────────────────
function Pagoda({ x, baseY, scale = 1 }: { x: number; baseY: number; scale?: number }) {
  const tiers = 6;
  const elements: React.ReactNode[] = [];
  let curY = baseY;
  for (let i = 0; i < tiers; i++) {
    const tierScale = 1 - i * 0.12;
    const wWall = 52 * scale * tierScale;
    const hWall = 33 * scale * tierScale;
    const wRoof = 88 * scale * tierScale;
    const hRoof = 18 * scale * tierScale;
    const ry = curY - hWall + 9 * scale * tierScale;
    elements.push(
      <g key={`tier-${i}`}>
        {/* Light spill */}
        <rect
          x={x - 11 * scale * tierScale}
          y={ry + 1}
          width={22 * scale * tierScale}
          height={hWall - 2}
          fill="#ffb868"
          opacity={0.28}
        />
        {/* Darker walls */}
        <rect x={x - wWall / 2} y={ry} width={wWall} height={hWall} fill="#8a7858" />
        <rect
          x={x - wWall / 2}
          y={ry}
          width={wWall}
          height={hWall}
          fill="none"
          stroke="#2a1810"
          strokeWidth={0.9}
        />
        {/* Glowing window */}
        <rect
          x={x - 6 * scale * tierScale}
          y={ry + 5}
          width={12 * scale * tierScale}
          height={hWall - 9}
          fill="#ffc078"
        />
        {/* Dark red roof */}
        <path
          d={`M ${x - wRoof / 2} ${ry + 3}
              Q ${x - wRoof / 2 - 6} ${ry - 6} ${x - wRoof / 2 + 10} ${ry - 4}
              L ${x} ${ry - hRoof}
              L ${x + wRoof / 2 - 10} ${ry - 4}
              Q ${x + wRoof / 2 + 6} ${ry - 6} ${x + wRoof / 2} ${ry + 3} Z`.replace(/\s+/g, ' ')}
          fill="#5a2018"
        />
        <rect x={x - wRoof / 2} y={ry + 3} width={wRoof} height={2} fill="#3a1410" />
      </g>
    );
    curY = ry - hRoof;
  }
  return (
    <g>
      {elements}
      <line x1={x} y1={curY} x2={x} y2={curY - 28 * scale} stroke="#3a2818" strokeWidth={2.5 * scale} />
      {[0, 1, 2, 3].map((i) => (
        <ellipse
          key={i}
          cx={x}
          cy={curY - 6 - i * 5.5 * scale}
          rx={3.2 * scale}
          ry={1 * scale}
          fill="#8a7048"
        />
      ))}
      <circle cx={x} cy={curY - 27 * scale} r={2.2 * scale} fill="#a08858" />
    </g>
  );
}

// ─── Torii (night, with rim light) ─────────────────────────────────
function Torii({ x, baseY, scale = 1 }: { x: number; baseY: number; scale?: number }) {
  const h = 90 * scale;
  const w = 70 * scale;
  const top = baseY - h;
  return (
    <g>
      <polygon
        points={`${x - w / 2 - 2},${baseY} ${x - w / 2 + 2},${baseY} ${x - w / 2 + 4},${top + 12} ${x - w / 2 - 4},${top + 12}`}
        fill="#8a2018"
      />
      <polygon
        points={`${x + w / 2 - 2},${baseY} ${x + w / 2 + 2},${baseY} ${x + w / 2 + 4},${top + 12} ${x + w / 2 - 4},${top + 12}`}
        fill="#8a2018"
      />
      <rect x={x - w / 2 - 8} y={top + 18} width={w + 16} height={4} fill="#8a2018" />
      <path
        d={`M ${x - w / 2 - 14} ${top + 4}
            Q ${x - w / 2 - 16} ${top - 4} ${x - w / 2 - 8} ${top + 2}
            L ${x + w / 2 + 8} ${top + 2}
            Q ${x + w / 2 + 16} ${top - 4} ${x + w / 2 + 14} ${top + 4}
            L ${x + w / 2 + 8} ${top + 8} L ${x - w / 2 - 8} ${top + 8} Z`.replace(/\s+/g, ' ')}
        fill="#8a2018"
      />
      <rect x={x - w / 2 - 6} y={top + 11} width={w + 12} height={3} fill="#5a1410" />
      {/* Warm rim light from lanterns */}
      <line
        x1={x - w / 2 - 4}
        y1={top + 14}
        x2={x - w / 2 - 4}
        y2={baseY}
        stroke="#d04030"
        strokeWidth={0.8}
        opacity={0.7}
      />
      <line
        x1={x + w / 2 - 4}
        y1={top + 14}
        x2={x + w / 2 - 4}
        y2={baseY}
        stroke="#d04030"
        strokeWidth={0.8}
        opacity={0.7}
      />
    </g>
  );
}

// ─── Stone lantern (night, glowing) ────────────────────────────────
function StoneLantern({ x, baseY, scale = 1 }: { x: number; baseY: number; scale?: number }) {
  const s = scale;
  return (
    <g>
      <circle cx={x} cy={baseY - 30 * s} r={36 * s} fill="#ffb050" opacity={0.12} />
      <circle cx={x} cy={baseY - 30 * s} r={22 * s} fill="#ffb868" opacity={0.22} />
      <rect x={x - 8 * s} y={baseY - 6 * s} width={16 * s} height={6 * s} fill="#403830" />
      <rect x={x - 4 * s} y={baseY - 18 * s} width={8 * s} height={12 * s} fill="#352e28" />
      <rect x={x - 6 * s} y={baseY - 24 * s} width={12 * s} height={6 * s} fill="#453c34" />
      <rect x={x - 7 * s} y={baseY - 38 * s} width={14 * s} height={14 * s} fill="#403830" />
      <rect x={x - 5 * s} y={baseY - 36 * s} width={10 * s} height={12 * s} fill="#ffb050" opacity={0.5} />
      <rect x={x - 3.5 * s} y={baseY - 34.5 * s} width={7 * s} height={9 * s} fill="#ffd078" />
      <rect x={x - 2 * s} y={baseY - 33 * s} width={4 * s} height={6 * s} fill="#fff0c0" />
      <path
        d={`M ${x - 10 * s} ${baseY - 38 * s}
            Q ${x - 12 * s} ${baseY - 40 * s} ${x - 8 * s} ${baseY - 41 * s}
            L ${x} ${baseY - 47 * s} L ${x + 8 * s} ${baseY - 41 * s}
            Q ${x + 12 * s} ${baseY - 40 * s} ${x + 10 * s} ${baseY - 38 * s} Z`.replace(/\s+/g, ' ')}
        fill="#2a2520"
      />
      <circle cx={x} cy={baseY - 49 * s} r={1.6 * s} fill="#1a1814" />
    </g>
  );
}

// ─── Arched bridge (night) ─────────────────────────────────────────
function ArchedBridge({ x, baseY, scale = 1 }: { x: number; baseY: number; scale?: number }) {
  const w = 120 * scale;
  const h = 35 * scale;
  return (
    <g>
      {/* Dark pond with warm reflection ripples */}
      <ellipse cx={x} cy={baseY + 6} rx={w / 2 + 12} ry={10 * scale} fill="#1a2838" opacity={0.85} />
      <ellipse cx={x} cy={baseY + 4} rx={w / 2} ry={5 * scale} fill="#2a3848" opacity={0.7} />
      {[0, 1, 2].map((i) => (
        <ellipse
          key={i}
          cx={x - 30 + i * 30}
          cy={baseY + 4 + i * 2}
          rx={8 + i * 4}
          ry={0.6}
          fill="#a06030"
          opacity={0.25}
        />
      ))}
      <path
        d={`M ${x - w / 2} ${baseY}
            Q ${x} ${baseY - h * 1.4} ${x + w / 2} ${baseY}
            L ${x + w / 2 - 4} ${baseY}
            Q ${x} ${baseY - h * 1.4 + 8} ${x - w / 2 + 4} ${baseY} Z`.replace(/\s+/g, ' ')}
        fill="#601810"
      />
      <path
        d={`M ${x - w / 2 + 2} ${baseY - 2} Q ${x} ${baseY - h * 1.35} ${x + w / 2 - 2} ${baseY - 2}`}
        stroke="#8a2818"
        strokeWidth={6}
        fill="none"
        strokeLinecap="round"
      />
      {[-2, -1, 0, 1, 2].map((i) => {
        const t = (i + 2) / 4;
        const px = x - w / 2 + t * w;
        const py = baseY - h * (1 - Math.pow(2 * t - 1, 2));
        return <rect key={i} x={px - 1} y={py - 6 * scale} width={2} height={6 * scale} fill="#601810" />;
      })}
    </g>
  );
}

export default function YozakuraBackground() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1400 600"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className="yozakura-svg"
    >
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0a1428" />
          <stop offset="50%" stopColor="#1a2848" />
          <stop offset="100%" stopColor="#2c2848" />
        </linearGradient>
        <linearGradient id="mtnFar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1c1830" />
          <stop offset="100%" stopColor="#2a2440" />
        </linearGradient>
        <linearGradient id="mtnMid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#181428" />
          <stop offset="100%" stopColor="#241e38" />
        </linearGradient>
        <linearGradient id="fuji" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10122a" />
          <stop offset="100%" stopColor="#1a1838" />
        </linearGradient>
        <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e2228" />
          <stop offset="100%" stopColor="#161a20" />
        </linearGradient>
      </defs>

      {/* Sky */}
      <rect width="1400" height="600" fill="url(#sky)" />

      {/* Stars */}
      {starList.map((s, i) => (
        <g key={`star-${i}`}>
          <circle
            cx={s.x.toFixed(1)}
            cy={s.y.toFixed(1)}
            r={s.r.toFixed(1)}
            fill="#fff5d8"
            opacity={s.opacity.toFixed(2)}
          />
          {s.glint && (
            <>
              <line
                x1={(s.x - s.r * 2.5).toFixed(1)}
                y1={s.y.toFixed(1)}
                x2={(s.x + s.r * 2.5).toFixed(1)}
                y2={s.y.toFixed(1)}
                stroke="#fff5d8"
                strokeWidth={0.3}
                opacity={(s.opacity * 0.7).toFixed(2)}
              />
              <line
                x1={s.x.toFixed(1)}
                y1={(s.y - s.r * 2.5).toFixed(1)}
                x2={s.x.toFixed(1)}
                y2={(s.y + s.r * 2.5).toFixed(1)}
                stroke="#fff5d8"
                strokeWidth={0.3}
                opacity={(s.opacity * 0.7).toFixed(2)}
              />
            </>
          )}
        </g>
      ))}

      {/* Moon */}
      <Moon cx={1100} cy={130} r={35} />

      {/* Cirrus (pale silver) */}
      <g stroke="#d8dce8" fill="none" strokeLinecap="round">
        {cirrusData.map((wisp, i) => (
          <g key={`cirrus-${i}`} opacity={wisp.groupOpacity}>
            {wisp.strokes.map((s, j) => (
              <path key={j} d={s.d} strokeWidth={s.strokeWidth} opacity={s.opacity} />
            ))}
          </g>
        ))}
      </g>

      {/* Mt Fuji silhouette */}
      <path d={fuji.body} fill="url(#fuji)" />
      <path d={fuji.snow} fill="#5a5870" opacity={0.85} />

      {/* Distant hills */}
      <path d={farPath} fill="url(#mtnFar)" />
      <path d={midPath} fill="url(#mtnMid)" />

      {/* Ground */}
      <path d={groundPath} fill="url(#ground)" />

      {/* Stepping stones (dark) */}
      {stones.map((s, i) => (
        <g key={`stone-${i}`}>
          <ellipse
            cx={s.x.toFixed(1)}
            cy={(s.y + 1.5).toFixed(1)}
            rx={s.rx.toFixed(1)}
            ry={s.ry.toFixed(1)}
            fill="#1a1410"
            opacity={0.5}
          />
          <ellipse
            cx={s.x.toFixed(1)}
            cy={s.y.toFixed(1)}
            rx={s.rx.toFixed(1)}
            ry={s.ry.toFixed(1)}
            fill="#4a4038"
          />
          <ellipse
            cx={(s.x - 2).toFixed(1)}
            cy={(s.y - 1).toFixed(1)}
            rx={(s.rx * 0.5).toFixed(1)}
            ry={(s.ry * 0.4).toFixed(1)}
            fill="#5a5048"
          />
        </g>
      ))}

      {/* Back trees */}
      {backCherryData.map((tree, i) => (
        <CherryTreeG key={`back-${i}`} tree={tree} />
      ))}

      {/* Pagoda */}
      <Pagoda x={1080} baseY={545} scale={1.1} />

      {/* House and stone lanterns */}
      <JapaneseHouse x={450} baseY={555} scale={1.0} />
      <StoneLantern x={380} baseY={560} scale={1.0} />
      <StoneLantern x={560} baseY={560} scale={0.85} />

      {/* Bridge */}
      <ArchedBridge x={220} baseY={560} scale={0.85} />

      {/* Front trees */}
      {frontCherryData.map((tree, i) => (
        <CherryTreeG key={`front-${i}`} tree={tree} />
      ))}

      {/* Torii */}
      <Torii x={900} baseY={558} scale={1.0} />

      {/* 赤提灯 — festival strings of red paper lanterns */}
      <ChochinString from={{ x: 80, y: 460 }} to={{ x: 380, y: 470 }} sag={28} count={5} scale={0.8} />
      <ChochinString from={{ x: 380, y: 470 }} to={{ x: 700, y: 460 }} sag={28} count={6} scale={0.8} />
      <ChochinString from={{ x: 700, y: 460 }} to={{ x: 1000, y: 475 }} sag={30} count={6} scale={0.8} />
      <ChochinString from={{ x: 1000, y: 475 }} to={{ x: 1340, y: 462 }} sag={30} count={6} scale={0.8} />
      {/* Lanterns at the torii entrance */}
      <Akachochin x={870} y={510} scale={0.9} />
      <Akachochin x={930} y={510} scale={0.9} />
      {/* Lanterns near the pagoda */}
      <Akachochin x={1030} y={515} scale={0.7} />
      <Akachochin x={1130} y={515} scale={0.7} />
      {/* One over the bridge */}
      <Akachochin x={220} y={500} scale={0.85} />

      {/* Falling petals */}
      {petals.map((p, i) => (
        <ellipse
          key={`petal-${i}`}
          cx={p.x.toFixed(1)}
          cy={p.y.toFixed(1)}
          rx={p.rx.toFixed(1)}
          ry={p.ry.toFixed(1)}
          fill={p.fill}
          opacity={p.opacity.toFixed(2)}
          transform={`rotate(${p.angle.toFixed(1)} ${p.x.toFixed(1)} ${p.y.toFixed(1)})`}
        />
      ))}
    </svg>
  );
}
