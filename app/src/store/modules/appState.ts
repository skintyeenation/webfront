import { createAction, createSlice } from '@reduxjs/toolkit';
import { makeActions } from 'skintyee/store/factory';

const appStateActionNames = ['loading', 'set_error', 'clear_error'] as const;
export const appStateActions = makeActions(appStateActionNames);

export const loading = createAction<boolean>('loading');
export const setError = createAction<any>('set_error');
export const clearError = createAction('clear_error');

export interface AppState {
  loading: boolean;
  error: any | null;
}

export const appStateInitialState: AppState = {
  loading: false,
  error: null,
};

const appStateSlice = createSlice({
  name: 'app',
  initialState: appStateInitialState,
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(loading, (state, action) => ({ ...state, loading: action.payload }));
    builder.addCase(setError, (state, action) => ({ ...state, loading: false, error: action.payload }));
    builder.addCase(clearError, (state) => ({ ...state, error: null }));
  },
});

export default appStateSlice.reducer;
