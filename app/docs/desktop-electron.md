# Desktop app (Electron)

The Skin Tyee app ships to desktop by **wrapping the existing `react-native-web`
build in Electron** — not by running native React Native inside Electron (there
is no RN runtime in Electron; it's Chromium + Node). The web target already
exists (`@expo/webpack-config` → `web-build/`), and the device features the app
uses already branch for web (receipt capture uses `getUserMedia` + `<input
type=file>` in `app/src/core/receiptCapture.ts`), so the wrap is clean.

## Layout

```
app/
  electron/
    main.js       # Electron main process (window, loads web bundle, perms)
    preload.js    # minimal bridge (contextIsolation on)
  webpack.config.js   # ELECTRON_BUILD=1 → relative asset paths (for file://)
  package.json        # electron + electron-builder devDeps, scripts, "build"
azure-pipelines/
  Builds/build-desktop.yml             # per-OS matrix build → SharePoint
  templates/desktop-build-steps.yml    # shared build steps
scripts/
  publish-desktop-to-sharepoint.sh     # uploads installers, prints links
```

## Why the `ELECTRON_BUILD` flag

`@expo/webpack-config` emits **absolute** asset paths (`/static/…`), which 404
under Electron's `file://`. `webpack.config.js` sets `output.publicPath = './'`
only when `ELECTRON_BUILD=1`, so the **Azure Static Web Apps** web deploy keeps
absolute paths and is unaffected.

## Run / build locally

```bash
# Dev — run the Expo web dev server, then the Electron shell pointed at it:
pnpm --filter @skintyee/app web            # terminal 1 (http://localhost:19006)
pnpm --filter @skintyee/app desktop:dev    # terminal 2

# Package installers for this OS (outputs to app/desktop-dist/):
pnpm --filter @skintyee/app desktop:build:linux   # AppImage + .deb
pnpm --filter @skintyee/app desktop:build:win     # NSIS .exe
pnpm --filter @skintyee/app desktop:build:mac     # .dmg (macOS host only)
```

The build bakes in `EXPO_PUBLIC_API_SERVER` (defaults to `https://api.skintyee.ca`
in CI) just like the web deploy.

## Cross-platform / where each target can build

| Target | Output | Build host |
|---|---|---|
| **Linux** | `.AppImage`, `.deb` | any Linux agent |
| **Windows** | NSIS `.exe` | a Windows agent (native; or Linux+Wine, but native is simpler/safer) |
| **macOS** | `.dmg` | **must** be a macOS agent (Apple toolchain for signing/notarization) |

The CI pipeline uses a **per-OS matrix**: a Linux job (AppImage/deb), a Windows
job (.exe), and an **opt-in** macOS job (`buildMac` parameter, needs a macOS
pool).

## CI + SharePoint publishing

`azure-pipelines/Builds/build-desktop.yml` (manual trigger):

1. **build** stage — each OS job runs `expo export:web` (ELECTRON_BUILD) →
   `electron-builder --<platform>` → publishes the installers as a pipeline
   artifact.
2. **publish** stage — downloads all artifacts, mints an app-only Graph token
   via the **`sharepoint-docs-sc`** service connection (workload identity
   federation — same as the docs publisher), and runs
   `scripts/publish-desktop-to-sharepoint.sh`, which uploads each installer to
   **SharePoint** under `webfront/desktop/<BuildNumber>/` using Graph **upload
   sessions** (required for files >4 MB) and prints a **download link** per file.

Reuses the existing `sharepoint-docs` variable group (`SHAREPOINT_SITE_ID`,
`SHAREPOINT_DRIVE_NAME`). To publish from a local build instead:

```bash
SHAREPOINT_SITE_ID=… SHAREPOINT_DRIVE_NAME=Documents \
AZURE_TENANT_ID=… AZURE_CLIENT_ID=… AZURE_CLIENT_SECRET=… \
bash scripts/publish-desktop-to-sharepoint.sh
```

## Known caveats / follow-ups

- **Microsoft sign-in (MSAL/Entra).** Header-role + the prod HTTPS API work from
  Electron. Interactive Entra sign-in uses redirect URIs tied to an origin;
  under `file://` that needs a custom-scheme/loopback redirect registered on the
  app registration. Not wired in this scaffold — a follow-up if desktop needs
  full SSO. (Dev role-switcher + token-based flows are unaffected.)
- **Code signing.** Unsigned Windows installers trip SmartScreen; macOS needs
  Apple notarization. Add an OV/EV cert (Windows) and an Apple Developer cert
  (mac) when distributing widely.
- **Auto-update.** Not configured. electron-builder supports `electron-updater`
  against a feed (could point at the same SharePoint/Blob) — future work.
