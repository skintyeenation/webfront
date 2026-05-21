import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { makeActions } from 'skintyee/store/factory';
import { ApiService } from 'skintyee/store/apis';
import { reduceFulfilledState, reducePendingState, reduceRejectedState, thunkApiWithState } from 'skintyee/store/helpers';
import { AppNotification } from 'skintyee/models';

const notificationsActionNames = ['load_notifications'] as const;
export const notificationsActions = makeActions(notificationsActionNames);

export const loadNotifications = createAsyncThunk(notificationsActions.loadNotifications.type, async (_opts = undefined, thunkApi) => {
  const { api } = thunkApiWithState(thunkApi);
  return await (api as ApiService).notifications.list();
});

export interface NotificationsState {
  entities: AppNotification[];
  loading: boolean;
  loaded: boolean;
}

export const notificationsInitialState: NotificationsState = { entities: [], loading: false, loaded: false };

const notificationsSlice = createSlice({
  name: 'notifications',
  initialState: notificationsInitialState,
  reducers: {
    // Admin: post a new notification to the (in-memory) list.
    addNotification: (state, action) => ({ ...state, entities: [action.payload, ...state.entities] }),
  },
  extraReducers: (builder) => {
    builder.addCase(loadNotifications.pending, reducePendingState());
    builder.addCase(loadNotifications.rejected, reduceRejectedState());
    builder.addCase(loadNotifications.fulfilled, reduceFulfilledState((state, action) => ({ ...state, entities: action.payload })));
  },
});

export const { addNotification } = notificationsSlice.actions;

export default notificationsSlice.reducer;
