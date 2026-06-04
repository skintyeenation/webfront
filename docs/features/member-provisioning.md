# Member provisioning

End-to-end "Add Member" flow that creates a real Microsoft Entra
identity, assigns an M365 license, drops the user into the right Entra
security groups, and optionally seeds a `Person` row so the worker is
ready for time-keeping + onboarding — all from one admin form.

Today the **Add Member** screen is a stub that mutates a Redux slice
in-process; nothing reaches Entra. This feature turns that screen into
the real provisioning surface and removes the disconnect between
"the admin sees the member in the directory" and "the member can
actually sign in."

## Status

- **Planned.** Four slices below; pick which ones to ship together.

## Decisions locked in

| Decision | Choice | Rationale |
|---|---|---|
| Identity source | **Microsoft Entra** via `POST /v1/admin/users` → Graph `POST /users` | ADR-1 already chose Entra as the identity provider. Anything we maintain on top would drift. |
| User creation auth | Application credential on the existing `skintyee-app-graph` Entra app | Same pattern as Planner / Meetings / group writes. No new app to provision. |
| License model | Graph `POST /users/{id}/assignLicense` after user create | Microsoft's first-party endpoint; works with the **least-privileged** `LicenseAssignment.ReadWrite.All` permission. **Not PowerShell** — Graph covers this fully (see [ADR-15](../architecture-decisions.md)). |
| SKU pick | Configured preference via env var; fall back to first-available | Lets the admin keep control without re-deploying when the SKU shape changes. |
| Security groups | Existing `skintyee-app-graph` write-back path | `Group.ReadWrite.All` is already granted (`scripts/setup-app-graph.sh`); slot directly into the chip picker EditMember already ships. |
| Staff record | Optional checkbox; reuse `OnboardingService.createPerson(...)` | Same shape as the existing add-from-People flow; no schema churn. |

## Current state (what gets removed)

- [`app/src/components/pages/AddMember.tsx`](../../app/src/components/pages/AddMember.tsx)
  dispatches `addMember()` from `app/src/store/modules/directory.ts`
  — a **client-side reducer** that prepends to
  `state.directory.entities`. No HTTP call; no persistence; lost on
  refresh.
- [`api/src/controllers.ts`](../../api/src/controllers.ts) `:284`
  exposes `@Post('/v1/directory')` that stuffs into
  `DataService.directory` (in-memory fixture). **Nothing calls it.**
- The real path users reach our directory through is
  `POST /v1/admin/seed-directory` (controllers.ts:344) which **pulls
  read-only** from Graph and upserts to Postgres. No app-driven
  creates today.

Existing **EditMember** screen already lets the admin toggle Entra
group memberships via chips, backed by
`PATCH /v1/directory/:id/groups` which diffs vs the user's current
`bandGroups` and writes the deltas through Graph
`POST/DELETE /groups/{id}/members/$ref`. We reuse that path verbatim
in Slice 4.

## Slices

### Slice 1 — Real Entra-backed Add Member

#### What ships

`POST /v1/admin/users` (admin-gated). Request body:

```ts
{
  displayName: string;
  mailNickname: string;           // typically firstname.lastname
  userPrincipalName: string;      // <mailNickname>@skintyee.ca
  jobTitle?: string;
  department?: string;
  phone?: string;
  password: string;               // one-time; admin enters or generates
  usageLocation: 'CA';            // hard-coded
  forceChangePasswordNextSignIn: boolean;
}
```

Steps:

1. **POST `https://graph.microsoft.com/v1.0/users`** with the body
   mapped to Graph's [user resource](https://learn.microsoft.com/graph/api/user-post-users).
   Mandatory fields per Graph: `accountEnabled`, `displayName`,
   `mailNickname`, `userPrincipalName`, `passwordProfile`,
   `usageLocation` (the last only when license assignment follows).
2. **Upsert `BandMember`** in Postgres immediately so the directory
   page shows the new row without waiting for the next
   `seed-directory` run. Derive `appRole` from the (about-to-be-set)
   `bandGroups` via the shared helper (see Cleanup below).
3. Return `{ id, upn, oneTimePassword }`. The UI shows the password
   once on a success card; we never persist it.

#### New permissions

| Permission | Type | Graph SP app-role GUID |
|---|---|---|
| `User.ReadWrite.All` | Application | `741f803b-c850-494e-b5df-cde7c675a1ca` |

Added to `scripts/setup-app-graph.sh` (idempotent re-run grants the
new role + re-consents).

#### UI changes

- AddMember.tsx posts to `/v1/admin/users` instead of dispatching the
  Redux reducer.
- Success state shows the one-time password with a Copy button and a
  warning: **"This is the only time the password will appear.
  Send it to {{name}} now."**

### Slice 2 — "Also create staff record"

#### What ships

A `Switch` on AddMember:

```
[ ✓ ] Also create staff record
      ↳ [ ✓ ] Enable timesheets
```

When **Also create staff record** is on, the controller chains a
second call to `OnboardingService.createPerson({...})` with:
- `bandMemberId` ← the new BandMember's id
- `displayName` ← from the form
- `email` ← UPN
- `timesheetsEnabled` ← from the sub-toggle (defaults true)

No new endpoint, no schema change. Just plumbing — the `Person` model
already supports this through the existing People CRUD path.

### Slice 3 — Auto-provision an M365 license

#### What ships

Two extra Graph calls inside the create endpoint:

1. **`GET https://graph.microsoft.com/v1.0/subscribedSkus`** on form
   mount → returns every SKU subscription with `prepaidUnits.enabled`
   and `consumedUnits`. Compute `available = enabled - consumed`.
2. **`POST /users/{id}/assignLicense`** after user creation:
   ```json
   {
     "addLicenses": [{ "skuId": "<guid>", "disabledPlans": [] }],
     "removeLicenses": []
   }
   ```
   `usageLocation` set in Slice 1 is required — Microsoft enforces it.

#### SKU pick logic

Order:
1. `PREFERRED_LICENSE_SKU_ID` env var (set on the api-prod Container
   App) — if it points at a SKU with `available > 0`, use it.
2. First SKU returned that has `available > 0`.
3. None available → endpoint returns the user without a license +
   the response payload carries `licenseAssigned: false` + a reason
   the UI surfaces in a warning banner.

#### New permissions

| Permission | Type | Graph SP app-role GUID |
|---|---|---|
| `LicenseAssignment.ReadWrite.All` | Application | `5facf0c1-8979-4e95-abcf-ff3d079771c0` |
| `Organization.Read.All` | Application | `498476ce-e0fe-48b0-b801-37ba7e2685c6` |

`LicenseAssignment.ReadWrite.All` is the **scoped permission Microsoft
introduced specifically so apps don't need `User.ReadWrite.All` or
`Directory.ReadWrite.All` for license ops** — narrower blast radius
if our app credential leaks. `Organization.Read.All` is required to
list the SKUs.

#### UI changes

A chip on the form showing live availability for the configured SKU:

```
[ ✓ ] Assign M365 license   (3 of 8 Business Basic available)
```

Disabled with helper text when `available === 0`.

### Slice 4 — Initial security-group assignment

#### What ships

The same chip picker EditMember uses, extracted into a shared
`<SecurityGroupPicker value={Set<slug>} onChange={…} />` component
under `app/src/components/layout/`. Drop it into both EditMember
(no behaviour change) and AddMember (new).

`POST /v1/admin/users` grows an optional `bandGroups: string[]` slug
array. After the Entra user is created:

1. Loop the slugs; for each, look up its Entra `objectId` from
   `api/src/skintyee-groups.ts` and call
   `POST /groups/{objectId}/members/$ref`.
2. Persist the slug list to `BandMember.bandGroups`.
3. Recompute `appRole` from the new memberships (shared helper).

Graph doesn't accept memberships in `POST /users` body — it's always
a separate write. Same shape as Slice 3's license assignment.

#### No new permissions

`Group.ReadWrite.All` already covers `/groups/{id}/members/$ref`
writes (`scripts/setup-app-graph.sh:71`).

#### Risks

- **Partial group writes** — if the user create succeeds but one
  group add fails (transient Graph error), the user is half-
  configured. Mitigation: collect failed slugs in the response;
  surface a banner *"User created. 2 of 3 groups added; couldn't
  add IT (retry from Edit Member)."* The admin retries via the
  existing EditMember flow.
- **Eventual consistency** — Graph's `memberOf` array lags by a few
  seconds. We keep `BandMember.bandGroups` as the local source of
  truth in that window.
- **Promotion to admins** — selecting the `admins` group from this
  form mints a new admin. The endpoint is already admin-gated, but
  the UI adds a confirmation: *"Selecting Admins grants the new
  user full app-admin access. Confirm."*

## Cleanup: shared appRole derivation helper

Today `appRole` is computed inside `graph-feed.service.ts:670-686`
(security-group lookup, then job-title heuristic, first hit wins).
Extract that switch into a small helper —
`api/src/role-derivation.ts` — and call it from both the seed path
and the new create path so the new user lands with a correct
`appRole` immediately rather than waiting for the next
`seed-directory`.

The derivation logic itself is unchanged; this is purely a code-
organisation move.

## End-to-end happy path

1. Admin opens **Band Management → Add member**.
2. Fills in: name, UPN, job title, phone.
3. Picks security groups (chip selector — same as EditMember).
4. Ticks **Auto-assign M365 license** (chip shows "3 of 8 Business
   Basic available").
5. Ticks **Also create staff record** + leaves the sub-toggle
   **Enable timesheets** on.
6. Generates / enters a one-time password.
7. Submits. The api/:
   - POSTs to Graph `/users` → returns new id.
   - POSTs to `/users/{id}/assignLicense` with the chosen SKU.
   - For each picked group, POSTs to `/groups/{groupId}/members/$ref`.
   - Upserts `BandMember` (Postgres), computes `appRole` from
     groups.
   - Creates a `Person` row linked to the new BandMember with
     `timesheetsEnabled=true`.
8. Success card: shows the one-time password, the SKU assigned, and
   a chip list of the groups the user landed in. Admin copies the
   password and texts it to the new band member.

## Setup script changes

`scripts/setup-app-graph.sh` adds three new rows to the `PERMS` array:

```bash
"741f803b-c850-494e-b5df-cde7c675a1ca=Role:User.ReadWrite.All"
"5facf0c1-8979-4e95-abcf-ff3d079771c0=Role:LicenseAssignment.ReadWrite.All"
"498476ce-e0fe-48b0-b801-37ba7e2685c6=Role:Organization.Read.All"
```

Re-run the script after merge; admin consent fires once per new
permission.

## Effort + scope

| Slice | Work | Time | New Graph perms |
|---|---|---|---|
| 1 | Real Entra-backed Add Member | 3–4h | `User.ReadWrite.All` |
| 2 | Also create staff record | ~30 min | none |
| 3 | Auto-provision M365 license | 2–3h | `LicenseAssignment.ReadWrite.All`, `Organization.Read.All` |
| 4 | Initial security-group assignment | 1–1.5h | none |
| – | Cleanup: shared appRole derivation helper | ~30 min | none |

**Total**: ~7–9 hours for all four slices + cleanup.

**Recommendation**: ship 1 + 2 + 4 + cleanup together (no new
permissions to consent), then add Slice 3 once you've re-run the
setup script to grant the new license permissions.

## Open questions

- **Password generation vs. admin-entered** — auto-generate
  (cryptographically random, 16+ chars) or let admin type? Auto-
  generate is safer; admin-typed lets the admin pre-share verbally.
  Defaulting to auto-generate with an override field probably
  threads the needle.
- **SharePoint provisioning hand-off** — should `Person` creation
  also kick off a SharePoint group invite for the worker's first
  meeting / document? Out of scope for v1; flag as Phase 2.
- **Audit log** — admin actions on this endpoint deserve a structured
  audit log entry. Defer to a future Phase 2 audit-logging feature
  rather than building it in here.

## References

- ADR-15 in [`docs/architecture-decisions.md`](../architecture-decisions.md)
  — the architecture decision for this feature.
- ADR-1 — Entra ID as identity provider.
- ADR-14 — `skintyee-app-graph` Entra app (the SP we extend here).
- [`docs/365/app-roles.md`](../365/app-roles.md) — appRole derivation
  rules; the cleanup helper preserves them verbatim.
- [`docs/features/timesheets.md`](timesheets.md) — `Person.timesheetsEnabled`
  axis that Slice 2 sets on create.
- [`scripts/setup-app-graph.sh`](../../scripts/setup-app-graph.sh)
  — the script that grants the new permissions.
- Microsoft Graph reference:
  - [Create user](https://learn.microsoft.com/graph/api/user-post-users)
  - [Assign license](https://learn.microsoft.com/graph/api/user-assignlicense)
  - [Subscribed SKUs](https://learn.microsoft.com/graph/api/subscribedsku-list)
  - [Add group member](https://learn.microsoft.com/graph/api/group-post-members)
