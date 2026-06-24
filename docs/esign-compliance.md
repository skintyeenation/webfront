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

## 5. What we deliberately do NOT claim

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

## 6. Verification status / open items

- ✅ **Verified against primary sources** (2026-06-24): PIPEDA + SOR/2005-30 (S1,
  S2), BC ETA (S3), Gov-Canada guidance (S4), CRA TD1 + e-signatures (S5, S6).
- ⚠️ **OpenSign feature claims** (S7–S9) are the **vendor's own docs** — audit
  trail, P12 sealing, certificate of completion, email-OTP. Confirm hands-on
  during the runbook's Phase 8 (sign a test envelope; verify the seal breaks on
  edit).
- ⚠️ **Re-verify annually** — CRA and Justice Laws pages update; the "last
  verified" date at the top is the checkpoint.
- 🔗 **Related go/no-go items** (ADR-17, not compliance-blocking but design-
  relevant): OpenSign self-host **API access** (paywall?) and **Entra OIDC**.
