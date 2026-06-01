# `@skintyee/app` — Build Plan

Plan for the Skin Tyee First Nation mobile/web application, built in
`skintyee/app/`. The app reuses the **ppt (PocketPT / Mediashare) app's stack,
theme, and conventions** but implements **Skin Tyee-specific features and
role-based menus** taken from [`SkinTyee.drawio.pdf`](./SkinTyee.drawio.pdf).

> **This is a proof-of-concept (POC)** supporting a proposal — not production.
> The goal is to demonstrate the experience and the role-based feature set from
> the diagram. Real backing services are intentionally deferred: data is mocked,
> auth is a dev role switcher. See [`architecture-decisions.md`](./architecture-decisions.md)
> for the intended real services (Entra ID, Azure Blob Storage, Azure Cloud DB).

> **Status:** in progress on branch `feature/app` (scaffold underway).

## 0. Key architecture decision — no app shell / no white-labeling

The ppt platform splits into **`mediashare-source`** (a shared RN source library)
plus thin **app-shell wrappers** (`mediashare-app`, `ppt_mediashare-subscription`)
that consume the source as a git submodule. That split exists **only to
white-label multiple apps from one source**.

**Skin Tyee does not need this.** We are building **one self-contained app**, not
white-labeling. So:

- `@skintyee/app` is a **single pnpm workspace package** — all code lives in
  `app/src/`. There is **no separate source library and no app-shell wrapper /
  git submodule**.
- `App.tsx` is a trivial entry point only (Expo's `registerRootComponent`
  target); it is *not* a white-label shell.

If multi-app white-labeling is ever needed later, the source could be extracted
then — but it is explicitly out of scope now.

---

## 1. Goal

A React Native + Expo app that:

- **Looks and feels like the ppt app** — same Material UI (React Native Paper),
  same dark theme, same Redux Toolkit `createAsyncThunk` patterns, same
  navigation approach.
- **Does what the diagram shows** — Band Member Directory, Community Events,
  Band Meetings, Public Records, Time Keeping, Financial Records, and Polling /
  Surveys / Voting, with access gated by actor role.
- **Has no real backend yet** — every API/data access is **stubbed with
  documented mock data**, and auth is a **stubbed role switcher**
  (Public / Band Member / Admin+Staff). These are designed to be swapped for the
  real Azure-hosted API later.

---

## 2. Confirmed decisions

| Decision | Choice |
|---|---|
| Data layer | **Mock/stub** — ppt async-thunk store pattern, thunks backed by local fixtures behind a typed `ApiService` interface |
| Auth | **Stubbed role login now → Microsoft Entra ID (Azure AD) as the chosen real provider.** Not AWS Cognito (what ppt used). Intended path: OIDC/MSAL via `expo-auth-session`, mapping Entra app roles / group claims to the `Role` union. Build ships the dev role switcher; Entra wiring is deferred. |
| Object storage | **Azure Blob Storage** as the chosen provider — **not** AWS S3 (what ppt used). Matches the diagram (Azure Storage, Azure Cloud DB, write-only backups). No upload/storage feature is wired in this build, so this is a forward decision only. |
| Backend / DB | Future **API Server → Azure Cloud DB** (per diagram, at `App.SkinTyee.ca`). Mocked for now behind `ApiService`. |
| Theme | **Keep ppt theme as-is** — `styles.tsx` palette/fonts unchanged; re-brand later |
| Stubs | **Documented** — `app/STUBS.md` + inline `// STUB:` markers |

**Azure-everywhere rationale:** the platform is already Microsoft/Azure (Azure
DNS zones, Azure Cloud DB, Outlook email relay, Microsoft Teams, Azure Storage
backups in the diagram). So the app's real backing services should be Azure —
Entra ID for identity and Azure Blob Storage for files — rather than the AWS
services (Cognito + S3) the ppt app happened to use.

---

## 3. Reused from ppt (`bcdev_mediashare-source`)

The look-and-feel and engineering patterns we deliberately keep:

- **React Native Paper** Material UI, using `MD2DarkTheme`.
- **`styles.tsx` theme, unchanged:** background `rgba(30,30,30)`, primary
  `#00B8EC` (cyan), accent `#EC6A37` (orange), success `#9ECD3B`,
  `roundness: 0`, CircularStd fonts.
- **Redux Toolkit `createAsyncThunk`** via the `makeActions` factory
  (snake_case action names) plus the `store/helpers`
  (`reducePendingState` / `reduceFulfilledState` / `reduceRejectedState`,
  `thunkApiWithState`).
- **React Navigation 6** (+ material-bottom-tabs).
- **TypeScript** throughout.
- Entry pattern: `main.tsx → Application.tsx → routes.tsx`.

---

## 4. How it differs from ppt

- **Self-contained pnpm workspace package** (`@skintyee/app`), *not* the
  ppt-style shared-source-library + git-submodule wrapper split. `skintyee/app`
  is already a pnpm workspace member, so the app is a single package. We keep
  ppt's *internal* folder conventions, not its multi-repo topology.
- **Features replace media/playlists** with the Skin Tyee feature set below.
- **No AWS Cognito and no OpenAPI/RxJS generated clients.** Auth and data are
  replaced by a typed `ApiService` interface backed by mock fixtures, so the
  future real backend (API Server → Azure Cloud DB) can be dropped in.

---

## 5. Features & menu (from the diagram)

> **Homescreen redesign (2026-06; ADR-14):** the original "Dashboard
> = charts" feature listed below has evolved. The **new homescreen**
> is a unified notifications + calendar/list feed combining app
> events + Microsoft Teams meetings + Microsoft Planner due-dates,
> with separate **My tasks** and **Team tasks** views. The charts
> originally on the Dashboard stay accessible via **Public Records →
> Transparency** for public/member, and the **Records page (admin
> view)** picks up operational management depth (Planner board
> rollups, drill-into-plan, etc.). See
> [`features/planner-dashboard.md`](features/planner-dashboard.md)
> for the new design + the per-role visibility matrix.

Actors in the diagram: **Public**, **Band Members**, **Band Admins / Staff**.

| Feature | Public | Member | Admin/Staff |
|---|:--:|:--:|:--:|
| **Dashboard** (stats + charts) | view | view | view |
| Band Member Directory | — | full | full |
| Community Events | view | view | manage |
| **Notifications** (centered with Events) | view | view | manage |
| Band Meetings | — | view | manage |
| **Public Records → Transparency** (band expenditures by program area, with drill-down breakdowns) | view | view | manage |
| Time Keeping (for workers) | — | — | yes |
| Financial Records | — | — | **admin only** |
| Polling + Surveys / Vote on Issues | view results | vote | manage |

**Notifications** are an in-app inbox whose categories mirror the skintyee.ca
**WordPress taxonomy** — Health, Safety, Council, Events, Programs, News,
Announcements (e.g. Water Boil Advisory → Health, wildfire alert → Safety). In
the tab bar, **Events and Notifications are kept centered** for every role.

**Public Records = transparency.** Rather than generic documents, this surfaces
**where the Nation's money goes** — band expenditures by program area (Housing,
Public Works, Education, Employment & Training, Health, Social Assistance, Child
& Family Services, IT, Administration), each drilling into a breakdown of *how
much was spent and where*. Backed by the **Ferrus ASAP Suite + Adagio / Sage**
financial integration (mocked for the POC). The **Dashboard** and the **Records**
page both present this as charts: a **pie** budget summary (spend by area), a
**budget-vs-actual** bar (allocated vs actual spend per area), and a **Major
Projects** section tracking each capital project's **allocated budget vs actual
spend** with status. Dashboard stats include *spent this year*, *spent vs
allocated*, *band members*, and *average spend per member*. Charts use the
in-house dependency-free `BarChart` plus a `PieChart` (react-native-svg).

Cross-cutting items from the diagram, handled as **documented stubs**:
Push delivery for Notifications, Auto-Publish (Meetings/Events/Staff data) →
skintyee.ca website, API Server, Azure Cloud DB, the Ferrus/Adagio financial
integration, and write-only Automated Backup. See `app/STUBS.md` and
[`architecture-decisions.md`](./architecture-decisions.md).

Charts are rendered with a dependency-free in-house `BarChart` (plain Views), so
they work identically on web and native in the POC.

---

## 6. Proposed structure

```
app/
  package.json            # @skintyee/app — Expo, RN Paper, RTK, React Navigation, TS
  app.config.js, babel.config.js, tsconfig.json, metro.config.js, index.js
  App.tsx                 # mirrors ppt: imports src/main
  STUBS.md                # catalogue of every stub + how to replace it
  src/
    main.tsx, Application.tsx, routes.tsx
    styles.tsx            # theme copied verbatim from ppt
    config.ts
    store/
      index.ts, factory.ts, helpers.ts                 # ppt async-thunk patterns
      modules/
        auth.ts           # stubbed role switcher
        appState.ts
        directory.ts, events.ts, meetings.ts,
        publicRecords.ts, timekeeping.ts, financials.ts, polls.ts
    services/
      api/ApiService.ts   # typed interface = the future Azure API contract
      api/mock/*.ts        # STUB fixtures, each clearly marked
    components/
      layout/, pages/      # one screen per feature (RN Paper components)
    models/                # BandMember, Event, Meeting, Record, TimeEntry, Poll, ...
```

Navigation: material bottom tabs + stacks, with tabs/items filtered by the
active role. A dev-only **role switcher** (in a Settings/Account screen) flips
Public / Member / Admin so every menu is demoable without a real IdP.

---

## 7. Stub documentation policy

Per requirement, **every stub is documented**:

- **`app/STUBS.md`** — a catalogue listing each stub and its "replace this
  with…" note, covering: mock auth/roles, each mock data module, Auto-Publish to
  skintyee.ca, push notifications, write-only backup, and the API Server ↔ Azure
  Cloud DB boundary. All point at the `ApiService` seam.
- **Inline `// STUB:` comments** at every mock seam in code.
- Update the `app/` section of `skintyee/CLAUDE.md` (currently "empty
  placeholder") to describe the real app, its stack, and the stub boundary.

---

## 8. Out of scope

These are **separate boxes in the diagram**, not part of the "SkinTyee App":
ERP / Sage Intacct / Adagio / ASAP suites, the WordPress website (`website/`),
and the Azure DevOps pipelines.

---

## 9. First-cut scope (proposed default)

- Scaffold **all 7 features in the menu** + navigation + theme + role gating.
- Fully build **3 representative screens** with mock data: **Directory, Community
  Events, Polling/Surveys**.
- Mock-stub the other 4 (Meetings, Public Records, Time Keeping, Financial
  Records) as list+detail to extend later.

> Alternative: flesh out all 7 screens immediately. To be confirmed.

---

## 10. Git & verification

- **Branch:** `feature/app` off `master`. Final merge with `git merge --no-ff`,
  subject `Merge branch 'feature/app' into 'master'` (per `skintyee/CLAUDE.md`
  conventions). No commit/merge until explicitly requested.
- **Verify:** `pnpm --filter @skintyee/app start` boots; web target renders; role
  switcher drives the gated menus; each wired screen shows mock data; typecheck
  passes.
