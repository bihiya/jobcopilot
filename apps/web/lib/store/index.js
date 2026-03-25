import { configureStore } from "@reduxjs/toolkit";
import dashboardReducer from "./dashboard-slice";

export function createStore() {
  return configureStore({
    reducer: {
      dashboard: dashboardReducer
    }
  });
}
