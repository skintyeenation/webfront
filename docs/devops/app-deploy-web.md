# Deploying the Expo apps to web

The monorepo has **two** Expo apps with different deploy needs:

| App | Source dir | Target(s) | Native (App / Play Store)? | Web URL | Web pipeline |
|---|---|---|---|---|---|
| **Community app** | [`app/`](../../app/) | iOS + Android **and** web | Yes — TestFlight + Play | `app.skintyee.ca` | [`deploy-app-web.yml`](../../azure-pipelines/Deployments/deploy-app-web.yml) |
| **Lookup app** | [`lookup/app/`](../../lookup/app/) | **Web only** | No (lookup tool runs in browser, no store distribution) | `lookup.skintyee.ca` | [`deploy-lookup-app-web.yml`](../../azure-pipelines/Deployments/deploy-lookup-app-web.yml) |

This doc covers the **web target for both apps**. The native side
(community-app only) is covered by [`app-deploy-eas.md`](./app-deploy-eas.md).

Both web pipelines watch their respective source tree (`app/**` →
`deploy-app-web`; `lookup/app/**` → `deploy-lookup-app-web`); pushes
trigger whichever applies. PR previews work for both.

Output of `expo export --platform web` is the same shape for either
app — a self-contained static bundle in `dist/` that Azure Static
Web Apps serves verbatim.

## Why Azure Static Web Apps

Companion decision to [ADR-11](../architecture-decisions.md) (EAS for
native); the web target is **ADR-12**.

| Option | Cost | Trade-off |
|---|---|---|
| **Azure Static Web Apps (Free)** ← chosen | $0 (100 GB/mo bandwidth, 0.5 GB storage, free TLS, free CDN, free PR-preview URLs) | Free tier limits; tier-up to Standard ($9/mo) if you grow past them |
| Azure Storage Static Website | ~$0.50/mo for storage + bandwidth | No built-in TLS / CDN — you'd front it with Azure Front Door (more $$) |
| Azure App Service (Static) | ~$13+/mo (B1) | Built for dynamic, overspec'd for static |
| Container Apps with nginx | ~$5+/mo | Total overkill for static content |
| Vercel / Netlify | Free tier comparable | External vendor; we already have an Azure tenant |

Static Web Apps gives us free PR-preview URLs (every PR to master
gets its own staging URL automatically — no extra config), the CDN
caches globally, and TLS for custom domains is free + auto-renewed.

## Pieces in this repo

| File | Purpose |
|---|---|
| [`azure-pipelines/Deployments/deploy-app-web.yml`](../../azure-pipelines/Deployments/deploy-app-web.yml) | Builds `app/` for web → deploys to SWA at `app.skintyee.ca` |
| [`azure-pipelines/Deployments/deploy-lookup-app-web.yml`](../../azure-pipelines/Deployments/deploy-lookup-app-web.yml) | Builds `lookup/app/` for web → deploys to SWA at `lookup.skintyee.ca` |
| [`scripts/setup-app-web-azure.sh`](../../scripts/setup-app-web-azure.sh) | One-time setup for the community-app SWA (`skintyee-prod-app`) |
| [`scripts/setup-lookup-app-web-azure.sh`](../../scripts/setup-lookup-app-web-azure.sh) | One-time setup for the lookup-app SWA (`skintyee-prod-lookup-app`) |

Both setup scripts share the same shape — different SWA resource
name, different custom domain, different secret name in the
variable group (`SWA_DEPLOYMENT_TOKEN` for community app,
`LOOKUP_APP_SWA_DEPLOYMENT_TOKEN` for lookup).

## One-time setup

Run after `scripts/setup-api-azure.sh` (which provisions the shared
resource group + variable group):

```bash
bash scripts/setup-app-web-azure.sh
```

What it does:
1. Creates the Static Web App resource `skintyee-prod-app` (Free SKU)
   in `eastus2` (SWA's nearest available region for our Canada-Central
   stack — Microsoft routes through their global CDN regardless).
2. Retrieves the SWA deployment token and stores it as
   `SWA_DEPLOYMENT_TOKEN` (secret) in the existing
   `skintyee-prod-azure` variable group.
3. Adds `GOOGLE_MAPS_API_KEY` as a placeholder secret (the script
   prints the command to update it with the real key from 1Password).
4. Registers the `deploy-app-web` ADO pipeline.

After the script, you do **one manual step**: bind the custom domain
`app.skintyee.ca`. The script prints the exact `az staticwebapp
hostname set` command + the CNAME record to add in Azure DNS.

## Day-to-day

### Push triggers a deploy

Any push to `master` touching `app/**` (or the pipeline YAML)
triggers `deploy-app-web`. Build + deploy is usually under 3 minutes.

### Pull requests get preview URLs

Open a PR that touches `app/**` → SWA automatically deploys a staging
build to a unique URL like:

```
https://skintyee-prod-app-<random>-<region>.azurestaticapps.net
```

The ADO pipeline run posts the URL as a comment on the PR. Useful for:
- Design review without affecting prod
- QA on the actual built artefact, not just dev mode
- Stakeholder demos

PR previews are torn down automatically when the PR is closed or
merged. Free tier supports up to 10 simultaneous PR previews.

### Manual trigger from ADO UI

<https://dev.azure.com/skintyeenation/devops/_build> → **deploy-app-web** → **Run pipeline**.

## Web-vs-native differences to be aware of

Expo's web target is a **best-effort compatibility layer**, not a 1:1
runtime. Things that don't translate:

- **React Native modules with no web equivalent** — e.g., native
  camera access works on iOS/Android but uses the browser's
  `getUserMedia` API on web (often with different behavior). Test
  every feature you ship on web specifically.
- **Push notifications** — different stack on web (Web Push API vs
  APNS/FCM). Not currently wired up; if added, separate code paths
  per platform.
- **App-store-only features** — in-app-purchases, native biometrics,
  device-specific sensors. Web build degrades gracefully when these
  are gated by `Platform.OS !== 'web'`.

In practice for the POC: the dashboards, directory, polls, and
publicly-visible records pages all work fine on web. Use
`Platform.OS === 'web'` in `app/src/` to fork behavior when needed.

## Build env (production web)

The pipeline injects:

| Env var | Value | Why |
|---|---|---|
| `EXPO_PUBLIC_API_SERVER` | `https://api.skintyee.ca` | Points the web build at the prod API |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | From `GOOGLE_MAPS_API_KEY` secret in `skintyee-prod-azure` variable group | The location picker + map pins |

`EXPO_PUBLIC_*` env vars are baked into the JS bundle at build time
(public — assume any value here is visible in the browser DevTools).
The Maps key should be **referrer-restricted** in Google Cloud Console
to only allow loads from `https://app.skintyee.ca` so it can't be
abused by other origins.

## Cost projection

- **Static Web App Free tier** — $0/mo, includes:
  - 100 GB bandwidth/mo
  - 0.5 GB storage (the built app is ~5–10 MB compressed)
  - 2 custom domains
  - Free TLS + global CDN
  - Up to 10 PR-preview URLs
- **Standard tier upgrade** — $9 USD/mo if needed:
  - 100 GB bandwidth/mo *included*, $0.20/GB above
  - 0.5 GB storage *included*, $0.20/GB above
  - 5 custom domains
  - Bring-your-own functions backend (we don't need this — API is on
    Container Apps)

For POC + early production, **Free tier** is sufficient. Reassess if
the site gets popular: 100 GB/mo at average page weight ~2 MB
supports ~50,000 unique-visit sessions/mo.

## Total stack with web included

| Service | Hosting | Cost (POC, $/mo CAD) |
|---|---|---|
| `api/` | Azure Container Apps | $0–10 |
| `lookup/api/` | Azure Container Apps (min 1 replica) | ~$13 |
| `app/` (web) | **Azure Static Web Apps Free** | **$0** |
| `app/` (native) | EAS Build → TestFlight + Play | $0 |
| Postgres for api | B1ms Flexible Server | ~$18 |
| ACR | Basic | ~$7 |
| Azure DNS | existing zone | ~$1 |
| Blob storage | 10 GB | ~$0.30 |
| **Total** | | **~$40–55/mo CAD** |

Adding web hosting bumps the total by **$0** at POC scale.

## Custom domain + TLS

The setup script prints the manual step for binding `app.skintyee.ca`:

```bash
az staticwebapp hostname set \
  --resource-group skintyee-prod-rg --name skintyee-prod-app \
  --hostname app.skintyee.ca \
  --validation-method cname-delegation
```

Then add a CNAME in Azure DNS:

```
app   →   <swa-default-hostname>.azurestaticapps.net
```

Within ~5 minutes Azure mints + binds the TLS cert. No further action;
cert renewal is automatic.

## See also

- [`app-deploy-eas.md`](./app-deploy-eas.md) — native iOS / Android (TestFlight + Play)
- [`deployment-plan.md`](./deployment-plan.md) — backend services + the overall Azure-compute decisions
- [Expo Web Documentation](https://docs.expo.dev/workflow/web/)
- [Azure Static Web Apps Pricing](https://azure.microsoft.com/en-ca/pricing/details/app-service/static/)
- [`ADR-11`](../architecture-decisions.md) — EAS Build (native)
- [`ADR-12`](../architecture-decisions.md) — Azure Static Web Apps (web)
