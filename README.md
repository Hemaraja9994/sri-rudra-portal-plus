# Sri Rudra portal-plus

> Repository: `Hemaraja9994/sri-rudra-portal-plus` (renamed from `sri-rudra-admin-` on 26 Nov 2026).
> Not to be confused with `sri-rudra-admin` (no dash), which deploys the public website
> (`sri-rudra-speech-hearing-clinic`) and is linked to the original portal's Pages project.

A new look and **clinician dashboards (Audiology and Speech-Language Pathology)** for the Sri Rudra
admin portal at admin.srirudraspeechandhearing.com, added **without changing the portal's own code**.

The portal's source code is not available, so this is a small Cloudflare Worker that sits in front of it:

| Path | What happens |
|---|---|
| any portal page | passed to the portal unchanged; HTML pages get `/__srr/theme.css` and `/__srr/overlay.js` |
| `/clinical/audiology`, `/clinical/slp` | the clinician dashboards (React app in `clinical/`) |
| `/clinical/api/...` | their API (`worker/clinical.js`) |
| `/__srr/...` | theme, small sidebar script, Carlito fonts (SIL OFL) |

- **Sign-in** is the portal's own: every clinical request is checked with the portal's `/api/session`.
- **Data**: two new tables in the portal database `sri-rudra-portal-db` — `clin_patients` and
  `clin_entries`. Existing tables are only read (appointments, test reports, HA trials and sales are
  matched to a patient by the last 10 digits of the phone number). Changes are written to `audit_log`.
- **Printing** is untouched: the theme only applies on screen.
- **Theme**: navy `#173451` and orange `#f46b20` with Carlito, after the DegluTech workspace.

## Address

Everything lives on the clinic's own domain:

| Address | What |
|---|---|
| https://srirudraspeechandhearing.com | public website and its staff area (CRM) — repo `Clinic_Web` |
| https://admin.srirudraspeechandhearing.com | daily portal, new look and clinical dashboards — this Worker |

- This Worker has **no other address**: `workers_dev = false` and `preview_urls = false`.
- It runs through the route `admin.srirudraspeechandhearing.com/*` (zone `srirudraspeechandhearing.com`,
  failure mode **Fail open**), set in Cloudflare → Workers & Pages → `sri-rudra-portal-plus` → Domains.
  The route is deliberately not in `wrangler.toml`: a `routes` entry there would make every deploy
  replace it. It shows under "Routes", not "Custom domains", because the portal itself still owns the
  address and this Worker sits in front of it.
- The clinical pages check sign-in by asking admin.srirudraspeechandhearing.com/api/session (Cloudflare
  sends a Worker's request to its own route straight to the portal). `PORTAL_ORIGIN` is only used in
  local development.
- The two Pages projects' built-in addresses (sri-rudra-portal.pages.dev and
  sri-rudra-speech-hearing-clinic.pages.dev) are redirected to the clinic's domain by a Cloudflare Bulk
  Redirect (account → Bulk redirects), keeping the path.
- **Undo the new look**: delete the route. The portal goes straight back to the old look; the clinical
  tables stay.
- **Undo a bad update**: Cloudflare → `sri-rudra-portal-plus` → Deployments → the previous version →
  Rollback.

## Install as an app

Staff can install the portal like an app: its own icon and window on a computer, full-screen from the
Home Screen on a phone. It is the same portal (same sign-in, always the current version).

| Device | How |
|---|---|
| Windows or Mac, Chrome or Edge | one click: "Install app" (the browser's own install box) |
| Android, Chrome | one click: "Install app" |
| iPhone or iPad | Apple allows no install button: Share → Add to Home Screen → Add (shown step by step) |

Where the link appears: a card under the sign-in form, "Install app" at the end of the sidebar (portal
and clinical pages), the shareable page **admin.srirudraspeechandhearing.com/install** (with a QR code
for phones), and "Install admin portal app" in the website's staff area (repo `Clinic_Web`).

Files: `static/__srr/app.webmanifest` (name, icons, shortcuts to Appointments, Audiology and SLP),
`icons/` (श्री drawn in Noto Serif Devanagari Bold, SIL OFL), `install.js` (install button logic and
the iPhone steps), `install.html` (served at `/install`), `sw.js` (served at `/sw.js`) and
`offline.html`.

The service worker caches only the "No internet connection" page. Portal pages and patient data are
never stored on the device. To switch it off for everyone, follow the comment at the top of `sw.js`.

## Collection categories

The portal's Collections page has its category list built in. The Worker swaps it for the list in
`worker/categories.js` as the page passes through (one entry per test or item). Never remove or
rename an id already in use; if the portal is redeployed with a different built-in list, the swap
simply does not happen.

## Reports, therapy plans and AI records

On each patient's page, and from "Add from file" on the caseload:

- **Add from file** — upload a case sheet, report or photo; Cloudflare Workers AI (free daily
  allowance) reads it and fills in the Add patient form for the clinician to check, with a
  duplicate-patient check. Files are kept with the patient in Workers KV (binding `FILES`).
- **Diagnostic reports** — templates matched to the clinic's own reports: audiology (PTA/SRT/SDS,
  immittance impression, separate right/left **audiogram plots**, OAE, BERA/ABR, ASSR, VEMP,
  tinnitus — each optional and editable) and SLP (voice, fluency, child, adult, with ASHA
  protocols). The impression is AI-drafted and editable; the per-ear diagnosis is clinician-written.
  Reports print on A4 with the clinic logo and letterhead.
- **Therapy plans** — the AI drafts the framework, goals and every session; the clinician edits,
  ticks sessions done (added to the timeline), records the progress data sheet, and prints.
- **Master control** (`/clinical/master`, owner/admin only) — every centre with its staff; add
  people, move them, change roles, switch accounts off, reset passwords. Works on the portal's own
  staff and centre records.

AI use is recorded in the portal's audit log; nothing is saved or printed without a clinician's
click. The report/plan models are in `shared/reports.js` and `shared/plans.js`; the server is
`worker/documents.js` and `worker/ai.js`; local development uses `--var AI_MOCK:1` for fixed answers.

## One-time database step

Two additive migrations in `sri-rudra-portal-db` (Cloudflare → D1 → Console → Execute; safe to run
twice): `docs/d1-console-clinical.sql` (patients and entries) and `docs/d1-console-clinical-2.sql`
(files, reports, plans). All `CREATE TABLE IF NOT EXISTS`. Also needs the `FILES` KV namespace and
the Workers AI binding (both in `wrangler.toml`).

## Development

```bash
npm install
npm test          # clinical rules (shared/clinical.js)
npm run build     # dashboards -> dist/clinical, theme -> dist/__srr
npx wrangler dev --var PORTAL_ORIGIN:http://127.0.0.1:8790   # against a local stand-in portal
```

Cloudflare builds and deploys this repository on every push to `main`
(Workers Builds: build `npm run build`, deploy `npx wrangler deploy`). There is no preview address,
so a push to `main` goes **straight to the live portal**: test locally with the stand-in portal first,
and push only once the change is approved.
