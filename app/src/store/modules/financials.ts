import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { makeActions } from 'skintyee/store/factory';
import { ApiService } from 'skintyee/store/apis';
import { reduceFulfilledState, reducePendingState, reduceRejectedState, thunkApiWithState } from 'skintyee/store/helpers';
import { FinancialRecord } from 'skintyee/models';

const financialsActionNames = ['load_financials'] as const;
export const financialsActions = makeActions(financialsActionNames);

export const loadFinancials = createAsyncThunk(financialsActions.loadFinancials.type, async (_opts = undefined, thunkApi) => {
  const { api } = thunkApiWithState(thunkApi);
  return await (api as ApiService).financials.list();
});

export interface FinancialsState {
  entities: FinancialRecord[];
  loading: boolean;
  loaded: boolean;
}

export const financialsInitialState: FinancialsState = { entities: [], loading: false, loaded: false };

const financialsSlice = createSlice({
  name: 'financials',
  initialState: financialsInitialState,
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(loadFinancials.pending, reducePendingState());
    builder.addCase(loadFinancials.rejected, reduceRejectedState());
    builder.addCase(loadFinancials.fulfilled, reduceFulfilledState((state, action) => ({ ...state, entities: action.payload })));
  },
});

export default financialsSlice.reducer;
