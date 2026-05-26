# Building + distributing the Skin Tyee app via EAS Build

The community app (`app/` — React Native + Expo) builds and distributes
through **EAS Build** (Expo's hosted build service), orchestrated by
**Azure Pipelines**. No macOS / Android build agent runs locally —
Expo's hardware compiles the native binaries; ADO just kicks off the
job and tracks status.

Companion to [`deployment-plan.md`](./deployment-plan.md) (which
covers the backend services). Together they cover every deploy
surface the monorepo has.

## Why EAS Build instead of fastlane

The decision + trade-off comparison vs full fastlane is in
[`ADR-11`](../architecture-decisions.md). Short version: EAS is the
Expo-native path (one config covers iOS + Android, free tier covers
30 builds/mo, no macOS agent to maintain, certs handled by Expo).
The `props-apps` projects use full fastlane because they're Capacitor
apps with a permanent `ios/App/App.xcodeproj` — different toolchain,
different idiom.

## Pieces in this repo

| File | Purpose |
|---|---|
| [`app/eas.json`](../../app/eas.json) | Build profiles (development / preview / production) + submit config |
| [`azure-pipelines/Builds/build-app.yml`](../../azure-pipelines/Builds/build-app.yml) | ADO pipeline — kicks off `eas build` (and optionally `eas submit`) |
| [`scripts/setup-eas-app.sh`](../../scripts/setup-eas-app.sh) | One-time setup automation |

## Build profiles

Each profile in `eas.json` corresponds to a use case:

| Profile | Audience | Distribution | API URL baked into the build | iOS quirk |
|---|---|---|---|---|
| **development** | Internal dev (you) | Internal (Expo Go-style dev client) | `mock` (no real backend) | Builds for iOS Simulator — much faster, no signing dance |
| **preview** | TestFlight / Play Internal Testing testers | Internal (TestFlight Beta + Play closed track) | `https://api.skintyee.ca` | Real device build, signed with a real cert/profile |
| **production** | Public release | Apple App Store + Google Play | `https://api.skintyee.ca` | Increments build number automatically; `submit` step pushes to stores |

`channel:` per profile means the EAS Update mechanism can ship JS
patches separately for each (e.g., ship a bug fix to `preview` without
disturbing `production`). Not used at POC — we re-build from source for now.

## One-time setup

Run once per Expo account / tenant. Handled by the setup script.

```bash
bash scripts/setup-eas-app.sh
```

What it does:

1. **Installs eas-cli** globally if missing.
2. **`eas login`** — opens a browser; sign in with `admin@skintyee.ca`
   (or the team's shared Expo account).
3. **`eas init` in `app/`** — creates the project on expo.dev and
   writes the project id back into `app.config.js`
   (`extra.eas.projectId`).
4. **`eas credentials` for iOS + Android** — interactive walkthroughs
   that upload (or generate) signing certificates / keystores. EAS
   stores them encrypted; the build picks them up automatically.
5. **`EXPO_TOKEN`** — you generate a Personal Access Token at
   <https://expo.dev/settings/access-tokens>, paste it, and the
   script stores it as a secret variable on the ADO
   `skintyee-prod-azure` variable group.
6. **Registers the `build-app` ADO pipeline** pointing at
   `azure-pipelines/Builds/build-app.yml`.

After this, `git push azure master` (touching anything under `app/`)
triggers a build, OR you can run the pipeline manually from the ADO
UI with parameter overrides.

## What you'll need before running the setup

| | Where to get it | Cost |
|---|---|---|
| Expo account | <https://expo.dev/signup> | Free |
| Apple Developer Program | <https://developer.apple.com/programs/> | **$99 USD/yr** — required for iOS distribution |
| App Store Connect app record | <https://appstoreconnect.apple.com> → My Apps → + → bundle ID `ca.skintyee.app` | Included with developer membership |
| Google Play Console account | <https://play.google.com/console> | **$25 USD one-time** |
| Google Play app record | Create app in Play Console with package name `ca.skintyee.app` | Included |
| Service Account JSON for Play API | Play Console → Settings → Developer account → API access → create service account → download JSON | Free |

Everything else (signing certs, provisioning profiles, keystores) EAS
either generates for you or accepts via the `eas credentials` flow.

## Day-to-day: triggering a build

### From a push

Pushing to `master` with any change under `app/` automatically
triggers `build-app` with the default parameters (profile=preview,
platform=all, submitToStores=false, waitForCompletion=false).

### From the ADO UI

<https://dev.azure.com/skintyeenation/devops/_build> → **build-app** → **Run pipeline**.

Customise the parameters:

| Parameter | Pick |
|---|---|
| `buildProfile` | `development` for fast iteration, `preview` for shareable testers, `production` for store-ready |
| `platform` | `all`, `ios`, or `android` |
| `submitToStores` | Only valid with `buildProfile=production`. When `true`, runs `eas submit` after the build — pushes to TestFlight + Play Internal Testing automatically. |
| `waitForCompletion` | `false` (default) — pipeline finishes fast, EAS notifies via dashboard when build completes. `true` — pipeline runs until the EAS build itself finishes (~10–30 min). |

### From your laptop (during dev)

You don't need ADO for personal experiments. From `app/`:

```bash
eas build --platform ios --profile development --non-interactive
```

Same result — runs on EAS. Just bypasses the ADO orchestration.

## Cost (POC scale)

- **EAS Build free tier:** 30 builds/month across all platforms +
  profiles, ≤ 30 min each, "medium" resource class.
- **Above that:** $1/build, or upgrade to Expo "Production" plan
  ($19/mo) for higher concurrency + priority queue.

Our POC cadence (a few testflight builds/week + occasional prod
release) sits comfortably under 30/mo. Estimate **$0/mo** for the
build infrastructure.

For comparison: a self-hosted macOS agent (the full fastlane
alternative) would need a dedicated Mac mini ($600–800 one-time) or
keep someone's laptop powered on, plus the time to maintain
Ruby + CocoaPods + Xcode versions.

## Cost (production-scale)

If/when the app graduates to "active development" with continuous
deploys:

- Expo Production plan: **$19 USD/mo** — higher concurrency, priority
  queue, no per-build fee. Worth it once we cross ~30 builds/mo.
- Apple Developer Program renewal: **$99 USD/yr** (continuous).
- Play Console: $25 USD one-time (already paid).

## Secrets + env vars

The pipeline pulls `EXPO_TOKEN` from the `skintyee-prod-azure`
variable group (secret). That's the only piece of cred it needs —
everything else (Apple cert, provisioning profile, Android keystore,
Play service account JSON) is uploaded to EAS via `eas credentials`
and lives in Expo's encrypted credential store, not in this repo or
in ADO.

### Rotation

| Secret | Lifetime | Rotation |
|---|---|---|
| `EXPO_TOKEN` | 1 year (default) | Regenerate at <https://expo.dev/settings/access-tokens>; update the ADO variable group secret |
| Apple distribution cert | 1 year | Re-run `eas credentials --platform ios` and pick "Renew certificate" |
| Android upload keystore | 25+ years | Never rotate unless compromised — losing this means Play Store won't accept new versions of the app |
| Apple App Store Connect API key | Optional, but recommended for CI submit | Re-create at App Store Connect → Users & Access → Integrations |

## Submitting to the stores

The pipeline handles this when `submitToStores=true` on a
`production`-profile build:

- **iOS:** `eas submit --platform ios --latest` pushes the most recent
  finished build to App Store Connect. From there, it's available on
  TestFlight within ~15 minutes; promoting to App Store needs a manual
  review submission.
- **Android:** `eas submit --platform android --latest --track internal`
  pushes to the Play Console "Internal Testing" track. Promoting to
  Production needs a manual promotion in Play Console.

Both go through the configured `submit.production.*` block in
`eas.json` (so make sure the placeholders in there are filled in
before the first submit).

## When you'd graduate to full fastlane

Migrate off EAS Build to self-hosted fastlane (matching `props-apps`)
when:

- Build volume sustainably exceeds **~150 builds/mo** (the price/value
  curve of Expo's Production plan tips).
- You need build-time control EAS doesn't expose — custom Xcode
  build phases, weird CocoaPods setups, third-party native modules
  that don't work in EAS's sandbox.
- You want builds to run on the band's own hardware as a matter of
  data-sovereignty policy.

None of those apply at POC scale.

## Troubleshooting

**"This app is missing the EAS project ID."**
Run `cd app && eas init` once. The script does this; if you skipped,
do it manually.

**"Invalid token." on the ADO pipeline.**
`EXPO_TOKEN` has expired or been revoked. Generate a new one at
<https://expo.dev/settings/access-tokens> and update the ADO variable
group secret.

**iOS build fails at "no provisioning profile matches".**
Re-run `eas credentials --platform ios` and pick "Use existing" or
"Generate new" as appropriate. EAS keeps the profiles in sync with
Apple's portal automatically once it's been authenticated once.

**Android build fails at "Keystore was tampered with or password
incorrect".**
You uploaded the wrong file or password during `eas credentials`. Run
it again with `--platform android` and re-upload.

**"Build queue is full"** with free tier.
Either wait (~30 minutes during peak) or upgrade to the Production
plan ($19/mo) for priority queue.

## See also

- [Expo Documentation: EAS Build](https://docs.expo.dev/build/introduction/)
- [`ADR-11`](../architecture-decisions.md) — formal record of "EAS Build over fastlane" for `app/` + `lookup/app/`
- [`deployment-plan.md`](./deployment-plan.md) — backend services (api, lookup-api) deploy plan
- [`/app/STUBS.md`](../../app/STUBS.md) — what's stubbed in the app today; what's wired up to the real API in Phase 2
- [`/app/eas.json`](../../app/eas.json) — the build profiles config
- [`props-apps` Fastfile](https://github.com/dotproperties/props-apps) (sibling project) — the full-fastlane comparison
