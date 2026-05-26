# Subdomains for Azure-hosted services (in GoDaddy DNS)

How `app.skintyee.ca`, `lookup.skintyee.ca`, `api.skintyee.ca`, and
`lookup-app.skintyee.ca` get wired up. Same DNS-at-GoDaddy decision
as the email setup ([`dns-hosting-tradeoff.md`](./dns-hosting-tradeoff.md))
— every record below gets added in GoDaddy's DNS panel.

## The pattern

Every Azure-hosted service publishes on a default Microsoft-owned
hostname (e.g. `<something>.azurestaticapps.net` for Static Web
Apps, `<random>.canadacentral.azurecontainerapps.io` for Container
Apps). To serve traffic on our own `*.skintyee.ca` instead:

```
[ user browser ]
     │  https://app.skintyee.ca
     ▼
[ Azure / Microsoft global edge ]   ← TLS terminated here (free cert)
     │
     ▼
[ Static Web App / Container App ]  ← the actual service
```

The wiring on our side:

1. **Two records in GoDaddy** per subdomain:
   - **CNAME** pointing `app` → the Azure default hostname.
   - **TXT** (validation token) so Azure can prove we own the
     subdomain before it'll mint a cert + serve traffic.
2. **One `az` command** that tells Azure "this hostname is bound to
   this resource." Azure checks the TXT, mints a managed TLS cert,
   and the custom domain goes live.

Azure manages cert renewal automatically (every 60 days) — no
LetsEncrypt cron to maintain.

## Subdomain inventory

| Subdomain | Target Azure resource | Service type | Pipeline |
|---|---|---|---|
| `app.skintyee.ca` | `skintyee-prod-app` Static Web App | Web (community app's Expo web build) | [`deploy-app-web.yml`](../../azure-pipelines/Deployments/deploy-app-web.yml) |
| `lookup-app.skintyee.ca` | `skintyee-prod-lookup-app` Static Web App | Web (lookup tool's Expo web build) | [`deploy-lookup-app-web.yml`](../../azure-pipelines/Deployments/deploy-lookup-app-web.yml) |
| `api.skintyee.ca` | `api-prod` Container App | Backend (NestJS) | [`deploy-api.yml`](../../azure-pipelines/Deployments/deploy-api.yml) |
| `lookup.skintyee.ca` | `lookup-prod` Container App | Backend (Node + Anthropic) | [`deploy-lookup.yml`](../../azure-pipelines/Deployments/deploy-lookup.yml) |

Once these are wired up, the WordPress site stays on `skintyee.ca`
apex (currently AWS A records — to be replaced with the WP prod IP
when the site migration completes).

## When to set up each subdomain

Don't add the CNAME before the Azure resource exists — there's
nothing for it to point at, so `dig` returns garbage and Azure
can't validate. Order is **always**:

1. Run the service's setup script (creates the Azure resource —
   `setup-app-web-azure.sh`, `setup-api-azure.sh`, etc.). The
   script prints the default hostname.
2. Run the `az containerapp hostname add` / `az staticwebapp
   hostname` command to register the custom domain on the Azure
   side and **fetch the validation token**.
3. Add CNAME + validation TXT in GoDaddy.
4. Run `az ... hostname bind` (Container Apps) or wait for the
   "Validated" status (Static Web Apps) to mint TLS.

Each subdomain takes ≈5–15 minutes end to end, mostly DNS
propagation.

---

## `app.skintyee.ca` — community app web (Static Web Apps)

**Prerequisite:** `scripts/setup-app-web-azure.sh` has been run.
It prints the default hostname like
`<random>.<region>.azurestaticapps.net`.

### Step 1 — request the custom domain on the Azure side

```bash
SWA_NAME=skintyee-prod-app
RG=skintyee-prod-rg

az staticwebapp hostname set \
  --resource-group "$RG" \
  --name "$SWA_NAME" \
  --hostname app.skintyee.ca \
  --validation-method 'cname-delegation'
```

Azure responds with the validation status + the **CNAME target**
(the SWA default hostname). Copy that hostname.

### Step 2 — add the CNAME in GoDaddy

GoDaddy → My Products → `skintyee.ca` → DNS → **Records → Add New
Record**:

| Field | Value |
|---|---|
| **Type** | CNAME |
| **Name** | `app` (just the subdomain — no `.skintyee.ca`) |
| **Value / Points to** | the SWA default hostname from step 1 (e.g. `gentle-bay-123abc.6.azurestaticapps.net`) |
| **TTL** | 1 Hour |

Save.

### Step 3 — verify + bind

```bash
# Wait ~5 minutes for DNS to propagate, then:
dig +short CNAME app.skintyee.ca
# Should return the SWA default hostname.
```

Once `dig` resolves correctly, Azure detects the CNAME and starts
minting the cert automatically. You can check status:

```bash
az staticwebapp hostname show \
  --resource-group "$RG" \
  --name "$SWA_NAME" \
  --hostname app.skintyee.ca \
  --query 'status' -o tsv
# Cycles: Adding → Validating → Validated → Ready
```

Within ~10 minutes total, `https://app.skintyee.ca` serves the
community app over HTTPS.

---

## `lookup-app.skintyee.ca` — lookup tool web (Static Web Apps)

Identical shape to `app.skintyee.ca`, just substitute names:

```bash
SWA_NAME=skintyee-prod-lookup-app
RG=skintyee-prod-rg

az staticwebapp hostname set \
  --resource-group "$RG" \
  --name "$SWA_NAME" \
  --hostname lookup-app.skintyee.ca \
  --validation-method 'cname-delegation'
```

GoDaddy record:

| Field | Value |
|---|---|
| **Type** | CNAME |
| **Name** | `lookup-app` |
| **Value / Points to** | the lookup-app SWA default hostname |
| **TTL** | 1 Hour |

---

## `api.skintyee.ca` — backend (Container Apps)

Container Apps' custom-domain flow is slightly different — it
returns a **TXT** validation token alongside the CNAME requirement.

### Step 1 — request the custom domain

```bash
CONTAINER_APP=api-prod
RG=skintyee-prod-rg

az containerapp hostname add \
  --resource-group "$RG" \
  --name "$CONTAINER_APP" \
  --hostname api.skintyee.ca
```

Azure prints **two values to add in GoDaddy**:

- **CNAME** `api` → `<random>.canadacentral.azurecontainerapps.io`
- **TXT** `asuid.api` → a verification token (e.g. `1A2B3C…`)

The TXT proves we control the subdomain before Azure issues the
TLS cert.

### Step 2 — add CNAME + TXT in GoDaddy

Two records:

| Type | Name | Value | TTL |
|---|---|---|---|
| CNAME | `api` | the Container App's default FQDN (printed in step 1) | 1 Hour |
| TXT | `asuid.api` | the verification token (printed in step 1) | 1 Hour |

> **GoDaddy gotcha:** GoDaddy might warn that a CNAME and TXT at
> the same Name conflict. They're at *different* names —
> `api.skintyee.ca` (CNAME) vs `asuid.api.skintyee.ca` (TXT).
> Both records are correct.

### Step 3 — bind + mint TLS

```bash
# Wait ~5 minutes for DNS, then verify both records:
dig +short CNAME api.skintyee.ca
dig +short TXT asuid.api.skintyee.ca

# Bind the custom domain (Azure validates the TXT, mints TLS):
az containerapp hostname bind \
  --resource-group "$RG" \
  --name "$CONTAINER_APP" \
  --hostname api.skintyee.ca \
  --environment skintyee-prod-env \
  --validation-method CNAME
```

The `bind` command waits for cert issuance — typically ~2 minutes.
On success, `https://api.skintyee.ca` is live.

---

## `lookup.skintyee.ca` — backend (Container Apps)

Same shape as `api.skintyee.ca`:

```bash
CONTAINER_APP=lookup-prod
RG=skintyee-prod-rg

az containerapp hostname add \
  --resource-group "$RG" \
  --name "$CONTAINER_APP" \
  --hostname lookup.skintyee.ca
```

GoDaddy records:

| Type | Name | Value | TTL |
|---|---|---|---|
| CNAME | `lookup` | the `lookup-prod` Container App's default FQDN | 1 Hour |
| TXT | `asuid.lookup` | the verification token | 1 Hour |

Then bind:

```bash
az containerapp hostname bind \
  --resource-group "$RG" \
  --name "$CONTAINER_APP" \
  --hostname lookup.skintyee.ca \
  --environment skintyee-prod-env \
  --validation-method CNAME
```

---

## TL;DR — every subdomain we'll add in GoDaddy

Once all four services are stood up, GoDaddy will have these
service-related records (in addition to the M365 email records
from [`../365/setup-skintyee-ca-email.md`](../365/setup-skintyee-ca-email.md)):

| Type | Name | Points to | Purpose |
|---|---|---|---|
| CNAME | `app` | `<swa-app>.azurestaticapps.net` | community app web |
| CNAME | `lookup-app` | `<swa-lookup>.azurestaticapps.net` | lookup tool web |
| CNAME | `api` | `<container-app-api>.canadacentral.azurecontainerapps.io` | community app backend |
| CNAME | `lookup` | `<container-app-lookup>.canadacentral.azurecontainerapps.io` | lookup tool backend |
| TXT | `asuid.api` | `<api validation token>` | TLS cert validation for api |
| TXT | `asuid.lookup` | `<lookup validation token>` | TLS cert validation for lookup |

Static Web Apps don't need the TXT (they use cname-delegation —
the CNAME alone proves ownership). Container Apps need the
explicit TXT.

## Verification commands

After each subdomain is wired up:

```bash
# DNS resolves
dig +short CNAME app.skintyee.ca
dig +short CNAME lookup-app.skintyee.ca
dig +short CNAME api.skintyee.ca
dig +short CNAME lookup.skintyee.ca

# Sites respond over HTTPS
curl -sI https://app.skintyee.ca | head -2
curl -sI https://lookup-app.skintyee.ca | head -2
curl -sI https://api.skintyee.ca/v1/health | head -2
curl -sI https://lookup.skintyee.ca/health | head -2

# Cert validity (renew automatically every ~60 days; confirm chain)
echo | openssl s_client -connect app.skintyee.ca:443 -servername app.skintyee.ca 2>/dev/null \
  | openssl x509 -noout -issuer -subject -dates
```

## Troubleshooting

**"Validation failed" or stuck in "Validating" status (SWA)**
- DNS hasn't propagated yet — `dig +short CNAME <subdomain>` from
  multiple resolvers; wait 5–15 more minutes.
- The CNAME value is slightly off — re-check the exact value
  returned by `az staticwebapp hostname set`. Trailing dots get
  added by GoDaddy automatically, but the rest must match
  character-for-character.

**Container Apps `bind` errors with "validation token mismatch"**
- The TXT record at `asuid.<subdomain>` doesn't match what Azure
  generated. Re-run `az containerapp hostname add` and copy the
  current token (it may have rotated).

**`https://<subdomain>` returns the default Azure page instead of
our app**
- DNS resolves but the custom-domain isn't bound to the resource
  yet. Run the `bind` command (Container Apps) or wait for
  "Validated" status (SWA).

**Cert renewal fails 60 days later**
- The CNAME must still point at the original Azure target.
  Replacing the SWA / Container App and not updating GoDaddy is
  the usual cause. The setup scripts intentionally use stable
  default hostnames within a resource lifecycle, so this is rare.

## See also

- [`domains.md`](./domains.md) — domain registration + registrar-side practices
- [`dns-hosting-tradeoff.md`](./dns-hosting-tradeoff.md) — why DNS stays at GoDaddy
- [`../365/setup-skintyee-ca-email.md`](../365/setup-skintyee-ca-email.md) — M365 email records (different beast — MX/SPF/DKIM/DMARC instead of CNAMEs)
- [`../devops/deployment-plan.md`](../devops/deployment-plan.md) — ADR-10 + the full backend deploy plan; includes the custom-domain step at the bottom of Phase 1
- [`../devops/app-deploy-web.md`](../devops/app-deploy-web.md) — ADR-12 + the SWA setup details
- [`../devops/deploy-architecture.md`](../devops/deploy-architecture.md) — bird's-eye map of every deploy target
