import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { makeActions } from 'skintyee/store/factory';
import { ApiService } from 'skintyee/store/apis';
import { reduceFulfilledState, reducePendingState, reduceRejectedState, thunkApiWithState } from 'skintyee/store/helpers';
import { Expenditure } from 'skintyee/models';

const transparencyActionNames = ['load_expenditures'] as const;
export const transparencyActions = makeActions(transparencyActionNames);

export const loadExpenditures = createAsyncThunk(transparencyActions.loadExpenditures.type, async (_opts = undefined, thunkApi) => {
  const { api } = thunkApiWithState(thunkApi);
  return await (api as ApiService).transparency.expenditures();
});

export interface TransparencyState {
  entities: Expenditure[];
  loading: boolean;
  loaded: boolean;
}

export const transparencyInitialState: TransparencyState = { entities: [], loading: false, loaded: false };

const transparencySlice = createSlice({
  name: 'transparency',
  initialState: transparencyInitialState,
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(loadExpenditures.pending, reducePendingState());
    builder.addCase(loadExpenditures.rejected, reduceRejectedState());
    builder.addCase(loadExpenditures.fulfilled, reduceFulfilledState((state, action) => ({ ...state, entities: action.payload })));
  },
});

export default transparencySlice.reducer;
