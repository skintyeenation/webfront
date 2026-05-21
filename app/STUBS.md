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

## 2c. Notifications feed — mocked (→ skintyee.ca WordPress)

- **What:** the in-app Notifications inbox and its categories.
- **Where:** `src/models` (`NotificationCategory`), `fixtures.ts` (`notifications`),
  `store/modules/notifications.ts`, `components/pages/Notifications.tsx`.
- **Categories** mirror the WordPress taxonomy in
  `../website/importer/setup-categories.php`: Health, Safety, Council, Events,
  Programs, News, Announcements.
- **Replace with:** a feed driven by skintyee.ca WordPress posts in those
  categories (+ real push delivery — see §4). See ADR-6.

## 3. Object storage — not implemented (→ Azure Blob Storage)

- **What:** no file upload/download. ppt used AWS S3; this app will use
  **Azure Blob Storage**. No storage feature is wired in this POC.
- **Future home:** document/media features (e.g. Public Records attachments,
  meeting minutes) would add an upload service behind a `StorageService` seam,
  backed by Azure Blob.

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
  **placeholder wordmark** — a thunderbird-nod icon + "Skintyee"
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
