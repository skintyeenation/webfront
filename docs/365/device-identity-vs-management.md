# Device identity vs. management vs. compliance (Entra)

Three **independent** things often get conflated when reading the Entra device
list (and the app's **Assets → Devices** screen). A device's *join type* does
**not** imply it's *managed*, and *managed* does not imply *compliant*.

| Concept | Graph field(s) | Question it answers |
|---|---|---|
| **Identity / join** | `trustType` | *How does the device authenticate to Entra?* |
| **Management** | `isManaged`, `managementType`, `mdmAppId` | *Is an MDM (Intune) enrolled and managing it?* |
| **Compliance** | `isCompliant` | *Did an Intune compliance policy pass?* |

## Does "Hybrid joined" mean "Intune managed"? — No.

**Hybrid Entra Join is an identity state, not a management state.** A
Hybrid-joined PC is an on-prem AD computer that's *also* registered in Entra
(synced by Entra Connect). That gets you SSO and Conditional Access eligibility —
it does **not** enroll the device in Intune.

`trustType` values (Graph names them oddly):

| `trustType` | Meaning | Skin Tyee |
|---|---|---|
| `Workplace` | Entra-**registered** only ("Workplace Join") | the pre-Hybrid state we're migrating off |
| `ServerAd` | **Hybrid** Entra joined (domain-joined **and** Entra-registered) | ✅ the goal for fleet PCs |
| `AzureAd` | Cloud-only Entra joined | new BYOD / Entra-joined PCs |

A device can be **any** combination of join × management:

- **Hybrid joined, not Intune-managed** — the expected state for Skin Tyee
  (Group-Policy managed on `STFN-DC`, **no Intune** per
  [`entra-connect.md`](entra-connect.md) and ADR-16).
- **Hybrid joined + Intune-managed** — only if MDM **auto-enrollment** is on
  (GPO *Enable automatic MDM enrollment*) or SCCM co-management.
- **Entra joined + Intune-managed**, etc.

## Compliance is a tri-state — and `null` is not red

Graph's `isCompliant` is **three** values, not two:

| `isCompliant` | Meaning | App shows |
|---|---|---|
| `true` | An Intune policy evaluated the device and it **passed** | 🟢 Compliant |
| `false` | An Intune policy evaluated it and it **failed** | 🔴 Non-compliant *(only when `isManaged` too)* |
| `null` | **No Intune policy evaluated this device** | 🟠 No Intune policy |

The app paints **red only for a genuine Intune failure** (`isManaged === true &&
isCompliant === false`). A `null` ("not evaluated") reads as amber **"No Intune
policy"** — even when `isManaged` is true — because a device can be MDM-enrolled
yet have **no compliance policy assigned**, which is not a failure.

> ⚠️ **API note:** `api/src/graph-feed.service.ts` must **preserve Graph's
> `null`** — collapsing `null → false` would mis-paint every unevaluated machine
> as red. See `mapDeviceBase` and `app/src/components/pages/device-os.ts`
> (`complianceState`).

## Duplicate device registrations (the `Lucas-2022LT01` case)

One physical machine can own **more than one Entra device object**. The classic
case: a laptop that was Entra-**registered** (`Workplace`) and later
**Hybrid-joined**. Hybrid Entra Join **never converts the old object in place** —
it creates a **brand-new** object for the Hybrid join and leaves the old
`Workplace` one behind as a **stale duplicate**.

Worked example — `Lucas-2022LT01` returned twice from `/v1/devices`:

| object id | trustType | `isManaged` | last sign-in | users |
|---|---|---|---|---|
| `6be7c0d5…` | **Hybrid** (ServerAd) | true | Jun 26 *(newest)* | 0 |
| `af05d76a…` | **Workplace** | false | Jun 24 | 1 |

The Jun 26 Hybrid object is the new authoritative identity; the Jun 24 Workplace
object is residue to clean up. (Note the registered **user** lives on the old
Workplace object — so you merge, you don't just drop one.)

### How the app/API consolidate

`listDevices()` / `getDevice()` in `api/src/graph-feed.service.ts` group raw Graph
objects **by computer name** into one logical device:

- **Strongest join type wins** (Hybrid > AzureAd > Workplace).
- **Most-recent sign-in** is canonical (id, OS version).
- **Registered users are unioned** (owner beats user).
- `enabled`/`isManaged` = OR; compliance keeps the tri-state (a real `true`
  wins, then a real `false`, else `null`); `registrationDateTime` = earliest.
- The merged record carries `registrationCount` and a per-object
  `registrations[]` breakdown (each flagged `isPrimary`), surfaced on the
  **Devices** list (a `⧉ N registrations` badge) and broken out in
  **Device detail** ("ENTRA REGISTRATIONS" — *Current* vs *Stale*).

So the screen shows **one computer = one row**, while still tracking the stale
artifacts so an admin can delete them.

## How to verify (PowerShell + Graph)

[`stfn-setup/entra-connect/Verify-HybridJoin.ps1`](../../stfn-setup/entra-connect/Verify-HybridJoin.ps1)
reports, per device, the join type **and** management/compliance, and lists any
**duplicate registrations**:

```powershell
.\Verify-HybridJoin.ps1                        # full inventory: trust + managed + compliance + duplicates
.\Verify-HybridJoin.ps1 -Pilot Lucas-2022LT01  # PASS/FAIL on the pilot flipping to Hybrid
```

Reading the management columns for a hybrid machine showing `isManaged=true`:

- `managementType` **null** / `mdmAppId` **null** → not really Intune-managed;
  the `isManaged=true` is noise → amber "No Intune policy" is correct.
- `managementType = mdm` with an `mdmAppId` → it **is** Intune-enrolled
  (auto-enrollment is on), just with no policy assigned. Either assign a baseline
  compliance policy, or **turn auto-enrollment off** if you're deliberately not
  running Intune (ADR-16).

To delete a confirmed stale object (destructive — confirm first it's the
non-primary `Workplace` one):

```powershell
Remove-MgDevice -DeviceId <objectId>
```

## See also

- [`entra-connect.md`](entra-connect.md) — hybrid identity setup, the Intune /
  licensing decision (ADR-16), the three device tiers, the Phase 3 runbook.
- [`hybrid-entra-join-plan.md`](hybrid-entra-join-plan.md) — pilot-first rollout.
- `app/STUBS.md` — how the Devices screen sources this (Graph `/devices`).
