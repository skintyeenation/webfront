import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { makeActions } from 'skintyee/store/factory';
import { ApiService } from 'skintyee/store/apis';
import { reduceFulfilledState, reducePendingState, reduceRejectedState, thunkApiWithState } from 'skintyee/store/helpers';
import { PublicRecord } from 'skintyee/models';

const publicRecordsActionNames = ['load_public_records'] as const;
export const publicRecordsActions = makeActions(publicRecordsActionNames);

export const loadPublicRecords = createAsyncThunk(publicRecordsActions.loadPublicRecords.type, async (_opts = undefined, thunkApi) => {
  const { api } = thunkApiWithState(thunkApi);
  return await (api as ApiService).publicRecords.list();
});

export interface PublicRecordsState {
  entities: PublicRecord[];
  loading: boolean;
  loaded: boolean;
}

export const publicRecordsInitialState: PublicRecordsState = { entities: [], loading: false, loaded: false };

const publicRecordsSlice = createSlice({
  name: 'publicRecords',
  initialState: publicRecordsInitialState,
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(loadPublicRecords.pending, reducePendingState());
    builder.addCase(loadPublicRecords.rejected, reduceRejectedState());
    builder.addCase(loadPublicRecords.fulfilled, reduceFulfilledState((state, action) => ({ ...state, entities: action.payload })));
  },
});

export default publicRecordsSlice.reducer;
