import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { makeActions } from 'skintyee/store/factory';
import { ApiService } from 'skintyee/store/apis';
import { reduceFulfilledState, reducePendingState, reduceRejectedState, thunkApiWithState } from 'skintyee/store/helpers';
import { Expenditure, MajorProject } from 'skintyee/models';

const transparencyActionNames = ['load_expenditures', 'load_major_projects'] as const;
export const transparencyActions = makeActions(transparencyActionNames);

export const loadExpenditures = createAsyncThunk(transparencyActions.loadExpenditures.type, async (_opts = undefined, thunkApi) => {
  const { api } = thunkApiWithState(thunkApi);
  return await (api as ApiService).transparency.expenditures();
});

export const loadMajorProjects = createAsyncThunk(transparencyActions.loadMajorProjects.type, async (_opts = undefined, thunkApi) => {
  const { api } = thunkApiWithState(thunkApi);
  return await (api as ApiService).transparency.majorProjects();
});

export interface TransparencyState {
  entities: Expenditure[];
  majorProjects: MajorProject[];
  loading: boolean;
  loaded: boolean;
}

export const transparencyInitialState: TransparencyState = { entities: [], majorProjects: [], loading: false, loaded: false };

const transparencySlice = createSlice({
  name: 'transparency',
  initialState: transparencyInitialState,
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(loadExpenditures.pending, reducePendingState());
    builder.addCase(loadExpenditures.rejected, reduceRejectedState());
    builder.addCase(loadExpenditures.fulfilled, reduceFulfilledState((state, action) => ({ ...state, entities: action.payload })));
    builder.addCase(loadMajorProjects.fulfilled, (state, action) => ({ ...state, majorProjects: action.payload, loading: false, loaded: true }));
  },
});

export default transparencySlice.reducer;
