# Expenses

Reimbursement claims for Skin Tyee staff — the **money twin of
[Timesheets](./timesheets.md)**. A worker submits one **expense claim** per
period; the claim holds a batch of **receipt items**. Each receipt is read by
**Claude (Anthropic vision)** to pre-fill amount / vendor / date and suggest a
category **tag**. **Finance** (or admins) approve, and every period gets a
printable **PDF + CSV** report with the band letterhead.

The module deliberately mirrors Time Keeping — same draft → submitted →
approved | rejected (+ reopen) lifecycle, the same eligibility flag, the same
approval-queue layout, and the same report/letterhead style — so it slots into
the patterns the team already knows. This is a **POC**: AI and storage are real
code but gated on config (see [STUBS](../../app/STUBS.md)).

## Quick map

| | |
|---|---|
| Claim grain | one per submitter, per period (`<submitterUpn>:<periodId>`) |
| Period engine | `api/src/skintyee-expense-periods.ts` — **independent** of timesheets |
| Period length | 14 days (own `EXPENSE_PERIOD_CONFIG.anchorISO`) |
| Cutoff / reimburse | cutoff Friday; reimburse `reimburseDaysAfterCutoff` (7) later |
| Submission roles | `staff` appRole or above, **and** `Person.expensesEnabled` |
| Approval roles | `admin` **OR** the `finance` bandGroup |
| Receipt AI | `api/src/anthropic.service.ts` (vision) — no-op if no key |
| Receipt storage | pluggable `DOCUMENT_STORAGE` adapter (Blob in prod) |
| Tags | editable `ExpenseTag` catalog, **GL-coded**, seeded with standards |
| Reports | `api/src/expense-reports.service.ts` — PDF + CSV, on-demand |

## Why an independent period config

Expenses share the **shape** of the timesheet pay period (14-day, Friday
cutoff) but are configured **separately** — `skintyee-expense-periods.ts` has
its own `anchorISO` / `lengthDays` / `reimburseDaysAfterCutoff`. Reimbursement
runs and payroll runs don't have to align, and shifting one never moves the
other. Same "TS-config not env" rationale as the timesheet engine: reviewable,
atomic, and the app fetches `/v1/expenses/periods` so UI and engine agree.

## Domain model

```
        Submitter adds      ┌──────────────────┐
        one of these        │  ExpenseClaim    │
        per period          │  per submitter,  │
                            │  per period      │
                            └────────┬─────────┘
                            contains many ▼
                            ┌──────────────────┐      tagSlug ┌──────────────┐
                            │  ExpenseItem     │─────────────▶│  ExpenseTag  │
                            │  one per receipt │              │  slug, label │
                            │  (amount, vendor,│              │  glAccount,  │
                            │   date, tagSlug, │              │  active      │
                            │   file, ai…)     │              └──────────────┘
                            └──────────────────┘
```

### ExpenseClaim
`id` (`<submitterUpn>:<periodId>`), `submitterUpn`, `submitterName`,
`payPeriodId`, `status` (`draft|submitted|approved|rejected`), `notes?`,
`totalAmount` (snapshot, recomputed from items), `currency` (CAD),
`submittedAt? / approvedBy? / approvedAt? / rejectedReason?`, `items[]`.
Approved claims are **locked** (api/ refuses edits; UI mirrors it) until
finance/an admin **reopens** them.

### ExpenseItem
One receipt line: `amount`, `vendor?`, `date?`, `tagSlug?`, `description?`,
`aiExtracted`, plus storage fields (`storage`, `fileKey`, `fileUrl?`,
`fileName?`, `mimeType?`, `sizeBytes?`). Items **persist on upload** (unlike
timesheet entries, which batch on save) — the moment a receipt is added the
api/ stores the file, runs Claude, and returns the saved row.

### ExpenseTag (the catalog)
`slug` (id), `label`, **`glAccount`** (General Ledger account number), `active`.
Curated by admins in the **Expense Tag Manager** exactly like the Document Tag
Manager. **Pre-seeded** with 16 standard categories (Travel, Meals, Fuel /
Mileage, Accommodation, Office Supplies, Equipment, Professional Services,
Training, Utilities, Telecom, Postage, Bank Fees, Vehicle / Repairs, Software,
Honoraria, Miscellaneous), each with a placeholder `5xxx` GL code.

## GL account number — the accounting key

Each tag carries a **GL account number** (`ExpenseTag.glAccount`). It's the
bridge to the band's ledger: a tagged receipt maps straight onto a General
Ledger account in **Adagio / Sage 300** (the Ferrus ASAP suite). Finance edits
the codes in the Tag Manager to match the real chart of accounts. The GL code
rides along everywhere the tag is shown — the receipt picker, the per-claim PDF
(`GL · TAG` column) and the CSV (`glAccount` column) — so an approved claim
exports as ledger-ready rows.

## AI receipt extraction

`AnthropicService.extractReceipt(bytes, mimeType, tags[])` sends the receipt as
a vision content block (image or PDF document) and forces a `record_receipt`
tool call returning `{ amount, vendor, date, currency, suggestedTagSlug,
confidence }`. The allowed `suggestedTagSlug` values are the **active tags**, so
Claude classifies into the same catalog finance curates. Caller-supplied fields
always win over the AI; the worker reviews/edits every field and can re-tag.

- Model: `ANTHROPIC_MODEL` (default `claude-haiku-4-5-20251001`).
- **No key ⇒ graceful no-op**: the item is created with null fields and
  `aiExtracted:false`, and manual entry works exactly as before.
- Turn it on in prod with **`scripts/setup-app-anthropic.sh`** (sets the
  `anthropic-api-key` Container App secret + `ANTHROPIC_API_KEY` env + ADO var).

## Capture

Workers attach a receipt three ways (`app/src/core/receiptCapture.ts`):
**Take photo** (device camera — `expo-image-picker` on native, an
`<input capture="environment">` on web), **Choose from library**, or
**Pick a file** (PDF/image via `expo-document-picker`). There's also an
**Add manual line** for a cash item with no receipt.

## Lifecycle & approval

`draft → submitted → approved | rejected`, with admin/finance **reopen** back
to `submitted`. Approval is gated by `assertCanApprove`: **admin OR the
`finance` bandGroup**. The Approvals tab buckets claims into Pending / Drafts /
Already decided / Not started (the roster of expenses-enabled people without a
claim).

### Submission & the cutoff deadline

Identical rule to [Timesheets](./timesheets.md#submission--the-cutoff-deadline):

- **Submit any time** — workers submit **whenever they want** (early is fine);
  there is **no "submit only after cutoff"** gate. A **confirmation prompt**
  precedes submit ("Submit N receipts ($X) … you won't be able to edit it once
  submitted unless it's reopened").
- **The cutoff Friday is a hard deadline.** After the period's cutoff
  (`period.endISO`) the claim is **closed** for the submitter — the editor locks
  read-only ("The cutoff (Ddd Mmm D) has passed — this period is closed and can
  no longer be adjusted").
- **Approved** claims are also locked (reopen via finance/admin).
- **Admins/finance bypass both** via Approvals → edit (admin-edit mode), the
  escape hatch for a missed cutoff.

> **Enforcement boundary (current):** the **approved** lock is enforced in the
> **api/** + UI; the **cutoff** lock is currently **UI-enforced** (editor
> disables add-receipt/edit/submit past the cutoff). Server-side cutoff
> enforcement for the worker mutation endpoints is a recommended follow-up if
> the deadline must be tamper-proof.

## Reports

`ExpenseReportsService` builds, on demand, per period:
- a **PDF** — band letterhead, a cover summary, then one page per claim
  (receipt table: `DATE · GL · TAG · VENDOR · AMOUNT`, total, notes, submitter +
  finance signature blocks);
- a **CSV** — one row per receipt with the `glAccount` column for ledger import.

There's no persisted report row (unlike timesheets); PDFs are generated +
cached in memory. A **single-claim PDF** is also available
(`/v1/expenses/claims/:id/pdf`).

## Emails

Gated by the **`expenseEvents`** notification toggle (Configure Notifications).
On `submit / approve / reject` the api/ emails the **submitter + finance +
admins**; an admin **edit** emails the submitter + the editing admin only. The
body carries a receipt breakdown + claim totals (`renderExpenseEventEmail`).
Best-effort — a mail failure never fails the request.

## API surface (`/v1/expenses`)

- `GET /me/eligible`, `GET /eligible-people`, `GET /periods`
- Tags: `GET /tags`; admin `POST/PATCH/DELETE /tags`
- Claims: `GET /claims` (mine), `POST /claims/start` (idempotent draft),
  `PATCH /claims/:id`, `POST /claims/:id/submit`, `GET /claims/all` (queue),
  `POST /claims/:id/{approve,reject,reopen}`, `GET/PATCH /claims/admin/:id`,
  `DELETE /claims/:id`
- Items: `POST /claims/:id/items` (multipart `file` + JSON `payload`),
  `PATCH/DELETE /items/:id`, `GET /items/:id/receipt`
- Reports: `GET /reports`, `POST /reports/:periodId/generate`,
  `GET /reports/:periodId/{pdf,csv}`, `GET /claims/:id/pdf`

## App screens

- `Expenses.tsx` — hub (My expenses / Approvals tabs, finance-gated).
- `AddExpense.tsx` — claim editor: add receipts (camera/library/file) →
  AI-prefilled rows → review/edit/tag → claim notes → submit.
- `ExpenseReports.tsx` — finance/admin report list (open/save PDF, CSV).
- `ExpenseTagManager.tsx` — curate the GL-coded tag catalog.

Tiles: admin **Expenses**, staff **My Expenses** (`MoreMenu.tsx`); finance-group
staff reach the approval queue through the same screen.

## Receipt totals — tax, subtotal & line-item math

A receipt item carries `amount` (the claimed total), `taxAmount`, `currency`,
and optional AI `lineItems` (`{description, amount, qty, excluded, isSummary}`).
The numbers relate as **subtotal + tax = total**, with these rules:

### Summary vs real lines
A line is a **summary** row when the AI set `isSummary` **or** its label matches
`subtotal | total | balance | amount due | change | tax | gst/hst/pst/qst | tip |
gratuity | rounding | cash | visa | mastercard | debit | credit | payment | due`
(checked both server-side in `anthropic.service.ts` and client-side in
`AddExpense.tsx` `isSummaryLine()`, so old/mislabelled data is still caught).

- **Summary rows never count** toward the claimed amount and are **not
  user-toggleable**.
- The **Subtotal** line is shown and its price is editable.
- The **Tax** and **Total** rows in DETAILS are rendered from the item's form
  fields (`taxAmount`, `amount`) — the AI's own tax/total summary lines are
  **hidden** so they don't duplicate (this fixed a double tax line).

### Tax derivation (at scan time — `ExpensesService.addItem`)
When a scanned receipt is itemised, tax is derived rather than trusting the AI's
tax read:

```
subtotal = Σ(real, non-summary line item amounts)
tax      = round2(grandTotal − subtotal)      // only if subtotal > 0 and tax ≥ 0
```

If that guard fails (no items / negative), it falls back to the AI's `tax`. The
submitter can always override the **Tax** field afterward.

### Claimed amount (`item.amount`)
- On scan: `amount = AI grand total` (or a caller-supplied value).
- On include/exclude or a line-item price edit:
  `amount = Σ(included, non-summary line amounts) + taxAmount`.
- The claim's `totalAmount = Σ(item.amount)` (`recomputeTotal`).

### Tax recompute on a Total edit (app)
Editing the **Total** (amount) field on an itemised receipt recalculates
`tax = max(0, round2(total − subtotal))` live and on blur, keeping
**subtotal + tax = total** consistent.

### Subtotal validation (app)
The DETAILS section shows a warning when the **sum of all (non-summary) line
items ≠ the printed Subtotal line** (±$0.01) — a data-quality check that the AI
read the items and subtotal consistently. It uses *all* items (ignores
exclusions, since excluding is a claim choice, not a misread).

### Currency
Forced to **CAD** for now (multi-currency entry disabled): the api stores
`currency: 'CAD'` on every item and the UI always displays CAD, ignoring any
AI-detected currency. Re-enable by removing the override in `addItem` + the
fixed CAD field in `AddExpense.tsx`.
