import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { makeActions } from 'skintyee/store/factory';
import { ApiService } from 'skintyee/store/apis';
import { reduceFulfilledState, reducePendingState, reduceRejectedState, thunkApiWithState } from 'skintyee/store/helpers';
import { BandMember } from 'skintyee/models';

const directoryActionNames = ['load_directory', 'load_member', 'set_member_groups', 'set_member_mailboxes', 'set_member_licenses', 'set_member_blocked'] as const;
export const directoryActions = makeActions(directoryActionNames);

export const loadDirectory = createAsyncThunk(directoryActions.loadDirectory.type, async (_opts = undefined, thunkApi) => {
  const { api } = thunkApiWithState(thunkApi);
  return await (api as ApiService).directory.list();
});

export const loadMember = createAsyncThunk(directoryActions.loadMember.type, async (id: string, thunkApi) => {
  const { api } = thunkApiWithState(thunkApi);
  return await (api as ApiService).directory.get(id);
});

// Write-back a member's Entra security-group memberships. The api/ pushes
// the diff to Entra and returns the updated BandMember; we merge it into
// the directory entities so the Directory + MemberDetail screens update
// without a refetch.
export const setMemberGroups = createAsyncThunk(
  directoryActions.setMemberGroups.type,
  async (args: { id: string; groups: string[] }, thunkApi) => {
    const { api } = thunkApiWithState(thunkApi);
    return await (api as ApiService).directory.setGroups(args.id, args.groups);
  }
);

// Write-back a member's shared-mailbox FullAccess+SendAs. The api/ calls
// the EXO PowerShell function per change.
export const setMemberMailboxes = createAsyncThunk(
  directoryActions.setMemberMailboxes.type,
  async (args: { id: string; mailboxes: string[] }, thunkApi) => {
    const { api } = thunkApiWithState(thunkApi);
    return await (api as ApiService).directory.setMailboxes(args.id, args.mailboxes);
  }
);

// Write-back a member's managed Microsoft licences (Business Standard,
// Entra ID P1). The api/ diffs vs Entra + calls Graph assignLicense and
// returns the updated BandMember.
export const setMemberLicenses = createAsyncThunk(
  directoryActions.setMemberLicenses.type,
  async (args: { id: string; skuIds: string[] }, thunkApi) => {
    const { api } = thunkApiWithState(thunkApi);
    return await (api as ApiService).directory.setLicenses(args.id, args.skuIds);
  }
);

// Lock / unlock an account (blocks sign-in + revokes sessions).
export const setMemberBlocked = createAsyncThunk(
  directoryActions.setMemberBlocked.type,
  async (args: { id: string; blocked: boolean }, thunkApi) => {
    const { api } = thunkApiWithState(thunkApi);
    return await (api as ApiService).directory.setBlocked(args.id, args.blocked);
  }
);

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
    // Admin: add / edit / remove a band member (in-memory).
    addMember: (state, action) => ({ ...state, entities: [action.payload, ...state.entities] }),
    updateMember: (state, action) => {
      const merged = { ...action.payload };
      return {
        ...state,
        entities: state.entities.map((m) => (m._id === merged._id ? { ...m, ...merged } : m)),
        selected: state.selected?._id === merged._id ? { ...state.selected, ...merged } : state.selected,
      };
    },
    removeMember: (state, action) => ({ ...state, entities: state.entities.filter((m) => m._id !== action.payload) }),
  },
  extraReducers: (builder) => {
    builder.addCase(loadDirectory.pending, reducePendingState());
    builder.addCase(loadDirectory.rejected, reduceRejectedState());
    builder.addCase(loadDirectory.fulfilled, reduceFulfilledState((state, action) => ({ ...state, entities: action.payload })));
    builder.addCase(loadMember.pending, reducePendingState());
    builder.addCase(loadMember.rejected, reduceRejectedState());
    builder.addCase(loadMember.fulfilled, reduceFulfilledState((state, action) => ({ ...state, selected: action.payload })));
    builder.addCase(setMemberGroups.pending, reducePendingState());
    builder.addCase(setMemberGroups.rejected, reduceRejectedState());
    builder.addCase(setMemberGroups.fulfilled, reduceFulfilledState((state, action) => {
      const updated = action.payload as BandMember;
      return {
        ...state,
        entities: state.entities.map((m) => (m._id === updated._id ? { ...m, ...updated } : m)),
        selected: state.selected?._id === updated._id ? { ...state.selected, ...updated } : state.selected,
      };
    }));
    builder.addCase(setMemberMailboxes.pending, reducePendingState());
    builder.addCase(setMemberMailboxes.rejected, reduceRejectedState());
    builder.addCase(setMemberMailboxes.fulfilled, reduceFulfilledState((state, action) => {
      const updated = action.payload as BandMember;
      return {
        ...state,
        entities: state.entities.map((m) => (m._id === updated._id ? { ...m, ...updated } : m)),
        selected: state.selected?._id === updated._id ? { ...state.selected, ...updated } : state.selected,
      };
    }));
    builder.addCase(setMemberLicenses.pending, reducePendingState());
    builder.addCase(setMemberLicenses.rejected, reduceRejectedState());
    builder.addCase(setMemberLicenses.fulfilled, reduceFulfilledState((state, action) => {
      const updated = action.payload as BandMember;
      return {
        ...state,
        entities: state.entities.map((m) => (m._id === updated._id ? { ...m, ...updated } : m)),
        selected: state.selected?._id === updated._id ? { ...state.selected, ...updated } : state.selected,
      };
    }));
    builder.addCase(setMemberBlocked.pending, reducePendingState());
    builder.addCase(setMemberBlocked.rejected, reduceRejectedState());
    builder.addCase(setMemberBlocked.fulfilled, reduceFulfilledState((state, action) => {
      const updated = action.payload as BandMember;
      return {
        ...state,
        entities: state.entities.map((m) => (m._id === updated._id ? { ...m, ...updated } : m)),
        selected: state.selected?._id === updated._id ? { ...state.selected, ...updated } : state.selected,
      };
    }));
  },
});

export const { addMember, updateMember, removeMember } = directorySlice.actions;

export default directorySlice.reducer;
