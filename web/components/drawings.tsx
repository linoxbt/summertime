/* Original line drawings for Summertime, in a technical-drawing style:
   ink strokes on paper, hatching for cut faces, mono annotations. */

export type Slot = { id: string; cbm: number; mine?: boolean };

const INK = "#0b0a09";
const FAINT = "#63625e";

/** A 40' high-cube container in side elevation with a cutaway showing each importer's slot. */
export function ContainerDrawing({
  slots,
  capacity,
  threshold,
  crane = false,
  annotate = true,
  label,
}: {
  slots: Slot[];
  capacity: number;
  threshold: number;
  crane?: boolean;
  annotate?: boolean;
  label: string;
}) {
  const top = crane ? 150 : 40;
  const W = 800;
  const H = top + 250;
  const x0 = 40;
  const x1 = 760;
  const yT = top;
  const yB = top + 170;
  // Cutaway (interior) area.
  const cx0 = 70;
  const cx1 = 688;
  const cy0 = yT + 16;
  const cy1 = yB - 14;
  const perCbm = (cx1 - cx0) / capacity;
  const used = slots.reduce((s, x) => s + x.cbm, 0);
  const thrX = cx0 + threshold * perCbm;

  let cursor = cx0;
  const blocks = slots.map((s, i) => {
    const w = s.cbm * perCbm;
    const b = { ...s, x: cursor, w, i };
    cursor += w;
    return b;
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-auto w-full" fontFamily="var(--font-mono)">
      <defs>
        <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke={INK} strokeWidth="0.8" opacity="0.55" />
        </pattern>
        <pattern id="hatch-light" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke={INK} strokeWidth="0.6" opacity="0.25" />
        </pattern>
      </defs>

      {crane && <Spreader x0={x0} x1={x1} yT={yT} />}

      {/* Body */}
      <g stroke={INK} fill="none" strokeWidth="1.2">
        <rect x={x0} y={yT} width={x1 - x0} height={yB - yT} fill="#faf9f6" />
        <rect x={x0} y={yT} width={x1 - x0} height="10" fill="url(#hatch-light)" />
        <rect x={x0} y={yB - 10} width={x1 - x0} height="10" fill="url(#hatch-light)" />
        {/* Corrugation */}
        {Array.from({ length: Math.floor((x1 - x0) / 12) }, (_, i) => x0 + 6 + i * 12).map((x) => (
          <line key={x} x1={x} y1={yT + 10} x2={x} y2={yB - 10} strokeWidth="0.6" opacity="0.35" />
        ))}
        {/* Corner castings */}
        {[
          [x0, yT],
          [x1 - 18, yT],
          [x0, yB - 14],
          [x1 - 18, yB - 14],
        ].map(([x, y]) => (
          <g key={`${x}-${y}`}>
            <rect x={x} y={y} width="18" height="14" fill="#e8e7e2" />
            <ellipse cx={x! + 9} cy={y! + 7} rx="4.5" ry="3" />
          </g>
        ))}
        {/* Doors and locking bars */}
        <line x1="700" y1={yT + 10} x2="700" y2={yB - 10} />
        {[712, 726, 740].map((x) => (
          <g key={x}>
            <line x1={x} y1={yT + 14} x2={x} y2={yB - 14} strokeWidth="1.6" />
            <rect x={x - 3} y={yT + 74} width="6" height="12" fill="#faf9f6" />
            <line x1={x + 3} y1={yT + 80} x2={x + 11} y2={yT + 88} />
          </g>
        ))}
        {/* Stencil marks */}
        <text x="78" y={yT + 0} dy="-6" fontSize="10" fill={FAINT} stroke="none" letterSpacing="1">
          SMTU 060226 · 45G1
        </text>
      </g>

      {/* Cutaway */}
      <g>
        <rect x={cx0} y={cy0} width={cx1 - cx0} height={cy1 - cy0} fill="#f3f2ee" stroke={INK} strokeWidth="1" strokeDasharray="5 4" />
        {blocks.map((b) => (
          <g key={b.id} className="fill-in" style={{ animationDelay: `${b.i * 90}ms` }}>
            <Cartons x={b.x} y={cy0} w={b.w} h={cy1 - cy0} mine={b.mine} />
          </g>
        ))}
        {used < capacity && (
          <text x={(cursor + cx1) / 2} y={(cy0 + cy1) / 2} textAnchor="middle" fontSize="11" fill={FAINT} letterSpacing="1">
            <tspan x={(cursor + cx1) / 2}>OPEN</tspan>
            <tspan x={(cursor + cx1) / 2} dy="14">{capacity - used} CBM</tspan>
          </text>
        )}
        {/* Threshold */}
        <line x1={thrX} y1={yT - 22} x2={thrX} y2={yB + 8} stroke={INK} strokeWidth="1.2" strokeDasharray="2 3" />
        <text x={thrX} y={yT - 28} textAnchor="middle" fontSize="10.5" fill={INK} letterSpacing="1">
          THRESHOLD {threshold}
        </text>
      </g>

      {annotate && (
        <g fontSize="10.5" fill={INK} letterSpacing="0.8">
          {blocks.map((b) =>
            b.w > 34 ? (
              <text key={b.id} x={b.x + b.w / 2} y={cy0 + 16} textAnchor="middle" fill={b.mine ? "#faf9f6" : INK}>
                {b.id} · {b.cbm}
              </text>
            ) : null,
          )}
        </g>
      )}

      {/* Dimension line */}
      <g stroke={INK} strokeWidth="0.9" fill={INK}>
        <line x1={x0} y1={yB + 22} x2={x0} y2={yB + 44} />
        <line x1={x1} y1={yB + 22} x2={x1} y2={yB + 44} />
        <line x1={x0} y1={yB + 36} x2={x1} y2={yB + 36} />
        <path d={`M${x0} ${yB + 36} l9 -3.5 v7 Z M${x1} ${yB + 36} l-9 -3.5 v7 Z`} stroke="none" />
        <rect x={W / 2 - 92} y={yB + 28} width="184" height="16" fill="#f3f2ee" stroke="none" />
        <text x={W / 2} y={yB + 40} textAnchor="middle" fontSize="11" stroke="none" letterSpacing="1">
          12.03 M · {capacity} CBM SHARED
        </text>
      </g>
      {/* Ground */}
      <line x1="10" y1={yB + 1} x2={W - 10} y2={yB + 1} stroke={INK} strokeWidth="0.8" />
      <rect x="10" y={yB + 1} width={W - 20} height="8" fill="url(#hatch-light)" />
    </svg>
  );
}

function Cartons({ x, y, w, h, mine }: { x: number; y: number; w: number; h: number; mine?: boolean }) {
  const rows = 4;
  const rh = (h - 24) / rows;
  const cols = Math.max(1, Math.round(w / 26));
  const cw = w / cols;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={mine ? INK : "url(#hatch)"} stroke={INK} strokeWidth="1.1" />
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => (
          <rect
            key={`${r}-${c}`}
            x={x + c * cw + 2}
            y={y + 22 + r * rh + 1}
            width={cw - 4}
            height={rh - 2}
            fill={mine ? INK : "#faf9f6"}
            stroke={mine ? "#faf9f6" : INK}
            strokeWidth="0.7"
            opacity={mine ? 0.9 : 1}
          />
        )),
      )}
    </g>
  );
}

/** Crane spreader and chain lifting the box. */
function Spreader({ x0, x1, yT }: { x0: number; x1: number; yT: number }) {
  const beamY = yT - 92;
  const mid = (x0 + x1) / 2;
  return (
    <g stroke={INK} fill="none" strokeWidth="1.1">
      {/* Chain */}
      {Array.from({ length: 6 }, (_, i) => (
        <ellipse key={i} cx={mid} cy={6 + i * 10} rx={i % 2 ? 2 : 4} ry="6" />
      ))}
      <path d={`M${mid - 9} ${beamY - 8} q9 -20 18 0`} strokeWidth="2" />
      {/* Beam */}
      <rect x={x0 + 70} y={beamY - 8} width={x1 - x0 - 140} height="16" fill="url(#hatch-light)" />
      <rect x={x0 + 70} y={beamY - 8} width={x1 - x0 - 140} height="16" />
      {/* Cables to castings */}
      <line x1={x0 + 80} y1={beamY + 8} x2={x0 + 9} y2={yT} />
      <line x1={x1 - 80} y1={beamY + 8} x2={x1 - 9} y2={yT} />
      <line x1={x0 + 110} y1={beamY + 8} x2={x0 + 9} y2={yT} opacity="0.5" />
      <line x1={x1 - 110} y1={beamY + 8} x2={x1 - 9} y2={yT} opacity="0.5" />
    </g>
  );
}

/** A high-security bolt seal, the lock put on container doors. */
export function BoltSeal({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 260" className={className} aria-hidden="true" fill="none" stroke={INK} strokeWidth="1.2">
      <defs>
        <pattern id="seal-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="5" stroke={INK} strokeWidth="0.7" opacity="0.5" />
        </pattern>
      </defs>
      {/* Bolt */}
      <rect x="92" y="18" width="16" height="150" fill="#faf9f6" />
      <ellipse cx="100" cy="18" rx="22" ry="7" fill="#e8e7e2" />
      <path d="M78 18v10a22 7 0 0 0 44 0V18" fill="#e8e7e2" />
      {Array.from({ length: 9 }, (_, i) => (
        <line key={i} x1="92" y1={40 + i * 13} x2="108" y2={46 + i * 13} strokeWidth="0.7" opacity="0.6" />
      ))}
      {/* Barrel */}
      <path d="M62 160h76v58a38 12 0 0 1-76 0Z" fill="url(#seal-hatch)" />
      <path d="M62 160h76v58a38 12 0 0 1-76 0Z" />
      <ellipse cx="100" cy="160" rx="38" ry="12" fill="#faf9f6" />
      <ellipse cx="100" cy="160" rx="10" ry="3.5" />
      <rect x="74" y="182" width="52" height="22" fill="#faf9f6" />
      <text x="100" y="197" textAnchor="middle" fontSize="10" fill={INK} stroke="none" fontFamily="var(--font-mono)" letterSpacing="1">
        ST 0042
      </text>
      <line x1="10" y1="250" x2="190" y2="250" strokeWidth="0.8" />
    </svg>
  );
}
