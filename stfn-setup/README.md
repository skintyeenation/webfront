# STFN Workstation Setup — Session Summary (2026-05-24)

Covers Microsoft Entra tooling plus baseline workstation setup (`~/.local/bin`, `cc` alias, Claude Code), and Docker (`setup-docker-wsl.ps1`).

## Environment
- Machine: Windows 10 Pro, PowerShell 5.1, domain-joined
- User: stfnadmin
- Companion script: `setup-stfn-tools.ps1` (in this folder) — idempotent, re-runnable

## Order of operations (matches the script)
1. `~/.local/bin` directory + on user PATH
2. PowerShell `$PROFILE` + `cc` alias
3. Claude Code CLI (verify / install)
4. Module-install prereqs (TLS 1.2, NuGet, PSGallery trust)
5. Microsoft.Graph submodules (Entra subset)
6. Microsoft.Entra module
7. Entra Connect MSI download

## 1. PATH / env
- Directory created: `C:\Users\stfnadmin\.local\bin`
- Added to **user** PATH (persistent, via `[Environment]::SetEnvironmentVariable(..., 'User')`)
- Current shell PATH also updated in-place so the change is immediately visible

## 2. PowerShell profile + `cc` alias
- Profile: `C:\Users\stfnadmin\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1`
- Line added:
  ```powershell
  function cc { & claude --dangerously-skip-permissions @args }
  ```
- **Warning:** `--dangerously-skip-permissions` bypasses *all* Claude Code tool-permission prompts. Anything `cc` runs has unrestricted local access. Use deliberately.

## 3. Claude Code CLI
- Installed at: `C:\Users\stfnadmin\.local\bin\claude.exe` (native Anthropic installer, not npm)
- Script behavior: detects existing install and skips; if missing, runs the official Windows installer (`irm https://claude.ai/install.ps1 | iex`)

## 4. Module-install prereqs
- TLS 1.2 enabled for the session
- NuGet package provider installed (CurrentUser)
- PSGallery installation policy: Trusted

## 5. Microsoft.Graph submodules (Entra subset)
Installing the full `Microsoft.Graph` meta-module pulls ~40 submodules and can hang silently for 5–10 minutes on PS 5.1. The script installs only the Entra-relevant subset, with `-Verbose` and a per-submodule stopwatch for live feedback:

- `Microsoft.Graph.Authentication`
- `Microsoft.Graph.Users`
- `Microsoft.Graph.Groups`
- `Microsoft.Graph.Identity.DirectoryManagement`
- `Microsoft.Graph.Identity.SignIns`

Currently installed: 2.37.0 (Authentication submodule confirmed).

## 6. Microsoft.Entra module
- `Microsoft.Entra` 1.3.0 — modern replacement for the deprecated `AzureAD` module
- Legacy modules intentionally skipped: `AzureAD`, `AzureADPreview`, `MSOnline` (deprecated/retired)

## 7. Entra Connect MSI
- File: `C:\Users\stfnadmin\Downloads\AzureADConnect.msi` (145.7 MB)
- Authenticode signature: Valid (CN=Microsoft Corporation)
- **Not installed on *this* machine** (this README documents the Win10 workstation). The MSI is **installed on `STFN-DC`** (Server 2022) — installing on the DC is supported and chosen for this size (ADR-16). See the maintained scripts + runbook below.

## Quick verification commands
```powershell
# Reload profile in current shell
. $PROFILE

# Claude alias
cc --version

# Graph
Connect-MgGraph -Scopes "User.Read.All","Directory.Read.All"
Get-MgUser -Top 5

# Entra
Connect-Entra -Scopes "User.Read.All"
```

## Next steps for Entra Connect Sync
1. Copy `AzureADConnect.msi` to a Windows Server 2016+ member server in the on-prem AD domain.
2. Sign in as local admin on that server and run the MSI.
3. Wizard prerequisites:
   - Entra ID **Global Administrator** credentials (cloud tenant)
   - On-prem AD **Enterprise Admin** credentials (domain: `(Get-CimInstance Win32_ComputerSystem).Domain`)
4. Choose:
   - **Express settings** — password hash sync (default, easiest)
   - **Customize** — pass-through auth, federation, OU filtering, etc.

## Docker (`setup-docker-wsl.ps1`)

**Docker Desktop is NOT supported on Windows Server (2019/2022).** On the STFN
Server 2022 box it refuses to start and reports *"Virtualization support not
detected"* — even though virtualization is fine. This is a Docker Desktop
limitation, not a wrong installer or an arm-vs-amd mistake (the box is **AMD64**,
an Intel Xeon E-2378G, running as a Hyper-V guest VM — use amd64 installers).

So we do **not** use Docker Desktop. `setup-docker-wsl.ps1` (idempotent,
self-elevating) sets up the supported engines:

- **Linux containers (default, recommended):** Docker **CE** (open-source, free)
  installed **inside a WSL2 Ubuntu distro** — runs the standard Linux images
  (~95% of Docker Hub). The script enables the `VirtualMachinePlatform` + WSL
  features, installs Ubuntu with `--no-launch`, then provisions Docker CE inside
  it (systemd enabled, a non-root `stfn` user in the `docker` group, `docker`
  service enabled).
  **⚠ Requires nested virtualization** exposed to this guest VM. On **STFN-DC
  this is currently NOT the case** — WSL2 cannot boot a VM and fails with
  `HCS_E_HYPERV_NOT_INSTALLED` (even though the WSL features show *Enabled*). The
  script's boot test detects this and stops with the host-side fix. To unblock,
  on the **Hyper-V host** with the VM stopped:
  ```powershell
  Set-VMProcessor -VMName STFN-DC -ExposeVirtualizationExtensions $true
  Get-VMNetworkAdapter -VMName STFN-DC | Set-VMNetworkAdapter -MacAddressSpoofing On
  ```
  then restart the VM and re-run the script. **Note:** STFN-DC is a Domain
  Controller — running containers on a DC is poor practice; prefer a separate
  member/Linux VM for Docker.
- **Windows containers (`-WindowsContainers`, opt-in):** native Docker **Engine**
  via `DockerMsftProvider`. Runs Windows base images only — only needed if you
  specifically require Windows containers.

**Performance / reliability — keep code on the Linux filesystem.** Bind-mounting
Windows files into containers over `/mnt/c` uses WSL2's 9P layer: I/O is **5–20×
slower** and `inotify` file-watchers don't fire (broken HMR/hot-reload, missed
rebuilds). Clone the repo **inside** Ubuntu (e.g. `~/webfront` on ext4) for
native-speed I/O; edit it from Windows via `\\wsl$\Ubuntu\...` or an IDE's
WSL-remote mode (IntelliJ / VS Code).

Run standalone, or via the provisioner (step 4):

```powershell
# standalone (Linux containers only)
powershell -ExecutionPolicy Bypass -File .\setup-docker-wsl.ps1

# also native Windows-container engine
.\setup-docker-wsl.ps1 -WindowsContainers

# via the full provisioner
.\provision-stfn-server.ps1                       # includes Docker
.\provision-stfn-server.ps1 -SkipDocker           # skip it
.\provision-stfn-server.ps1 -DockerWindowsContainers
```

Use it: `wsl -d Ubuntu -- docker run hello-world`.

## App deployment to domain PCs (`deploy-office-gpo.ps1`)

Deploys a standard app set to domain workstations, **machine-wide (all users of
the PC)**, via a **Group Policy computer Startup script**. Idempotent +
self-elevating; run on the DC.

**Two scripts:** `deploy-office-gpo.ps1` is what *you* run on the DC — it stages
the payload, creates/wires the GPO, and **generates `Install-Apps.ps1`**, the
actual per-PC installer. `Install-Apps.ps1` is what runs **on each target PC as
SYSTEM** (from the GPO's startup-script slot, or manually from NETLOGON); it does
the real Office/Teams/Chrome installs + desktop shortcuts and is fully
self-contained + idempotent. You normally never edit `Install-Apps.ps1` directly —
change `deploy-office-gpo.ps1` and re-run it to regenerate the deployed copies.

**Why a startup script and not GPO Software Installation?** Microsoft 365 Apps is
**Click-to-Run, not an MSI**, so the usual GPO *Software Installation* (MSI-only)
can't deploy it. The supported pattern is a computer **Startup script** that runs
the Office Deployment Tool (`setup.exe /configure`) as SYSTEM at boot — a
machine-wide install before any user logs on.

**What it installs** (only what's missing; each app detected independently):

| App | Mechanism |
|---|---|
| Word, Excel, PowerPoint, Outlook | Office Deployment Tool (`setup.exe /configure configuration.xml`) |
| new Microsoft **Teams** | Teams bootstrapper (`teamsbootstrapper.exe -p`) |
| **Planner** | *not installable* — lives inside Teams + at `planner.cloud.microsoft` |
| Google **Chrome** | enterprise MSI (`msiexec /qn`) |
| Desktop shortcuts | `.lnk` files on the **Public Desktop** for each installed app |

The payload (setup.exe + configuration.xml + `teamsbootstrapper.exe` + Chrome MSI
+ `Install-Apps.ps1`) is staged in `\\<domain>\NETLOGON\OfficeDeploy`. Each PC's
install log is `C:\Windows\Temp\office-deploy.log`. Office/Teams **stream from the
Microsoft CDN**, so targets need outbound internet (use `-PreDownload` to cache an
offline Office source — note that puts more in SYSVOL).

**Targeting — `-TargetComputers` (one or many machines):** the GPO links at the
**domain root** (so it has scope over every computer, *including* the default
`CN=Computers` container) and is **security-filtered** so it *applies* to only the
named machines — `Authenticated Users` is dropped to read-only (still satisfies
MS16-072 so clients can read the GPO) and Apply is granted to just those computer
accounts. **No computers are moved.** `-TargetOU` is the alternative for
whole-OU targeting.

**Forcing without a reboot — `-InvokeNow`:** startup scripts only run at boot, so
`-InvokeNow` instead triggers `Install-Apps.ps1` on each target *as SYSTEM* via a
transient scheduled task over **WinRM** (SYSTEM/the computer account can read
NETLOGON, dodging the Kerberos double-hop). Targets that are offline or have WinRM
blocked are skipped — they install at next boot anyway. (Note: a locked-down
Windows 11 firewall that blocks WinRM/SMB/DCOM can't be pushed to remotely; reboot
the box or run `Install-Apps.ps1` locally on it instead.)

```powershell
# one machine
.\deploy-office-gpo.ps1 -TargetComputers XYNTAX-FMS2

# several machines, and force the install now (no reboot)
.\deploy-office-gpo.ps1 -TargetComputers LT01,LT02,LT03 -InvokeNow

# stage payload + create the GPO unlinked (safe dry run)
.\deploy-office-gpo.ps1

# whole-OU targeting instead of per-machine
.\deploy-office-gpo.ps1 -TargetOU 'OU=SkinTyee Computers,DC=STFN,DC=local'

# run the install manually on a target (e.g. firewall blocks remoting), elevated:
powershell -ExecutionPolicy Bypass -File "\\STFN.local\NETLOGON\OfficeDeploy\Install-Apps.ps1"
```

**Currently live:** GPO `Deploy M365 Apps`, linked at the domain root,
security-filtered to **XYNTAX-FMS2** only. Add machines by re-running with more
`-TargetComputers`; remove one by clearing its Apply permission in the GPO's
security filtering.

## Rollback
- Modules: `Uninstall-Module Microsoft.Graph.* -AllVersions; Uninstall-Module Microsoft.Entra -AllVersions`
- MSI: delete `C:\Users\stfnadmin\Downloads\AzureADConnect.msi`
- PSGallery trust: `Set-PSRepository -Name PSGallery -InstallationPolicy Untrusted`
- `cc` alias: remove the `function cc { ... }` line from `$PROFILE`
- `~/.local/bin` on PATH: remove via `[Environment]::SetEnvironmentVariable('Path', <new value>, 'User')` after stripping the entry
- Claude Code: uninstall via whatever mechanism the native installer registered (or just delete `C:\Users\stfnadmin\.local\bin\claude.exe`)
- Docker (Linux): `wsl --unregister Ubuntu` removes the distro + its Docker CE. The `VirtualMachinePlatform`/WSL features can be left on (harmless) or removed via `Disable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform`.
- Docker (Windows containers): `Uninstall-Package docker -ProviderName DockerMsftProvider; Uninstall-Module DockerMsftProvider`
- App deployment GPO: unlink/remove the GPO — `Remove-GPLink -Name 'Deploy M365 Apps' -Target 'DC=STFN,DC=local'` then `Remove-GPO -Name 'Deploy M365 Apps'`; optionally delete the payload `\\STFN.local\NETLOGON\OfficeDeploy`. (Removing the GPO does not uninstall apps already deployed.)
