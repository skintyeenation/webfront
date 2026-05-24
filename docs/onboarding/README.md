# Onboarding — new Skin Tyee staff

This section is for **new staff** getting set up on the Nation's digital
platform. Work through it in order — each step has a dedicated page with
screenshots and the exact dialogs you'll see.

The admin-side companion (the admin who *creates* your account, assigns
licenses, and grants access) is documented separately under
[`docs/365/`](../365/) and [`docs/1password/setup.md`](../1password/setup.md);
this section is the **end-user view**.

## The onboarding sequence

| # | Step | What you'll need from the admin | Page |
|---|---|---|---|
| 1 | Activate your `@skintyee.ca` Outlook account | The admin sends you a Microsoft 365 invite + a temporary password | [outlook-skintyee-ca.md](./outlook-skintyee-ca.md) |
| 2 | Install + sign into 1Password | The admin sends you a 1Password invite email and (separately) a printed/sealed Secret Key envelope or PDF | [1password.md](./1password.md) |
| 2b | (Optional, if the admin has enabled it) Switch 1Password to "Unlock with SSO" so your Entra ID account unlocks the vault | Admin confirms the org-level Entra ID ↔ 1Password integration is on | [1password.md → Step 6](./1password.md#step-6--connect-1password-to-entra-id-unlock-with-sso) |
| 3 | (If applicable) Get access to a shared mailbox like `info@`, `chief@`, `admin@` | The admin grants you Full Access + Send-As permission | See [shared mailboxes](../365/shared-mailboxes.md) — once granted, the mailbox appears automatically in Outlook within ~24h |
| 4 | (If applicable) Get access to band software | The admin invites you to the apps you need (the Skin Tyee app, WordPress site editor, Azure DevOps, etc.) | _Per-app — your admin will point you at the right doc_ |

## What this gives you, when it's done

- A **`firstname.lastname@skintyee.ca`** email address that works on your
  laptop, your phone, and the web at <https://outlook.com>.
- Membership in any **shared mailboxes** you need (`info@skintyee.ca`,
  `chief@skintyee.ca`, `admin@skintyee.ca`, etc.) — they appear in
  Outlook's folder list automatically; no extra password.
- **1Password** with your own vault (for personal work credentials) and
  access to the shared vaults for whatever apps your role needs (e.g.
  social-media accounts the comms team shares).
- **Single sign-on** into Microsoft 365 (Outlook, Teams, OneDrive,
  SharePoint, the Skin Tyee app) using the same `@skintyee.ca` login.

## If you get stuck

Email or text the admin (the person who sent you the M365 invite). Most
issues during onboarding fall into one of three buckets:

- **"I never got the M365 invite email"** — check spam. If still
  missing, the admin can re-send it from the M365 admin center.
- **"I can sign in to Outlook on the web but not in the Outlook app"**
  — usually a stale cached account. The Outlook doc has the fix
  (sign out, delete the profile, re-add).
- **"I can't open the 1Password invite link"** — the invite expires
  after 7 days. The admin can re-send it.

For anything else, leave a note in `info@skintyee.ca` and the team will
follow up.

## What this section is NOT

- Not the admin's runbook for *creating* accounts — that's
  [`docs/365/entra-id.md`](../365/entra-id.md),
  [`docs/365/shared-mailboxes.md`](../365/shared-mailboxes.md), and
  [`docs/1password/setup.md`](../1password/setup.md).
- Not the per-app onboarding (the band app, the WordPress site, Azure
  DevOps, etc.) — each of those has its own doc, linked from the
  per-app section of [`/README.md`](../../README.md).
- Not pricing or tax — see [`docs/365/pricing.md`](../365/pricing.md)
  and [`docs/1password/pricing.md`](../1password/pricing.md). Both
  services are 100% tax-deductible Canadian business expenses.
