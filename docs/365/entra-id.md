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

## Where things live

| Thing | Where |
|---|---|
| Break-glass admin creds | 1Password — IT/Admin vault |
| Entra admin center | <https://entra.microsoft.com> |
| Microsoft 365 admin center | <https://admin.microsoft.com> |
| Azure portal | <https://portal.azure.com> |

> All three consoles authenticate against the **same Entra tenant** — one
> identity, one set of admins.
