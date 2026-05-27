# Deploy status — where we are now

**📅 Last updated: 2026-05-26 (Steps 3, 4, 5, 6 complete — 6 of 7 setup scripts done)**

Point-in-time view of which deploy setup scripts have run + what's
blocked on what + the exact command to advance one step. Paired
with [`deploy-architecture.md`](./deploy-architecture.md), which
captures the static "everything that should exist" map; this doc
captures "what actually exists today" and updates each time a
script gets executed.

> **Last verified: 2026-05-26 (via live `az` queries against the
> `skintyeenation` org + subscription `8d847916-…`).** Update the
> date stamp above + the table below after each setup script
> completes.
>
> **Why a separate doc:** the architecture map describes a steady
> end-state. This one is a working journal — it'll show "Step 3
> done" within the week, then "Step 4 done", and so on. Two
> different lifecycles, two docs.

## The 7 setup scripts + their status

```
[ 1. setup-azure-devops.sh ]            ✅ DONE
[ 2. setup-sharepoint-pipeline.sh ]     ✅ DONE
[ 3. setup-api-azure.sh ]               ✅ DONE (2026-05-26)
[ 4. setup-lookup-azure.sh ]            ✅ DONE (2026-05-26)
[ 5. setup-app-web-azure.sh ]           ✅ DONE (2026-05-26)
[ 6. setup-lookup-app-web-azure.sh ]    ✅ DONE (2026-05-26)
[ 7. setup-eas-app.sh ]                 ⏸  YOU ARE HERE
                                            (needs Apple Developer +
                                            Play Console accounts
                                            first — see prereqs)
```

### Detail per step

| # | Script | Status | Evidence (live verification commands) |
|---|---|---|---|
| 1 | `setup-azure-devops.sh` | ✅ Done | `az devops project list --org https://dev.azure.com/skintyeenation` shows `devops`; `az repos show ... --repository webfront` returns the repo |
| 2 | `setup-sharepoint-pipeline.sh` | ✅ Done | `publish-docs-to-sharepoint` pipeline registered + green runs; SC `sharepoint-docs-sc`; variable group `sharepoint-docs`; Entra apps `it-project-docs-publisher` (`0d6f0c13-…`) + `skintyeenation-admin-cli` (`cc85d6bc-…`) |
| 3 | `setup-api-azure.sh` | ✅ Done (2026-05-26) | All 11 artifacts verified: RG `skintyee-prod-rg` ✓ · ACR `skintyeeprodacr.azurecr.io` ✓ · Postgres `skintyee-prod-pg` (B1ms + PostGIS + `api` DB + AllowAzureServices firewall) ✓ · Container Apps env `skintyee-prod-env` ✓ · Container App `api-prod` at `api-prod.mangoglacier-ce3e1265.canadacentral.azurecontainerapps.io` (scale 0→3) ✓ · Entra app `skintyee-prod-deploy` (`cb91f9d8-…`) with AcrPush + Contributor roles ✓ · ADO SC `skintyee-prod-azure` ✓ · ADO variable group `skintyee-prod-azure` (id 2) ✓ · Pipeline `deploy-api` (id 2) registered ✓ |
| 4 | `setup-lookup-azure.sh` | ✅ Done (2026-05-26) | Container App `lookup-prod` (min 1, max 3) at `lookup-prod.mangoglacier-ce3e1265.canadacentral.azurecontainerapps.io` · AcrPull granted to lookup MI · deploy SP has Contributor on lookup-prod · `LOOKUP_CONTAINERAPP=lookup-prod` added to the shared variable group · Pipeline `deploy-lookup` (id 3) registered · **ANTHROPIC_API_KEY skipped** at setup; add anytime via `bash scripts/set-lookup-api-key.sh` |
| 5 | `setup-app-web-azure.sh` | ✅ Done (2026-05-26) | Static Web App `skintyee-prod-app` (Free) at `jolly-field-07345350f.7.azurestaticapps.net` · `SWA_DEPLOYMENT_TOKEN` (secret) + `GOOGLE_MAPS_API_KEY` placeholder added to the variable group · Pipeline `deploy-app-web` (id 4) registered. ⚠ Replace the `GOOGLE_MAPS_API_KEY` placeholder before the first build — see follow-ups below. |
| 6 | `setup-lookup-app-web-azure.sh` | ✅ Done (2026-05-26) | Static Web App `skintyee-prod-lookup-app` (Free) at `nice-cliff-08511a80f.7.azurestaticapps.net` · `LOOKUP_APP_SWA_DEPLOYMENT_TOKEN` (secret) added to the variable group · Pipeline `deploy-lookup-app-web` (id 5) registered. |
| 7 | `setup-eas-app.sh` | ❌ Not run — **next step** | No `EXPO_TOKEN` in any variable group; `app/` has no EAS project ID in `app.config.js`. Requires Apple Developer Program + Play Console enrollment first. |

## Exact next command

```bash
bash scripts/setup-eas-app.sh
```

Step 7 is interactive — opens a browser to sign into Expo, walks
through `eas init` + `eas credentials` for iOS + Android. Apple
Developer Program ($99 USD/yr) + Play Console account ($25 USD
one-time) must be enrolled and have app records created (bundle
ID `ca.skintyee.app`) before this can complete the credentials
step.

If those aren't ready yet, this step can be deferred indefinitely
— the web pipeline (`deploy-app-web`) handles the app's web
target, so the native build pipeline is only blocking iOS / Android
distribution to TestFlight + Play Store. Nothing breaks if Step 7
sits at ⏸ for weeks.

## Pending follow-ups from Steps 3–6 (not blocking Step 7)

Small tasks accumulated; do them whenever convenient. Each
unblocks the corresponding first-deploy pipeline run.

| Task | One-liner |
|---|---|
| Add `ANTHROPIC_API_KEY` to `lookup-prod` (deferred at Step 4) | `ANTHROPIC_API_KEY='sk-...' bash scripts/set-lookup-api-key.sh` |
| Replace `GOOGLE_MAPS_API_KEY` placeholder (added by Step 5) | `az pipelines variable-group variable update --org https://dev.azure.com/skintyeenation --project devops --group-id 2 --name GOOGLE_MAPS_API_KEY --secret true --value '<paste from 1Password>'` |
| Wire `api.skintyee.ca` custom domain | ✅ Done (2026-05-26) — TXT `asuid.api` + CNAME `api → api-prod.mangoglacier-…` in GoDaddy; bound to Container App `api-prod` with managed TLS cert (`mc-skintyee-prod--api-skintyee-ca-2049`, DigiCert-rooted, auto-renew). Real api code deployed via `deploy-api` run #44 (image `api:eccfd9b`). `https://api.skintyee.ca/v1/health` → HTTP 200. |
| Wire `lookup-api.skintyee.ca` custom domain | ✅ Done (2026-05-26) — TXT `asuid.lookup-api` + CNAME `lookup-api → lookup-prod.mangoglacier-…` in GoDaddy; bound to Container App `lookup-prod` with managed TLS cert (`mc-skintyee-prod--lookup-api-skint-7909`, DigiCert-rooted, auto-renew). Placeholder image responds empty until first `deploy-lookup` run replaces it. |
| Wire `app.skintyee.ca` custom domain | ✅ Done (2026-05-26) — CNAME `app → jolly-field-07345350f.7.azurestaticapps.net` in GoDaddy; SWA hostname `Ready`; managed TLS cert issued (DigiCert-rooted, auto-renew). Expo web bundle deployed via `deploy-app-web` run #47 (commit `192352c`). `https://app.skintyee.ca` → HTTP 200, `<title>Skin Tyee</title>`. |
| Wire `lookup.skintyee.ca` custom domain | ✅ Done (2026-05-26) — CNAME `lookup → nice-cliff-08511a80f.7.azurestaticapps.net` in GoDaddy (re-pointed from CA to SWA target); SWA `skintyee-prod-lookup-app` hostname `Ready`; managed TLS cert issued (DigiCert-rooted, auto-renew). `https://lookup.skintyee.ca` → HTTP 200 (SWA default until first `deploy-lookup-app-web` run). |
| Save Postgres password to 1Password (IT/Admin vault) | Out of band — script already wrote it to the ADO variable group as `PG_PASSWORD` (secret); 1Password is the durable backup copy |
| First deploy of `api/` | ✅ Done (2026-05-26) — `deploy-api` run #44 succeeded on commit `eccfd9b` (125s end-to-end: ACR build + push + revision swap + smoke test). Auto-triggers on push to `api/**`. |
| First deploy of `lookup/api/` | ✅ Done (2026-05-26) — `deploy-lookup` run #53 succeeded on commit `56d17b7` (154s end-to-end). `/api/health` → 200. Auto-triggers on push to `lookup/api/**`. |
| First deploy of `app/` web | ✅ Done (2026-05-26) — `deploy-app-web` run #47 succeeded on commit `192352c` (32s: pnpm + expo export:web + SWA upload). Auto-triggers on push to `app/**`. |
| First deploy of `lookup/app/` web | ✅ Done (2026-05-26) — `deploy-lookup-app-web` run #52 succeeded on commit `ca37bc6` (~110s: pnpm + expo export:web + SWA upload). `<title>Skin Tyee Lookup</title>` served. Auto-triggers on push to `lookup/app/**`. |

What it provisions (~10 min, Postgres is the slow part):

- Resource group `skintyee-prod-rg`
- ACR `skintyeeprodacr` (Basic SKU)
- Postgres Flexible Server `skintyee-prod-pg` (B1ms + PostGIS, db `api`) — **prompts for admin password mid-flow**, save to 1Password IT/Admin vault
- Container Apps environment `skintyee-prod-env`
- Container App `api-prod` (placeholder image; pipeline replaces it on first push)
- Entra app `skintyee-prod-deploy` + AcrPush + Container App Contributor role assignments + federated credential for ADO
- ADO service connection `skintyee-prod-azure` (federated, no secrets)
- ADO variable group `skintyee-prod-azure` with resource names
- ADO pipeline `deploy-api` registered (off `azure-pipelines/Deployments/deploy-api.yml`)

After Step 3 completes, update the status table at the top of this
file to ✅ Done, push, and Steps 4 + 5 unblock.

## What each subsequent step does

(Brief summaries — full plans in
[`deployment-plan.md`](./deployment-plan.md) for #3–#6 and
[`app-deploy-eas.md`](./app-deploy-eas.md) for #7.)

| # | After running it | Cost (CAD/mo) added |
|---|---|---|
| 3 | `api-prod` Container App + Postgres + ACR + the shared deploy infra are live; first `git push` touching `api/**` triggers `deploy-api` pipeline | ~$25 |
| 4 | `lookup-prod` Container App live with always-on min-1-replica + ANTHROPIC_API_KEY secret; first `git push` touching `lookup/api/**` triggers `deploy-lookup` | ~$13 |
| 5 | `app.skintyee.ca` Static Web App (community app web) live; PRs touching `app/**` get auto-deployed preview URLs | $0 (Free tier) |
| 6 | `lookup.skintyee.ca` Static Web App live; same PR-preview workflow | $0 (Free tier) |
| 7 | `build-app` pipeline registered; native iOS + Android builds via EAS Build when pushed | $0 (≤30 builds/mo Free tier) |

## Parallel tracks (independent of #3–#7)

These can be done any time, in any order:

| Track | Status | Doc |
|---|---|---|
| **GoDaddy DNS — M365 email records** (MX, SPF, DKIM, autodiscover, DMARC at `@skintyee.ca`) | ✅ Done (2026-05-26) — verify with `dig +short MX skintyee.ca` | [`../365/setup-skintyee-ca-email.md`](../365/setup-skintyee-ca-email.md) |
| **GoDaddy DNS — service subdomain CNAMEs** (`api`, `app`, `lookup`, `lookup-app`) | ⬜ Pending — wait until each service's Azure resource exists (after Steps 3–6) | [`../godaddy/subdomains-for-azure-services.md`](../godaddy/subdomains-for-azure-services.md) |
| **Delete leaked client secret** on `it-project-docs-publisher` (KeyId `381663c1-…`) | ⬜ Pending — federated path doesn't use it; safe to delete | One-line: `az ad app credential delete --id 0d6f0c13-86a7-4057-801b-a3ec8eb40082 --key-id 381663c1-d314-4991-9289-27694958c892` |
| **Apple Developer Program enrollment** ($99 USD/yr) | ⬜ Pending — prerequisite for Step 7's iOS distribution | [`app-deploy-eas.md § What you'll need`](./app-deploy-eas.md) |
| **Google Play Console enrollment** ($25 USD one-time) | ⬜ Pending — prerequisite for Step 7's Android distribution | same as above |

## How to update this doc

After running a setup script (or completing a parallel-track item):

1. Verify with the relevant `az` query (see the "Evidence" column).
2. Flip the row's status in the table at the top to ✅ Done.
3. Update the "Last verified" date at the top.
4. Commit + push: `git commit -m "docs(deploy-status): step N complete"`.

Keeping this doc current is the cheapest way to know "where are
we?" without `az group list`-ing everything every time.

## See also

- [`deploy-architecture.md`](./deploy-architecture.md) — the
  bird's-eye map of every deploy target (steady-state, doesn't change)
- [`deployment-plan.md`](./deployment-plan.md) — ADR-10 + Container
  Apps deploy plan for `api/` + `lookup/api/`
- [`app-deploy-eas.md`](./app-deploy-eas.md) — ADR-11 + EAS Build
  plan for the native app
- [`app-deploy-web.md`](./app-deploy-web.md) — ADR-12 + Static Web
  Apps plan for both apps' web targets
- [`sharepoint-pipeline-postmortem.md`](./sharepoint-pipeline-postmortem.md)
  — what went wrong setting up Step 2; the lessons are baked into
  Steps 3–7's setup scripts
- [`../godaddy/dns-hosting-tradeoff.md`](../godaddy/dns-hosting-tradeoff.md)
  — decision to stay at GoDaddy DNS through the POC
- [`../godaddy/subdomains-for-azure-services.md`](../godaddy/subdomains-for-azure-services.md)
  — exact GoDaddy records to add as each service stands up
- [`../365/setup-skintyee-ca-email.md`](../365/setup-skintyee-ca-email.md)
  — exact GoDaddy records to add to make M365 email work
