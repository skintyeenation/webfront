# Set up `@skintyee.ca` email (DNS records at GoDaddy)

Step-by-step runbook to complete Microsoft 365 email for the
`skintyee.ca` domain. The domain has been added to the M365 tenant
but only the verification TXT record exists in DNS — the records
that actually make mail flow (MX, SPF, DKIM, autodiscover, DMARC)
are still missing.

> **DNS lives at GoDaddy** (decision: stay there through the POC —
> see [`../godaddy/domains.md`](../godaddy/domains.md) and
> [`../godaddy/dns-hosting-tradeoff.md`](../godaddy/dns-hosting-tradeoff.md)
> for the rationale). Every DNS record below gets added in
> GoDaddy's DNS panel.

---

## TL;DR — the 6 records to add in GoDaddy

The full step-by-step is below, but if you already know the
context, these are the records (assuming our tenant
`skintyeenation`). **Generate DKIM keys in M365 first** (step 1
below) — the exact DKIM values come from there.

| # | Type | Name (GoDaddy "Host" field) | Value (GoDaddy "Points to" field) | Priority |
|---|---|---|---|---|
| 1 | MX | `@` | `skintyee-ca.mail.protection.outlook.com` | `0` |
| 2 | TXT | `@` | `v=spf1 include:spf.protection.outlook.com -all` | — |
| 3 | CNAME | `autodiscover` | `autodiscover.outlook.com` | — |
| 4 | CNAME | `selector1._domainkey` | `selector1-skintyee-ca._domainkey.skintyeenation.e-v1.dkim.mail.microsoft` | — |
| 5 | CNAME | `selector2._domainkey` | `selector2-skintyee-ca._domainkey.skintyeenation.e-v1.dkim.mail.microsoft` | — |
| 6 | TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:info@skintyee.ca; ruf=mailto:info@skintyee.ca; fo=1` | — |

TTL on all: **1 Hour** (3600 s).

GoDaddy field gotchas:

- **Name field is RELATIVE.** Type `selector1._domainkey`, not
  `selector1._domainkey.skintyee.ca`. GoDaddy appends the zone
  automatically. Use `@` for the apex (rows 1 + 2 + 6 — `_dmarc`
  is its own subdomain).
- **Value field: paste verbatim.** Don't add or remove trailing
  dots; GoDaddy adds them. Don't append `.com` to the DKIM
  values — `.microsoft` is a real Microsoft-owned TLD.
- **DMARC `_dmarc` TXT** — record at `_dmarc.skintyee.ca`. Some
  GoDaddy UI versions accept `_dmarc` as the name; others want
  you to use the "DMARC" record-type shortcut. Either works.
- **Existing `MS=8336219` TXT at `@`** — leave it alone. That's
  M365's domain-verification token.

Then verify with `dig` (see step 4), toggle DKIM signing ON in
M365 (step 6), and test with mail-tester.com (step 7).

---

## Current state (verified 2026-05-26)

```text
$ dig +short NS skintyee.ca
ns25.domaincontrol.com.        ← GoDaddy, authoritative
ns26.domaincontrol.com.

$ dig +short TXT skintyee.ca
"v=verifydomain MS=8336219"    ← M365 domain-verification token (good)

$ dig +short MX skintyee.ca    ← empty (mail isn't routable)
$ dig +short CNAME selector1._domainkey.skintyee.ca   ← empty
$ dig +short CNAME autodiscover.skintyee.ca           ← empty
$ dig +short TXT _dmarc.skintyee.ca                   ← empty
```

Mail to `firstname.lastname@skintyee.ca` is currently
bouncing (or being NXDOMAIN'd, depending on sender resolver).

---

## What you need before starting

| | Where |
|---|---|
| M365 Global Admin account | `admin@skintyeenation.onmicrosoft.com` (1Password → IT/Admin vault) |
| GoDaddy account | 1Password → IT/Admin vault. **2-factor auth on the GoDaddy account.** |
| Confirmation `skintyee.ca` is added in M365 admin center | <https://admin.microsoft.com> → Settings → Domains → look for `skintyee.ca`. If absent, click **Add domain** first and complete the verify step (re-adding the `MS=8336219` TXT). |

Allow **30–60 minutes** end to end (most of it propagation waits).

---

## Step 1 — Generate DKIM keys in M365 (do this first)

DKIM CNAME records need the **tenant** to have DKIM keys provisioned
before the CNAMEs can resolve to anything meaningful. Generate them
**before** adding the CNAMEs in GoDaddy.

Microsoft reorganizes the Defender portal navigation often. Three
ways to reach the DKIM page, in order of stability:

- **Direct URL (most reliable):** <https://security.microsoft.com/dkimv2>
- **Exchange Admin Center (most stable navigation):**
  <https://admin.exchange.microsoft.com> → **Mail flow → DKIM**
- **Defender portal navigation (current as of 2026):**
  <https://security.microsoft.com> → **Email & collaboration →
  Policies & rules → Threat policies → Email authentication settings
  → DKIM**

> The DKIM management UI is **included free with Business Standard**
> (it's part of Exchange Online's bundled features, not a paid
> Defender SKU). No additional license needed.

Once on the DKIM page:

1. Click `skintyee.ca` in the list.
2. **Create DKIM keys** (button at the top). Microsoft generates two
   1024-bit RSA keys. The "Enable" toggle stays OFF for now — we'll
   flip it once the CNAMEs are in DNS.
3. Note the two CNAME values shown. They'll be in **one of two formats**
   depending on when your tenant was set up:

   **New format (post-2023 tenants, uses Microsoft's own `.microsoft`
   gTLD):**

   ```
   selector1._domainkey.skintyee.ca  →  selector1-skintyee-ca._domainkey.skintyeenation.e-v1.dkim.mail.microsoft
   selector2._domainkey.skintyee.ca  →  selector2-skintyee-ca._domainkey.skintyeenation.e-v1.dkim.mail.microsoft
   ```

   **Legacy format:**

   ```
   selector1._domainkey.skintyee.ca  →  selector1-skintyee-ca._domainkey.skintyeenation.onmicrosoft.com
   selector2._domainkey.skintyee.ca  →  selector2-skintyee-ca._domainkey.skintyeenation.onmicrosoft.com
   ```

   **Whatever M365 shows you is what to use** — copy verbatim. The
   `.microsoft` ending is a real TLD that Microsoft owns; don't
   append `.com` or anything else to it. Screenshot the values for
   your records.

> **If `skintyee.ca` doesn't appear in the DKIM list:** the domain
> isn't fully verified in M365 yet. Open <https://admin.microsoft.com>
> → **Settings → Domains** and confirm `skintyee.ca` shows as
> **Verified** (not "Pending" or "Setup incomplete"). If it's
> verified but still missing from DKIM, wait ~10 minutes —
> there's sometimes a propagation delay between adding a domain in
> M365 and its appearance on the DKIM page.

---

## Step 2 — Get the rest of the records from the M365 admin center

M365 admin center → **Settings → Domains → `skintyee.ca` → DNS records**.

The page lists everything M365 expects to see. **Use these exact
values** — they're tenant-specific. Expected shape:

| Record | Type | Host / Name | Value | TTL |
|---|---|---|---|---|
| Exchange Online (MX) | MX | `@` | `skintyee-ca.mail.protection.outlook.com` (priority `0`) | `1 hour` |
| SPF | TXT | `@` | `v=spf1 include:spf.protection.outlook.com -all` | `1 hour` |
| Autodiscover | CNAME | `autodiscover` | `autodiscover.outlook.com` | `1 hour` |
| DKIM selector 1 | CNAME | `selector1._domainkey` | (from step 1) | `1 hour` |
| DKIM selector 2 | CNAME | `selector2._domainkey` | (from step 1) | `1 hour` |
| Skype/Teams (optional) | various | various | (skip if not using federated Teams calling) | — |

Plus our own:

| Record | Type | Host / Name | Value | TTL | Reason |
|---|---|---|---|---|---|
| DMARC | TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:info@skintyee.ca; ruf=mailto:info@skintyee.ca; fo=1` | `1 hour` | Email policy. Start with `p=none` (report only); tighten to `p=quarantine` after 2 weeks of clean reports. |

> **Why `p=none` first:** DMARC tells receivers what to do with mail
> that fails SPF/DKIM. Starting at `none` means "watch + report,
> don't reject" — you avoid accidentally blocking legitimate mail
> while DKIM keys are still being signed and SPF coverage is being
> validated. Tighten to `p=quarantine` (junk-folder failing mail)
> after 2 weeks of clean DMARC aggregate reports.

---

## Step 3 — Add the records in GoDaddy

1. Sign in to GoDaddy at <https://godaddy.com>.
2. **My Products → All Products → Domains → `skintyee.ca` → DNS**
   (or the **Manage DNS** button next to the domain).
3. **Records** tab. For each row in the tables above:
   - Click **Add New Record** → choose the type from the dropdown.
   - **Name:** what's in the "Host / Name" column (use `@` for apex).
     GoDaddy's UI: type `@` literally OR leave blank for apex —
     **read the field's hint text**; both forms exist depending on
     GoDaddy's current UI version.
   - **Value / Points to:** what's in the "Value" column. **Don't
     include trailing dots** in GoDaddy — its UI adds them
     automatically.
   - **Priority** (MX only): `0`.
   - **TTL:** `1 Hour` (3600 seconds).
   - **Save**.
4. Verify the `MS=8336219` TXT verify record is still there. Don't
   delete it.

> **GoDaddy gotcha:** if GoDaddy says "A record at @ already exists"
> when you try to add the SPF TXT — that's fine, TXT and A are
> different types at the same name. Just confirm you're adding it
> as TXT, not A.

Total records added: 5 (MX, SPF TXT, autodiscover CNAME, DKIM ×2)
plus 1 DMARC TXT = **6 new records**.

---

## Step 4 — Wait for propagation, verify with `dig`

GoDaddy's UI says "changes can take 48 hours" but in practice most
records show worldwide within 5–15 minutes.

```bash
# Run these every few minutes after saving in GoDaddy:
dig +short MX skintyee.ca
# Expected: 0 skintyee-ca.mail.protection.outlook.com.

dig +short TXT skintyee.ca | grep -i spf
# Expected: "v=spf1 include:spf.protection.outlook.com -all"

dig +short CNAME autodiscover.skintyee.ca
# Expected: autodiscover.outlook.com.

dig +short CNAME selector1._domainkey.skintyee.ca
# Expected: selector1-skintyee-ca._domainkey.skintyeenation.onmicrosoft.com.

dig +short CNAME selector2._domainkey.skintyee.ca
# Expected: selector2-skintyee-ca._domainkey.skintyeenation.onmicrosoft.com.

dig +short TXT _dmarc.skintyee.ca
# Expected: "v=DMARC1; p=none; rua=mailto:info@skintyee.ca; ..."
```

If a record is missing after 15 minutes, recheck GoDaddy's DNS panel
(typos in the value, wrong record type, etc.).

---

## Step 5 — M365 admin center → Check Health

1. <https://admin.microsoft.com> → **Settings → Domains** →
   `skintyee.ca`.
2. Click **Check DNS** (or **Check Health** depending on UI
   version).
3. Every row should turn green within ~5 minutes once DNS has
   propagated. If anything is yellow / red, hover for the specific
   message — usually a typo in GoDaddy that needs correcting.

---

## Step 6 — Enable DKIM signing

Once the DKIM CNAMEs resolve correctly:

1. Open the DKIM page again (same three paths as Step 1; direct URL
   <https://security.microsoft.com/dkimv2> is simplest).
2. Click `skintyee.ca`.
3. Toggle **Sign messages for this domain with DKIM signatures**
   to **ON**.
4. M365 starts attaching DKIM signatures to outbound mail
   immediately. Inbound mail is unaffected by this toggle (DKIM
   verification on received mail is always on).

---

## Step 7 — Test send + verify SPF/DKIM/DMARC

Send a test message from `admin@skintyeenation.onmicrosoft.com` (or
a new `@skintyee.ca` user once one exists) to a free mail-checker:

- **<https://www.mail-tester.com>** — gives you a unique address to
  send a test mail to; visit the URL it provides for a deep report
  on SPF / DKIM / DMARC / blocklists / spam-score / content
  rendering.
- Or send to a personal Gmail / Outlook.com and check the message
  headers — look for `dkim=pass`, `spf=pass`, `dmarc=pass`.

Target: 9/10 or 10/10 on mail-tester. Anything lower, the report
tells you exactly which record needs tweaking.

---

## Step 8 — Set up the first user / shared mailbox

Now that mail flows, complete the M365 setup for actual use:

1. **Create the first staff user** in M365 admin center → Users →
   Active users → Add a user → `firstname.lastname@skintyee.ca`.
2. **Set up shared mailboxes** per
   [`shared-mailboxes.md`](./shared-mailboxes.md):
   - `info@skintyee.ca`
   - `chief@skintyee.ca`
   - `admin@skintyee.ca`
3. **Walk through user-side activation** per
   [`../onboarding/outlook-skintyee-ca.md`](../onboarding/outlook-skintyee-ca.md)
   for the new user (sets password, registers MFA, adds to Outlook).

---

## Step 9 — Tighten DMARC after 2 weeks of clean reports

DMARC aggregate reports (`rua=mailto:info@skintyee.ca`) arrive from
big mail providers (Google, Microsoft, Yahoo, etc.) as XML
attachments daily. Skim them for ~2 weeks looking for:

- **Mail your tenant is sending that fails SPF or DKIM** — these are
  legitimate sources that need to be added to SPF or DKIM-aligned.
- **Mail being sent from your domain that you don't recognize** —
  rare, but if it happens, that's spoofing and the next step is
  important.

Once you're confident every legitimate sender is aligned, tighten
DMARC:

```
v=DMARC1; p=quarantine; rua=mailto:info@skintyee.ca; ruf=mailto:info@skintyee.ca; fo=1; pct=100;
```

Change in GoDaddy's `_dmarc` TXT record. Wait another 2 weeks at
`p=quarantine`. If no legitimate mail is being quarantined, finally
tighten to:

```
v=DMARC1; p=reject; rua=mailto:info@skintyee.ca; ruf=mailto:info@skintyee.ca; fo=1; pct=100;
```

That gets the best protection against spoofing.

---

## After this is done

- **GoDaddy DNS state** is now: M365 verify TXT + 6 email records +
  whatever website A/CNAME records you have. Document the final
  state by updating the records table in
  [`../godaddy/domains.md`](../godaddy/domains.md) if you tighten
  DMARC later.
- **The `dns-hosting-tradeoff.md` doc** can be marked "deferred"
  with a brief note: "DNS stays at GoDaddy through the POC for
  simplicity; revisit if subdomain count grows past ~10 or IaC for
  DNS becomes a need."
- **Add `info@skintyee.ca` as a shared mailbox** so the
  `rua=mailto:info@…` DMARC aggregate reports land somewhere a
  human reads.

---

## Troubleshooting

**MX record visible in `dig` but mail still bounces.**
- Wait 10 more minutes — recipient mail servers cache MX lookups.
- Verify M365 admin center shows the domain as "Healthy"
  (Settings → Domains → `skintyee.ca`).

**DKIM CNAME resolves but mail still shows `dkim=none` in headers.**
- Did you enable the toggle in Step 6? CNAMEs alone aren't enough.

**SPF returns `softfail` instead of `pass` on test mail.**
- Make sure SPF is exactly `v=spf1 include:spf.protection.outlook.com -all`
  — the `-all` at the end is hardfail; `~all` is softfail.

**DMARC aggregate reports never arrive.**
- The `rua=mailto:` address must accept mail from external domains.
  If you set it to `info@skintyee.ca` and that's a shared mailbox,
  confirm it has external sender allowed.

**GoDaddy DNS panel won't let me add a CNAME at the apex (`@`).**
- That's standard — CNAMEs at apex aren't allowed by RFC. None of
  the records above need to be a CNAME at apex; the CNAMEs are all
  at sub-hosts (`autodiscover`, `selector1._domainkey`, etc.). MX
  + TXT at apex is fine.

---

## See also

- [`shared-mailboxes.md`](./shared-mailboxes.md) — create + manage
  `info@`, `chief@`, `admin@` shared mailboxes (depends on this
  setup being done first)
- [`entra-id.md`](./entra-id.md) — what the tenant + admin account
  is + how identity ties the platform together
- [`../onboarding/outlook-skintyee-ca.md`](../onboarding/outlook-skintyee-ca.md) —
  end-user setup (Outlook desktop / mobile / web) after their
  `@skintyee.ca` account is created
- [`../godaddy/domains.md`](../godaddy/domains.md) — domain
  inventory + registrar-account practices
- [`../godaddy/dns-hosting-tradeoff.md`](../godaddy/dns-hosting-tradeoff.md) —
  deferred plan to move DNS to Azure if/when the trade-off changes
