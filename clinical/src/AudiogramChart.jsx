import React from 'react';

import { AUDIOGRAM_FREQS, degreeLabel, parseThreshold, ptaAverage } from '../../shared/audiometry.js';

// A clinical audiogram for one ear (right and left are separate charts, as on a clinical audiogram).
// Frequency in octaves across the top, hearing level (dB HL) down; one octave is drawn the same
// length as 20 dB (ASHA, 1990). Symbols follow ASHA (1990):
//   right  O air, Δ air masked, < bone, [ bone masked      (red, solid line)
//   left   X air, □ air masked, > bone, ] bone masked      (blue, dashed line, so it also reads in black & white)
//   no response: the symbol with an arrow pointing down and away from the other ear.
// Degree bands in the background follow Clark (1981), the same scale as the PTA degree.
const FREQS = AUDIOGRAM_FREQS;            // 250, 500, 1000, 2000, 4000, 8000
const DB_MIN = -10;
const DB_MAX = 120;
const L = 34;
const R = 58;
const T = 26;
const B = 14;
const PW = 210;                                          // plot width: 5 octaves
const PH = PW * ((DB_MAX - DB_MIN) / 20) / (FREQS.length - 1); // 1 octave = 20 dB
const W = L + PW + R;
const H = T + PH + B;

const BANDS = [
  [-10, 15, 'Normal'],
  [15, 25, 'Minimal'],
  [25, 40, 'Mild'],
  [40, 55, 'Moderate'],
  [55, 70, 'Mod. severe'],
  [70, 90, 'Severe'],
  [90, 120, 'Profound'],
];

export const EAR_COLOR = { right: '#c0392b', left: '#1f5fa8' };

const fx = (i) => L + (i / (FREQS.length - 1)) * PW;
const fy = (db) => T + ((Math.min(DB_MAX, Math.max(DB_MIN, db)) - DB_MIN) / (DB_MAX - DB_MIN)) * PH;
const freqLabel = (f) => (f >= 1000 ? `${f / 1000}k` : `${f}`);

function points(row) {
  return FREQS.map((f, i) => {
    const t = parseThreshold(row?.[f]);
    if (t.db === undefined && !t.nr) return { i, f };
    return { i, f, db: t.db ?? DB_MAX, masked: !!t.masked, nr: !!t.nr };
  });
}

// One audiogram symbol, centred on (cx, cy).
export function Symbol({ cx, cy, ear, air, masked, nr, color }) {
  const c = color || EAR_COLOR[ear];
  const sw = 1.6;
  let mark;
  if (air) {
    if (ear === 'right') {
      mark = masked
        ? <path d={`M${cx},${cy - 6} L${cx + 6},${cy + 4.5} L${cx - 6},${cy + 4.5} Z`} fill="#fff" stroke={c} strokeWidth={sw} />
        : <circle cx={cx} cy={cy} r="5.2" fill="#fff" stroke={c} strokeWidth={sw} />;
    } else {
      mark = masked
        ? <rect x={cx - 5} y={cy - 5} width="10" height="10" fill="#fff" stroke={c} strokeWidth={sw} />
        : <g stroke={c} strokeWidth="1.8"><line x1={cx - 4.6} y1={cy - 4.6} x2={cx + 4.6} y2={cy + 4.6} /><line x1={cx + 4.6} y1={cy - 4.6} x2={cx - 4.6} y2={cy + 4.6} /></g>;
    }
  } else if (masked) {
    mark = ear === 'right'
      ? <path d={`M${cx + 3},${cy - 6} L${cx - 2},${cy - 6} L${cx - 2},${cy + 6} L${cx + 3},${cy + 6}`} fill="none" stroke={c} strokeWidth={sw} />
      : <path d={`M${cx - 3},${cy - 6} L${cx + 2},${cy - 6} L${cx + 2},${cy + 6} L${cx - 3},${cy + 6}`} fill="none" stroke={c} strokeWidth={sw} />;
  } else {
    mark = ear === 'right'
      ? <path d={`M${cx + 3.5},${cy - 5} L${cx - 3.5},${cy} L${cx + 3.5},${cy + 5}`} fill="none" stroke={c} strokeWidth={sw} />
      : <path d={`M${cx - 3.5},${cy - 5} L${cx + 3.5},${cy} L${cx - 3.5},${cy + 5}`} fill="none" stroke={c} strokeWidth={sw} />;
  }
  if (!nr) return mark;
  // arrow down and away from the other ear: right ear down-left, left ear down-right
  const dir = ear === 'right' ? -1 : 1;
  const x1 = cx + dir * 4;
  const y1 = cy + 4;
  const x2 = cx + dir * 11;
  const y2 = cy + 11;
  return (
    <g>
      {mark}
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={c} strokeWidth="1.3" />
      <path d={`M${x2 - dir * 4.5},${y2} L${x2},${y2} L${x2},${y2 - 4.5}`} fill="none" stroke={c} strokeWidth="1.3" />
    </g>
  );
}

export function AudiogramChart({ ear, ac, bc }) {
  const color = EAR_COLOR[ear];
  const acPts = points(ac);
  const bcPts = points(bc);
  const line = acPts.filter((p) => p.db != null && !p.nr);
  const pta = ptaAverage(ac);
  const bcShift = ear === 'right' ? -8 : 8;
  return (
    <figure className={`clin-audio clin-audio--${ear}`}>
      <figcaption>
        <span className="clin-audio__ear" style={{ color }}>{ear === 'right' ? 'Right ear' : 'Left ear'}</span>
        {pta !== null && <span className="clin-audio__pta">PTA {pta} dB HL · {degreeLabel(pta)}</span>}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${ear} ear audiogram`} className="clin-audio__svg">
        {/* degree bands (Clark, 1981) */}
        {BANDS.map(([a, b, label], k) => (
          <g key={label}>
            <rect x={L} y={fy(a)} width={PW} height={fy(b) - fy(a)} fill={k % 2 ? '#f3f6fa' : '#ffffff'} />
            <text x={L + PW + 5} y={(fy(a) + fy(b)) / 2 + 2.6} fontSize="7.2" fill="#64748b">{label}</text>
          </g>
        ))}
        {/* dB gridlines every 10 dB, labelled */}
        {Array.from({ length: (DB_MAX - DB_MIN) / 10 + 1 }, (_, k) => DB_MIN + k * 10).map((db) => (
          <g key={db}>
            <line x1={L} y1={fy(db)} x2={L + PW} y2={fy(db)} stroke={db === 0 ? '#7b8794' : '#d5dde6'} strokeWidth={db === 0 ? 0.9 : 0.6} />
            <text x={L - 5} y={fy(db) + 2.6} textAnchor="end" fontSize="7.4" fill="#475569">{db}</text>
          </g>
        ))}
        {/* frequency gridlines, labelled along the top */}
        {FREQS.map((f, i) => (
          <g key={f}>
            <line x1={fx(i)} y1={T} x2={fx(i)} y2={T + PH} stroke="#d5dde6" strokeWidth="0.6" />
            <text x={fx(i)} y={T - 6} textAnchor="middle" fontSize="7.6" fill="#475569" fontWeight="600">{freqLabel(f)}</text>
          </g>
        ))}
        <rect x={L} y={T} width={PW} height={PH} fill="none" stroke="#94a3b8" strokeWidth="0.9" />
        <text x={L + PW / 2} y={9} textAnchor="middle" fontSize="7" fill="#64748b" letterSpacing="0.4">FREQUENCY (Hz)</text>
        <text transform={`translate(9 ${T + PH / 2}) rotate(-90)`} textAnchor="middle" fontSize="7" fill="#64748b" letterSpacing="0.4">HEARING LEVEL (dB HL)</text>
        {/* air-conduction line: right solid, left dashed */}
        {line.length > 1 && (
          <polyline points={line.map((p) => `${fx(p.i)},${fy(p.db)}`).join(' ')} fill="none" stroke={color} strokeWidth="1.4"
            strokeDasharray={ear === 'left' ? '4 2.5' : ''} strokeLinejoin="round" />
        )}
        {/* bone, then air symbols */}
        {bcPts.filter((p) => p.db != null).map((p) => (
          <Symbol key={`b${p.f}`} cx={fx(p.i) + bcShift} cy={fy(p.db)} ear={ear} air={false} masked={p.masked} nr={p.nr} />
        ))}
        {acPts.filter((p) => p.db != null).map((p) => (
          <Symbol key={`a${p.f}`} cx={fx(p.i)} cy={fy(p.db)} ear={ear} air masked={p.masked} nr={p.nr} />
        ))}
      </svg>
    </figure>
  );
}

// The symbol key printed under the charts.
export function SymbolKey() {
  const cells = [
    ['Air', { air: true }],
    ['Air, masked', { air: true, masked: true }],
    ['Bone', { air: false }],
    ['Bone, masked', { air: false, masked: true }],
    ['No response', { air: true, nr: true }],
  ];
  const mini = (ear, props) => (
    <svg viewBox="-12 -9 24 22" width="22" height="20" aria-hidden="true"><Symbol cx={0} cy={0} ear={ear} {...props} /></svg>
  );
  return (
    <table className="clin-symkey" aria-label="Audiogram symbol key">
      <thead><tr><th />{cells.map(([label]) => <th key={label}>{label}</th>)}</tr></thead>
      <tbody>
        {['right', 'left'].map((ear) => (
          <tr key={ear}>
            <th style={{ color: EAR_COLOR[ear] }}>{ear === 'right' ? 'Right' : 'Left'}</th>
            {cells.map(([label, props]) => <td key={label}>{mini(ear, props)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Both ears, side by side, each its own plot.
export default function AudiogramPair({ value }) {
  const v = value || {};
  const any = ['ac_r', 'ac_l', 'bc_r', 'bc_l'].some((k) => v[k] && Object.values(v[k]).some((x) => String(x || '').trim()));
  if (!any) return null;
  return (
    <div className="clin-audio-pair">
      <AudiogramChart ear="right" ac={v.ac_r} bc={v.bc_r} />
      <AudiogramChart ear="left" ac={v.ac_l} bc={v.bc_l} />
    </div>
  );
}
