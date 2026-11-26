// node --test shared/documents.test.js
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUDIOGRAM_ROWS,
  PROTOCOLS,
  TEMPLATES,
  addMonths,
  blankReport,
  cleanReportData,
  degreeFor,
  isIncluded,
  optionalKeys,
  protocolSteps,
  ptaAverage,
  reportAsText,
  reportNo,
  template,
  templatesFor,
  validityFor,
} from './reports.js';
import {
  checkpoints,
  cleanPlan,
  cleanProgress,
  defaultPlanTitle,
  normalizePlanInput,
  scheduleLine,
  sessionDates,
  weeksFor,
} from './plans.js';

const KINDS = ['fields', 'table', 'freetable', 'audiogram', 'tuningfork', 'audioweber', 'narrative', 'list', 'protocol'];

test('every template is well formed', () => {
  assert.deepEqual(templatesFor('audiology').map((t) => t.id), ['aud_eval']);
  assert.deepEqual(templatesFor('slp').map((t) => t.id), ['slp_voice', 'slp_fluency', 'slp_child', 'slp_adult']);
  for (const t of TEMPLATES) {
    const keys = t.sections.map((s) => s.key);
    assert.equal(new Set(keys).size, keys.length, `${t.id}: section keys must be unique`);
    assert.ok(!keys.includes('case') && !keys.includes('header_date') && !keys.includes('included'), `${t.id}: reserved key used`);
    assert.ok(/^[A-Z]{2,3}$/.test(t.code), `${t.id}: code`);
    for (const s of t.sections) {
      assert.ok(KINDS.includes(s.kind), `${t.id}.${s.key}: kind ${s.kind}`);
      if (s.ai) assert.ok(['narrative', 'list'].includes(s.kind), `${t.id}.${s.key}: AI only drafts text`);
      if (s.kind === 'table') assert.ok(s.rows.length && s.columns.length, `${t.id}.${s.key}: table shape`);
      if (s.kind === 'fields') assert.ok(s.fields.every((f) => f[0] && f[1]), `${t.id}.${s.key}: fields`);
      if (s.kind === 'protocol') assert.ok(PROTOCOLS[s.protocol], `${t.id}.${s.key}: protocol ${s.protocol}`);
    }
    for (const must of ['diagnosis', 'recommendations', 'referral']) assert.ok(keys.includes(must), `${t.id} has ${must}`);
  }
});

test('impression is editable, diagnosis is separate, recommendations are their own list', () => {
  const t = template('aud_eval');
  assert.equal(t.sections.find((s) => s.key === 'impression').kind, 'narrative'); // editable, AI-draftable
  assert.equal(t.sections.find((s) => s.key === 'recommendations').kind, 'list');
  // AI may draft the impression and recommendations, but not the per-ear diagnosis (clinician writes it)
  const ai = TEMPLATES.find((x) => x.id === 'aud_eval').sections.filter((s) => s.ai).map((s) => s.key);
  assert.ok(ai.includes('impression') && ai.includes('recommendations'));
  assert.ok(!ai.includes('diagnosis'));
});

test('optional sections are off until added, and ASHA protocols are disorder-wise', () => {
  const t = template('aud_eval');
  const data = blankReport(t);
  assert.deepEqual(data.included, []);
  assert.equal(isIncluded(t, data, 'pta_speech'), true); // core
  assert.equal(isIncluded(t, data, 'oae'), false);       // optional, not added yet

  // protocol: only valid ticked steps are kept, and they reach the report text
  const voice = template('slp_voice');
  const vd = blankReport(voice);
  vd.included = ['protocol'];
  vd.protocol = ['perceptual', 'acoustic', 'not_a_step'];
  const vc = cleanReportData(voice, vd);
  assert.deepEqual(vc.protocol, ['perceptual', 'acoustic']);
  assert.match(reportAsText(voice, vc), /Auditory-perceptual evaluation/);
  // every SLP template points at a protocol that exists, and child/adult are grouped by disorder
  assert.equal(PROTOCOLS.slp_child.groups.length, 3);
  assert.equal(PROTOCOLS.slp_adult.groups.length, 3);
  assert.ok(protocolSteps('slp_adult').some(([, l]) => /aspiration/i.test(l)));
});

test('voice template follows the clinic sample', () => {
  const t = template('slp_voice');
  const habits = t.sections.find((s) => s.key === 'habits');
  assert.equal(habits.rows.length, 10);
  assert.deepEqual(t.sections.find((s) => s.key === 'grbas').rows.map((r) => r.trim()[0]), ['G', 'R', 'B', 'A', 'S']);
  assert.equal(t.headerDate, 'Date of ENT examination');
});

test('report data is cleaned to the template shape', () => {
  const t = template('slp_voice');
  const blank = blankReport(t, { name: 'Test Patient', age_gender: '55 years / Male' });
  assert.equal(blank.case.name, 'Test Patient');
  assert.equal(blank.habits.length, 10);
  const dirty = { ...blank, grbas: [['2', 'Moderate', 'extra'], ['x']], unknown: 'drop me', complaints: 'Hoarseness\n\n Throat pain ', header_date: 'nope' };
  const clean = cleanReportData(t, dirty);
  assert.equal(clean.unknown, undefined);
  assert.equal(clean.grbas.length, 5);
  assert.deepEqual(clean.grbas[0], ['2', 'Moderate']);
  assert.deepEqual(clean.grbas[1], ['x', '']);
  assert.deepEqual(clean.complaints, ['Hoarseness', 'Throat pain']);
  assert.equal(clean.header_date, '');
});

test('PTA average and Clark (1981) degree', () => {
  assert.equal(ptaAverage({ 500: '40', 1000: '45', 2000: '50', 4000: '60' }), 48.8);
  assert.equal(ptaAverage({ 500: '40', 1000: '45', 2000: '50' }), null);
  assert.equal(ptaAverage({ 500: 'NR', 1000: '45', 2000: '50', 4000: '60' }), null);
  const cases = [[15, 'normal'], [16, 'minimal'], [25, 'minimal'], [26, 'mild'], [40, 'mild'], [41, 'moderate'], [55, 'moderate'], [56, 'mod_severe'], [70, 'mod_severe'], [71, 'severe'], [90, 'severe'], [91, 'profound']];
  for (const [pta, degree] of cases) assert.equal(degreeFor(pta), degree, `PTA ${pta}`);
  assert.equal(degreeFor(null), null);
});

test('detailed audiogram reaches the AI as text with PTA and degree', () => {
  const t = template('aud_eval');
  const data = blankReport(t);
  data.included = ['audiogram']; // the detailed grid is an optional section
  data.audiogram.ac_r = { 250: '30', 500: '40', 1000: '45', 2000: '50', 4000: '60', 8000: '70' };
  const txt = reportAsText(t, data);
  assert.match(txt, /AC Right: 250 Hz 30, .*PTA 48\.8 dB HL, Moderate\)/);
  assert.equal(AUDIOGRAM_ROWS.length, 4);
});

test('audiology template matches the clinic reports', () => {
  const t = template('aud_eval');
  const keys = t.sections.map((s) => s.key);
  // the clinic's core result table and per-ear impressions/diagnosis
  assert.ok(keys.includes('pta_speech'), 'PTA/SRT/SDS table');
  assert.equal(t.sections.find((s) => s.key === 'pta_speech').optional, undefined); // always in
  assert.equal(t.sections.find((s) => s.key === 'immittance').kind, 'fields');
  assert.equal(t.sections.find((s) => s.key === 'diagnosis').kind, 'fields'); // per-ear, clinician-written
  // the extra tests the clinic runs, all optional and editable
  for (const k of ['oae', 'abr', 'assr', 'vemp', 'tinnitus', 'electro']) {
    assert.ok(keys.includes(k), `has ${k}`);
    assert.ok(optionalKeys(t).includes(k), `${k} is optional`);
  }
  // a BERA report: just that section plus the per-ear diagnosis
  const data = blankReport(t);
  data.included = ['abr'];
  data.abr = { protocol: 'Click, 21.1/sec, rarefaction, under sedation', right: 'Peak V to 40 dB nHL, good morphology', right_threshold: '25–30 dB HL', left: '', left_threshold: '' };
  data.diagnosis = { right: 'Mild hearing loss', left: 'Severe to profound hearing loss', both: '' };
  const clean = cleanReportData(t, data);
  const txt = reportAsText(t, clean);
  assert.match(txt, /Right ear — findings: Peak V to 40 dB nHL/);
  assert.match(txt, /Right ear: Mild hearing loss/);
  assert.doesNotMatch(reportAsText(t, clean), /Otoacoustic emissions/); // OAE not included
});

test('report numbers and validity (sample: 18/09/2026 valid to 18/03/2027)', () => {
  assert.equal(reportNo('VT', 3, '2026-11-13'), 'SRC/VT/3/Nov/2026');
  assert.equal(validityFor('2026-09-18'), '2027-03-18');
  assert.equal(addMonths('2026-08-31', 6), '2027-02-28');
  assert.equal(addMonths('2026-12-15', 1), '2027-01-15');
});

test('plan schedule (sample: 12 sessions, 45 min, twice weekly for 6 weeks)', () => {
  assert.equal(weeksFor(12, 2), 6);
  assert.equal(scheduleLine({ minutes: 45, per_week: 2, sessions_count: 12 }), '45 minutes per session • Twice weekly for 6 weeks');
  assert.deepEqual(checkpoints(12), [1, 6, 12]);
  assert.deepEqual(checkpoints(1), [1]);
  assert.deepEqual(checkpoints(2), [1, 2]);
  assert.deepEqual(sessionDates('2026-11-16', 4, 2), ['2026-11-16', '2026-11-19', '2026-11-23', '2026-11-26']);
  assert.equal(defaultPlanTitle(12, 'Voice disorder'), '12-session voice disorder therapy plan');
});

test('a plan from the AI is kept in shape', () => {
  const messy = {
    framework: { intro: 'An eclectic physiological programme is recommended:', points: ['Vocal hygiene', '', 'SOVT'] },
    goals: 'Reduce GRBAS grade\nIncrease MPD',
    sessions: [{ n: 2, title: 'Respiratory support and SOVT', goals: ['Eight abdominal breaths'] }, { n: 99, title: 'out of range' }],
    measures: ['GRBAS G/R/B/A/S', 'MPD /a/ (best of 3, seconds)'],
  };
  const p = cleanPlan(messy, 3);
  assert.equal(p.sessions.length, 3);
  assert.equal(p.sessions[0].title, '');
  assert.equal(p.sessions[1].title, 'Respiratory support and SOVT');
  assert.deepEqual(p.framework.points, ['Vocal hygiene', 'SOVT']);
  assert.deepEqual(p.goals, ['Reduce GRBAS grade', 'Increase MPD']);
  const prog = cleanProgress({ done: { 1: { date: '2026-11-16', note: 'Baseline done' }, 9: { date: 'x' } }, values: { MPD: { s1: '8', s6: '11' } } }, 3);
  assert.deepEqual(Object.keys(prog.done), ['1']);
  assert.equal(prog.values.MPD.s6, '11');
});

test('plan input is checked', () => {
  assert.throws(() => normalizePlanInput({ title: 'x', sessions_count: 0 }), /1 and 40/);
  assert.throws(() => normalizePlanInput({ title: '', sessions_count: 12 }), /title/);
  assert.throws(() => normalizePlanInput({ title: 'x', sessions_count: 12, per_week: 4 }), /how often/);
  assert.deepEqual(normalizePlanInput({ title: '12-session plan', sessions_count: '12', minutes: '45', per_week: '2', start_date: '2026-11-16' }),
    { title: '12-session plan', sessions_count: 12, minutes: 45, per_week: 2, start_date: '2026-11-16', focus: null });
});
