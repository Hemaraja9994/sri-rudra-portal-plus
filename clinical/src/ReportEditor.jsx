import React, { useEffect, useRef, useState } from 'react';

import { DIVISIONS, labelOf, prettyDate } from '../../shared/clinical.js';
import {
  AUDIOGRAM_FREQS,
  AUDIOGRAM_ROWS,
  CASE_FIELDS,
  CLINIC,
  degreeLabel,
  protocolFor,
  ptaAverage,
  suggestAudiology,
  template,
} from '../../shared/reports.js';
import { api, linkTo, navigate } from './api.js';
import AudiogramPair, { SymbolKey } from './AudiogramChart.jsx';
import { AudioWeberEditor, AudiometricSummary, CRITERIA_NOTE, TuningForkEditor } from './AudiometryParts.jsx';
import ReportSheet from './ReportSheet.jsx';
import { AsyncButton, Icon, Input, Notice, Select, TextArea } from './ui.jsx';

// The report editor: fill in the sections, switch optional tests on or off, let the AI draft the
// narrative parts, then mark the report final and print it. Nothing is saved until Save is pressed.
export default function ReportEditor({ divisionId, id, session }) {
  const [state, setState] = useState(null); // { report, patient }
  const [data, setData] = useState(null);
  const [head, setHead] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const aiUsed = useRef(false);

  useEffect(() => {
    api(`/reports/${id}`).then((d) => {
      setState(d);
      setData(d.report.data);
      setHead({
        report_no: d.report.report_no || '', title: d.report.title || '', report_date: d.report.report_date,
        valid_until: d.report.valid_until || '', clinician: d.report.clinician || session.user.full_name || '',
        qualification: d.report.qualification || '', rci_no: d.report.rci_no || '',
      });
    }).catch((e) => setError(e.message));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error && !state) return <><Back divisionId={divisionId} /><Notice>{error}</Notice></>;
  if (!state || !data) return <><Back divisionId={divisionId} /><div className="empty">Loading…</div></>;

  const { report, patient } = state;
  const tpl = template(report.template);
  const isFinal = report.status === 'final';
  const included = new Set(data.included || []);
  const setField = (fn) => { setData((d) => { const next = structuredClone(d); fn(next); return next; }); setDirty(true); };
  const setHeadField = (k) => (v) => { setHead((h) => ({ ...h, [k]: v })); setDirty(true); };

  function toggle(key, on) {
    setField((d) => {
      const set = new Set(d.included || []);
      if (on) set.add(key); else set.delete(key);
      d.included = [...set];
    });
  }

  async function save(nextStatus) {
    setSaving(true);
    setError('');
    setMsg('');
    try {
      const body = { ...head, data, ai_used: aiUsed.current };
      if (nextStatus) body.status = nextStatus;
      const res = await api(`/reports/${id}`, { method: 'PATCH', body });
      setState((s) => ({ ...s, report: res.report }));
      setData(res.report.data);
      setDirty(false);
      aiUsed.current = false;
      setMsg(nextStatus === 'final' ? 'Report marked final.' : nextStatus === 'draft' ? 'Report reopened for editing.' : 'Saved.');
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  }

  async function draft(keys) {
    setError('');
    const res = await api(`/reports/${id}/ai`, { method: 'POST', body: { sections: keys, data } });
    aiUsed.current = true;
    setField((d) => { for (const [k, v] of Object.entries(res.drafts)) d[k] = v; });
    setMsg('AI draft added — please read and edit it.');
  }

  // Audiology: diagnosis and impression suggested from the thresholds and tests (editable).
  const suggestion = tpl.id === 'aud_eval' ? suggestAudiology(tpl, data) : null;
  const aiKeys = tpl.sections.filter((s) => s.ai && (!s.optional || included.has(s.key))).map((s) => s.key);

  return (
    <>
      <Back divisionId={divisionId} patient={patient} />
      <div className="head clin-rhead">
        <div>
          <h1>{head.title}</h1>
          <div className="sub clin-idline">
            <span>{patient.name}</span>
            {patient.reg_no && <span>{patient.reg_no}</span>}
            <span>{report.report_no}</span>
            <span className={`tag ${isFinal ? 'tag--ok' : ''}`}>{isFinal ? 'Final' : 'Draft'}</span>
            {dirty && <span className="muted">unsaved changes</span>}
          </div>
        </div>
        <div className="head__actions">
          {aiKeys.length > 0 && !isFinal && (
            <AsyncButton className="btn btn--secondary" busyLabel="Drafting…" onClick={() => draft(aiKeys)} title="Draft the impression, diagnosis and recommendations">
              <Icon name="ai" size={16} />Draft with AI
            </AsyncButton>
          )}
          <button type="button" className="btn btn--secondary" onClick={() => window.print()}><Icon name="printer" size={16} />Print / PDF</button>
          {isFinal
            ? <AsyncButton className="btn btn--secondary" busyLabel="…" onClick={() => save('draft')}><Icon name="undo" size={16} />Reopen</AsyncButton>
            : <AsyncButton className="btn btn--primary" busyLabel="Saving…" onClick={() => save()}><Icon name="save" size={16} />Save</AsyncButton>}
        </div>
      </div>

      <Notice>{error}</Notice>
      {msg && <Notice kind="ok">{msg}</Notice>}
      {isFinal && <Notice kind="warn">This report is final. Reopen it to make changes.</Notice>}

      <fieldset className="card clin-rfields" disabled={isFinal}>
        <div className="grid3">
          <Field label="Report number"><Input value={head.report_no} onChange={setHeadField('report_no')} /></Field>
          <Field label="Report date"><Input type="date" value={head.report_date} onChange={setHeadField('report_date')} /></Field>
          <Field label="Valid until"><Input type="date" value={head.valid_until} onChange={setHeadField('valid_until')} /></Field>
        </div>
        <div className="clin-rcase grid3">
          {CASE_FIELDS.map(([k, label]) => (
            <Field key={k} label={label}><Input value={data.case?.[k] || ''} onChange={(v) => setField((d) => { d.case = { ...d.case, [k]: v }; })} /></Field>
          ))}
        </div>
      </fieldset>

      <div className="clin-sections">
        {tpl.sections.map((s) => (
          <SectionEditor key={s.key} section={s} data={data} included={included} disabled={isFinal}
            onToggle={toggle} onChange={setField} onDraft={s.ai ? () => draft([s.key]) : null}
            suggestion={suggestion && ['diagnosis', 'impression'].includes(s.key) ? suggestion : null}
            analysis={suggestion && s.kind === 'audiogram' ? suggestion : null} />
        ))}
      </div>

      <fieldset className="card clin-rfields clin-rsign" disabled={isFinal}>
        <legend>Signed by</legend>
        <div className="grid3">
          <Field label="Clinician"><Input value={head.clinician} onChange={setHeadField('clinician')} /></Field>
          <Field label="Qualification"><Input value={head.qualification} onChange={setHeadField('qualification')} placeholder="e.g. MASLP, Audiologist & SLP" /></Field>
          <Field label="RCI registration no."><Input value={head.rci_no} onChange={setHeadField('rci_no')} /></Field>
        </div>
      </fieldset>

      <div className="clin-rfoot">
        {!isFinal && (
          <>
            <AsyncButton className="btn btn--primary" busyLabel="Saving…" onClick={() => save()}><Icon name="save" size={16} />Save report</AsyncButton>
            <AsyncButton className="btn btn--secondary" busyLabel="…" onClick={() => save('final')} disabled={dirty} title={dirty ? 'Save first' : 'Mark the report final'}><Icon name="check" size={16} />Mark final</AsyncButton>
          </>
        )}
        {(session.user.canManageUsers || (report.created_by === session.user.id && !isFinal)) && (
          <button type="button" className="btn btn--danger btn--ghost" onClick={async () => {
            if (!window.confirm('Delete this report?')) return;
            try { await api(`/reports/${id}`, { method: 'DELETE' }); navigate(`/clinical/${patient.division}/patients/${patient.id}`); } catch (e) { setError(e.message); }
          }}><Icon name="trash" size={16} />Delete</button>
        )}
      </div>

      {/* Hidden on screen; shown when printing. */}
      <ReportSheet tpl={tpl} report={{ ...report, ...head }} data={data} patient={patient} />
    </>
  );
}

function Back({ divisionId, patient }) {
  const to = patient ? `/clinical/${patient.division}/patients/${patient.id}` : `/clinical/${divisionId}`;
  return <a className="clin-back" {...linkTo(to)}><Icon name="back" size={18} />{patient ? patient.name : `${DIVISIONS[divisionId].label} caseload`}</a>;
}

function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

// Renders one section for editing, by kind.
function SectionEditor({ section, data, included, disabled, onToggle, onChange, onDraft, suggestion, analysis }) {
  const on = !section.optional || included.has(section.key);
  const value = data[section.key];

  const header = (
    <div className="clin-sec__head">
      <h3>{section.title}</h3>
      <div className="clin-sec__tools">
        {onDraft && on && !disabled && <AsyncButton className="btn btn--ghost btn--sm" busyLabel="Drafting…" onClick={onDraft}><Icon name="ai" size={15} />Draft</AsyncButton>}
        {section.optional && (
          <label className="clin-switch2">
            <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => onToggle(section.key, e.target.checked)} />
            <span>{on ? 'Included' : 'Add'}</span>
          </label>
        )}
      </div>
    </div>
  );

  if (section.optional && !on) {
    return <section className="card clin-sec clin-sec--off">{header}</section>;
  }

  return (
    <section className="card clin-sec">
      {header}
      {section.hint && <p className="clin-sec__hint">{section.hint}</p>}
      {suggestion && <Suggestion section={section} suggestion={suggestion} value={value} disabled={disabled} onChange={onChange} />}
      <div className="clin-sec__body">
        {section.kind === 'fields' && (
          <div className="clin-fieldgrid">
            {section.fields.map(([k, label, type]) => (
              <label key={k} className={`field ${type === 'textarea' ? 'field--wide' : ''}`}>
                <span>{label}</span>
                {type === 'textarea'
                  ? <TextArea value={value?.[k] || ''} onChange={(v) => onChange((d) => { d[section.key] = { ...d[section.key], [k]: v }; })} rows={2} disabled={disabled} />
                  : <Input value={value?.[k] || ''} onChange={(v) => onChange((d) => { d[section.key] = { ...d[section.key], [k]: v }; })} disabled={disabled} />}
              </label>
            ))}
          </div>
        )}

        {section.kind === 'table' && (
          <div className="clin-tablewrap">
            <table className="clin-etable">
              <thead><tr><th /> {section.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>
                {section.rows.map((row, ri) => (
                  <tr key={row}>
                    <th scope="row">{row}</th>
                    {section.columns.map((c, ci) => (
                      <td key={c}><Input value={value?.[ri]?.[ci] || ''} disabled={disabled}
                        onChange={(v) => onChange((d) => { const t = d[section.key].map((r) => r.slice()); t[ri][ci] = v; d[section.key] = t; })} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {section.kind === 'freetable' && (
          <FreeTable section={section} value={value} disabled={disabled} onChange={onChange} />
        )}

        {section.kind === 'audiogram' && (
          <Audiogram section={section} value={value} disabled={disabled} onChange={onChange} analysis={analysis} />
        )}

        {section.kind === 'tuningfork' && (
          <TuningForkEditor value={value} disabled={disabled} onChange={(v) => onChange((d) => { d[section.key] = v; })} />
        )}

        {section.kind === 'audioweber' && (
          <AudioWeberEditor value={value} disabled={disabled} onChange={(v) => onChange((d) => { d[section.key] = v; })} />
        )}

        {section.kind === 'narrative' && (
          <TextArea value={value || ''} onChange={(v) => onChange((d) => { d[section.key] = v; })} rows={4} disabled={disabled} placeholder="Type here, or use Draft to let the AI write a first version you can edit." />
        )}

        {section.kind === 'list' && (
          <TextArea value={(Array.isArray(value) ? value : []).join('\n')} rows={4} disabled={disabled}
            onChange={(v) => onChange((d) => { d[section.key] = v.split('\n').map((x) => x.trim()).filter(Boolean); })}
            placeholder="One per line." />
        )}

        {section.kind === 'protocol' && (
          <Protocol section={section} value={value} disabled={disabled} onChange={onChange} />
        )}
      </div>
    </section>
  );
}

function FreeTable({ section, value, disabled, onChange }) {
  const rows = Array.isArray(value) && value.length ? value : [section.columns.map(() => '')];
  return (
    <div className="clin-tablewrap">
      <table className="clin-etable">
        <thead><tr>{section.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {section.columns.map((c, ci) => (
                <td key={c}><Input value={row[ci] || ''} disabled={disabled}
                  onChange={(v) => onChange((d) => { const t = (d[section.key] || []).map((r) => r.slice()); while (t.length <= ri) t.push(section.columns.map(() => '')); t[ri][ci] = v; d[section.key] = t; })} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!disabled && <button type="button" className="btn btn--ghost btn--sm" onClick={() => onChange((d) => { d[section.key] = [...(d[section.key] || rows), section.columns.map(() => '')]; })}><Icon name="plus" size={14} />Add row</button>}
    </div>
  );
}

function Audiogram({ section, value, disabled, onChange, analysis }) {
  const set = (rowKey, freq, v) => onChange((d) => { d[section.key] = { ...d[section.key], [rowKey]: { ...(d[section.key]?.[rowKey] || {}), [freq]: v } }; });
  return (
    <div className="clin-tablewrap">
      <table className="clin-etable clin-audiogram">
        <thead><tr><th>dB HL</th>{AUDIOGRAM_FREQS.map((f) => <th key={f}>{f >= 1000 ? `${f / 1000}k` : f}</th>)}<th>PTA</th></tr></thead>
        <tbody>
          {AUDIOGRAM_ROWS.map(([rk, label]) => {
            const row = value?.[rk] || {};
            const pta = ptaAverage(row);
            const isAir = rk.startsWith('ac');
            return (
              <tr key={rk}>
                <th scope="row">{label}</th>
                {AUDIOGRAM_FREQS.map((f) => (
                  <td key={f}><input className="clin-dbcell" autoCapitalize="characters" spellCheck={false} value={row[f] ?? ''} disabled={disabled} onChange={(e) => set(rk, f, e.target.value)} /></td>
                ))}
                <td className="clin-pta">{isAir && pta !== null ? <span title={degreeLabel(pta)}>{pta}</span> : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <AudiogramPair value={value} />
      <SymbolKey />
      {analysis && (analysis.right || analysis.left) && (
        <div className="clin-tablewrap clin-summarywrap">
          <h4 className="clin-subhead">Audiometric summary</h4>
          <AudiometricSummary right={analysis.right} left={analysis.left} />
          <p className="clin-sec__hint">{CRITERIA_NOTE}</p>
        </div>
      )}
    </div>
  );
}

function Protocol({ section, value, disabled, onChange }) {
  const proto = protocolFor(section.protocol);
  const ticked = new Set(Array.isArray(value) ? value : []);
  const toggle = (sid, on) => onChange((d) => { const set = new Set(d[section.key] || []); if (on) set.add(sid); else set.delete(sid); d[section.key] = [...set]; });
  if (!proto) return null;
  return (
    <div className="clin-protocol">
      {proto.groups.map((g) => (
        <div key={g.label} className="clin-protocol__group">
          <h4>{g.label}</h4>
          {g.steps.map(([sid, label]) => (
            <label key={sid} className="clin-check">
              <input type="checkbox" checked={ticked.has(sid)} disabled={disabled} onChange={(e) => toggle(sid, e.target.checked)} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}

// The suggestion worked out from the thresholds and tests, with buttons to put it into the section.
// The clinician can then edit the text freely; nothing is filled in without a click.
function Suggestion({ section, suggestion, value, disabled, onChange }) {
  const isFields = section.kind === 'fields';
  const lines = isFields
    ? section.fields.map(([k, label]) => [k, label, suggestion.diagnosis[k] || '']).filter(([, , t]) => t)
    : (suggestion.impression ? [['impression', '', suggestion.impression]] : []);
  if (!lines.length) {
    return <div className="clin-suggest clin-suggest--empty">Enter the audiogram thresholds (or the PTA in the core table) to get a suggested {isFields ? 'diagnosis' : 'impression'}.</div>;
  }
  const current = isFields ? value || {} : { impression: value || '' };
  const filled = lines.some(([k]) => String(current[k] || '').trim());
  const differs = lines.some(([k, , t]) => String(current[k] || '').trim() !== t);
  const put = (onlyEmpty) => onChange((d) => {
    if (!isFields) { d[section.key] = lines[0][2]; return; }
    const next = { ...d[section.key] };
    for (const [k, , t] of lines) if (!onlyEmpty || !String(next[k] || '').trim()) next[k] = t;
    d[section.key] = next;
  });
  return (
    <div className="clin-suggest">
      <div className="clin-suggest__head"><Icon name="chart" size={15} /><span>Suggested from the test results</span></div>
      {isFields
        ? <dl className="clin-suggest__lines">{lines.map(([k, label, t]) => <React.Fragment key={k}><dt>{label}</dt><dd>{t}</dd></React.Fragment>)}</dl>
        : <p className="clin-suggest__text">{lines[0][2]}</p>}
      {!disabled && differs && (
        <div className="clin-suggest__tools">
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => {
            if (filled && !window.confirm('Replace what is written now with the suggestion?')) return;
            put(false);
          }}><Icon name="check" size={14} />{filled ? 'Replace with suggestion' : 'Use suggestion'}</button>
          {isFields && filled && lines.some(([k]) => !String(current[k] || '').trim()) && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => put(true)}><Icon name="plus" size={14} />Fill empty fields only</button>
          )}
          <span className="clin-suggest__note">You can edit the text after using it.</span>
        </div>
      )}
    </div>
  );
}
