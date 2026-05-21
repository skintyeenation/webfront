import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { makeActions } from 'skintyee/store/factory';
import { ApiService } from 'skintyee/store/apis';
import { reduceFulfilledState, reducePendingState, reduceRejectedState, thunkApiWithState } from 'skintyee/store/helpers';
import { BandMeeting } from 'skintyee/models';

const meetingsActionNames = ['load_meetings'] as const;
export const meetingsActions = makeActions(meetingsActionNames);

export const loadMeetings = createAsyncThunk(meetingsActions.loadMeetings.type, async (_opts = undefined, thunkApi) => {
  const { api } = thunkApiWithState(thunkApi);
  return await (api as ApiService).meetings.list();
});

export interface MeetingsState {
  entities: BandMeeting[];
  loading: boolean;
  loaded: boolean;
}

export const meetingsInitialState: MeetingsState = { entities: [], loading: false, loaded: false };

const meetingsSlice = createSlice({
  name: 'meetings',
  initialState: meetingsInitialState,
  reducers: {
    // Admin: add / delete / cancel (toggle) a band meeting (in-memory).
    addMeeting: (state, action) => ({ ...state, entities: [action.payload, ...state.entities] }),
    removeMeeting: (state, action) => ({ ...state, entities: state.entities.filter((m) => m._id !== action.payload) }),
    cancelMeeting: (state, action) => ({
      ...state,
      entities: state.entities.map((m) => (m._id === action.payload ? { ...m, cancelled: !m.cancelled } : m)),
    }),
  },
  extraReducers: (builder) => {
    builder.addCase(loadMeetings.pending, reducePendingState());
    builder.addCase(loadMeetings.rejected, reduceRejectedState());
    builder.addCase(loadMeetings.fulfilled, reduceFulfilledState((state, action) => ({ ...state, entities: action.payload })));
  },
});

export const { addMeeting, removeMeeting, cancelMeeting } = meetingsSlice.actions;

export default meetingsSlice.reducer;
