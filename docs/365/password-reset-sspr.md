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

- **Wizard:** launch **Azure AD Connect** → *Configure* → *Customize
  synchronization options* → *Optional features* → tick ✅ **Password
  writeback** → Next → Finish, **or**
- **PowerShell** on that server:
  ```powershell
  Set-ADSyncAADPasswordResetConfiguration -Enable $true
  ```
- The AAD Connect **connector account** (`MSOL_f5db7948b14f`) needs *Reset
  Password* + *Change Password* + write to `lockoutTime` / `pwdLastSet` on the
  *SkinTyee Users* OU. Grant them with
  [`stfn-setup/entra-connect/Enable-PasswordWritebackPermissions.ps1`](../../stfn-setup/entra-connect/Enable-PasswordWritebackPermissions.ps1)
  `-Apply` (elevated; finds the `MSOL_*` account and scopes the ACEs to descendant
  user objects). Order: grant permissions → `Set-ADSyncAADPasswordResetConfiguration
  -Enable $true` → toggle writeback on in Entra (Step 2).

### Step 2 — Turn on SSPR in Entra
[entra.microsoft.com](https://entra.microsoft.com) → **Protection → Password
reset**:
- **Properties** → *Self service password reset enabled* = **Selected** (a pilot
  group) or **All**.
- **Authentication methods** → require ≥1 method (e.g. Email, Mobile phone),
  set *Number of methods required to reset*.
- **Registration** → *Require users to register when signing in* = **Yes**.
- **On-premises integration** → *Write back passwords to your on-premises
  directory* = **Yes** (this toggle only appears **after Step 1**) → *Allow
  users to unlock accounts* = **Yes**.

### Step 3 — Register + test
- Each user registers methods once at **`aka.ms/sspr`** (or is prompted at next
  sign-in).
- Test a real reset at **`passwordreset.microsoftonline.com`** → confirm it
  succeeds and the new password works against an on-prem resource (proves
  writeback landed in `STFN.local`).

---

## Status checklist

- [x] Entra ID P1 purchased + assigned (SSPR prerequisite)
- [ ] **Step 1** — password writeback enabled on the Azure AD Connect server
      (`passwordWritebackEnabled` still **false**) ← **blocker**
- [ ] **Step 2** — SSPR enabled + writeback toggled on in Entra
- [ ] **Step 3** — users registered + reset tested

**Open question:** confirmed access to the `STFN.local` Azure AD Connect /
domain-controller server. Without it, Step 1 is impossible and on-prem reset
(section A) remains the only path.

---

## Verify (live tenant is the truth)

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
