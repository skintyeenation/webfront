# Skin Tyee App — Roadmap & Timeline

Delivery timeline for the Skin Tyee app (`@skintyee/app`). Part of the proposal.
Companion to [`app-plan.md`](./app-plan.md) and
[`architecture-decisions.md`](./architecture-decisions.md).

> **Engagement: 3 months** — May 2026 through **end of August 2026**.
> Three phases of work (POC → live backend & identity → storage, integrations &
> hardening), delivering a production-ready release candidate.

## Phases

### Phase 1 — Proof of Concept (≈ May → mid-June 2026) — *in progress*
Demonstrate the experience and the role-based feature set from the diagram.
- React Native + Expo app, ppt theme/stack reused.
- All 7 features in the menu with role gating (Public / Member / Admin+Staff).
- Mock data behind a typed `ApiService`; dev role switcher in place of real auth.
- **Deliverable:** runnable demo (web + mobile) for the proposal.

### Phase 2 — Real backend & identity (≈ mid-June → mid-July 2026)
Replace the stubs with real Azure services.
- Stand up the **API Server → Azure Cloud DB**; implement an HTTP `ApiService`
  and switch over from the mock.
- **Microsoft Entra ID** auth (OIDC/MSAL via `expo-auth-session`); map Entra
  roles/group claims to app roles, retire the dev role switcher.
- **Deliverable:** app running against live API with real sign-in.

### Phase 3 — Storage, integrations & hardening (≈ mid-July → end Aug 2026)
- **Azure Blob Storage** for documents/uploads (Public Records, meeting minutes).
- Push notifications; **auto-publish** of meetings/events/staff data to
  `skintyee.ca`.
- Branding/assets (icon, splash, fonts), accessibility pass, native builds
  (iOS/Android), UAT with band staff.
- **Deliverable:** production-ready release candidate.

## Milestones (target dates)

| Milestone | Target |
|---|---|
| POC demo ready (Phase 1) | mid-June 2026 |
| Live API + Entra ID sign-in (Phase 2) | mid-July 2026 |
| Storage + integrations + RC (Phase 3) | end of August 2026 |
