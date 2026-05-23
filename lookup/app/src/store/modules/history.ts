import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { HistoryEntry } from 'lookup/models';

interface HistoryState {
  entries: HistoryEntry[];
}

const initialState: HistoryState = { entries: [] };

const historySlice = createSlice({
  name: 'history',
  initialState,
  reducers: {
    historyPushed(state, action: PayloadAction<HistoryEntry>) {
      state.entries = [action.payload, ...state.entries].slice(0, 50);
    },
    historyUpdated(state, action: PayloadAction<HistoryEntry>) {
      const i = state.entries.findIndex((e) => e.jobId === action.payload.jobId);
      if (i >= 0) state.entries[i] = action.payload;
    },
  },
});

export const { historyPushed, historyUpdated } = historySlice.actions;
export default historySlice.reducer;
