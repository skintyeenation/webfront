# Pricing overview — software & service costs

**Prepared:** 2026-05-22
**Purpose:** One-page summary of the software/service costs — **recurring**
(monthly/annual) and **one-time** (setup) — each linking to its detailed cost
record. All are **ordinary operating expenses and 100% tax-deductible** under
Canadian law (current expenses, not capital — see each doc; not tax advice).

> Figures are approximate — confirm against the actual invoices. Per-user
> services scale with headcount; **fill in the real licensed-user count `N`**.
> Registered-non-profit discounts (Microsoft for Nonprofits, 1Password) may
> lower the per-user costs materially.

## Summary

| Service | What it's for | Basis | Approx. cost (CAD) | Detail |
|---|---|---|--:|---|
| **Microsoft 365** — Business **Premium** (managed staff) | Email/Teams/Office **+ Intune + Defender + Conditional Access** | per user / mo (annual) | **~$32.70 / user** | [`365/pricing.md`](365/pricing.md) |
| **Microsoft 365** — Business **Standard** (basic staff) | Email, Teams, Office, shared mailboxes | per user / mo (annual) | **~$18.60 / user** | [`365/pricing.md`](365/pricing.md) |
| **Microsoft 365** — contractors (BYOD, **app-only**) | Skin Tyee app only — no Microsoft license | per user / mo | **$0** (unlicensed / B2B guest) | [`365/pricing.md`](365/pricing.md) |
| **1Password** Business | Password manager / shared secrets | per user / mo (annual) | **~$11 / user** | [`1password/pricing.md`](1password/pricing.md) |
| **GoDaddy** domains (×4) | `skintyee.ca` + `.com/.org/.net` | per year (fixed) | **$122.96 / yr** (~$10/mo) | [`godaddy/pricing.md`](godaddy/pricing.md) |
| **Azure** hosting | Website infrastructure (VM + managed MySQL + storage) | per month (fixed) | **~US $56/mo** (~CAD $76/mo, ~$915/yr) | [`hosting-costs.md`](hosting-costs.md) |
| **Apple** Developer Program | Publish the app (TestFlight / App Store) | per year (fixed) | **~US $99/yr** (~CAD $135; **$0** if non-profit waiver) | [`app-distribution-costs.md`](app-distribution-costs.md) |
| **Google Play** Developer | Publish the app (Android) | one-time | **~US $25** (~CAD $34, setup only) | [`app-distribution-costs.md`](app-distribution-costs.md) |
| **IntelliJ IDEA Ultimate** | Developer IDE (1 seat) | per year / seat | **~US $599/yr** (~CAD $815, yr 1) | [`developer-tools.md`](developer-tools.md) |
| **Claude (Anthropic) Max** | AI coding assistant — Claude Code (1 seat) | per month | **~US $100/mo** (~CAD $136) | [`developer-tools.md`](developer-tools.md) |
| **ImprovMX** | Email forwarding (aliases / secondary domains → M365) | per month | **$0** (Free) — or ~US $9/mo Premium | [`improvmx/`](improvmx/README.md) |
| **Mailgun** | Transactional / app outbound email | usage-based | **$0** (free/low volume) — or ~US $15–35/mo | [`mailgun/`](mailgun/README.md) |
| **Anthropic API** (Claude Haiku 4.5) | App **runtime** — AI receipt scanner in Expenses (reads a receipt image → structured data) | usage-based | **~$0** until wired to a funded key — order of **≤ 1¢ per receipt** | see *Notes* below |

## Worked example — 9 staff (4 Premium + 5 Standard) + 3 app-only contractors

Replace the counts with the actuals; domains + Azure are fixed regardless of headcount.
Contractors are unlicensed (app-only) and add **$0**.

| Service | Monthly (CAD) | Annual (CAD) |
|---|--:|--:|
| Microsoft 365 — managed staff 4 × ~$32.70 | ~$131 | ~$1,570 |
| Microsoft 365 — basic staff 5 × ~$18.60 | ~$93 | ~$1,116 |
| Microsoft 365 — contractors (app-only) × 3 | $0 | $0 |
| 1Password — 9 × ~$11 | ~$99 | ~$1,188 |
| GoDaddy domains | ~$10 | $122.96 |
| Azure hosting (~US $56 → CAD) | ~$76 | ~$915 |
| Apple Developer Program (~US $99/yr) | ~$11 | ~$135 |
| IntelliJ IDEA Ultimate (1 seat) | ~$68 | ~$815 |
| Claude Max (Claude Code, 1 seat) | ~$136 | ~$1,632 |
| **Total (example)** | **~$624 / mo** | **~$7,494 / yr** |

Plus a **one-time** Google Play registration of ~CAD $34 at setup. Apple's
~$135/yr is **$0** if the non-profit fee waiver is approved. Developer tools
(IntelliJ, Claude) are **per developer** — these assume one developer.
**ImprovMX** and **Mailgun** are assumed at **$0** (free/low-volume tiers); add
~CAD $12/mo and ~$20/mo respectively if on paid plans.

## Notes

- **Per-user services (M365, 1Password)** scale with staff — keep the licence
  count to current, active people. **Remove licences/seats immediately when
  someone leaves** (cost + security): see the offboarding sections in
  [`365/pricing.md`](365/pricing.md) and [`1password/pricing.md`](1password/pricing.md).
- **M365 is tiered to control cost** — only **managed staff** need Business
  **Premium** (the Intune/Defender/Conditional-Access layer, ~$32.70); **basic
  staff** stay on **Standard** (~$18.60); **contractors are app-only and
  unlicensed ($0)** since signing into the Entra-gated app consumes no M365
  licence. Right-size the tier per person — don't put everyone on Premium. See
  [`365/entra-connect.md`](365/entra-connect.md) for the tier model.
- **Fixed services (GoDaddy, Azure)** don't scale with headcount but are
  mission-critical — keep **domain auto-renew on** and Azure billing current.
- **Currency:** Microsoft/1Password bill in USD-derived CAD (rate-dependent);
  Azure is quoted in USD. Confirm CAD on the invoices.
- **Evidence for tax:** the authoritative records are the **invoices** from each
  provider — keep them with these docs.
- **Anthropic API (runtime AI receipt scanning)** — the app's **Expenses**
  receipt scanner calls **Claude Haiku 4.5** (vision) to turn a receipt photo
  into structured data (amount, vendor, date, tax, line items). This is the
  **pay-as-you-go Anthropic API** and is **distinct from the Claude Max dev
  seat** above (that's the developer's Claude Code subscription, not a runtime
  cost). Haiku 4.5 pricing is roughly **US $1 / 1M input tokens** and **US $5 /
  1M output tokens**, so a single receipt — a vision image plus a short prompt
  in, a few hundred JSON tokens out — costs on the order of **US $0.005–0.01**.
  Even at hundreds of receipts per month this is a few dollars. **`max_tokens`
  is a cap, not a charge:** you pay only for the tokens the model actually
  generates, so the default output cap of **32768** (override with
  `ANTHROPIC_MAX_TOKENS`) — raised from 512 to stop long itemised receipts from
  truncating mid-list — does **not** increase the per-receipt cost. The feature
  stays at **$0** until `ANTHROPIC_API_KEY` is pointed at a funded account; with
  no key the scanner cleanly degrades to manual entry.
