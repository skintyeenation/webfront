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
    // STUB (assets): no app icon / splash art yet, so the icon/splash/favicon
    // fields are intentionally omitted and Expo's defaults are used. Add artwork
    // to assets/ and re-add icon/splash/adaptiveIcon/favicon here. See STUBS.md.
    splash: {
      resizeMode: 'contain',
      backgroundColor: '#1e1e1e',
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
      // 'mock' selects the in-memory MockApiService (default fallback).
      apiServer: process.env.EXPO_PUBLIC_API_SERVER || 'mock',
      // Microsoft Entra sign-in. The appId + tenantId are PUBLIC values
      // (no secret — public client + PKCE). Defaults are the production
      // skintyeenation tenant + skintyee-app-signin Entra app provisioned
      // by scripts/setup-app-signin.sh.
      signinAppId:    process.env.EXPO_PUBLIC_SIGNIN_APP_ID    || 'd0bf0488-20b1-4b6d-a03e-fca253c3968f',
      signinTenantId: process.env.EXPO_PUBLIC_SIGNIN_TENANT_ID || 'ee46daed-e89f-4438-b1f7-dc26203a4bec',
      // Google Maps JS API key for the location picker. Read from the env at
      // startup — keep the real key in an (untracked) .env / shell, not in git.
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '',
    },
  },
};
