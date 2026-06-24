# E-signature compliance — verification record (Canada · BC)

Evidence record backing the compliance claims in **ADR-17** (self-hosted
OpenSign e-signatures). Captures *which* electronic-signature standard Skin
Tyee's documents need, *why*, and the authoritative sources — so the decision is
verifiable, not asserted.

> **Not legal advice.** This is an engineering/operations record citing public
> primary sources. Confirm with band counsel before relying on it for a
> high-stakes document.
>
> **Last verified:** 2026-06-24. Re-check the CRA and Justice Laws pages
> annually — guidance wording changes.

## Verdict (TL;DR)

| Document type | Sufficient signature | Why |
|---|---|---|
| Onboarding forms, NDAs, employment records, **TD1 / TD1BC** | **Simple / standard electronic signature** | BC ETA s.11 + PIPEDA Part 2; none are in the BC ETA exclusion list; CRA accepts e-signed/e-stored TD1 |
| Federal **original / oath / statutory-declaration / witnessed** docs | **Secure** (PKI) electronic signature | PIPEDA + SOR/2005-30 — **not** in Skin Tyee's current scope |
| Wills, powers of attorney, land transfers, negotiable instruments | **Out of scope** (special handling) | BC ETA s.2(4)–(5) exclusions — Skin Tyee does not e-sign these |

**Bottom line:** for everything Skin Tyee actually signs, a **simple electronic
signature with intent + attribution + integrity + audit trail** is legally
sufficient, and OpenSign clears that bar. We do **not** claim the federal
"secure electronic signature" form or "qualified/TSA timestamps."

> **Scope — not every band document needs a signature.** OpenSign handles the
> *signature ceremony* only (NDA, onboarding/policy acknowledgement, TD1).
> **Financial approvals** (timesheets, expenses, **AP/AR, EFTs**) run through
> **Sage Intacct** (audit-logged, segregation of duties); **Records of
> Employment** through **ROE Web** (checkbox attestation, no paper copy).
> Documents are **stored in SharePoint and surfaced in the app**, which can
> generate a **per-entity audit export**. Full breakdown:
> [§5 — Document & approval responsibility matrix](#5-document--approval-responsibility-matrix).

## Sources

| # | Source | URL |
|---|---|---|
| S1 | PIPEDA — full text (Part 2, ss. 31–51) | https://laws-lois.justice.gc.ca/eng/acts/p-8.6/FullText.html |
| S2 | Secure Electronic Signature Regulations (SOR/2005-30) | https://laws-lois.justice.gc.ca/eng/regulations/sor-2005-30/FullText.html |
| S3 | BC Electronic Transactions Act (SBC 2001, c. 10) | https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/01010_01 |
| S4 | Government of Canada — guidance on using electronic signatures | https://www.canada.ca/en/government/system/digital-government/online-security-privacy/identity-credential-access-management/government-canada-guidance-using-electronic-signatures.html |
| S5 | CRA — Filing Form TD1 (electronic completion + storage) | https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/set-up-new-employee/filing-form-td1.html |
| S6 | CRA — Using electronic signatures (T183 family) | https://www.canada.ca/en/revenue-agency/services/forms-publications/electronic-signatures.html |
| S7 | OpenSign — README (audit trail, P12 sealing, OTP) | https://github.com/OpenSignLabs/OpenSign |
| S8 | OpenSign — FAQ (certificate of completion, sealing, editions) | https://www.opensignlabs.com/faqs |
| S9 | OpenSign — self-signed document-signing certificate guide | https://docs.opensignlabs.com/docs/self-host/guides/how-to-generate-self-signed-document-signing-certificate/ |
| S10 | CRA — Keeping records (retention; IC78-10R5 / ITA s. 230) | https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/keeping-records.html |
| S11 | Service Canada — Employers: how to complete the ROE (electronic = Block 22 attestation; keep data 6 yr) | https://www.canada.ca/en/employment-social-development/programs/ei/ei-list/reports/roe-guide.html |
| S12 | First Nations Fiscal Management Act (SC 2005, c. 9) | https://laws-lois.justice.gc.ca/eng/acts/F-11.67/ |
| S13 | RCAANC — Financial Reporting Requirements (funding-agreement records) | https://www.rcaanc-cirnac.gc.ca/eng/1770316369535/1770316482534 |
| S14 | Service Canada — EI Record of Employment (electronic copy sufficient; no paper copy required) | https://www.canada.ca/en/employment-social-development/programs/ei/ei-list/ei-roe.html |

## 1. Federal framework — PIPEDA Part 2 + SOR/2005-30 [S1, S2]

- **PIPEDA Part 2 (ss. 31–51)** gives electronic documents and signatures legal
  recognition for federal purposes — satisfying federal-statute requirements to
  be written / signed / original / made under oath / witnessed. [S1]
- **"Electronic signature" (s. 31(1))** is the **technology-neutral, "simple"**
  form: letters, characters, numbers, or symbols in digital form incorporated
  in, attached to, or associated with an electronic document. [S1]
- **"Secure electronic signature" (s. 31 + SOR/2005-30)** is specifically a
  **PKI digital signature**: an asymmetric key pair + hash function + a digital
  signature **certificate issued by a certification authority listed on the
  Treasury Board Secretariat website**. It carries a statutory presumption of
  signer identity. [S1, S2]
- **The secure form is *required* only** where the underlying federal provision
  needs it: **original documents (s. 42)**, **statements made under oath /
  affirmation (s. 44)**, **statutory declarations / statements of truth
  (s. 45)**, **witnessed signatures (s. 46)**. An ordinary "signature"
  requirement is satisfied by a **simple** electronic signature (s. 43). [S1]

→ Skin Tyee's documents (onboarding, NDA, TD1, employment records) are **not**
oaths, statutory declarations, or witnessed instruments, so the **simple** form
applies. OpenSign's self-signed P12 seal is **not** a Treasury-Board-CA
certificate and therefore does **not** produce a federal "secure" signature —
which is fine, because none of these documents require one.

## 2. Provincial framework — BC Electronic Transactions Act [S3]

- **s. 11(1):** a legal requirement for a signature **is satisfied by an
  electronic signature.**
- **s. 15:** electronic contract formation is valid; **s. 15(2):** a record is
  not invalid solely for being electronic.
- **s. 4:** **no one is required to transact electronically without consent** —
  consent may be **inferred from conduct** (so a recorded "consent to sign
  electronically" step is the clean way to evidence it).
- **Exclusions — s. 2(4)–(5):** wills, trusts created by wills, powers of
  attorney (financial/personal-care), land transfers requiring registration,
  negotiable instruments, documents of title. **None of these are Skin Tyee
  documents**, so no exclusion applies.
  - ⚠️ Nuance: **wills** are excluded from the ETA but are **separately valid
    electronically under WESA** (in force 2021-12-01) — so "wills can't be
    e-signed in BC" is true *under the ETA* but false as a blanket statement.
    Not relevant to Skin Tyee, noted for accuracy.

## 3. The five practical compliance pillars [S4]

Courts and regulators look for these; OpenSign's coverage noted:

| Pillar | OpenSign |
|---|---|
| **Intent to sign** (deliberate action) | ✅ explicit "sign" action |
| **Consent to transact electronically** | ⚠️ **process step we add** — a recorded consent checkbox (BC ETA s. 4) |
| **Attribution / identity** | ✅ signer **email-OTP**; account 2FA for users [S7] |
| **Integrity / tamper-evidence** | ✅ PDF **sealed with a P12 certificate** — any change invalidates the signature; verifiable in Acrobat [S8, S9] |
| **Audit trail / retention** | ✅ audit log (timestamps, IPs, emails) + **certificate of completion** [S7, S8] |

## 4. CRA — TD1 specifically [S5]

CRA permits employees to **complete and submit the TD1 electronically** and the
employer to **store it electronically.** Verbatim [S5]:

> "The forms can be maintained and stored electronically, however security
> measures must be in place to authenticate the individual's identity because
> there is no written signature on the TD1 Form (for example, a password system
> or an individual self-service portal)."

- Key point: TD1 has **no signature requirement** — the control CRA cares about
  is **identity authentication of the submitter** (password / self-service
  portal). OpenSign's **email-OTP + audit trail** satisfies this.
- The employer **retains** the completed TD1 (it is **not** filed with CRA), must
  review it for reasonableness, and follows CRA electronic-records rules
  (IC78-10R5). [S5]
- **Broader CRA acceptance [S6]:** CRA also accepts electronic signatures on the
  **T183 family** (T183 / T183CORP / T183TRUST, T2183), conditioned on the
  receiving party **verifying the signer's identity** first.

## 5. Document & approval responsibility matrix

The whole system is an **electronic document storage & retrieval portal**:
**SharePoint** stores the files, the **app** retrieves/manages them (role-gated)
and can **generate a per-entity audit export**, **OpenSign** is the *e-signature
component* (onboarding docs etc.), and **Sage Intacct** is the **financial
backend**. Not every document is a signature — each type is handled by the system
built for it.

**Separation of concerns**
- **OpenSign** — signature ceremony for documents that need a genuine signature:
  **NDAs, onboarding / policy acknowledgements, TD1 / TD1BC.** Output: a sealed
  PDF → SharePoint.
- **Sage Intacct** — the **financial backend** / system of record: **audit-logged
  approval workflows with segregation of duties**, AP/AR, payables, **EFT
  authorizations**, plus the audit trail + retention. **Timesheets and expenses
  are captured in the app's own tables and *sync* with Intacct** (which
  facilitates the audit-logged approval) — they are not signed in OpenSign.
- **SharePoint** — document storage for ease of access; the **system of record
  for files** (signed PDFs, supporting invoices/receipts, policies). **Surfaced
  in the app** via the documents feature (role-gated).
- **ROE Web (Service Canada)** — Records of Employment: electronic submission via
  a **Block 22 checkbox attestation** (no signature), sent straight to Service
  Canada. **No paper copy required** — keep the electronic record **6 years** (ROE
  Web itself retains ROEs 11 years); store the employer copy in SharePoint.
  [S11, S14]
- **The app** — surfaces SharePoint documents and *initiates* OpenSign signature
  requests; it is **not** itself the financial or signature system of record.

| Document | Signature? | Handled by | What's on file (record of truth) | Retention |
|---|---|---|---|---|
| NDA | ✅ ceremony | OpenSign | Sealed PDF + certificate of completion → SharePoint | Employment + limitation period |
| Onboarding / policy acknowledgement | ✅ ceremony | OpenSign | Signed PDF → SharePoint | Employment + 6 yr |
| **TD1 / TD1BC** | ⚠️ identity-auth, not signature | OpenSign (email-OTP) or self-service portal | Completed TD1 → SharePoint; employer retains | While employed + **6 yr** [S5, S10] |
| Timesheets | ❌ approval | **App tables ⇄ Sage Intacct** (sync; Intacct audit-logged approval) | Timesheet in the app's tables, synced to Intacct + its audit trail; report copy in SharePoint | **6 yr** (payroll) [S10] |
| Expense sheets / mileage | ❌ approval | **App tables ⇄ Sage Intacct** (sync) + receipt | Expense in app tables synced to Intacct; receipt (source doc) in SharePoint; Intacct approval/audit | **6 yr** [S10] |
| **EFT / payable (AP)** | ❌ authorization (dual control) | **Sage Intacct** approval; bank executes the EFT | **Invoice** + Intacct approval (segregation of duties) + **proof of payment** (EFT/bank confirmation) | **6 yr** + funding-agreement term [S10, S13] |
| **Receivable (AR)** | ❌ | **Sage Intacct** (AR) | **Funding agreement / contract** establishing the amount + issued invoice + deposit/receipt record | **6 yr** + funding agreement [S10, S13] |
| Payroll slips | ❌ | Payroll / Intacct | Electronic pay statement (no signature needed) | **6 yr** [S10] |
| **Record of Employment (ROE)** | ❌ checkbox attestation | **ROE Web** | ROE Web submission (to Service Canada) + employer copy in SharePoint | **6 yr** [S11] |

**What must be on file for a band payable / receivable** — keep the full chain so
each transaction is audit-defensible:
1. **Source document** — vendor invoice / receipt (payable); funding agreement /
   contract / issued invoice (receivable).
2. **Authorization** — the **Sage Intacct** approval, with **segregation of
   duties** (different people initiate / approve / pay).
3. **Coding** — GL + **program / fund** allocation (this also feeds the app's
   transparency reporting).
4. **Proof of payment / receipt** — EFT or bank confirmation; deposit record.

Retain **6 years** under CRA (ITA s. 230 / IC78-10R5) [S10] — **longer** where a
**funding agreement** (ISC / Canada) requires it [S13], or where the band is under
an **FNFMA financial administration law** [S12]; program-level retention follows
the standards under the *Library and Archives Canada Act*.

**Audit export (planned).** For **any given entity** — a vendor, employee,
program, or funding agreement — the app can **generate / trigger an export** of
the full documentation a federal auditor needs: the SharePoint documents (signed
PDFs, invoices, receipts, policies) **plus** the linked Sage Intacct financial
records (approvals, audit trail, proof of payment) for that entity, assembled into
one package. This is what makes the portal *audit-ready*, not just a file store.

> **Finance-system note:** the financial system named here is **Sage Intacct**
> (current direction). This **supersedes** the Ferrus ASAP / Adagio / Sage 300
> assumption in **ADR-5** — to be reconciled there.

## 6. What we deliberately do NOT claim

- ❌ **Federal "secure electronic signature."** OpenSign uses a **self-signed
  P12**, not a Treasury-Board-listed-CA certificate (S2). Only needed for
  original/oath/declaration/witnessed federal docs — out of scope.
- ❌ **"Qualified / trusted timestamps."** OpenSign timestamps are
  **application-recorded, not RFC-3161 TSA-anchored.** Fine for the ordinary
  e-signature bar; don't call them qualified.
- ❌ **Third-party "ESIGN / UETA / eIDAS certified."** Those vendor statements are
  **self-asserted** marketing, not audited certifications (no SOC 2 / HIPAA /
  21 CFR Part 11 audit found). For Canadian validity it doesn't matter — BC ETA +
  PIPEDA require reliability / integrity / audit trail, which the P12 seal + audit
  log provide — but represent them accurately.

## 7. Verification status / open items

- ✅ **Verified against primary sources** (2026-06-24): PIPEDA + SOR/2005-30 (S1,
  S2), BC ETA (S3), Gov-Canada guidance (S4), CRA TD1 + e-signatures (S5, S6),
  CRA record retention (S10), ROE electronic filing + no-paper-copy + 6-yr
  retention (S11, S14), FNFMA + funding-agreement records (S12, S13).
- ⚠️ **OpenSign feature claims** (S7–S9) are the **vendor's own docs** — audit
  trail, P12 sealing, certificate of completion, email-OTP. Confirm hands-on
  during the runbook's Phase 8 (sign a test envelope; verify the seal breaks on
  edit).
- ⚠️ **Re-verify annually** — CRA and Justice Laws pages update; the "last
  verified" date at the top is the checkpoint.
- 🔗 **Related go/no-go items** (ADR-17, not compliance-blocking but design-
  relevant): OpenSign self-host **API access** (paywall?) and **Entra OIDC**.
