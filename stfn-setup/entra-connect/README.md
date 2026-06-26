# Entra Connect — operational scripts (STFN.local → skintyee.ca)

Maintained scripts for the on-prem ↔ cloud hybrid identity work. The **design,
decision, and phased runbook** live in
[`docs/365/entra-connect.md`](../../docs/365/entra-connect.md) (ADR-16); this
folder holds the **scripts those phases run**. Run them **on `STFN-DC`**.

> Most of these write to AD / the registry and need an **elevated** PowerShell.
> The Claude tooling runs non-elevated (UAC-filtered token), so these are run by a
> human admin — see [`docs/365/entra-connect.md` Phase notes](../../docs/365/entra-connect.md).

## Scripts

| Script | Phase | What it does | Run as |
|---|---|---|---|
| [`Get-TenantInventory.ps1`](Get-TenantInventory.ps1) | 0 (discovery) | Device-code sign-in to Graph; dumps tenant **domains + all users** (to map on-prem ↔ cloud). Used to plan the soft-match. | any |
| [`Phase1-PrepUsers.ps1`](Phase1-PrepUsers.ps1) | 1 ✅ done | Adds the `skintyee.ca` UPN suffix, creates `OU=SkinTyee Users`, and normalizes the 8 scoped users (UPN + sAMAccountName → `first.last`, `mail`, primary `SMTP:` proxy) so the 5 existing cloud accounts **soft-match** instead of duplicating. **Preview by default; `-Apply` to write.** Keyed on immutable ObjectGUID. | **elevated** |
| [`Set-TlsStrongCrypto.ps1`](Set-TlsStrongCrypto.ps1) | 2 prereq | Sets the .NET TLS 1.2 strong-crypto registry keys Entra Connect v2 requires. **Preview by default; `-Apply` to write.** New shell/reboot after. | **elevated** |
| [`Verify-EntraSync.ps1`](Verify-EntraSync.ps1) | 2 verify | After the first sync: checks the ADSync service + scheduler; `-Cloud` also queries Graph to confirm the 8 users synced with **no duplicates**. | on DC (`-Cloud` prompts sign-in) |
| [`ConfigureSCP.ps1`](ConfigureSCP.ps1) | 3 (Hybrid Join) | Microsoft's official script — writes the **Service Connection Point** (`azureADId`/`azureADName` keywords) into the forest Configuration partition: the "Part A" SCP step of Hybrid Entra Join. **Use this instead of the Entra Connect wizard**, which crashes on `STFN-DC` (the credential dialog loads N-central's `MSPACredentialProvider` DLL → faults `0xc0000005` → kills `AzureADConnect.exe`). Runs in-process, so no credential dialog / third-party provider loads. `-Domain skintyeenation.onmicrosoft.com`. Idempotent. | **elevated** (Enterprise Admin) |
| [`Verify-HybridJoin.ps1`](Verify-HybridJoin.ps1) | 3 verify | Read-only Graph dump of every Entra device + its `trustType`/OS, with the **Hybrid (`ServerAd`) count**. `-Pilot <name>` → PASS/FAIL on one pilot PC flipping `Workplace`→`ServerAd`; `-Baseline <n>` → PASS if the count grew past `n`. Runs anywhere (incl. the Mac — cloud only). The pass/fail half of the Hybrid Join rollout. | any (`Device.Read.All`) |
| [`Phase3-PrepComputerOU.ps1`](Phase3-PrepComputerOU.ps1) | 3 prereq | Creates `OU=SkinTyee Computers` and moves the live machines (`XYNTAX-FMS2`, `ITG-LOANERPC`) out of `CN=Computers` so they can be GPO-targeted and added to the sync scope for Hybrid Entra Join. **Preview by default; `-Apply` to write.** | **elevated** |
| [`Phase3-MarkStaleComputers.ps1`](Phase3-MarkStaleComputers.ps1) | 3 prereq | Marks the 9 stale 2024 computer objects **stale + disabled but keeps them** (audit trail; not deleted). Sets a `STALE retained ...` Description and disables each. **Preview by default; `-Apply` to write.** | **elevated** |
| [`Enable-PasswordWritebackPermissions.ps1`](Enable-PasswordWritebackPermissions.ps1) | SSPR | Grants the `MSOL_*` connector account *Reset/Change Password* + write `lockoutTime`/`pwdLastSet` on descendant user objects of `OU=SkinTyee Users` — the AD-permissions piece of SSPR password writeback. **Preview by default; `-Apply` to write.** Then run `Set-ADSyncAADPasswordResetConfiguration -Connector "skintyeenation.onmicrosoft.com - AAD" -Enable $true` (the `-Connector` is mandatory). See [`../../docs/365/password-reset-sspr.md`](../../docs/365/password-reset-sspr.md). | **elevated** |
| [`Verify-PasswordWriteback.ps1`](Verify-PasswordWriteback.ps1) | SSPR verify | Read-only: queries Graph `onPremisesSynchronization` for `passwordWritebackEnabled` (WAM token, silent on the DC). **Note: this cloud flag proved unreliable — stayed False with writeback fully on.** Use `Test-PasswordWriteback.ps1` for the real proof. | on DC |
| [`Test-PasswordWriteback.ps1`](Test-PasswordWriteback.ps1) | SSPR proof | **End-to-end:** sets a synced user's password in the cloud via Graph (same `passwordProfile` PATCH as the app's rotate), then polls `STFN.local` to confirm the new password authenticates on-prem (= writeback landed). **Run interactively** (Graph write scope needs a consent click). **Changes a real password.** | on DC, interactive |

## Phase 2 — install order (summary)

1. `.\Set-TlsStrongCrypto.ps1 -Apply` (elevated) → open a **new** elevated shell.
2. Run the installer: `C:\Users\stfnadmin\Downloads\AzureADConnect.msi` →
   **Customize** → **Password Hash Sync** → connect Entra (Hybrid Identity Admin)
   + AD: on *Connect your directories* pick **"Create new AD account"** and give
   Enterprise Admin `STFN\stfnadmin` (**not** "use existing AD account" — that
   rejects admin accounts) → **filter to `OU=SkinTyee Users`** → finish (start sync).
3. `.\Verify-EntraSync.ps1 -Cloud` → expect all 8 `OnPremisesSyncEnabled=True`, no dupes.

Full screen-by-screen choices + the matching table are in
[`docs/365/entra-connect.md`](../../docs/365/entra-connect.md).

## Maintenance note

These are the **source of truth** — edit them here, not the loose copies under
`C:\Users\stfnadmin\`. Phase 1 has already been applied to `STFN.local`
(2026-06-18); re-running `Phase1-PrepUsers.ps1 -Apply` is harmless (it re-sets the
same values; OU moves are conditional).

## Hybrid Entra Join — applied state (2026-06-26)

Phase 3 Hybrid Join is **live and pilot-verified**:
- SCP written via `ConfigureSCP.ps1 -Domain skintyeenation.onmicrosoft.com`
  (the Entra Connect wizard crashes on STFN-DC — N-central's
  `MSPACredentialProvider` faults `0xc0000005` in the Windows credential dialog;
  the script bypasses it). Keywords: `azureADId:ee46daed-...`,
  `azureADName:skintyeenation.onmicrosoft.com`.
- `OU=SkinTyee Computers` added to the Entra Connect AD-connector sync scope
  (alongside `OU=SkinTyee Users`).
- Live machines moved into that OU via `Phase3-PrepComputerOU.ps1 -Apply`
  (`LUCAS-2022LT01`, `STFN2019-LT01`; `ITG-LOANERPC` + `STFN2024-LT05` already
  there). Disabled stale 2024 objects intentionally left in `CN=Computers`.
- **Pilot `LUCAS-2022LT01` confirmed Hybrid joined**: `dsregcmd /status` shows
  `DomainJoined: YES` + `AzureAdJoined: YES` (`EnterpriseJoined: NO` is correct —
  no AD FS, managed Entra ID).

Remaining: Part D rollout is automatic — every other domain PC auto-registers on
its next user sign-in. Track with `Verify-HybridJoin.ps1` over the following days.
