import Constants from 'expo-constants';

const extra = (Constants?.expoConfig?.extra ?? {}) as Record<string, unknown>;

/**
 * App configuration. The diagram targets a future API Server → Azure Cloud DB
 * reachable at App.SkinTyee.ca. Until that exists, `apiServer` is 'mock' and all
 * data is served from src/services/api/mock. See STUBS.md.
 */
const apiServer = (extra.apiServer as string) ?? 'mock';

// True when the app is talking to the production api host
// (api.skintyee.ca). Drives prod-only gates — e.g. the dev Role
// Switcher hides in prod so real users can't spoof admin.
// Anything else (mock, localhost, staging) counts as non-prod.
const isProd = (() => {
  try {
    return /(^|\.)api\.skintyee\.ca$/i.test(new URL(apiServer).hostname);
  } catch {
    return false;
  }
})();

const Config = {
  // 'mock' selects the in-memory mock ApiService. An http(s) URL selects
  // HttpApiService pointed at that base URL + /v1/*.
  apiServer,
  isProd,
  appName: 'Skin Tyee',
  // Microsoft Entra sign-in (PUBLIC values; public-client + PKCE means
  // there's no client_secret to protect — safe in the client bundle).
  signinAppId:    (extra.signinAppId    as string) ?? '',
  signinTenantId: (extra.signinTenantId as string) ?? '',
  // Google Maps JS API key (web location picker). Read from the environment via
  // app.config.js — never hardcoded/committed. Empty -> picker shows a fallback.
  googleMapsApiKey: (extra.googleMapsApiKey as string) ?? '',
  // Remote-desktop (.rdp) generation. `rdpDomainSuffix` is the AD domain
  // appended to a bare PC name; `rdpGatewayHost` (empty = LAN/VPN reach) adds RD
  // Gateway fields when set. See docs/features/remote-desktop-and-device-telemetry.md.
  rdpDomainSuffix: (extra.rdpDomainSuffix as string) ?? 'stfn.local',
  rdpGatewayHost:  (extra.rdpGatewayHost  as string) ?? '',
};

export default Config;
