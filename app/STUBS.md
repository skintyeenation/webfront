# Stubs — `@skintyee/app`

This app is a **proof-of-concept** (see `../docs/app-plan.md`). To demonstrate the
full experience without standing up infrastructure, several things are
**stubbed**. This file is the authoritative catalogue: what is faked, where it
lives, and how to replace it with the real thing.

Every stub in the code is also marked with an inline `// STUB:` comment — grep
for `STUB` to find them all:

```bash
grep -rn "STUB" src app.config.js
```

The intended real services are Azure (see `../docs/architecture-decisions.md`):
**Entra ID** for auth, **Azure Blob Storage** for files, **Azure Cloud DB** +
API Server for data.

---

## 1. Backend / data layer — mocked

- **What:** there is no real backend. The diagram shows a future
  `App.SkinTyee.ca → API Server → Azure Cloud DB`; none of it exists yet.
- **Where:**
  - `src/services/api/ApiService.ts` — the typed interface (the contract).
  - `src/services/api/mock/MockApiService.ts` — in-memory implementation.
  - `src/services/api/mock/fixtures.ts` — hand-authored sample data.
  - `src/store/apis.ts` — `apiFactory` selects the implementation.
  - `src/config.ts` / `app.config.js` `extra.apiServer` — set to `'mock'`.
- **Behavior:** data resets on reload; `delay()` simulates latency; poll votes
  mutate in memory only.
- **Replace with:** add an `HttpApiService implements ApiService` that calls the
  real API, then branch on `Config.apiServer` in `apiFactory`. No screen or
  store-module changes should be needed — they only depend on `ApiService`.

## 2. Authentication & roles — stubbed (→ Microsoft Entra ID)

- **What:** no real sign-in. A dev **Role Switcher** stands in for identity.
- **Where:**
  - `src/store/modules/auth.ts` — holds `role` + `name`; `setRole` action.
  - `src/components/pages/Account.tsx` — the Role Switcher UI.
  - Role gating: `src/Application.tsx` (`tabsByRole`) and per-screen checks in
    `MemberDetail`, `Events`, `PollDetail`.
- **Replace with:** **Microsoft Entra ID** (Azure AD) via an OIDC/MSAL flow
  (`expo-auth-session`). Map Entra app roles / group claims onto the `Role`
  union (`public | member | admin`) and dispatch the resolved role instead of
  the manual switcher. (ppt used AWS Cognito — intentionally not used here.)

## 2b. Financial / program data — mocked (→ Ferrus ASAP + Adagio / Sage)

- **What:** the **Transparency** view (Public Records → band expenditures by
  program area, with drill-down breakdowns of how much was spent and where), the
  **Dashboard** charts, and admin **Financial Records**.
- **Where:**
  - `src/services/api/ApiService.ts` — `transparency.expenditures()`, `financials.list()`.
  - `src/services/api/mock/fixtures.ts` — `expenditures` (areas + breakdowns) and `financials`.
  - Screens: `PublicRecords.tsx` (transparency + chart), `ExpenditureDetail.tsx`
    (breakdown), `Dashboard.tsx`, `Financials.tsx`. Charts use `components/layout/BarChart`.
- **Replace with:** the **Ferrus Computers ASAP Suite** integrated with **Adagio
  Accounting / Sage 300** (program areas map to ASAP modules: Housing, Income
  Assistance, Membership, Post-Secondary, Training & Employment, Child & Family
  Services). Likely surfaced through the API Server. See ADR-5 in
  `../docs/architecture-decisions.md`.

## 2f. Sage Intacct sync — stubbed (→ Sage Intacct XML Web Services)

- **What:** when finance/admins **approve** a timesheet or expense claim, the api/
  pushes it into **Sage Intacct** (a TIMESHEET / EEXPENSES record) so approved
  time + expenses post to the accounting system automatically.
- **Where (api/ — `@skintyee/api`):**
  - `api/src/sage-intacct/sage-intacct-client.ts` — the client contract +
    `SAGE_INTACCT_CLIENT` DI token + Intacct DTO types (`IntacctTimesheet` →
    `TIMESHEET`/`TIMESHEETENTRY`, `IntacctExpenseReport` → `EEXPENSES`/`EEXPENSESITEM`,
    line `glAccount` from `ExpenseTag.glAccount`).
  - `api/src/sage-intacct/stub-sage-intacct.client.ts` — `StubSageIntacctClient`:
    logs the mapped payload, returns a canned `TS-STUB-<n>` / `EE-STUB-<n>` key,
    **no real HTTP**.
  - `api/src/sage-intacct/sage-intacct-sync.service.ts` — `SageIntacctSyncService`
    (`syncTimesheet` / `syncExpenseClaim`): loads the row from Prisma, maps
    app→Intacct DTOs (workerUpn/submitterUpn → employeeId, tagSlug → GL account),
    calls the client. Best-effort — catches + logs, never throws.
  - Wired in `api/src/app.module.ts` (factory keyed on `SAGE_INTACCT_DRIVER`) and
    called from the approve handlers in `api/src/controllers.ts`
    (`TimeKeepingController.approve`) and `api/src/expenses.controller.ts`
    (`ExpensesController.approve`) — search `// STUB:`.
- **STUB:** the bound client is `'stub'` (`SAGE_INTACCT_DRIVER` default / unset).
  It logs and returns a synthetic key instead of posting anything; setting
  `SAGE_INTACCT_DRIVER=live` warns and falls back to the stub (no live client yet).
- **Replace with:** a `LiveSageIntacctClient implements SageIntacctClient` that
  XML-POSTs to the Intacct Web Services Gateway (session auth via
  `SAGE_INTACCT_SENDER_ID`/`_SENDER_PASSWORD`/`_COMPANY_ID`/`_USER_ID`/
  `_USER_PASSWORD`, as Container App secrets), bound when `SAGE_INTACCT_DRIVER=live`.
  No sync-service or controller changes needed — they depend only on the
  `SageIntacctClient` interface. (Complements the Adagio / Sage 300 GL mapping in §2b.)

## 2c. Notifications feed — mocked (→ skintyee.ca WordPress)

- **What:** the in-app Notifications inbox and its categories.
- **Where:** `src/models` (`NotificationCategory`), `fixtures.ts` (`notifications`),
  `store/modules/notifications.ts`, `components/pages/Notifications.tsx`.
- **Categories** mirror the WordPress taxonomy in
  `../website/importer/setup-categories.php`: Health, Safety, Council, Events,
  Programs, News, Announcements.
- **Replace with:** a feed driven by skintyee.ca WordPress posts in those
  categories (+ real push delivery — see §4). See ADR-6.

## 2cc. Devices inventory — mocked (→ Microsoft Graph `/devices`)

- **What:** the **Assets → Devices** admin screen — a list of Entra-registered
  devices and a per-device detail view showing who can access each one
  (registered owners + users).
- **Where:** `services/api/ApiService.ts` (`devices` service, `DeviceDto` /
  `DeviceDetailDto` / `DeviceUserDto`), `fixtures.ts` (`devices`),
  `MockApiService.ts` (`devices`), `HttpApiService.ts` (`devices` → `/v1/devices`),
  `components/pages/Devices.tsx` + `DeviceDetail.tsx`, menu entry in `MoreMenu.tsx`.
- **STUB:** the mock serves hand-authored device fixtures. The real path expects
  the api/ to expose `GET /v1/devices` and `GET /v1/devices/:id` backed by
  Microsoft Graph (`/devices`, `/registeredOwners`, `/registeredUsers` —
  `Device.Read.All`). **That api/ endpoint does not exist yet** — a follow-up to
  wire to the live tenant (consistent with the other Graph-backed surfaces).

## 2d. Admin authoring (create/manage) — in-memory only

- **What:** admins can **add / delete / cancel** content in-context:
  - Events — add, cancel (toggle), delete.
  - Band Meetings — add, cancel (toggle), delete.
  - Notifications — post, delete.
  - Directory — add member, remove member.
  - Time Keeping — staff/admin add their own timesheet; admins approve.
- **Where:** `CreateEvent.tsx`, `CreateMeeting.tsx`, `PostNotification.tsx`,
  `AddMember.tsx`, `AddTimesheet.tsx`; the `add*/remove*/cancel*/approveTimeEntry`
  slice actions; `components/layout/AdminAddButton` (role-gated).
- **STUB:** changes are dispatched to the Redux store only — **not persisted**;
  they reset on reload and are not sent to any backend. Wire these to the real
  `ApiService` once it exists.

## 2e. Maps location picker — needs an API key

- **What:** Schedule Meeting has a Google Maps **draggable-pin** location picker
  (`components/layout/LocationPicker.tsx`); the chosen lat/lng are saved on the
  meeting. Web only (native shows a fallback note).
- **Key:** read from the environment via `app.config.js`
  (`GOOGLE_MAPS_API_KEY` / `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`) → `Config.googleMapsApiKey`.
  **Never commit the key.** Run locally with the var set, e.g.
  `GOOGLE_MAPS_API_KEY=… pnpm --filter @skintyee/app start`. With no key the
  picker shows a fallback message. The key may need localhost added to its HTTP
  referrer allow-list.

## 3. Object storage — not implemented (→ Azure Blob Storage)

- **What:** no file upload/download. ppt used AWS S3; this app will use
  **Azure Blob Storage**. No storage feature is wired in this POC.
- **Future home:** document/media features (e.g. Public Records attachments,
  meeting minutes) would add an upload service behind a `StorageService` seam,
  backed by Azure Blob.
- **Wired since:** the **Documents** library and **Expenses** receipts both go
  through the pluggable `DOCUMENT_STORAGE` adapter in the api/ (Blob in prod via
  `scripts/setup-app-documents-blob.sh`; in-memory otherwise).

## 3b. AI receipt extraction — real, key-gated (→ Anthropic Claude)

- **What:** the **Expenses** module reads each uploaded receipt with **Claude
  vision** (`api/src/anthropic.service.ts`) to pre-fill amount / vendor / date
  and suggest a GL-coded tag. The api/ calls the Anthropic Messages API directly.
- **Gate:** with **no `ANTHROPIC_API_KEY`** the service is a graceful no-op — the
  receipt is stored and the worker types the fields in by hand. Turn it on in
  prod with `scripts/setup-app-anthropic.sh`. See `docs/features/expenses.md`.

## 4. Cross-cutting diagram items — not implemented

From `../docs/SkinTyee.drawio.pdf`, present for completeness but out of scope for
the POC:
- **Push notifications** — the in-app **Notifications inbox** (tab + screen) is
  built and reads from the mock `ApiService.notifications`. **Real push
  delivery** (Expo Notifications + backend triggers / device tokens) is **not**
  wired — only the in-app list exists.
- **Auto-publish to skintyee.ca** — meetings/events/staff data are not published
  to the WordPress site; that integration is backend-side.
- **Write-only automated backup** — backend/infra concern, not in the app.

## 5. App identity & assets — placeholders

- **Where:** `app.config.js`.
- **What:**
  - `ios.bundleIdentifier` / `android.package` = `ca.skintyee.app` (placeholder).
  - App icon / splash / favicon are **omitted** (Expo defaults used) — no artwork
    yet. Add files to `assets/` and re-add the fields.
- **Logo (header + splash):** the header (top-left) and the in-app splash show a
  **placeholder wordmark** — a thunderbird-nod icon + "Skin Tyee"
  (`components/layout/Logo.tsx`, `SplashScreen.tsx`), because no real logo file is
  available. skintyee.ca uses a "thunderbird" logo (WP attachment sha1
  `48facf18…`, see `../website/importer/build-home-elementor.php`) but the local
  WordPress uploads volume is currently empty. To use the real mark: add
  `app/assets/logo.png` and switch `Logo.tsx` to the `<Image>` form in its comment.
- **Fonts:** the app pins a **sans-serif (non-serif) system stack** in
  `src/styles.tsx` (the ppt CircularStd `.otf` files are not bundled). To match
  ppt's CircularStd exactly later, add the `.otf` files to `assets/fonts/` and
  load them via `useFonts` in `Application.tsx`, then point the theme fonts at
  them. Keep them sans-serif.
