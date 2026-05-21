import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { makeActions } from 'skintyee/store/factory';
import { ApiService } from 'skintyee/store/apis';
import { reduceFulfilledState, reducePendingState, reduceRejectedState, thunkApiWithState } from 'skintyee/store/helpers';
import { Poll } from 'skintyee/models';

const pollsActionNames = ['load_polls', 'load_poll', 'vote_on_poll'] as const;
export const pollsActions = makeActions(pollsActionNames);

export const loadPolls = createAsyncThunk(pollsActions.loadPolls.type, async (_opts = undefined, thunkApi) => {
  const { api } = thunkApiWithState(thunkApi);
  return await (api as ApiService).polls.list();
});

export const loadPoll = createAsyncThunk(pollsActions.loadPoll.type, async (id: string, thunkApi) => {
  const { api } = thunkApiWithState(thunkApi);
  return await (api as ApiService).polls.get(id);
});

export const voteOnPoll = createAsyncThunk(pollsActions.voteOnPoll.type, async (args: { pollId: string; optionId: string }, thunkApi) => {
  const { api } = thunkApiWithState(thunkApi);
  return await (api as ApiService).polls.vote(args);
});

export interface PollsState {
  entities: Poll[];
  selected?: Poll;
  loading: boolean;
  loaded: boolean;
}

export const pollsInitialState: PollsState = { entities: [], selected: undefined, loading: false, loaded: false };

const upsert = (entities: Poll[], poll: Poll) => entities.map((p) => (p._id === poll._id ? poll : p));

const pollsSlice = createSlice({
  name: 'polls',
  initialState: pollsInitialState,
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(loadPolls.pending, reducePendingState());
    builder.addCase(loadPolls.rejected, reduceRejectedState());
    builder.addCase(loadPolls.fulfilled, reduceFulfilledState((state, action) => ({ ...state, entities: action.payload })));
    builder.addCase(loadPoll.pending, reducePendingState());
    builder.addCase(loadPoll.rejected, reduceRejectedState());
    builder.addCase(loadPoll.fulfilled, reduceFulfilledState((state, action) => ({ ...state, selected: action.payload })));
    builder.addCase(voteOnPoll.fulfilled, (state, action) => ({
      ...state,
      selected: action.payload,
      entities: upsert(state.entities, action.payload),
      loading: false,
      loaded: true,
    }));
  },
});

export default pollsSlice.reducer;
