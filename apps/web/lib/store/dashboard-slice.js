import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  jobs: [],
  filter: "all",
  page: 1,
  pageSize: 10,
  processing: false,
  markingJobId: null,
  toast: null
};

const dashboardSlice = createSlice({
  name: "dashboard",
  initialState,
  reducers: {
    initializeDashboard(state, action) {
      const { jobs = [], filter = "all", page = 1, pageSize = 10 } = action.payload || {};
      state.jobs = jobs;
      state.filter = filter;
      state.page = page;
      state.pageSize = pageSize;
    },
    setFilter(state, action) {
      state.filter = action.payload;
      state.page = 1;
    },
    setPage(state, action) {
      state.page = action.payload;
    },
    setPageSize(state, action) {
      state.pageSize = action.payload;
      state.page = 1;
    },
    setProcessing(state, action) {
      state.processing = action.payload;
    },
    setMarkingJobId(state, action) {
      state.markingJobId = action.payload;
    },
    upsertJob(state, action) {
      const nextJob = action.payload;
      const existingIndex = state.jobs.findIndex((job) => job.id === nextJob.id);
      if (existingIndex >= 0) {
        state.jobs[existingIndex] = nextJob;
      } else {
        state.jobs.unshift(nextJob);
      }
    },
    replaceJob(state, action) {
      const nextJob = action.payload;
      state.jobs = state.jobs.map((job) => (job.id === nextJob.id ? nextJob : job));
    },
    removeJob(state, action) {
      const id = action.payload;
      state.jobs = state.jobs.filter((job) => job.id !== id);
    },
    setToast(state, action) {
      state.toast = action.payload;
    },
    clearToast(state) {
      state.toast = null;
    }
  }
});

export const {
  initializeDashboard,
  setFilter,
  setPage,
  setPageSize,
  setProcessing,
  setMarkingJobId,
  upsertJob,
  replaceJob,
  removeJob,
  setToast,
  clearToast
} = dashboardSlice.actions;

export default dashboardSlice.reducer;
