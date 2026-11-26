// Audiometry rules for the audiology report: reading threshold cells, PTA and degree, type and
// configuration of loss per ear, tuning fork tests and the audiometric Weber test, and the suggested
// provisional diagnosis / impression built from them. The clinician always edits and confirms.
// Plain JavaScript with no imports from the browser or Workers, so it also runs under `node --test`.

import { DEGREES, labelOf } from './clinical.js';

export const AUDIOGRAM_FREQS = [250, 500, 1000, 2000, 4000, 8000];
export const AUDIOGRAM_ROWS = [['ac_r', 'AC Right'], ['ac_l', 'AC Left'], ['bc_r', 'BC Right'], ['bc_l', 'BC Left']];
export const PTA_FREQS = [500, 1000, 2000, 4000];

// Criteria used for the suggestions (shown to the clinician in the editor).
export const AIR_BONE_GAP_DB = 15;    // mean air-bone gap of 15 dB or more = conductive component
export const BC_NORMAL_MAX_DB = 25;   // bone conduction up to 25 dB HL = cochlear reserve within normal limits

// ---------- threshold cells ----------

// A threshold cell as typed by the clinician:
//   "45"     threshold 45 dB HL
//   "45M"    masked threshold
//   "NR"     no response (level not given)    "110NR" / "110 NR"  no response at 110 dB HL
// Returns { db?, masked?, nr? }; an empty or unreadable cell gives {}.
export function parseThreshold(value) {
  const s = String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!s) return {};
  if (/^(NR|CNT|DNE|NORESPONSE)$/.test(s)) return { nr: true };
  const m = s.match(/^(-?\d{1,3}(?:\.\d)?)(M)?(NR)?(M)?$/);
  if (!m) return {};
  const out = { db: Number(m[1]) };
  if (m[2] || m[4]) out.masked = true;
  if (m[3]) out.nr = true;
  return out;
}

// A usable threshold (a number that is not a no-response), else null.
function thresholdDb(value) {
  const t = parseThreshold(value);
  return t.db !== undefined && !t.nr ? t.db : null;
}

const round1 = (n) => Math.round(n * 10) / 10;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

// Average of 500, 1000, 2000 and 4000 Hz (needs all four), rounded to one decimal.
export function ptaAverage(row) {
  if (!row) return null;
  const values = PTA_FREQS.map((f) => thresholdDb(row[f]));
  if (values.some((v) => v === null)) return null;
  return round1(mean(values));
}

// Degree of hearing loss for a PTA (Clark, 1981): returns an id from DEGREES.
export function degreeFor(pta) {
  if (pta === null || pta === undefined || !Number.isFinite(pta)) return null;
  if (pta <= 15) return 'normal';
  if (pta <= 25) return 'minimal';
  if (pta <= 40) return 'mild';
  if (pta <= 55) return 'moderate';
  if (pta <= 70) return 'mod_severe';
  if (pta <= 90) return 'severe';
  return 'profound';
}

export function degreeLabel(pta) {
  const id = degreeFor(pta);
  return id ? labelOf(DEGREES, id).replace(/\s*\(.*\)$/, '') : '';
}

export function hasThresholds(row) {
  return !!row && Object.values(row).some((v) => String(v ?? '').trim() !== '');
}

// ---------- one ear ----------

export const LOSS_TYPES = { normal: 'normal', sensorineural: 'sensorineural', conductive: 'conductive', mixed: 'mixed', unknown: 'unknown' };

// Shape of the air-conduction audiogram (needs at least four thresholds).
export function configurationOf(ac) {
  const v = {};
  for (const f of AUDIOGRAM_FREQS) {
    const db = thresholdDb(ac?.[f]);
    if (db !== null) v[f] = db;
  }
  const freqs = AUDIOGRAM_FREQS.filter((f) => v[f] !== undefined);
  if (freqs.length < 4) return null;
  const avg = (fs) => { const xs = fs.filter((f) => v[f] !== undefined).map((f) => v[f]); return xs.length ? mean(xs) : null; };
  const low = avg([250, 500]);
  const mid = avg([1000, 2000]);
  const high = avg([4000, 8000]);
  if (v[4000] !== undefined && v[2000] !== undefined && v[8000] !== undefined && v[4000] - v[2000] >= 15 && v[4000] - v[8000] >= 10) return 'notched at 4 kHz';
  if (low !== null && mid !== null && high !== null && mid - low >= 15 && mid - high >= 15) return 'trough-shaped (cookie-bite)';
  if (low !== null && high !== null && low - high >= 15) return 'rising';
  for (let i = 1; i < freqs.length; i += 1) {
    if (AUDIOGRAM_FREQS.indexOf(freqs[i]) - AUDIOGRAM_FREQS.indexOf(freqs[i - 1]) === 1 && v[freqs[i]] - v[freqs[i - 1]] >= 25) return 'precipitously sloping';
  }
  if (low !== null && high !== null && high - low >= 15) return 'sloping';
  const all = freqs.map((f) => v[f]);
  if (Math.max(...all) - Math.min(...all) <= 20) return 'flat';
  return 'irregular';
}

// Degree, type and configuration for one ear from its air- and bone-conduction thresholds.
export function analyseEar(ac, bc) {
  const pta = ptaAverage(ac);
  if (pta === null) return null;
  const degree = degreeFor(pta);
  const pairs = PTA_FREQS.map((f) => [thresholdDb(ac?.[f]), thresholdDb(bc?.[f])]).filter(([a, b]) => a !== null && b !== null);
  const abg = pairs.length >= 2 ? round1(mean(pairs.map(([a, b]) => a - b))) : null;
  const bcMean = pairs.length >= 2 ? round1(mean(pairs.map(([, b]) => b))) : null;
  let type;
  if (degree === 'normal') type = 'normal';
  else if (abg === null) type = 'unknown';
  else if (abg >= AIR_BONE_GAP_DB) type = bcMean <= BC_NORMAL_MAX_DB ? 'conductive' : 'mixed';
  else type = 'sensorineural';
  return { pta, degree, degreeText: degreeLabel(pta), bcPta: ptaAverage(bc), bcMean, abg, type, config: type === 'normal' ? null : configurationOf(ac) };
}

// "Moderate sensorineural hearing loss with a sloping configuration (PTA 48.8 dB HL)"
export function describeEar(a, { withPta = true } = {}) {
  if (!a) return '';
  const pta = withPta ? ` (PTA ${a.pta} dB HL)` : '';
  if (a.type === 'normal') return `Hearing sensitivity within normal limits${pta}`;
  const degree = a.degreeText;
  if (a.type === 'unknown') return `${degree} hearing loss${pta}; type to be confirmed (bone conduction not recorded)`;
  const config = a.config ? ` with a ${a.config} configuration` : '';
  return `${degree} ${a.type} hearing loss${config}${pta}`;
}

const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);

// The per-ear and overall provisional diagnosis lines.
export function diagnosisLines(right, left) {
  const out = { right: describeEar(right), left: describeEar(left), both: '' };
  if (!right && !left) return out;
  if (!right || !left) {
    const [ear, a] = right ? ['right', right] : ['left', left];
    out.both = `${a.type === 'normal' ? 'Hearing sensitivity within normal limits' : `${a.degreeText} ${a.type === 'unknown' ? '' : `${a.type} `}hearing loss`} in the ${ear} ear; ${ear === 'right' ? 'left' : 'right'} ear not tested`;
    return out;
  }
  if (right.type === 'normal' && left.type === 'normal') {
    out.both = 'Bilateral hearing sensitivity within normal limits';
    return out;
  }
  const short = (a) => `${lower(a.degreeText)}${a.type === 'unknown' ? '' : ` ${a.type}`} hearing loss`;
  if (right.type === 'normal' || left.type === 'normal') {
    const [ear, a] = right.type === 'normal' ? ['left', left] : ['right', right];
    out.both = `Unilateral ${short(a)} (${ear} ear); ${ear === 'right' ? 'left' : 'right'} ear within normal limits`;
    return out;
  }
  const asym = Math.abs(right.pta - left.pta) >= 15;
  if (!asym && right.degree === left.degree && right.type === left.type) {
    const config = right.config && right.config === left.config ? `, ${right.config} configuration` : '';
    out.both = `Bilateral ${short(right)}${config}`;
    return out;
  }
  out.both = `${asym ? 'Asymmetric bilateral' : 'Bilateral'} hearing loss: ${short(right)} in the right ear and ${short(left)} in the left ear`;
  return out;
}

// ---------- tuning fork tests ----------

export const TUNING_FORK_FREQS = [['256', '256 Hz'], ['512', '512 Hz'], ['1024', '1024 Hz']];
export const RINNE_RESULTS = [['positive', 'Positive (AC > BC)'], ['negative', 'Negative (BC > AC)'], ['equal', 'Equivocal (AC = BC)']];
export const WEBER_RESULTS = [['midline', 'Centralised (midline)'], ['right', 'Lateralised to right ear'], ['left', 'Lateralised to left ear']];
export const ABC_RESULTS = [['normal', 'Normal (same as examiner)'], ['reduced', 'Reduced']];
export const TUNING_FORK_FIELDS = ['freq', 'rinne_r', 'rinne_l', 'weber', 'abc_r', 'abc_l', 'note'];

// A stored value is an option id; older reports may hold free text, which is shown as typed.
export function optionText(options, value) {
  const v = String(value ?? '').trim();
  if (!v) return '';
  const hit = options.find(([id]) => id === v);
  return hit ? hit[1] : v;
}

// Older reports stored tuning forks as a table: [[Rinne R, Rinne L], [Weber R, Weber L], [ABC R, ABC L]].
export function tuningForkFrom(value) {
  const blank = Object.fromEntries(TUNING_FORK_FIELDS.map((k) => [k, '']));
  if (Array.isArray(value)) {
    const cell = (r, c) => String(value[r]?.[c] ?? '').trim();
    const weber = [cell(1, 0) && `Right: ${cell(1, 0)}`, cell(1, 1) && `Left: ${cell(1, 1)}`].filter(Boolean).join('; ');
    return { ...blank, rinne_r: cell(0, 0), rinne_l: cell(0, 1), weber, abc_r: cell(2, 0), abc_l: cell(2, 1) };
  }
  const v = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(TUNING_FORK_FIELDS.map((k) => [k, String(v[k] ?? '').slice(0, k === 'note' ? 600 : 120)]));
}

export function hasTuningFork(tf) {
  return !!tf && ['rinne_r', 'rinne_l', 'weber', 'abc_r', 'abc_l', 'note'].some((k) => String(tf[k] ?? '').trim());
}

// What the Weber and Rinne pattern points to (classical interpretation), or ''.
export function interpretTuningFork(tf) {
  if (!tf) return '';
  const { weber, rinne_r: rr, rinne_l: rl, abc_r: ar, abc_l: al } = tf;
  const notes = [];
  if (weber === 'right' || weber === 'left') {
    const same = weber === 'right' ? rr : rl;
    const other = weber === 'right' ? rl : rr;
    const otherEar = weber === 'right' ? 'left' : 'right';
    if (same === 'negative') notes.push(`a conductive component in the ${weber} ear`);
    else if (same === 'positive' && other === 'positive') notes.push(`a sensorineural hearing loss in the ${otherEar} ear`);
  } else if (weber === 'midline') {
    if (rr === 'positive' && rl === 'positive') notes.push('normal hearing or a symmetrical sensorineural hearing loss');
    else if (rr === 'negative' && rl === 'negative') notes.push('a bilateral conductive component');
  }
  if (ar === 'reduced' || al === 'reduced') {
    const ears = ar === 'reduced' && al === 'reduced' ? 'both ears' : `the ${ar === 'reduced' ? 'right' : 'left'} ear`;
    notes.push(`reduced cochlear reserve in ${ears} (reduced ABC)`);
  }
  return notes.join(', and ');
}

export function tuningForkSentence(tf) {
  if (!hasTuningFork(tf)) return '';
  const parts = [];
  if (tf.weber) parts.push(`Weber ${lower(optionText(WEBER_RESULTS, tf.weber))}`);
  if (tf.rinne_r || tf.rinne_l) {
    const r = (v) => lower(optionText(RINNE_RESULTS, v)).replace(/\s*\(.*\)$/, '');
    parts.push(`Rinne ${[tf.rinne_r && `${r(tf.rinne_r)} on the right`, tf.rinne_l && `${r(tf.rinne_l)} on the left`].filter(Boolean).join(' and ')}`);
  }
  if (!parts.length) return '';
  const why = interpretTuningFork(tf);
  return `Tuning fork tests${tf.freq ? ` (${tf.freq} Hz)` : ''}: ${parts.join('; ')}${why ? `, consistent with ${why}` : ''}.`;
}

// ---------- audiometric Weber ----------

export const AUDIO_WEBER_FREQS = [250, 500, 1000, 2000, 4000];
export const AUDIO_WEBER_RESULTS = [['midline', 'Midline'], ['right', 'Right'], ['left', 'Left']];

export function audioWeberFrom(value) {
  const v = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const ids = AUDIO_WEBER_RESULTS.map(([id]) => id);
  const out = {};
  for (const f of AUDIO_WEBER_FREQS) if (ids.includes(v[f])) out[f] = v[f];
  const note = String(v.note ?? '').trim().slice(0, 600);
  if (note) out.note = note;
  return out;
}

export function hasAudioWeber(v) {
  return !!v && (AUDIO_WEBER_FREQS.some((f) => v[f]) || !!String(v.note ?? '').trim());
}

const freqList = (fs) => {
  const t = fs.map((f) => String(f));
  return `${t.length > 1 ? `${t.slice(0, -1).join(', ')} and ${t.at(-1)}` : t[0]} Hz`;
};

// "Audiometric Weber lateralised to the right ear at 250, 500 and 1000 Hz; midline at 2000 Hz."
export function audioWeberSentence(v) {
  if (!hasAudioWeber(v)) return '';
  const groups = AUDIO_WEBER_RESULTS.map(([id]) => [id, AUDIO_WEBER_FREQS.filter((f) => v[f] === id)]).filter(([, fs]) => fs.length)
    .sort((x, y) => x[1][0] - y[1][0]); // in frequency order
  if (!groups.length) return '';
  const phrase = (id, fs) => `${id === 'midline' ? 'midline' : `lateralised to the ${id} ear`} at ${freqList(fs)}`;
  return `Audiometric Weber ${groups.map(([id, fs]) => phrase(id, fs)).join('; ')}.`;
}
