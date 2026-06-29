# Storing PAW/DCI submissions digitally — compliance notes

**Question:** Are we allowed to store completed PAW applications (and DCI reports) in
digital form?

**Short answer:** Yes. Digital storage of funding records is permitted and is standard
practice for First Nations administering ISC funding, **provided** there are appropriate
safeguards (access control, encryption, Canadian data residency) and a defined retention
rule. This is not legal advice — confirm the specifics against the funding agreement and the
band's own privacy/records policy (see _To confirm_ below).

## What governs PAWs/DCIs

- PAW forms collect **personal information** and carry a **Privacy Statement** citing the
  **Privacy Act**, the **Department of Indigenous Services Act** (S.C. 2019, c. 29, s. 336),
  and the **Financial Administration Act**. That statement governs **ISC's** collection of
  the data — it does **not** prohibit the Nation from holding its own copies digitally.
- ISC **accepts digital submissions**, and funding agreements typically **require recipients
  to retain records** (commonly ~7 years) for audit. Electronic records satisfy that.
- A First Nation's handling of its members' personal information falls under the **Nation's
  own governance / privacy policy**. PIPEDA generally applies to *commercial* activity, so it
  usually does not bind a Nation's governance records — but a band policy should cover it.

## Required safeguards — and how this build aligns

| Obligation | Status in the funding submission portal |
|---|---|
| **Access control** — limit to authorized staff | ✅ Submissions gated to the `isc-programs-and-funding-docs` group; whole site behind Microsoft Entra sign-in (pre-launch access gate). |
| **Encryption** at rest + in transit | ✅ Azure Blob (`skintyeeproddocs`) and SharePoint encrypt at rest; all transfer over HTTPS (storage account is HTTPS-only). |
| **Canadian data residency** | ✅ Verified 2026-06: `skintyeeproddocs` and `skintyee-prod-rg` are **canadacentral**; Container Apps are canadacentral. ⚠️ Confirm the SharePoint/M365 tenant region if the SharePoint mirror is enabled. |
| **Retention schedule** (keep N years, then dispose) | ⚠️ **To define** — set a retention rule per the funding agreement (e.g. 7 years), then enforce via an Azure Blob lifecycle policy. |
| **Records/privacy policy** | ⚠️ **To confirm** — the band should have a policy covering member personal information and records retention. |

## Where submissions are stored

The submission portal files each upload into the designed structure
`<area>/<slug>/submissions/<paw|dci>/<title>_<who>_<datetime>_<id>/` across whichever stores
are configured (see [PLAN.md](./PLAN.md) §5, "one structure / three surfaces"):

- **Local disk** — POC store + powers the submission-status badges.
- **Azure Blob** (`skintyeeproddocs`, container `funding-submissions`, canadacentral) — primary
  cloud store when `AZURE_STORAGE_SUBMISSIONS_*` is set.
- **SharePoint** — mirror when `SHAREPOINT_*` is set.

Each submission is assigned a unique **GUID** plus a friendly key derived from the
application title, submitter, and timestamp (shown to the submitter as a Reference ID).

## To confirm (decisions for the Band Manager / a privacy advisor)

1. **Funding agreement records clause** — retention period and audit-access requirements.
2. **Band privacy/records policy** — does one exist covering member personal info? If not,
   adopt a short one.
3. **Data residency** — confirm the SharePoint/M365 tenant is Canadian-region (Azure storage
   already is). Many Nations require records remain in Canada.

Once a retention period and residency decision are recorded, they can be enforced in config:
a **Blob lifecycle/retention policy** for the storage account, and confirming the SharePoint
site's region.
