# Server provisioning — one-shot Skin Tyee server baseline

One-shot, **idempotent** provisioning of a freshly-built Skin Tyee Windows
Server. Run it once on a new box (including a domain controller) and it comes up
with the full Skin Tyee software baseline — dev tooling, 1Password, Microsoft
365 Apps, and the Entra Connect sync tool. Re-running is safe: every step checks
current state before acting.

Script: [`stfn-setup/provision-stfn-server.ps1`](../../stfn-setup/provision-stfn-server.ps1).

> **Two scripts, one entry point.** `provision-stfn-server.ps1` is the
> machine-wide server installer. It **delegates the per-user dev tooling** to
> its sibling
> [`stfn-setup/setup-stfn-tools.ps1`](../../stfn-setup/setup-stfn-tools.ps1)
> (step 1 below), so you only ever run the one provisioning script.

## Prerequisites

- A **freshly-provisioned Windows Server** (the script reads the OS product type
  to decide what's safe — workstation / member server / domain controller).
- **Local administrator** rights. Machine-wide installs require elevation; the
  script **self-elevates via UAC** if it isn't already running as admin (approve
  the prompt). Launch from an elevated PowerShell to skip the prompt.
- **Internet access** — installers are downloaded from Microsoft, 1Password, and
  Anthropic and cached under `C:\STFN-Provision`.
- **(Entra Connect only)** an **Entra Global Admin** account plus an **on-prem
  Enterprise Admin** account — the sync-configuration wizard is interactive and
  asks for both. See [`../365/entra-id.md`](../365/entra-id.md).

## Run it

```powershell
# Default: dev tools + 1Password + M365 Apps + stage (download only) Entra Connect
powershell -ExecutionPolicy Bypass -File .\provision-stfn-server.ps1
```

```powershell
# Member server that should also install + launch the Entra Connect wizard,
# and is a multi-user RDS session host:
.\provision-stfn-server.ps1 -InstallEntraConnect -RdsHost
```

A transcript is written to `C:\STFN-Provision\provision-log.txt` (or
`<CacheDir>\provision-log.txt`). When it finishes, **reopen PowerShell** so PATH
changes take effect in new shells.

## What gets installed

Each step is skippable and is a no-op if the software is already present.

### 1. Workstation / dev tooling

Delegated to [`stfn-setup/setup-stfn-tools.ps1`](../../stfn-setup/setup-stfn-tools.ps1)
(skip with `-SkipDevTools`). That script, run as the current user, sets up — in
order — :

1. **`~/.local/bin`** directory, added to the **user PATH** (persistent).
2. A **`cc` function** in your PowerShell `$PROFILE`
   (`claude --dangerously-skip-permissions`).
3. The **Claude Code CLI** (`claude`) via the official Anthropic Windows
   installer (drops `claude.exe` into `~/.local/bin`).
4. **Module-install prerequisites** — TLS 1.2, the **NuGet** package provider,
   and trusting the **PSGallery** repository.
5. The **Entra-relevant subset of Microsoft.Graph** submodules
   (`Authentication`, `Users`, `Groups`, `Identity.DirectoryManagement`,
   `Identity.SignIns`) — installed per-submodule (the full meta-module pulls ~40
   submodules and can hang for minutes on PowerShell 5.1).
6. The **Microsoft.Entra** module.
7. The **Entra Connect (AzureADConnect.msi)** download, cached to the user's
   `Downloads` folder.
8. The **Azure CLI** (`az`) via Microsoft's MSI, silent.

### 2. 1Password

Machine-wide MSI (all users), installed silently
(`https://downloads.1password.com/win/1PasswordSetup-latest.msi`,
signature-verified, `msiexec /qn /norestart`). Skip with `-Skip1Password`.

### 3. Microsoft 365 Apps

Microsoft 365 has **no MSI** — Click-to-Run via the **Office Deployment Tool** is
the supported method. The script downloads the always-latest setup engine,
writes a `configuration.xml`, and installs silently, all-users, 64-bit. Skip with
`-SkipM365`.

- Default product **`O365BusinessRetail`** (Business Standard). For E3/E5
  enterprise licensing pass `-M365Product O365ProPlusRetail`.
- Default channel **`Current`** (override with `-M365Channel`).
- Pass **`-RdsHost`** on a multi-user RDS session host to add
  `SharedComputerLicensing=1` (required for shared / per-session activation).

> The install streams ~3.5 GB and can take 10-30 minutes.

### 4. Entra Connect (Azure AD Connect) sync tool

**DC-aware.** The MSI is **always downloaded/staged** (signature-verified) into
the cache, but installation is gated:

- **Default = stage only.** Re-run with `-InstallEntraConnect` to actually launch
  the installer.
- Installs **only on a domain-member Windows Server** — skipped on a
  non-Server SKU or a machine that isn't domain-joined.
- On a **domain controller** the script **refuses by default** — Microsoft
  recommends running Entra Connect on a member server, not a DC. Override with
  `-ForceEntraConnectOnDC`.

The sync-configuration step is an **interactive wizard** — have the Entra Global
Admin + on-prem Enterprise Admin credentials ready. Skip the whole step with
`-SkipEntraConnect`.

## Parameters

| Parameter | Type | Default | What it does |
|---|---|---|---|
| `-SkipDevTools` | switch | off | Skip invoking `setup-stfn-tools.ps1` (step 1). |
| `-Skip1Password` | switch | off | Skip the 1Password install. |
| `-SkipM365` | switch | off | Skip the Microsoft 365 Apps install. |
| `-SkipEntraConnect` | switch | off | Skip staging **and** installing Entra Connect entirely. |
| `-InstallEntraConnect` | switch | off (stage only) | Launch the Entra Connect installer. Default is download/stage the MSI only. |
| `-ForceEntraConnectOnDC` | switch | off | Permit installing Entra Connect on a domain controller (Microsoft advises against; requires this explicit override). |
| `-M365Product` | string | `O365BusinessRetail` | Office Deployment Tool product ID. Use `O365ProPlusRetail` for E3/E5. |
| `-M365Channel` | string | `Current` | M365 update channel (`Current`, `MonthlyEnterprise`, `SemiAnnual`, `SemiAnnualPreview`, `CurrentPreview`, `BetaChannel`). |
| `-RdsHost` | switch | off | Mark this as a multi-user RDS session host — adds `SharedComputerLicensing=1` to the M365 config. |
| `-CacheDir` | string | `C:\STFN-Provision` | Where installers are downloaded/cached and the transcript log is written. |

## Caveats

- **Needs elevation.** The script self-elevates via UAC; approve the prompt or
  start from an elevated shell.
- **Entra Connect sync config is interactive** and needs **Entra Global Admin +
  on-prem Enterprise Admin** credentials — it can't run unattended.
- **Match the product ID to the actual license tier.** Installing
  `O365BusinessRetail` on an E3/E5 tenant (or vice versa) leaves Office unable to
  activate. Pick `-M365Product` to match the M365 subscription
  (see [`../365/pricing.md`](../365/pricing.md)).
- **Running Office / 1Password / Entra Connect on a domain controller is
  atypical.** The DC guardrail on step 4 exists for a reason — Microsoft
  recommends Entra Connect on a **member server**, not a DC. Prefer a member
  server for the full baseline where you can.
- **Reopen PowerShell** after the run so PATH / profile changes (`~/.local/bin`,
  the `cc` alias) take effect in new shells.

## See also

- [`../365/entra-id.md`](../365/entra-id.md) — Entra ID, the admin account, Entra
  Connect (hybrid identity), and SSO + device/server access.
- [`../onboarding/1password.md`](../onboarding/1password.md) — 1Password end-user
  setup (after the machine-wide install this script does).
