# ImprovMX — email forwarding

**Prepared:** 2026-05-22
**Purpose:** What ImprovMX is used for and its cost basis (business-expense / tax
substantiation).

## What it's for

**ImprovMX** provides **email forwarding** for our domains — it accepts mail sent
to addresses on a domain and forwards it to a real inbox. We use it to route
addresses/aliases (and mail to the secondary domains `skintyee.com/.org/.net`)
into the Microsoft 365 mailboxes, without needing a full M365 mailbox for every
alias.

> ImprovMX **forwards** mail; it is not the primary mailbox. Day-to-day mail for
> `@skintyee.ca` lives in **Microsoft 365** (see [`../365/shared-mailboxes.md`](../365/shared-mailboxes.md)).
> Forwarding requires MX/TXT records on the domain — managed in **Azure DNS**
> (see [`../godaddy/domains.md`](../godaddy/domains.md)).

## Plan & price

| Plan | Approx. price | Notes |
|---|--:|---|
| **Free** | **$0** | Forwarding for 1 domain, limited aliases — fine for basic forwarding |
| **Premium** | ~**US $9 / mo** (~CAD $12; ~$90/yr) | More aliases, multiple domains, SMTP **sending**, higher limits |
| **Business** | ~**US $29 / mo** | Higher volume / more domains |

> ⚠️ **Confirm the current plan & price** — record which tier we're actually on.
> Authoritative source: [improvmx.com/#pricing](https://improvmx.com/#pricing).
> If we only forward (no sending) for one domain, the **Free** tier may be
> sufficient → **$0**.

## Cost basis

| Item | Cost (CAD, approx.) |
|---|--:|
| ImprovMX (record the tier) | **$0** (Free) — or ~$12/mo (~$144/yr) on Premium |

## Canadian tax treatment — 100% deductible

If on a paid tier, it's an **ordinary operating expense, fully (100%) deductible**
in the year incurred (current subscription expense — Income Tax Act **s. 9** /
**s. 18(1)(a)**; not capital). If registered, GST/HST is recoverable as an **input
tax credit**. Keep the invoices. *(Free tier: no cost to deduct.)*

> **Not tax advice** — confirm with the organization's accountant / CRA.
