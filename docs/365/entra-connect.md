# Entra Connect — hybrid identity setup & progress

Operational record + runbook for linking the on-prem **`STFN.local`** Active
Directory (on the `STFN-DC` domain controller) to the **`skintyee.ca`** Entra
tenant. Companion to [`entra-id.md`](entra-id.md); the decision rationale is
**ADR-16** in [`../architecture-decisions.md`](../architecture-decisions.md).

> **Status:** Phase 1 ✅ complete (2026-06-18) · Phase 2 ✅ complete + **verified
> (2026-06-18): all 8 users `OnPremisesSyncEnabled=True`, no duplicates** · Phase 3
> 🔄 Hybrid Entra Join (domain PCs visible in Entra, **no Intune**; Intune/BYOD
> deferred to contractors / Phase 4).

## The model — cloud-first coexistence

We run **both** worlds side by side, with a clean line between *existing* and
*new*:

| | **Existing 14 staff** | **New staff (added via the app)** |
|---|---|---|
| Born in | on-prem `STFN.local` AD (stays) | cloud Entra ID (`POST /users`, ADR-15) |
| Identity type | **Hybrid** — synced up by Entra Connect | **Cloud-only** |
| Log into legacy **domain-joined** PCs (Xyntax, file server) | ✅ yes | ❌ no |
| Log into **Entra-joined** PCs | ✅ (with Hybrid join) | ✅ yes |
| M365 / email / the app | ✅ | ✅ |

Existing accounts and the DC stay exactly as they are; we simply **stop growing
the on-prem side**. New people are cloud-born from the app and live on
Entra-joined machines.

### The hard constraint that shapes this

**Entra Connect / Entra Cloud Sync only sync `AD → cloud`.** A cloud-only user
**cannot** be written back into on-prem AD — [it's an explicit Microsoft design
limitation](https://learn.microsoft.com/en-us/entra/identity/hybrid/group-writeback-cloud-sync)
(only *groups* can be provisioned cloud→AD, never user objects). So:

- App-created (cloud-only) users **cannot** reach the **`STFN.local` domain-joined
  PCs** or **Xyntax** (which authenticates against the local domain).
- **Implication:** any **new** finance/admin hire who needs **Xyntax** or a
  domain-joined machine still needs an **on-prem AD account** created the old way
  (or via a future on-prem provisioning bridge — see ADR-16 "Rejected"). The app
  handles the ~90% case (council, programs, general staff); the few Xyntax users
  are the exception.

> This is why the app's `POST /users` (ADR-15) is **not** re-architected: in the
> cloud-first model it's correct as-is. Only if we later decide app-created users
> *must* log into domain PCs would we need to flip the app to provision into AD
> first (a Hybrid Runbook Worker / queue + on-prem agent) — deliberately **not**
> built. See ADR-16.

## Device management — Intune

- **Existing domain-joined PCs** (FS*, the laptops, XYNTAX-FMS1/2, the loaner) are
  managed by **Group Policy** from the DC — *no change, no Intune.*
- **New Entra-joined PCs** are managed by **Microsoft Intune** — the cloud
  replacement for Group Policy (BitLocker, Defender baselines, compliance, app
  deployment, remote wipe). Required for Conditional Access "require a compliant
  device."
- ⚠️ **Licensing:** Intune is **not** in **Microsoft 365 Business Standard** (our
  current plan — see [`pricing.md`](pricing.md)). Getting it means **upgrading to
  Business Premium** (~$22 vs ~$12.50/user/mo, also bundles Defender for Business
  + Conditional Access) **or** adding **Intune Plan 1** (~$8/user/mo standalone).
  *Verify current pricing at purchase.* Intune is opt-in when the first machine is
  Entra-joined — not a day-one blocker.

> 💲 **Cost-saving alternative — the AD-first approach.** That recurring Intune
> license is the main *new* cost of going cloud-first. If license budget is the
> binding constraint, the **AD-first** model (ADR-16 "Deferred fallback") avoids
> it entirely: keep **new** machines **domain-joined** and managed by **Group
> Policy on the DC we already own** (no Intune, no Business Premium), and have the
> app provision users **into AD first** (an on-prem `New-ADUser` bridge), letting
> Entra Connect sync them **up**. It swaps an **ongoing per-user license** for a
> **one-time engineering build** (the bridge + amending ADR-15) and keeps app-made
> users able to log into domain PCs/Xyntax. Trade-off: more on-prem surface to run
> long-term. See **ADR-16** for the full comparison and when to pick it.

## Access tiers (one tenant, mixed per-user)

Premium isn't all-or-nothing. Licensing is **per user** in the single
`skintyee.ca` tenant, and **Intune is per-device opt-in** — so we run three tiers
side by side without needing a second tenant:

| Tier | Device | M365 license | Intune | On-prem AD |
|---|---|---|:--:|:--:|
| **Managed staff** | org-owned | **Business Premium** | ✅ enrolled | hybrid / cloud |
| **Basic staff** | org-owned | **Business Standard** | ❌ | domain-joined |
| **Contractors (BYOD)** | **their own** | **none** (unlicensed / B2B guest) | ❌ never | ❌ never |

**Contractors just need the app** — they bring their own devices and use **only
the Skin Tyee app**, nothing else. Because the app is gated by **Entra app roles**
(ADR-1), signing into it does **not** consume a Microsoft 365 license, so a
contractor is just an Entra identity in the right app group at **$0/user**.
Provision them two ways:

- **Internal account** (`contractor.name@skintyee.ca`) via the app's normal Add
  Member flow, but **skip license assignment** — ADR-15 already supports the
  no-license path; or
- **B2B guest** — invite their existing email; they sign into the app as a guest
  (free up to 50,000 monthly active users).

They get **no Intune, no email/Office, no on-prem account** — pure app access.
Conditional Access scopes the strict **"require compliant device"** rule to the
**managed-staff** group only, so contractor BYOD is never enrolled and never needs
to be. (If a contractor ever *did* need `@skintyee.ca` email, that's a
Business Standard license — still no Intune — but that's the exception, not the
norm.)

## Environment snapshot

| Item | Value |
|---|---|
| Domain controller | `STFN-DC` (PDC), Windows Server 2022 |
| On-prem forest/domain | `STFN.local` (non-routable) |
| Entra tenant | `skintyeenation.onmicrosoft.com`; **`skintyee.ca`** verified + default |
| Sign-in method | **Password Hash Sync (PHS)** |
| Entra Connect | ✅ installed + configured **v2.4.129.0** (2026-06-18), PHS syncing; first config attempt left no connectors (see Troubleshooting), fixed by re-running the wizard to completion |
| Sync verified | ✅ 2026-06-18 — 8/8 users `OnPremisesSyncEnabled=True`, anchored, **no duplicates** (5 soft-matched, 3 created). Cloud sync account `Sync_STFN-DC_*` auto-created |
| Domain-joined computers | 12 objects (DC + 11) — see inventory below; only 3 live in 2026 |

### Domain-joined computer inventory (2026-06-18)

All non-DC machines sit in the default **`CN=Computers`** container — **not a real
OU**, so GPOs can't be linked to them directly (only domain-level applies). Moving
them into a proper OU structure is a Phase 3 prerequisite. No `description` set on
any object.

| Name | OS / build | Last logon | Status | Notes |
|---|---|---|---|---|
| `STFN-DC` | Server 2022 (20348) | 2026-06-17 | 🟢 live | the DC (`OU=Domain Controllers`) |
| `ITG-LOANERPC` | Win 10 Pro (19045/22H2) | 2026-06-11 | 🟢 live | loaner laptop; Win 10 = EOL Oct 2025 |
| `XYNTAX-FMS2` | Win 11 Pro (22631/23H2) | 2026-06-09 | 🟢 live | **finance workstation — Xyntax now runs here only** |
| `STFN2024-LT02` | Win 11 Pro | 2024-11-23 | 🟡 stale | laptop |
| `XYNTAX-FMS1` | Win 11 Pro | 2024-11-10 | 🟡 stale | old finance box (FMS2 replaced it) |
| `STFN2024-LT03` | Win 11 Pro | 2024-10-15 | 🟡 stale | laptop |
| `STFN2024-LT01` | Win 11 Business | 2024-09-18 | 🟡 stale | laptop |
| `STFN2022-LT01` | Win 11 Pro | 2024-08-19 | 🟡 stale | laptop |
| `FS1`–`FS4` | Win 10 Pro (19045) | 2024-08-07 | 🟡 stale | **workstations, not servers** (client OS); batch created May 2024, all last seen the same morning — decommissioned together |

> ⚠️ **Single point of failure:** with `XYNTAX-FMS1` stale since Nov 2024, all
> domain-authenticated **Xyntax/finance** work now depends on the single
> `XYNTAX-FMS2`. Worth a second known-good finance machine.

## Progress

### ✅ Phase 1 — Normalize on-prem accounts (2026-06-18)

The on-prem accounts had `@STFN.local` UPNs **with spaces** (e.g.
`Gabriel Tom@STFN.local`) and empty `mail`/`proxyAddresses` — invalid for Entra
and guaranteed to duplicate against the existing cloud accounts. Fixed via
[`Phase1-PrepUsers.ps1`](#runbook--phase-1-script) run from an **elevated**
PowerShell on `STFN-DC`:

- ✅ Added **`skintyee.ca`** as a forest UPN suffix.
- ✅ Created **`OU=SkinTyee Users,DC=STFN,DC=local`**.
- ✅ For 8 users set `UserPrincipalName`, `sAMAccountName`, `mail`, and
  `proxyAddresses` to `firstname.lastname@skintyee.ca` and moved them into the OU.

| Person | sAMAccountName & UPN → | Sync outcome |
|---|---|---|
| Gabriel Tom | `gabriel.tom` / `gabriel.tom@skintyee.ca` | **Merge** → existing cloud acct |
| Kim Pike | `kim.pike` | **Merge** → existing cloud acct |
| Lucas Lopatka | `lucas.lopatka` | **Merge** → existing cloud acct |
| Melissa Dyck | `melissa.dyck` | **Merge** → existing cloud acct |
| Niki Misfeldt | `niki.misfeldt` | **Merge** → existing cloud acct |
| Nathan Michaluk | `nathan.michaluk` | **New** cloud acct on first sync |
| Shaneika McCorkell | `shaneika.mccorkell` | **New** cloud acct on first sync |
| Jason Wiebe | `jason.wiebe` | **New** cloud acct on first sync |

**Excluded from sync scope** (left in `CN=Users`, not synced): `Administrator`,
`Guest`, `STFNadmin`, `Xyntax1`, `Xyntax2`, `remote`.

**Verified post-run:** `(Get-ADForest).UPNSuffixes` = `skintyee.ca`; all 8 objects
present in `OU=SkinTyee Users` with matching UPN / mail / `SMTP:` proxy.

> ⚠️ The run changed these users' logon names (UPN + down-level). Affected staff
> should **sign out and back in** on their PCs.

### ✅ Phase 2 — Install Entra Connect (done + verified 2026-06-18)

**Prereqs verified (2026-06-18):** Server 2022, DC, .NET 4.8, PS 5.1, 15.6 GB RAM,
947 GB free, Entra endpoints reachable. MSI downloaded + signature-valid at
`C:\Users\stfnadmin\Downloads\AzureADConnect.msi`.

0. **TLS 1.2 prereq** — run
   [`stfn-setup/entra-connect/Set-TlsStrongCrypto.ps1`](../../stfn-setup/entra-connect/Set-TlsStrongCrypto.ps1)
   `-Apply` (elevated), then open a **new** elevated shell.
1. Run `C:\Users\stfnadmin\Downloads\AzureADConnect.msi` (elevated; self-elevates
   via UAC). Agree to terms; on the Express page click **Customize**.
2. **Install required components** — leave **all** optional boxes **unchecked**
   (custom install location, existing SQL Server, existing service account, custom
   sync groups, import settings) → **Install**. Defaults are correct: SQL **LocalDB**
   is fine under 100k objects (~14 here); on a DC the installer auto-uses a **gMSA**
   for the sync service (supply **Enterprise Admin** creds when prompted).
3. **User sign-in** → **Password Hash Synchronization** → **Next**.
4. **Two separate sign-ins on two different screens:**
   - **"Connect to Microsoft Entra ID"** (cloud, browser popup) → a **Global
     Administrator** / Hybrid Identity Administrator for the tenant — the
     `admin@skintyeenation.onmicrosoft.com` break-glass account works (Global Admin
     already covers the Hybrid Identity Admin role; no special account needed).
   - **"Connect your directories"** → **Add Directory** for forest **STFN.local**.
     This screen offers two radio options; **pick the first**:
     - ✅ **"Create new AD account"** ("let Entra Connect create the account for
       you") → enter an **Enterprise Admin** — **`STFN\stfnadmin`** (pw confirmed
       valid 2026-06-18). Used **once** to auto-create the `MSOL_xxxxxxxx` AD DS
       connector account. **EA is allowed on this option.**
     - ❌ **"Use existing AD account"** → do **not** use this. It demands a
       pre-made **non-admin** connector account with replication rights, and it
       **rejects EA/DA** with *"using an enterprise or domain admin account for
       your AD forest account is not allowed"* (see Troubleshooting). We have no
       such pre-built account, and it can't be created from the non-elevated
       Claude session (AD write = Access denied), so the first option is the path.
   **Just before this, the wizard scans the *whole* directory and warns the
   `.local` UPN suffix isn't a verified Entra domain** — tick **"Continue without
   matching all UPN suffixes to verified domains"** and proceed. It's harmless: the
   only `@stfn.local` accounts (stfnadmin, Administrator, krbtgt…) are **outside**
   the synced OU; all 8 synced users are `@skintyee.ca` (verified + default), so
   none of them are affected. (See Troubleshooting.)
5. **Domain and OU filtering** → "Sync selected domains and OUs" → **uncheck
   everything except `SkinTyee Users`** → **Next**. Do **not** pick "Sync all" — and
   **don't** add Computers/Groups OUs: existing PCs stay **GP-managed on-prem**, new
   PCs are **Entra-joined** (cloud-born), and app/M365 access is via **Entra app
   roles** not on-prem groups. Syncing only the 8 users is the intended footprint;
   computer sync is a *Phase 3* Hybrid-Entra-Join choice, not now (ADR-16).
6. **Uniquely identifying your users** (the **soft-match** screen — defaults are
   correct *because* Phase 1 normalized UPN + mail):
   - On-prem identification → **"Users are represented only once across all
     directories"** (single forest).
   - Entra source anchor → **"Let Azure manage the source anchor for me"**
     (`ms-DS-ConsistencyGuid` — the immutable anchor Phase 1 keyed on).
   - Matching attribute → leave **`userPrincipalName`**. This is what makes the 5
     existing cloud accounts **merge** instead of duplicate (on-prem
     `first.last@skintyee.ca` == the cloud UPN). → **Next**.
   *(If a separate **"Filter users and devices"** page appears here, leave
   **"Synchronize all users and devices"** — "all" means all objects **within the
   OU already selected** in step 5, not the whole directory; that page is just an
   optional group-based pilot filter we don't need.)*
7. **Optional features** → leave **everything unchecked**. In particular **no
   password writeback and no group writeback** — the design is **one-way PHS,
   AD→cloud** (ADR-16); writeback would contradict it. → **Next**.
8. **Ready to configure** → keep **"Start the synchronization process when
   configuration completes"** checked → **Install**.
9. When it finishes, run
   [`Verify-EntraSync.ps1`](../../stfn-setup/entra-connect/Verify-EntraSync.ps1)
   `-Cloud`: **the 5 "merge" users show `OnPremisesSyncEnabled = True` on their
   *existing* cloud account (no duplicates)** and the 3 "new" users were created.
   Cross-check in the [Entra admin center](https://entra.microsoft.com) → Users.
   **✅ Verified 2026-06-18: 8/8 `OnPremisesSyncEnabled=True`, all anchored, no
   duplicates — 5 soft-matched, 3 (`nathan.michaluk`, `jason.wiebe`,
   `shaneika.mccorkell`) created by the first cycle.** Note: Graph can lag a few
   minutes behind the sync cycle — an immediate check may show `0/8`; re-run after
   the cycle settles.
10. ~~Assign M365 licenses to the 3 new users.~~ **Not needed (decided
    2026-06-18)** — the 3 new synced users don't require M365 licenses assigned.

### 🔄 Phase 3 — Hybrid Entra Join (devices visible in Entra, no Intune)

**Decision (2026-06-18): Hybrid Entra Join, NOT Intune.** All machines stay
**domain-joined and Group-Policy-managed** on `STFN-DC`; we just *register* them up
to Entra so they're visible in the cloud and usable for device-based Conditional
Access. No `@$22` Business Premium upgrade, no Intune license — those are
**deferred** (see below). Hybrid join is registration/visibility only; it does
**not** manage the devices (GPO still does) and needs no per-user license.

> **Intune / Entra-join / BYOD — deferred until contractors (Phase 4).** We have
> no remote, cloud-only, or BYOD devices yet, so cloud device *management* isn't
> needed. Revisit when **contractors / BYOD** arrive: that's when Intune (or the
> AD-first bridge) and Conditional Access "require compliant device" earn their
> cost. The licensing comparison (Business Premium vs Intune Plan 1 vs AD-first)
> is preserved in **ADR-16** for that decision.

> **Restricting which users log into which PCs does NOT need Intune.** It's
> on-prem AD/GPO: per-user `Set-ADUser <u> -LogonWorkstations "PC1,PC2"`, or a GPO
> on the computer OU using **User Rights Assignment** (Allow/Deny log on locally).
> The OU created below is what those GPOs link to.

**Step 1 — Cleanup prereqs (elevated on `STFN-DC`):**
- **Computer OU.** ✅ **Done 2026-06-18.** All PCs sat in `CN=Computers` (not a GPO
  link target and awkward to scope for sync).
  [`Phase3-PrepComputerOU.ps1`](../../stfn-setup/entra-connect/Phase3-PrepComputerOU.ps1)
  `-Apply` created `OU=SkinTyee Computers` (protected) and moved the live machines
  (`XYNTAX-FMS2`, `ITG-LOANERPC`) in; verified both now resolve under the new OU and
  `CN=Computers` holds only the 9 stale objects. (`STFN-DC` stays in
  `OU=Domain Controllers`.)
- **Remove the 9 stale objects** (`FS1`–`FS4`, `XYNTAX-FMS1`, `STFN2024-LT01/02/03`,
  `STFN2022-LT01`) via
  [`Phase3-RemoveStaleComputers.ps1`](../../stfn-setup/entra-connect/Phase3-RemoveStaleComputers.ps1):
  `-Apply` to disable, then `-Apply -Delete` after a settling period. No point
  Hybrid-joining ghosts.
- **Add a second finance machine.** `XYNTAX-FMS2` is the *only* live Xyntax box
  (single point of failure).

**Step 2 — Add the computer OU to the Entra Connect sync scope.** Hybrid join needs
the *computer objects* synced up (Entra confirms the device against its synced
object). Re-run the wizard → **Customize synchronization options** → Domain/OU
filtering → also check **`OU=SkinTyee Computers`** → finish + sync.

**Step 3 — Configure the SCP (elevated wizard on `STFN-DC`).** Launch
`AzureADConnect.exe` → **Configure device options** → **Configure Hybrid Azure AD
join** → device OS = **"Windows 10 or later domain-joined"** → for forest
`STFN.local` set the authentication service to **Azure Active Directory** (we're a
managed / PHS domain — no AD FS) → supply **Enterprise Admin** `STFN\stfnadmin` to
write the Service Connection Point → finish.

**Step 4 — Register the devices.** On each live domain-joined PC the
`\Microsoft\Windows\Workplace Join\Automatic-Device-Join` scheduled task registers
it to Entra (runs at sign-in; force with `dsregcmd /join` as SYSTEM, or reboot +
sign in). Check on the device: `dsregcmd /status` → **`AzureAdJoined : YES`** and
**`DomainJoined : YES`** together = Hybrid joined.

**Step 5 — Verify.** [entra.microsoft.com](https://entra.microsoft.com) → **Devices
→ All devices**: the machines show **Join Type = "Microsoft Entra hybrid joined."**

## Troubleshooting

**"Using an enterprise or domain admin account for your AD forest account is not
allowed"** on the *Connect your directories* screen. This appears only when you
pick **"Use existing AD account"** and type a privileged account — Entra Connect
v2 blocks EA/DA on that option by design (it expects a non-admin connector
account with just replication rights). It does **not** mean your password is
wrong. Two earlier red herrings that produce a similar *"username or password is
incorrect"* on the same screen: a **made-up account** (e.g. `STFN\sync` /
`STFN\STFNsync` that doesn't exist yet), or a bare username with no `STFN\`.

- **Fix:** choose **"Create new AD account"** instead and supply the Enterprise
  Admin (`STFN\stfnadmin`) — EA is permitted there, and the wizard creates its
  own `MSOL_` connector. Do **not** hand-build a sync account: creating one (plus
  granting it *Replicating Directory Changes* + *…All*) needs a fully elevated AD
  context the non-elevated Claude session lacks (`New-ADUser` → Access denied
  even with valid `-Credential`), which is exactly why the wizard does it itself.

**"Unable to install Microsoft OLE DB Driver for SQL Server"** during *Install
required components.* The Connect installer bundles the OLE DB driver
(MSOLEDBSQL); its MSI fails if there's a **pending reboot**. On `STFN-DC` this was
caused by a queued `PendingFileRenameOperations` (84 entries) even though the
CBS/Windows-Update reboot flags were clear.

- **Fix:** **reboot the DC**, then re-launch `AzureADConnect.msi` and resume the
  wizard (checkbox choices unchanged). The reboot clears the pending file renames
  and the driver installs.
- **Plan B** (only if it still fails after reboot): get the **exact** bundled
  driver by extracting it from the Connect installer —
  `msiexec /a "C:\Users\stfnadmin\Downloads\AzureADConnect.msi" /qb TARGETDIR=C:\AADCextract`
  then run the extracted `msoledbsql*.msi` (elevated). (Avoid grabbing a random
  standalone build from a download mirror — version must match what Connect
  expects, and a plain `fwlink` fetch can return an HTML stub, not the MSI.)
- *Not* a version conflict here — nothing was pre-installed; and it is not a
  checkbox/option issue (all five "Install required components" boxes are correctly
  left unchecked).

**`Start-ADSyncSyncCycle` fails with `0x80230613` "the specified management agent
could not be found", and `Get-ADSyncConnector` returns nothing.** **Root cause
(confirmed 2026-06-18):** the Entra Connect **configuration never completed** —
the installer laid down the binaries and started the `ADSync` service, but the
final *Configure* step that creates the two **management agents / connectors**
(the `STFN.local` AD connector + the `…onmicrosoft.com - AAD` connector) didn't
finish. With no connectors there is no sync, which is why the post-install cloud
verify found the 5 pre-existing users still cloud-only and the 3 new users
absent.

- **Confirm:** elevated `Get-ADSyncConnector | Select Name,Type` — a healthy
  install shows **two** connectors; an incomplete one shows **none**.
- **Fix — re-run the wizard to completion:** launch
  `C:\Program Files\Microsoft Azure Active Directory Connect\AzureADConnect.exe`
  (or Start → "Microsoft Entra Connect") → **Customize** → PHS → Entra sign-in +
  AD ("Create new AD account", `STFN\stfnadmin`) → OU filter `SkinTyee Users` →
  **Configure**, and **watch it reach the green "Configuration complete" screen**
  (the step that writes the connectors — last time it was abandoned/errored
  before this, likely behind the OLE DB / pending-reboot issue below).
- **Then:** elevated on `STFN-DC` (the `ADSync` cmdlets need the ADSyncAdmins
  role a UAC-filtered token drops):

  ```powershell
  Get-ADSyncConnector | Select Name,Type      # now shows 2
  Start-ADSyncSyncCycle -PolicyType Initial    # export to Entra
  Get-ADSyncScheduler                          # SyncCycleInProgress / last result
  ```

  Wait a few minutes, then re-run `Verify-EntraSync.ps1 -Cloud`: the 5 flip to
  `OnPremisesSyncEnabled=True` (soft-match) and the 3 new users appear.

**`Get-MgUser` "not recognized" during the cloud verify.** This box's
`PSModulePath` omits the user module dir (`Documents\WindowsPowerShell\Modules`),
so the installed Graph cmdlets aren't auto-discovered. `Verify-EntraSync.ps1` now
prepends that path and imports `Microsoft.Graph.Authentication` +
`Microsoft.Graph.Users` itself, so this is handled — but note it if running Graph
cmdlets ad hoc.

## Scripts (maintained)

All operational scripts live in the repo at
[`stfn-setup/entra-connect/`](../../stfn-setup/entra-connect/) — the **source of
truth**, not the loose copies under `C:\Users\stfnadmin\`:

- **`Phase1-PrepUsers.ps1`** — account normalization (preview-by-default, `-Apply`
  to write; keyed on immutable ObjectGUID). One-time — once Connect is installed,
  sync is automatic (~30 min) and it's never re-run.
- **`Set-TlsStrongCrypto.ps1`** — the Phase 2 TLS 1.2 prereq.
- **`Verify-EntraSync.ps1`** — post-sync verification (`-Cloud` for the Graph check).
- **`Get-TenantInventory.ps1`** — the Graph domain/user dump used in discovery.

See [`stfn-setup/entra-connect/README.md`](../../stfn-setup/entra-connect/README.md).

## Related

- [`entra-id.md`](entra-id.md) — Entra ID overview, the break-glass admin, SSO,
  device/server access
- [`../architecture-decisions.md`](../architecture-decisions.md) — **ADR-16**
  (this decision), ADR-1 (Entra as IdP), ADR-15 (app member provisioning)
- [`../features/member-provisioning.md`](../features/member-provisioning.md) —
  the app's cloud user-creation flow (ADR-15)
- [`pricing.md`](pricing.md) — M365 licensing (the Intune/Business Premium note)
