# Hybrid Entra Join — rollout plan (Skin Tyee)

**Goal:** make the domain PCs (joined to `STFN.local` / STFN-DC) **also** register
in Entra ID, so they appear as proper `ServerAd`/Hybrid devices (not "Workplace"),
get clean device inventory + desktop SSO + device-based Conditional Access later.

**Risk: low + reversible.** This is *additive* — it does **not** change domain
join, user accounts, or how anyone logs into Windows. Login keeps working exactly
as now. You can roll it back.

**Have already:** AD domain `STFN.local`, DC **STFN-DC** (Win Server 2022), **Entra
Connect** installed + PHS syncing, Entra tenant `skintyeenation`.

---

## Phase 0 — Prereqs (15 min)
- **Entra Connect** up to date (v2+). On the DC/sync server: it's installed.
- **Network/firewall** — domain PCs must reach (443):
  `login.microsoftonline.com`, `device.login.microsoftonline.com`,
  `enterpriseregistration.windows.net`, `autologon.microsoftazuread-sso.com`.
- Have an **Enterprise Admin** (`STFN\stfnadmin`) + a **Hybrid Identity Admin**
  (the `admin@…onmicrosoft.com` covers it).
- Pick **one pilot PC** to test before any broad rollout.

## Phase 1 — Turn on Hybrid Join in Entra Connect (10 min, on the sync server)
1. Run **`AzureADConnect.exe`** → **Configure** → **Configure device options** → Next.
2. **Configure Hybrid Azure AD join** → Next.
3. Device OS: tick **Windows 10 or later domain-joined devices**.
4. SCP configuration: select the **`STFN.local`** forest → Authentication Service =
   **Azure Active Directory** (managed; you have no AD FS) → supply
   **`STFN\stfnadmin`** (Enterprise Admin) → Next → **Configure**.
   - This writes a **Service Connection Point (SCP)** into AD
     (`CN=Configuration → Services → Device Registration Configuration`) that tells
     domain PCs which tenant to register with. *Nothing on the PCs changes yet.*

## Phase 2 — Verify the SCP (2 min)
On the DC: confirm the SCP exists (keywords = your tenant id
`ee46daed-…-203a4bec` + tenant name). Entra Connect reports success; that's enough.

## Phase 3 — Pilot ONE PC (15 min)
On the chosen domain PC, signed in as a normal user:
```cmd
gpupdate /force
dsregcmd /status        :: BEFORE — expect DomainJoined: YES, AzureAdJoined: NO
```
Then **sign out and back in** (or reboot). Windows' built-in scheduled task
**`\Microsoft\Windows\Workplace Join\Automatic-Device-Join`** fires on sign-in and
registers the device. Re-check:
```cmd
dsregcmd /status        :: AFTER — DomainJoined: YES *and* AzureAdJoined: YES = Hybrid joined
```
If `AzureAdJoined` is still NO after a sign-in + a few minutes:
- `dsregcmd /status` → read the **Diagnostic Data** section for the failing step,
- confirm the Phase-0 URLs are reachable, and that PHS/Entra Connect synced the
  *computer* object (the computer OU must be in the Entra Connect **sync scope** —
  see `entra-connect.md` Phase 3; add the OU if computers aren't syncing).

## Phase 4 — Confirm in Entra (2 min)
Entra admin → Devices → the pilot PC now shows **Join type = Hybrid Azure AD
joined** (`trustType: ServerAd`). In the app's Devices page it'll group correctly
under the domain instead of "Workplace".

## Phase 5 — Roll out to the rest (auto)
Nothing per-PC needed — every domain PC picks up the SCP via Group Policy and
**auto-registers on its next user sign-in** (same scheduled task). Just make sure
all computer OUs are in the Entra Connect sync scope. Spread it over a few days;
watch the Entra device list fill in as Hybrid.

## Rollback (if anything misbehaves)
1. Entra Connect → Configure device options → **uncheck** Hybrid Azure AD join (removes the SCP).
2. On a PC, undo its registration: `dsregcmd /leave` (leaves Entra; **stays domain-joined**).
   No impact on AD, accounts, or login.

---

## Why this fixes the Devices map/compliance too
Once PCs are Hybrid-joined they report `trustType: ServerAd` → the app maps that to
`Hybrid` → they group as **domain machines**, not BYOD, and genuine BYOD (if any
ever appears) correctly lands in its own group. Until then, the app anchors
everything on **STFN-DC by name** as an interim. See ADR-16, `entra-connect.md`.
