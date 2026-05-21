import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { makeActions } from 'skintyee/store/factory';
import { ApiService } from 'skintyee/store/apis';
import { reduceFulfilledState, reducePendingState, reduceRejectedState, thunkApiWithState } from 'skintyee/store/helpers';
import { TimeEntry } from 'skintyee/models';

const timekeepingActionNames = ['load_time_entries'] as const;
export const timekeepingActions = makeActions(timekeepingActionNames);

export const loadTimeEntries = createAsyncThunk(timekeepingActions.loadTimeEntries.type, async (_opts = undefined, thunkApi) => {
  const { api } = thunkApiWithState(thunkApi);
  return await (api as ApiService).timekeeping.list();
});

export interface TimekeepingState {
  entities: TimeEntry[];
  loading: boolean;
  loaded: boolean;
}

export const timekeepingInitialState: TimekeepingState = { entities: [], loading: false, loaded: false };

const timekeepingSlice = createSlice({
  name: 'timekeeping',
  initialState: timekeepingInitialState,
  reducers: {
    // Staff/admins submit a timesheet entry; admins approve.
    addTimeEntry: (state, action) => ({ ...state, entities: [action.payload, ...state.entities] }),
    approveTimeEntry: (state, action) => ({
      ...state,
      entities: state.entities.map((t) => (t._id === action.payload ? { ...t, approved: true } : t)),
    }),
  },
  extraReducers: (builder) => {
    builder.addCase(loadTimeEntries.pending, reducePendingState());
    builder.addCase(loadTimeEntries.rejected, reduceRejectedState());
    builder.addCase(loadTimeEntries.fulfilled, reduceFulfilledState((state, action) => ({ ...state, entities: action.payload })));
  },
});

export const { addTimeEntry, approveTimeEntry } = timekeepingSlice.actions;

export default timekeepingSlice.reducer;
