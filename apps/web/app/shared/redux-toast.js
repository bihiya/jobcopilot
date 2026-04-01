"use client";

import { Alert, Snackbar } from "@mui/material";
import { useDispatch, useSelector } from "react-redux";
import { clearToast } from "@/lib/store/dashboard-slice";

export default function ReduxToast() {
  const toast = useSelector((state) => state.dashboard.toast);
  const dispatch = useDispatch();

  return (
    <Snackbar
      open={Boolean(toast)}
      autoHideDuration={3500}
      onClose={() => dispatch(clearToast())}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
    >
      <Alert
        onClose={() => dispatch(clearToast())}
        severity={toast?.type === "error" ? "error" : toast?.type === "warning" ? "warning" : "success"}
        variant="filled"
        sx={{ width: "100%" }}
      >
        {toast?.message || ""}
      </Alert>
    </Snackbar>
  );
}
