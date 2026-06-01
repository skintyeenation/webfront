import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { makeActions } from 'skintyee/store/factory';
import { ApiService } from 'skintyee/store/apis';
import { reduceFulfilledState, reducePendingState, reduceRejectedState, thunkApiWithState } from 'skintyee/store/helpers';
import { FeedItem, Role } from 'skintyee/models';

// The unified homescreen feed — app-events + Teams meetings + Planner
// due-dates + notifications, server-merged and role-filtered. Hits
// `/v1/feed` once wired live; mock returns the same shape from the
// in-memory fixtures. See ADR-14 + docs/features/planner-dashboard.md.

const feedActionNames = ['load_feed'] as const;
export const feedActions = makeActions(feedActionNames);

export const loadFeed = createAsyncThunk(
  feedActions.loadFeed.type,
  async (opts: { role: Role; from?: string; to?: string }, thunkApi) => {
    const { api } = thunkApiWithState(thunkApi);
    return await (api as ApiService).feed.get(opts);
  }
);

export interface FeedState {
  items: FeedItem[];
  loading: boolean;
  loaded: boolean;
}

export const feedInitialState: FeedState = { items: [], loading: false, loaded: false };

const feedSlice = createSlice({
  name: 'feed',
  initialState: feedInitialState,
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(loadFeed.pending,   reducePendingState());
    builder.addCase(loadFeed.rejected,  reduceRejectedState());
    builder.addCase(loadFeed.fulfilled, reduceFulfilledState((state, action) => ({ ...state, items: action.payload })));
  },
});

export default feedSlice.reducer;
