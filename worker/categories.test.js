// node --test worker/categories.test.js
import assert from 'node:assert/strict';
import test from 'node:test';

import { CATEGORIES, PORTAL_CATEGORIES, patchCategories } from './categories.js';

// The two pieces of the portal's built code, exactly as served on 26 Nov 2026.
const PORTAL_SNIPPET = 'const Jc=["pta","impedance","bera","oae","tinnitus_evaluation","hearing_aids","hearing_aid_advance","ha_repair","batteries","moulds","receivers","shell_receivers","speech_therapy","backup_audiologist","other"],am={pta:"PTA",impedance:"Impedance",bera:"BERA",oae:"OAE",tinnitus_evaluation:"Tinnitus Evaluation",hearing_aids:"Hearing Aids",hearing_aid_advance:"Hearing Aid Advance",ha_repair:"HA Repair",batteries:"Batteries",moulds:"Moulds",receivers:"Receivers",shell_receivers:"Shell Receivers",speech_therapy:"Speech Therapy",backup_audiologist:"Backup Audiologist",other:"Other"},Hr=s=>am[s]||Xe(s);';

test('every category already in use is kept, with its label', () => {
  const now = Object.fromEntries(CATEGORIES);
  for (const [id, label] of PORTAL_CATEGORIES) assert.equal(now[id], label, id);
  const ids = CATEGORIES.map(([id]) => id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  for (const id of ids) assert.match(id, /^[a-z][a-z0-9_]*$/);
  assert.equal(ids.at(-1), 'other');
});

test('the portal list is swapped, and the result still runs', () => {
  const { html, ids, labels } = patchCategories(`<script>${PORTAL_SNIPPET}</script>`);
  assert.ok(ids && labels);
  const code = html.replace(/^<script>|<\/script>$/g, '');
  const { Jc, Hr } = new Function('Xe', `${code}; return { Jc, Hr };`)((s) => s);
  assert.deepEqual(Jc, CATEGORIES.map(([id]) => id));
  assert.equal(Hr('implant_dry_bricks'), 'Implant Dry Bricks');
  assert.equal(Hr('special_tests'), 'Special Tests (SISI, Tone Decay)');
  assert.equal(Hr('shell_receivers'), 'Shell Receivers');
});

test('a page without the list is left exactly as it was', () => {
  const page = '<html><body>Install</body></html>';
  assert.deepEqual(patchCategories(page), { html: page, ids: false, labels: false });
});
