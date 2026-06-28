# Funding Information & Training — Plan

**Goal:** turn the dense 189-page ISC BC Region Program Guide into something a *new*
band administrator can actually use — a friendly **training course** + per-program
pages that show what you can get, how to apply, what you must report, who to contact,
and let signed-in members/staff **submit funding requests + documents**.

Source content: `isc-bc-program-guide-2024-2025-summary.md` (9 chapter summaries) +
the PDF in `web/public/docs/`.

---

## The core idea

The guide is built on a few repeating concepts — we make those the backbone:

- **PAW** (Proposal/Application/Work plan) — *how you apply* (has a PAW # + due date).
- **DCI** (Data Collection Instrument) — *the report you owe* (has a DCI # + due date).
- **FNIIP** — the infrastructure plan most capital/housing money depends on.
- **GCIMS** — federal system that tracks submissions and can halt funds for late reports.

Everything is organized by **program area** (Housing, Education, Lands & Economic Dev,
Social, Child & Family Services, Health) so it lines up with the existing site.

## Data model (drives every surface)

```
FundingProgram {
  area            // housing | education | lands-economic-development | social | child-family-services | health
  name, acronym
  plainSummary    // 1-2 sentences, plain language ("what is this + can I get it")
  whatItFunds[]   // bullet list
  eligibility     // who qualifies
  requirements[]  // application requirements
  paw[]   { no, name, dueDate, note }     // how to apply
  dci[]   { no, name, dueDate }           // what to report
  contacts[] { label, email, phone }      // -> contact cards
  pdfPage         // deep-link into the guide
}
CourseModule { area, title, intro, lessons[], checklist[] }
```

## Surfaces

1. **Training course** ("Funding 101" + a module per area) — friendly, progressive,
   with a checklist/quiz per module. *Authored in SharePoint (Phase 2), surfaced on site.*
2. **Program-area pages** (`/programs/<area>`) — plain-language overview, the relevant
   funding programs, **Application (PAW) deadline table**, **Reporting (DCI) deadline
   table**, **contact cards**, and a link to the guide section.
3. **Funding calendar** — every PAW/DCI deadline in one place.
4. **Document library** — categorized **by type** (guides, application forms, reports,
   policies, inspection reports, …).
5. **Submissions** — signed-in members/staff submit **funding requests** and **document
   uploads** from a program page. **Forms are authored/collected in WordPress** (forms
   plugin), surfaced on the Next.js frontend.
6. **Basic user documentation** — short, plain-language help for *frontend website
   users* ("how do I find funding for X", "how to submit a request") — not the federal
   guide, just how to use this part of the site.

## Funding cycles (future — documented, do NOT build yet)

Many programs run on annual **cycles** (intake windows + PAW/DCI deadlines). Capture
each program's cycle so it can later become **calendar reminders in the app**
(e.g. "Housing PAW due Sept 30", "DCI 460671 Capital Projects Report for Housing due
Jun 30"). For now: record the cycle dates in the dataset; the app-calendar reminder
integration is a **later phase** — documented here, not implemented yet.

## Training-course module outline (the "break it down for a newcomer" part)

- **0 — Funding 101:** Grants vs Contributions, what PAW/DCI/FNIIP/GCIMS mean, the cash-flow
  basics, why reporting on time matters. *(from General Information + Funding Information)*
- **1 — Governance & Community Development:** BSF, Employee Benefits, Tribal Council Funding,
  P&ID, Comprehensive Community Planning, status cards.
- **2 — Infrastructure & Housing:** FNIIP → CFMP, Housing Support Program, Ministerial Loan
  Guarantee, water/wastewater, O&M, fire protection, E-ACRS. *(Housing-first)*
- **3 — Lands & Economic Development:** LEDSP Core/Targeted, CORP, RLEMP, FNLM, contaminated sites.
- **4 — Education:** BCTEA & tuition, student supports/allowances, PSSSP/UCEPP, PSPP.
- **5 — Social Development:** Income Assistance (+ benefits), Assisted Living, Family Violence Prevention.
- **6 — Child & Family Services:** FNCFS reform, Jordan's Principle, jurisdiction & engagement.
- **7 — Emergency Management:** EMAP — mitigation, preparedness, response, recovery.
- **8 — The Funding Calendar:** all PAW/DCI deadlines, month by month.

## Phasing

**Phase 1 — Data + display (build now):**
- Author `web/lib/funding-data.ts` from the 9 summaries (programs × area × PAW/DCI/requirements/contacts).
- Program pages render: plain overview, funding programs, PAW & DCI deadline tables,
  **contact cards**, guide link. (No WP plugin needed yet — data ships with the frontend.)
- A `/funding` hub page + the **funding calendar**.

**Phase 1b — Submissions + user docs (signed-in):**
- **Intake forms managed in WordPress** (forms plugin) — `Submit a funding request` +
  `Upload a document` per program area; submissions stored in WP + emailed to staff;
  documents tagged by **type**. Surfaced on the Next.js program pages.
- Microsoft **Entra** sign-in gate on the submission widgets.
- **Basic frontend-user documentation** (how to find funding / how to submit).
- *(The earlier "Next.js → NestJS api" option is the fallback if WP forms can't meet the
  signed-in + document-upload needs; default is WP intake per your latest direction.)*

**Phase 2 — SharePoint (deferred, per decision):**
- Canonical **document library** in SharePoint (via Microsoft Graph), documents **by type**.
- Host/author the **training course** content in SharePoint; **sync** SharePoint → WordPress/site.
- Adjust the app's document storage to the pluggable Blob/SharePoint store.

**Phase 3 — Authoring in WordPress (optional):**
- WP plugin `skintyee-funding`: CPT `funding_program` + `program_area` taxonomy + PAW/DCI/
  requirements/contacts meta, exposed via REST, so staff edit funding content without code.

## Decisions locked in
- Doc store / training-course host: **SharePoint** — but **Phase 2** (not now).
- Intake/submission forms: **authored & collected in WordPress** (forms plugin),
  surfaced on the Next.js frontend; signed-in via Entra. *(Next.js→NestJS api is fallback.)*
- Build order: **data + display first**, then WP intake forms + basic user docs, then
  SharePoint (store + training course + sync), then WP authoring of funding content.
- Documents are **categorized by type**.
- **Contact cards** come from each chapter's contact tables (e.g. the LED contacts:
  Economic Development, Environment & Natural Resources, Lands Modernization, Land
  Registry, Project & Program Support, Survey & Land Records Officer).
- **Funding cycles** are recorded in the dataset now; **app-calendar reminders are a
  later phase** (documented, not built).
