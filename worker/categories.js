// Collection categories for the portal's "Collections" page (money taken at the clinic).
//
// The portal's source code is not available, so its category list is built into the page it sends.
// The Worker swaps that built-in list for this one as the page passes through (see proxy.js).
// Each test or item is its own category: several services paid together are recorded as separate
// entries, one per service, each with its own amount.
//
// Rules for changing this list:
// - Never remove or rename an id that is already in use: past entries are stored with that id.
// - New ids: lower case, letters, digits and underscores.
// - If the portal is ever redeployed with a different built-in list, the swap simply does not happen
//   (the page is left exactly as the portal sent it).

export const CATEGORIES = [
  // Hearing tests
  ['pta', 'PTA'],
  ['impedance', 'Impedance'],
  ['tinnitus_evaluation', 'Tinnitus Evaluation'],
  ['bera', 'BERA'],
  ['oae', 'OAE'],
  ['special_tests', 'Special Tests (SISI, Tone Decay)'],
  // Speech
  ['speech_assessment', 'Speech Assessment'],
  ['speech_therapy', 'Speech Therapy'],
  // Hearing aids
  ['hearing_aids', 'Hearing Aids'],
  ['hearing_aid_advance', 'Hearing Aid Advance'],
  ['hearing_aid_programming', 'Hearing Aid Programming'],
  ['ha_repair', 'HA Repair'],
  ['batteries', 'Batteries'],
  ['moulds', 'Moulds'],
  ['receivers', 'Receivers'],
  ['shell_receivers', 'Shell Receivers'],
  ['ear_tips', 'Ear Tips'],
  ['ric_domes', 'RIC Domes'],
  ['huggies', 'Huggies'],
  ['bte_ear_hooks', 'BTE Ear Hooks'],
  ['hearing_aid_accessories', 'Hearing Aid Accessories'],
  // Cochlear implant
  ['mapping', 'Mapping'],
  ['implant_processor', 'Implant Processor'],
  ['implant_batteries', 'Implant Batteries'],
  ['implant_ear_hook', 'Implant Ear Hook'],
  ['implant_cable_wire', 'Implant Cable Wire'],
  ['implant_frame', 'Implant Frame'],
  ['implant_dry_bricks', 'Implant Dry Bricks'],
  ['implant_sleeves', 'Implant Sleeves'],
  ['implant_accessories', 'Implant Accessories'],
  // Other
  ['backup_audiologist', 'Backup Audiologist'],
  ['other', 'Other'],
];

// The list exactly as it is built into the portal today (seen on admin.srirudraspeechandhearing.com,
// 26 Nov 2026). Only this exact text is replaced.
export const PORTAL_CATEGORIES = [
  ['pta', 'PTA'],
  ['impedance', 'Impedance'],
  ['bera', 'BERA'],
  ['oae', 'OAE'],
  ['tinnitus_evaluation', 'Tinnitus Evaluation'],
  ['hearing_aids', 'Hearing Aids'],
  ['hearing_aid_advance', 'Hearing Aid Advance'],
  ['ha_repair', 'HA Repair'],
  ['batteries', 'Batteries'],
  ['moulds', 'Moulds'],
  ['receivers', 'Receivers'],
  ['shell_receivers', 'Shell Receivers'],
  ['speech_therapy', 'Speech Therapy'],
  ['backup_audiologist', 'Backup Audiologist'],
  ['other', 'Other'],
];

// How the portal's built code writes the list of ids and the id → label table.
const idList = (list) => JSON.stringify(list.map(([id]) => id));
const labelTable = (list, quoteKeys) => `{${list.map(([id, label]) => `${quoteKeys ? JSON.stringify(id) : id}:${JSON.stringify(label)}`).join(',')}}`;

const OLD_IDS = `=${idList(PORTAL_CATEGORIES)}`;
const OLD_LABELS = `=${labelTable(PORTAL_CATEGORIES, false)}`;
const NEW_IDS = `=${idList(CATEGORIES)}`;
const NEW_LABELS = `=${labelTable(CATEGORIES, true)}`;

/**
 * Swap the portal's built-in category list for CATEGORIES.
 * Returns { html, ids, labels } where ids / labels say whether each part was found and replaced.
 */
export function patchCategories(html) {
  let out = String(html);
  const ids = out.includes(OLD_IDS);
  if (ids) out = out.split(OLD_IDS).join(NEW_IDS);
  const labels = out.includes(OLD_LABELS);
  if (labels) out = out.split(OLD_LABELS).join(NEW_LABELS);
  return { html: out, ids, labels };
}
