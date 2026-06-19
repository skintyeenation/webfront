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
| [`Phase3-PrepComputerOU.ps1`](Phase3-PrepComputerOU.ps1) | 3 prereq | Creates `OU=SkinTyee Computers` and moves the live machines (`XYNTAX-FMS2`, `ITG-LOANERPC`) out of `CN=Computers` so they can be GPO-targeted and added to the sync scope for Hybrid Entra Join. **Preview by default; `-Apply` to write.** | **elevated** |
| [`Phase3-RemoveStaleComputers.ps1`](Phase3-RemoveStaleComputers.ps1) | 3 prereq | Cleans up the 9 stale 2024 computer objects. **Preview by default; `-Apply` disables, `-Apply -Delete` removes.** | **elevated** |

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
