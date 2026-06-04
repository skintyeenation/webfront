# App roles

The Skin Tyee app has four roles. They're stored as `BandMember.appRole`
in Postgres, derived once at directory-seed time from Microsoft Entra
data, and surface on every API request via the `x-role` HTTP header. UI
screens (and `RolesGuard` on the api/) gate by this single axis.

The roles are **separate from** `Person.timesheetsEnabled`, which gates
who can write timesheets independent of role. See
[`docs/features/timesheets.md`](../features/timesheets.md) for that.

## The four roles

| Role | Sees |
|---|---|
| `admin` | Everything — Admin tools section, Approvals, all CRUD endpoints. |
| `staff` | Tools section (My Timesheets, Directory, Forms & Documents, Polls). **Not** Approvals. **Not** Financial Summary. |
| `member` | Band Member Directory, Forms & Documents, Polls, Financial Summary. |
| `public` | Anonymous browse — Directory, Polls, Financial Summary. |

## Derivation (first hit wins)

Source: `BandMember` seed in
[`api/src/graph-feed.service.ts`](../../api/src/graph-feed.service.ts)
(`getDirectory()`). Re-runs from
`POST /v1/admin/seed-directory`.

1. **Break-glass account** → `admin`. Identified by the
   `breakGlass` claim on the Entra user.
2. **Entra security group membership** (slugs from
   [`api/src/skintyee-groups.ts`](../../api/src/skintyee-groups.ts)):
   - `admins`, `system-admin` → `admin`
   - `chief`, `council` → `admin`
   - `management`, `it`, `band-manager`, `finance` → `staff`
3. **Job-title heuristic** (fallback when groups didn't decide it):
   - `chief` / `council` text in title, OR
     `director|manager|admin` regex match → `admin`
   - Any other non-empty title → `staff`
4. **No title and no matching group** → `member`.

The derivation lives in one block — to change the mapping, edit that
single switch and re-seed (`POST /v1/admin/seed-directory`).

## Active role at request time

The `x-role` header sets the caller's role on every API call.

  - **Production path** (planned, not yet wired): Entra JWT validation
    in `RolesGuard` → role derived from the user's claims, header
    ignored.
  - **Dev path** (current): the [Account screen's Role
    Switcher](../../app/src/components/pages/Account.tsx) lets any user
    pick a role (`public` / `member` / `staff` / `admin`); the
    selection writes into the auth slice and `HttpApiService` sets the
    header from there. **This is a dev-only spoofing surface** — drop
    it before shipping to band members in prod.

## Gating examples

| Screen | Gate |
|---|---|
| Approvals tab on Time Keeping | `role === 'admin'` |
| Admin tools section in More | `role === 'admin'` |
| Section title in More | `'Admin tools'` for admin; `'Tools'` for staff + member; `'Community'` for public |
| Financial Summary | `public`, `member` only — not `staff` (operational role, not transparency audience) |
| My Timesheet view in Time Keeping | Visible to anyone, but the form gate keys on `Person.timesheetsEnabled` (separate axis) |
| Per-doc visibility in Documents | `audience` ladder — `admin > staff > band_member > public` (see [`docs/features/documents-and-onboarding.md`](../features/documents-and-onboarding.md)) |

## Related docs

- [`docs/365/entra-id.md`](entra-id.md) — Entra app + group provisioning.
- [`docs/365/groups.md`](groups.md) — Entra security groups vs M365 groups.
- [`docs/365/entra-usage.md`](entra-usage.md) — what we currently use Entra for.
- [`docs/features/timesheets.md`](../features/timesheets.md) — `timesheetsEnabled` axis.
- [`api/src/skintyee-groups.ts`](../../api/src/skintyee-groups.ts) — the slug catalog the derivation matches against.
