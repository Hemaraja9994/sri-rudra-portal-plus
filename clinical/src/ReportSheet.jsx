import React from 'react';

import {
  AUDIOGRAM_FREQS,
  AUDIOGRAM_ROWS,
  CASE_FIELDS,
  CLINIC,
  dmy,
  hasAudioWeber,
  hasTuningFork,
  isIncluded,
  protocolFor,
  ptaAverage,
  degreeLabel,
  earAnalysis,
} from '../../shared/reports.js';
import AudiogramPair, { SymbolKey } from './AudiogramChart.jsx';
import { AudioWeberView, AudiometricSummary, CRITERIA_NOTE, TuningForkView } from './AudiometryParts.jsx';

// Sections printed as a highlighted conclusion box.
const KEY_SECTIONS = new Set(['impression', 'diagnosis']);

// The printable A4 report. Hidden on screen (see clinical.css @media print); window.print() shows it.
// Laid out to read well in colour and in black & white: ear symbols differ in shape, the left-ear
// line is dashed, and nothing depends on colour alone.
export default function ReportSheet({ tpl, report, data, patient }) {
  const caseRows = CASE_FIELDS.filter(([k]) => String(data.case?.[k] || '').trim());
  const sections = tpl.sections.filter((s) => isIncluded(tpl, data, s.key) && hasContent(s, data[s.key]));
  const analysis = tpl.sections.some((s) => s.kind === 'audiogram') ? earAnalysis(tpl, data) : null;
  return (
    <div className="clin-print" aria-hidden="true">
      <article className="rsheet rsheet--report">
        <header className="rsheet__head">
          <img className="rsheet__logo" src="/__srr/logo.jpg" alt="" />
          <div className="rsheet__id">
            <h1>{CLINIC.name}</h1>
            <div className="rsheet__svc">{CLINIC.services.join(' · ')}</div>
            <div className="rsheet__contact">
              {CLINIC.address.join(' ')}<br />
              {CLINIC.phone} · {CLINIC.web} · {CLINIC.hours}
            </div>
          </div>
        </header>
        <div className="rsheet__rule" />

        <div className="rsheet__band">
          <h2 className="rsheet__title">{report.title}</h2>
          <dl className="rsheet__refs">
            <div><dt>Report no.</dt><dd>{report.report_no || '—'}</dd></div>
            <div><dt>Date</dt><dd>{dmy(report.report_date)}</dd></div>
            {report.valid_until && <div><dt>Valid until</dt><dd>{dmy(report.valid_until)}</dd></div>}
            {patient?.reg_no && <div><dt>Reg. no.</dt><dd>{patient.reg_no}</dd></div>}
          </dl>
        </div>

        {caseRows.length > 0 && (
          <section className="rsheet__patient" aria-label="Patient details">
            {caseRows.map(([k, label]) => (
              <div key={k} className="rsheet__pf"><span>{label}</span><b>{data.case[k]}</b></div>
            ))}
          </section>
        )}

        {sections.map((s, n) => (
          <section key={s.key} className={`rsheet__sec ${KEY_SECTIONS.has(s.key) ? 'rsheet__sec--key' : ''} rsheet__sec--${s.kind}`}>
            <h3><span className="rsheet__num">{String(n + 1).padStart(2, '0')}</span>{s.title}</h3>
            <SectionView section={s} value={data[s.key]} analysis={analysis} />
          </section>
        ))}

        <div className="rsheet__sign">
          <div className="rsheet__signmeta">
            <div><span>Date</span><b>{dmy(report.report_date)}</b></div>
            <div><span>Place</span><b>Visakhapatnam</b></div>
          </div>
          <div className="rsheet__signline">
            <div className="rsheet__signspace" />
            <b>{report.clinician || ''}</b>
            {report.qualification && <span>{report.qualification}</span>}
            {report.rci_no && <span>RCI Reg. No. {report.rci_no}</span>}
          </div>
        </div>
        <footer className="rsheet__foot">
          This report is based on the tests recorded above on the date of evaluation and should be read together with the clinical history.
          The provisional diagnosis is subject to medical (ENT) correlation. Valid for medical and rehabilitative purposes only; not for medico-legal use.
        </footer>
      </article>
    </div>
  );
}

function hasContent(section, value) {
  switch (section.kind) {
    case 'fields': return value && Object.values(value).some((v) => String(v || '').trim());
    case 'table': case 'freetable': return Array.isArray(value) && value.some((r) => r.some((c) => String(c || '').trim()));
    case 'audiogram': return value && AUDIOGRAM_ROWS.some(([k]) => value[k] && Object.values(value[k]).some((v) => String(v || '').trim()));
    case 'tuningfork': return hasTuningFork(value);
    case 'audioweber': return hasAudioWeber(value);
    case 'list': case 'protocol': return Array.isArray(value) && value.length > 0;
    default: return String(value || '').trim().length > 0;
  }
}

function SectionView({ section, value, analysis }) {
  if (section.kind === 'fields') {
    return (
      <table className="rsheet__fields"><tbody>
        {section.fields.filter(([k]) => String(value?.[k] || '').trim()).map(([k, label]) => (
          <tr key={k}><th>{label}</th><td>{value[k]}</td></tr>
        ))}
      </tbody></table>
    );
  }
  if (section.kind === 'table') {
    const rows = section.rows.map((r, i) => [r, section.columns.map((_, j) => value?.[i]?.[j] || '')]).filter(([, cells]) => cells.some((c) => String(c).trim()));
    if (!rows.length) return null;
    return (
      <table className="rsheet__table">
        <thead><tr><th /> {section.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>{rows.map(([r, cells]) => <tr key={r}><th>{r}</th>{cells.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    );
  }
  if (section.kind === 'freetable') {
    const rows = (value || []).filter((r) => r.some((c) => String(c).trim()));
    return (
      <table className="rsheet__table">
        <thead><tr>{section.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    );
  }
  if (section.kind === 'audiogram') {
    const showRows = AUDIOGRAM_ROWS.filter(([rk]) => Object.values(value?.[rk] || {}).some((v) => String(v || '').trim()));
    return (
      <>
        <div className="rsheet__plots"><AudiogramPair value={value} /></div>
        <div className="rsheet__keyrow"><SymbolKey /></div>
        <table className="rsheet__table rsheet__audiogram">
          <thead><tr><th>Threshold (dB HL)</th>{AUDIOGRAM_FREQS.map((f) => <th key={f}>{f >= 1000 ? `${f / 1000}k` : f} Hz</th>)}<th>PTA</th></tr></thead>
          <tbody>
            {showRows.map(([rk, label]) => {
              const row = value?.[rk] || {};
              const pta = ptaAverage(row);
              return (
                <tr key={rk} className={rk.endsWith('_r') ? 'ear-r' : 'ear-l'}><th>{label}</th>
                  {AUDIOGRAM_FREQS.map((f) => <td key={f}>{row[f] ?? ''}</td>)}
                  <td>{pta !== null ? `${pta} (${degreeLabel(pta)})` : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {analysis && (analysis.right || analysis.left) && (
          <>
            <h4 className="rsheet__subhead">Audiometric summary</h4>
            <AudiometricSummary right={analysis.right} left={analysis.left} print />
            <p className="rsheet__note">{CRITERIA_NOTE} M = masked threshold; NR = no response.</p>
          </>
        )}
      </>
    );
  }
  if (section.kind === 'tuningfork') return <TuningForkView value={value} />;
  if (section.kind === 'audioweber') return <AudioWeberView value={value} />;
  if (section.kind === 'list') {
    return section.numbered
      ? <ol className="rsheet__list rsheet__list--num">{(value || []).map((i, n) => <li key={n}>{i}</li>)}</ol>
      : <ul className="rsheet__list">{(value || []).map((i, n) => <li key={n}>{i}</li>)}</ul>;
  }
  if (section.kind === 'protocol') {
    const proto = protocolFor(section.protocol);
    const ticked = new Set(value || []);
    const labels = proto ? proto.groups.flatMap((g) => g.steps).filter(([id]) => ticked.has(id)) : [];
    return <p className="rsheet__proto">Assessment carried out as per standard protocol: {labels.map(([, l]) => l).join('; ')}.</p>;
  }
  return <p className="rsheet__text">{value}</p>;
}
