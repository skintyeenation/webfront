# GoDaddy — domains & DNS

How Skin Tyee's domain names are registered (GoDaddy) and how DNS is wired up.
Companion to [`pricing.md`](pricing.md).

> The domain is the foundation of everything public: the website
> (`skintyee.ca`), the app (`app.skintyee.ca`), and **email** (`@skintyee.ca` via
> Microsoft 365). Losing or misconfiguring it takes all of those down — treat it
> carefully.

## Domains (keep this current)

All registered at **GoDaddy** under the "Skin Tyee First Nation" account:

| Domain | Role | Auto-renew | Expires |
|---|---|---|---|
| `skintyee.ca` | **Primary** — website, `app.skintyee.ca`, `@skintyee.ca` email | **ON** | May 2027 |
| `skintyee.com` | Defensive registration → redirect to `skintyee.ca` | **ON** | May 2027 |
| `skintyee.org` | Defensive registration → redirect to `skintyee.ca` | **ON** | May 2027 |
| `skintyee.net` | Defensive registration → redirect to `skintyee.ca` | **ON** | May 2027 |

![](media/thumbs/domains-dashboard.png)

> `.ca` is the primary public domain; `.com`/`.org`/`.net` are held defensively
> and forwarded to it. (The old Site123 site `skintyeefirstnation.org` is the
> migration *source* — not one of these GoDaddy domains.)
>
> **`.ca` requirement:** `.ca` domains require the registrant to meet **CIRA
> Canadian Presence Requirements** (a First Nation / band qualifies). Keep the
> registrant contact accurate.

## Registrar account

- Provider: **GoDaddy** (registrar). Account credentials stored in **1Password**
  (Administration / IT vault — see [`../1password/setup.md`](../1password/setup.md)).
- **Turn on 2-factor authentication** on the GoDaddy account.
- Keep **domain (registrar) lock ON** to prevent unauthorized transfers.
- Keep the **registrant/admin email** on a mailbox the org controls (not a
  personal address) so renewal/transfer notices aren't missed.

## DNS — authoritative zone in Azure DNS

Per the architecture (`docs/SkinTyee.drawio.pdf`, "Azure DNS Zone"), DNS is
hosted in **Azure DNS**, with GoDaddy used as the **registrar only**:

1. In **Azure DNS**, create the zone `skintyee.ca`; Azure assigns 4 name servers
   (e.g. `ns1-….azure-dns.com`, `…net`, `…org`, `…info`).
2. In **GoDaddy** → the domain → **Nameservers** → set **custom nameservers** to
   the 4 Azure DNS name servers. (This delegates DNS to Azure.)
3. Manage **all records in Azure DNS** from then on.

> If DNS is instead managed **at GoDaddy** (GoDaddy's nameservers), records are
> edited in GoDaddy's DNS panel instead — confirm which is in use. The records
> below are the same either way.

### Key records

| Record | Type | Points to | For |
|---|---|---|---|
| `@` (root) | A / ALIAS | website host (Azure VM IP) | skintyee.ca site |
| `www` | CNAME | `skintyee.ca` | www → site |
| `app` | CNAME / A | the app host | app.skintyee.ca |
| `erp` | CNAME / A | the ERP host | erp.skintyee.ca |
| `@` | **MX** | `skintyee-ca.mail.protection.outlook.com` | Microsoft 365 email |
| `@` | **TXT (SPF)** | `v=spf1 include:spf.protection.outlook.com -all` | email auth |
| `selector1._domainkey`, `selector2._domainkey` | CNAME | M365 DKIM targets | email signing |
| `_dmarc` | TXT | `v=DMARC1; p=quarantine; rua=mailto:dmarc@skintyee.ca` | email policy |
| `autodiscover` | CNAME | `autodiscover.outlook.com` | Outlook setup |

> M365 will show the exact MX/SPF/DKIM/autodiscover values in the admin center
> (Settings → Domains → `skintyee.ca`). The website + SSL also need the A/CNAME
> records resolving before Let's Encrypt/Certbot can issue certificates
> (see the deploy pipeline).

## Renewal & safety

- **Auto-renew ON** for every domain — an expired domain = website + email down,
  and risk of someone else grabbing it.
- Renew **`.ca` and `.org` annually** (see [`pricing.md`](pricing.md)); keep a
  calendar reminder ~30 days before expiry as a backstop.
- Don't let the **registrant contact** drift to a former employee — update it
  during offboarding.
