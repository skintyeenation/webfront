# Hybrid Entra Join — operator steps (follow-along)

Turnkey, screen-by-screen instructions for the **on-prem person** who has console
or RDP access to `STFN-DC` / the Entra Connect sync server and to one pilot PC.
This is the hands-on companion to the strategy in
[`hybrid-entra-join-plan.md`](hybrid-entra-join-plan.md) (Phases 1, 3, 4); the
verification you run from the Mac afterward is
[`Verify-HybridJoin.ps1`](../../stfn-setup/entra-connect/Verify-HybridJoin.ps1).

> **Nothing here changes domain join, accounts, or how anyone logs in.** It only
> tells the domain PCs to *also* register in Entra. Fully reversible (see Rollback
> at the bottom). Total operator time ~30 min; the rest auto-rolls over days.

**You will need:**
- RDP/console on the **Entra Connect sync server** (it's on `STFN-DC`).
- The **`STFN\stfnadmin`** password (Enterprise Admin).
- One **pilot PC** you can sign out/in on (plan used `Lucas-2022LT01`).

---

## Part A — Turn on Hybrid Join in Entra Connect (sync server, ~10 min)

> **⚠ If the wizard crashes when you enter `STFN\stfnadmin` creds:** that's a known
> issue on `STFN-DC` — the Windows credential dialog loads N-central's
> `MSPACredentialProvider` DLL, which faults (`0xc0000005`) and kills
> `AzureADConnect.exe`. **Skip the wizard** and write the SCP directly with
> Microsoft's official script (does the exact same thing, in-process, no credential
> dialog), then jump to **Part B**:
> ```powershell
> # elevated PowerShell on STFN-DC, as Enterprise Admin:
> .\stfn-setup\entra-connect\ConfigureSCP.ps1 -Domain skintyeenation.onmicrosoft.com
> ```

1. Sign in to **`STFN-DC`** as `STFN\stfnadmin`.
2. Start menu → run **`Azure AD Connect`** (or `C:\Program Files\Microsoft Azure
   Active Directory Connect\AzureADConnect.exe`). Click **Configure** on the
   welcome screen.
3. Tasks list → choose **Configure device options** → **Next**.
4. **Overview** screen → **Next**.
5. **Connect to Azure AD** → sign in with the **Hybrid Identity Admin**
   (`admin@skintyeenation.onmicrosoft.com`). → **Next**.
6. Device options → select **Configure Hybrid Azure AD join** → **Next**.
7. **Device operating systems** → tick **Windows 10 or later domain-joined
   devices**. (Leave the "lower than Windows 10" box unticked — we have none.) →
   **Next**.
8. **SCP configuration** → in the forest list tick **`STFN.local`**.
   - **Authentication Service** dropdown → **Azure Active Directory**. *(We have no
     AD FS, so this is the managed option — do not pick AD FS.)*
   - Click **Add** next to the forest → a credentials box pops up → enter
     **`STFN\stfnadmin`** + password (this is the **Enterprise Admin** prompt that
     writes the SCP into AD). → **OK**. → **Next**.
9. **Ready to configure** → **Configure**. Wait for the green **Configuration
   complete**. → **Exit**.

That's it on the server. This wrote a **Service Connection Point (SCP)** into AD
telling domain PCs which tenant to register with. **No PC has changed yet.**

> Optional sanity check (PowerShell on the DC) — confirm the SCP is present:
> ```powershell
> $cfg = "CN=62a0ff2e-97b9-4513-943f-0d221bd30080,CN=Device Registration Configuration,CN=Services,CN=Configuration,DC=STFN,DC=local"
> (Get-ADObject $cfg -Properties keywords).keywords
> # expect two values: azureADId:<tenant guid> and azureADName:skintyeenation.onmicrosoft.com
> ```
> If the exact CN differs, just confirm Entra Connect reported success — that is
> enough to proceed.

---

## Part B — Pilot ONE PC (~15 min)

On the **pilot PC**, signed in as a normal domain user (an everyday account is
fine — no admin needed):

1. Open **Command Prompt** and capture the BEFORE state:
   ```cmd
   dsregcmd /status
   ```
   Look at the **Device State** block — expect **`DomainJoined : YES`** and
   **`AzureAdJoined : NO`**. (That "NO" is what we're about to flip.)
2. Pull the new policy, then **sign out and back in** (or reboot):
   ```cmd
   gpupdate /force
   ```
   Sign-in fires the built-in scheduled task
   **`\Microsoft\Windows\Workplace Join\Automatic-Device-Join`**, which does the
   registration. (To not wait for a real sign-in you can run it directly:
   `schtasks /run /tn "\Microsoft\Windows\Workplace Join\Automatic-Device-Join"`.)
3. Wait ~2–5 min, then capture the AFTER state:
   ```cmd
   dsregcmd /status
   ```
   **Success = `DomainJoined : YES` AND `AzureAdJoined : YES`.** That machine is
   now Hybrid Azure AD joined.

**If `AzureAdJoined` is still NO after a sign-in + a few minutes:**
- In `dsregcmd /status`, read the **Diagnostic Data** section — it names the
  failing step.
- Confirm the PC can reach the Phase-0 URLs on 443 (`login.microsoftonline.com`,
  `device.login.microsoftonline.com`, `enterpriseregistration.windows.net`,
  `autologon.microsoftazuread-sso.com`).
- Confirm the **computer object is in the Entra Connect sync scope** — its OU must
  be selected in Entra Connect (see
  [`entra-connect.md`](entra-connect.md) Phase 3 /
  `Phase3-PrepComputerOU.ps1`). If computers aren't syncing, add the OU and let a
  sync cycle run, then retry from B-2.

---

## Part C — Verify from the Mac (Lucas, ~1 min)

Once the operator says the pilot shows `AzureAdJoined : YES`, run the one-command
check (cloud Graph only — no on-prem reach needed):

```powershell
# baseline was 0 Hybrid devices; gate on the pilot flipping to ServerAd
./stfn-setup/entra-connect/Verify-HybridJoin.ps1 -Pilot Lucas-2022LT01
```

- **PASS** → the pilot is `trustType: ServerAd` (Hybrid). In the app's Devices
  page it now groups under the domain instead of "Workplace". Proceed to Part D.
- **FAIL** → the message says whether it's missing from Entra (sign-in/scope) or
  still `Workplace` (re-do B-2, wait, re-check).

(No args = just dump the device inventory + Hybrid count. `-Baseline 0` = PASS if
the ServerAd count grew past zero, for the broad rollout.)

---

## Part D — Roll out to the rest (automatic, over a few days)

Nothing per-PC is required. Every domain PC picks up the SCP via Group Policy and
**auto-registers on its next user sign-in** (same scheduled task). Just confirm
**all computer OUs are in the Entra Connect sync scope**. Watch the list fill in:

```powershell
./stfn-setup/entra-connect/Verify-HybridJoin.ps1
```

Re-run over a few days; the Yellow "Workplace" rows turn Green "ServerAd" as
machines sign in.

---

## Rollback (if anything misbehaves)

1. **Sync server:** `Azure AD Connect` → Configure → **Configure device options**
   → **uncheck** Configure Hybrid Azure AD join → finish. (Removes the SCP.)
2. **A single PC:** `dsregcmd /leave` — leaves Entra, **stays domain-joined**. No
   impact on AD, accounts, or login.
