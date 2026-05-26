# Migrate DNS: GoDaddy → Azure DNS

Plan for moving authoritative DNS for `skintyee.ca` from GoDaddy
(currently `ns25.domaincontrol.com` + `ns26.domaincontrol.com`) into
**Azure DNS**, where the deploy scripts can write records
programmatically and everything sits under one Microsoft tenant.

> **Window:** safe to do **now** — no email is flowing through
> `@skintyee.ca` yet (no MX record currently set), so the typical
> "30 s – 48 h bounced-mail risk" doesn't apply.

Companion to [`domains.md`](./domains.md) (which describes the
end-state shape — registrar at GoDaddy, DNS in Azure).

---

## Current state (verified via `dig`, 2026-05-26)

```text
$ dig +short NS skintyee.ca
ns25.domaincontrol.com.
ns26.domaincontrol.com.

$ dig +short A skintyee.ca
76.223.105.230
13.248.243.5

$ dig +short CNAME www.skintyee.ca
skintyee.ca.

$ dig +short TXT skintyee.ca
"v=verifydomain MS=8336219"

$ dig +short MX skintyee.ca
(empty)

$ dig +short CNAME selector1._domainkey.skintyee.ca
(empty)

$ dig +short TXT _dmarc.skintyee.ca
(empty)

$ dig +short CNAME autodiscover.skintyee.ca
(empty)
```

Interpretation:

- **NS:** GoDaddy is authoritative.
- **A records:** `76.223.105.230` + `13.248.243.5` are AWS IPs — most
  likely the **GoDaddy / Site123 "domain forwarding"** page, not
  actual website hosting. Verify before preserving (curl them: do
  they redirect to skintyeefirstnation.org or load a default page?).
- **www:** flat CNAME back to apex.
- **TXT:** `MS=8336219` is a **Microsoft 365 domain-verification token** —
  M365 admin center started adding `skintyee.ca` as a domain but the
  rest of the email records (MX, SPF, DKIM, autodiscover) haven't
  been completed yet.
- **MX / DKIM / DMARC / autodiscover:** **all missing.** Mail
  addressed to `firstname.lastname@skintyee.ca` is currently bouncing
  (or being NXDOMAIN'd, depending on the sending server's resolver).
  This must be fixed regardless of where DNS lives.

The M365 verify TXT record was added in GoDaddy before this plan;
it must carry over to Azure DNS so domain status in M365 admin
center stays "Verified".

---

## Goals

1. Move authoritative DNS to Azure DNS in resource group
   `skintyee-prod-rg` (the same RG the deploy infrastructure uses).
2. Preserve the M365 verification TXT record (so M365 still trusts
   the domain after the nameserver swap).
3. Complete the M365 email setup at the same time (add the MX +
   SPF + DKIM + DMARC + autodiscover records the M365 admin center
   prescribes).
4. Pre-create Azure DNS records for the upcoming subdomains
   (`api`, `app`, `lookup`, `lookup-app`) so the deploy scripts can
   issue managed TLS certs without manual portal clicks.
5. Decide whether the current AWS A-record forwarding stays
   (probably yes — it gives the bare `skintyee.ca` a working page
   until the WordPress migration completes), or gets replaced now
   with the WordPress production IP.

---

## Plan

### Step 1 — confirm the AWS A records aren't load-bearing

```bash
curl -sIL http://76.223.105.230 | head -5
curl -sIL http://13.248.243.5 | head -5
```

Most likely: redirect headers pointing back at `skintyee.ca` or a
GoDaddy parking page. If so, **either drop these A records** (no
website at apex until WordPress prod is up) **or copy them** if
they're providing a useful interim landing page.

Decision needed before the cutover. Default assumption in the
script: copy as-is, then update once WordPress production is on a
known IP.

### Step 2 — get the exact M365 DNS values from the admin center

The M365 admin center (<https://admin.microsoft.com> → Settings →
Domains → `skintyee.ca` → DNS records) shows the **exact** values
that should be in DNS for the tenant. Take a screenshot — the
following are the values to expect, but the M365 UI is the
authoritative source.

| Record | Expected | Where it comes from |
|---|---|---|
| MX `@` | `skintyee-ca.mail.protection.outlook.com` (priority 0, TTL 3600) | Tenant-derived: domain with dots → dashes + `.mail.protection.outlook.com` |
| TXT `@` (SPF) | `v=spf1 include:spf.protection.outlook.com -all` | Standard for M365-only sending |
| CNAME `selector1._domainkey` | `selector1-skintyee-ca._domainkey.skintyeenation.onmicrosoft.com` | Per-tenant DKIM (selector1) |
| CNAME `selector2._domainkey` | `selector2-skintyee-ca._domainkey.skintyeenation.onmicrosoft.com` | Per-tenant DKIM (selector2) |
| CNAME `autodiscover` | `autodiscover.outlook.com` | Outlook desktop / mobile config |
| TXT `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@skintyee.ca` | Our policy choice |
| TXT `@` (verify) | `MS=8336219` | **Carry over verbatim** from GoDaddy |

After moving, M365 admin center → Domains → Check Health should be
green on all rows.

### Step 3 — create the Azure DNS zone + pre-populate records

Scripted in `scripts/setup-dns-azure.sh` (to be added — see "What I
build next" below). What it does:

1. Creates the zone `skintyee.ca` in `skintyee-prod-rg`.
2. Adds the records from step 2 (M365 verify + MX + SPF + DKIM ×2 +
   autodiscover + DMARC).
3. Re-adds whatever A / CNAME records existed in GoDaddy (per step
   1 decision).
4. Pre-creates the `api`, `app`, `lookup`, `lookup-app` subdomain
   records — initially as TXT placeholders that the deploy scripts
   will replace with real CNAMEs when each service stands up.
5. Prints the four Azure DNS nameservers (e.g.
   `ns1-XX.azure-dns.com`, `…net`, `…org`, `…info`) that need to
   be set in GoDaddy.
6. Idempotent — safe to re-run.

### Step 4 — verify Azure DNS resolves the records BEFORE flipping nameservers

```bash
AZURE_NS=$(az network dns zone show \
  --resource-group skintyee-prod-rg --name skintyee.ca \
  --query 'nameServers[0]' -o tsv)
echo "Querying Azure NS: $AZURE_NS"

# Each should resolve to the value we put in Azure DNS, NOT what's in GoDaddy.
dig @"$AZURE_NS" MX skintyee.ca +short
dig @"$AZURE_NS" TXT skintyee.ca +short
dig @"$AZURE_NS" CNAME selector1._domainkey.skintyee.ca +short
```

If any record is wrong / missing, fix in Azure DNS **before**
touching GoDaddy.

### Step 5 — swap GoDaddy nameservers to Azure

In GoDaddy → My Products → `skintyee.ca` → **Nameservers** → **Change
Nameservers** → Custom:

```
ns1-XX.azure-dns.com
ns2-XX.azure-dns.net
ns3-XX.azure-dns.org
ns4-XX.azure-dns.info
```

(Exact values from the script's output.)

Save. GoDaddy may take a few minutes to update its registry record.

### Step 6 — watch propagation

```bash
# Worldwide propagation can take 30 s – 48 h depending on resolver TTLs.
# In practice, most resolvers pick up the change within a few minutes.
watch -n 30 'dig +short NS skintyee.ca'
# Initially shows ns25/ns26.domaincontrol.com; should switch to ns*.azure-dns.* over time.
```

Once `dig` worldwide shows the Azure nameservers, the cutover is
complete. Resolvers that haven't refreshed yet still get the same
records (because the records in GoDaddy and Azure are identical), so
nothing breaks.

### Step 7 — complete M365 domain health check

M365 admin center → Settings → Domains → `skintyee.ca` → Check
Health. All rows should go green within an hour.

### Step 8 — keep GoDaddy DNS records intact for 7–14 days

Don't delete the records in GoDaddy's DNS panel immediately. Keep
them as a rollback target in case Azure DNS hits an issue. After
2 weeks of clean operation, delete them from GoDaddy (they're not
authoritative anymore but they remain visible in the GoDaddy DNS
panel until you delete).

### Step 9 — update docs

- `docs/godaddy/domains.md` → change "DNS — authoritative zone in
  Azure DNS" section from prescriptive future state to descriptive
  current state.
- `docs/devops/deploy-architecture.md` → add Azure DNS to the
  hosting-service summary (~$1/mo line item).
- The various `setup-*-azure.sh` scripts could be upgraded later to
  write DNS records via `az network dns record-set ... add-record`
  instead of printing manual steps. That's a follow-up enhancement,
  not part of the migration.

---

## Rollback plan

If something goes wrong post-cutover (most likely failure modes:
M365 email not delivering, custom-domain cert validation looping,
WordPress prod IP unreachable):

1. **GoDaddy → Nameservers → revert to GoDaddy defaults**
   (`ns25/ns26.domaincontrol.com`). Within minutes, authoritative
   DNS is back at GoDaddy.
2. The records you left intact in GoDaddy resume serving traffic.
3. Diagnose the Azure DNS issue separately, fix, re-cut over when
   ready.

This is why step 8 says **don't delete GoDaddy records for 2 weeks**.

---

## Risks + things to watch

- **AWS A records (`76.223.105.230`, `13.248.243.5`)** — if these are
  serving a useful interim page, carry them over. If they're stale,
  drop them and let `skintyee.ca` at apex return NXDOMAIN until
  WordPress prod is live. Step 1 confirms.
- **M365 admin center may need a domain re-verify** after the
  nameserver swap. Re-running the verification button in the M365
  admin center is harmless even if not needed.
- **GoDaddy auto-renew is unchanged.** The registrar relationship
  stays at GoDaddy — only DNS hosting moves. Domain ownership +
  WHOIS contact + renewal billing all stay where they are.
- **`.ca` CIRA Canadian Presence Requirements** are unchanged —
  registrant info stays the same.

---

## What I'd build next (script + doc updates)

If approved:

1. **`scripts/setup-dns-azure.sh`** — idempotent setup script in
   the same shape as `setup-api-azure.sh`:
   - Creates the Azure DNS zone in `skintyee-prod-rg`.
   - Adds all the records from the table in step 2 + the AWS A
     records (preserving current state).
   - Pre-creates placeholder records for `api`, `app`, `lookup`,
     `lookup-app` subdomains.
   - Prints the Azure nameservers to paste into GoDaddy.
   - `--dry-run` shows what it'd do without making changes.
2. **Update `docs/godaddy/domains.md`** — rewrite the "DNS"
   section as descriptive instead of prescriptive.
3. **Update `docs/devops/deploy-architecture.md`** — add the
   Azure DNS line item (~$0.60/mo) to the cost table; mention
   that custom-domain validation for Container Apps + Static Web
   Apps is now scriptable end-to-end via `az` against the same
   Azure DNS zone.

After the cutover is verified working, an **enhancement** worth
considering:

- Upgrade `scripts/setup-api-azure.sh` + `setup-lookup-azure.sh`
  + `setup-app-web-azure.sh` + `setup-lookup-app-web-azure.sh` to
  write their custom-domain CNAME / TXT records directly into
  Azure DNS during setup, instead of printing manual instructions.
  Removes 3 manual steps from the stand-up sequence (one per
  custom domain).

---

## See also

- [`domains.md`](./domains.md) — the current GoDaddy domain
  inventory + registrar-account practices
- [`../365/entra-id.md`](../365/entra-id.md) — Entra ID + M365
  tenant identity (`skintyeenation.onmicrosoft.com`)
- [`../365/shared-mailboxes.md`](../365/shared-mailboxes.md) —
  shared mailbox setup (which depends on M365 email being
  functional, which depends on the MX record being live)
- [`../devops/deploy-architecture.md`](../devops/deploy-architecture.md) —
  hosting service inventory; Azure DNS will get a line in the
  cost table once it's live
