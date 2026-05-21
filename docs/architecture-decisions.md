# Architecture Decisions — Skintyee App

Decision record for the Skintyee app (`@skintyee/app`, in `app/`). Lives in the
**root webfront repo** docs. Companion to [`app-plan.md`](./app-plan.md).

> **Context:** the app reuses the ppt (Mediashare / PocketPT) app's stack, theme,
> and conventions, but the *backing cloud services* are deliberately Azure, not
> the AWS services ppt happened to use. The platform is already Microsoft/Azure
> end-to-end (Azure DNS zones, Azure Cloud DB, Outlook email relay, Microsoft
> Teams, Azure Storage backups — per `SkinTyee.drawio.pdf`), so the app follows
> suit.

## Decisions

### ADR-1 — Auth: Microsoft Entra ID (not AWS Cognito)
- **Decision:** real authentication will use **Microsoft Entra ID (Azure AD)**.
- **Replaces:** ppt used AWS Cognito (via AWS Amplify).
- **Why:** matches the org's Microsoft/Azure footprint (Teams, Outlook, Azure).
- **Intended path:** OIDC / MSAL flow via `expo-auth-session`, mapping Entra app
  roles or group claims onto the app's `Role` union (`public | member | admin`).
- **Status:** **stubbed.** A dev role switcher (`src/store/modules/auth.ts` +
  the Account screen) stands in for real sign-in. See `app/STUBS.md`.

### ADR-2 — Object storage: Azure Blob Storage (not AWS S3)
- **Decision:** file/object storage will use **Azure Blob Storage**.
- **Replaces:** ppt used AWS S3 (media uploads).
- **Why:** consistent with the diagram (Azure Storage, write-only automated
  backups) and the Azure-everywhere posture.
- **Status:** **not yet implemented** — no upload/storage feature exists in this
  build. Forward decision only.

### ADR-3 — Backend & database: API Server → Azure Cloud DB
- **Decision:** a future **API Server** backed by **Azure Cloud DB**, served at
  `App.SkinTyee.ca` (per diagram).
- **Status:** **mocked.** All data access goes through the typed `ApiService`
  seam (`app/src/services/api/`), currently served by an in-memory mock. Swap in
  an HTTP implementation when the API exists. See `app/STUBS.md`.

### ADR-4 — Single self-contained app (no source-lib / app-shell split)
- **Decision:** `@skintyee/app` is **one pnpm workspace package**; no shared
  source library and no white-label app-shell/git-submodule wrapper.
- **Why:** the ppt split exists only to white-label multiple apps from one
  source. Skintyee is a single app and does not need it.

## Summary: ppt → Skintyee service swaps

| Concern | ppt (AWS) | Skintyee (Azure) | Status |
|---|---|---|---|
| Identity | AWS Cognito / Amplify | **Microsoft Entra ID** | stubbed (role switcher) |
| Object storage | AWS S3 | **Azure Blob Storage** | not implemented |
| Database / API | Mongo + Nest microservices | **Azure Cloud DB** + API Server | mocked behind `ApiService` |
| App packaging | source lib + app-shell submodules | **single self-contained app** | done |
