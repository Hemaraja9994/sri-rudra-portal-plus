// Diagnostic report templates for the Audiology and SLP dashboards, modelled on the clinic's own
// voice evaluation report (letterhead, file number, validity, sections, tables, recommendations).
// Plain JavaScript with no imports from the browser or Workers, so it also runs under `node --test`.
//
// A template is a list of sections. Section kinds:
//   fields     label/value rows                          data[key] = { fieldKey: text }
//   table      fixed row labels x columns               data[key] = [[cell, cell], ...]  (one array per row)
//   freetable  clinician adds rows (first column typed)  data[key] = [[cell, cell, ...], ...]
//   audiogram  pure-tone thresholds, PTA worked out      data[key] = { ac_r: {250: '20', 500: '45M', ...}, ... }
//   tuningfork Rinne / Weber / ABC with fork frequency      data[key] = { freq, rinne_r, rinne_l, weber, abc_r, abc_l, note }
//   audioweber audiometric Weber, result per frequency     data[key] = { 250: 'right', 500: 'midline', ..., note }
//   narrative  paragraph text (AI can draft)             data[key] = 'text'
//   list       one item per line (AI can draft)          data[key] = ['item', ...]
//   protocol   a standard-of-care checklist (ASHA)       data[key] = ['step id', ...]  (ticked steps)
//
// A section marked `optional: true` can be left out of a report: the clinician includes only the
// tests that were done. data.included is the set of optional section keys that are in the report.

import { addDays, isIsoDate } from './clinical.js';
import {
  AUDIOGRAM_FREQS,
  AUDIOGRAM_ROWS,
  analyseEar,
  audioWeberFrom,
  audioWeberSentence,
  degreeFor,
  degreeLabel,
  describeEar,
  diagnosisLines,
  hasAudioWeber,
  hasThresholds,
  hasTuningFork,
  optionText,
  ptaAverage,
  RINNE_RESULTS,
  ABC_RESULTS,
  WEBER_RESULTS,
  tuningForkFrom,
  tuningForkSentence,
} from './audiometry.js';

export { AUDIOGRAM_FREQS, AUDIOGRAM_ROWS, degreeFor, degreeLabel, ptaAverage };

// Letterhead, exactly as on the clinic's printed reports.
export const CLINIC = {
  name: 'Sri Rudra Speech & Hearing Clinic',
  services: ['Audiology', 'Hearing Aids', 'Speech-Language Pathology', 'Voice Therapy'],
  address: ['Flat No. 211 & 212, HIG-207/4, Second Floor, Bhavana Heights,', 'Beside Kotak Mahindra Bank, MVP Double Road, Visakhapatnam – 530017'],
  web: 'www.srirudraspeechandhearing.com',
  phone: '+91 70320 54275',
  hours: 'Mon–Sat 10 AM–9 PM',
  short: 'Sri Rudra Clinic',
  prefix: 'SRC',
};

// ---------- sections shared by every template ----------

export const CASE_FIELDS = [
  ['name', 'Case name'],
  ['age_gender', 'Age / Gender'],
  ['hospital_mr', 'Hospital / MR No.'],
  ['contact', 'Residence / Contact'],
  ['eval_date', 'Date of evaluation'],
  ['languages', 'Languages'],
];

const referral = { key: 'referral', title: 'Referral information', kind: 'fields', optional: true, fields: [['source', 'Referral source'], ['informant', 'Informant'], ['reason', 'Reason for referral', 'textarea']] };
const background = { key: 'background', title: 'Background information', kind: 'narrative', optional: true, ai: true, hint: 'Who the patient is, why they came, and the history in two or three sentences.' };
const complaints = { key: 'complaints', title: 'Brief complaint', kind: 'list', ai: true, hint: 'One complaint per line.' };
const diagnosis = { key: 'diagnosis', title: 'Provisional diagnosis', kind: 'narrative', ai: true };
const recommendations = { key: 'recommendations', title: 'Recommendations', kind: 'list', numbered: true, ai: true, hint: 'One recommendation per line. Common: ENT review, HAT & fitting, follow-up.' };
// Audiology reports give the provisional diagnosis per ear, as the clinic writes it.
const audDiagnosis = { key: 'diagnosis', title: 'Provisional diagnosis', kind: 'fields', fields: [['right', 'Right ear', 'textarea'], ['left', 'Left ear', 'textarea'], ['both', 'Both ears / overall', 'textarea']] };
const RL = ['Right', 'Left'];

// ---------- the templates ----------

export const TEMPLATES = [
  {
    id: 'aud_eval',
    division: 'audiology',
    code: 'AUD',
    name: 'Audiological evaluation',
    title: 'Audiological Evaluation Report',
    headerDate: 'Date of testing',
    // The common reports follow the clinic's own layout; the detailed, standards-based sections
    // (full audiogram with masking per BSA, ABR descriptors, VEMP, tinnitus matching) are optional.
    sections: [
      referral,
      background,
      complaints,
      { key: 'history', title: 'Case history', kind: 'fields', optional: true, fields: [
        ['onset', 'Onset'], ['duration', 'Duration'], ['ears', 'Ear(s) affected'], ['tinnitus', 'Tinnitus'],
        ['vertigo', 'Vertigo / imbalance'], ['discharge', 'Ear discharge / pain'], ['noise', 'Noise exposure'],
        ['family', 'Family history'], ['medical', 'Medical history'], ['aids', 'Hearing aid use'],
      ] },
      { key: 'otoscopy', title: 'Otoscopic examination', kind: 'table', optional: true, columns: ['Findings'], rows: ['Right ear', 'Left ear'] },
      { key: 'tuningfork', title: 'Tuning fork tests', kind: 'tuningfork', optional: true, hint: 'Rinne, Weber and absolute bone conduction (ABC) with the fork frequency used.' },
      // Core result table, exactly as the clinic reports it.
      { key: 'pta_speech', title: 'Pure-tone & speech audiometry', kind: 'table', columns: RL, rows: ['PTA (dB HL)', 'SRT (dB HL)', 'SDS (%)'] },
      { key: 'audiogram', title: 'Pure-tone audiogram', kind: 'audiogram', optional: true, hint: 'Air and bone thresholds in dB HL. Type M after a masked threshold (45M), NR for no response (or 110NR). PTA is the average of 500, 1000, 2000 and 4000 Hz; degree follows Clark (1981).' },
      { key: 'audio_weber', title: 'Audiometric Weber test', kind: 'audioweber', optional: true, hint: 'Bone vibrator on the forehead; where the tone is heard at each frequency.' },
      { key: 'pta_notes', title: 'Audiogram interpretation', kind: 'narrative', optional: true, ai: true, hint: 'Type, degree and configuration of loss per ear; masking used (BSA descriptors).' },
      // Immittance as the clinic writes it: an impression per ear. Detailed values are optional.
      { key: 'immittance', title: 'Immittance audiometry', kind: 'fields', fields: [
        ['right', 'Right ear impression', 'textarea'], ['left', 'Left ear impression', 'textarea'],
      ], hint: 'e.g. "A"-type tympanogram with ipsilateral reflexes absent, suggestive of normal middle-ear function.' },
      { key: 'immittance_values', title: 'Immittance — detailed values', kind: 'table', optional: true, columns: RL, rows: ['Tympanogram type', 'Peak pressure (daPa)', 'Static compliance (ml)', 'Ear canal volume (ml)', 'Ipsilateral reflexes', 'Contralateral reflexes'] },
      { key: 'oae', title: 'Otoacoustic emissions (OAE)', kind: 'fields', optional: true, fields: [
        ['right', 'Right ear', 'textarea'], ['left', 'Left ear', 'textarea'],
      ], hint: 'e.g. Diagnostic DPOAEs present, suggestive of normal outer-hair-cell function.' },
      { key: 'abr', title: 'Auditory brainstem response (ABR / BERA)', kind: 'fields', optional: true, fields: [
        ['protocol', 'Protocol (stimulus, rate, polarity, state)'],
        ['right', 'Right ear — findings', 'textarea'], ['right_threshold', 'Right ear — estimated threshold'],
        ['left', 'Left ear — findings', 'textarea'], ['left_threshold', 'Left ear — estimated threshold'],
      ] },
      { key: 'assr', title: 'Auditory steady-state response (ASSR)', kind: 'table', optional: true, columns: ['500 Hz', '1000 Hz', '2000 Hz', '4000 Hz'], rows: ['Right ear (dB HL)', 'Left ear (dB HL)'] },
      { key: 'vemp', title: 'Vestibular evoked myogenic potentials (VEMP)', kind: 'fields', optional: true, fields: [
        ['protocol', 'Protocol (cVEMP / oVEMP, stimulus, rate)'],
        ['right', 'Right ear — findings', 'textarea'], ['left', 'Left ear — findings', 'textarea'],
        ['right_impression', 'Right ear — impression'], ['left_impression', 'Left ear — impression'],
      ] },
      { key: 'tinnitus', title: 'Tinnitus evaluation', kind: 'table', optional: true, columns: RL, rows: [
        'Pitch matching', 'Loudness matching', 'Masker stimulus', 'Masker loudness', 'Residual inhibition', 'Tinnitus type',
      ] },
      { key: 'electro', title: 'Other electrophysiology', kind: 'table', optional: true, columns: ['Findings'], rows: ['Electrocochleography (ECochG)', 'Cortical / late latency response (LLR / P300)', 'Acoustic reflex decay'] },
      { key: 'protocol', title: 'Assessment protocol (ASHA / BSA)', kind: 'protocol', optional: true, protocol: 'aud_eval' },
      { key: 'impression', title: 'Audiological impression', kind: 'narrative', ai: true, hint: 'Overall impression; you can edit the auto-impression freely.' },
      audDiagnosis,
      recommendations,
    ],
  },
  {
    id: 'slp_voice',
    division: 'slp',
    code: 'VT',
    name: 'Voice evaluation',
    title: 'Voice Evaluation Report',
    headerDate: 'Date of ENT examination',
    sections: [
      referral,
      background,
      complaints,
      { key: 'history', title: 'Brief history', kind: 'fields', fields: [
        ['onset', 'Onset of the problem'], ['nature', 'Nature of the problem'], ['noticed', 'When the problem was first noticed'],
        ['pain', 'Throat pain while speaking / swallowing'], ['day_change', 'Voice change during the day'], ['neck', 'Pain in the neck'],
        ['emotion', 'Voice change during emotional overlay'], ['occupation', 'Occupation and daily vocal load'],
      ] },
      { key: 'medical', title: 'Medical history and findings', kind: 'narrative', ai: true },
      { key: 'habits', title: 'Vocal and non-vocal habits', kind: 'table', columns: ['Status'], rows: [
        'Talking in a noisy environment', 'Excessive speaking', 'Shouting / screaming / yelling', 'Coughing', 'Whispering',
        'Clearing throat', 'Caffeine consumption', 'Amount of water intake', 'Intake of spicy food / skipping meals', 'Smoking / passive smoking / alcohol',
      ] },
      { key: 'larynx', title: 'Laryngological findings', kind: 'table', columns: ['Finding as recorded'], rows: [
        'Vocal fold mobility', 'False vocal folds', 'Mucosal lesions', 'Glottic closure', 'Arytenoid position', 'ENT impression',
      ] },
      { key: 'larynx_reading', title: 'Clinical reading for therapy', kind: 'narrative', ai: true },
      { key: 'profile', title: 'Voice profile', kind: 'table', columns: ['Observation'], rows: ['Pitch', 'Loudness', 'Quality', 'Pitch breaks', 'Voice breaks', 'Vocal fatigue'] },
      { key: 'grbas', title: 'Perceptual evaluation (GRBAS)', kind: 'table', columns: ['Score (0–3)', 'Comment'], rows: ['G  Grade', 'R  Roughness', 'B  Breathiness', 'A  Asthenia', 'S  Strain'] },
      { key: 'capev', title: 'CAPE-V', kind: 'table', columns: ['mm (0–100)', 'Consistent / intermittent', 'Note'], rows: ['Overall severity', 'Roughness', 'Breathiness', 'Strain', 'Pitch', 'Loudness', 'Resonance'] },
      { key: 'measures', title: 'Clinical voice measures', kind: 'table', columns: ['Value', 'Remarks'], rows: [
        'MPD /a/ (s)', 'MPD /i/ (s)', 'MPD /u/ (s)', 's/z ratio', 'Mean F0 (Hz)', 'Jitter (%)', 'Shimmer (%)', 'HNR (dB)', 'VHI-30 total',
      ] },
      { key: 'imaging', title: 'Visual imaging', kind: 'narrative', optional: true },
      { key: 'observations', title: 'Informal observations', kind: 'list' },
      { key: 'protocol', title: 'Assessment protocol (ASHA)', kind: 'protocol', optional: true, protocol: 'slp_voice' },
      diagnosis,
      recommendations,
    ],
  },
  {
    id: 'slp_fluency',
    division: 'slp',
    code: 'FL',
    name: 'Fluency evaluation',
    title: 'Fluency Evaluation Report',
    sections: [
      referral,
      background,
      complaints,
      { key: 'history', title: 'History', kind: 'fields', fields: [
        ['onset_age', 'Age at onset'], ['onset_type', 'Onset (gradual / sudden)'], ['family', 'Family history of stuttering'],
        ['course', 'Course since onset'], ['situations', 'Difficult speaking situations'], ['avoidance', 'Word or situation avoidance'],
        ['previous', 'Previous therapy'], ['languages', 'Languages spoken'],
      ] },
      { key: 'sample', title: 'Speech sample analysis', kind: 'table', columns: ['%SS', 'Main disfluency types', 'Notes'], rows: ['Conversation', 'Reading', 'Monologue'] },
      { key: 'ssi', title: 'Stuttering Severity Instrument (SSI-4)', kind: 'table', columns: ['Score'], rows: ['Frequency', 'Duration', 'Physical concomitants', 'Total score', 'Severity'] },
      { key: 'secondary', title: 'Secondary behaviours', kind: 'list' },
      { key: 'attitude', title: 'Attitudes and feelings', kind: 'fields', fields: [['tool', 'Measure used (e.g. S-24, OASES)'], ['score', 'Score'], ['impression', 'Impression', 'textarea']] },
      { key: 'rate', title: 'Rate of speech', kind: 'fields', fields: [['spm', 'Speech rate (syllables per minute)'], ['ar', 'Articulatory rate']] },
      { key: 'other', title: 'Speech, language and voice', kind: 'narrative' },
      { key: 'protocol', title: 'Assessment protocol (ASHA)', kind: 'protocol', optional: true, protocol: 'slp_fluency' },
      diagnosis,
      recommendations,
    ],
  },
  {
    id: 'slp_child',
    division: 'slp',
    code: 'CSL',
    name: 'Child speech and language evaluation',
    title: 'Speech and Language Evaluation Report',
    sections: [
      referral,
      background,
      complaints,
      { key: 'development', title: 'Birth and developmental history', kind: 'fields', fields: [
        ['prenatal', 'Prenatal'], ['natal', 'Natal'], ['postnatal', 'Postnatal'], ['motor', 'Motor milestones'],
        ['speech', 'Speech and language milestones'], ['medical', 'Medical history'], ['hearing', 'Hearing status / screening'],
      ] },
      { key: 'ope', title: 'Oral peripheral mechanism examination', kind: 'table', columns: ['Structure', 'Function'], rows: ['Lips', 'Tongue', 'Teeth', 'Hard palate', 'Soft palate', 'Diadochokinetic rate'] },
      { key: 'language', title: 'Language assessment', kind: 'table', columns: ['Test / method', 'Findings', 'Language age'], rows: ['Receptive language', 'Expressive language', 'Pragmatics / social communication', 'Play and cognition'] },
      { key: 'artic', title: 'Speech sound assessment', kind: 'freetable', columns: ['Sound / pattern', 'Initial', 'Medial', 'Final', 'Error type'], minRows: 4 },
      { key: 'tests', title: 'Standardised tests used', kind: 'fields', fields: [['used', 'Tests (e.g. REELS, 3D-LAT, ALD, articulation test)', 'textarea'], ['scores', 'Scores and age equivalents', 'textarea']] },
      { key: 'autism', title: 'Autism / social communication screening', kind: 'fields', optional: true, fields: [['tool', 'Tool (e.g. ISAA, INCLEN, M-CHAT)'], ['score', 'Score'], ['impression', 'Impression', 'textarea']] },
      { key: 'protocol', title: 'Assessment protocol (ASHA)', kind: 'protocol', optional: true, protocol: 'slp_child' },
      { key: 'impression', title: 'Clinical impression', kind: 'narrative', ai: true },
      diagnosis,
      recommendations,
    ],
  },
  {
    id: 'slp_adult',
    division: 'slp',
    code: 'NC',
    name: 'Adult: aphasia, dysarthria and swallowing',
    title: 'Adult Communication and Swallowing Evaluation Report',
    sections: [
      referral,
      background,
      complaints,
      { key: 'medical', title: 'Medical history', kind: 'fields', fields: [
        ['condition', 'Diagnosis / event (e.g. stroke)'], ['onset', 'Date of onset'], ['site', 'Lesion site / imaging'],
        ['comorbid', 'Co-morbidities'], ['medication', 'Current medication'], ['feeding', 'Current feeding (oral / tube)'], ['trach', 'Tracheostomy'],
      ] },
      { key: 'cognition', title: 'Cognitive-communication screening', kind: 'narrative' },
      { key: 'aphasia_test', title: 'Language (aphasia) assessment', kind: 'fields', fields: [['test', 'Test used (e.g. WAB, WAB-K)']] },
      { key: 'language', title: 'Language findings', kind: 'table', columns: ['Score / findings', 'Remarks'], rows: [
        'Spontaneous speech', 'Auditory comprehension', 'Repetition', 'Naming', 'Reading', 'Writing', 'Aphasia quotient / severity',
      ] },
      { key: 'motor', title: 'Motor speech assessment', kind: 'table', columns: ['Findings'], rows: [
        'Respiration', 'Phonation', 'Resonance', 'Articulation', 'Prosody', 'Intelligibility (%)', 'Diadochokinetic rate', 'Dysarthria type', 'Apraxia of speech signs',
      ] },
      { key: 'oralmotor', title: 'Oral motor examination', kind: 'table', columns: ['Findings'], rows: ['Lips', 'Tongue', 'Jaw', 'Velum', 'Larynx (voluntary cough, swallow)'] },
      { key: 'swallow', title: 'Clinical swallowing evaluation', kind: 'table', columns: ['Observations', 'Signs of aspiration'], rows: [
        'Thin liquids (IDDSI 0)', 'Mildly thick (IDDSI 2)', 'Moderately thick (IDDSI 3)', 'Puree (IDDSI 4)', 'Soft & bite-sized (IDDSI 6)', 'Regular (IDDSI 7)',
      ] },
      { key: 'swallow_scales', title: 'Swallowing scales and instrumental findings', kind: 'fields', optional: true, fields: [
        ['screen', 'Screening tool and score (e.g. MASA, GUSS, EAT-10)'], ['fois', 'FOIS level'], ['instrumental', 'FEES / VFSS findings', 'textarea'],
        ['pas', 'Penetration-Aspiration Scale'], ['diet', 'Recommended diet (IDDSI levels)'],
      ] },
      { key: 'protocol', title: 'Assessment protocol (ASHA)', kind: 'protocol', optional: true, protocol: 'slp_adult' },
      { key: 'impression', title: 'Clinical impression', kind: 'narrative', ai: true },
      diagnosis,
      recommendations,
    ],
  },
];

// ASHA-aligned assessment protocols (standard components of a thorough evaluation, disorder-wise).
// These are the clinical steps a clinician ticks off; ticked steps print as the protocol followed.
export const PROTOCOLS = {
  aud_eval: {
    title: 'Audiological assessment',
    groups: [
      { label: 'Core evaluation', steps: [
        ['history', 'Case history and otological symptoms'],
        ['otoscopy', 'Otoscopic examination'],
        ['ptaac', 'Pure-tone air-conduction thresholds with masking'],
        ['ptabc', 'Pure-tone bone-conduction thresholds with masking'],
        ['speech', 'Speech audiometry (SRT and word recognition)'],
        ['immittance', 'Tympanometry and acoustic reflexes'],
        ['counsel', 'Counselling and report explained to the family'],
      ] },
      { label: 'When indicated', steps: [
        ['oae', 'Otoacoustic emissions'],
        ['abr', 'ABR / BERA (infants, difficult-to-test, retrocochlear screen)'],
        ['assr', 'ASSR for frequency-specific thresholds'],
        ['referral', 'Onward referral (ENT, imaging, early intervention)'],
      ] },
    ],
  },
  slp_voice: {
    title: 'Voice assessment',
    groups: [{ label: 'Components', steps: [
      ['history', 'Case history and vocal demands'],
      ['laryngeal', 'Laryngeal / ENT imaging findings reviewed'],
      ['perceptual', 'Auditory-perceptual evaluation (GRBAS, CAPE-V)'],
      ['acoustic', 'Acoustic measures (F0, jitter, shimmer, HNR)'],
      ['aerodynamic', 'Aerodynamic measures (MPD, s/z ratio)'],
      ['selfrating', 'Patient self-rating (VHI / V-RQOL)'],
      ['ome', 'Oral-peripheral examination'],
      ['stimulability', 'Stimulability / trial therapy'],
      ['counsel', 'Counselling on vocal hygiene'],
    ] }],
  },
  slp_fluency: {
    title: 'Fluency assessment',
    groups: [{ label: 'Components', steps: [
      ['history', 'Case history and onset / course'],
      ['samples', 'Speech samples across conversation, reading and monologue'],
      ['frequency', 'Frequency of disfluencies (%SS)'],
      ['duration', 'Duration of disfluencies'],
      ['secondary', 'Secondary / concomitant behaviours'],
      ['severity', 'Standardised severity (SSI-4)'],
      ['attitude', 'Attitudes and impact (OASES, S-24)'],
      ['rate', 'Rate of speech'],
      ['stimulability', 'Stimulability / trial therapy'],
    ] }],
  },
  slp_child: {
    title: 'Paediatric speech-language assessment',
    groups: [
      { label: 'Speech sound disorder', steps: [
        ['history', 'Birth, developmental and medical history'],
        ['ome', 'Oral-peripheral mechanism examination'],
        ['hearing', 'Hearing screening / audiological status'],
        ['artic', 'Standardised articulation / phonology test'],
        ['sample', 'Connected speech sample and intelligibility'],
        ['stimulability', 'Stimulability testing'],
      ] },
      { label: 'Language disorder / delay', steps: [
        ['receptive', 'Receptive language (standardised)'],
        ['expressive', 'Expressive language (standardised)'],
        ['sample', 'Language sample / MLU'],
        ['play', 'Play, cognition and social communication'],
        ['aac', 'AAC need considered'],
      ] },
      { label: 'Autism / social communication', steps: [
        ['tool', 'Standardised autism tool (ISAA, INCLEN, M-CHAT)'],
        ['observe', 'Structured social-communication observation'],
        ['parent', 'Parent / caregiver report'],
      ] },
    ],
  },
  slp_adult: {
    title: 'Adult communication and swallowing assessment',
    groups: [
      { label: 'Aphasia / language', steps: [
        ['history', 'Medical history and lesion details reviewed'],
        ['battery', 'Standardised aphasia battery (WAB / WAB-K)'],
        ['modalities', 'Spontaneous speech, comprehension, repetition, naming'],
        ['readwrite', 'Reading and writing'],
        ['functional', 'Functional communication / participation'],
      ] },
      { label: 'Motor speech', steps: [
        ['subsystems', 'Respiration, phonation, resonance, articulation, prosody'],
        ['ddk', 'Diadochokinetic rate'],
        ['intelligibility', 'Intelligibility rating'],
        ['apraxia', 'Signs of apraxia of speech'],
      ] },
      { label: 'Dysphagia', steps: [
        ['oralmotor', 'Oral-motor examination'],
        ['screen', 'Validated swallow screen (MASA, GUSS, EAT-10)'],
        ['trials', 'Clinical swallow trials across IDDSI levels'],
        ['aspiration', 'Signs of penetration / aspiration'],
        ['instrumental', 'Instrumental assessment (FEES / VFSS) when indicated'],
        ['diet', 'Diet and safety recommendations (IDDSI)'],
      ] },
    ],
  },
};

export function protocolFor(id) {
  return PROTOCOLS[id] || null;
}

// Every [id, label] step of a protocol, flattened (for cleaning and printing).
export function protocolSteps(id) {
  const p = PROTOCOLS[id];
  return p ? p.groups.flatMap((g) => g.steps) : [];
}

export function templatesFor(divisionId) {
  return TEMPLATES.filter((t) => t.division === divisionId);
}

export function template(id) {
  return TEMPLATES.find((t) => t.id === id) || null;
}

export function aiSectionKeys(tpl) {
  return tpl.sections.filter((s) => s.ai).map((s) => s.key);
}

// ---------- numbering and dates ----------

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// SRC/VT/3/Nov/2026: clinic prefix, template code, running number in that month, month, year.
export function reportNo(code, serial, isoDate) {
  const [y, m] = String(isoDate).split('-');
  return `${CLINIC.prefix}/${code}/${serial}/${MONTH[Number(m) - 1]}/${y}`;
}

// Same day six months later (end of month when that day does not exist).
export function addMonths(iso, months) {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

export function validityFor(reportDate) {
  return addMonths(reportDate, 6);
}

export function dmy(iso) {
  if (!isIsoDate(iso)) return iso || '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// ---------- the blank report, and checking what is saved ----------

function blankSection(section) {
  switch (section.kind) {
    case 'fields': return Object.fromEntries(section.fields.map(([k]) => [k, '']));
    case 'table': return section.rows.map(() => section.columns.map(() => ''));
    case 'freetable': return Array.from({ length: section.minRows || 3 }, () => section.columns.map(() => ''));
    case 'audiogram': return Object.fromEntries(AUDIOGRAM_ROWS.map(([k]) => [k, {}]));
    case 'tuningfork': return tuningForkFrom(null);
    case 'audioweber': return {};
    case 'list':
    case 'protocol': return [];
    default: return '';
  }
}

// Optional sections (extra tests, protocol checklist) start switched off; the clinician adds the ones
// that were done. Core sections are always in the report.
export function optionalKeys(tpl) {
  return tpl.sections.filter((s) => s.optional).map((s) => s.key);
}

export function isIncluded(tpl, data, key) {
  const section = tpl.sections.find((s) => s.key === key);
  if (!section || !section.optional) return true;
  return Array.isArray(data?.included) && data.included.includes(key);
}

export function blankReport(tpl, caseInfo = {}) {
  const data = { case: Object.fromEntries(CASE_FIELDS.map(([k]) => [k, caseInfo[k] || ''])), header_date: '', included: [] };
  for (const s of tpl.sections) data[s.key] = blankSection(s);
  return data;
}

const text = (v, max = 4000) => String(v ?? '').slice(0, max);

function cleanSection(section, value) {
  switch (section.kind) {
    case 'fields': {
      const v = value && typeof value === 'object' ? value : {};
      return Object.fromEntries(section.fields.map(([k]) => [k, text(v[k], 2000)]));
    }
    case 'table': {
      const rows = Array.isArray(value) ? value : [];
      return section.rows.map((_, r) => section.columns.map((__, c) => text(rows[r]?.[c], 1000)));
    }
    case 'freetable': {
      const rows = Array.isArray(value) ? value.slice(0, 60) : [];
      return rows.map((row) => section.columns.map((_, c) => text(Array.isArray(row) ? row[c] : '', 300)));
    }
    case 'audiogram': {
      const v = value && typeof value === 'object' ? value : {};
      return Object.fromEntries(AUDIOGRAM_ROWS.map(([k]) => {
        const row = v[k] && typeof v[k] === 'object' ? v[k] : {};
        return [k, Object.fromEntries(AUDIOGRAM_FREQS.map((f) => [f, text(row[f], 8)]).filter(([, x]) => x !== ''))];
      }));
    }
    case 'tuningfork': return tuningForkFrom(value);
    case 'audioweber': return audioWeberFrom(value);
    case 'list': {
      const items = Array.isArray(value) ? value : String(value ?? '').split('\n');
      return items.map((i) => text(i, 1200).trim()).filter(Boolean).slice(0, 60);
    }
    case 'protocol': {
      const ids = new Set(protocolSteps(section.protocol).map(([id]) => id));
      const ticked = Array.isArray(value) ? value : [];
      return ticked.map((i) => String(i)).filter((i) => ids.has(i)).slice(0, 80);
    }
    default: return text(value, 8000);
  }
}

// Keeps only what the template knows about, with sensible lengths.
export function cleanReportData(tpl, input = {}) {
  const c = input.case && typeof input.case === 'object' ? input.case : {};
  const optional = optionalKeys(tpl);
  const data = {
    case: Object.fromEntries(CASE_FIELDS.map(([k]) => [k, text(c[k], 300)])),
    header_date: isIsoDate(input.header_date) ? input.header_date : '',
    included: Array.isArray(input.included) ? input.included.filter((k) => optional.includes(k)) : [],
  };
  for (const s of tpl.sections) data[s.key] = cleanSection(s, input[s.key]);
  return data;
}

// Plain-text version of a filled report, for the AI (so it can draft the remaining sections).
export function reportAsText(tpl, data) {
  const lines = [];
  for (const [k, label] of CASE_FIELDS) if (data.case?.[k]) lines.push(`${label}: ${data.case[k]}`);
  for (const s of tpl.sections) {
    if (!isIncluded(tpl, data, s.key)) continue;
    const v = data[s.key];
    let body = '';
    if (s.kind === 'protocol') {
      const labels = Object.fromEntries(protocolSteps(s.protocol));
      body = (Array.isArray(v) ? v : []).map((id) => labels[id] && `- ${labels[id]}`).filter(Boolean).join('\n');
    } else if (s.kind === 'fields') body = s.fields.filter(([k]) => v?.[k]).map(([k, label]) => `- ${label}: ${v[k]}`).join('\n');
    else if (s.kind === 'table') body = s.rows.map((r, i) => (v?.[i]?.some(Boolean) ? `- ${r}: ${s.columns.map((c, j) => (v[i][j] ? `${c} ${v[i][j]}` : '')).filter(Boolean).join('; ')}` : '')).filter(Boolean).join('\n');
    else if (s.kind === 'freetable') body = (v || []).filter((row) => row.some(Boolean)).map((row) => `- ${row.map((cell, j) => (cell ? `${s.columns[j]} ${cell}` : '')).filter(Boolean).join('; ')}`).join('\n');
    else if (s.kind === 'audiogram') {
      body = AUDIOGRAM_ROWS.map(([k, label]) => {
        const row = v?.[k] || {};
        const cells = AUDIOGRAM_FREQS.filter((f) => row[f] !== undefined && row[f] !== '').map((f) => `${f} Hz ${row[f]}`);
        if (!cells.length) return '';
        const pta = ptaAverage(row);
        return `- ${label}: ${cells.join(', ')}${pta !== null ? ` (PTA ${pta} dB HL, ${degreeLabel(pta)})` : ''}`;
      }).filter(Boolean).join('\n');
    } else if (s.kind === 'tuningfork') {
      const tf = tuningForkFrom(v);
      body = [
        tf.freq && `- Fork: ${tf.freq} Hz`,
        tf.rinne_r && `- Rinne right: ${optionText(RINNE_RESULTS, tf.rinne_r)}`,
        tf.rinne_l && `- Rinne left: ${optionText(RINNE_RESULTS, tf.rinne_l)}`,
        tf.weber && `- Weber: ${optionText(WEBER_RESULTS, tf.weber)}`,
        tf.abc_r && `- ABC right: ${optionText(ABC_RESULTS, tf.abc_r)}`,
        tf.abc_l && `- ABC left: ${optionText(ABC_RESULTS, tf.abc_l)}`,
        tf.note && `- Note: ${tf.note}`,
      ].filter(Boolean).join('\n');
    } else if (s.kind === 'audioweber') {
      const aw = audioWeberFrom(v);
      body = [audioWeberSentence(aw), aw.note].filter(Boolean).map((x) => `- ${x}`).join('\n');
    } else if (s.kind === 'list') body = (v || []).map((i) => `- ${i}`).join('\n');
    else body = v || '';
    if (body) lines.push(`\n## ${s.title}\n${body}`);
  }
  return lines.join('\n').trim();
}

// What to put in the case table when a report is started for a patient.
export function caseInfoFor(patient, ageText, sexText) {
  return {
    name: patient.name || '',
    age_gender: [ageText, sexText].filter(Boolean).join(' / '),
    hospital_mr: patient.file_no || '',
    contact: patient.phone ? `+91 ${String(patient.phone).replace(/^(\d{5})(\d{5})$/, '$1 $2')}` : '',
    eval_date: '',
    languages: '',
  };
}

export const REPORT_STATUSES = [['draft', 'Draft'], ['final', 'Final']];

export function newReportDefaults(today) {
  return { report_date: today, valid_until: validityFor(today) };
}

export { addDays };

// ---------- suggestions from the test results (audiology) ----------

// Per-ear analysis from the audiogram (if it is in the report), else from the PTA in the core table
// (degree only: the type of loss needs bone conduction).
export function earAnalysis(tpl, data) {
  const audiogram = tpl.sections.some((s) => s.kind === 'audiogram') && isIncluded(tpl, data, 'audiogram') ? data.audiogram : null;
  const fromTable = (col) => {
    const row = tpl.sections.find((s) => s.key === 'pta_speech')?.rows.findIndex((r) => r.startsWith('PTA'));
    const raw = row >= 0 ? String(data.pta_speech?.[row]?.[col] ?? '').trim() : '';
    const pta = raw && Number.isFinite(Number(raw)) ? Number(raw) : null;
    if (pta === null) return null;
    const degree = degreeFor(pta);
    return { pta, degree, degreeText: degreeLabel(pta), bcPta: null, bcMean: null, abg: null, type: degree === 'normal' ? 'normal' : 'unknown', config: null, fromTable: true };
  };
  const ear = (acKey, bcKey, col) => (audiogram && hasThresholds(audiogram[acKey]) ? analyseEar(audiogram[acKey], audiogram[bcKey]) : null) || fromTable(col);
  return { right: ear('ac_r', 'bc_r', 0), left: ear('ac_l', 'bc_l', 1) };
}

// Suggested provisional diagnosis (per ear and overall) and audiological impression, worked out from
// the thresholds and the tests in the report. Only a suggestion: the clinician edits and confirms.
export function suggestAudiology(tpl, data) {
  const { right, left } = earAnalysis(tpl, data);
  const diagnosis = diagnosisLines(right, left);
  const lines = [];
  if (right || left) {
    const ear = (a, side) => a && `${lower(describeEar(a))} in the ${side} ear`;
    lines.push(`Pure-tone audiometry indicates ${[ear(right, 'right'), ear(left, 'left')].filter(Boolean).join(', and ')}.`);
  }
  if (isIncluded(tpl, data, 'tuningfork')) lines.push(tuningForkSentence(tuningForkFrom(data.tuningfork)));
  if (isIncluded(tpl, data, 'audio_weber')) lines.push(audioWeberSentence(audioWeberFrom(data.audio_weber)));
  const imm = data.immittance || {};
  if (String(imm.right || '').trim() || String(imm.left || '').trim()) {
    lines.push(`Immittance audiometry: ${[imm.right && `right ear — ${trimStop(imm.right)}`, imm.left && `left ear — ${trimStop(imm.left)}`].filter(Boolean).join('; ')}.`);
  }
  const oae = data.oae || {};
  if (isIncluded(tpl, data, 'oae') && (String(oae.right || '').trim() || String(oae.left || '').trim())) {
    lines.push(`OAE: ${[oae.right && `right ear — ${trimStop(oae.right)}`, oae.left && `left ear — ${trimStop(oae.left)}`].filter(Boolean).join('; ')}.`);
  }
  return { diagnosis, impression: lines.filter(Boolean).join(' '), right, left };
}

const lower = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const trimStop = (s) => String(s).trim().replace(/[.\s]+$/, '');

export { hasAudioWeber, hasTuningFork };
