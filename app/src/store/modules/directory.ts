import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { makeActions } from 'skintyee/store/factory';
import { ApiService } from 'skintyee/store/apis';
import { reduceFulfilledState, reducePendingState, reduceRejectedState, thunkApiWithState } from 'skintyee/store/helpers';
import { BandMember } from 'skintyee/models';

const directoryActionNames = ['load_directory', 'load_member'] as const;
export const directoryActions = makeActions(directoryActionNames);

export const loadDirectory = createAsyncThunk(directoryActions.loadDirectory.type, async (_opts = undefined, thunkApi) => {
  const { api } = thunkApiWithState(thunkApi);
  return await (api as ApiService).directory.list();
});

export const loadMember = createAsyncThunk(directoryActions.loadMember.type, async (id: string, thunkApi) => {
  const { api } = thunkApiWithState(thunkApi);
  return await (api as ApiService).directory.get(id);
});

export interface DirectoryState {
  entities: BandMember[];
  selected?: BandMember;
  loading: boolean;
  loaded: boolean;
}

export const directoryInitialState: DirectoryState = {
  entities: [],
  selected: undefined,
  loading: false,
  loaded: false,
};

const directorySlice = createSlice({
  name: 'directory',
  initialState: directoryInitialState,
  reducers: {
    // Admin: add / remove a band member (in-memory).
    addMember: (state, action) => ({ ...state, entities: [action.payload, ...state.entities] }),
    removeMember: (state, action) => ({ ...state, entities: state.entities.filter((m) => m._id !== action.payload) }),
  },
  extraReducers: (builder) => {
    builder.addCase(loadDirectory.pending, reducePendingState());
    builder.addCase(loadDirectory.rejected, reduceRejectedState());
    builder.addCase(loadDirectory.fulfilled, reduceFulfilledState((state, action) => ({ ...state, entities: action.payload })));
    builder.addCase(loadMember.pending, reducePendingState());
    builder.addCase(loadMember.rejected, reduceRejectedState());
    builder.addCase(loadMember.fulfilled, reduceFulfilledState((state, action) => ({ ...state, selected: action.payload })));
  },
});

export const { addMember, removeMember } = directorySlice.actions;

export default directorySlice.reducer;
