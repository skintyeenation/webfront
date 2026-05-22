# Pricing overview — recurring costs

**Prepared:** 2026-05-22
**Purpose:** One-page summary of the recurring software/service costs, each
linking to its detailed cost record. All are **ordinary operating expenses and
100% tax-deductible** under Canadian law (current expenses, not capital — see
each doc; not tax advice).

> Figures are approximate — confirm against the actual invoices. Per-user
> services scale with headcount; **fill in the real licensed-user count `N`**.
> Registered-non-profit discounts (Microsoft for Nonprofits, 1Password) may
> lower the per-user costs materially.

## Summary

| Service | What it's for | Basis | Approx. cost (CAD) | Detail |
|---|---|---|--:|---|
| **Microsoft 365** Business Standard (w/ Teams) | Email, Teams, Office, shared mailboxes | per user / mo (annual) | **~$18.60 / user** | [`365/pricing.md`](365/pricing.md) |
| **1Password** Business | Password manager / shared secrets | per user / mo (annual) | **~$11 / user** | [`1password/pricing.md`](1password/pricing.md) |
| **GoDaddy** domains (×4) | `skintyee.ca` + `.com/.org/.net` | per year (fixed) | **$122.96 / yr** (~$10/mo) | [`godaddy/pricing.md`](godaddy/pricing.md) |
| **Azure** hosting | Website infrastructure (VM + managed MySQL + storage) | per month (fixed) | **~US $56/mo** (~CAD $76/mo, ~$915/yr) | [`hosting-costs.md`](hosting-costs.md) |
| **Apple** Developer Program | Publish the app (TestFlight / App Store) | per year (fixed) | **~US $99/yr** (~CAD $135; **$0** if non-profit waiver) | [`app-distribution-costs.md`](app-distribution-costs.md) |
| **Google Play** Developer | Publish the app (Android) | one-time | **~US $25** (~CAD $34, setup only) | [`app-distribution-costs.md`](app-distribution-costs.md) |
| **IntelliJ IDEA Ultimate** | Developer IDE (1 seat) | per year / seat | **~US $599/yr** (~CAD $815, yr 1) | [`developer-tools.md`](developer-tools.md) |
| **Claude (Anthropic) Max** | AI coding assistant — Claude Code (1 seat) | per month | **~US $100/mo** (~CAD $136) | [`developer-tools.md`](developer-tools.md) |

## Worked example — 9 licensed users

Replace `9` with the actual count; domains + Azure are fixed regardless of headcount.

| Service | Monthly (CAD) | Annual (CAD) |
|---|--:|--:|
| Microsoft 365 — 9 × ~$18.60 | ~$167 | ~$2,009 |
| 1Password — 9 × ~$11 | ~$99 | ~$1,188 |
| GoDaddy domains | ~$10 | $122.96 |
| Azure hosting (~US $56 → CAD) | ~$76 | ~$915 |
| Apple Developer Program (~US $99/yr) | ~$11 | ~$135 |
| IntelliJ IDEA Ultimate (1 seat) | ~$68 | ~$815 |
| Claude Max (Claude Code, 1 seat) | ~$136 | ~$1,632 |
| **Total (example)** | **~$567 / mo** | **~$6,817 / yr** |

Plus a **one-time** Google Play registration of ~CAD $34 at setup. Apple's
~$135/yr is **$0** if the non-profit fee waiver is approved. Developer tools
(IntelliJ, Claude) are **per developer** — these assume one developer.

## Notes

- **Per-user services (M365, 1Password)** scale with staff — keep the licence
  count to current, active people. **Remove licences/seats immediately when
  someone leaves** (cost + security): see the offboarding sections in
  [`365/pricing.md`](365/pricing.md) and [`1password/pricing.md`](1password/pricing.md).
- **Fixed services (GoDaddy, Azure)** don't scale with headcount but are
  mission-critical — keep **domain auto-renew on** and Azure billing current.
- **Currency:** Microsoft/1Password bill in USD-derived CAD (rate-dependent);
  Azure is quoted in USD. Confirm CAD on the invoices.
- **Evidence for tax:** the authoritative records are the **invoices** from each
  provider — keep them with these docs.
