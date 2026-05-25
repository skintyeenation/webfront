# Microsoft 365 Groups vs Security Groups

Reference doc for IT admins deciding what type of group to create for
a given purpose. Both live in Entra ID, both have a member list, but
they're used for different things and pulling the wrong one in the
wrong place adds friction (an unused shared mailbox, a SharePoint
site nobody opens) that's annoying to clean up later.

## At a glance

| | **Microsoft 365 Group** | **Security Group** |
|---|---|---|
| **Purpose** | Collaboration | Access control |
| **What it comes with** | Shared mailbox, SharePoint site, calendar, OneNote, optional Teams team, Planner | Nothing — just a list of members |
| **Has an email address?** | Yes (e.g., `chief-council@skintyee.ca`) | Only if "mail-enabled" (rare) |
| **Used for licensing?** | No | Yes — assign M365 / Entra P1 / 1Password licenses to the group |
| **Used in Conditional Access?** | No | Yes — scope policies to it |
| **Used in Entra app role assignments?** | Sometimes | Yes — standard pattern |
| **Has owners?** | Yes (own + manage content) | Yes (own membership only) |
| **Dynamic membership?** | Yes (with Entra ID P1+) | Yes (with Entra ID P1+) |
| **Members can read each other's email?** | Yes (via the shared mailbox) | No |
| **Created when you make a Team in MS Teams?** | Yes, automatically | No |

## When to use which

### Microsoft 365 Group

> A shared **workspace** where members chat, file-share, schedule, and
> email collectively.

Use one when:

- You want a **Teams team**. Creating a team in MS Teams creates an
  M365 Group under the hood automatically — you don't pick "Group
  type", Teams does it for you.
- A real group of people needs a **shared SharePoint site** (events
  hub, project workspace) AND a **shared mailbox** AND a **shared
  calendar**, all under one membership.
- The group needs an **email address** that staff can email to reach
  everyone (and the conversation is visible in the SharePoint site's
  shared inbox).

Examples (potential / actual):

- `chief-and-council@skintyee.ca` — confidential leadership channel +
  shared docs + meeting notes
- `it-project-team@skintyee.ca` — the working group running the
  webfront + app project
- `band-comms@skintyee.ca` — comms team co-managing
  social-media posts and newsletter drafts

### Security Group

> A **container of members** used to grant access to a thing.

Use one when:

- **Group-based licensing** — cheaper and simpler than per-user
  license assignment. Add user → group → license auto-assigns; remove
  user → license auto-revokes.
- **Conditional Access** scoping. "Require MFA + compliant device for
  members of `it-staff`."
- **Entra app role assignments**. The Skin Tyee app, 1Password,
  Azure DevOps, custom internal apps — all assign access by Entra
  group.
- **Dynamic membership** based on user attributes ("everyone whose
  `department` is `IT`"). Possible with M365 Groups too but more
  common with Security Groups.

Examples (current + planned):

- `m365-business-standard-licensed` — assigned the M365 Business
  Standard SKU; members get Outlook/Word/Excel/Teams licenses
- `1password-users` — Conditional Access scope ("require MFA")
- `app-administrators` — Entra ID app role for the band app's admin
  panel
- `webfront-developers` — Azure DevOps project access (granted via
  group → project membership)
- `azure-portal-owners` — Owner role on the Azure subscription

## The trap to avoid

People often pick M365 Group for everything because the admin center
pushes it as the default ("Create new group → Microsoft 365"). But
that means every "access control" decision drags along a shared
mailbox + SharePoint site + Teams team space nobody uses, cluttering
the tenant. Rule of thumb:

> **"Will members of this group ever collaborate as a unit
> (file-share, chat, schedule)?"**
>
> — Yes → **Microsoft 365 Group**
> — No, this is just for permission scoping → **Security Group**

If you've already created an M365 Group for an access-control purpose
and it has the unused shared mailbox + SharePoint site sitting empty,
the cleanup is: convert to security group via Exchange PowerShell, or
delete and recreate as a Security Group (data inside the M365 Group's
attached resources is **deleted**, including the shared mailbox —
back up first if it has any history).

## Special cases

### Mail-Enabled Security Group

You need *both* email distribution AND security perms in one object
— e.g., `it-staff@skintyee.ca` that's also used to grant access to a
private SharePoint site.

- Created via Exchange Online PowerShell (`New-DistributionGroup -Type
  Security`); the M365 admin center doesn't expose creation anymore.
- Microsoft has been quietly recommending against these — the modern
  pattern is **an M365 Group + a separate Security Group**, even if
  both have the same membership, because they're managed in different
  surfaces (Outlook for the M365 Group's mailbox, Entra for the
  Security Group's permissions).
- Keep existing mail-enabled SGs that already work; don't create new
  ones unless there's a specific reason.

### Distribution Group (a.k.a. Distribution List, DL)

Email-only — fans out an email to a list of recipients. No
collaboration features, no security perms.

- Largely deprecated in favor of M365 Groups (which can act as DLs
  *and* host a shared inbox).
- Still useful for **external-recipient lists** (newsletters,
  contact-by-email) where you don't want to give non-staff a M365
  Group's full shared workspace.
- Create via Exchange admin center → Recipients → Groups → Distribution
  list.

## How this maps to our other docs

- [`shared-mailboxes.md`](./shared-mailboxes.md) — the shared
  *mailbox* (e.g. `info@skintyee.ca`) is its own resource type,
  separate from an M365 Group's auto-created mailbox. Used when you
  want the shared inbox WITHOUT the SharePoint site / Teams team
  baggage. Often paired with a **Security Group** for "who has access
  to this shared mailbox."
- [`entra-id.md`](./entra-id.md) — both group types live in Entra ID
  and inherit Entra-ID lifecycle (created/deleted there, membership
  managed there).
- [`pricing.md`](./pricing.md) — group-based licensing referenced
  here is the cost-saving pattern enabled by Security Groups.
- [`../devops/README.md`](../devops/README.md) — Azure DevOps project
  membership is granted via Entra Security Groups (e.g.,
  `webfront-developers`).
- [`../onboarding/README.md`](../onboarding/README.md) — when an admin
  onboards a new staff member, the admin adds them to the relevant
  Security Groups (which auto-applies licenses + access) AND any
  M365 Groups the staffer collaborates with (which adds them to those
  Teams / mailboxes / SharePoint sites).

## Creating groups

### Microsoft 365 Group

- **Easiest** — create a Teams team (Teams → + → Create team → From
  scratch). The M365 Group is implicit.
- **Or** — Entra admin center → Groups → New group → Group type:
  **Microsoft 365** → fill in name, owner, etc.
- **Or** — M365 admin center → Teams & groups → Active teams &
  groups → Add a group.

### Security Group

- Entra admin center → Groups → New group → Group type:
  **Security** → fill in name, owner.
- Optionally enable **Assignable to roles** if this group will be
  assigned an Entra directory role (e.g. "Application Administrator")
  — irreversible flag, requires Privileged Identity Management to
  manage afterward. Don't tick it unless needed.

## Microsoft's own docs

- [Compare groups](https://learn.microsoft.com/en-us/entra/fundamentals/concept-learn-about-groups)
- [Microsoft 365 Groups](https://learn.microsoft.com/en-us/microsoft-365/admin/create-groups/office-365-groups)
- [Security Groups in Microsoft Entra ID](https://learn.microsoft.com/en-us/entra/fundamentals/how-to-manage-groups)
