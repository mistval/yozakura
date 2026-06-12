// Deterministic seeded RNG (no SSR hydration mismatch).
function makeRng(seed: number) {
  let rng = seed;
  return () => {
    rng = (rng * 9301 + 49297) % 233280;
    return rng / 233280;
  };
}

// ─── Composition constants ──────────────────────────────────────────
const HORIZON_Y = 390;

// Path quadrilateral — viewer is shifted right and back so the path
// angles diagonally from the bottom edge up to the right edge, exiting
// just below the horizon so the path stays on the ground plane.
const PATH = {
  nearLeft: { x: 660, y: 600 },
  nearRight: { x: 760, y: 600 },
  farLeft: { x: 1400, y: 415 },
  farRight: { x: 1400, y: 440 },
};

// ─── Mountains ──────────────────────────────────────────────────────
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

const farMountainPath = mountainPath(makePeaks(1, 348, 14, 14));
const midMountainPath = mountainPath(makePeaks(7, 370, 8, 18));

// ─── Marsh water strips reflecting the warm sky ────────────────────
interface MarshStripe {
  y: number;
  h: number;
  color: string;
  opacity: number;
  segments: { x: number; w: number }[];
}

const marshStripes: MarshStripe[] = (() => {
  const stripeSpecs: Omit<MarshStripe, 'segments'>[] = [
    { y: 392, h: 4, color: '#f5b878', opacity: 0.95 },
    { y: 398, h: 3, color: '#e8a070', opacity: 0.85 },
    { y: 404, h: 5, color: '#d89060', opacity: 0.8 },
    { y: 412, h: 4, color: '#b87858', opacity: 0.75 },
    { y: 420, h: 3, color: '#a06850', opacity: 0.7 },
  ];
  const next = makeRng(42);
  return stripeSpecs.map((spec) => {
    const segments: { x: number; w: number }[] = [];
    let x = 0;
    while (x < 1400) {
      const w = 30 + next() * 120;
      const gap = 8 + next() * 60;
      segments.push({ x, w });
      x += w + gap;
    }
    return { ...spec, segments };
  });
})();

// ─── Buildings (Meta MPK Classic Campus) ───────────────────────────
interface BuildingSpec {
  x: number;
  w: number;
  h: number;
  main: string;
  accent: string;
  panel: string;
  windowRows: number;
  windowCols: number;
}

const buildingSpecs: BuildingSpec[] = [
  {
    x: 280,
    w: 80,
    h: 42,
    main: '#a89880',
    accent: '#3a5278',
    panel: '#d04030',
    windowRows: 3,
    windowCols: 6,
  },
  {
    x: 380,
    w: 120,
    h: 52,
    main: '#b8a888',
    accent: '#a86040',
    panel: '#e8a020',
    windowRows: 4,
    windowCols: 8,
  },
  {
    x: 510,
    w: 140,
    h: 64,
    main: '#c8b898',
    accent: '#d8a850',
    panel: '#2068b0',
    windowRows: 4,
    windowCols: 10,
  },
  {
    x: 650,
    w: 150,
    h: 70,
    main: '#a89880',
    accent: '#6890b8',
    panel: '#d04030',
    windowRows: 5,
    windowCols: 11,
  },
  {
    x: 790,
    w: 130,
    h: 60,
    main: '#b8a890',
    accent: '#c87848',
    panel: '#e8a020',
    windowRows: 4,
    windowCols: 9,
  },
  {
    x: 907,
    w: 105,
    h: 50,
    main: '#a89080',
    accent: '#4878a8',
    panel: '#5878a0',
    windowRows: 4,
    windowCols: 7,
  },
  {
    x: 1000,
    w: 85,
    h: 40,
    main: '#988878',
    accent: '#5878a0',
    panel: '#d04030',
    windowRows: 3,
    windowCols: 6,
  },
  {
    x: 1080,
    w: 75,
    h: 34,
    main: '#908070',
    accent: '#a86040',
    panel: '#e8a020',
    windowRows: 3,
    windowCols: 5,
  },
];

interface BuildingData extends BuildingSpec {
  left: number;
  top: number;
  windows: { x: number; y: number; w: number; h: number; color: string }[];
  panelX: number;
  panelW: number;
}

const buildings: BuildingData[] = (() => {
  const next = makeRng(101);
  return buildingSpecs.map((b) => {
    const left = b.x - b.w / 2;
    const top = HORIZON_Y - b.h;
    // Wider colored panel positioned in the right portion of the building
    const panelStartFrac = 0.78;
    const panelWFrac = 0.18;
    const panelX = left + b.w * panelStartFrac;
    const panelW = b.w * panelWFrac;
    // Windows occupy only the LEFT portion (so the panel reads as a clean stripe)
    const winMarginX = 4;
    const winMarginYTop = 6;
    const winMarginYBot = 3;
    const winAreaW = b.w * panelStartFrac - winMarginX * 2 - 2;
    const winAreaH = b.h - winMarginYTop - winMarginYBot;
    const winSpacingX = winAreaW / b.windowCols;
    const winSpacingY = winAreaH / b.windowRows;
    const winW = winSpacingX * 0.65;
    const winH = winSpacingY * 0.55;
    const windows: BuildingData['windows'] = [];
    for (let row = 0; row < b.windowRows; row++) {
      for (let col = 0; col < b.windowCols; col++) {
        const wx = left + winMarginX + col * winSpacingX + (winSpacingX - winW) / 2;
        const wy = top + winMarginYTop + row * winSpacingY + (winSpacingY - winH) / 2;
        const lit = next() > 0.3;
        const color = lit ? (next() > 0.85 ? '#fff0c8' : '#ffd078') : '#3a3028';
        windows.push({ x: wx, y: wy, w: winW, h: winH, color });
      }
    }
    return { ...b, left, top, windows, panelX, panelW };
  });
})();

// ─── Path gravel specks ────────────────────────────────────────────
interface GravelSpec {
  x: number;
  y: number;
  r: number;
  color: string;
}
const gravel: GravelSpec[] = (() => {
  const next = makeRng(303);
  const list: GravelSpec[] = [];
  for (let i = 0; i < 180; i++) {
    const t = next();
    const acrossT = next();
    const lx = PATH.nearLeft.x + t * (PATH.farLeft.x - PATH.nearLeft.x);
    const ly = PATH.nearLeft.y + t * (PATH.farLeft.y - PATH.nearLeft.y);
    const rx = PATH.nearRight.x + t * (PATH.farRight.x - PATH.nearRight.x);
    const ry = PATH.nearRight.y + t * (PATH.farRight.y - PATH.nearRight.y);
    list.push({
      x: lx + acrossT * (rx - lx),
      y: ly + acrossT * (ry - ly),
      r: 0.4 + next() * 1.2,
      color: next() > 0.5 ? '#5a5448' : '#a8a090',
    });
  }
  return list;
})();

// ─── Bay Area golden hills (in the lower-right triangle) ───────────
interface HillLayer {
  peaks: Peak[];
  color: string;
}

const hillLayers: HillLayer[] = (() => {
  const next = makeRng(411);
  // Hill layers spread across the smaller triangle (top now at y≈440)
  const layerSpecs = [
    { baseY: 455, amplitude: 12, color: '#7a5838', step: 80 },
    { baseY: 495, amplitude: 18, color: '#8a6438', step: 100 },
    { baseY: 540, amplitude: 22, color: '#a07c50', step: 90 },
    { baseY: 580, amplitude: 14, color: '#b08a5a', step: 70 },
  ];
  return layerSpecs.map((layer) => {
    const peaks: Peak[] = [];
    let x = 600;
    while (x < 1500) {
      const px = x + (next() - 0.5) * layer.step * 0.3;
      const py = layer.baseY + (next() - 0.5) * layer.amplitude * 1.4;
      peaks.push([px, py]);
      x += layer.step;
    }
    return { peaks, color: layer.color };
  });
})();

function hillPath(peaks: Peak[]): string {
  let d = `M 600 ${peaks[0]![1]} `;
  for (let i = 0; i < peaks.length - 1; i++) {
    const [x1, y1] = peaks[i]!;
    const [x2, y2] = peaks[i + 1]!;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    d += `Q ${x1} ${y1} ${mx} ${my} `;
  }
  const last = peaks[peaks.length - 1]!;
  d += `Q ${last[0]} ${last[1]} 1500 ${last[1] + 10} `;
  d += `L 1500 600 L 600 600 Z`;
  return d;
}

// Oak tree positions chosen to land inside the (smaller) triangle bounded
// by the path's bottom edge and the right/bottom edges of the viewport.
const oakTreeSpots: [number, number][] = [
  [1330, 475],
  [1370, 510],
  [1290, 540],
  [1180, 565],
  [1245, 555],
  [1355, 555],
  [1380, 585],
];

// ─── Foreground flora ───────────────────────────────────────────────
interface GrassBlade {
  x: number;
  y: number;
  tipX: number;
  tipY: number;
  cx: number;
  cy: number;
  color: string;
  sw: number;
}
interface MarshTuft {
  x: number;
  y: number;
  tipX: number;
  tipY: number;
  color: string;
  w: number;
}
interface SageLeaf {
  x: number;
  y: number;
  rx: number;
  ry: number;
  rot: number;
  color: string;
}
interface SageFlower {
  x: number;
  y: number;
  r: number;
}

interface ForegroundFlora {
  marshTufts: MarshTuft[];
  blades: GrassBlade[];
  sageLeavesBack: SageLeaf[];
  sageLeavesFront: SageLeaf[];
  sageFlowers: SageFlower[];
}

const foregroundFlora: ForegroundFlora = (() => {
  const next = makeRng(505);
  const marshTufts: MarshTuft[] = [];
  const blades: GrassBlade[] = [];
  const sageLeavesBack: SageLeaf[] = [];
  const sageLeavesFront: SageLeaf[] = [];
  const sageFlowers: SageFlower[] = [];

  // Marsh-edge low scrub
  for (let i = 0; i < 220; i++) {
    const x = next() * 1400;
    if (x > 700) continue;
    const y = 432 + next() * 12;
    const h = 2 + next() * 5;
    const tipX = x + (next() - 0.5) * 2;
    const tipY = y - h;
    const greenish = next() > 0.5;
    marshTufts.push({
      x,
      y,
      tipX,
      tipY,
      color: greenish ? '#6a7848' : '#8a7050',
      w: 0.4 + next() * 0.7,
    });
  }

  // Tall grass along the left edge of the path
  for (let i = 0; i < 380; i++) {
    const t = Math.pow(next(), 1.7);
    const px = PATH.nearLeft.x + t * (PATH.farLeft.x - PATH.nearLeft.x);
    const py = PATH.nearLeft.y + t * (PATH.farLeft.y - PATH.nearLeft.y);
    const scatter = 55 * (1 - t * 0.6);
    const bx = px - next() * scatter;
    const by = py + (next() - 0.5) * 3;
    const h = (12 + next() * 32) * (1 - t * 0.65);
    if (h < 2) continue;
    const tipX = bx + (next() - 0.5) * 5;
    const tipY = by - h;
    const greenish = next() > 0.45;
    const color = greenish ? (next() > 0.5 ? '#6a7040' : '#7a8050') : next() > 0.5 ? '#a89058' : '#b8a068';
    const cx = (bx + tipX) / 2 + (next() - 0.5) * 3;
    const cy = (by + tipY) / 2;
    blades.push({ x: bx, y: by, tipX, tipY, cx, cy, color, sw: 0.5 + next() * 0.8 });
  }

  // Sage clumps (silvery-leaved succulents with yellow flowers)
  const clumps: [number, number, number][] = [
    [180, 555, 1.0],
    [330, 580, 0.9],
    [470, 575, 1.1],
    [580, 590, 0.8],
  ];
  for (const [cx, cy, scale] of clumps) {
    for (let i = 0; i < 30; i++) {
      const angle = next() * Math.PI * 2;
      const dist = next() * 22 * scale;
      const lx = cx + Math.cos(angle) * dist;
      const ly = cy + Math.sin(angle) * dist * 0.4;
      const greenish = next() > 0.3;
      sageLeavesBack.push({
        x: lx,
        y: ly,
        rx: (1.5 + next() * 2) * scale,
        ry: (3 + next() * 3) * scale,
        rot: (next() - 0.5) * 80,
        color: greenish ? '#7a8868' : '#98a088',
      });
    }
    for (let i = 0; i < 10; i++) {
      const angle = next() * Math.PI * 2;
      const dist = next() * 18 * scale;
      const lx = cx + Math.cos(angle) * dist;
      const ly = cy + Math.sin(angle) * dist * 0.4 - 2;
      sageLeavesFront.push({
        x: lx,
        y: ly,
        rx: (1.2 + next() * 1.6) * scale,
        ry: (2.5 + next() * 2.5) * scale,
        rot: (next() - 0.5) * 80,
        color: '#b8c0a8',
      });
    }
    for (let i = 0; i < 7; i++) {
      const angle = next() * Math.PI * 2;
      const dist = next() * 20 * scale;
      const fx = cx + Math.cos(angle) * dist;
      const fy = cy + Math.sin(angle) * dist * 0.4 - 1;
      sageFlowers.push({ x: fx, y: fy, r: 1.4 * scale });
    }
  }

  return { marshTufts, blades, sageLeavesBack, sageLeavesFront, sageFlowers };
})();

// ─── Sub-components ─────────────────────────────────────────────────

function Sun() {
  const cx = 1160,
    cy = 250,
    r = 18;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r * 4.5} fill="#c84030" opacity={0.05} />
      <circle cx={cx} cy={cy} r={r * 2.8} fill="#c84838" opacity={0.1} />
      <circle cx={cx} cy={cy} r={r * 1.6} fill="#d85040" opacity={0.22} />
      <circle cx={cx} cy={cy} r={r} fill="#c84838" />
      <circle cx={cx} cy={cy} r={r * 0.55} fill="#e06050" />
    </g>
  );
}

function Marsh() {
  return (
    <g>
      <rect x={0} y={HORIZON_Y} width={1400} height={40} fill="#a06850" />
      {marshStripes.map((stripe, si) =>
        stripe.segments.map((seg, gi) => (
          <rect
            key={`m-${si}-${gi}`}
            x={seg.x.toFixed(1)}
            y={stripe.y}
            width={seg.w.toFixed(1)}
            height={stripe.h}
            fill={stripe.color}
            opacity={stripe.opacity}
          />
        ))
      )}
    </g>
  );
}

function MetaCampus() {
  return (
    <g>
      {buildings.map((b, i) => (
        <g key={`b-${i}`}>
          <rect x={b.left - 1} y={HORIZON_Y} width={b.w + 2} height={3} fill="#3a2818" opacity={0.7} />
          <rect x={b.left} y={b.top} width={b.w} height={b.h} fill={b.main} />
          <rect x={b.left} y={b.top} width={b.w} height={3} fill={b.accent} />
          {/* Wider colored panel — Sun-era Classic Campus architectural accent */}
          <rect x={b.panelX} y={b.top + 3} width={b.panelW} height={b.h - 3} fill={b.panel} />
          <rect
            x={b.panelX}
            y={b.top + 3}
            width={b.panelW * 0.25}
            height={b.h - 3}
            fill="#ffffff"
            opacity={0.15}
          />
          {b.windows.map((w, j) => (
            <rect
              key={j}
              x={w.x.toFixed(1)}
              y={w.y.toFixed(1)}
              width={w.w.toFixed(1)}
              height={w.h.toFixed(1)}
              fill={w.color}
            />
          ))}
          <rect x={b.left - 2} y={b.top - 4} width={b.w + 4} height={4} fill="#ffd078" opacity={0.2} />
        </g>
      ))}
    </g>
  );
}

function ForegroundFlora() {
  const f = foregroundFlora;
  return (
    <g>
      {f.marshTufts.map((t, i) => (
        <line
          key={`mt-${i}`}
          x1={t.x.toFixed(1)}
          y1={t.y.toFixed(1)}
          x2={t.tipX.toFixed(1)}
          y2={t.tipY.toFixed(1)}
          stroke={t.color}
          strokeWidth={t.w.toFixed(1)}
          opacity={0.75}
          strokeLinecap="round"
        />
      ))}
      {f.blades.map((b, i) => (
        <path
          key={`bl-${i}`}
          d={`M ${b.x.toFixed(1)} ${b.y.toFixed(1)} Q ${b.cx.toFixed(1)} ${b.cy.toFixed(1)} ${b.tipX.toFixed(1)} ${b.tipY.toFixed(1)}`}
          stroke={b.color}
          strokeWidth={b.sw.toFixed(1)}
          fill="none"
          strokeLinecap="round"
        />
      ))}
      {f.sageLeavesBack.map((l, i) => (
        <ellipse
          key={`sb-${i}`}
          cx={l.x.toFixed(1)}
          cy={l.y.toFixed(1)}
          rx={l.rx.toFixed(1)}
          ry={l.ry.toFixed(1)}
          fill={l.color}
          transform={`rotate(${l.rot.toFixed(0)} ${l.x.toFixed(1)} ${l.y.toFixed(1)})`}
        />
      ))}
      {f.sageLeavesFront.map((l, i) => (
        <ellipse
          key={`sf-${i}`}
          cx={l.x.toFixed(1)}
          cy={l.y.toFixed(1)}
          rx={l.rx.toFixed(1)}
          ry={l.ry.toFixed(1)}
          fill={l.color}
          transform={`rotate(${l.rot.toFixed(0)} ${l.x.toFixed(1)} ${l.y.toFixed(1)})`}
        />
      ))}
      {f.sageFlowers.map((f, i) => (
        <g key={`fl-${i}`}>
          <circle cx={f.x.toFixed(1)} cy={f.y.toFixed(1)} r={f.r.toFixed(1)} fill="#e8b840" />
          <circle cx={f.x.toFixed(1)} cy={f.y.toFixed(1)} r={(f.r * 0.35).toFixed(1)} fill="#a85820" />
        </g>
      ))}
    </g>
  );
}

function PathComponent() {
  const points = `${PATH.nearLeft.x},${PATH.nearLeft.y} ${PATH.nearRight.x},${PATH.nearRight.y} ${PATH.farRight.x},${PATH.farRight.y} ${PATH.farLeft.x},${PATH.farLeft.y}`;
  const darkEdgePoints = `${PATH.nearLeft.x},${PATH.nearLeft.y} ${PATH.nearLeft.x + 25},${PATH.nearLeft.y} ${PATH.farLeft.x + 4},${PATH.farLeft.y + 3} ${PATH.farLeft.x},${PATH.farLeft.y}`;
  return (
    <g>
      <polygon points={points} fill="#8a8478" />
      <polygon points={darkEdgePoints} fill="#787064" opacity={0.6} />
      {gravel.map((g, i) => (
        <circle
          key={`gr-${i}`}
          cx={g.x.toFixed(1)}
          cy={g.y.toFixed(1)}
          r={g.r.toFixed(1)}
          fill={g.color}
          opacity={0.5}
        />
      ))}
    </g>
  );
}

function Hills() {
  return (
    <g clipPath="url(#hillsClip)">
      <rect x={700} y={240} width={700} height={360} fill="#a07848" />
      {hillLayers.map((layer, i) => (
        <path key={`hl-${i}`} d={hillPath(layer.peaks)} fill={layer.color} />
      ))}
      {oakTreeSpots.map(([tx, ty], i) => (
        <g key={`tr-${i}`}>
          <rect x={tx - 1} y={ty} width={2} height={6} fill="#3a2818" />
          <ellipse cx={tx} cy={ty - 2} rx={6} ry={5} fill="#3a3018" />
          <ellipse cx={tx - 2} cy={ty - 3} rx={3} ry={3} fill="#4a3820" />
        </g>
      ))}
    </g>
  );
}

// ─── Main component ─────────────────────────────────────────────────
export default function BayTrailMetaScene() {
  const triPoints = `${PATH.nearRight.x},${PATH.nearRight.y} ${PATH.farRight.x},${PATH.farRight.y} 1400,600`;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1400 600"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className="bay-trail-svg"
    >
      <defs>
        <linearGradient id="bayTrailSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4a3868" />
          <stop offset="30%" stopColor="#9a5e58" />
          <stop offset="55%" stopColor="#e89058" />
          <stop offset="80%" stopColor="#f5c478" />
          <stop offset="100%" stopColor="#f8d8a0" />
        </linearGradient>
        <linearGradient id="bayTrailForeground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8a6850" />
          <stop offset="40%" stopColor="#5a4028" />
          <stop offset="100%" stopColor="#2a1c10" />
        </linearGradient>
        <clipPath id="hillsClip">
          <polygon points={triPoints} />
        </clipPath>
      </defs>

      {/* Sky */}
      <rect width={1400} height={600} fill="url(#bayTrailSky)" />

      {/* Sun above mountains */}
      <Sun />

      {/* Distant mountain ridges */}
      <path d={farMountainPath} fill="#3a2e48" opacity={0.85} />
      <path d={midMountainPath} fill="#2a2238" opacity={0.95} />

      {/* Marsh water reflecting the sky (drawn BEFORE buildings so they sit on top) */}
      <Marsh />

      {/* Meta MPK Classic Campus buildings — Sun-era offices with the
          distinctive colored accent panels */}
      <MetaCampus />

      {/* Foreground ground gradient */}
      <rect x={0} y={430} width={1400} height={170} fill="url(#bayTrailForeground)" />

      {/* Foreground grass, sage clumps, marsh tufts */}
      <ForegroundFlora />

      {/* Path going diagonally to upper-right */}
      <PathComponent />

      {/* Golden Bay Area hills in the lower-right triangle */}
      <Hills />
    </svg>
  );
}
