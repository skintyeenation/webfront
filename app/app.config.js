// Load a local .env (gitignored) so secrets like the Maps key persist across
// runs without being committed or passed on the command line.
try {
  require('dotenv').config();
} catch (e) {
  // dotenv not installed — env must come from the shell instead.
}

module.exports = {
  expo: {
    name: 'Skin Tyee',
    slug: 'skintyee-app',
    scheme: 'skintyee',
    version: '0.0.0',
    userInterfaceStyle: 'dark',
    // App icon / splash art still TBD (no native artwork yet — see STUBS.md).
    // The web favicon IS wired up below (web.favicon) using the Skin Tyee
    // mark padded square and downscaled from the splash/header asset.
    splash: {
      resizeMode: 'contain',
      backgroundColor: '#1e1e1e',
    },
    web: {
      favicon: './assets/favicon.png',
    },
    updates: {
      fallbackToCacheTimeout: 0,
    },
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: true,
      // STUB: placeholder bundle id — replace before any real build/submission.
      bundleIdentifier: 'ca.skintyee.app',
    },
    android: {
      // STUB: placeholder package name — replace before any real build/submission.
      package: 'ca.skintyee.app',
    },
    extra: {
      // The api/ base URL. Production: https://api.skintyee.ca. Local dev:
      // 'http://localhost:4000' to hit `pnpm --filter @skintyee/api dev`.
      // 'mock' selects the in-memory MockApiService.
      //
      // A *desktop* build (ELECTRON_BUILD=1) is a real, distributed artifact —
      // it must never silently fall back to 'mock' (that strands sign-in role
      // lookups on deriveRoleLocally, so an admin shows as 'member'). So when
      // EXPO_PUBLIC_API_SERVER is unset, desktop builds default to the prod API
      // while web/dev keep the 'mock' fallback. Override the env to point a
      // desktop build elsewhere (e.g. localhost:4000 / staging).
      apiServer:
        process.env.EXPO_PUBLIC_API_SERVER ||
        (process.env.ELECTRON_BUILD === '1' ? 'https://api.skintyee.ca' : 'mock'),
      // Microsoft Entra sign-in. The appId + tenantId are PUBLIC values
      // (no secret — public client + PKCE). Defaults are the production
      // skintyeenation tenant + skintyee-app-signin Entra app provisioned
      // by scripts/setup-app-signin.sh.
      signinAppId:    process.env.EXPO_PUBLIC_SIGNIN_APP_ID    || 'd0bf0488-20b1-4b6d-a03e-fca253c3968f',
      signinTenantId: process.env.EXPO_PUBLIC_SIGNIN_TENANT_ID || 'ee46daed-e89f-4438-b1f7-dc26203a4bec',
      // Google Maps JS API key for the location picker. Read from the env at
      // startup — keep the real key in an (untracked) .env / shell, not in git.
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '',
      // Remote-desktop (.rdp) generation for Assets → Devices. The AD domain
      // suffix appended to a bare PC name (STFN.local), and an optional RD
      // Gateway host — set it to switch the same button from LAN/VPN reach to
      // secure remote access over TLS/443. See
      // docs/features/remote-desktop-and-device-telemetry.md.
      rdpDomainSuffix: process.env.EXPO_PUBLIC_RDP_DOMAIN_SUFFIX || 'stfn.local',
      rdpGatewayHost: process.env.EXPO_PUBLIC_RDP_GATEWAY_HOST || '',
    },
  },
};
