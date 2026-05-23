import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import type { Mode, SourceMeta } from 'lookup/models';
import { getSources } from 'lookup/services/lookupApi';

export interface SourcesState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error?: string;
  items: SourceMeta[];
  defaultsByMode: Partial<Record<Mode, string[]>>;
}

const initialState: SourcesState = {
  status: 'idle',
  items: [],
  defaultsByMode: {},
};

export const loadSources = createAsyncThunk(
  'sources/load',
  async ({ mode, indigenousOnly }: { mode?: Mode; indigenousOnly?: boolean }) => {
    return getSources(mode, indigenousOnly);
  },
);

const sourcesSlice = createSlice({
  name: 'sources',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadSources.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(loadSources.fulfilled, (state, action) => {
        state.status = 'ready';
        state.items = action.payload.items;
        const mode = (action.meta.arg.mode ?? 'business') as Mode;
        if (action.payload.defaults) {
          state.defaultsByMode[mode] = action.payload.defaults;
        }
      })
      .addCase(loadSources.rejected, (state, action) => {
        state.status = 'error';
        state.error = action.error.message;
      });
  },
});

export default sourcesSlice.reducer;
