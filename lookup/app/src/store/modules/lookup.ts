import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { JobOptions, JobState, ProgressEvent } from 'lookup/models';

interface LookupState {
  currentJobId?: string;
  jobs: Record<string, JobState>;
}

const initialState: LookupState = { jobs: {} };

const lookupSlice = createSlice({
  name: 'lookup',
  initialState,
  reducers: {
    jobStarted(state, action: PayloadAction<{ jobId: string; options: JobOptions }>) {
      const { jobId, options } = action.payload;
      state.currentJobId = jobId;
      state.jobs[jobId] = {
        id: jobId,
        options,
        events: [],
        status: 'running',
        perSource: Object.fromEntries(options.sourceIds.map((id) => [id, { status: 'idle' }])),
      };
    },
    eventReceived(state, action: PayloadAction<{ jobId: string; event: ProgressEvent }>) {
      const { jobId, event } = action.payload;
      const job = state.jobs[jobId];
      if (!job) return;
      job.events.push(event);
      switch (event.type) {
        case 'source-start':
          job.perSource[event.sourceId] = { ...job.perSource[event.sourceId], status: 'running' };
          break;
        case 'source-done':
          job.perSource[event.sourceId] = {
            status: 'done',
            count: event.count,
            searchUrl: event.searchUrl,
          };
          break;
        case 'source-error':
          job.perSource[event.sourceId] = { status: 'error', error: event.error };
          break;
        case 'job-done':
          job.status = 'done';
          job.reportPath = event.reportPath;
          job.durationMs = event.durationMs;
          break;
      }
    },
    jobFailed(state, action: PayloadAction<{ jobId: string; error: string }>) {
      const job = state.jobs[action.payload.jobId];
      if (job) job.status = 'failed';
    },
  },
});

export const { jobStarted, eventReceived, jobFailed } = lookupSlice.actions;
export default lookupSlice.reducer;
