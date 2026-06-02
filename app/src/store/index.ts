import { Platform } from 'react-native';
import { Middleware } from 'redux';
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import { bindActionCreators, configureStore } from '@reduxjs/toolkit';
import thunk from 'redux-thunk';

import { apiFactory } from 'skintyee/store/apis';
import { rootReducer as reducer } from 'skintyee/store/reducers';
import { setError } from 'skintyee/store/modules/appState';

// Surfaces rejected thunks as app-level errors. Mirrors the ppt store middleware.
const errorMiddleware: Middleware = function errorReporter(store) {
  return function wrapDispatch(next) {
    return function handleAction(action: any) {
      if (action?.type?.includes?.('rejected')) {
        const msg = `${JSON.stringify(action, null, 2)}`;
        if (action.error) {
          action.error.name = 'Request was rejected';
          action.error.message = `Action [${action.type}] failed.\n${action.error.message}.\n\n${msg}`;
        }
        return store.dispatch(setError(action.error));
      }
      return next(action);
    };
  };
};

// ----- Auth persistence (web) ----------------------------------------------
// Persist the auth slice to localStorage so hot reloads + tab refreshes don't
// kick the user back to the sign-in gate every time. ONLY the auth slice is
// persisted — everything else stays in memory (would explode storage and
// stale-cache the rest of the app).
//
// Native (iOS/Android) could use AsyncStorage similarly; out of scope here
// since we're debugging web dev.
const AUTH_STORAGE_KEY = 'skintyee.auth.v1';

function loadPersistedAuth(): any | undefined {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return undefined;
    const saved = JSON.parse(raw);
    // If the token has expired, drop it — better to sign in fresh than ship
    // a dead token to the api/ and get 401s.
    if (saved.expiresAt && Date.now() > saved.expiresAt) return undefined;
    return saved;
  } catch {
    return undefined;
  }
}

// All auth-related action types in the app (manual + thunk lifecycle).
const AUTH_ACTION_TYPES = new Set<string>([
  'set_role',
  'sign_out',
  'reset_sign_in_status',
]);
function isAuthAction(type: string | undefined): boolean {
  if (!type) return false;
  if (AUTH_ACTION_TYPES.has(type)) return true;
  if (type.startsWith('sign_in/')) return true;            // sign_in pending/fulfilled/rejected
  if (type.startsWith('handle_auth_callback/')) return true; // same shape for callback
  return false;
}

const persistAuthMiddleware: Middleware = (store) => (next) => (action: any) => {
  const result = next(action);
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined' && isAuthAction(action?.type)) {
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(store.getState().auth));
    } catch { /* quota error, ignore */ }
  }
  return result;
};

const persistedAuth = loadPersistedAuth();
const preloadedState = persistedAuth ? { auth: persistedAuth } : undefined;

export const store = configureStore({
  reducer,
  preloadedState: preloadedState as any,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: { warnAfter: 128 },
    })
      // apiFactory is injected so thunks can resolve the (currently mock) ApiService.
      .prepend(thunk.withExtraArgument({ apiFactory }))
      .concat(errorMiddleware)
      .concat(persistAuthMiddleware),
});

export type RootState = ReturnType<typeof store.getState>;
// NOTE: `typeof store.dispatch` (not `ReturnType<...>`) so thunks are dispatchable.
// The ppt source has the ReturnType form, which is a latent bug masked by its
// looser typing; corrected here.
export type AppDispatch = typeof store.dispatch;
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
