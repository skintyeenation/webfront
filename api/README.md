# @skintyee/api — Skin Tyee API

The backend "API Server" from `SkinTyee.drawio.pdf` (→ Azure Cloud DB). This is
**contract-first**: [`openapi.yaml`](./openapi.yaml) is the source of truth and
the contract the app's `ApiService` is written against.

Right now this package ships:
- **`openapi.yaml`** — the API contract (all app domains + admin CRUD).
- A working **NestJS implementation** of that contract with an **in-memory data
  layer**, **role-gated** writes (via an `x-role` header standing in for an Entra
  ID token), and **Swagger UI** at `/docs`. Persistence (Prisma + PostgreSQL/
  PostGIS) is the next step — only `data.service.ts` changes.

```bash
pnpm install
pnpm --filter @skintyee/api dev            # http://localhost:4000/docs (Swagger UI); routes under /v1
pnpm --filter @skintyee/api typecheck
pnpm --filter @skintyee/api lint:openapi   # validate the spec

# Try it (role via x-role header, POC stand-in for Entra ID):
curl localhost:4000/v1/events
curl -H 'x-role: admin' localhost:4000/v1/financials
curl -H 'x-role: admin' -H 'content-type: application/json' \
  -d '{"title":"Boil water advisory","category":"Health"}' localhost:4000/v1/notifications
```

**Structure:** `src/main.ts` (bootstrap + Swagger), `app.module.ts`,
`controllers.ts` (one controller per domain), `data.service.ts` (in-memory
store, seeded from `fixtures.ts`), `roles.ts` (`@Roles` + `RolesGuard`).

Endpoints (see the spec for full detail): `/directory`, `/events`, `/meetings`,
`/transparency/{expenditures,major-projects}`, `/financials`, `/timekeeping/*`,
`/polls` (+ `/vote`), `/notifications`, `/auth/me`.

---

## 📧 Email

Transactional email is sent via **Mailgun** ([`src/mailgun.service.ts`](./src/mailgun.service.ts)).
Every message uses one **easily-editable HTML letterhead**
([`src/email-template.ts`](./src/email-template.ts)) — edit `BRAND` (band name,
address, phone, email) and the markup there; per-email content drops into the
body slot. The Skin Tyee logo ([`src/email-logo.ts`](./src/email-logo.ts)) is
served by the api at **`/v1/assets/skintyee-logo.png`** and referenced by https
URL in the letterhead (override with `EMAIL_LOGO_URL`) — more reliable across
email clients than an inline `cid:` attachment.

**All emails are best-effort:** a send failure (or Mailgun not configured)
**never** fails the API call — it's logged and the action still succeeds.

| Email | Trigger | Recipients | Contents |
|---|---|---|---|
| **Staff sign-in (OTP)** | `POST /v1/admin/users` with `createPerson:true` (adding a **staff** member) | the new staff member (`notifyEmail` overrides; defaults to their UPN) | username + one-time password + sign-in link + optional admin note. **Plain band-member adds do _not_ get this.** |
| **Community notification** | `POST /v1/notifications` | **all band members** — everyone in the `band-members` Entra group (incl. band members who are also staff). **Non-band-member staff are excluded.** | the notification title + body + category |
| **Timesheet — submitted / approved / rejected** | the matching `/v1/timekeeping/timesheets/*` endpoints | the **worker** + the **`admins` group** | a per-event **"what changed"** summary (status, hour/OT/week diffs, per-day entry changes; rejection reason) + current totals |
| **Timesheet — edited** (admin edits a worker's sheet) | `PATCH /v1/timekeeping/timesheets/admin/:id` | the **worker** + the **editing admin only** (not the whole group) | the same "what changed" summary. **Draft sheets don't email** — a sheet that's never been submitted/approved isn't in the approval pipeline yet, so edits to it are silent. (Adding a timesheet sends no email either.) |
| **Expense claim — submitted / approved / rejected** | the matching `/v1/expenses/claims/*` endpoints | the **submitter** + the **`finance` and `admins` groups** | a receipt breakdown (vendor · amount · tag) + claim totals; rejection reason |
| **Expense claim — edited** (admin edits a claim) | `PATCH /v1/expenses/claims/admin/:id` | the **submitter** + the **editing admin only** | the same receipt breakdown + totals |
| **Staff account removed (offboarding)** | `DELETE /v1/onboarding/people/:id` | the **`admins` group** + the person's **non-`skintyee.ca`** email (their `@skintyee.ca` mailbox is gone) | name, account, who deleted it |

**Not emailed:** Teams / Microsoft 365 **meetings & events** — Microsoft 365
already sends those calendar invites/notifications.

**Config** (env; unset ⇒ emails skipped):

| Var | Required | Notes |
|---|---|---|
| `MAILGUN_API_KEY` | ✅ | Mailgun private API key (Container App secret in prod) |
| `MAILGUN_DOMAIN` | ✅ | verified sending domain, e.g. `mg.skintyee.ca` |
| `MAILGUN_FROM` | — | **default** sender `Skin Tyee First Nation <it@skintyee.ca>` (overridable at runtime — see below) |
| `MAILGUN_REPLY_TO` | — | **default** Reply-To (overridable at runtime); unset ⇒ no Reply-To header |
| `MAILGUN_BASE_URL` | — | default `https://api.mailgun.net` (EU: `https://api.eu.mailgun.net`) |
| `APP_SIGNIN_URL` | — | sign-in link in the OTP email (default `https://app.skintyee.ca`) |

> **Setup:** create a Mailgun sending domain and add its DNS records (SPF/DKIM/
> tracking) at the registrar, verify in Mailgun, then set `MAILGUN_API_KEY` +
> `MAILGUN_DOMAIN`. Opt a single message out with `sendEmail:false` in the body.

### Runtime config — `GET/PUT /v1/admin/notification-settings` (admin)

The app's **System → Configure Notifications** screen (admin-only) drives a
small settings store ([`src/settings.service.ts`](./src/settings.service.ts),
persisted in the `AppSetting` table; in-memory fallback when Prisma is down):

- **Per-category kill-switches** — globally enable/disable each class of system
  email: `staffOtp`, `communityNotifications`, `timesheetEvents`,
  `expenseEvents`, `accountDeleted`. A disabled category short-circuits the send
  at the call site.
- **Sender identity** — `fromName` / `fromEmail` (the Mailgun `From`) and
  `replyTo` (the `Reply-To` header), applied to **every** outgoing email by
  `MailgunService`. These default to the `MAILGUN_FROM` / `MAILGUN_REPLY_TO`
  env values until an admin overrides them in the UI.

---

## Expense receipt math — tax, subtotal & line items

How an expense receipt's numbers are derived and validated (full detail in
[`../docs/features/expenses.md`](../docs/features/expenses.md) §"Receipt totals"):

- **Relation:** `subtotal + tax = total`. An item stores `amount` (claimed
  total), `taxAmount`, `currency` (forced **CAD** for now), and AI `lineItems`
  (`{description, amount, qty, excluded, isSummary}`).
- **Summary rows** (subtotal/total/tax/balance/change/payment… — by the
  `isSummary` flag **or** a label regex, in both `anthropic.service.ts` and the
  app's `isSummaryLine()`) **never count** toward the claimed amount and aren't
  toggleable. Tax + Total in the UI come from the form fields, so the AI's own
  tax/total lines are hidden (no duplicate tax line). The Subtotal line shows +
  is price-editable.
- **Tax derivation (scan, `ExpensesService.addItem`):** when itemised,
  `tax = round2(grandTotal − Σ real line items)` if `subtotal > 0 && tax ≥ 0`,
  else fall back to the AI's tax. User can override.
- **Claimed amount:** on scan `= grand total`; on include/exclude or a line
  price edit `= Σ(included non-summary lines) + taxAmount`; claim
  `totalAmount = Σ(item.amount)`.
- **Tax recompute (app):** editing the Total recalculates
  `tax = max(0, round2(total − subtotal))`, keeping `subtotal + tax = total`.
- **Subtotal validation (app):** warns when `Σ all (non-summary) line items ≠`
  the printed Subtotal line (±$0.01) — a read-quality check, ignoring exclusions.

---

## Recommended implementation (proposed)

> Decisive recommendation for the production API. See ADR-7 in
> [`../docs/architecture-decisions.md`](../docs/architecture-decisions.md).

| Concern | Recommendation | Why |
|---|---|---|
| **Language / framework** | **NestJS (TypeScript)** | Same language as the app; matches the ppt platform the team knows; first-class OpenAPI (`@nestjs/swagger`), DI, and **guards** for clean role-based auth. |
| **Auth** | **Microsoft Entra ID** (OIDC) via MSAL / `passport-azure-ad`; Nest **RolesGuard** maps Entra app roles/groups → `member`/`staff`/`admin` | Azure-native (ADR-1); role checks already specified per endpoint in the spec. |
| **Database** | **Azure Database for PostgreSQL – Flexible Server** with the **PostGIS** extension, via **Prisma** (migrations + typed client) | **PostGIS** gives first-class geospatial support for the diagram's **Land Allocation / GIS mapping** and the meeting/event map pins (lat/lng, spatial queries). Managed Postgres has auto backups + PITR (the NGO priority); SQL still aligns with the Ferrus/Adagio (Sage 300) data flows. (The WordPress site stays on MySQL — WordPress requires it.) |
| **Validation** | DTOs + `class-validator`, plus **request/response validation against `openapi.yaml`** in CI | Keeps code and contract in lock-step. |
| **GIS / mapping** | **PostGIS** geometry columns for parcels & pins; serve to the app as GeoJSON | Land allocation, GIS mapping, and map pins from the diagram. |
| **Financial data** | Integration service syncing **Ferrus ASAP Suite + Adagio / Sage 300** into the DB (read models for transparency/financials) | ADR-5. |
| **Notifications** | Persist + **push (Expo)**; optionally mirror to **skintyee.ca WordPress** by category | ADR-6. |
| **Packaging / hosting** | **Docker** image → **Azure Container Apps** (or App Service) behind `api.skintyee.ca`, Azure DNS + TLS | Matches the diagram and the website's Azure deployment. |
| **CI/CD** | **Azure DevOps** pipeline (build, test, `swagger-cli validate`, deploy) | Same org tooling as the website pipeline. |

**Contract-first workflow:** keep `openapi.yaml` authoritative. Generate the app's
typed client from it (e.g. `openapi-typescript`) to replace the hand-written
`ApiService` interface, and validate the NestJS implementation against it in CI.

**Next steps to production:** swap the in-memory `data.service.ts` for **Prisma
over Azure PostgreSQL + PostGIS**; replace the `x-role` header with **Entra ID**
JWT validation in `RolesGuard`; add `class-validator` DTOs (or
`express-openapi-validator`) to enforce the contract; wire the **Ferrus/Adagio**
finance sync and **WordPress**/push for notifications; deploy via Docker to
**Azure Container Apps** (see `../docs/roadmap.md`).

> POC note: data is in-memory (resets on restart) and roles come from an
> `x-role` header rather than a verified token — see `../app/STUBS.md`.
