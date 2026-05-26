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

Record each shared mailbox, its purpose, and the licensed users who have access.

| Shared mailbox | Purpose | Members (licensed users) | Permissions |
|---|---|---|---|
| `info@skintyee.ca` | General enquiries | _e.g. Sandra Williams, …_ | Full Access + Send As |
| `admin@skintyee.ca` | Band administration | _…_ | Full Access + Send As |
| `chief@skintyee.ca` | Chief & Council | _…_ | Full Access + Send As |
| _…_ | _…_ | _…_ | _…_ |

## Notes

- Adding/removing a person from a shared mailbox = grant/remove their access
  here; you never share the shared address's password (it should stay sign-in
  blocked).
- When someone leaves, remove their access (and reassign their license) — their
  loss of license doesn't delete the shared mailbox or its mail.
- Keep the table above in sync with the actual M365 configuration.
