import { ApiService } from 'skintyee/services/api/ApiService';
import { mockApiService } from 'skintyee/services/api/mock/MockApiService';
import { buildHttpApiService } from 'skintyee/services/api/http/HttpApiService';
import { Role } from 'skintyee/models';
import Config from 'skintyee/config';

export type { ApiService };

// Cached HTTP impl keyed by base URL so we don't rebuild on every dispatch.
let httpImpl: ApiService | undefined;
let httpImplBaseUrl: string | undefined;

/**
 * Selects which ApiService implementation the thunks use. Mirrors ppt's
 * apiFactory pattern (passed to thunks via redux-thunk's extra argument).
 *
 *   • `mock`                  → in-memory MockApiService (dev / SSR / fallback)
 *   • any http(s) URL         → HttpApiService against `/v1/*` at that URL
 *                               (production web build sets this via
 *                               EXPO_PUBLIC_API_SERVER in app.config.js)
 *
 * The HTTP path uses an `x-role` header read at request time from the auth
 * store (matches the api/'s RolesGuard). Phase 2: swap to Bearer + delegated
 * Entra token once app-side Entra sign-in is wired.
 *
 * NOTE: store is imported lazily inside the role getter to avoid a circular
 * import (store/index.ts depends on this module's apiFactory).
 */
export const apiFactory = (_opts?: any): ApiService => {
  const target = Config.apiServer ?? 'mock';
  if (target === 'mock' || !/^https?:\/\//.test(target)) {
    return mockApiService;
  }
  if (httpImpl && httpImplBaseUrl === target) {
    return httpImpl;
  }
  httpImpl = buildHttpApiService(target, () => {
    // Lazy require to dodge circular import with store/index.ts
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { store } = require('skintyee/store');
    return ((store.getState().auth?.role as Role) ?? 'public');
  });
  httpImplBaseUrl = target;
  return httpImpl;
};
