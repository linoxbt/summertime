// Landing-page visuals: route globe, booking slip, sailings board, product panels.
// Illustrative data is labelled "Example" wherever it appears.

import type { ReactNode } from "react";
import { geoContains, geoOrthographic, geoPath, geoInterpolate } from "d3-geo";
import { feature } from "topojson-client";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import land110 from "world-atlas/land-110m.json";

// ---- Route globe --------------------------------------------------------------------------
// Land is dotted from Natural Earth (world-atlas, public domain); computed at render time on
// the server, so the browser receives a static SVG.


const SIZE = 400;
const projection = geoOrthographic()
  .rotate([-55, 8])
  .scale(SIZE / 2)
  .translate([SIZE / 2, SIZE / 2])
  .clipAngle(90);

// The China–West Africa sea lane, via the Strait of Malacca and the Cape of Good Hope.
const LANE: [number, number][] = [
  [113.3, 23.1], // Guangzhou [lon, lat]
  [112, 15],
  [106, 5],
  [103.8, 1.3], // Singapore
  [95, 5.8],
  [80.5, 5.9], // off Colombo
  [70, -8],
  [55, -22],
  [32, -34],
  [19.5, -35.5], // Cape of Good Hope
  [9, -25],
  [3, -8],
  [3.4, 6.2], // Lagos (Apapa)
];

function lanePath(): string {
  const coords: [number, number][] = [];
  for (let i = 0; i < LANE.length - 1; i++) {
    const interp = geoInterpolate(LANE[i]!, LANE[i + 1]!);
    for (let t = 0; t < 1; t += 0.1) coords.push(interp(t));
  }
  coords.push(LANE[LANE.length - 1]!);
  return geoPath(projection)({ type: "LineString", coordinates: coords }) ?? "";
}

function landDots(): { x: number; y: number }[] {
  const topo = land110 as unknown as Parameters<typeof feature>[0];
  const landFc = feature(topo, (topo as unknown as { objects: { land: never } }).objects.land) as unknown as FeatureCollection<Polygon | MultiPolygon>;
  const out: { x: number; y: number }[] = [];
  for (let lat = -60; lat <= 75; lat += 2.4) {
    const step = 2.4 / Math.max(0.3, Math.cos((lat * Math.PI) / 180));
    for (let lon = -180; lon < 180; lon += step) {
      if (!geoContains(landFc, [lon, lat])) continue;
      const p = projection([lon, lat]);
      // Skip the far hemisphere.
      const d = projection.invert && p ? projection.invert(p) : null;
      if (!p || !d || Math.abs(d[0] - lon) > 0.01) continue;
      out.push({ x: p[0], y: p[1] });
    }
  }
  return out;
}

const PORTS = [
  { code: "CNCAN", lonlat: [113.3, 23.1] as [number, number], dx: 8, dy: -8, anchor: "start" as const },
  { code: "NGAPP", lonlat: [3.4, 6.2] as [number, number], dx: -8, dy: -8, anchor: "end" as const },
];

const DOTS = landDots();
const LANE_PATH = lanePath();
const OUTLINE = geoPath(projection)({ type: "Sphere" }) ?? "";

export function RouteGlobe() {
  return (
    <svg viewBox={`-30 -10 ${SIZE + 60} ${SIZE + 20}`} className="h-full w-full" role="img" aria-label="Sea lane from Guangzhou to Lagos (Apapa)">
      <defs>
        <radialGradient id="globe-glow" cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#1b2d6b" />
          <stop offset="100%" stopColor="#070c22" />
        </radialGradient>
      </defs>
      <path d={OUTLINE} fill="url(#globe-glow)" stroke="#2c3d78" strokeWidth="1" />
      {DOTS.map((d, i) => (
        <circle key={i} cx={d.x.toFixed(1)} cy={d.y.toFixed(1)} r="1.25" fill="#8aa9ff" opacity="0.55" />
      ))}
      <path d={LANE_PATH} fill="none" stroke="#ffb547" strokeOpacity="0.22" strokeWidth="6" strokeLinecap="round" />
      <path d={LANE_PATH} fill="none" stroke="#ffb547" strokeWidth="1.8" className="route-dash" strokeLinecap="round" />
      {PORTS.map((p) => {
        const pt = projection(p.lonlat)!;
        return (
          <g key={p.code}>
            <circle cx={pt[0]} cy={pt[1]} r="9" fill="#3fe0b5" opacity="0.2" />
            <circle cx={pt[0]} cy={pt[1]} r="3.5" fill="#3fe0b5" />
            <text x={pt[0] + p.dx} y={pt[1] + p.dy} textAnchor={p.anchor} className="fill-[#eef2ff] font-mono text-[10px] tracking-wider">
              {p.code}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---- Booking slip --------------------------------------------------------------------------

export function BookingSlip() {
  return (
    <div className="w-full rotate-[-3deg] rounded-xl border border-line-strong bg-gradient-to-b from-[#16245a] to-[#0d1740] p-5 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.8)]">
      <div className="flex items-center justify-between">
        <span className="label text-muted">Container booking</span>
        <span className="label text-faint">Example</span>
      </div>
      <div className="mt-4 flex items-end justify-between">
        <div>
          <p className="text-3xl font-semibold tracking-tight text-fg">CNCAN</p>
          <p className="text-xs text-muted">Guangzhou</p>
        </div>
        <span className="mb-4 h-px flex-1 border-t border-dashed border-amber/60 mx-3" aria-hidden="true" />
        <div className="text-right">
          <p className="text-3xl font-semibold tracking-tight text-fg">NGAPP</p>
          <p className="text-xs text-muted">Lagos (Apapa)</p>
        </div>
      </div>
      <div className="my-4 border-t border-dashed border-line-strong" />
      <p className="label text-faint">Settled to forwarder</p>
      <p className="mt-1 text-3xl font-semibold text-fg tabular">9,000.00 USDCx</p>
      <dl className="mt-4 grid grid-cols-3 gap-2">
        {[
          ["Space", "60 CBM"],
          ["Importers", "6"],
          ["Legs", "1 tx"],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="label text-faint">{k}</dt>
            <dd className="mt-0.5 text-sm font-semibold text-fg">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex items-center justify-between">
        <Barcode />
        <span className="label rounded border border-ok/40 bg-ok-soft px-2 py-1 text-ok">✓ Settled</span>
      </div>
    </div>
  );
}

function Barcode() {
  const bars = [2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1, 1, 3, 1, 2, 2, 1, 3, 1, 1, 2];
  let x = 0;
  return (
    <svg viewBox="0 0 120 28" className="h-7 w-28" aria-hidden="true">
      {bars.map((w, i) => {
        const r = (
          <rect key={i} x={x} y="0" width={w} height="28" fill={i % 2 ? "transparent" : "#9aa6cb"} />
        );
        x += w + 1.2;
        return r;
      })}
    </svg>
  );
}

// ---- Sailings board ------------------------------------------------------------------------

export interface Sailing {
  time: string;
  lane: string;
  filled: string;
  bond: string;
  status: "SETTLED" | "FILLING" | "REFUNDED" | "LOCKED";
}

export const EXAMPLE_SAILINGS: Sailing[] = [
  { time: "09:48", lane: "CAN>APP", filled: "60/60", bond: "200", status: "SETTLED" },
  { time: "09:31", lane: "NGB>APP", filled: "54/60", bond: "180", status: "REFUNDED" },
  { time: "09:12", lane: "SZX>TIN", filled: "41/60", bond: "200", status: "FILLING" },
  { time: "08:55", lane: "SHA>APP", filled: "33/40", bond: "120", status: "LOCKED" },
  { time: "08:40", lane: "CAN>TEM", filled: "18/30", bond: "90", status: "FILLING" },
];

const statusColour: Record<Sailing["status"], string> = {
  SETTLED: "text-ok",
  REFUNDED: "text-amber",
  FILLING: "text-link",
  LOCKED: "text-fg",
};

function Flaps({ text, width, colour = "text-amber", delay = 0 }: { text: string; width: number; colour?: string; delay?: number }) {
  const chars = text.padEnd(width, " ").slice(0, width).split("");
  return (
    <span className="inline-flex gap-[3px]" aria-hidden="true">
      {chars.map((c, i) => (
        <span
          key={i}
          className={`flap flap-in inline-flex h-7 w-[1.15rem] items-center justify-center text-[0.8rem] font-semibold sm:h-8 sm:w-6 sm:text-sm ${colour}`}
          style={{ animationDelay: `${delay + i * 35}ms` }}
        >
          {c === ">" ? "→" : c}
        </span>
      ))}
    </span>
  );
}

export function SailingsBoard({ rows = EXAMPLE_SAILINGS }: { rows?: Sailing[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-[#070c20]">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="flex items-center gap-3">
          <ShipIcon />
          <span className="label text-fg">Sailings</span>
          <span className="hidden text-xs text-faint sm:inline">Example containers</span>
        </span>
        <span className="label rounded border border-line-strong px-2 py-1 text-amber">China → West Africa</span>
      </div>
      <div className="relative overflow-x-auto" tabIndex={0} role="region" aria-label="Example sailings">
        <table className="w-full min-w-[640px] text-left">
          <caption className="sr-only">Example container campaigns: time, lane, CBM filled, bond in USDCx and status</caption>
          <thead>
            <tr className="label text-faint">
              <th className="px-4 py-2 font-normal">Time</th>
              <th className="px-2 py-2 font-normal">Lane</th>
              <th className="px-2 py-2 font-normal">CBM filled</th>
              <th className="px-2 py-2 font-normal">Bond</th>
              <th className="px-4 py-2 font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.time + r.lane}>
                <td className="px-4 py-1.5">
                  <span className="sr-only">{r.time}</span>
                  <Flaps text={r.time} width={5} colour="text-fg" delay={i * 120} />
                </td>
                <td className="px-2 py-1.5">
                  <span className="sr-only">{r.lane.replace(">", " to ")}</span>
                  <Flaps text={r.lane} width={7} delay={i * 120 + 100} />
                </td>
                <td className="px-2 py-1.5">
                  <span className="sr-only">{r.filled} CBM</span>
                  <Flaps text={r.filled} width={5} delay={i * 120 + 200} />
                </td>
                <td className="px-2 py-1.5">
                  <span className="sr-only">{r.bond} USDCx</span>
                  <Flaps text={r.bond} width={4} colour="text-fg" delay={i * 120 + 300} />
                </td>
                <td className="px-4 py-1.5">
                  <span className="sr-only">{r.status}</span>
                  <Flaps text={r.status} width={8} colour={statusColour[r.status]} delay={i * 120 + 400} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ShipIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 text-amber" fill="currentColor" aria-hidden="true">
      <path d="M4 9h12l-1.6 5.2a1 1 0 0 1-.95.7H6.55a1 1 0 0 1-.95-.7L4 9Zm2-4h3v3H6V5Zm4 0h3v3h-3V5ZM2 17h16v1.5H2V17Z" />
    </svg>
  );
}

// ---- Sailings ticker (hero footer) --------------------------------------------------------

export function SailingsTicker() {
  const items = [...EXAMPLE_SAILINGS, ...EXAMPLE_SAILINGS];
  return (
    <div className="flex items-stretch border-t border-line bg-page/80">
      <span className="label flex flex-none items-center gap-2 bg-amber px-4 py-3 text-[#1a1204]">
        <ShipIcon /> Sailings
      </span>
      <div className="relative min-w-0 flex-1 overflow-hidden" aria-label="Example sailings" role="marquee">
        <div className="flex w-max animate-[ticker_40s_linear_infinite] gap-10 px-6 py-3 motion-reduce:animate-none">
          {items.map((r, i) => (
            <span key={i} className="flex items-center gap-3 whitespace-nowrap text-sm">
              <span className="font-semibold text-fg">{r.lane.replace(">", " → ")}</span>
              <span className="label text-faint">{r.filled} CBM</span>
              <span className={`label ${statusColour[r.status]}`}>{r.status}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- Section scaffolding ------------------------------------------------------------------

export function Eyebrow({ letter, children }: { letter: string; children: ReactNode }) {
  return (
    <p className="label flex items-center gap-3 text-muted">
      <span className="flex h-5 w-5 items-center justify-center rounded-[3px] bg-accent text-[10px] text-white">{letter}</span>
      {children}
      <span className="h-px w-16 bg-line-strong" aria-hidden="true" />
    </p>
  );
}

export function Panel({ letter, tag, title, children }: { letter: string; tag: string; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col rounded-lg border border-line bg-panel/70 p-5">
      <p className="label flex items-center gap-3 text-muted">
        <span className="flex h-5 w-5 items-center justify-center rounded-[3px] bg-panel-2 text-[10px] text-link">{letter}</span>
        {tag}
        <span className="h-px flex-1 bg-line" aria-hidden="true" />
      </p>
      <h3 className="mt-4 text-xl font-semibold text-fg">{title}</h3>
      <div className="mt-5 flex-1 rounded-md border border-line bg-page/70 p-4">{children}</div>
    </div>
  );
}
