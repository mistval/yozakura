// Deterministic seeded RNG (no SSR hydration mismatch).
function makeRng(seed: number) {
  let rng = seed;
  return () => {
    rng = (rng * 9301 + 49297) % 233280;
    return rng / 233280;
  };
}

// ─── Sun position and lighting direction ───────────────────────────
const sunX = 880;
const sunY = 340;
// Cloud highlights are biased in this direction (toward the sun, slightly up).
const sunDir = { x: 0.3, y: -0.7 };

// ─── God rays / crepuscular rays ───────────────────────────────────
interface Ray {
  points: string;
  fill: string;
  opacity: number;
}
function buildGodRays(cx: number, cy: number, count = 24): Ray[] {
  const next = makeRng(333);
  const rays: Ray[] = [];
  const angleMin = -Math.PI * 0.98;
  const angleMax = Math.PI * 0.08;
  for (let i = 0; i < count; i++) {
    const t = (i + next() * 0.5 - 0.25) / count;
    const angle = angleMin + t * (angleMax - angleMin);
    const length = 750 + next() * 350;
    const halfWidthFar = 8 + next() * 40;
    const halfWidthNear = 0.5 + next() * 3;
    const ex = cx + Math.cos(angle) * length;
    const ey = cy + Math.sin(angle) * length;
    const px = -Math.sin(angle);
    const py = Math.cos(angle);
    const p1x = cx + px * halfWidthNear;
    const p1y = cy + py * halfWidthNear;
    const p2x = cx - px * halfWidthNear;
    const p2y = cy - py * halfWidthNear;
    const p3x = ex - px * halfWidthFar;
    const p3y = ey - py * halfWidthFar;
    const p4x = ex + px * halfWidthFar;
    const p4y = ey + py * halfWidthFar;
    rays.push({
      points: `${p1x.toFixed(1)},${p1y.toFixed(1)} ${p2x.toFixed(1)},${p2y.toFixed(1)} ${p3x.toFixed(1)},${p3y.toFixed(1)} ${p4x.toFixed(1)},${p4y.toFixed(1)}`,
      fill: next() > 0.5 ? '#ffe5a0' : '#fff5d8',
      opacity: 0.025 + next() * 0.04,
    });
  }
  return rays;
}
const godRays = buildGodRays(sunX, sunY, 24);

// ─── Cloud cluster ─────────────────────────────────────────────────
// Fewer, larger overlapping circles for smoother cumulus silhouettes.
// Four layers: warm underside, body, sun-side highlights, brightest tips.
interface CloudPalette {
  under: string;
  base: string;
  highlight: string;
  tip: string;
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
  palette: CloudPalette,
  tall = false
): CloudCircle[] {
  const next = makeRng(seed);
  const w = 110 * scale;
  const h = (tall ? 70 : 38) * scale;
  const circles: CloudCircle[] = [];

  // Layer 1: warm underside
  for (let i = 0; i < 3; i++) {
    circles.push({
      cx: cx + (next() - 0.5) * w * 1.4,
      cy: cy + h * 0.4 + (next() - 0.5) * h * 0.3,
      r: (22 + next() * 14) * scale,
      fill: palette.under,
    });
  }

  // Layer 2: base body
  const baseCount = tall ? 12 : 8;
  for (let i = 0; i < baseCount; i++) {
    const t = i / baseCount;
    const angle = t * Math.PI + (next() - 0.5) * 0.8;
    const dx = Math.cos(angle) * w * (0.6 + next() * 0.4) + (next() - 0.5) * w * 0.2;
    let dy: number;
    if (tall) {
      const tt = i / (baseCount - 1);
      dy = h * 0.4 - tt * h * 1.4 + (next() - 0.5) * h * 0.15;
    } else {
      dy = (next() - 0.5) * h * 0.7 - next() * h * 0.25;
    }
    circles.push({
      cx: cx + dx,
      cy: cy + dy,
      r: (24 + next() * 16) * scale,
      fill: palette.base,
    });
  }

  // Layer 3: highlights — offset toward the sun
  const highCount = tall ? 7 : 5;
  for (let i = 0; i < highCount; i++) {
    const dx = (next() - 0.5) * w * 1.2 + sunDir.x * w * 0.25;
    let dy: number;
    if (tall) {
      const tt = i / (highCount - 1);
      dy = h * 0.2 - tt * h * 1.3 + sunDir.y * h * 0.15;
    } else {
      dy = (next() - 0.5) * h * 0.6 + sunDir.y * h * 0.6 - h * 0.15;
    }
    circles.push({
      cx: cx + dx,
      cy: cy + dy,
      r: (18 + next() * 14) * scale,
      fill: palette.highlight,
    });
  }

  // Layer 4: brightest sun-catching tips
  const tipCount = tall ? 5 : 3;
  for (let i = 0; i < tipCount; i++) {
    const dx = (next() - 0.5) * w * 0.9 + sunDir.x * w * 0.3;
    let dy: number;
    if (tall) {
      const tt = i / Math.max(1, tipCount - 1);
      dy = -h * 0.2 - tt * h * 1.1 + sunDir.y * h * 0.3;
    } else {
      dy = -h * 0.25 + (next() - 0.5) * h * 0.4 + sunDir.y * h * 0.45;
    }
    circles.push({
      cx: cx + dx,
      cy: cy + dy,
      r: (12 + next() * 13) * scale,
      fill: palette.tip,
    });
  }
  return circles;
}

// ─── Cloud layer definitions ───────────────────────────────────────
const midPalette: CloudPalette = {
  under: '#f5b878',
  base: '#fde0a8',
  highlight: '#fff0c0',
  tip: '#fffae0',
};
const foregroundPalette: CloudPalette = {
  under: '#e89868',
  base: '#f8e8c0',
  highlight: '#fff4d8',
  tip: '#ffffff',
};
const floatingPalette: CloudPalette = {
  under: '#e8a070',
  base: '#fbd498',
  highlight: '#ffe8b8',
  tip: '#fff5d8',
};

// Mid-distance band (just above foreground)
const midClouds: [number, number, number, number][] = (() => {
  const next = makeRng(22);
  const list: [number, number, number, number][] = [];
  for (let i = 0; i < 28; i++) {
    list.push([next() * 1500 - 50, 405 + next() * 50, 0.32 + next() * 0.35, 200 + i]);
  }
  return list;
})();

// Foreground "sea" of clouds — packed and overlapping
const foregroundClouds: [number, number, number, number][] = (() => {
  const next = makeRng(33);
  const list: [number, number, number, number][] = [];
  let x = -80;
  let i = 0;
  while (x < 1500) {
    const y = 550 + (next() - 0.5) * 30;
    const scale = 0.85 + next() * 0.6;
    list.push([x, y, scale, 300 + i]);
    x += 90 + next() * 60;
    i++;
  }
  x = -40;
  while (x < 1500) {
    const y = 490 + (next() - 0.5) * 30;
    const scale = 0.55 + next() * 0.5;
    list.push([x, y, scale, 400 + i]);
    x += 100 + next() * 70;
    i++;
  }
  // Sort so closer (larger y) clouds render in front
  list.sort((a, b) => a[1] - b[1]);
  return list;
})();

// Tall cumulus rising above the cloud sea
const tallClouds: [number, number, number, number][] = [
  [180, 480, 1.1, 500],
  [490, 490, 1.2, 501],
  [1180, 475, 1.15, 502],
  [780, 495, 0.9, 503],
];

// Floating cumulus drifting higher in the sky
const floatingClouds: [number, number, number, number][] = [
  [120, 250, 0.3, 600],
  [340, 200, 0.35, 601],
  [560, 280, 0.28, 602],
  [1100, 220, 0.32, 603],
  [1280, 290, 0.28, 604],
  [250, 320, 0.25, 605],
  [690, 340, 0.3, 606],
];

// Pre-build all the circle data
const midCircles = midClouds.flatMap(([x, y, s, seed]) => buildCloud(x, y, s, seed, midPalette));
const foregroundCircles = foregroundClouds.flatMap(([x, y, s, seed]) =>
  buildCloud(x, y, s, seed, foregroundPalette)
);
const tallCircles = tallClouds.flatMap(([x, y, s, seed]) =>
  buildCloud(x, y, s, seed, foregroundPalette, true)
);
const floatingCircles = floatingClouds.flatMap(([x, y, s, seed]) =>
  buildCloud(x, y, s, seed, floatingPalette)
);

// ─── Distant cloud haze ────────────────────────────────────────────
// Horizontal soft puffs along the horizon, suggesting distant cloud tops
// fading into the golden light near the sun.
interface HazeShape {
  x: number;
  y: number;
  rx: number;
  ry: number;
  fill: string;
  opacity: number;
  isCircle: boolean;
}
const haze: HazeShape[] = (() => {
  const next = makeRng(1111);
  const list: HazeShape[] = [];
  for (let i = 0; i < 60; i++) {
    const x = next() * 1480 - 40;
    const y = 365 + next() * 32;
    const rx = 30 + next() * 70;
    const ry = 3 + next() * 7;
    const distFromSun = Math.abs(x - sunX) / 700;
    const opacity = 0.5 + (1 - distFromSun) * 0.4;
    const fill = distFromSun < 0.3 ? '#fff0c0' : distFromSun < 0.6 ? '#ffd898' : '#f0b878';
    list.push({ x, y, rx, ry, fill, opacity, isCircle: false });
  }
  for (let i = 0; i < 25; i++) {
    const x = next() * 1480 - 40;
    const y = 350 + next() * 40;
    const r = 4 + next() * 8;
    const distFromSun = Math.abs(x - sunX) / 700;
    const opacity = 0.5 + (1 - distFromSun) * 0.4;
    const fill = distFromSun < 0.4 ? '#ffe5a8' : '#f5c088';
    list.push({ x, y, rx: r, ry: r, fill, opacity, isCircle: true });
  }
  return list;
})();

// ─── Sun ────────────────────────────────────────────────────────────
function Sun({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r * 7} fill="#ffd078" opacity={0.08} />
      <circle cx={cx} cy={cy} r={r * 4.5} fill="#ffd078" opacity={0.14} />
      <circle cx={cx} cy={cy} r={r * 2.8} fill="#ffe5a0" opacity={0.22} />
      <circle cx={cx} cy={cy} r={r * 1.8} fill="#fff0c0" opacity={0.4} />
      <circle cx={cx} cy={cy} r={r * 1.3} fill="#fff8e0" opacity={0.6} />
      <circle cx={cx} cy={cy} r={r} fill="#fffbe8" />
      <circle cx={cx} cy={cy} r={r * 0.55} fill="#ffffff" />
    </g>
  );
}

export default function KingdomOfHeaven() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1400 600"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className="heaven-svg"
    >
      <defs>
        <linearGradient id="heavenSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a4a78" />
          <stop offset="35%" stopColor="#7c7298" />
          <stop offset="60%" stopColor="#f0a880" />
          <stop offset="85%" stopColor="#ffd28a" />
          <stop offset="100%" stopColor="#ffe0a0" />
        </linearGradient>
      </defs>

      {/* Sky */}
      <rect width="1400" height="600" fill="url(#heavenSky)" />

      {/* God rays — drawn before everything else so they sit behind */}
      <g>
        {godRays.map((r, i) => (
          <polygon key={`ray-${i}`} points={r.points} fill={r.fill} opacity={r.opacity} />
        ))}
      </g>

      {/* Floating cumulus drifting in the upper sky */}
      {floatingCircles.map((c, i) => (
        <circle
          key={`floating-${i}`}
          cx={c.cx.toFixed(1)}
          cy={c.cy.toFixed(1)}
          r={c.r.toFixed(1)}
          fill={c.fill}
        />
      ))}

      {/* Sun — drawn over rays and floating clouds, behind the cloud sea */}
      <Sun cx={sunX} cy={sunY} r={30} />

      {/* Distant horizon haze */}
      {haze.map((h, i) =>
        h.isCircle ? (
          <circle
            key={`haze-${i}`}
            cx={h.x.toFixed(1)}
            cy={h.y.toFixed(1)}
            r={h.rx.toFixed(1)}
            fill={h.fill}
            opacity={h.opacity.toFixed(2)}
          />
        ) : (
          <ellipse
            key={`haze-${i}`}
            cx={h.x.toFixed(1)}
            cy={h.y.toFixed(1)}
            rx={h.rx.toFixed(1)}
            ry={h.ry.toFixed(1)}
            fill={h.fill}
            opacity={h.opacity.toFixed(2)}
          />
        )
      )}

      {/* Tall cumulus rising from the sea */}
      {tallCircles.map((c, i) => (
        <circle
          key={`tall-${i}`}
          cx={c.cx.toFixed(1)}
          cy={c.cy.toFixed(1)}
          r={c.r.toFixed(1)}
          fill={c.fill}
        />
      ))}

      {/* Mid-distance clouds */}
      {midCircles.map((c, i) => (
        <circle key={`mid-${i}`} cx={c.cx.toFixed(1)} cy={c.cy.toFixed(1)} r={c.r.toFixed(1)} fill={c.fill} />
      ))}

      {/* Foreground sea of clouds */}
      {foregroundCircles.map((c, i) => (
        <circle key={`fg-${i}`} cx={c.cx.toFixed(1)} cy={c.cy.toFixed(1)} r={c.r.toFixed(1)} fill={c.fill} />
      ))}
    </svg>
  );
}
