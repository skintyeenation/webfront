# Outlook setup with `@skintyee.ca`

Your work email — `firstname.lastname@skintyee.ca` — runs on
**Microsoft 365** (Outlook + Teams + Office). This page walks you
through activating the account and adding it to Outlook on every
device you'll use.

> **Before you start** — the admin should have sent you the following
> by email (usually to your personal email address you gave them):
>
> 1. Your new work username — `firstname.lastname@skintyee.ca`.
> 2. A **temporary password** for the account.
>
> ⚠️ **The temporary password expires the first time you sign in —
> you'll be forced to set a new one immediately.** That's by design.
> The temp password is a one-time bootstrap; the password you set on
> first sign-in is what you'll use from then on (and what goes into
> 1Password in Step 2 of onboarding).
>
> If either piece of info is missing, message the admin before going
> further. Don't try to share the temp password through any other
> channel — it's already expired-on-first-use, so it has no value to
> anyone else.

---

## Step 1 — First sign-in (in your web browser, takes ~5 min)

This step activates your account, **forces you to change the temp
password to one of your own**, and prompts you to register MFA. Do
this in a web browser (not the Outlook app) — the password-change
prompt is easier to deal with there.

1. Open <https://outlook.office.com> in any browser.
2. Enter your full work email: `firstname.lastname@skintyee.ca`.
3. Enter the **temporary password** from the admin's email.
4. **You'll be told the password is expired — set a new one
   immediately.** This is mandatory; you can't skip it.
   - **Current password:** the temporary one from the email.
   - **New password:** at least 14 characters, mixed case + number +
     symbol. **Don't reuse a personal password.** **Don't reuse the
     temp password.**
   - Write the new password down on paper for now — you'll save it
     to 1Password as the first thing you do in [Step 2 of
     onboarding](./1password.md). Until 1Password is installed, paper
     is the safe spot.
5. Microsoft will prompt **"More information required"** — set up
   authenticator now. Two options:
   - **Microsoft Authenticator app** (recommended) — install on your
     phone from the App Store / Play Store, then scan the QR code
     shown on the screen. Future sign-ins will push a "approve?"
     notification to the app.
   - **Phone (text/call)** — enter your mobile number; Microsoft will
     text you a 6-digit code. Slower than the Authenticator app and
     uses up SMS rather than data, so prefer the app if possible.
6. You should land in Outlook on the Web. Send yourself a test email
   from your personal address to confirm it arrives.

> 🎉 **Done with Step 1.** You're now signed in to **all of M365**
> with that one password you just set — Teams, OneDrive, SharePoint,
> the Skin Tyee app (once it's wired up). The temp password is
> dead; don't keep a copy of it anywhere.

---

## Step 2 — Add the account to Outlook on your laptop

### macOS

1. Open **Outlook** (comes with Microsoft 365 — install from
   <https://www.microsoft.com/en-us/microsoft-365/download-office> if
   not present, see [the install step in the onboarding sequence](./README.md#the-onboarding-sequence)).
2. **File → Add Account** _or_ on first launch the wizard appears
   automatically.
3. Enter `firstname.lastname@skintyee.ca` → **Continue**.
4. Sign in with the password you set in Step 1. Approve the MFA prompt
   on your phone.
5. Wait ~1 minute for your inbox to sync. You should see your test
   email from Step 1.
6. **Default profile** — if this is your first Outlook account, it's
   already default. If you have a personal account too, set the
   `@skintyee.ca` one as default in **Outlook → Preferences →
   General → Default mail account**.

### Windows

1. Open **Outlook** (Start menu → Outlook). Install from
   <https://www.microsoft.com/en-us/microsoft-365/download-office> if
   not present.
2. **File → Add Account** _or_ first-launch wizard.
3. Same steps as macOS above.
4. **Profile management** — Windows uses Outlook profiles. If you ever
   need to re-add the account from scratch:
   - **Control Panel → Mail → Show Profiles**.
   - Add a new profile with just the `@skintyee.ca` account; set it
     as default.

### Shared mailboxes appear automatically

If the admin has granted you Full Access to a shared mailbox (e.g.
`info@skintyee.ca`), it **shows up under your folder list within
~24 hours** of the grant — no extra password, no extra account. You'll
see something like:

```
Folders
├── firstname.lastname@skintyee.ca
│   ├── Inbox
│   ├── Sent
│   └── …
└── info@skintyee.ca     ← shared mailbox, auto-mapped
    ├── Inbox
    └── …
```

To **send as** the shared address (e.g. "From: info@…"), compose a new
email and click the **From** field at the top — pick the shared address
from the dropdown.

#### If the shared mailbox doesn't appear after ~24h — add it manually

Auto-mapping usually works, but if the mailbox hasn't shown up a day
after the admin granted you access, you can add it explicitly. The
exact steps depend on which Outlook you're using. (Microsoft's
canonical version of this is at
<https://support.microsoft.com/en-us/office/open-and-use-a-shared-mailbox-in-outlook-d94a8e9e-21f1-4240-808b-de9c9c088afd>
— check there if these get out of date.)

##### Outlook for Mac

1. Open **Outlook** for Mac.
2. Top menu bar → **File → Open**.
3. Select **Shared Mailbox**.
4. Search for or enter the shared mailbox's email address (e.g.
   `info@skintyee.ca`), select it from the results, click **Add**.

##### New Outlook for Windows (the redesigned 2024+ Outlook)

1. In the navigation pane, select **Mail**.
2. **Right-click your account name** (the top folder, e.g.
   `firstname.lastname@skintyee.ca`).
3. Choose **"Add shared folder or mailbox"**.
4. Type the shared mailbox's email address, select it, click **Add**.

##### Classic Outlook for Windows

1. **File → Account Settings → Account Settings**.
2. **Email** tab → select your `@skintyee.ca` account → **Change**.
3. **More Settings → Advanced → Add**.
4. Enter the shared mailbox's email address → **OK**.
5. Restart Outlook.

##### Outlook on the web (<outlook.office.com>)

1. In the left navigation pane, **right-click "Folders"** (or your
   primary mailbox name at the top of the list).
2. Choose **"Add shared folder or mailbox"**.
3. Type the shared mailbox's email address → **Add**.

The mailbox appears in your folder list immediately. If Outlook says
*"You don't have permission"*, the admin hasn't granted you Full
Access yet — ping them and link to
[`docs/365/shared-mailboxes.md`](../365/shared-mailboxes.md).

> Prerequisite: **Full Access** permission on the mailbox, granted by
> the IT admin in the M365 admin center. **Send As** is separate and
> typically granted alongside Full Access. See
> [`docs/365/shared-mailboxes.md § Permission types`](../365/shared-mailboxes.md#permission-types--which-to-use).

To **send as** the shared address from any of the above clients,
compose a new email, show the **From** field (Options menu →
**Show From** on Windows; the **From** dropdown is visible by default
on Mac), then pick the shared address from it.

---

## Step 3 — Add to your phone

### iOS (iPhone / iPad)

**Option A — Microsoft Outlook app (recommended)**

1. Install **Microsoft Outlook** from the App Store.
2. Open it → **Add Account** → enter `firstname.lastname@skintyee.ca`.
3. Sign in with your password + approve MFA.
4. Done. The app handles Outlook calendar + contacts too.

**Option B — Apple Mail**

1. **Settings → Mail → Accounts → Add Account → Microsoft Exchange**.
2. Enter the email + a description ("Skin Tyee").
3. Tap **Sign In** (not Configure Manually) — opens the Microsoft
   sign-in flow.
4. Approve MFA.
5. Choose what to sync (Mail / Contacts / Calendars / Reminders / Notes).

### Android

1. Install **Microsoft Outlook** from the Play Store.
2. Same flow as iOS — Add Account → email → password → approve MFA.
3. The native Gmail app also supports Exchange — use the Outlook app
   if your phone is a work phone; either works on personal phones.

---

## Step 4 — Outlook on the Web (any device)

You don't need anything installed — <https://outlook.office.com> works
in any browser. Useful if you're on a friend's computer or a band
office workstation that doesn't have your account.

**Bookmark this** — staff use it as a fallback when the desktop app
is having a bad day, and Outlook on the Web has features the desktop
app doesn't (e.g. Booking, integration with Teams meetings).

---

## Troubleshooting

### "Sign in failed" / wrong password

- Check you're using your **new** password, not the temporary one.
- Reset it at <https://passwordreset.microsoftonline.com> (this works
  if you registered MFA in Step 1).

### "Multi-factor authentication is taking forever"

- Pull down the Microsoft Authenticator app and check for a pending
  request — sometimes the push doesn't arrive but the request is
  there if you open the app.
- If MFA is broken, the admin can temporarily disable it from the
  admin center to let you back in, then you re-register.

### Outlook desktop shows the wrong account / I want to re-add from scratch

- **macOS:** **Outlook → Preferences → Accounts** → select the account
  → click **−** → re-add.
- **Windows:** **File → Account Settings → Account Settings** → select
  → **Remove** → re-add. Or wipe the whole profile from **Control
  Panel → Mail → Show Profiles**.

### The shared mailbox isn't showing up

- Shared mailboxes auto-map within ~24 hours of the admin granting
  Full Access. If it's been a day:
  - Restart Outlook.
  - If still missing, ask the admin to verify the permission grant
    (see [`docs/365/shared-mailboxes.md`](../365/shared-mailboxes.md)).

### Old emails from before today aren't appearing

- Outlook syncs the most recent ~30 days by default. To see further
  back:
  - **macOS:** **Outlook → Preferences → Accounts → Advanced → Sync
    settings** → change to "All".
  - **Windows:** **File → Account Settings → select account → Change
    → "Use Cached Exchange Mode" → Mail to keep offline: All**.

### "How do I share a calendar?"

- **Outlook → Calendar → right-click your calendar → Sharing
  Permissions → Add** the colleague's `@skintyee.ca` address, pick a
  permission level (Can view / Can edit / Delegate).

---

## What's next

Once Outlook is working, move to **[Step 2 of onboarding — 1Password
install + setup →](./1password.md)** so you have somewhere safe to
store the password you just set and every other work credential.
