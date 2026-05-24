# Microsoft Entra ID, the admin account & access

How identity ties Microsoft 365, Azure, the app, and (eventually) workstations
and servers together — and what the `admin@skintyeenation.onmicrosoft.com`
account is for. Companion to [`shared-mailboxes.md`](shared-mailboxes.md).

## The tenant admin — `admin@skintyeenation.onmicrosoft.com`

This is the tenant's **initial Global Administrator**. `skintyeenation.onmicrosoft.com`
is the **default Microsoft Entra tenant domain** created with the tenant;
`skintyee.ca` is the custom domain added on top for everyday email.

**What it controls — one identity governs all three:**

- **Microsoft 365** — full admin: users, licenses, Exchange/shared mailboxes,
  Teams, security & compliance.
- **Microsoft Entra ID** (formerly Azure AD) — the **identity directory** shared
  by 365 *and* Azure (users, groups, MFA, SSO, devices).
- **Azure** — the Azure subscription is tied to the **same Entra tenant**, so
  this Global Admin can own/assign access to the Azure subscription and manage
  resources (the website VM, **Azure DNS**, the future Azure Cloud DB, etc.).

**Why the `.onmicrosoft.com` address:** it always works even if `skintyee.ca`
DNS/MX is misconfigured or expires — so it's the reliable **break-glass** admin
login.

### Treat it as a break-glass account ⚠️

- Strong unique password stored in **1Password** (IT/Admin vault — see
  [`../1password/setup.md`](../1password/setup.md)), **MFA enforced**, **not used
  for daily work**.
- Day-to-day administration is done from **named admin accounts** (each person's
  own `@skintyee.ca` account granted the needed admin role), not this shared one.
- Monitor its sign-ins; keep recovery contact/phone current; review who knows it.

## Microsoft Entra ID — one directory for everything

Entra ID is the **cloud identity** behind M365, Azure, and apps. Define each
person once; assign **licenses and access by group**. It provides **MFA**,
**Conditional Access**, **SSO**, and device management (with Intune). Disabling a
person's Entra account cuts off M365, Azure, app sign-in, and devices **at once**
— which is why offboarding is one action (see [`pricing.md`](pricing.md#️-offboarding--unlicense-departed-staff-immediately)).

## Entra ID Connect — sync with on-prem Active Directory

If we run an **on-premises Active Directory** (a domain controller for the
onsite server / domain-joined workstations), **Microsoft Entra Connect**
(Connect Sync, formerly Azure AD Connect) synchronizes those on-prem accounts up
to Entra ID:

- **Password hash sync** → the **same username/password** works on-prem *and* in
  the cloud (M365/Azure). This is "**hybrid identity**".
- A lightweight alternative is **Entra Connect cloud sync** (agent only, no full
  server) for simpler environments.

If we go **cloud-only** (no on-prem AD), we skip Connect entirely — identities
live directly in Entra ID and devices are **Entra-joined**.

> Decision point: we have an **onsite server** (per `docs/SkinTyee.drawio.pdf`).
> Choose **cloud-only** (simplest — Entra join + Intune) unless workstations/
> servers must domain-join a local AD, in which case run **Entra Connect** for
> hybrid identity.

## Single sign-on (SSO)

Entra ID is the **SSO provider** — one login (with MFA) for:

- **Microsoft 365** and the **Azure portal**.
- **The Skin Tyee app** — authenticates via Entra ID (see ADR-1 in
  [`../architecture-decisions.md`](../architecture-decisions.md)); Entra app
  roles / groups map to the app's `member` / `staff` / `admin` roles.
- **Other SaaS** (e.g., 1Password, the ERP) can be connected to Entra SSO so
  staff have **one identity + MFA** across tools instead of separate passwords.
  The **1Password integration is documented** in
  [`../1password/setup.md → Entra ID SSO`](../1password/setup.md#entra-id-sso)
  (admin-side, ~60 min one-time setup) and
  [`../onboarding/1password.md → Step 6`](../onboarding/1password.md#step-6--connect-1password-to-entra-id-unlock-with-sso)
  (end-user side, switching an existing account to Unlock with SSO).

## Workstation & server access via Entra ID

The plan is to manage device sign-in with the **same Entra identity**:

- **Workstations (Windows)** —
  - **Microsoft Entra join** (cloud): staff sign in to the PC with their Entra
    account; manage/secure with **Intune** (policies, compliance, BitLocker, app
    deployment).
  - **Hybrid Entra join**: for PCs joined to an on-prem AD synced via Entra Connect.
- **Servers** —
  - **Azure VMs**: enable **Entra ID login** to sign in to Windows/Linux VMs with
    Entra credentials + Azure RBAC (no separate local accounts).
  - **On-prem servers**: via AD (hybrid) where applicable.
- **Controls** — **Conditional Access** (require MFA / compliant device for M365,
  Azure, and apps), **least-privilege** admin roles, optionally **PIM** for
  just-in-time admin elevation, and **device compliance** policies.

## How the app will simplify identity administration (future)

Today, adding a person and giving them the right access means several manual
steps across the **Entra** and **Microsoft 365** admin centers (create the user,
assign a license, set group/role membership, add them to shared mailboxes). The
Skin Tyee app's **Admin** area is the place to fold all of that into **one
friendly flow** so band admins — not just IT — can manage people.

The app's API (NestJS) calls the **Microsoft Graph API** (with an Entra **app
registration** + admin-consented permissions) so that app actions drive Entra/365
behind the scenes:

- **Add a member/staff in the app → provision them in Entra/365:** create the
  Entra account, **assign the Microsoft 365 license**, set **group membership**
  (which is what grants role-based access), and add them to the relevant **shared
  mailboxes** — all from the app's existing *Add member* screen.
- **Assign / change a role in the app → it maps to an Entra group / app role.**
  One role change in the app updates **both** the app's access *and* the person's
  Microsoft 365 / SSO access, because the app reads role from Entra (ADR-1) and
  writes it back via Graph. No separate "set role here, then there".
- **Offboard in the app → deprovision everywhere:** an app action **blocks
  sign-in and removes the license** in Entra (the same immediate-offboarding rule
  in [`pricing.md`](pricing.md#️-offboarding--unlicense-departed-staff-immediately)),
  and drops the person from groups/shared mailboxes — one click instead of a
  checklist.

**Why it matters:** one **friendly UI** for the whole user lifecycle (add → assign
role → offboard); changes stay **consistent and auditable**; and it removes the
need for everyone who manages staff to be fluent in the Entra/365 admin centers.

> Requires least-privilege Graph permissions (e.g. `User.ReadWrite.All`,
> `Group.ReadWrite.All`, license management) on the app's Entra app registration,
> with admin consent. This builds on the app's current **role gating** and
> **directory add/edit/remove** (which are mocked today — see `../../app/STUBS.md`).

## Where things live

| Thing | Where |
|---|---|
| Break-glass admin creds | 1Password — IT/Admin vault |
| Entra admin center | <https://entra.microsoft.com> |
| Microsoft 365 admin center | <https://admin.microsoft.com> |
| Azure portal | <https://portal.azure.com> |

> All three consoles authenticate against the **same Entra tenant** — one
> identity, one set of admins.
