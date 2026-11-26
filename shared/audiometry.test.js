// node --test shared/audiometry.test.js
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  analyseEar,
  audioWeberSentence,
  configurationOf,
  describeEar,
  diagnosisLines,
  interpretTuningFork,
  parseThreshold,
  ptaAverage,
  tuningForkFrom,
  tuningForkSentence,
} from './audiometry.js';
import { blankReport, cleanReportData, reportAsText, suggestAudiology, template } from './reports.js';

test('threshold cells: masked, no response, plain', () => {
  assert.deepEqual(parseThreshold('45'), { db: 45 });
  assert.deepEqual(parseThreshold('45m'), { db: 45, masked: true });
  assert.deepEqual(parseThreshold(' 110 NR '), { db: 110, nr: true });
  assert.deepEqual(parseThreshold('NR'), { nr: true });
  assert.deepEqual(parseThreshold('-10'), { db: -10 });
  assert.deepEqual(parseThreshold('abc'), {});
  assert.equal(ptaAverage({ 500: '40M', 1000: '45', 2000: '50', 4000: '60m' }), 48.8);
  assert.equal(ptaAverage({ 500: '40', 1000: '45', 2000: '50', 4000: '110NR' }), null);
});

test('type of loss from the air-bone gap', () => {
  const ac = { 250: '30', 500: '40', 1000: '45', 2000: '50', 4000: '60', 8000: '70' };
  const snhl = analyseEar(ac, { 250: '25', 500: '35', 1000: '40', 2000: '45', 4000: '55' });
  assert.equal(snhl.type, 'sensorineural');
  assert.equal(snhl.degree, 'moderate');
  assert.equal(snhl.config, 'sloping');
  assert.equal(describeEar(snhl), 'Moderate sensorineural hearing loss with a sloping configuration (PTA 48.8 dB HL)');
  const chl = analyseEar({ 250: '45', 500: '45', 1000: '40', 2000: '40', 4000: '45', 8000: '45' }, { 500: '10', 1000: '10', 2000: '15', 4000: '15' });
  assert.equal(chl.type, 'conductive');
  assert.equal(chl.config, 'flat');
  const mixed = analyseEar({ 500: '70', 1000: '70', 2000: '75', 4000: '80' }, { 500: '40', 1000: '40', 2000: '45', 4000: '50' });
  assert.equal(mixed.type, 'mixed');
  assert.equal(analyseEar({ 500: '10', 1000: '10', 2000: '15', 4000: '15' }, {}).type, 'normal');
  assert.equal(analyseEar({ 500: '40', 1000: '45', 2000: '50', 4000: '60' }, {}).type, 'unknown');
});

test('configuration of the audiogram', () => {
  assert.equal(configurationOf({ 250: '15', 500: '15', 1000: '20', 2000: '20', 4000: '55', 8000: '25' }), 'notched at 4 kHz');
  assert.equal(configurationOf({ 250: '60', 500: '55', 1000: '40', 2000: '30', 4000: '25', 8000: '25' }), 'rising');
  assert.equal(configurationOf({ 250: '20', 500: '20', 1000: '25', 2000: '60', 4000: '75', 8000: '80' }), 'precipitously sloping');
  assert.equal(configurationOf({ 250: '20', 500: '25', 1000: '45', 2000: '45', 4000: '25', 8000: '20' }), 'trough-shaped (cookie-bite)');
  assert.equal(configurationOf({ 500: '20', 1000: '25' }), null);
});

test('overall diagnosis line', () => {
  const mod = analyseEar({ 500: '40', 1000: '45', 2000: '50', 4000: '60' }, { 500: '35', 1000: '40', 2000: '45', 4000: '55' });
  const nor = analyseEar({ 500: '10', 1000: '10', 2000: '15', 4000: '15' }, {});
  assert.match(diagnosisLines(mod, mod).both, /^Bilateral moderate sensorineural hearing loss/);
  assert.equal(diagnosisLines(nor, nor).both, 'Bilateral hearing sensitivity within normal limits');
  assert.equal(diagnosisLines(nor, mod).both, 'Unilateral moderate sensorineural hearing loss (left ear); right ear within normal limits');
  const sev = analyseEar({ 500: '75', 1000: '80', 2000: '80', 4000: '85' }, { 500: '70', 1000: '75', 2000: '75', 4000: '80' });
  assert.match(diagnosisLines(mod, sev).both, /^Asymmetric bilateral hearing loss: moderate sensorineural .* severe sensorineural/);
});

test('tuning forks: interpretation and old table data', () => {
  assert.equal(interpretTuningFork({ weber: 'right', rinne_r: 'negative', rinne_l: 'positive' }), 'a conductive component in the right ear');
  assert.equal(interpretTuningFork({ weber: 'right', rinne_r: 'positive', rinne_l: 'positive' }), 'a sensorineural hearing loss in the left ear');
  assert.match(tuningForkSentence({ freq: '512', weber: 'left', rinne_r: 'positive', rinne_l: 'negative' }), /^Tuning fork tests \(512 Hz\): Weber lateralised to left ear; Rinne positive on the right and negative on the left, consistent with a conductive component in the left ear\.$/);
  const old = tuningForkFrom([['+ve', '-ve'], ['', 'Lateralised'], ['Normal', '']]);
  assert.equal(old.rinne_r, '+ve');
  assert.equal(old.weber, 'Left: Lateralised');
  assert.equal(old.abc_r, 'Normal');
});

test('audiometric Weber sentence', () => {
  assert.equal(audioWeberSentence({ 250: 'right', 500: 'right', 1000: 'right', 2000: 'midline' }),
    'Audiometric Weber lateralised to the right ear at 250, 500 and 1000 Hz; midline at 2000 Hz.');
  assert.equal(audioWeberSentence({}), '');
});

test('report: new sections are cleaned, sent to the AI as text, and drive the suggestion', () => {
  const t = template('aud_eval');
  const data = blankReport(t);
  data.included = ['audiogram', 'tuningfork', 'audio_weber'];
  data.audiogram.ac_r = { 250: '30', 500: '40', 1000: '45', 2000: '50', 4000: '60', 8000: '70' };
  data.audiogram.bc_r = { 500: '35', 1000: '40', 2000: '45', 4000: '55' };
  data.audiogram.ac_l = { 250: '10', 500: '10', 1000: '10', 2000: '15', 4000: '15', 8000: '20' };
  data.tuningfork = { freq: '512', weber: 'left', rinne_r: 'positive', rinne_l: 'positive', junk: 'x' };
  data.audio_weber = { 250: 'left', 500: 'left', 1000: 'sideways', note: 'Bone vibrator on forehead' };
  const clean = cleanReportData(t, data);
  assert.equal(clean.tuningfork.junk, undefined);
  assert.deepEqual(clean.audio_weber, { 250: 'left', 500: 'left', note: 'Bone vibrator on forehead' });
  const txt = reportAsText(t, clean);
  assert.match(txt, /Weber: Lateralised to left ear/);
  assert.match(txt, /Audiometric Weber lateralised to the left ear at 250 and 500 Hz/);
  const s = suggestAudiology(t, clean);
  assert.equal(s.diagnosis.right, 'Moderate sensorineural hearing loss with a sloping configuration (PTA 48.8 dB HL)');
  assert.equal(s.diagnosis.left, 'Hearing sensitivity within normal limits (PTA 12.5 dB HL)');
  assert.match(s.diagnosis.both, /^Unilateral moderate sensorineural hearing loss \(right ear\)/);
  assert.match(s.impression, /^Pure-tone audiometry indicates moderate sensorineural hearing loss .* in the right ear, and hearing sensitivity within normal limits .* in the left ear\. Tuning fork tests \(512 Hz\)/);
  assert.match(s.impression, /consistent with a sensorineural hearing loss in the right ear/);
});

test('without the audiogram, the PTA in the core table gives the degree', () => {
  const t = template('aud_eval');
  const data = blankReport(t);
  data.pta_speech[0] = ['48', '12'];
  const s = suggestAudiology(t, cleanReportData(t, data));
  assert.equal(s.diagnosis.right, 'Moderate hearing loss (PTA 48 dB HL); type to be confirmed (bone conduction not recorded)');
  assert.equal(s.diagnosis.left, 'Hearing sensitivity within normal limits (PTA 12 dB HL)');
});
