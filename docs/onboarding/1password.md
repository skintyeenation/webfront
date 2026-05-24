# 1Password — install + setup

1Password is the Nation's **password manager**. Every work credential
(your `@skintyee.ca` email password, social-media accounts, app
logins, software keys) lives in 1Password and nowhere else — not in
your browser's saved passwords, not in a notebook, not in a Notes app.

> **Before you start** — complete
> [Step 1 of onboarding (Outlook + @skintyee.ca activation)](./outlook-skintyee-ca.md)
> first. You need to have:
>
> - Changed your **temp Microsoft 365 password** to one of your own
>   (Step 1 forces this on first sign-in).
> - The new M365 password written down on paper — you'll save it into
>   1Password as the very first thing once you're set up here.
> - A working `@skintyee.ca` inbox so you can receive the 1Password
>   invite email (the admin sends it to your work address).
>
> Then the admin should have sent you two pieces of info, in separate
> channels:
>
> 1. A **1Password invite email** to your `@skintyee.ca` inbox with a
>    "Join your team" button. Subject is usually "You've been invited
>    to join Skin Tyee First Nation on 1Password".
> 2. A **Secret Key** — printed on paper, sealed in an envelope, or
>    sent as a separately-delivered PDF. **Without this, you cannot
>    sign in.** Don't email or text it. The admin should have given
>    it to you in person or via a sealed channel.
>
> If either is missing, message the admin before going further. The
> invite link expires after 7 days.

---

## Why 1Password (and not the browser's "save password"?)

**1Password is a bank-grade product, not a hobbyist tool.** It's used
by major Canadian and US banks for staff credential management,
audited by independent security firms, and built on a **zero-knowledge
architecture** that means even 1Password the company can't read your
vault. Per their security white paper, "If 1Password's servers were
fully compromised, an attacker would have access to your encrypted
vault — but not the means to decrypt it." That's the bar we're
choosing because the Nation handles sensitive band, member, and
financial data; "saved in the browser" doesn't clear it.

Concretely:

- **Encrypted at rest with two factors you control.** Your **Master
  Password** (something you know) and your **Secret Key** (something
  you have — printed paper / sealed envelope / USB) are both needed
  to decrypt. Browser password vaults, by contrast, sit in your user
  profile and are accessible to anyone who unlocks the laptop. With
  1Password, even if a thief has your laptop, they can't get into
  the vault.
- **Shared vaults.** The comms team can share the social-media logins
  via a vault without anyone ever knowing the actual password. When
  someone leaves, the admin removes them and they lose access
  immediately — no "rotate every password we ever told them" drama.
- **Works on every device.** Same vault on your laptop, phone, tablet,
  and any browser you sign into.
- **Audit trail.** The admin can see when a vault item was last used
  (not the password value — just the access timestamp). Catches
  unauthorized access.
- **Used by people you'd expect to be careful.** Named on 1Password's
  own customers page (<https://1password.com/customers>): **Reddit,
  Associated Press, Intercom, Duke University, Oracle Red Bull
  Racing, Canva, Asana, Elastic, BuzzFeed, JetBrains, ClickUp, Under
  Armour, Drift,** and 20+ others spanning media, software, sport,
  and higher-ed. SOC 2 Type II + ISO 27001 audits make it eligible
  for regulated industries; 1Password's own marketing positions it
  as the choice when "saved in the browser" isn't acceptable.

### Security model + liability (for council / governance review)

Reasonable question to ask before staff put band passwords into a
third-party service: **what protects us, and what's 1Password on the
hook for if they get breached?**

#### What protects you, technically

1. **Zero-knowledge architecture.** 1Password's servers store your
   vault as an opaque encrypted blob. The decryption key is built
   from your **Master Password** (you know) + your **Secret Key**
   (on paper in your Emergency Kit). The Secret Key is *never sent*
   to 1Password's servers — it's combined with your Master Password
   on your device to derive the decryption key. **Even with full
   access to 1Password's database**, an attacker would have
   encrypted blobs and no key to decrypt them.
   - Reference: <https://support.1password.com/secret-key-security/>
   - Full security model: <https://1passwordstatic.com/files/security/1password-white-paper.pdf>
2. **Items, vault names, *and URLs* are all encrypted.** This is the
   detail that distinguishes 1Password from LastPass — the 2022
   LastPass breach exposed which sites each user had accounts on
   (URLs were unencrypted metadata), giving phishers a target list.
   With 1Password, that metadata is encrypted too.
3. **No single point of failure on 1Password's side.** The Secret Key
   lives only on your devices and on your paper Emergency Kit. A
   1Password employee, a court order on 1Password, or a state-actor
   server takeover can't produce the Secret Key — it doesn't exist
   in their infrastructure.
4. **SOC 2 Type II + ISO 27001 certified.** Independent annual
   audits of operational security (employee access, change
   management, incident response). Reports available under NDA.
   <https://1password.com/legal/trust>
5. **Bug bounty + continuous pen-testing.** 1Password runs a
   public bug bounty on Bugcrowd; pays out up to $1M for
   architecture-breaking bugs.

#### What 1Password is contractually liable for

The straight answer: **1Password's contractual liability is capped at
the fees you paid them in the prior 12 months.** That's standard
B2B SaaS, and the Skin Tyee Business plan is in the low-hundreds-of-
dollars-per-year range, so the dollar number is small. Source:
1Password Business Master Services Agreement § Limitation of
Liability — <https://1password.com/legal/terms-of-service>.

This is **deliberately not the protection layer.** You're not relying
on 1Password to write a recovery cheque if something goes wrong.
You're relying on the architecture (above) to make the breach
ineffective in the first place. Compare:

- **LastPass 2022 breach:** vaults stolen, partially encrypted; URL
  metadata leaked; LastPass paid out via a class-action settlement
  but most users had to rotate every password they'd ever stored.
- **1Password equivalent scenario:** encrypted blobs stolen, no
  metadata leaked, Secret Keys never on 1Password's servers.
  Affected users rotate the Master Password as a precaution; vault
  contents stay safe because the encryption holds.

The architecture is why we picked 1Password over alternatives, not
the (limited) contract terms.

#### What you should do to keep your own risk low

1. **Keep your Master Password long and unique.** 14 characters
   minimum; nothing you've used anywhere else.
2. **Keep your Emergency Kit physically secure.** Paper copy in a
   safe / fireproof drawer; not in your laptop bag.
3. **Enable Unlock with SSO** (Step 6 below) once it's available —
   moves your primary credential to Entra ID, where Microsoft adds
   their own conditional-access and risk-detection layer on top.
4. **Don't email or text the Secret Key, ever**, even to yourself.
5. **Report suspicious 1Password emails immediately** — phishers
   target password-manager users specifically. The admin can
   confirm via the admin console whether a notification is real.

#### Incident-response plan if 1Password is breached

The admin's runbook:

1. **Read 1Password's incident bulletin** at
   <https://1password.com/security/> (they publish breach details
   within 48 hours, with technical scope + remediation guidance).
2. **Rotate every staff Master Password** — admin sends a forced
   reset via the admin console; staff sign in once with a new
   Master Password.
3. **Re-print Emergency Kits** for everyone — the Secret Key
   stays the same (it never left 1Password's servers, but the
   reissue makes the documentation match).
4. **Audit access** for the period of the breach using
   1Password's per-item access logs.
5. **Notify council + members** if any band-specific sensitive
   data could have been derived from the breach (per Skin Tyee's
   privacy obligations).

For our scale, the realistic worst case is **password rotation
fatigue and 2-3 days of admin time**, not exposure of decrypted
vault contents. That's the bet we're making by adopting it.

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

## Step 6 — Connect 1Password to Entra ID (Unlock with SSO)

After everything above is working with your Master Password, you can
switch to **Unlock with SSO** — sign in to 1Password using your
`@skintyee.ca` Entra ID account (the same one Outlook uses), with MFA
through the Microsoft Authenticator you set up in
[outlook-skintyee-ca.md](./outlook-skintyee-ca.md). Once enabled, you
no longer type your Master Password to unlock — biometrics
(Touch ID / Face ID / Windows Hello) plus the Entra ID session do the
work.

**You only need to do Step 6 if the admin has already enabled the
Entra ID SSO connection at the org level.** Ask them — if it's set
up, your 1Password account profile will show a "Sign in with SSO"
toggle on **My Profile → Sign-in & Recovery**. If you don't see it,
skip Step 6; the admin work is documented in
[`docs/1password/setup.md`](../1password/setup.md#entra-id-sso) and
they need to finish it first.

### What changes when you turn on Unlock with SSO

| Before | After |
|---|---|
| Type Master Password every time the vault locks | Sign in once via Entra ID; biometrics unlock thereafter |
| Lose access if you forget Master Password (need Emergency Kit) | Lose access if you can't sign in to Entra ID — the admin can reset Entra; Master Password is no longer the recovery path |
| Secret Key required on every new device install | Still required on every new device install (zero-knowledge architecture is unchanged) |
| One credential to roll if compromised | Roll your Entra ID password; 1Password unlock follows automatically |

> ⚠️ **You can't undo SSO easily.** Once you enable Unlock with SSO,
> switching back to a Master Password account requires the admin to
> reset your account (you lose Private vault contents in the process,
> same as the recovery path on the previous section). **Make sure you
> have the Emergency Kit saved before flipping the switch.**

### Enabling Unlock with SSO on your account

1. Open <https://skintyee.1password.ca/> in a browser (signed in with
   your Master Password as usual).
2. **My Profile → Sign-in & Recovery → Sign in with SSO** → click
   **Get started**.
3. The page redirects to **login.microsoftonline.com**. Sign in with
   your `firstname.lastname@skintyee.ca` Entra ID account + approve
   the MFA prompt.
4. Microsoft asks **"This app needs the following permissions"** —
   for the 1Password app the scopes are `openid`, `profile`,
   `email`, and `User.Read`. Approve.
5. You're redirected back to 1Password. The screen now reads
   **"Sign in with SSO is enabled."**
6. Sign out of all your 1Password apps (desktop, mobile, browser
   extension) and sign back in. The sign-in flow now starts with
   **"Sign in with SSO"** — click that, get bounced to Entra ID,
   and you're in.
7. Re-enable biometrics on each device — they were tied to your
   old Master Password and need to be re-paired with the SSO
   session. Mac: **1Password → Settings → Security → Touch ID**.
   Windows: **Settings → Security → Windows Hello**.

### Day-to-day after SSO is on

- **Desktop:** the 1Password app shows your `@skintyee.ca` email
  on the lock screen. Click **Sign in with SSO** → quick Entra ID
  redirect (no password if your Entra session is still live) →
  biometrics. Total: 2 seconds.
- **Mobile:** same flow, biometrics after the first SSO unlock per
  session.
- **Browser extension:** signs in automatically while the desktop app
  is unlocked, same as before.
- **The Secret Key is still required when installing on a NEW
  device.** Keep the Emergency Kit safe.

### Troubleshooting

**"Sign in with SSO" toggle isn't visible**
- The org-level integration isn't enabled. Ask the admin to follow
  the steps in [`docs/1password/setup.md → Entra ID SSO`](../1password/setup.md#entra-id-sso).

**Entra ID login loops back to the SSO selection screen**
- Usually means your Entra ID account is in a state where MFA wasn't
  satisfied. Sign in to <https://outlook.office.com> first to clear
  the MFA challenge, then retry 1Password.

**"You don't have access to this resource"**
- The admin hasn't assigned you to the 1Password Enterprise app in
  Entra ID. They need to add you to the **1Password Users** group in
  Entra (or assign you directly to the app in Enterprise applications
  → 1Password → Users and groups).

**Biometrics no longer work after enabling SSO**
- Re-pair as in step 7 above. The OS keystore links biometric unlock
  to a specific 1Password account session; flipping to SSO created a
  new session.

---

## What's next

Onboarding is mostly done after these steps. Anything else (the Skin
Tyee app, shared mailbox access, WordPress editor, etc.) is per-role
— your admin will point you at the right doc.

**Admin-side companion** (you don't need to read this, but it's
where the admin manages your account + the Entra ID SSO integration):
[`docs/1password/setup.md`](../1password/setup.md).
