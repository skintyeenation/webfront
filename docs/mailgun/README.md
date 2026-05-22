# Mailgun — transactional email

**Prepared:** 2026-05-22
**Purpose:** What Mailgun is used for and its cost basis (business-expense / tax
substantiation).

## What it's for

**Mailgun** is a **transactional / outbound email service (API + SMTP)** — it's
how our *software* sends automated email reliably: app/website system mail such
as notifications, password resets, contact-form submissions, and alerts. It is
**separate from staff mailboxes** (Microsoft 365) — Mailgun sends machine email
on behalf of the apps, not person-to-person mail.

> Sending from `@skintyee.ca` via Mailgun needs domain auth records (SPF / DKIM /
> a tracking CNAME) in **Azure DNS** (see [`../godaddy/domains.md`](../godaddy/domains.md)),
> coexisting with the Microsoft 365 mail records.

## Plan & price

Mailgun is largely **usage-based** (priced per emails sent):

| Plan | Approx. price | Notes |
|---|--:|---|
| **Free / trial** | **$0** | Low monthly volume to start / evaluate |
| **Pay-as-you-go / Basic** | from ~**US $15 / mo** | ~10k emails/mo + overage per 1,000 |
| **Foundation** | ~**US $35 / mo** | ~50k emails/mo, higher limits, more features |

> ⚠️ **Confirm the current plan & volume** — Mailgun's tiers and per-email rates
> change, and our cost depends on how many emails the apps send. Authoritative
> source: [mailgun.com/pricing](https://www.mailgun.com/pricing/). For a
> low-volume community app, the **Free/low tier** may be enough → near **$0**.

## Cost basis

| Item | Cost (CAD, approx.) |
|---|--:|
| Mailgun (record plan + volume) | **$0** (free/low volume) — or ~$20/mo (~$240/yr) on a paid tier |

## Canadian tax treatment — 100% deductible

A transactional-email **subscription / usage** charge is an **ordinary operating
expense, fully (100%) deductible** in the year incurred (current expense —
Income Tax Act **s. 9** / **s. 18(1)(a)**; not capital). If registered, GST/HST
is recoverable as an **input tax credit**. Keep the invoices.

> **Not tax advice** — confirm with the organization's accountant / CRA.
