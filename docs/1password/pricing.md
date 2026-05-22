# 1Password cost record — per user

**Prepared:** 2026-05-22
**Purpose:** Cost basis for the 1Password subscription, kept as supporting
documentation for business-expense / tax substantiation.
**Plan:** 1Password **Business** (per user / month)
**Provider:** AgileBits (1Password) · **Billing:** per user, billed annually

> **Note on evidence:** the figures below are the cost basis. The authoritative
> records for a tax claim are the **1Password invoices** (1Password admin →
> Billing, or the reseller invoices). This document records *what* is being paid
> for and *why* it is a necessary expense; attach the actual invoices.

## What the expense is for

1Password is the organization's **password manager** — it stores and shares the
credentials, secrets, and logins staff need to do their jobs (email/admin
portals, Microsoft 365, Azure, banking, vendor accounts, the website, etc.) in
encrypted **vaults** with per-team/per-role access. It is a core **security
control**: it lets the Nation use strong, unique passwords, share access without
emailing passwords around, and **cut off access instantly when someone leaves**.

## Plan & per-user price

| Plan | Approx. price | Notes |
|---|--:|---|
| **1Password Business** | **US $7.99 / user / mo** (billed annually) ≈ **CAD ~$11 / user / mo** | Unlimited vaults, admin controls, reporting, SSO; **free linked Families account** per user |
| 1Password Teams Starter Pack | US $19.95 / mo flat, **up to 10 users** | Cheaper if you have ≤ ~3 users; no per-seat scaling |

> ⚠️ **Confirm the current price and which plan we're on** — pricing and the
> CAD/USD rate change. Authoritative source:
> [1Password pricing](https://1password.com/business-pricing). **Non-profit
> discount:** 1Password offers **discounted/donated** plans for registered
> non-profits and charities — if eligible, the per-user cost is lower than above.

### What 1Password Business includes

- Unlimited vaults, items, and **item/vault sharing** by team/role.
- **Admin controls** — provision/suspend users, manage group access, recovery.
- **Activity log & reports** for auditability.
- 1 GB document storage per person; **free 1Password Families** account per member.
- SSO/identity integration and security policies.

## Cost basis (fill in the user count)

| | |
|---|--:|
| Users | **_N_** (1Password admin → People) |
| Per user / month (Business, annual, approx.) | CAD $11 |
| **Monthly total** | CAD $11 × _N_ |
| **Annual total** | CAD $132 × _N_ |

*Example: 9 users → ≈ CAD $99/month, ≈ CAD $1,188/year (before any non-profit
discount). Replace with the actual count and the price confirmed on 1Password's
pricing page; if ≤ ~3 users, compare against the Teams Starter Pack flat rate.*

## ⚠️ Offboarding — deprovision departed staff immediately

A password manager holds the keys to everything, so this is **security-critical,
not just a cost issue**. **The moment an employee leaves or is terminated:**

1. **Suspend the user** in 1Password (admin → People → **Suspend**). This
   immediately revokes their access to all shared vaults while keeping their data
   recoverable. (Suspended users **don't count toward billing**.)
2. **Recover/reassign** anything they owned in private vaults if needed
   (admin recovery), then **remove** the user to free the seat.
3. **Rotate every shared secret they had access to** — passwords, API keys,
   banking/vendor logins in vaults they could see must be changed, since they
   may have copied them.
4. Coordinate with the **Microsoft 365 offboarding** ([`../365/pricing.md`](../365/pricing.md))
   — block sign-in + remove the M365 licence at the same time.

> Suspending/removing promptly both **closes the security hole** and **stops
> paying for a seat** that's no longer used. Reclaimed seats can be reassigned.

## Canadian tax treatment — 100% deductible

Under Canadian income-tax law, 1Password is an **ordinary operating expense
incurred to run the organization, and is fully (100%) deductible in the year it
is incurred.**

- **Current expense, not capital** — it's a recurring **subscription/licence**,
  not the acquisition of a capital asset, so it's deducted in full in the year
  incurred (Income Tax Act **s. 9** / **s. 18(1)(a)**), not depreciated via CCA.
- **No personal-use portion** — used wholly for the organization's operations.
- **GST/HST** — if registered, the tax charged is generally recoverable as an
  **input tax credit**, so the net cost excludes recoverable tax.
- **Record-keeping** — keep the 1Password invoices as evidence.

> **Not tax advice.** Internal cost record for substantiation; confirm treatment
> with the organization's accountant / CRA for its specific situation
> (band/non-profit status, GST/HST registration, any donated licensing).
