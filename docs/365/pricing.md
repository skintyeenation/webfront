# Microsoft 365 cost record — per user

**Prepared:** 2026-05-22
**Purpose:** Cost basis for the Microsoft 365 subscription, kept as supporting
documentation for business-expense / tax substantiation.
**Plans:** Microsoft 365 **Business Premium** (managed staff) + **Business Standard** (basic staff); **contractors are unlicensed** (app-only, $0)
**Provider:** Microsoft · **Billing:** per user / month

> **Note on evidence:** the figures below are the cost basis. The authoritative
> records for a tax claim are the **Microsoft / billing invoices** (Microsoft 365
> admin center → Billing → Invoices, or the partner/reseller invoices). This
> document records *what* is being paid for and *why* it is a necessary expense;
> attach the actual invoices alongside it.

## What the expense is for

Microsoft 365 gives each staff member a licensed account used to operate the
Nation's administration: business email (Exchange Online), the Office apps
(Outlook, Word, Excel, PowerPoint), **Microsoft Teams** (meetings/conferencing),
SharePoint, and OneDrive. It also underpins the **shared mailboxes**
(`info@`, `admin@`, `chief@skintyee.ca`, …) staff work from — see
[`shared-mailboxes.md`](shared-mailboxes.md).

## Plans & per-user price — tiered

We license **per user, by tier**, all in one tenant. The services are largely
identical; the real difference is the **device-management + advanced-security
layer (Intune, Defender for Business, Conditional Access)**, which **only Business
Premium** includes. **Intune is per-device opt-in**, so this is a per-user choice
— not all-or-nothing.

| Tier | Plan | Approx. CAD / user / mo (annual) | USD ref | Who |
|---|---|--:|--:|---|
| **Managed staff** | Business **Premium** | **≈ CAD $32.70** | US $22.00 | Org-owned devices needing Intune + Defender + Conditional Access (compliant-device) |
| **Basic staff** | Business **Standard** | **≈ CAD $18.60** | US $12.50 | Org-owned / domain-joined devices, no Intune needed |
| **Contractors (BYOD, app-only)** | **none** — unlicensed Entra user or B2B guest | **$0** | — | Use **only the Skin Tyee app** from their own devices |

> Monthly (no-commitment) pricing is higher: Business Premium ≈ US $26.40, Business
> Standard ≈ US $15.00 (≈ CAD $22.40) per user / mo.

**Why contractors are $0:** the Skin Tyee app is gated by **Entra app roles**, and
signing into *our own* registered app does **not** consume a Microsoft 365 license.
A contractor is just an Entra identity in the right app group — provisioned via the
app's no-license path (ADR-15) or invited as a **B2B guest** (free up to 50,000
monthly active users). No Intune, no email/Office, no on-prem account. (If a
contractor ever needs `@skintyee.ca` email, that's a Business Standard seat — the
exception, not the norm.)

> ⚠️ **Confirm the current price** before relying on it — Microsoft adjusts
> pricing and the CAD figure depends on the exchange rate and any
> non-profit/charity discount. Authoritative source:
> [Microsoft 365 Business plans pricing](https://www.microsoft.com/en-ca/microsoft-365/business/compare-all-microsoft-365-business-products).
> **Non-profit pricing:** registered non-profits can qualify for **discounted or
> donated** Microsoft 365 licenses via [Microsoft for Nonprofits](https://www.microsoft.com/en-us/nonprofits) —
> if eligible, the per-user cost is materially lower than the table above.

### What each Business Standard licence includes

- **Email** — Exchange Online, 50 GB mailbox, custom domain (`@skintyee.ca`).
- **Microsoft Teams** — chat, meetings, calling, conferencing.
- **Office apps** — desktop + web Outlook, Word, Excel, PowerPoint (+ Access/Publisher on Windows).
- **SharePoint** + **OneDrive** (1 TB/user) for files.
- Web/mobile apps and standard support.

### What Business Premium adds (managed-staff tier)

Everything in Standard, **plus** the device-management + security layer the
cloud-first model needs (see [`entra-connect.md`](entra-connect.md)):

- **Microsoft Intune** — manage Entra-joined devices (BitLocker, Defender
  baselines, app deployment, compliance, remote wipe).
- **Microsoft Defender for Business** — endpoint protection.
- **Entra ID P1** — **Conditional Access** (incl. require-compliant-device),
  group-based licensing, password write-back.

Assign Premium **only** to staff who need managed devices / Conditional Access;
basic staff stay on Standard and contractors stay unlicensed.

> **Shared mailboxes are free** (no licence) up to 50 GB — only the individual
> staff who access them need a licence. See [`shared-mailboxes.md`](shared-mailboxes.md).

## Cost basis (fill in the per-tier counts)

| Tier | Plan | CAD / user / mo | Count | Monthly (CAD) |
|---|---|--:|:--:|--:|
| Managed staff | Business Premium | $32.70 | **_P_** | $32.70 × P |
| Basic staff | Business Standard | $18.60 | **_S_** | $18.60 × S |
| Contractors (app-only) | none / B2B guest | $0 | **_C_** | $0 |

**Monthly total** = $32.70·P + $18.60·S **·** **Annual total** = ×12.

*Example: 4 managed (Premium) + 5 basic (Standard) + 3 app-only contractors →
≈ CAD $131 + $93 + $0 = **~$224/month**, **~$2,690/year** (before any non-profit
discount). Replace with the actual counts and the prices confirmed on Microsoft's
pricing page.*

## ⚠️ Offboarding — unlicense departed staff immediately

Microsoft 365 is billed **per assigned licence**, so a licence left on someone
who has left or been terminated keeps **costing ≈ CAD $18.60–32.70/month (by tier) for nothing**
— and leaves their account able to sign in. **As soon as an employee leaves or
is terminated, do this same day:**

1. **Block sign-in** — Users → Active users → select the person → **Block sign-in**.
2. **Remove their Microsoft 365 license** — same flyout → **Licenses and apps** →
   uncheck the license → **Save** (this stops the per-user charge and frees the seat).
3. **Reset the password / revoke sessions** so existing logins are cut off.
4. **Remove them from every shared mailbox** they had access to (see
   [`shared-mailboxes.md`](shared-mailboxes.md)) and from any groups/Teams.
5. **Preserve their mail if needed** — convert their mailbox to a **shared
   mailbox** (free, no licence) so colleagues retain the history, or set up
   forwarding, *before* the licence is removed.

> Removing the licence does **not** delete shared mailboxes or their contents —
> shared mailboxes are unlicensed and unaffected. Reclaimed seats can be assigned
> to a new hire. Keeping the licence count tight to **current, active staff** is
> also what keeps the expense (below) clean and defensible.

## Entra ID — what's included, what costs extra

Microsoft Entra ID is the **identity layer** that signs everyone in and
gates access to apps. It's licensed separately from Microsoft 365
Business Standard, though every M365 subscription includes the free
tier. Worth knowing what's free and what would cost extra if the
Nation's needs ever grow.

### What's already free (included with Business Standard)

- **Entra ID Free tier** — basic single sign-on, MFA, security defaults,
  B2B guest invites (up to 50,000 monthly active guests), self-service
  password reset for cloud users, ~500K directory objects.
- **App registrations** — unlimited, free. The two apps we created for
  the SharePoint publisher (`it-project-docs-publisher`,
  `skintyeenation-admin-cli`) cost $0 to register or hold.
- **Federated credentials / workload identity federation** — free.
  That's how the Azure Pipeline mints Graph tokens without a stored
  client_secret.
- **Multi-tenant app registrations** — free. We use *single-tenant*
  apps but flipping that flag costs nothing if needed.

### Paid tiers (USD reference — confirm CAD before relying on it)

| Tier | Approx. USD / user / mo | What it adds beyond Free |
|---|--:|---|
| **Entra ID P1** | ~$6 | Conditional Access, **group-based licensing**, dynamic groups, password write-back, SSPR for hybrid users, Cloud App Discovery |
| **Entra ID P2** | ~$9 | Everything in P1 + Identity Protection (risk-based Conditional Access), Privileged Identity Management (just-in-time admin elevation), Access Reviews |
| **Entra ID Governance** (add-on) | ~$7 | Entitlement management, lifecycle workflows, separation of duties |

> Most small organizations on Business Standard never need P1/P2.
> The point at which it becomes worth considering:
>
> - **P1** — when manually assigning M365 licenses per-user becomes
>   tedious (group-based licensing pays for itself once you have
>   ~10-15 staff and frequent turnover), or you want Conditional
>   Access to require MFA only from outside the band office IP.
> - **P2** — only if you have privileged admin accounts you want to
>   manage with just-in-time elevation, or external regulators
>   require access reviews. Almost never relevant for a band-sized
>   tenant.

### Multi-tenant scenarios (if you ever need them)

| Scenario | Cost |
|---|---|
| Inviting external collaborators as **B2B guests** | Free up to 50,000 monthly active guests; premium features on guests count against your P1/P2 license pool at 1:5 (one license covers up to 5 premium guests) |
| **Cross-tenant sync** (auto-provision users between two tenants you own) | Requires P1 in both tenants; no per-sync fee on top |
| **Entra External ID** (public sign-up — band members or general public sign in to the band app without being staff) | First 50,000 MAU free; then ~$0.00325/MAU for premium features |
| Operating **multiple tenants** | Free to create; each tenant has its own license bill (licenses don't cross tenants) |

> Skin Tyee currently uses **one tenant, Entra ID Free**. The community
> app accesses Entra via the band staff's existing M365 licenses (one
> login per staff member). If the app ever needs band members
> themselves to sign in (without being licensed staff), that's
> **Entra External ID** territory and would still be free up to 50K
> monthly actives.

### Why we use Entra ID and not a separate identity provider

- **One Microsoft account** — staff sign in once with
  `firstname.lastname@skintyee.ca` and that account works for Outlook,
  Teams, SharePoint, Azure portal, Azure DevOps, the Skin Tyee app,
  1Password (via SSO), and any future internal app. Adding a new
  user → one form in M365 admin center. Removing → one toggle in
  Entra (and every system loses access immediately).
- **No standalone IdP fees** — Auth0, Okta, etc. would charge per-user
  on top of M365. Entra is included.
- **Conditional Access is on the table** — if/when the Nation needs
  MFA-only-from-outside-band-office, that's a P1 upgrade away (≈$54/mo
  for the current ~9 users). Cheaper than buying it from a separate
  vendor.

See [`groups.md`](groups.md) for the M365 Groups vs Security Groups
breakdown — that's where group-based licensing (a P1 feature) becomes
relevant if/when we adopt P1.

## Canadian tax treatment — 100% deductible

Under Canadian income-tax law, Microsoft 365 is an **ordinary operating expense
incurred to earn income / run the organization, and is fully (100%) deductible
in the year it is incurred.**

- **It's a current expense, not capital.** Microsoft 365 is a **subscription /
  licence paid per month** — you are not acquiring a capital asset. So it is
  deducted in full in the year incurred under the general rule that expenses
  incurred to earn income are deductible (Income Tax Act **s. 9** computing
  profit, and **s. 18(1)(a)**). It is **not** depreciated through Capital Cost
  Allowance the way a one-time software *purchase* of an enduring asset might be.
- **No personal-use restriction.** It is used wholly for the organization's
  operations, so there is no allocation to a non-deductible personal portion —
  the whole amount qualifies.
- **GST/HST.** If the entity is registered for GST/HST, the tax charged on the
  subscription is generally recoverable as an **input tax credit**, so the *net*
  cost is the price excluding recoverable tax. (A band / non-profit that is not
  registered would expense the tax-inclusive amount.)
- **Record-keeping.** Keep the monthly Microsoft invoices as evidence (see the
  note at the top); they substantiate both the deduction and any ITC claim.

> **Not tax advice.** This is an internal cost record for substantiation.
> Confirm treatment with the organization's accountant / CRA for its specific
> situation (e.g., band/non-profit status, GST/HST registration, any donated
> licensing).
