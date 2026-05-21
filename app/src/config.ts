import Constants from 'expo-constants';

const extra = (Constants?.expoConfig?.extra ?? {}) as Record<string, unknown>;

/**
 * App configuration. The diagram targets a future API Server → Azure Cloud DB
 * reachable at App.SkinTyee.ca. Until that exists, `apiServer` is 'mock' and all
 * data is served from src/services/api/mock. See STUBS.md.
 */
const Config = {
  // STUB: 'mock' selects the in-memory mock ApiService. Swap for a real base URL.
  apiServer: (extra.apiServer as string) ?? 'mock',
  appName: 'Skintyee',
};

export default Config;
