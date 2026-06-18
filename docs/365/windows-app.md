# Remote access with Windows App (Entra sign-in)

How a Skin Tyee staff member or admin signs in with their **Entra ID account**
(`firstname.lastname@skintyee.ca`, or `admin@skintyeenation.onmicrosoft.com`)
and gets to a Windows desktop or app using **Windows App** — Microsoft's unified
remote-access client (the successor to the old "Remote Desktop" / RDP clients).

Source: [Microsoft — What is Windows App?](https://learn.microsoft.com/en-us/windows-app/overview)

---

## Important: what Windows App is (and isn't)

Windows App is **a client, not a desktop**. It does **not** "log you into the
Entra domain" the way joining a PC to a domain does. It signs you in with your
Entra (work/school) account and then **connects you to a remote Windows resource**
that already exists. You must have one of those resources for there to be
anything to sign into:

| Backing resource | What it is | Do we have it? |
|---|---|---|
| **Windows 365 Cloud PC** | A per-user cloud PC, Entra-joined, persistent | ❌ not provisioned (needs licensing) |
| **Azure Virtual Desktop (AVD)** | Pooled/personal session hosts in Azure | ❌ not deployed |
| **Microsoft Dev Box** | Dev-focused cloud workstation | ❌ not deployed |
| **Remote Desktop Services (RDS)** | On-prem/Azure session-host farm | ❌ not deployed |
| **Remote PC** | RDP to a specific Windows machine | ⚠️ the onsite **Windows Server 2022** could be a target (see below) |

> **Sign-in account:** a Microsoft **work or school account** (= an Entra ID
> account). You **cannot** sign in with a personal Microsoft account (MSA).
> Skin Tyee's `@skintyee.ca` / `…onmicrosoft.com` accounts qualify.
>
> **Exception:** connecting to a **remote PC** (RDP) does *not* require signing
> in to Windows App at all — you authenticate to that PC directly.

---

## Where Windows App runs

Windows, macOS, iOS/iPadOS, Android/ChromeOS, **web browser**, and Meta Quest.
The browser client needs no install — open
**<https://windows.cloud.microsoft>** and sign in. Download links for the native
apps: <https://aka.ms/windowsapp> (or the per-platform pages off the Microsoft
Learn overview above).

---

## Realistic options for Skin Tyee

### Option A — Windows 365 Cloud PC (the clean "Entra → desktop" path) — *recommended if a cloud desktop is the goal*

This is the closest thing to "log into the Entra domain and get a Windows
desktop." The Cloud PC is Entra-joined, so the same `@skintyee.ca` identity that
opens Outlook opens the desktop, and offboarding (block sign-in in Entra) kills
desktop access with everything else.

1. **License:** assign a **Windows 365** license to the user (Microsoft 365 admin
   center → Billing → Purchase services → Windows 365; then Licenses → assign).
   Cloud PCs are billed **per user / month** — see [`pricing.md`](./pricing.md) /
   [`../hosting-costs.md`](../hosting-costs.md) before committing (cost matters for
   an NGO).
2. **Provision:** Microsoft Intune admin center → **Devices → Windows 365** →
   Provisioning policies → create a policy (Entra-join, region Canada Central to
   match the rest of our infra, gallery image). The Cloud PC provisions in
   ~20–40 min.
3. **Connect:** user opens Windows App (or <https://windows.cloud.microsoft>) →
   signs in with `firstname.lastname@skintyee.ca` (+ MFA) → the Cloud PC appears
   on the home screen → click to launch.

### Option B — RDP to the onsite Windows Server 2022 (no extra license)

We already run an **onsite Windows Server 2022** (it hosts the M365 email-backup
job — see [`entra-usage.md`](./entra-usage.md)). Windows App can connect to it as
a **remote PC**:

1. **Reachability:** the server's RDP (TCP 3389) must be reachable from the
   client — ideally **not** exposed to the internet directly. Use a VPN, an
   **RD Gateway**, or Azure Bastion-style fronting. (Raw 3389 on a public IP is a
   ransomware magnet — don't.)
2. **Identity:** Entra-based sign-in to the server requires it to be
   **Entra-joined or hybrid-joined**. If it's only a standalone/AD server, you'll
   authenticate with its **local / AD admin credentials** (stored in 1Password),
   not your Entra account.
3. **Connect:** Windows App → add a **PC** → enter the host (or gateway) → save
   credentials. On Windows itself, remote-PC support in Windows App is still in
   preview; the built-in **Remote Desktop Connection (MSTSC)** also works.

### Option C — Azure Virtual Desktop

More moving parts (host pools, session hosts, FSLogix profiles). For a 2–3 admin
NGO this is almost certainly overkill versus Option A. Documented here only so the
trade-off is on record.

---

## Recommendation

- **Just need to reach the onsite server occasionally** → Option B over a VPN /
  RD Gateway. No new licensing.
- **Want staff to have a real, managed Windows desktop tied to their Entra
  identity** → Option A (Windows 365), pending a cost decision.
- Either way, **Windows App is the single client** across macOS/iOS/Android/web,
  so staff on any device use the same tool.

## See also

- [Microsoft — Windows App overview](https://learn.microsoft.com/en-us/windows-app/overview)
- [`entra-usage.md`](./entra-usage.md) — what we use Entra for (SSO inventory)
- [`entra-status.md`](./entra-status.md) — current realized Entra state
- [`entra-id.md`](./entra-id.md) — the tenant + admin account
