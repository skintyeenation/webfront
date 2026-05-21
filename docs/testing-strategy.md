# Skin Tyee App — Testing Strategy

Testing approach for the Skin Tyee app (`@skintyee/app`). Part of the proposal.
Companion to [`app-plan.md`](./app-plan.md) and [`roadmap.md`](./roadmap.md).

> **Status:** the POC ships the feature scaffold first; the test suites described
> here are planned/standardized work delivered across the engagement (see the
> roadmap). The app is structured to be testable — UI is separated from the
> `ApiService` data seam and the Redux store, so logic can be tested without a
> backend.

## Test layers

### 1. Unit tests — store, helpers, mock API
- **Scope:** reducers and async thunks (`src/store/modules/*`), the action
  factory and reducer helpers (`src/store/factory.ts`, `helpers.ts`), and the
  mock `ApiService` (`src/services/api/mock/*`).
- **Tooling:** **Jest** with `ts-jest` / `babel-jest` (the ppt repos already use
  Jest with the `react-native` preset — same convention).
- **Why it's easy here:** thunks resolve through the injected `apiFactory`, so a
  test can swap in a fake `ApiService` and assert the resulting state.

### 2. Component / screen tests
- **Scope:** screens render correct content and respect **role gating** (e.g. a
  `public` user does not see member contact details or admin tabs; `member` can
  vote, `public` cannot).
- **Tooling:** **@testing-library/react-native**, rendering screens inside a test
  store with a seeded role.

### 3. End-to-end (E2E) tests
- **Scope:** key flows across navigation — browse events, open a member,
  cast a poll vote, switch roles and confirm the tab set changes.
- **Tooling:** **Maestro** or **Detox** for the native app; **Cypress** for the
  web target (consistent with the ppt monorepo, which uses Cypress for web e2e).

### 4. User Acceptance Testing (UAT)
- **Scope:** band staff and council validate the app against the diagram's
  features on real devices — Directory, Events, Meetings, Public Records, Time
  Keeping, Financials, Polling/Surveys — per role.
- **Process:** scripted UAT checklist mapped to the feature/role matrix in
  `app-plan.md`; feedback tracked and triaged before the release candidate.
- **Timing:** Phase 3 (see roadmap), once live API + Entra ID sign-in are in.
- **Beta distribution to testers:**
  - **iOS — TestFlight.** Internal + external testers; builds via **EAS Build**,
    submitted with `eas submit` (the ppt app already uses EAS).
  - **Android — Google Play.** Internal testing → closed testing tracks in the
    Google Play Console; builds via EAS Build, submitted to Play.
  - Testers install the real signed app on their own devices; UAT feedback comes
    from these tracks before promoting to production.

## CI

- Run unit + component tests on every push (the org uses Azure DevOps pipelines;
  the website subproject already has `azure-pipelines.yml`). A matching app
  pipeline runs `pnpm --filter @skintyee/app test` and typecheck.

## Current gaps (to set up)

- No test runner is configured in `app/package.json` yet — add Jest + RNTL,
  a `test` script, and an initial smoke test as the first testing task.
- E2E harness (Maestro/Detox/Cypress) to be selected and wired in Phase 2–3.
