// Deterministic seeded RNG (no SSR hydration mismatch)
function makeRng(seed: number) {
  let rng = seed;
  return () => {
    rng = (rng * 9301 + 49297) % 233280;
    return rng / 233280;
  };
}

type Peak = [number, number];

// ─── Mountains ──────────────────────────────────────────────────────
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

// Snow strip following the top contour of a mountain range
function snowCapPath(peaks: Peak[], depth = 12): string {
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
  d += `L 1400 ${last[1] + 10 + depth} `;
  for (let i = peaks.length - 1; i >= 0; i--) {
    d += `L ${peaks[i]![0]} ${peaks[i]![1] + depth} `;
  }
  d += 'Z';
  return d;
}

const farPeaks = makePeaks(1, 380, 55, 10);
const midPeaks = makePeaks(7, 435, 38, 11);
const nearPeaks = makePeaks(13, 480, 28, 12);
const hillPeaks = makePeaks(21, 540, 14, 18);

const farPath = mountainPath(farPeaks);
const midPath = mountainPath(midPeaks);
const nearPath = mountainPath(nearPeaks);
const hillPath = mountainPath(hillPeaks);
const farSnow = snowCapPath(farPeaks, 14);
const midSnow = snowCapPath(midPeaks, 10);

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
  { x: 60, y: 60, w: 220, angle: -2, strokes: 7, opacity: 0.7 },
  { x: 340, y: 95, w: 180, angle: 3, strokes: 6, opacity: 0.65 },
  { x: 900, y: 100, w: 200, angle: 2, strokes: 6, opacity: 0.65 },
  { x: 1130, y: 70, w: 180, angle: 4, strokes: 5, opacity: 0.6 },
  { x: 230, y: 175, w: 130, angle: 2, strokes: 4, opacity: 0.5 },
  { x: 750, y: 195, w: 160, angle: -2, strokes: 5, opacity: 0.5 },
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

// ─── Falling snow ───────────────────────────────────────────────────
interface Snowflake {
  x: number;
  y: number;
  r: number;
  opacity: number;
}
const snowflakes: Snowflake[] = (() => {
  const next = makeRng(9999);
  const flakes: Snowflake[] = [];
  for (let i = 0; i < 80; i++) {
    flakes.push({
      x: next() * 1400,
      y: next() * 520,
      r: 0.6 + next() * 1.4,
      opacity: 0.5 + next() * 0.4,
    });
  }
  return flakes;
})();

// ─── Snowy pine tree ────────────────────────────────────────────────
function SnowyPine({ x, baseY, height }: { x: number; baseY: number; height: number }) {
  const w = height * 0.5;
  const trunkH = height * 0.1;
  const trunkW = height * 0.06;
  const foliageTop = baseY - height;
  const foliageBottom = baseY - trunkH;
  const halfW = w / 2;
  const h = foliageBottom - foliageTop;
  const caps = [0, 1, 2].map((i) => {
    const yLine = foliageTop + h * (i / 3);
    const hw = halfW * (i / 3) + 2;
    return `${x},${yLine - 5} ${x - hw - 1},${yLine + 4} ${x + hw + 1},${yLine + 4}`;
  });
  return (
    <g>
      <rect x={x - trunkW / 2} y={foliageBottom} width={trunkW} height={trunkH} fill="#3a2a1f" />
      <polygon
        points={`${x},${foliageTop} ${x - halfW},${foliageBottom} ${x + halfW},${foliageBottom}`}
        fill="#2d4a36"
      />
      {caps.map((pts, i) => (
        <polygon key={i} points={pts} fill="#f0f5f8" />
      ))}
    </g>
  );
}

// ─── Decorated Christmas tree (star + wrapped lights) ───────────────
function DecoratedTree({ x, baseY, height }: { x: number; baseY: number; height: number }) {
  const w = height * 0.55;
  const trunkH = height * 0.12;
  const trunkW = height * 0.08;
  const foliageTop = baseY - height;
  const foliageBottom = baseY - trunkH;
  const halfW = w / 2;
  const h = foliageBottom - foliageTop;
  const colors = ['#ff3a2f', '#3fcf3f', '#fff080', '#3fa0ff', '#ff8a2f', '#c060ff'];
  // Snow caps
  const caps = [1, 2].map((i) => {
    const yLine = foliageTop + h * (i / 3);
    const hw = halfW * (i / 3) + 1;
    return `${x},${yLine - 4} ${x - hw - 1},${yLine + 3} ${x + hw + 1},${yLine + 3}`;
  });
  // Light arcs and bulbs
  interface Bulb {
    x: number;
    y: number;
    color: string;
  }
  interface Arc {
    d: string;
    bulbs: Bulb[];
  }
  const arcs: Arc[] = [];
  const arcCount = 5;
  for (let a = 0; a < arcCount; a++) {
    const t = (a + 0.5) / arcCount;
    const yC = foliageTop + h * t;
    const hwAtY = halfW * t + 2;
    const x1 = x - hwAtY;
    const x2 = x + hwAtY;
    const mx = x;
    const my = yC + 4;
    const bulbs: Bulb[] = [];
    const bulbCount = 3 + a;
    for (let i = 0; i < bulbCount; i++) {
      const tt = (i + 0.5) / bulbCount;
      const bx = (1 - tt) * (1 - tt) * x1 + 2 * (1 - tt) * tt * mx + tt * tt * x2;
      const by = (1 - tt) * (1 - tt) * yC + 2 * (1 - tt) * tt * my + tt * tt * yC;
      bulbs.push({ x: bx, y: by, color: colors[(a + i) % colors.length]! });
    }
    arcs.push({
      d: `M ${x1.toFixed(1)} ${yC.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${yC.toFixed(1)}`,
      bulbs,
    });
  }
  // Star
  const sx = x;
  const sy = foliageTop - 8;
  const starR = 9;
  let starPath = '';
  for (let p = 0; p < 10; p++) {
    const a = (p / 10) * Math.PI * 2 - Math.PI / 2;
    const r = p % 2 === 0 ? starR : starR * 0.42;
    starPath += `${p === 0 ? 'M' : 'L'} ${(sx + Math.cos(a) * r).toFixed(1)} ${(sy + Math.sin(a) * r).toFixed(1)} `;
  }
  starPath += 'Z';
  return (
    <g>
      <rect x={x - trunkW / 2} y={foliageBottom} width={trunkW} height={trunkH} fill="#3a2a1f" />
      <polygon
        points={`${x},${foliageTop} ${x - halfW},${foliageBottom} ${x + halfW},${foliageBottom}`}
        fill="#1f3528"
      />
      <polygon
        points={`${x},${foliageTop} ${x - halfW},${foliageBottom} ${x - halfW * 0.3},${foliageBottom}`}
        fill="#2d4a36"
        opacity={0.7}
      />
      {caps.map((pts, i) => (
        <polygon key={i} points={pts} fill="#f4f8fb" opacity={0.85} />
      ))}
      {arcs.map((arc, i) => (
        <g key={i}>
          <path d={arc.d} stroke="#1a1410" strokeWidth={0.5} fill="none" opacity={0.5} />
          {arc.bulbs.map((b, j) => (
            <g key={j}>
              <circle cx={b.x.toFixed(1)} cy={b.y.toFixed(1)} r={6} fill={b.color} opacity={0.25} />
              <ellipse cx={b.x.toFixed(1)} cy={b.y.toFixed(1)} rx={2} ry={2.6} fill={b.color} />
              <ellipse
                cx={(b.x - 0.5).toFixed(1)}
                cy={(b.y - 0.8).toFixed(1)}
                rx={0.7}
                ry={0.9}
                fill="#ffffff"
                opacity={0.8}
              />
            </g>
          ))}
        </g>
      ))}
      <circle cx={sx} cy={sy} r={20} fill="#fff080" opacity={0.18} />
      <circle cx={sx} cy={sy} r={14} fill="#fff080" opacity={0.4} />
      <path d={starPath} fill="#fff080" stroke="#ffd040" strokeWidth={0.8} />
    </g>
  );
}

// ─── Cabin ──────────────────────────────────────────────────────────
function Cabin({
  x,
  baseY,
  scale = 1,
  wreath = false,
  smokeSeed,
}: {
  x: number;
  baseY: number;
  scale?: number;
  wreath?: boolean;
  smokeSeed?: number;
}) {
  const w = 80 * scale;
  const h = 50 * scale;
  const roofH = 35 * scale;
  const wallTop = baseY - h;
  const ridge = wallTop - roofH;
  const doorW = 12 * scale;
  const doorH = 22 * scale;
  const winW = 14 * scale;
  const winH = 14 * scale;
  const winY = wallTop + 10 * scale;
  const chimX = x + w / 2 - 12;
  const chimY = ridge + (wallTop - ridge) * 0.25;
  // Smoke
  const smokePuffs: { x: number; y: number; r: number; opacity: number }[] = [];
  if (smokeSeed != undefined) {
    const next = makeRng(smokeSeed);
    for (let i = 0; i < 3; i++) {
      smokePuffs.push({
        x: chimX + 4 + (next() - 0.5) * 8 + i * 3,
        y: chimY - 25 - i * 12,
        r: 3 + i * 1.5,
        opacity: 0.5 - i * 0.1,
      });
    }
  }
  return (
    <g>
      {/* Wall */}
      <rect x={x - w / 2} y={wallTop} width={w} height={h} fill="#5a3826" />
      {[1, 2, 3, 4].map((i) => {
        const px = x - w / 2 + (w * i) / 5;
        return (
          <line
            key={i}
            x1={px}
            y1={wallTop}
            x2={px}
            y2={wallTop + h}
            stroke="#3a2418"
            strokeWidth={0.6}
            opacity={0.6}
          />
        );
      })}
      {/* Snowy roof */}
      <polygon
        points={`${x - w / 2 - 8},${wallTop + 2} ${x},${ridge - 2} ${x + w / 2 + 8},${wallTop + 2}`}
        fill="#f4f8fb"
      />
      <rect x={x - w / 2 - 8} y={wallTop + 2} width={w + 16} height={2.5} fill="#bcc8d2" opacity={0.6} />
      <ellipse cx={x - w / 2 - 6} cy={wallTop + 3} rx={7} ry={3.5} fill="#f4f8fb" />
      <ellipse cx={x + w / 2 + 6} cy={wallTop + 3} rx={7} ry={3.5} fill="#f4f8fb" />
      {/* Door */}
      <rect x={x - doorW / 2} y={baseY - doorH} width={doorW} height={doorH} fill="#3a2418" />
      <circle cx={x + doorW / 2 - 2} cy={baseY - doorH / 2} r={0.8} fill="#fff5b0" />
      {wreath && (
        <>
          <circle cx={x} cy={baseY - doorH + 5} r={4} fill="none" stroke="#2d5a36" strokeWidth={2.2} />
          <circle cx={x} cy={baseY - doorH + 8.5} r={1.2} fill="#e84a3f" />
        </>
      )}
      {/* Window glow */}
      <rect x={x - w / 2 + 5} y={winY - 4} width={winW + 6} height={winH + 8} fill="#ffd278" opacity={0.35} />
      <rect
        x={x + w / 2 - 11 - winW}
        y={winY - 4}
        width={winW + 6}
        height={winH + 8}
        fill="#ffd278"
        opacity={0.35}
      />
      {/* Windows */}
      <rect x={x - w / 2 + 8} y={winY} width={winW} height={winH} fill="#ffe098" />
      <rect x={x + w / 2 - 8 - winW} y={winY} width={winW} height={winH} fill="#ffe098" />
      {/* Window crossbars */}
      <line
        x1={x - w / 2 + 8 + winW / 2}
        y1={winY}
        x2={x - w / 2 + 8 + winW / 2}
        y2={winY + winH}
        stroke="#3a2418"
        strokeWidth={1}
      />
      <line
        x1={x - w / 2 + 8}
        y1={winY + winH / 2}
        x2={x - w / 2 + 8 + winW}
        y2={winY + winH / 2}
        stroke="#3a2418"
        strokeWidth={1}
      />
      <line
        x1={x + w / 2 - 8 - winW / 2}
        y1={winY}
        x2={x + w / 2 - 8 - winW / 2}
        y2={winY + winH}
        stroke="#3a2418"
        strokeWidth={1}
      />
      <line
        x1={x + w / 2 - 8 - winW}
        y1={winY + winH / 2}
        x2={x + w / 2 - 8}
        y2={winY + winH / 2}
        stroke="#3a2418"
        strokeWidth={1}
      />
      {/* Chimney */}
      <rect x={chimX} y={chimY - 18} width={8} height={22} fill="#4a2e1e" />
      <ellipse cx={chimX + 4} cy={chimY - 18} rx={6} ry={2.5} fill="#f4f8fb" />
      {/* Smoke */}
      {smokePuffs.map((p, i) => (
        <circle
          key={i}
          cx={p.x.toFixed(1)}
          cy={p.y.toFixed(1)}
          r={p.r.toFixed(1)}
          fill="#dde3e8"
          opacity={p.opacity.toFixed(2)}
        />
      ))}
    </g>
  );
}

// ─── Snowman ────────────────────────────────────────────────────────
function Snowman({ x, baseY }: { x: number; baseY: number }) {
  return (
    <g>
      <circle cx={x} cy={baseY - 12} r={13} fill="#fafdfe" />
      <ellipse cx={x - 4} cy={baseY - 12} rx={6} ry={10} fill="#e8edf0" opacity={0.4} />
      <circle cx={x} cy={baseY - 28} r={10} fill="#fafdfe" />
      <ellipse cx={x - 3} cy={baseY - 28} rx={4.5} ry={7} fill="#e8edf0" opacity={0.4} />
      <circle cx={x} cy={baseY - 42} r={7.5} fill="#fafdfe" />
      <ellipse cx={x - 2} cy={baseY - 42} rx={3} ry={5} fill="#e8edf0" opacity={0.4} />
      <circle cx={x - 2.5} cy={baseY - 44} r={0.9} fill="#1a1410" />
      <circle cx={x + 2.5} cy={baseY - 44} r={0.9} fill="#1a1410" />
      <polygon points={`${x},${baseY - 41} ${x + 6},${baseY - 40.5} ${x},${baseY - 39.5}`} fill="#ff8a2f" />
      {[-1, 0, 1].map((i) => (
        <circle key={i} cx={x + i * 1.6} cy={baseY - 37} r={0.6} fill="#1a1410" />
      ))}
      <rect x={x - 7} y={baseY - 36} width={14} height={3} fill="#e84a3f" />
      <polygon
        points={`${x + 4},${baseY - 33} ${x + 7},${baseY - 26} ${x + 9},${baseY - 28} ${x + 6},${baseY - 32}`}
        fill="#e84a3f"
      />
      <circle cx={x} cy={baseY - 26} r={0.9} fill="#1a1410" />
      <circle cx={x} cy={baseY - 22} r={0.9} fill="#1a1410" />
      <line
        x1={x - 9}
        y1={baseY - 28}
        x2={x - 18}
        y2={baseY - 32}
        stroke="#3a2a1f"
        strokeWidth={1.2}
        strokeLinecap="round"
      />
      <line
        x1={x - 14}
        y1={baseY - 30.5}
        x2={x - 16}
        y2={baseY - 35}
        stroke="#3a2a1f"
        strokeWidth={1}
        strokeLinecap="round"
      />
      <line
        x1={x + 9}
        y1={baseY - 28}
        x2={x + 18}
        y2={baseY - 32}
        stroke="#3a2a1f"
        strokeWidth={1.2}
        strokeLinecap="round"
      />
      <line
        x1={x + 14}
        y1={baseY - 30.5}
        x2={x + 17}
        y2={baseY - 27}
        stroke="#3a2a1f"
        strokeWidth={1}
        strokeLinecap="round"
      />
      <rect x={x - 7} y={baseY - 50} width={14} height={2} fill="#1a1410" />
      <rect x={x - 5} y={baseY - 56} width={10} height={6} fill="#1a1410" />
    </g>
  );
}

// ─── Christmas lights ───────────────────────────────────────────────
interface LightString {
  wireD: string;
  bulbs: { x: number; y: number; color: string }[];
}

function buildLightString(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  sag: number,
  bulbCount: number,
  seedOffset: number
): LightString {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 + sag;
  const colors = ['#ff3a2f', '#3fcf3f', '#fff080', '#3fa0ff', '#ff8a2f', '#c060ff'];
  const bulbs: { x: number; y: number; color: string }[] = [];
  for (let i = 0; i < bulbCount; i++) {
    const t = (i + 0.5) / bulbCount;
    const bx = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * mx + t * t * x2;
    const dxdt = 2 * (1 - t) * (mx - x1) + 2 * t * (x2 - mx);
    const dydt = 2 * (1 - t) * (my - y1) + 2 * t * (y2 - my);
    const ang = Math.atan2(dydt, dxdt);
    const hangLen = 5;
    const bulbX = bx + Math.cos(ang + Math.PI / 2) * hangLen * 0.4;
    const bulbY = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * my + t * t * y2 + hangLen;
    bulbs.push({ x: bulbX, y: bulbY, color: colors[(i + seedOffset) % colors.length]! });
  }
  return {
    wireD: `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`,
    bulbs,
  };
}

function LightStringG({ str }: { str: LightString }) {
  return (
    <g>
      <path d={str.wireD} stroke="#2a2018" strokeWidth={1} fill="none" opacity={0.55} />
      {str.bulbs.map((b, i) => (
        <g key={i}>
          <circle cx={b.x.toFixed(1)} cy={b.y.toFixed(1)} r={10} fill={b.color} opacity={0.18} />
          <circle cx={b.x.toFixed(1)} cy={b.y.toFixed(1)} r={6} fill={b.color} opacity={0.35} />
          <ellipse cx={b.x.toFixed(1)} cy={b.y.toFixed(1)} rx={2.8} ry={3.6} fill={b.color} />
          <ellipse
            cx={(b.x - 0.8).toFixed(1)}
            cy={(b.y - 1.3).toFixed(1)}
            rx={1}
            ry={1.3}
            fill="#ffffff"
            opacity={0.85}
          />
          <rect x={(b.x - 0.8).toFixed(1)} y={(b.y - 5.5).toFixed(1)} width={1.6} height={2} fill="#2a2018" />
        </g>
      ))}
    </g>
  );
}

const lightStrings: LightString[] = [
  buildLightString(632, 488, 728, 488, 9, 8, 0),
  buildLightString(975, 502, 1045, 502, 7, 6, 7),
  buildLightString(870, 488, 935, 500, 14, 5, 12),
  buildLightString(1080, 502, 1150, 484, 18, 6, 18),
  buildLightString(1150, 484, 1220, 498, 18, 6, 24),
  buildLightString(55, 472, 165, 484, 16, 6, 30),
  buildLightString(560, 480, 625, 500, 16, 5, 36),
  buildLightString(240, 504, 310, 467, 18, 6, 42),
];

// ─── Trees ───
const trees: Array<[number, number, number]> = [
  [55, 540, 75],
  [110, 548, 60],
  [165, 545, 70],
  [240, 552, 55],
  [310, 540, 80],
  [560, 545, 72],
  [625, 555, 56],
  [870, 548, 68],
  [935, 553, 60],
  [1080, 555, 58],
  [1150, 548, 72],
  [1220, 553, 62],
  [1285, 545, 76],
  [1345, 553, 60],
];

export default function ChristmasEve() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1400 600"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className="christmas-svg"
    >
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#bfd0de" />
          <stop offset="60%" stopColor="#d4e0ea" />
          <stop offset="100%" stopColor="#e4ecf2" />
        </linearGradient>
        <linearGradient id="mtnFar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c8d4de" />
          <stop offset="100%" stopColor="#d8e0e8" />
        </linearGradient>
        <linearGradient id="mtnMid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a8b8c5" />
          <stop offset="100%" stopColor="#b8c5d0" />
        </linearGradient>
        <linearGradient id="mtnNear" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8898a8" />
          <stop offset="100%" stopColor="#a0aebc" />
        </linearGradient>
        <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#eef3f6" />
          <stop offset="100%" stopColor="#dbe3e9" />
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

      {/* Falling snow */}
      {snowflakes.map((f, i) => (
        <circle
          key={`flake-${i}`}
          cx={f.x.toFixed(1)}
          cy={f.y.toFixed(1)}
          r={f.r.toFixed(1)}
          fill="#ffffff"
          opacity={f.opacity.toFixed(2)}
        />
      ))}

      {/* Mountains, back to front */}
      <path d={farPath} fill="url(#mtnFar)" />
      <path d={farSnow} fill="#fafdfe" opacity={0.95} />
      <path d={midPath} fill="url(#mtnMid)" />
      <path d={midSnow} fill="#f4f8fb" opacity={0.92} />
      <path d={nearPath} fill="url(#mtnNear)" />
      <path d={hillPath} fill="url(#ground)" />

      {/* Trees */}
      {trees.map(([tx, ty, th], i) => (
        <SnowyPine key={`tree-${i}`} x={tx} baseY={ty} height={th} />
      ))}

      {/* Decorated tree (focal point) */}
      <DecoratedTree x={380} baseY={558} height={110} />

      {/* Snowman */}
      <Snowman x={225} baseY={555} />

      {/* Cabins */}
      <Cabin x={680} baseY={555} scale={1.0} wreath smokeSeed={1234} />
      <Cabin x={1010} baseY={558} scale={0.85} smokeSeed={5678} />

      {/* Christmas lights */}
      {lightStrings.map((s, i) => (
        <LightStringG key={`lights-${i}`} str={s} />
      ))}
    </svg>
  );
}
