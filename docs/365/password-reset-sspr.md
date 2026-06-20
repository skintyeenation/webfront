# Password reset & self-service (SSPR) — Skin Tyee

**What this is:** the procedure for changing/resetting passwords for Skin Tyee
accounts, and the remaining steps to enable **cloud self-service password
reset (SSPR)** so users can reset their own passwords.

**As of:** 2026-06-19. Verify against the live tenant with the `az` commands at
the bottom — the tenant is the source of truth.

---

## The situation

Skin Tyee user accounts (e.g. `lucas.lopatka@skintyee.ca`) are **synced from
an on-premises Active Directory**, not created in the cloud:

| Fact | Value |
|---|---|
| On-prem AD domain | **`STFN.local`** |
| AD location | `OU=SkinTyee Users, DC=STFN, DC=local` |
| Sync | **Password Hash Sync ON** (`passwordSyncEnabled: true`) |
| Password **writeback** | ❌ **OFF** (`passwordWritebackEnabled: false`) |
| Entra ID P1 (SSPR licence) | ✅ assigned to the users who need it |

**Consequence:** because the account is synced and **writeback is off**, the
cloud cannot change the password. Every cloud surface — the Microsoft
change-password page, Outlook, `aka.ms/sspr` — returns:

> *"Your organization doesn't allow you to update your password on this site."*

The password is **mastered in `STFN.local` AD**. It can only be changed there
until writeback is enabled.

---

## A. Change a password NOW (free, works today)

The supported method until SSPR writeback is configured:

- **Self:** log into a PC **joined to the `STFN.local` domain** →
  Ctrl+Alt+Del → **Change a password**.
- **Admin reset:** on the **`STFN.local` domain controller**, open *Active
  Directory Users and Computers* → *SkinTyee Users* OU → right-click the user
  → **Reset Password**.

The new password syncs up to the cloud via Password Hash Sync within ~2 min.

> ⚠️ Do **not** use the app's admin **Rotate password** button on these synced
> accounts — it sets a cloud password (overwritten by the next sync) and a
> "must change at next sign-in" flag the user then can't satisfy in the cloud.
> Rotate is only valid for cloud-only users.

---

## B. Enable cloud self-service reset (SSPR + writeback) — remaining steps

Do these once if you want users to reset their own passwords at `aka.ms/sspr`
without touching the on-prem server each time. **Prerequisite (done): Entra ID
P1 assigned** to each user who'll use SSPR.

### Step 1 — Enable password writeback on the Azure AD Connect server
*On the `STFN.local` box running Azure AD Connect (likely the DC or a server
beside it). This is the linchpin — it can't be done from the cloud.*

- **Wizard (preferred — reliable):** launch **Azure AD Connect** → *Configure* →
  *Customize synchronization options* → sign in to Entra → *Optional features* →
  tick ✅ **Password writeback** → Next → Configure → "Configuration complete". It
  re-authenticates to Azure and provisions writeback on both sides.
- **PowerShell (alternative, finicky):** `-Connector` is **mandatory** (the
  AAD/cloud connector name; `Get-ADSyncConnector | Select Name`):
  ```powershell
  Set-ADSyncAADPasswordResetConfiguration -Connector "skintyeenation.onmicrosoft.com - AAD" -Enable $true
  ```
  > ⚠️ Seen 2026-06-19: this cmdlet failed with **`E_FAIL` / "Password reset
  > configuration may be in an invalid state. Try removing the configuration."**
  > Fix: clear it (`-Enable $false`) then retry, or — better — **use the wizard
  > above**, which succeeds where the cmdlet chokes. Check *Event Viewer →
  > Application* (source `ADSync`) for the underlying cause if it persists.
- The AAD Connect **connector account** (`MSOL_f5db7948b14f`) needs *Reset
  Password* + *Change Password* + write to `lockoutTime` / `pwdLastSet` on the
  *SkinTyee Users* OU. Grant them with
  [`stfn-setup/entra-connect/Enable-PasswordWritebackPermissions.ps1`](../../stfn-setup/entra-connect/Enable-PasswordWritebackPermissions.ps1)
  `-Apply` (elevated; finds the `MSOL_*` account and scopes the ACEs to descendant
  user objects). Order: grant permissions → `Set-ADSyncAADPasswordResetConfiguration
  -Enable $true` → toggle writeback on in Entra (Step 2).

### Step 2 — Turn on SSPR in Entra
[entra.microsoft.com](https://entra.microsoft.com) → **Protection → Password
reset**. Each setting below is a **separate sub-page in that blade's left menu**
(they are *not* all under Properties — Properties holds **only** the master
*"Self service password reset enabled"* switch, which threw us off 2026-06-19).
**Click Save on each page.**

- **Properties** → *Self service password reset enabled* = **Selected** (a pilot
  group) or **All** → Save. *(This is the only setting on this page — expected.)*
- **Authentication methods** → require ≥1 method (e.g. Email, Mobile phone),
  set *Number of methods required to reset* → Save.
- **Registration** → *Require users to register when signing in* = **Yes** → Save.
- **On-premises integration** → *Write back passwords to your on-premises
  directory* = **Yes** (this toggle only appears **after Step 1**) → *Allow
  users to unlock accounts* = **Yes** → Save. **← the writeback toggle that matters.**

> Prereqs confirmed 2026-06-19: tenant has **`AAD_PREMIUM` (Entra ID P1)** — 25
> enabled / 6 assigned — and the operator account `admin@skintyeenation.onmicrosoft.com`
> is **Global Administrator**, so all four pages are editable.

> **Observed 2026-06-19 — don't trust the cloud Graph flag.** After writeback was
> fully enabled on-prem, the directory flag `passwordWritebackEnabled` (Graph
> `onPremisesSynchronization`) **stayed `False`** through a delta sync, an
> `ADSync` service restart, and a wizard re-run. It is an **unreliable / laggy
> beta indicator** — it does *not* reflect the live on-prem state. The
> **authoritative** check is on-prem (elevated):
> ```powershell
> Get-ADSyncAADPasswordResetConfiguration -Connector "skintyeenation.onmicrosoft.com - AAD"
> ```
> which returned **`Enabled : True`, `ServiceStatus : Started`,
> `OnboardingRequiredStatus : NotRequired`** — i.e. writeback **is on**. The only
> definitive proof is an actual SSPR reset landing on a domain PC (Step 3).

### Step 3 — Register + test
- Each user registers methods once at **`aka.ms/sspr`** (or is prompted at next
  sign-in).
- Test a real reset at **`passwordreset.microsoftonline.com`** → confirm it
  succeeds and the new password works against an on-prem resource (proves
  writeback landed in `STFN.local`).

---

## Status checklist

- [x] Entra ID P1 purchased + assigned (SSPR prerequisite)
- [x] **Step 1** — password writeback enabled on the Azure AD Connect server
      (**2026-06-19**): enabled via the wizard *Optional features* → confirmed by
      `Set-ADSyncAADPasswordResetConfiguration … -Enable $true` returning
      *"Password Reset Configuration … updated"*; connector account
      `MSOL_f5db7948b14f` granted Reset/Change Password + write
      `lockoutTime`/`pwdLastSet` on `OU=SkinTyee Users` (verified). **Authoritative
      on-prem confirm:** `Get-ADSyncAADPasswordResetConfiguration` → `Enabled:True`,
      `ServiceStatus:Started` (11:37 PM). (Ignore the cloud `passwordWritebackEnabled`
      flag — see the note above; it stayed False despite this.)
- [x] **Step 2** — SSPR + writeback toggled on in Entra (**2026-06-19**, all four
      sub-pages saved).
- [x] **Step 3 — WRITEBACK PROVEN END-TO-END (2026-06-19).**
      [`Test-PasswordWriteback.ps1`](../../stfn-setup/entra-connect/Test-PasswordWriteback.ps1)
      reset `lucas.lopatka` in the cloud and the new password authenticated against
      `STFN.local` in **~15 s**. Event `31042` (`PasswordResetService`): *"Password
      writeback service is in a healthy state. All serviceHosts for service bus
      endpoints are in running state."*

> Access to the `STFN.local` Azure AD Connect / DC server is **confirmed** — Step 1
> was completed on it. (`STFN-DC`, Entra Connect v2.4.129.0.)

## ⭐ Key finding — which Graph API actually writes back

For a **synced** user, the API matters:

| Graph call | Writes back to `STFN.local`? |
|---|---|
| `PATCH /users/{id}` with **`passwordProfile`** | ❌ **No** — sets the *cloud* password only; PHS overwrites it. *(This is what the app's `rotateUserPassword` currently does — `graph-feed.service.ts`. It silently fails to reach the domain for the 8 synced users.)* |
| `POST /users/{id}/authentication/methods/{id}/resetPassword` (**admin SSPR reset**) | ✅ **Yes** — routes through the writeback service; lands on-prem in ~15 s. Needs an **MFA-fresh** token + Authentication/Global Admin. |
| `POST /me/changePassword` (self-service, needs current pw) | ✅ Yes — for the user's *own* password. |

**App implication (rotate-password feature):** the admin "rotate" and a future
user "rotate my own" must use the **`resetPassword` / `changePassword`** APIs, **not**
`passwordProfile`, for synced users. See the conflict analysis in the staff-auth
notes. The cloud `passwordWritebackEnabled` flag is unreliable — ignore it; the
proof is the end-to-end test above.

---

## Verify (live tenant is the truth)

**Graph PowerShell (no `az` needed)** — works silently on `STFN-DC` via the WAM
token broker (no device-code prompt), needs `OnPremDirectorySynchronization.Read.All`:

```powershell
Connect-MgGraph -Scopes OnPremDirectorySynchronization.Read.All -NoWelcome
(Invoke-MgGraphRequest -Method GET `
  -Uri 'https://graph.microsoft.com/beta/directory/onPremisesSynchronization').value[0].features |
  Select-Object passwordWritebackEnabled, passwordSyncEnabled
```
> Note: `Connect-MgGraph -UseDeviceCode` fails in a **non-interactive/background**
> shell with *"An error occurred when writing to a listener"* — run the above in an
> interactive session (WAM brokers it silently) instead.

**Azure CLI** (installed by `stfn-setup/setup-stfn-tools.ps1` step 8):

```bash
# Is writeback on yet?
az rest --method GET \
  --url "https://graph.microsoft.com/beta/directory/onPremisesSynchronization" \
  | python3 -c "import json,sys; f=json.load(sys.stdin)['value'][0]['features']; \
print('passwordWritebackEnabled:', f.get('passwordWritebackEnabled')); \
print('passwordSyncEnabled:', f.get('passwordSyncEnabled'))"

# Where is a user mastered on-prem?
az rest --method GET \
  --url "https://graph.microsoft.com/v1.0/users/<id>?\$select=userPrincipalName,onPremisesDomainName,onPremisesDistinguishedName,onPremisesSyncEnabled"

# Who holds the Entra ID P1 (AAD_PREMIUM) licence?
az rest --method GET --url "https://graph.microsoft.com/v1.0/subscribedSkus?\$select=skuPartNumber,consumedUnits,prepaidUnits"
```

---

## In-app password reset — design (the app's UX) 

Two distinct flows, mapped to the synced-account reality. **Constraint:** no
trips to the `STFN.local` DC, and regular users never open the 365/Entra portal.

### Flow 1 — user resets their OWN password (self-serve) ✅ shipped
- **Account screen** (`app/src/components/pages/Account.tsx`): **"Reset my
  password"** (signed in) + **"Forgot your password?"** (signed out) open
  **`aka.ms/sspr`** in an in-app browser tab (`expo-web-browser` — a raw
  `<WebView>` gets blocked by Microsoft for sign-in).
- The user verifies with their **registered phone / personal email /
  authenticator** — *not* their `@skintyee.ca` mailbox — then sets a new
  password; **writeback lands it on `STFN.local`**.
- **Hard prerequisite:** users must **register SSPR methods BEFORE** they're
  locked out (at `aka.ms/sspr` while they can still sign in). Until they do,
  self-serve can't verify them and the flow is dead in an emergency.

### Flow 2 — admin resets ANOTHER user (EditMember → "Password & access")
**Shipped, app-only** (no DC, no delegated auth):
- **Force password reset** — `POST /v1/directory/:id/force-password-reset`:
  revokes the user's sessions, shows the admin **relay instructions**, and
  emails **only a personal (non-`@skintyee.ca`) address** if one's on file —
  *never* the locked work mailbox (the user can't read it, and the "link" is
  just the public `aka.ms/sspr` page). The user then self-serves.
- **Lock / Unlock** — `POST /v1/directory/:id/block { blocked }`:
  `accountEnabled` toggle + `revokeSignInSessions`.
  - ⚠️ For synced users a later on-prem sync can flip `accountEnabled` back —
    for a guaranteed lock use a **Conditional Access "block" group** (app
    already has `Group.ReadWrite.All`; needs a one-time CA policy).
  - ⚠️ Locked users (`enabled:false`) drop out of the directory list (filtered
    `enabled:true`) — an admin "show locked" view is a TODO to unlock later.

**NOT possible app-only — admin SETTING a temp password for a synced user:**
- The removed **"Rotate password"** button used `PATCH /users/{id}`
  `passwordProfile`, which only sets the **cloud** password — PHS overwrites it,
  so it **never reached the domain**. It 403'd for every synced user once
  guarded; removed.
- A real admin reset must use Graph's **admin SSPR reset**
  (`POST /users/{id}/authentication/methods/{methodId}/resetPassword`), which
  routes through writeback. Two ways to get there:

| Route | Auth | Works? | Effort |
|---|---|---|---|
| **A — app-only resetPassword** | app-only credential + `UserAuthenticationMethod.ReadWrite.All` | **UNVERIFIED** — `resetPassword` has historically needed a delegated MFA token; may be rejected app-only | small *if* it works |
| **B — MSAL delegated admin** | admin signs into the app (MSAL) → API calls `resetPassword` **as them** | **YES, definitively** — it's exactly what the Entra portal does, moved in-app | larger — wires real Entra auth, replaces the `x-role` stub app-wide |

**Recommendation:** test **Route A** first (quick; also unblocks a real locked-out
user). If app-only `resetPassword` writes back to `STFN.local`, restore a working
**"Reset password"** button in EditMember (admin → hands a temp password). If it's
rejected, **Route B (MSAL)** is required — and it's the same delegated sign-in
that would replace the `x-role` stub everywhere, so it's worth doing for the
broader auth story regardless.

### Intended UX split
- **Own account → SSPR self-serve** (`aka.ms/sspr`).
- **Admin editing a user →** admin-initiated:
  - **Reset password** (hand a temp password) — *pending Route A/B*.
  - **Force reset** (push the user to self-serve) — shipped.
  - **Lock / Unlock** — shipped.

### Code
- `api/src/graph-feed.service.ts` — `setAccountEnabled`, `revokeSignInSessions`
  (+ `rotateUserPassword` now refuses synced users).
- `api/src/controllers.ts` (`DirectoryController`) — `block`,
  `force-password-reset`.
- `api/src/email-template.ts` — `renderPasswordResetEmail`.
- `app/src/components/pages/Account.tsx` — self-serve buttons.
- `app/src/components/pages/EditMember.tsx` — "Password & access" panel.
