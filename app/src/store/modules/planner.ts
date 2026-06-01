import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { makeActions } from 'skintyee/store/factory';
import { ApiService } from 'skintyee/store/apis';
import { reduceFulfilledState, reducePendingState, reduceRejectedState, thunkApiWithState } from 'skintyee/store/helpers';
import { PlannerPlanSummary, PlannerRollup, PlannerTask } from 'skintyee/models';

// Read-only Planner data via the api/'s GraphFeedService. See ADR-14 +
// docs/features/planner-dashboard.md. Powers:
//   - The admin section of Records (rollup + per-area drill-down)
//   - The "Team tasks" + "My tasks" pivots on the homescreen (Phase 2)
//   - The Planner-task time-bound items in the unified feed

const plannerActionNames = ['load_rollup', 'load_plans', 'load_tasks'] as const;
export const plannerActions = makeActions(plannerActionNames);

export const loadRollup = createAsyncThunk(plannerActions.loadRollup.type, async (_opts = undefined, thunkApi) => {
  const { api } = thunkApiWithState(thunkApi);
  return await (api as ApiService).planner.rollup();
});

export const loadPlans = createAsyncThunk(plannerActions.loadPlans.type, async (_opts = undefined, thunkApi) => {
  const { api } = thunkApiWithState(thunkApi);
  return await (api as ApiService).planner.plans();
});

export const loadTasksForPlan = createAsyncThunk(plannerActions.loadTasks.type, async (planId: string, thunkApi) => {
  const { api } = thunkApiWithState(thunkApi);
  return { planId, tasks: await (api as ApiService).planner.tasks(planId) };
});

export interface PlannerState {
  rollup?: PlannerRollup;
  plans: PlannerPlanSummary[];
  tasksByPlan: Record<string, PlannerTask[]>;
  loading: boolean;
  loaded: boolean;
}

export const plannerInitialState: PlannerState = {
  rollup: undefined,
  plans: [],
  tasksByPlan: {},
  loading: false,
  loaded: false,
};

const plannerSlice = createSlice({
  name: 'planner',
  initialState: plannerInitialState,
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(loadRollup.pending,   reducePendingState());
    builder.addCase(loadRollup.rejected,  reduceRejectedState());
    builder.addCase(loadRollup.fulfilled, reduceFulfilledState((state, action) => ({ ...state, rollup: action.payload })));

    builder.addCase(loadPlans.fulfilled, (state, action) => ({ ...state, plans: action.payload, loaded: true }));

    builder.addCase(loadTasksForPlan.fulfilled, (state, action) => ({
      ...state,
      tasksByPlan: { ...state.tasksByPlan, [action.payload.planId]: action.payload.tasks },
    }));
  },
});

export default plannerSlice.reducer;
