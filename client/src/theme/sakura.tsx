// Deterministic seeded RNG (no SSR hydration mismatch).
function makeRng(seed: number) {
  let rng = seed;
  return () => {
    rng = (rng * 9301 + 49297) % 233280;
    return rng / 233280;
  };
}

type Peak = [number, number];

// ─── Background hills ──────────────────────────────────────────────
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

// ─── Mt Fuji ───────────────────────────────────────────────────────
// Wide base, gentle concave slopes, prominent snow cap.
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

// ─── Cirrus ─────────────────────────────────────────────────────────
interface CirrusSpec {
  x: number;
  y: number;
  w: number;
  angle: number;
  strokes: number;
  opacity: number;
}
const cirrusSpecs: CirrusSpec[] = [
  { x: 60, y: 55, w: 220, angle: -2, strokes: 7, opacity: 0.7 },
  { x: 360, y: 90, w: 180, angle: 3, strokes: 6, opacity: 0.6 },
  { x: 720, y: 45, w: 250, angle: -3, strokes: 8, opacity: 0.75 },
  { x: 1020, y: 90, w: 200, angle: 2, strokes: 6, opacity: 0.6 },
  { x: 1200, y: 50, w: 180, angle: -1, strokes: 5, opacity: 0.65 },
  { x: 250, y: 170, w: 130, angle: 2, strokes: 4, opacity: 0.5 },
  { x: 880, y: 180, w: 160, angle: -2, strokes: 5, opacity: 0.5 },
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

// ─── Cherry blossom tree ───────────────────────────────────────────
// Multi-layered blossom cloud: background light pink → mid pink → dark accents → highlights.
interface Branch {
  d: string;
  strokeWidth: number;
}
interface Blossom {
  cx: number;
  cy: number;
  r: number;
  fill: string;
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
  // Four layers, drawn back to front
  const layers = [
    {
      count: Math.floor(20 * scale),
      distMax: 1.0,
      rBase: 14,
      rJitter: 10,
      fill: '#fde2ea',
      yOffset: 0,
      xOffset: 0,
    },
    {
      count: Math.floor(40 * scale),
      distMax: 0.9,
      rBase: 8,
      rJitter: 8,
      fill: '#fbc2d5',
      yOffset: 0,
      xOffset: 0,
    },
    {
      count: Math.floor(28 * scale),
      distMax: 0.7,
      rBase: 5,
      rJitter: 7,
      fill: '#f598b8',
      yOffset: 6 * scale,
      xOffset: 0,
    },
    {
      count: Math.floor(22 * scale),
      distMax: 0.6,
      rBase: 4,
      rJitter: 5,
      fill: '#fef0f4',
      yOffset: -6 * scale,
      xOffset: -8 * scale,
    },
  ];
  for (const layer of layers) {
    for (let i = 0; i < layer.count; i++) {
      const angle = next() * Math.PI * 2;
      const dist = Math.sqrt(next()) * layer.distMax;
      blossoms.push({
        cx: cloudCx + Math.cos(angle) * dist * cloudRx + layer.xOffset,
        cy: cloudCy + Math.sin(angle) * dist * cloudRy + layer.yOffset,
        r: (layer.rBase + next() * layer.rJitter) * scale,
        fill: layer.fill,
      });
    }
  }
  return { trunkD, branches, blossoms };
}

function CherryTreeG({ tree }: { tree: CherryTree }) {
  return (
    <g>
      <path d={tree.trunkD} fill="#4a3020" />
      {tree.branches.map((b, i) => (
        <path
          key={i}
          d={b.d}
          stroke="#4a3020"
          strokeWidth={b.strokeWidth}
          fill="none"
          strokeLinecap="round"
        />
      ))}
      {tree.blossoms.map((b, i) => (
        <circle key={i} cx={b.cx.toFixed(1)} cy={b.cy.toFixed(1)} r={b.r.toFixed(1)} fill={b.fill} />
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
  const pinks = ['#f595b8', '#f8a8c5', '#fbc5d8'];
  for (let i = 0; i < 60; i++) {
    const x = next() * 1400;
    const y = next() * 580;
    const r = 1 + next() * 2;
    list.push({
      x,
      y,
      rx: r,
      ry: r * 0.6,
      fill: pinks[Math.floor(next() * pinks.length)]!,
      opacity: 0.5 + next() * 0.4,
      angle: next() * 60 - 30,
    });
  }
  return list;
})();

// ─── Japanese house ────────────────────────────────────────────────
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
      {/* Foundation */}
      <rect x={x - w / 2 - 4} y={baseY - 5} width={w + 8} height={5} fill="#7a6855" />
      {/* Wall (shoji cream) */}
      <rect x={x - w / 2} y={wallTop} width={w} height={h} fill="#f0e8d4" />
      <rect
        x={x - w / 2}
        y={wallTop}
        width={w}
        height={h}
        fill="none"
        stroke="#3a2a1f"
        strokeWidth={2 * scale}
      />
      {/* Vertical mullions */}
      {[1, 2, 3].map((i) => {
        const px = x - w / 2 + (w * i) / 4;
        return (
          <line
            key={i}
            x1={px}
            y1={wallTop}
            x2={px}
            y2={wallTop + h}
            stroke="#3a2a1f"
            strokeWidth={1.5 * scale}
          />
        );
      })}
      {/* Horizontal divider */}
      <line
        x1={x - w / 2}
        y1={wallTop + h / 2}
        x2={x + w / 2}
        y2={wallTop + h / 2}
        stroke="#3a2a1f"
        strokeWidth={1.2 * scale}
      />
      {/* Interior warm tint */}
      <rect x={x - w / 2 + 2} y={wallTop + 2} width={w - 4} height={h - 4} fill="#ffe8b0" opacity={0.15} />
      {/* Roof with upturned eaves */}
      <path
        d={`M ${leftEave} ${wallTop + 4}
            Q ${leftEave - 6} ${wallTop - 4} ${leftEave + 8} ${wallTop - 2}
            L ${x - 4} ${ridge + 2} L ${x} ${ridge} L ${x + 4} ${ridge + 2}
            L ${rightEave - 8} ${wallTop - 2}
            Q ${rightEave + 6} ${wallTop - 4} ${rightEave} ${wallTop + 4} Z`.replace(/\s+/g, ' ')}
        fill="#3a4a52"
      />
      <line x1={x} y1={ridge} x2={x} y2={ridge + 2} stroke="#1a2628" strokeWidth={2} />
      <path
        d={`M ${leftEave + 5} ${wallTop - 1} L ${x} ${ridge + 1} L ${rightEave - 5} ${wallTop - 1}`}
        stroke="#5a6a72"
        strokeWidth={1.2}
        fill="none"
      />
      {/* Sliding door */}
      <rect x={x - doorW / 2} y={baseY - doorH} width={doorW} height={doorH} fill="#d8c8a8" />
      <rect
        x={x - doorW / 2}
        y={baseY - doorH}
        width={doorW}
        height={doorH}
        fill="none"
        stroke="#3a2a1f"
        strokeWidth={1.2}
      />
      <line x1={x} y1={baseY - doorH} x2={x} y2={baseY} stroke="#3a2a1f" strokeWidth={1} />
    </g>
  );
}

// ─── Pagoda ────────────────────────────────────────────────────────
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
    const ry = curY - hWall + 10 * scale * tierScale;
    elements.push(
      <g key={`tier-${i}`}>
        <rect x={x - wWall / 2} y={ry} width={wWall} height={hWall} fill="#e8d8a8" />
        <rect
          x={x - wWall / 2}
          y={ry}
          width={wWall}
          height={hWall}
          fill="none"
          stroke="#3a2a1f"
          strokeWidth={0.9}
        />
        {i === 0 && (
          <rect
            x={x - 6 * scale * tierScale}
            y={ry + 5}
            width={12 * scale * tierScale}
            height={hWall - 9}
            fill="#5a4030"
          />
        )}
        <path
          d={`M ${x - wRoof / 2} ${ry + 3}
              Q ${x - wRoof / 2 - 6} ${ry - 6} ${x - wRoof / 2 + 10} ${ry - 4}
              L ${x} ${ry - hRoof}
              L ${x + wRoof / 2 - 10} ${ry - 4}
              Q ${x + wRoof / 2 + 6} ${ry - 6} ${x + wRoof / 2} ${ry + 3} Z`.replace(/\s+/g, ' ')}
          fill="#9a3a28"
        />
        <rect x={x - wRoof / 2} y={ry + 3} width={wRoof} height={2} fill="#5a2018" />
        <line
          x1={x - wRoof / 2 + 8}
          y1={ry}
          x2={x}
          y2={ry - hRoof + 2}
          stroke="#c85838"
          strokeWidth={0.8}
          opacity={0.8}
        />
      </g>
    );
    curY = ry - hRoof;
  }
  return (
    <g>
      {elements.reverse()}
      {/* Spire */}
      <line x1={x} y1={curY} x2={x} y2={curY - 28 * scale} stroke="#5a4030" strokeWidth={2.5 * scale} />
      {[0, 1, 2, 3].map((i) => (
        <ellipse
          key={i}
          cx={x}
          cy={curY - 6 - i * 5.5 * scale}
          rx={3.2 * scale}
          ry={1 * scale}
          fill="#c0a050"
        />
      ))}
      <circle cx={x} cy={curY - 27 * scale} r={2.2 * scale} fill="#c0a050" />
    </g>
  );
}

// ─── Torii gate ────────────────────────────────────────────────────
function Torii({ x, baseY, scale = 1 }: { x: number; baseY: number; scale?: number }) {
  const h = 90 * scale;
  const w = 70 * scale;
  const top = baseY - h;
  return (
    <g>
      {/* Pillars */}
      <polygon
        points={`${x - w / 2 - 2},${baseY} ${x - w / 2 + 2},${baseY} ${x - w / 2 + 4},${top + 12} ${x - w / 2 - 4},${top + 12}`}
        fill="#c44030"
      />
      <polygon
        points={`${x + w / 2 - 2},${baseY} ${x + w / 2 + 2},${baseY} ${x + w / 2 + 4},${top + 12} ${x + w / 2 - 4},${top + 12}`}
        fill="#c44030"
      />
      {/* Lower beam (nuki) */}
      <rect x={x - w / 2 - 8} y={top + 18} width={w + 16} height={4} fill="#c44030" />
      {/* Top beam (kasagi) with upturned ends */}
      <path
        d={`M ${x - w / 2 - 14} ${top + 4}
            Q ${x - w / 2 - 16} ${top - 4} ${x - w / 2 - 8} ${top + 2}
            L ${x + w / 2 + 8} ${top + 2}
            Q ${x + w / 2 + 16} ${top - 4} ${x + w / 2 + 14} ${top + 4}
            L ${x + w / 2 + 8} ${top + 8} L ${x - w / 2 - 8} ${top + 8} Z`.replace(/\s+/g, ' ')}
        fill="#c44030"
      />
      {/* Shimaki (support) */}
      <rect x={x - w / 2 - 6} y={top + 11} width={w + 12} height={3} fill="#a02818" />
    </g>
  );
}

// ─── Stone lantern (toro) ──────────────────────────────────────────
function StoneLantern({ x, baseY, scale = 1 }: { x: number; baseY: number; scale?: number }) {
  const s = scale;
  return (
    <g>
      <rect x={x - 8 * s} y={baseY - 6 * s} width={16 * s} height={6 * s} fill="#9a9088" />
      <rect x={x - 4 * s} y={baseY - 18 * s} width={8 * s} height={12 * s} fill="#8a8078" />
      <rect x={x - 6 * s} y={baseY - 24 * s} width={12 * s} height={6 * s} fill="#a09890" />
      <rect x={x - 7 * s} y={baseY - 38 * s} width={14 * s} height={14 * s} fill="#9a9088" />
      {/* Warm glow */}
      <rect x={x - 4 * s} y={baseY - 35 * s} width={8 * s} height={10 * s} fill="#ffb868" opacity={0.3} />
      <rect x={x - 3 * s} y={baseY - 34 * s} width={6 * s} height={8 * s} fill="#ffb868" />
      <path
        d={`M ${x - 10 * s} ${baseY - 38 * s}
            Q ${x - 12 * s} ${baseY - 40 * s} ${x - 8 * s} ${baseY - 41 * s}
            L ${x} ${baseY - 47 * s} L ${x + 8 * s} ${baseY - 41 * s}
            Q ${x + 12 * s} ${baseY - 40 * s} ${x + 10 * s} ${baseY - 38 * s} Z`.replace(/\s+/g, ' ')}
        fill="#7a7068"
      />
      <circle cx={x} cy={baseY - 49 * s} r={1.6 * s} fill="#5a5048" />
    </g>
  );
}

// ─── Arched bridge (taiko-bashi) ───────────────────────────────────
function ArchedBridge({ x, baseY, scale = 1 }: { x: number; baseY: number; scale?: number }) {
  const w = 120 * scale;
  const h = 35 * scale;
  return (
    <g>
      {/* Pond */}
      <ellipse cx={x} cy={baseY + 6} rx={w / 2 + 12} ry={10 * scale} fill="#a8c4d8" opacity={0.7} />
      <ellipse cx={x} cy={baseY + 6} rx={w / 2} ry={6 * scale} fill="#c4d8e4" opacity={0.5} />
      {/* Arch body */}
      <path
        d={`M ${x - w / 2} ${baseY}
            Q ${x} ${baseY - h * 1.4} ${x + w / 2} ${baseY}
            L ${x + w / 2 - 4} ${baseY}
            Q ${x} ${baseY - h * 1.4 + 8} ${x - w / 2 + 4} ${baseY} Z`.replace(/\s+/g, ' ')}
        fill="#a02818"
      />
      <path
        d={`M ${x - w / 2 + 2} ${baseY - 2} Q ${x} ${baseY - h * 1.35} ${x + w / 2 - 2} ${baseY - 2}`}
        stroke="#c44030"
        strokeWidth={6}
        fill="none"
        strokeLinecap="round"
      />
      {/* Railing posts */}
      {[-2, -1, 0, 1, 2].map((i) => {
        const t = (i + 2) / 4;
        const px = x - w / 2 + t * w;
        const py = baseY - h * (1 - Math.pow(2 * t - 1, 2));
        return <rect key={i} x={px - 1} y={py - 6 * scale} width={2} height={6 * scale} fill="#a02818" />;
      })}
    </g>
  );
}

// ─── Stepping-stone path ───────────────────────────────────────────
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

export default function Sakura() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1400 600"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className="sakura-svg"
    >
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fde2ea" />
          <stop offset="45%" stopColor="#fef0e8" />
          <stop offset="100%" stopColor="#e8e4ec" />
        </linearGradient>
        <linearGradient id="mtnFar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c8a8b8" />
          <stop offset="100%" stopColor="#d8b8c8" />
        </linearGradient>
        <linearGradient id="mtnMid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a890a0" />
          <stop offset="100%" stopColor="#b8a0b0" />
        </linearGradient>
        <linearGradient id="fuji" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9080a0" />
          <stop offset="100%" stopColor="#b8a0b8" />
        </linearGradient>
        <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#bcc4a4" />
          <stop offset="100%" stopColor="#a4b08c" />
        </linearGradient>
      </defs>

      {/* Sky */}
      <rect width="1400" height="600" fill="url(#sky)" />

      {/* Cirrus */}
      <g stroke="#ffffff" fill="none" strokeLinecap="round">
        {cirrusData.map((wisp, i) => (
          <g key={`cirrus-${i}`} opacity={wisp.groupOpacity}>
            {wisp.strokes.map((s, j) => (
              <path key={j} d={s.d} strokeWidth={s.strokeWidth} opacity={s.opacity} />
            ))}
          </g>
        ))}
      </g>

      {/* Mt Fuji */}
      <path d={fuji.body} fill="url(#fuji)" />
      <path d={fuji.snow} fill="#f8f4f8" opacity={0.95} />

      {/* Background hills */}
      <path d={farPath} fill="url(#mtnFar)" />
      <path d={midPath} fill="url(#mtnMid)" />

      {/* Ground */}
      <path d={groundPath} fill="url(#ground)" />

      {/* Stepping stones */}
      {stones.map((s, i) => (
        <g key={`stone-${i}`}>
          <ellipse
            cx={s.x.toFixed(1)}
            cy={(s.y + 1.5).toFixed(1)}
            rx={s.rx.toFixed(1)}
            ry={s.ry.toFixed(1)}
            fill="#605040"
            opacity={0.4}
          />
          <ellipse
            cx={s.x.toFixed(1)}
            cy={s.y.toFixed(1)}
            rx={s.rx.toFixed(1)}
            ry={s.ry.toFixed(1)}
            fill="#a09080"
          />
          <ellipse
            cx={(s.x - 2).toFixed(1)}
            cy={(s.y - 1).toFixed(1)}
            rx={(s.rx * 0.5).toFixed(1)}
            ry={(s.ry * 0.4).toFixed(1)}
            fill="#b8a890"
          />
        </g>
      ))}

      {/* Back row of cherry trees */}
      {backCherryData.map((tree, i) => (
        <CherryTreeG key={`back-${i}`} tree={tree} />
      ))}

      {/* Pagoda nestled in trees */}
      <Pagoda x={1080} baseY={545} scale={1.1} />

      {/* House and lanterns */}
      <JapaneseHouse x={450} baseY={555} scale={1.0} />
      <StoneLantern x={380} baseY={560} scale={1.0} />
      <StoneLantern x={560} baseY={560} scale={0.85} />

      {/* Arched bridge */}
      <ArchedBridge x={220} baseY={560} scale={0.85} />

      {/* Front row of cherry trees */}
      {frontCherryData.map((tree, i) => (
        <CherryTreeG key={`front-${i}`} tree={tree} />
      ))}

      {/* Torii gate as foreground focal point */}
      <Torii x={900} baseY={558} scale={1.0} />

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
