import React from 'react';

import {
  ABC_RESULTS,
  AIR_BONE_GAP_DB,
  AUDIO_WEBER_FREQS,
  AUDIO_WEBER_RESULTS,
  BC_NORMAL_MAX_DB,
  RINNE_RESULTS,
  TUNING_FORK_FREQS,
  WEBER_RESULTS,
  audioWeberSentence,
  hasAudioWeber,
  hasTuningFork,
  optionText,
  tuningForkSentence,
} from '../../shared/audiometry.js';

const freqLabel = (f) => (f >= 1000 ? `${f / 1000}k` : `${f}`);

// A select that also shows a value typed in an older report (free text), so nothing is lost.
function OptSelect({ value, options, onChange, disabled, placeholder = '—', label }) {
  const v = String(value ?? '');
  const opts = v && !options.some(([id]) => id === v) ? [...options, [v, v]] : options;
  return (
    <select value={v} disabled={disabled} aria-label={label} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {opts.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
    </select>
  );
}

// ---------- editor: tuning fork tests ----------

export function TuningForkEditor({ value, disabled, onChange }) {
  const tf = value || {};
  const set = (k) => (v) => onChange({ ...tf, [k]: v });
  const sentence = tuningForkSentence(tf);
  return (
    <div className="clin-tf">
      <div className="clin-tf__fork">
        <span>Fork frequency</span>
        <div className="clin-seg2" role="radiogroup" aria-label="Fork frequency">
          {TUNING_FORK_FREQS.map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={tf.freq === id} disabled={disabled}
              className={tf.freq === id ? 'is-on' : ''} onClick={() => set('freq')(tf.freq === id ? '' : id)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="clin-tablewrap">
        <table className="clin-etable clin-tf__table">
          <thead><tr><th>Test</th><th>Right ear</th><th>Left ear</th></tr></thead>
          <tbody>
            <tr>
              <th scope="row">Rinne</th>
              <td><OptSelect label="Rinne right" value={tf.rinne_r} options={RINNE_RESULTS} disabled={disabled} onChange={set('rinne_r')} /></td>
              <td><OptSelect label="Rinne left" value={tf.rinne_l} options={RINNE_RESULTS} disabled={disabled} onChange={set('rinne_l')} /></td>
            </tr>
            <tr>
              <th scope="row">Weber</th>
              <td colSpan={2}><OptSelect label="Weber" value={tf.weber} options={WEBER_RESULTS} disabled={disabled} onChange={set('weber')} /></td>
            </tr>
            <tr>
              <th scope="row">Absolute bone conduction (ABC)</th>
              <td><OptSelect label="ABC right" value={tf.abc_r} options={ABC_RESULTS} disabled={disabled} onChange={set('abc_r')} /></td>
              <td><OptSelect label="ABC left" value={tf.abc_l} options={ABC_RESULTS} disabled={disabled} onChange={set('abc_l')} /></td>
            </tr>
          </tbody>
        </table>
      </div>
      <label className="field field--wide">
        <span>Remarks</span>
        <input value={tf.note || ''} disabled={disabled} onChange={(e) => set('note')(e.target.value)} placeholder="Optional, e.g. Bing test, Schwabach, patient reliability" />
      </label>
      {sentence && <p className="clin-readout"><b>Reading:</b> {sentence}</p>}
    </div>
  );
}

// ---------- editor: audiometric Weber ----------

export function AudioWeberEditor({ value, disabled, onChange }) {
  const v = value || {};
  const set = (f, id) => {
    const next = { ...v };
    if (id) next[f] = id; else delete next[f];
    onChange(next);
  };
  const sentence = audioWeberSentence(v);
  return (
    <div className="clin-aw">
      <div className="clin-tablewrap">
        <table className="clin-etable clin-aw__table">
          <thead><tr><th>Heard in</th>{AUDIO_WEBER_FREQS.map((f) => <th key={f}>{freqLabel(f)} Hz</th>)}</tr></thead>
          <tbody>
            {AUDIO_WEBER_RESULTS.map(([id, label]) => (
              <tr key={id}>
                <th scope="row">{label}</th>
                {AUDIO_WEBER_FREQS.map((f) => (
                  <td key={f} className="clin-aw__cell">
                    <button type="button" disabled={disabled} aria-pressed={v[f] === id} aria-label={`${f} Hz: ${label}`}
                      className={`clin-aw__pick ${v[f] === id ? 'is-on' : ''}`} onClick={() => set(f, v[f] === id ? '' : id)}>
                      {v[f] === id ? '●' : ''}
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <label className="field field--wide">
        <span>Remarks</span>
        <input value={v.note || ''} disabled={disabled} onChange={(e) => onChange({ ...v, note: e.target.value })} placeholder="Optional, e.g. presentation level, masking" />
      </label>
      {sentence && <p className="clin-readout"><b>Reading:</b> {sentence}</p>}
    </div>
  );
}

// ---------- audiometric summary (editor and printed report) ----------

const TYPE_TEXT = { normal: 'Within normal limits', sensorineural: 'Sensorineural', conductive: 'Conductive', mixed: 'Mixed', unknown: 'Needs BC' };

export function AudiometricSummary({ right, left, print = false }) {
  if (!right && !left) return null;
  const rows = [['Right', right, 'r'], ['Left', left, 'l']];
  const cell = (x, suffix = '') => (x === null || x === undefined ? '—' : `${x}${suffix}`);
  return (
    <table className={print ? 'rsheet__table rsheet__summary' : 'clin-etable clin-summary'}>
      <thead>
        <tr><th>Ear</th><th>AC PTA (dB HL)</th><th>Degree (Clark, 1981)</th><th>BC PTA (dB HL)</th><th>Mean air-bone gap</th><th>Type</th><th>Configuration</th></tr>
      </thead>
      <tbody>
        {rows.map(([label, a, k]) => (
          <tr key={k} className={`ear-${k}`}>
            <th scope="row">{label}</th>
            {a ? (
              <>
                <td>{a.pta}</td>
                <td>{a.degreeText}</td>
                <td>{cell(a.bcPta)}</td>
                <td>{cell(a.abg, ' dB')}</td>
                <td>{TYPE_TEXT[a.type]}</td>
                <td>{a.config ? a.config.charAt(0).toUpperCase() + a.config.slice(1) : '—'}</td>
              </>
            ) : <td colSpan={6} className="muted">Not tested</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export const CRITERIA_NOTE = `PTA = mean of 500, 1000, 2000 and 4000 Hz; degree after Clark (1981). Type: mean air-bone gap ≥ ${AIR_BONE_GAP_DB} dB is a conductive component (conductive if bone conduction ≤ ${BC_NORMAL_MAX_DB} dB HL, otherwise mixed).`;

// ---------- printed report: tuning forks and audiometric Weber ----------

export function TuningForkView({ value }) {
  const tf = value || {};
  if (!hasTuningFork(tf)) return null;
  const t = (opts, v) => optionText(opts, v) || '—';
  const sentence = tuningForkSentence(tf);
  return (
    <>
      <table className="rsheet__table rsheet__tf">
        <thead><tr><th>Test{tf.freq ? ` (${tf.freq} Hz)` : ''}</th><th>Right ear</th><th>Left ear</th></tr></thead>
        <tbody>
          {(tf.rinne_r || tf.rinne_l) && <tr><th>Rinne</th><td>{t(RINNE_RESULTS, tf.rinne_r)}</td><td>{t(RINNE_RESULTS, tf.rinne_l)}</td></tr>}
          {tf.weber && <tr><th>Weber</th><td colSpan={2} className="rsheet__center">{t(WEBER_RESULTS, tf.weber)}</td></tr>}
          {(tf.abc_r || tf.abc_l) && <tr><th>Absolute bone conduction</th><td>{t(ABC_RESULTS, tf.abc_r)}</td><td>{t(ABC_RESULTS, tf.abc_l)}</td></tr>}
        </tbody>
      </table>
      {(sentence || tf.note) && <p className="rsheet__note">{[sentence, tf.note].filter(Boolean).join(' ')}</p>}
    </>
  );
}

export function AudioWeberView({ value }) {
  const v = value || {};
  if (!hasAudioWeber(v)) return null;
  const freqs = AUDIO_WEBER_FREQS;
  const sentence = audioWeberSentence(v);
  return (
    <>
      <table className="rsheet__table rsheet__aw">
        <thead><tr><th>Frequency</th>{freqs.map((f) => <th key={f}>{freqLabel(f)} Hz</th>)}</tr></thead>
        <tbody>
          <tr><th>Lateralised to</th>{freqs.map((f) => <td key={f} className={v[f] ? `aw-${v[f]}` : ''}>{optionText(AUDIO_WEBER_RESULTS, v[f]) || '—'}</td>)}</tr>
        </tbody>
      </table>
      {(sentence || v.note) && <p className="rsheet__note">{[sentence, v.note].filter(Boolean).join(' ')}</p>}
    </>
  );
}
