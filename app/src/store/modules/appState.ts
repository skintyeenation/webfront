import { createAction, createSlice } from '@reduxjs/toolkit';
import { makeActions } from 'skintyee/store/factory';

const appStateActionNames = ['loading', 'set_error', 'clear_error'] as const;
export const appStateActions = makeActions(appStateActionNames);

export const loading = createAction<boolean>('loading');
export const setError = createAction<any>('set_error');
export const clearError = createAction('clear_error');

// Desktop nav placement: left side rail (default on desktop) or bottom tab bar.
// `setNavPosition` only updates state — persistence is **per-user** via the
// AsyncStorage helper in `store/navPrefs.ts` (cross-platform: web/Electron via
// localStorage, native via AsyncStorage), loaded on sign-in and saved on toggle.
// Default is 'left' → left rail on desktop (width ≥ 900), bottom on phones (the
// nav navigator only shows the rail above that width, so 'left' is harmless on
// mobile). The toggle is hidden when logged out, so anonymous always sees default.
export type NavPosition = 'bottom' | 'left';
export const setNavPosition = createAction<NavPosition>('set_nav_position');

export const DEFAULT_NAV_POSITION: NavPosition = 'left';

export interface AppState {
  loading: boolean;
  error: any | null;
  navPosition: NavPosition;
}

export const appStateInitialState: AppState = {
  loading: false,
  error: null,
  navPosition: DEFAULT_NAV_POSITION,
};

const appStateSlice = createSlice({
  name: 'app',
  initialState: appStateInitialState,
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(loading, (state, action) => ({ ...state, loading: action.payload }));
    builder.addCase(setError, (state, action) => ({ ...state, loading: false, error: action.payload }));
    builder.addCase(clearError, (state) => ({ ...state, error: null }));
    builder.addCase(setNavPosition, (state, action) => ({ ...state, navPosition: action.payload }));
  },
});

export default appStateSlice.reducer;
