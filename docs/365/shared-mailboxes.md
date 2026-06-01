# Microsoft 365 — Shared Mailboxes

How Skin Tyee's shared mailboxes are set up in Microsoft 365, and how we add
individual (licensed) users to them.

> **End-user view:** if you're a *new staff member* trying to *use* a shared
> mailbox in Outlook (it should auto-map to your folder list within 24 hours of
> being granted access), see
> [`docs/onboarding/outlook-skintyee-ca.md`](../onboarding/outlook-skintyee-ca.md).
> This doc is the admin-side companion for creating mailboxes and granting access.
>
> Context: email runs through Microsoft 365 / Outlook Cloud (the "Email Relay"
> in `docs/SkinTyee.drawio.pdf`). Shared mailboxes are role/address inboxes
> (e.g. `info@skintyee.ca`, `admin@skintyee.ca`) that several staff work from
> using their own logins — no separate password for the shared address.

## What a shared mailbox is

- A mailbox **multiple people open from their own M365 account** — replies can be
  sent **as** the shared address, and everyone sees the same mail/sent items.
- **No license required** for the shared mailbox itself, up to **50 GB**. A
  license is only needed if it must exceed 50 GB, or to enable In-Place Archive /
  Litigation Hold on the shared mailbox.
- **The people you grant access to must each have a licensed M365 account.**
  Access is granted to those user accounts; the shared mailbox stays unlicensed.

In **Users → Active users** you can see the split: real staff have a license
(e.g. *Microsoft 365 Business Standard*), while the role addresses
(Band Manager, Chief, Council, Finance, …) are **Unlicensed** — those are the
shared mailboxes.

![](media/thumbs/active-users.png)

A licensed user's account (license, roles, etc.) is managed from their flyout in
Active users:

![](media/thumbs/user-account-flyout.png)

## 1. Create a shared mailbox (M365 admin center)

1. Sign in to the **Microsoft 365 admin center** → <https://admin.microsoft.com>
   (you need **Exchange Administrator** or **Global Administrator**).
2. Go to **Teams & groups → Shared mailboxes**.
3. **+ Add a shared mailbox** → enter a **Name** (e.g. "Skin Tyee Info") and the
   **email address** (e.g. `info@skintyee.ca`) → **Save**.
4. Wait a few minutes for it to provision.

*(Alternative: Exchange admin center → <https://admin.exchange.microsoft.com> →
**Recipients → Mailboxes → + Add a shared mailbox**.)*

The **Teams & groups → Shared mailboxes** list is where all of ours live:

![](media/thumbs/shared-mailboxes-list.png)

## 2. Add individual users to the shared mailbox

Only **licensed users** can be added. After creating the mailbox:

**Via the M365 admin center**
1. **Teams & groups → Shared mailboxes →** select the mailbox.
2. In the **Shared mailbox members** panel, choose **+ Add members** → pick the
   licensed users → **Save**. (This grants **Read and manage** / Full Access.)
3. For send rights, scroll to the mailbox's permissions and set **Send as** and/or
   **Send on behalf** for the same users.

![](media/thumbs/shared-mailbox-members.png)

*Above: the members panel for a shared mailbox — "+ Add members" and the current
members who can work that inbox.*

**Via the Exchange admin center** (more granular)
1. **Recipients → Mailboxes →** select the shared mailbox → **Delegation**.
2. Add users under the permission you want:
   - **Read and manage (Full Access)** — open the mailbox, read & manage mail.
   - **Send as** — send so mail appears **from** the shared address.
   - **Send on behalf** — send as "*User* on behalf of *shared mailbox*".

### Permission types — which to use

| Permission | Effect | Use when |
|---|---|---|
| **Full Access** | Open & manage the mailbox; auto-mapped into Outlook | Everyone who works the inbox |
| **Send As** | Mail looks like it came *from* the shared address | The normal choice for role inboxes |
| **Send on Behalf** | Shows "User on behalf of address" | When you want the sender attributed |

> **Full Access auto-maps** the shared mailbox into the user's Outlook
> automatically (it just appears in their folder list, usually within ~15–60 min
> or after an Outlook restart). To disable auto-mapping (user adds it manually),
> grant Full Access via PowerShell with `-AutoMapping $false`.

## 3. (Optional) PowerShell — Exchange Online

Useful for bulk or scripting. Connect first:

```powershell
Install-Module ExchangeOnlineManagement   # once
Connect-ExchangeOnline -UserPrincipalName admin@skintyee.ca

# Create
New-Mailbox -Shared -Name "Skin Tyee Info" -DisplayName "Skin Tyee Info" -Alias info

# Grant a user Full Access + Send As
Add-MailboxPermission   -Identity info@skintyee.ca -User jane@skintyee.ca -AccessRights FullAccess -InheritanceType All
Add-RecipientPermission -Identity info@skintyee.ca -Trustee jane@skintyee.ca -AccessRights SendAs -Confirm:$false

# Full Access without auto-mapping
Add-MailboxPermission -Identity info@skintyee.ca -User jane@skintyee.ca -AccessRights FullAccess -AutoMapping:$false
```

## Our shared mailboxes (keep this current)

Current inventory of every `@skintyee.ca` shared mailbox in the tenant.
The display name is what users see in Outlook (in the "From" dropdown
when sending-as, in the global address list, etc.) — keep the display
name + email aligned with what's configured in the M365 admin center.

> **Updated:** 2026-06-01

| Shared mailbox | Display name | Purpose | Members (licensed users) | Permissions |
|---|---|---|---|---|
| `it@skintyee.ca` | IT Admin | IT administration, ticket triage, vendor correspondence | _TBD_ | Full Access + Send As |
| `bandmanager@skintyee.ca` | Skin Tyee Band Manager | Band Manager office | _TBD_ | Full Access + Send As |
| `chief@skintyee.ca` | Skin Tyee Chief | Chief's office | _TBD_ | Full Access + Send As |
| `councillor1@skintyee.ca` | Skin Tyee Councillor 1 | Councillor (seat 1) | _TBD_ | Full Access + Send As |
| `councillor2@skintyee.ca` ⚠ | Skin Tyee Councillor 2 | Councillor (seat 2) | _TBD_ | Full Access + Send As |
| `finance@skintyee.ca` | Skin Tyee Finance | Finance department (AP/AR, budgets, audit correspondence) | _TBD_ | Full Access + Send As |
| `firechief@skintyee.ca` | Skin Tyee Fire Chief | Fire Chief's office (emergency services) | _TBD_ | Full Access + Send As |
| `forestry@skintyee.ca` | Skin Tyee Forestry | Forestry department | _TBD_ | Full Access + Send As |
| `housing@skintyee.ca` | Skin Tyee Housing | Housing department (applications, maintenance requests) | _TBD_ | Full Access + Send As |
| `landresources@skintyee.ca` | Skin Tyee Land Resources | Land Resources / lands management | _TBD_ | Full Access + Send As |
| `gis@skintyee.ca` | Skin Tyee Mapping | GIS / mapping requests (address: `gis@` per the standard prefix, display name reflects the friendlier term "Mapping") | _TBD_ | Full Access + Send As |
| `media@skintyee.ca` | Skin Tyee Media | Media enquiries, press correspondence, public communications | _TBD_ | Full Access + Send As |
| `referrals@skintyee.ca` | Skin Tyee Referrals | Referrals (government / industry consultation responses, archaeological / land-use referrals) | _TBD_ | Full Access + Send As |

> **⚠ Verify in M365 admin center — `councillor2@skintyee.ca`:** the
> source list provided to IT had this as `councilllor2@` (three L's).
> Confirm the actual mailbox name in the M365 admin center — if the
> mailbox is genuinely `councilllor2@` (three L's), update this row to
> match reality + alias the standard spelling as a secondary address.
> If the mailbox is the standard two-L spelling, update the source list.

> **⚠ Verify also — `info@skintyee.ca` and `admin@skintyee.ca`:** these
> were in an earlier draft of this doc but are NOT in the current
> 13-mailbox snapshot above. **However**, the DMARC TXT record in
> GoDaddy (`_dmarc.skintyee.ca`) currently sends aggregate / forensic
> reports to `info@skintyee.ca` — see
> [`./setup-skintyee-ca-email.md`](./setup-skintyee-ca-email.md) step 6.
> If `info@` was decommissioned, those reports are bouncing. Two paths:
>
> 1. **Keep `info@` as a shared mailbox** (just for DMARC reports —
>    nobody has to actively monitor it; IT can scan it monthly), OR
> 2. **Update the DMARC record** in GoDaddy to point at a mailbox that
>    DOES exist (recommended: `it@skintyee.ca` — IT handles the
>    DMARC-tuning workflow anyway). Then re-validate per
>    `setup-skintyee-ca-email.md` step 7.
>
> Pick one + update both this doc + the DMARC TXT to be consistent.

### How the addresses map to the display names

Two patterns are in play, intentionally:

- **Role / department label** (`finance`, `housing`, `firechief`, `forestry`,
  `landresources`, `media`, `referrals`) — addresses match the operational
  label, display name carries the "Skin Tyee" brand prefix.
- **Numbered seat** (`councillor1`, `councillor2`) — for roles where there
  are multiple seats; the seat identity stays with the seat, not the
  person occupying it (when councillors change, only the *member list*
  on the mailbox changes; the mailbox + history stays intact).

Two friendly-name nuances worth knowing about:

- `gis@skintyee.ca` (technical prefix) → display name "Skin Tyee Mapping"
  (the term staff and the public actually use).
- `it@skintyee.ca` (no "Skin Tyee" in the display name, just "IT Admin")
  — historically the IT-handling addresses across the org world don't
  usually carry the org name as a display name.

### Roles vs. people

Each shared mailbox represents a **role**, not a person. When
councillors / chief / fire chief / etc. change:

1. **Remove the departing person's access** from the shared mailbox
   ("Mailbox permissions" + "Send As") — see § 2 above
2. **Add the incoming person's access** the same way
3. The **mailbox address + display name + history stays put** — that's
   the point of using shared mailboxes vs. personal mailboxes for these
   roles

This means mail continuity survives turnover automatically. Don't try
to "transfer" a personal mailbox into a shared role — set up the
shared mailbox once, then membership cycles.

### Filling in the Members column

When you grant a user access to a shared mailbox (M365 admin center →
that mailbox → Mailbox permissions), update the Members column above
in the same change so the table reflects reality. The table is the
source of truth for "who has access to what" without having to go
through every mailbox in the admin center.

To audit-list everyone currently with access (PowerShell, run as a
tenant admin in Exchange Online PowerShell):

```powershell
$mailboxes = @(
  'it', 'bandmanager', 'chief', 'councillor1', 'councillor2',
  'finance', 'firechief', 'forestry', 'housing', 'landresources',
  'gis', 'media', 'referrals'
) | ForEach-Object { "$_@skintyee.ca" }

foreach ($mb in $mailboxes) {
  Write-Host "`n=== $mb ===" -ForegroundColor Cyan
  Get-MailboxPermission -Identity $mb |
    Where-Object { $_.User -notlike "NT AUTHORITY\*" -and $_.IsInherited -eq $false } |
    Select-Object User, AccessRights
}
```

Paste the output back into the Members column to keep the table fresh.

## Notes

- Adding/removing a person from a shared mailbox = grant/remove their access
  here; you never share the shared address's password (it should stay sign-in
  blocked).
- When someone leaves, remove their access (and reassign their license) — their
  loss of license doesn't delete the shared mailbox or its mail.
- Keep the table above in sync with the actual M365 configuration.
