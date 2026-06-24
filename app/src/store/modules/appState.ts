import { createAction, createSlice } from '@reduxjs/toolkit';
import { makeActions } from 'skintyee/store/factory';

const appStateActionNames = ['loading', 'set_error', 'clear_error'] as const;
export const appStateActions = makeActions(appStateActionNames);

export const loading = createAction<boolean>('loading');
export const setError = createAction<any>('set_error');
export const clearError = createAction('clear_error');

// Desktop nav placement: bottom tab bar (default) or left side rail. Persisted
// to localStorage on web so the choice sticks across reloads (no-op on native).
export type NavPosition = 'bottom' | 'left';
export const setNavPosition = createAction<NavPosition>('set_nav_position');

const NAV_POS_KEY = 'stfn.navPosition';
function readNavPosition(): NavPosition {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(NAV_POS_KEY) === 'left' ? 'left' : 'bottom';
  } catch { return 'bottom'; }
}

export interface AppState {
  loading: boolean;
  error: any | null;
  navPosition: NavPosition;
}

export const appStateInitialState: AppState = {
  loading: false,
  error: null,
  navPosition: readNavPosition(),
};

const appStateSlice = createSlice({
  name: 'app',
  initialState: appStateInitialState,
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(loading, (state, action) => ({ ...state, loading: action.payload }));
    builder.addCase(setError, (state, action) => ({ ...state, loading: false, error: action.payload }));
    builder.addCase(clearError, (state) => ({ ...state, error: null }));
    builder.addCase(setNavPosition, (state, action) => {
      try { if (typeof localStorage !== 'undefined') localStorage.setItem(NAV_POS_KEY, action.payload); } catch { /* native */ }
      return { ...state, navPosition: action.payload };
    });
  },
});

export default appStateSlice.reducer;
