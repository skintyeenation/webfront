import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { makeActions } from 'skintyee/store/factory';
import { ApiService } from 'skintyee/store/apis';
import { reduceFulfilledState, reducePendingState, reduceRejectedState, thunkApiWithState } from 'skintyee/store/helpers';
import { CommunityEvent } from 'skintyee/models';

const eventsActionNames = ['load_events', 'load_event'] as const;
export const eventsActions = makeActions(eventsActionNames);

export const loadEvents = createAsyncThunk(eventsActions.loadEvents.type, async (_opts = undefined, thunkApi) => {
  const { api } = thunkApiWithState(thunkApi);
  return await (api as ApiService).events.list();
});

export const loadEvent = createAsyncThunk(eventsActions.loadEvent.type, async (id: string, thunkApi) => {
  const { api } = thunkApiWithState(thunkApi);
  return await (api as ApiService).events.get(id);
});

export interface EventsState {
  entities: CommunityEvent[];
  selected?: CommunityEvent;
  loading: boolean;
  loaded: boolean;
}

export const eventsInitialState: EventsState = {
  entities: [],
  selected: undefined,
  loading: false,
  loaded: false,
};

const eventsSlice = createSlice({
  name: 'events',
  initialState: eventsInitialState,
  reducers: {
    // Admin: add a new event to the (in-memory) list.
    addEvent: (state, action) => ({ ...state, entities: [action.payload, ...state.entities] }),
  },
  extraReducers: (builder) => {
    builder.addCase(loadEvents.pending, reducePendingState());
    builder.addCase(loadEvents.rejected, reduceRejectedState());
    builder.addCase(loadEvents.fulfilled, reduceFulfilledState((state, action) => ({ ...state, entities: action.payload })));
    builder.addCase(loadEvent.pending, reducePendingState());
    builder.addCase(loadEvent.rejected, reduceRejectedState());
    builder.addCase(loadEvent.fulfilled, reduceFulfilledState((state, action) => ({ ...state, selected: action.payload })));
  },
});

export const { addEvent } = eventsSlice.actions;

export default eventsSlice.reducer;
