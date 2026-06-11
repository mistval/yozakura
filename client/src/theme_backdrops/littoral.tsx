// Deterministic seeded RNG (no SSR hydration mismatch).
function makeRng(seed: number) {
  let rng = seed;
  return () => {
    rng = (rng * 9301 + 49297) % 233280;
    return rng / 233280;
  };
}

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
  { x: 50, y: 70, w: 240, angle: -2, strokes: 7, opacity: 0.75 },
  { x: 340, y: 110, w: 180, angle: 3, strokes: 6, opacity: 0.65 },
  { x: 1050, y: 100, w: 200, angle: 2, strokes: 6, opacity: 0.65 },
  { x: 1230, y: 150, w: 150, angle: -1, strokes: 5, opacity: 0.55 },
  { x: 250, y: 200, w: 130, angle: 2, strokes: 4, opacity: 0.55 },
  { x: 820, y: 180, w: 160, angle: -2, strokes: 5, opacity: 0.6 },
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

// ─── Water sparkles ─────────────────────────────────────────────────
interface Sparkle {
  x: number;
  y: number;
  len?: number;
  r?: number;
  strokeWidth?: number;
  opacity: number;
  kind: 'line' | 'dot';
}
const sparkles: Sparkle[] = (() => {
  const next = makeRng(3333);
  const list: Sparkle[] = [];
  for (let i = 0; i < 50; i++) {
    list.push({
      x: next() * 1400,
      y: 320 + next() * 130,
      len: 8 + next() * 24,
      strokeWidth: 0.4 + next() * 0.6,
      opacity: 0.4 + next() * 0.4,
      kind: 'line',
    });
  }
  for (let i = 0; i < 25; i++) {
    list.push({
      x: next() * 1400,
      y: 310 + next() * 140,
      r: 0.6 + next() * 1.2,
      opacity: 0.6 + next() * 0.3,
      kind: 'dot',
    });
  }
  return list;
})();

// ─── Shore foam ────────────────────────────────────────────────────
interface FoamPuff {
  x: number;
  y: number;
  rx: number;
  ry: number;
  opacity: number;
}
const foamPath = (() => {
  const next = makeRng(5555);
  let d = 'M -10 460 ';
  for (let x = 0; x <= 1400; x += 20) {
    const y = 460 + Math.sin(x / 35) * 3 + (next() - 0.5) * 3;
    d += `L ${x} ${y.toFixed(1)} `;
  }
  d += 'L 1410 470 L 1410 480 L -10 480 Z';
  return d;
})();
const foamPuffs: FoamPuff[] = (() => {
  const next = makeRng(5556);
  const list: FoamPuff[] = [];
  for (let i = 0; i < 30; i++) {
    list.push({
      x: next() * 1400,
      y: 458 + next() * 8,
      rx: 6 + next() * 12,
      ry: 1.5 + next() * 2,
      opacity: 0.5 + next() * 0.4,
    });
  }
  return list;
})();

// ─── Sand texture ──────────────────────────────────────────────────
interface SandGrain {
  x: number;
  y: number;
  r: number;
  fill: string;
  opacity: number;
}
const sandGrains: SandGrain[] = (() => {
  const next = makeRng(7777);
  const list: SandGrain[] = [];
  for (let i = 0; i < 200; i++) {
    list.push({
      x: next() * 1400,
      y: 460 + next() * 140,
      r: 0.4 + next() * 0.9,
      fill: next() > 0.5 ? '#c8a868' : '#a88a48',
      opacity: 0.4 + next() * 0.4,
    });
  }
  return list;
})();

// ─── Sun ────────────────────────────────────────────────────────────
function Sun({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r * 3} fill="#fff5d0" opacity={0.2} />
      <circle cx={cx} cy={cy} r={r * 2} fill="#fff5d0" opacity={0.4} />
      <circle cx={cx} cy={cy} r={r * 1.3} fill="#fff8e0" opacity={0.7} />
      <circle cx={cx} cy={cy} r={r} fill="#fffae0" />
      <circle cx={cx} cy={cy} r={r * 0.6} fill="#ffffff" />
    </g>
  );
}

// ─── Distant palm (silhouette for island) ──────────────────────────
function DistantPalm({ x, baseY, scale = 1 }: { x: number; baseY: number; scale?: number }) {
  const h = 28 * scale;
  const top = baseY - h;
  const fronds = 7;
  const frondElements: React.ReactNode[] = [];
  for (let i = 0; i < fronds; i++) {
    const angle = -Math.PI / 2 + (i / (fronds - 1) - 0.5) * Math.PI * 1.4;
    const len = (8 + (i % 2) * 3) * scale;
    const ex = x + 0.5 * scale + Math.cos(angle) * len;
    const ey = top + Math.sin(angle) * len;
    const cx = (x + ex) / 2 + Math.cos(angle + Math.PI / 2) * 2 * scale;
    const cy = (top + ey) / 2 + Math.sin(angle + Math.PI / 2) * 2 * scale + 1;
    frondElements.push(
      <path
        key={i}
        d={`M ${x + 0.5 * scale} ${top} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`}
        stroke="#3a5848"
        strokeWidth={1.2 * scale}
        fill="none"
        strokeLinecap="round"
      />
    );
  }
  return (
    <g>
      <path
        d={`M ${x} ${baseY} Q ${x - 1.5 * scale} ${baseY - h / 2} ${x + 0.5 * scale} ${baseY - h}`}
        stroke="#3a4030"
        strokeWidth={1.5 * scale}
        fill="none"
      />
      {frondElements}
    </g>
  );
}

// ─── Island ────────────────────────────────────────────────────────
function Island({ cx, baseY, scale = 1 }: { cx: number; baseY: number; scale?: number }) {
  const w = 240 * scale;
  const h = 60 * scale;
  const left = cx - w;
  const right = cx + w;
  const palmPositions = [
    { x: cx - w * 0.5, y: baseY - h * 0.4, scale: 0.4 },
    { x: cx - w * 0.1, y: baseY - h * 0.7, scale: 0.5 },
    { x: cx + w * 0.35, y: baseY - h * 0.5, scale: 0.4 },
    { x: cx + w * 0.7, y: baseY - h * 0.2, scale: 0.35 },
  ];
  return (
    <g>
      <path
        d={`M ${left} ${baseY}
            C ${left + w * 0.3} ${baseY - h * 0.5}, ${cx - w * 0.6} ${baseY - h * 0.85}, ${cx - w * 0.2} ${baseY - h * 0.65}
            C ${cx - w * 0.05} ${baseY - h * 0.95}, ${cx + w * 0.1} ${baseY - h * 1.05}, ${cx + w * 0.3} ${baseY - h * 0.75}
            C ${cx + w * 0.55} ${baseY - h * 0.4}, ${cx + w * 0.8} ${baseY - h * 0.3}, ${right} ${baseY} Z`.replace(
          /\s+/g,
          ' '
        )}
        fill="#5a8a78"
      />
      <path
        d={`M ${left} ${baseY}
            C ${left + w * 0.4} ${baseY + h * 0.05}, ${cx} ${baseY - h * 0.05}, ${cx + w * 0.4} ${baseY + h * 0.02}
            L ${right} ${baseY} Z`.replace(/\s+/g, ' ')}
        fill="#e8c878"
        opacity={0.8}
      />
      {palmPositions.map((p, i) => (
        <DistantPalm key={i} x={p.x} baseY={p.y} scale={p.scale} />
      ))}
    </g>
  );
}

// ─── Foreground palm tree ──────────────────────────────────────────
function PalmTree({ x, baseY, scale = 1 }: { x: number; baseY: number; scale?: number }) {
  const trunkH = 240 * scale;
  const trunkW = 14 * scale;
  const topX = x + 35 * scale;
  const topY = baseY - trunkH;
  const ctrlX = x + 14 * scale;
  const ctrlY = baseY - trunkH * 0.6;
  // Trunk rings
  const rings: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let i = 0; i < 11; i++) {
    const t = i / 11;
    const tx = (1 - t) * (1 - t) * x + 2 * (1 - t) * t * ctrlX + t * t * topX;
    const ty = (1 - t) * (1 - t) * baseY + 2 * (1 - t) * t * ctrlY + t * t * topY;
    rings.push({ x1: tx - trunkW * 0.4, y1: ty, x2: tx + trunkW * 0.4, y2: ty + 1.5 });
  }
  // Fronds
  const fronds: React.ReactNode[] = [];
  const frondCount = 11;
  for (let i = 0; i < frondCount; i++) {
    const angle = -Math.PI / 2 + (i / (frondCount - 1) - 0.5) * Math.PI * 1.6;
    const len = (90 + ((i + 1) % 3) * 18) * scale;
    const ex = topX + Math.cos(angle) * len;
    const ey = topY + Math.sin(angle) * len + Math.abs(Math.cos(angle)) * len * 0.35;
    const midX = topX + Math.cos(angle) * len * 0.45;
    const midY = topY + Math.sin(angle) * len * 0.45 - 12 * scale;
    const perpX = -Math.sin(angle);
    const perpY = Math.cos(angle);
    const bulgeOuter = 9 * scale;
    const bulgeInner = 5 * scale;
    const leaflets: React.ReactNode[] = [];
    const leafletCount = 5;
    for (let j = 1; j < leafletCount; j++) {
      const tt = j / leafletCount;
      const sx = (1 - tt) * topX + tt * ex;
      const sy = (1 - tt) * topY + tt * ey;
      const llen = bulgeOuter * (1 - tt * 0.5);
      const lex = sx + perpX * llen;
      const ley = sy + perpY * llen + 1.5 * scale;
      leaflets.push(
        <line
          key={j}
          x1={sx.toFixed(1)}
          y1={sy.toFixed(1)}
          x2={lex.toFixed(1)}
          y2={ley.toFixed(1)}
          stroke="#1f3528"
          strokeWidth={0.6 * scale}
          opacity={0.7}
        />
      );
    }
    fronds.push(
      <g key={i}>
        <path
          d={`M ${topX} ${topY}
              Q ${(midX + perpX * bulgeOuter).toFixed(1)} ${(midY + perpY * bulgeOuter).toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}
              Q ${(midX - perpX * bulgeInner).toFixed(1)} ${(midY - perpY * bulgeInner).toFixed(1)} ${topX} ${topY} Z`.replace(
            /\s+/g,
            ' '
          )}
          fill="#2d5a3a"
        />
        <path
          d={`M ${topX} ${topY} Q ${(midX + perpX * bulgeOuter * 0.7).toFixed(1)} ${(midY + perpY * bulgeOuter * 0.7).toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`}
          stroke="#5a8048"
          strokeWidth={1.5 * scale}
          fill="none"
          strokeLinecap="round"
        />
        {leaflets}
      </g>
    );
  }
  return (
    <g>
      {/* Trunk */}
      <path
        d={`M ${x - trunkW / 2} ${baseY}
            Q ${ctrlX - trunkW / 2} ${ctrlY} ${topX - trunkW / 3} ${topY}
            L ${topX + trunkW / 3} ${topY}
            Q ${ctrlX + trunkW / 2} ${ctrlY} ${x + trunkW / 2} ${baseY} Z`.replace(/\s+/g, ' ')}
        fill="#6b4a30"
      />
      {rings.map((r, i) => (
        <line
          key={i}
          x1={r.x1.toFixed(1)}
          y1={r.y1.toFixed(1)}
          x2={r.x2.toFixed(1)}
          y2={r.y2.toFixed(1)}
          stroke="#4a3220"
          strokeWidth={1.2 * scale}
          opacity={0.6}
        />
      ))}
      {/* Coconuts */}
      {[
        [-6, 4],
        [-2, 7],
        [4, 5],
        [8, 8],
      ].map(([dx, dy], i) => (
        <circle
          key={i}
          cx={(topX + dx! * scale).toFixed(1)}
          cy={(topY + dy! * scale).toFixed(1)}
          r={4 * scale}
          fill="#3a2818"
        />
      ))}
      {fronds}
    </g>
  );
}

// ─── Dolphin ───────────────────────────────────────────────────────
function Dolphin({ cx, cy, scale = 1 }: { cx: number; cy: number; scale?: number }) {
  const splashY = cy + 20 * scale;
  const next = makeRng(8888);
  const droplets: { x: number; y: number; r: number; opacity: number }[] = [];
  for (let i = 0; i < 8; i++) {
    droplets.push({
      x: cx + (next() - 0.5) * 80 * scale,
      y: splashY + (next() - 0.2) * 18 * scale,
      r: (2 + next() * 4) * scale,
      opacity: 0.5 + next() * 0.4,
    });
  }
  return (
    <g>
      <g transform={`translate(${cx},${cy})`}>
        {/* Body */}
        <path
          d="M -55 12 C -60 2, -50 -8, -30 -15 C -10 -22, 20 -25, 40 -22 C 55 -19, 62 -10, 58 -2 C 52 6, 30 2, 10 4 C -10 6, -30 12, -45 18 C -52 20, -58 18, -55 12 Z"
          fill="#5a7888"
        />
        {/* Lighter belly */}
        <path
          d="M -45 14 C -25 16, 0 12, 25 8 C 38 6, 50 4, 55 6 C 50 10, 35 13, 15 14 C -10 15, -35 18, -45 14 Z"
          fill="#a8c0c8"
        />
        {/* Dorsal fin */}
        <path d="M 8 -22 Q 15 -38, 25 -33 Q 18 -28, 14 -22 Z" fill="#4a6878" />
        {/* Side fin */}
        <path d="M -8 10 Q -18 22, -28 18 Q -16 12, -10 8 Z" fill="#4a6878" />
        {/* Tail fluke */}
        <path
          d="M -50 10 Q -68 0, -76 6 Q -72 14, -55 18 Q -68 22, -70 30 Q -60 24, -50 18 Z"
          fill="#4a6878"
        />
        {/* Eye */}
        <circle cx={44} cy={-12} r={1.5} fill="#1a1410" />
        {/* Mouth */}
        <path d="M 50 -5 Q 58 -2 56 2" stroke="#3a4858" strokeWidth={0.8} fill="none" />
      </g>
      {/* Splash arc */}
      <ellipse
        cx={cx}
        cy={(splashY + 8 * scale).toFixed(1)}
        rx={60 * scale}
        ry={8 * scale}
        fill="#ffffff"
        opacity={0.6}
      />
      <ellipse
        cx={cx}
        cy={(splashY + 12 * scale).toFixed(1)}
        rx={48 * scale}
        ry={5 * scale}
        fill="#ffffff"
        opacity={0.8}
      />
      {droplets.map((d, i) => (
        <circle
          key={i}
          cx={d.x.toFixed(1)}
          cy={d.y.toFixed(1)}
          r={d.r.toFixed(1)}
          fill="#ffffff"
          opacity={d.opacity.toFixed(2)}
        />
      ))}
    </g>
  );
}

// ─── Beach umbrella ────────────────────────────────────────────────
function Umbrella({ x, baseY, scale = 1 }: { x: number; baseY: number; scale?: number }) {
  const s = scale;
  const cx = x;
  const cy = baseY - 90 * s;
  const rx = 60 * s;
  const ry = 22 * s;
  const slices = 10;
  const wedges: React.ReactNode[] = [];
  for (let i = 0; i < slices; i++) {
    const a1 = Math.PI + (i / slices) * Math.PI;
    const a2 = Math.PI + ((i + 1) / slices) * Math.PI;
    const x1 = cx + Math.cos(a1) * rx;
    const y1 = cy + Math.sin(a1) * ry;
    const x2 = cx + Math.cos(a2) * rx;
    const y2 = cy + Math.sin(a2) * ry;
    const color = i % 2 === 0 ? '#e84a3f' : '#fafafa';
    wedges.push(
      <path
        key={i}
        d={`M ${cx} ${cy} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${rx} ${ry} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z`}
        fill={color}
      />
    );
  }
  return (
    <g>
      <rect x={x - 1.5 * s} y={baseY - 90 * s} width={3 * s} height={90 * s} fill="#5a4030" />
      {wedges}
      <circle cx={cx} cy={cy - 2} r={2.5 * s} fill="#e84a3f" />
      <path
        d={`M ${(cx - rx).toFixed(1)} ${cy} A ${rx} ${ry} 0 0 1 ${(cx + rx).toFixed(1)} ${cy}`}
        stroke="#8a2a20"
        strokeWidth={1.2 * s}
        fill="none"
      />
    </g>
  );
}

// ─── Starfish ──────────────────────────────────────────────────────
function Starfish({
  cx,
  cy,
  scale = 1,
  rotation = 0,
}: {
  cx: number;
  cy: number;
  scale?: number;
  rotation?: number;
}) {
  const outerR = 12 * scale;
  const innerR = 5 * scale;
  let starPath = '';
  for (let p = 0; p < 10; p++) {
    const a = (p / 10) * Math.PI * 2 - Math.PI / 2 + rotation;
    const r = p % 2 === 0 ? outerR : innerR;
    starPath += `${p === 0 ? 'M' : 'L'} ${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)} `;
  }
  starPath += 'Z';
  const next = makeRng(Math.floor(cx + cy));
  const dots: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const a = next() * Math.PI * 2;
    const r = next() * outerR * 0.7;
    dots.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return (
    <g>
      <path d={starPath} fill="#e87858" />
      <circle cx={cx} cy={cy} r={3 * scale} fill="#a85040" />
      {dots.map((d, i) => (
        <circle
          key={i}
          cx={d.x.toFixed(1)}
          cy={d.y.toFixed(1)}
          r={0.8 * scale}
          fill="#a04030"
          opacity={0.7}
        />
      ))}
    </g>
  );
}

// ─── Seashell ──────────────────────────────────────────────────────
function Seashell({
  cx,
  cy,
  scale = 1,
  rotation = 0,
}: {
  cx: number;
  cy: number;
  scale?: number;
  rotation?: number;
}) {
  const ridges: React.ReactNode[] = [];
  for (let i = -3; i <= 3; i++) {
    ridges.push(
      <path
        key={i}
        d={`M ${i * 2} -10 Q ${i * 1.5} -2 ${i * 0.8} 3`}
        transform={`scale(${scale})`}
        stroke="#c8a868"
        strokeWidth={0.4}
        fill="none"
      />
    );
  }
  return (
    <g transform={`translate(${cx},${cy}) rotate(${rotation})`}>
      <path
        d="M -10 0 Q -8 -10 0 -12 Q 8 -10 10 0 Q 8 4 0 4 Q -8 4 -10 0 Z"
        transform={`scale(${scale})`}
        fill="#f0d8a0"
      />
      {ridges}
      <ellipse cx={-3} cy={-7} rx={3} ry={2} transform={`scale(${scale})`} fill="#fff0c8" opacity={0.7} />
    </g>
  );
}

// ─── Sandcastle ────────────────────────────────────────────────────
function Sandcastle({ x, baseY, scale = 1 }: { x: number; baseY: number; scale?: number }) {
  const s = scale;
  const baseCrenellations: React.ReactNode[] = [];
  for (let i = 0; i < 6; i++) {
    if (i % 2 === 0) {
      baseCrenellations.push(
        <rect
          key={i}
          x={x - 28 * s + i * 9.3 * s}
          y={baseY - 22 * s}
          width={4 * s}
          height={4 * s}
          fill="#d4b478"
        />
      );
    }
  }
  const towerCrenellations: React.ReactNode[] = [];
  for (let i = 0; i < 3; i++) {
    if (i % 2 === 0) {
      towerCrenellations.push(
        <rect
          key={i}
          x={x - 8 * s + i * 5.3 * s}
          y={baseY - 44 * s}
          width={3 * s}
          height={4 * s}
          fill="#c4a468"
        />
      );
    }
  }
  return (
    <g>
      <rect x={x - 28 * s} y={baseY - 18 * s} width={56 * s} height={18 * s} fill="#d4b478" />
      {baseCrenellations}
      <rect x={x - 8 * s} y={baseY - 40 * s} width={16 * s} height={22 * s} fill="#c4a468" />
      {towerCrenellations}
      <rect x={x - 28 * s} y={baseY - 28 * s} width={8 * s} height={10 * s} fill="#c4a468" />
      <rect x={x + 20 * s} y={baseY - 28 * s} width={8 * s} height={10 * s} fill="#c4a468" />
      <polygon
        points={`${x - 28 * s},${baseY - 28 * s} ${x - 20 * s},${baseY - 28 * s} ${x - 24 * s},${baseY - 36 * s}`}
        fill="#a8845a"
      />
      <polygon
        points={`${x + 20 * s},${baseY - 28 * s} ${x + 28 * s},${baseY - 28 * s} ${x + 24 * s},${baseY - 36 * s}`}
        fill="#a8845a"
      />
      <path
        d={`M ${x - 3 * s} ${baseY - 18 * s} L ${x - 3 * s} ${baseY - 25 * s} Q ${x} ${baseY - 28 * s} ${x + 3 * s} ${baseY - 25 * s} L ${x + 3 * s} ${baseY - 18 * s} Z`}
        fill="#7a5430"
      />
      <line x1={x} y1={baseY - 40 * s} x2={x} y2={baseY - 52 * s} stroke="#5a4030" strokeWidth={0.8} />
      <polygon
        points={`${x},${baseY - 52 * s} ${x + 6 * s},${baseY - 49 * s} ${x},${baseY - 46 * s}`}
        fill="#e84a3f"
      />
    </g>
  );
}

// ─── Sailboat ──────────────────────────────────────────────────────
function Sailboat({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  const s = scale;
  return (
    <g>
      <path
        d={`M ${x - 14 * s} ${y} Q ${x} ${y + 5 * s} ${x + 14 * s} ${y} L ${x + 11 * s} ${y + 3 * s} Q ${x} ${y + 6 * s} ${x - 11 * s} ${y + 3 * s} Z`}
        fill="#5a4030"
      />
      <line x1={x} y1={y} x2={x} y2={y - 35 * s} stroke="#5a4030" strokeWidth={1 * s} />
      <polygon points={`${x},${y - 35 * s} ${x + 18 * s},${y - 2 * s} ${x},${y - 2 * s}`} fill="#ffffff" />
      <polygon
        points={`${x},${y - 35 * s} ${x + 18 * s},${y - 2 * s} ${x},${y - 2 * s}`}
        fill="none"
        stroke="#c8c8c8"
        strokeWidth={0.5}
      />
      <polygon points={`${x},${y - 30 * s} ${x - 12 * s},${y - 2 * s} ${x},${y - 2 * s}`} fill="#fafafa" />
    </g>
  );
}

// ─── Seagull ───────────────────────────────────────────────────────
function Seagull({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  const wing = 12 * scale;
  const arch = 4 * scale;
  return (
    <path
      d={`M ${x - wing} ${y} Q ${x - wing / 2} ${y - arch * 2.2} ${x} ${y} Q ${x + wing / 2} ${y - arch * 2.2} ${x + wing} ${y}`}
      stroke="#3a4858"
      strokeWidth={1.2 * scale}
      fill="none"
      strokeLinecap="round"
    />
  );
}

// ─── Beach towel ───────────────────────────────────────────────────
function BeachTowel({ x, baseY, scale = 1 }: { x: number; baseY: number; scale?: number }) {
  const w = 120 * scale;
  const h = 65 * scale;
  const stripeCount = 7;
  const stripeH = h / stripeCount;
  const stripes: React.ReactNode[] = [];
  for (let i = 0; i < stripeCount; i++) {
    if (i % 2 === 1) {
      stripes.push(
        <rect key={i} x={-w / 2} y={-h + i * stripeH} width={w} height={stripeH} fill="#fafafa" />
      );
    }
  }
  return (
    <g transform={`translate(${x},${baseY}) rotate(-8)`}>
      <rect x={-w / 2} y={-h} width={w} height={h} fill="#3fa0c8" />
      {stripes}
      <rect x={-w / 2} y={-h} width={w} height={h} fill="none" stroke="#2a7898" strokeWidth={1} />
    </g>
  );
}

// ─── Beach ball ────────────────────────────────────────────────────
// Six "lemon slice" panels — each bounded by elliptical arcs which are the
// 2D projections of meridian curves on the sphere.
function BeachBall({ cx, cy, scale = 1 }: { cx: number; cy: number; scale?: number }) {
  const r = 22 * scale;
  const colors = ['#e84a3f', '#fde040', '#3fa0e8', '#3fcf3f', '#e84a3f', '#fde040'];
  const panels: React.ReactNode[] = [];
  for (let i = 0; i < 6; i++) {
    const phi_a = -Math.PI / 2 + (i / 6) * Math.PI;
    const phi_b = -Math.PI / 2 + ((i + 1) / 6) * Math.PI;
    const sa = r * Math.sin(phi_a);
    const sb = r * Math.sin(phi_b);
    const sweepRight = sb >= 0 ? 1 : 0;
    const sweepLeft = sa >= 0 ? 0 : 1;
    const absSb = Math.max(0.3, Math.abs(sb));
    const absSa = Math.max(0.3, Math.abs(sa));
    panels.push(
      <path
        key={i}
        d={`M ${cx} ${(cy - r).toFixed(2)} A ${absSb.toFixed(2)} ${r.toFixed(2)} 0 0 ${sweepRight} ${cx} ${(cy + r).toFixed(2)} A ${absSa.toFixed(2)} ${r.toFixed(2)} 0 0 ${sweepLeft} ${cx} ${(cy - r).toFixed(2)} Z`}
        fill={colors[i]}
      />
    );
  }
  return (
    <g>
      <ellipse cx={cx + 3} cy={cy + r * 0.85} rx={r * 1.05} ry={r * 0.18} fill="#a8845a" opacity={0.4} />
      <circle cx={cx} cy={cy} r={r} fill="#fafafa" />
      {panels}
      <ellipse cx={cx} cy={cy - r + 0.5} rx={r * 0.18} ry={r * 0.06} fill="#fafafa" />
      <ellipse cx={cx} cy={cy + r - 0.5} rx={r * 0.18} ry={r * 0.06} fill="#fafafa" />
      <ellipse
        cx={cx - r * 0.35}
        cy={cy - r * 0.35}
        rx={r * 0.3}
        ry={r * 0.18}
        fill="#ffffff"
        opacity={0.55}
      />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#999999" strokeWidth={0.5} />
    </g>
  );
}

// ─── Footprints ────────────────────────────────────────────────────
interface Footprint {
  x: number;
  y: number;
  size: number;
  angle: number;
  toeX: number;
  toeY: number;
}
const footprints: Footprint[] = (() => {
  const list: Footprint[] = [];
  const start = { x: 950, y: 565 };
  const end = { x: 820, y: 595 };
  const steps = 7;
  const angle = (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;
  const angleRad = (angle * Math.PI) / 180;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const cx = start.x + (end.x - start.x) * t;
    const cy = start.y + (end.y - start.y) * t;
    const size = 0.75 + t * 0.5;
    const side = i % 2 === 0 ? -1 : 1;
    const fx = cx + side * 5 * size;
    const fy = cy + side * 1.5 * size;
    const toeOffX = Math.cos(angleRad) * 7 * size * 0.7;
    const toeOffY = Math.sin(angleRad) * 7 * size * 0.7;
    list.push({ x: fx, y: fy, size, angle, toeX: fx + toeOffX, toeY: fy + toeOffY });
  }
  return list;
})();

export default function Beach() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1400 600"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className="littoral-svg"
    >
      <defs>
        <linearGradient id="beachSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7ec6e6" />
          <stop offset="50%" stopColor="#a8dff2" />
          <stop offset="100%" stopColor="#e0f0f5" />
        </linearGradient>
        <linearGradient id="ocean" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a8a9a" />
          <stop offset="60%" stopColor="#4ba8b8" />
          <stop offset="100%" stopColor="#7ac8d0" />
        </linearGradient>
        <linearGradient id="sand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f4d898" />
          <stop offset="100%" stopColor="#e8c068" />
        </linearGradient>
      </defs>

      {/* Sky */}
      <rect width="1400" height="600" fill="url(#beachSky)" />

      {/* Sun */}
      <Sun cx={1100} cy={110} r={38} />

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

      {/* Seagulls */}
      <Seagull x={300} y={130} scale={1.0} />
      <Seagull x={420} y={150} scale={0.8} />
      <Seagull x={550} y={175} scale={0.6} />

      {/* Ocean */}
      <rect x="0" y="300" width="1400" height="170" fill="url(#ocean)" />

      {/* Distant atmospheric haze around the island */}
      <ellipse cx={450} cy={298} rx={290} ry={22} fill="#a8dff2" opacity={0.45} />

      {/* Island */}
      <Island cx={450} baseY={300} scale={1.0} />

      {/* Sailboat */}
      <Sailboat x={900} y={320} scale={0.9} />

      {/* Water sparkles */}
      {sparkles.map((s, i) =>
        s.kind === 'line' ? (
          <line
            key={`sp-${i}`}
            x1={s.x.toFixed(1)}
            y1={s.y.toFixed(1)}
            x2={(s.x + s.len!).toFixed(1)}
            y2={s.y.toFixed(1)}
            stroke="#ffffff"
            strokeWidth={s.strokeWidth}
            opacity={s.opacity.toFixed(2)}
          />
        ) : (
          <circle
            key={`sp-${i}`}
            cx={s.x.toFixed(1)}
            cy={s.y.toFixed(1)}
            r={s.r!.toFixed(1)}
            fill="#ffffff"
            opacity={s.opacity.toFixed(2)}
          />
        )
      )}

      {/* Dolphin jumping */}
      <Dolphin cx={700} cy={380} scale={1.0} />

      {/* Shore foam */}
      <path d={foamPath} fill="#ffffff" opacity={0.7} />
      {foamPuffs.map((p, i) => (
        <ellipse
          key={`fp-${i}`}
          cx={p.x.toFixed(1)}
          cy={p.y.toFixed(1)}
          rx={p.rx.toFixed(1)}
          ry={p.ry.toFixed(1)}
          fill="#ffffff"
          opacity={p.opacity.toFixed(2)}
        />
      ))}

      {/* Sand */}
      <rect x="0" y="470" width="1400" height="130" fill="url(#sand)" />

      {/* Sand grains */}
      {sandGrains.map((g, i) => (
        <circle
          key={`g-${i}`}
          cx={g.x.toFixed(1)}
          cy={g.y.toFixed(1)}
          r={g.r.toFixed(1)}
          fill={g.fill}
          opacity={g.opacity.toFixed(2)}
        />
      ))}

      {/* Footprints */}
      {footprints.map((f, i) => (
        <g key={`fp-${i}`}>
          <ellipse
            cx={f.x.toFixed(1)}
            cy={f.y.toFixed(1)}
            rx={7 * f.size}
            ry={3.5 * f.size}
            fill="#b88a48"
            opacity={0.55}
            transform={`rotate(${f.angle.toFixed(0)} ${f.x.toFixed(1)} ${f.y.toFixed(1)})`}
          />
          <circle
            cx={f.toeX.toFixed(1)}
            cy={f.toeY.toFixed(1)}
            r={1.2 * f.size}
            fill="#b88a48"
            opacity={0.5}
          />
        </g>
      ))}

      {/* Beach items */}
      <BeachTowel x={450} baseY={580} scale={1.0} />
      <BeachBall cx={560} cy={555} scale={1.0} />
      <Sandcastle x={220} baseY={580} scale={1.0} />
      <Umbrella x={950} baseY={580} scale={1.0} />
      <Starfish cx={670} cy={575} scale={1.0} rotation={0.3} />
      <Starfish cx={1100} cy={590} scale={0.75} rotation={-0.5} />
      <Seashell cx={380} cy={590} scale={1.3} rotation={15} />
      <Seashell cx={820} cy={565} scale={1.0} rotation={-20} />
      <Seashell cx={1180} cy={580} scale={1.2} rotation={40} />

      {/* Palm trees (foreground frame) */}
      <PalmTree x={80} baseY={600} scale={1.0} />
      <PalmTree x={1320} baseY={600} scale={0.85} />
    </svg>
  );
}
