# 1Password — install + setup

1Password is the Nation's **password manager**. Every work credential
(your `@skintyee.ca` email password, social-media accounts, app
logins, software keys) lives in 1Password and nowhere else — not in
your browser's saved passwords, not in a notebook, not in a Notes app.

> **Before you start** — the admin should have sent you two pieces of
> info, in separate channels:
>
> 1. A **1Password invite email** with a "Join your team" button.
>    Subject is usually "You've been invited to join Skin Tyee First
>    Nation on 1Password".
> 2. A **Secret Key** — printed on paper, sealed in an envelope, or
>    sent as a separately-delivered PDF. **Without this, you cannot
>    sign in.** Don't email or text it. The admin should have given
>    it to you in person or via a sealed channel.
>
> If either is missing, message the admin before going further. The
> invite link expires after 7 days.

---

## Why 1Password (and not the browser's "save password"?)

- **Encrypted, not just stored.** Browser password vaults sit in your
  user profile and are accessible to anyone who unlocks the laptop.
  1Password uses your Master Password + Secret Key — even if a thief
  has your laptop, they can't get into the vault.
- **Shared vaults.** The comms team can share the social-media logins
  via a vault without anyone ever knowing the actual password. When
  someone leaves, the admin removes them and they lose access
  immediately. No password rotation drama.
- **Works on every device.** Same vault on your laptop, phone, tablet,
  and any browser you sign into.
- **Audit trail.** The admin can see when a vault item was last used
  (not the password value — just the access timestamp). Catches
  unauthorized access.

---

## Step 1 — Accept the invite (in your web browser)

This sets up your account and gives you the chance to write down /
print the **Emergency Kit** (a PDF combining your Master Password,
Secret Key, and account URL — the only way to recover your account if
both are forgotten).

1. Open the **invite email** the admin sent you.
2. Click **"Join your team"** (or the equivalent button — Microsoft
   sometimes mangles the wording in safe-link rewrites; the
   destination URL is `start.1password.com/...`).
3. You'll be asked to:
   - **Sign up** with your `@skintyee.ca` email address.
   - **Create a Master Password** — at least 14 characters, mix of
     case + digit + symbol. Write it on paper for now. **Don't reuse
     a password you use anywhere else.**
   - **Enter your Secret Key** — the long string the admin gave you
     separately. Format: `A3-XXXXXX-XXXXXX-XXXXX-XXXXX-XXXXX-XXXXX`.
4. **Download the Emergency Kit PDF** when prompted. Save it to a
   USB stick and a printed copy in a fireproof drawer. **This is the
   only thing that gets you back in if you forget your Master
   Password.** No-one at Skin Tyee (including the admin) can reset
   it for you — see Recovery below.
5. You should land in the 1Password web vault at
   <https://skintyee.1password.ca/>. There's an empty "Private" vault
   and (depending on what role the admin assigned) one or more shared
   vaults — e.g. **Comms**, **Council**, **IT Services**.

---

## Step 2 — Install 1Password on your laptop

### macOS

1. Open <https://1password.com/downloads/mac/> → **Download**.
2. Drag **1Password.app** to **Applications**.
3. Open it. The first time, it asks for your account — sign in with
   the Master Password you just set.
4. Allow the **Touch ID / Apple Watch unlock** when prompted (faster
   than typing the password every time the vault locks).

### Windows

1. Open <https://1password.com/downloads/windows/> → **Download**.
2. Run the installer (`1Password-Setup.exe`).
3. Sign in with your account email + Master Password + Secret Key.
4. (Optional) Allow **Windows Hello** unlock — face / fingerprint /
   PIN — same idea as Touch ID.

### Browser extension (every browser you use)

The extension is what auto-fills and saves passwords as you browse.

- Chrome / Edge / Brave: <https://chrome.google.com/webstore/detail/1password-x-password-mana/aeblfdkhhhdcdjpifhhbdiojplfjncoa>
- Firefox: <https://addons.mozilla.org/en-US/firefox/addon/1password-x-password-manager/>
- Safari: opens automatically when you install the macOS app — enable
  in **Safari → Preferences → Extensions**.

After installing, **pin the extension** to your browser toolbar so
you can see the icon. Sign in via the extension — it'll talk to the
desktop app for unlock.

---

## Step 3 — Install on your phone

### iOS

1. Install **1Password** from the App Store.
2. Open it → **Sign In** → choose **Use Existing Account** (don't
   create a new one).
3. The fastest way to sign in: tap **Scan Setup Code**, then on your
   laptop open <https://my.1password.com> → **Get the apps** → **Set
   up another device** — your laptop shows a QR code, point your phone
   at it. Done — no Secret Key typing.
4. Enable **Face ID / Touch ID** unlock when prompted.
5. **Settings → Passwords → AutoFill Passwords → enable 1Password.**
   Now iOS suggests 1Password entries when websites and apps ask for
   a password.

### Android

1. Install **1Password** from the Play Store.
2. Same scan-the-QR flow as iOS.
3. Enable **autofill** in **Settings → System → Languages & input →
   Autofill service → 1Password**.

---

## Step 4 — Move existing passwords *into* 1Password

This is where most people get stuck — there's a habit gap between
"I have 1Password installed" and "I actually use it for everything".
The thirty-minute version:

1. **Save your work passwords first.** Open Outlook on the web. Click
   into the password field (don't type — let it sit empty). The 1Password
   extension icon should appear inside the field. Click it → **Save
   Login** → name it "Outlook — Skin Tyee".
2. Repeat for every work site: the Skin Tyee app, the WordPress
   admin, GitHub, Azure, Microsoft 365 admin center, etc.
3. **Export from your browser's saved passwords** (Chrome:
   `chrome://settings/passwords` → ⋮ → Export passwords). Save the
   CSV temporarily.
4. **Import into 1Password**: desktop app → **File → Import →
   Browser exports → Chrome (or whichever)** → pick the CSV. Pick the
   **Private** vault as the destination — these are your personal
   logins, not shared.
5. **Delete the CSV** when import is confirmed. It contains
   plaintext passwords; don't leave it in Downloads.
6. **Turn OFF the browser's built-in password manager** so it stops
   competing with 1Password:
   - Chrome: `chrome://settings/passwords` → **Offer to save
     passwords**: OFF, **Auto Sign-in**: OFF.
   - Safari: **Preferences → Passwords** → **Use this Mac to sign
     into apps and websites** (uncheck).
   - Firefox: **Settings → Privacy & Security → Logins and Passwords**
     → uncheck **Ask to save logins and passwords**.

---

## Step 5 — Get into the shared vaults you need

The admin assigns you to groups; groups have access to vaults. You
might see:

| Vault | Who's in it | What's in it |
|---|---|---|
| **Private** | Just you | Your own work logins |
| **Comms** | Comms team | Social media, Mailchimp, Canva |
| **Council** | Council members | Board materials, Council-only services |
| **IT Services** | Lucas + IT staff | GoDaddy, Azure, GitHub, M365 admin |
| **Finance** | Finance team | Ferrus ASAP, Adagio, banking |

If you think you need access to a vault that isn't listed in your app,
ask the admin — they can add you to the group in seconds.

---

## Recovery — if you forget your Master Password

**Without the Emergency Kit, no-one can let you back in.** Not the
admin, not 1Password support. This is by design (zero-knowledge
architecture).

If you have the Emergency Kit PDF:

1. Open <https://my.1password.com> in a browser.
2. Click **Forgot it** under the password field.
3. Follow the recovery flow — uses your Secret Key from the Emergency
   Kit + sends a recovery email.

If you've lost the Emergency Kit AND forgotten the Master Password:

1. The admin can **suspend** your account so it's not floating around
   as a security risk.
2. The admin creates a **fresh invite** — same email, new account.
3. You re-do steps 1-3 above with a new Master Password + Secret Key.
4. You **lose the contents of your Private vault** — anything that
   was in it (logins you'd added that weren't shared) is gone forever.
   Shared vault contents stay (they live with the group).

**This is why printing + safe-keeping the Emergency Kit matters.**

---

## Troubleshooting

### "I didn't get the invite email"

- Check spam. Microsoft 365's safe-link rewriter sometimes mangles
  the link — ask the admin for a fresh invite if it doesn't open.

### "My Secret Key doesn't work"

- The Secret Key is case-sensitive and 34 characters with hyphens
  every 5–6 chars. The most common error is copying the dash from a
  PDF that uses an em-dash instead of a hyphen — type it manually
  or use the **Scan Setup Code** option on mobile.

### "The browser extension isn't auto-filling"

- The desktop 1Password app must be running and unlocked.
- Pin the extension to the toolbar so you can click it manually if
  the in-field icon doesn't show.
- For Safari: confirm the extension is enabled in **Safari →
  Preferences → Extensions**.

### "I'm being asked to sign in over and over"

- The vault auto-locks after a configurable timeout. **1Password →
  Settings → Security → Auto-lock** — bump it up if you like (e.g.
  30 min instead of 5).

### "My phone's app doesn't sync new entries"

- Pull-to-refresh in the iOS / Android app. If still stale, sign out
  and back in — but make sure you have the Emergency Kit in hand
  first.

---

## What's next

Onboarding is mostly done after these two steps. Anything else (the
Skin Tyee app, shared mailbox access, WordPress editor, etc.) is
per-role — your admin will point you at the right doc.

**Admin-side companion** (you don't need to read this, but it's
where the admin manages your account): [`docs/1password/setup.md`](../1password/setup.md).
