import Constants from 'expo-constants';

const extra = (Constants?.expoConfig?.extra ?? {}) as Record<string, unknown>;

/**
 * App configuration. The diagram targets a future API Server → Azure Cloud DB
 * reachable at App.SkinTyee.ca. Until that exists, `apiServer` is 'mock' and all
 * data is served from src/services/api/mock. See STUBS.md.
 */
const Config = {
  // 'mock' selects the in-memory mock ApiService. An http(s) URL selects
  // HttpApiService pointed at that base URL + /v1/*.
  apiServer: (extra.apiServer as string) ?? 'mock',
  appName: 'Skin Tyee',
  // Microsoft Entra sign-in (PUBLIC values; public-client + PKCE means
  // there's no client_secret to protect — safe in the client bundle).
  signinAppId:    (extra.signinAppId    as string) ?? '',
  signinTenantId: (extra.signinTenantId as string) ?? '',
  // Google Maps JS API key (web location picker). Read from the environment via
  // app.config.js — never hardcoded/committed. Empty -> picker shows a fallback.
  googleMapsApiKey: (extra.googleMapsApiKey as string) ?? '',
};

export default Config;
