"use client";

import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from "@mui/material";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import WorkOutlineIcon from "@mui/icons-material/WorkOutline";
import LoginIcon from "@mui/icons-material/Login";
import HistoryIcon from "@mui/icons-material/History";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import {
  clearToast,
  initializeDashboard,
  replaceJob,
  setFilter,
  setMarkingJobId,
  setPage,
  setPageSize,
  setProcessing,
  setToast,
  upsertJob,
  removeJob
} from "@/lib/store/dashboard-slice";

const FILTERS = ["all", "processing", "pending", "auth_required", "ready", "applying", "applied"];
const PAGE_SIZE_OPTIONS = [5, 10, 25];

function statusLabel(status) {
  if (status === "auth_required") return "Connect site";
  if (status === "processing") return "Processing";
  return status;
}

function statusColor(status) {
  if (status === "applied") return "success";
  if (status === "applying") return "secondary";
  if (status === "ready") return "info";
  if (status === "processing") return "primary";
  if (status === "auth_required") return "warning";
  return "warning";
}

function isLocalJobId(id) {
  return typeof id === "string" && id.startsWith("local-");
}

function filterChipLabel(filter) {
  if (filter === "auth_required") return "Connect site";
  if (filter === "all") return "All";
  return filter.charAt(0).toUpperCase() + filter.slice(1);
}

export default function DashboardClient({ initialJobs, initialFilter, initialPage, databaseError }) {
  const dispatch = useDispatch();
  const {
    jobs,
    processing,
    markingJobId,
    toast,
    filter: activeFilter,
    pageSize,
    page
  } = useSelector((state) => state.dashboard);
  const [jobUrlInput, setJobUrlInput] = useState("");
  const [authStatus, setAuthStatus] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(false);
  const [connectingAuth, setConnectingAuth] = useState(false);
  const [processLog, setProcessLog] = useState([]);
  const [captchaAssist, setCaptchaAssist] = useState(null);
  const [auditDialogJob, setAuditDialogJob] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  useEffect(() => {
    dispatch(
      initializeDashboard({
        jobs: initialJobs,
        filter: FILTERS.includes(initialFilter) ? initialFilter : "all",
        page: Math.max(1, Number(initialPage || 1)),
        pageSize: 10
      })
    );
  }, [dispatch, initialFilter, initialJobs, initialPage]);

  const filteredJobs = useMemo(() => {
    if (activeFilter === "all") return jobs;
    return jobs.filter((job) => job.status === activeFilter);
  }, [jobs, activeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const paginatedJobs = filteredJobs.slice(start, start + pageSize);

  function closeAuditDialog() {
    setAuditDialogJob(null);
    setAuditLogs([]);
    setAuditLoading(false);
  }

  async function openAuditDialog(job) {
    if (!job?.id) return;
    setAuditDialogJob(job);
    setAuditLogs([]);

    if (isLocalJobId(job.id)) {
      setAuditLoading(false);
      return;
    }

    setAuditLoading(true);
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(job.id)}/audit`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        dispatch(
          setToast({
            type: "error",
            message: data?.error || "Failed to load audit log."
          })
        );
        setAuditLogs([]);
        return;
      }
      setAuditLogs(data.logs || []);
    } catch {
      dispatch(setToast({ type: "error", message: "Failed to load audit log." }));
      setAuditLogs([]);
    } finally {
      setAuditLoading(false);
    }
  }

  async function onProcessJob(event) {
    event.preventDefault();
    const jobUrl = String(jobUrlInput || "").trim();

    if (!jobUrl) {
      dispatch(setToast({ type: "error", message: "Job URL is required." }));
      return;
    }

    const tempId = `local-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
    dispatch(setProcessing(true));
    dispatch(clearToast());
    dispatch(setFilter("all"));
    dispatch(
      upsertJob({
        id: tempId,
        url: jobUrl,
        status: "processing",
        matchScore: null,
        createdAt: new Date().toISOString()
      })
    );

    const replaceOptimisticWithJob = (job) => {
      dispatch(removeJob(tempId));
      if (job) dispatch(upsertJob(job));
    };

    try {
      const response = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobUrl, formFields: [] })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        replaceOptimisticWithJob(null);
        throw new Error(payload?.message || payload?.error || "Failed to process job.");
      }

      if (Array.isArray(payload?.processingSteps)) {
        setProcessLog(payload.processingSteps);
      }

      if (payload?.job) {
        dispatch(upsertJob(payload.job));
      }

      if (payload?.requiresAuth) {
        replaceOptimisticWithJob(payload.job ?? null);
        setAuthStatus({
          requiresAuth: true,
          site: payload.site,
          loginUrl: payload.loginUrl || null,
          reason: payload.reason || "Session required"
        });
        dispatch(
          setToast({
            type: "warning",
            message: `Employer login needed on ${payload.site}. Click Connect and sign in once in the Chromium window.`
          })
        );
        return;
      }

      if (payload?.blocker) {
        replaceOptimisticWithJob(payload.job ?? null);
        const isCaptchaRequired =
          payload?.processState?.step === "CAPTCHA_REQUIRED" ||
          payload?.blocker?.type === "captcha";
        if (isCaptchaRequired) {
          setCaptchaAssist({
            jobUrl,
            site: payload?.site || null,
            nextAction:
              payload?.applyResult?.nextAction ||
              "Open the job page, solve CAPTCHA, then run prefill script before submit.",
            prefillScript: payload?.applyResult?.manualPrefill?.prefillScript || "",
            prefillFields: payload?.applyResult?.manualPrefill?.fields || []
          });
        }
        const b = payload.blocker;
        const fs = payload.fillSummary;
        const fillHint =
          fs?.filledCount != null ? ` ${fs.filledCount} field(s) were filled in the browser.` : "";
        const softBlock = b.type === "captcha" || b.type === "two_factor";
        dispatch(
          setToast({
            type: softBlock ? "warning" : "error",
            message: `${b.message || b.type || "Blocked"}${fillHint}`
          })
        );
        return;
      }

      setCaptchaAssist(null);
      if (payload?.job) {
        replaceOptimisticWithJob(payload.job);
      } else {
        replaceOptimisticWithJob(null);
      }
      setJobUrlInput("");
      const filled = payload?.fillSummary?.filledCount;
      const note = payload?.applyNote;
      dispatch(
        setToast({
          type: "success",
          message:
            filled != null && filled >= 0
              ? `Job processed. ${filled} field(s) filled on the employer page.${note ? ` ${note}` : ""}`
              : note
                ? `Job processed. ${note}`
                : "Job processed successfully."
        })
      );
    } catch (error) {
      dispatch(removeJob(tempId));
      dispatch(
        setToast({
          type: "error",
          message: error?.message || "Unexpected error while processing job."
        })
      );
    } finally {
      dispatch(setProcessing(false));
    }
  }

  async function onConnectSite() {
    const jobUrl = String(jobUrlInput || "").trim();
    if (!jobUrl) {
      dispatch(setToast({ type: "error", message: "Enter a job URL first." }));
      return;
    }

    setConnectingAuth(true);
    dispatch(clearToast());

    try {
      const response = await fetch("/api/site-auth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobUrl })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || "Failed to start auth connection.");
      }

      dispatch(
        setToast({
          type: payload.inProgress ? "warning" : "success",
          message:
            payload.message ||
            (payload.inProgress
              ? "Login is already in progress — use the open Chromium window."
              : "Look for a Chromium window on the machine running the API server, sign in, then click Check Login Status.")
        })
      );
      setAuthStatus({
        requiresAuth: true,
        site: payload.site,
        loginUrl: payload.loginUrl || null,
        reason: payload.message || "Waiting for login completion"
      });
    } catch (error) {
      dispatch(
        setToast({
          type: "error",
          message: error?.message || "Could not start login flow."
        })
      );
    } finally {
      setConnectingAuth(false);
    }
  }

  async function onCheckLoginStatus() {
    const jobUrl = String(jobUrlInput || "").trim();
    if (!jobUrl) {
      dispatch(setToast({ type: "error", message: "Enter a job URL first." }));
      return;
    }

    setCheckingAuth(true);
    try {
      const response = await fetch("/api/site-auth/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobUrl })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || "Failed to check login status.");
      }

      if (payload?.connected || payload?.authenticated) {
        setAuthStatus(null);
        dispatch(
          setToast({
            type: "success",
            message: `Authenticated on ${payload.site}. You can process the job now.`
          })
        );
      } else {
        setAuthStatus({
          requiresAuth: true,
          site: payload.site,
          loginUrl: payload.loginUrl || null,
          reason: "Still not authenticated"
        });
        dispatch(
          setToast({
            type: "error",
            message: `Not authenticated on ${payload.site} yet.`
          })
        );
      }
    } catch (error) {
      dispatch(
        setToast({
          type: "error",
          message: error?.message || "Could not verify login status."
        })
      );
    } finally {
      setCheckingAuth(false);
    }
  }

  async function onMarkApplied(jobId) {
    dispatch(setMarkingJobId(jobId));
    dispatch(clearToast());

    try {
      const response = await fetch(`/api/jobs/${jobId}/apply`, {
        method: "PATCH"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || "Failed to mark job as applied.");
      }

      if (payload?.job) {
        dispatch(replaceJob(payload.job));
      }
      dispatch(setToast({ type: "success", message: "Job marked as applied." }));
    } catch (error) {
      dispatch(
        setToast({
          type: "error",
          message: error?.message || "Unexpected error while updating job."
        })
      );
    } finally {
      dispatch(setMarkingJobId(null));
    }
  }

  return (
    <>
      {databaseError ? (
        <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }}>
          <Typography variant="body2" fontWeight={600} gutterBottom>
            Database unavailable
          </Typography>
          <Typography variant="body2">{databaseError}</Typography>
        </Alert>
      ) : null}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, md: 3 },
          mt: 2,
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider",
          background: "linear-gradient(135deg, #f8fbff 0%, #f5f9ff 40%, #f3fff8 100%)"
        }}
      >
        <Stack spacing={1.5}>
          <Typography variant="h5" fontWeight={700}>
            Process a job URL
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Paste a job URL and run profile-aware mapping directly.
          </Typography>
          <Box
            component="form"
            onSubmit={onProcessJob}
            sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", md: "1fr auto" } }}
          >
            <TextField
              name="jobUrl"
              type="url"
              required
              label="Job URL"
              value={jobUrlInput}
              onChange={(event) => setJobUrlInput(event.target.value)}
              placeholder="https://www.linkedin.com/jobs/view/..."
              fullWidth
            />
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={processing}
              startIcon={<WorkOutlineIcon />}
              sx={{ whiteSpace: "nowrap" }}
            >
              {processing ? "Processing..." : "Process Job"}
            </Button>
          </Box>
          {processing ? (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Processing… checking profile, site login, mappings, and apply flow.
              </Typography>
              <LinearProgress />
            </Box>
          ) : null}

          {!processing && processLog.length > 0 ? (
            <Collapse in>
              <Paper variant="outlined" sx={{ mt: 2, p: 2, borderRadius: 2, bgcolor: "action.hover" }}>
                <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                  Last process run
                </Typography>
                <List dense disablePadding sx={{ maxHeight: 280, overflow: "auto" }}>
                  {processLog.map((entry, i) => (
                    <ListItem key={`${entry.at}-${i}`} disableGutters sx={{ py: 0.25 }}>
                      <ListItemText
                        primary={
                          <Typography variant="body2" component="span" fontWeight={600}>
                            {entry.step}
                          </Typography>
                        }
                        secondary={
                          <>
                            <Typography variant="caption" color="text.secondary" display="block">
                              {entry.message}
                            </Typography>
                            <Typography variant="caption" color="text.disabled">
                              {entry.at ? new Date(entry.at).toLocaleString() : ""}
                            </Typography>
                          </>
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              </Paper>
            </Collapse>
          ) : null}

          {authStatus?.requiresAuth ? (
            <Alert severity="warning" sx={{ mt: 1 }}>
              <Stack spacing={1.5}>
                <Typography variant="body2">
                  This posting on <strong>{authStatus.site}</strong> needs an employer account session. Connect once
                  below so JobCopilot can use a saved browser login for that site.
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  The server opens a <strong>separate Chromium window</strong> on the computer running{" "}
                  <Box component="span" sx={{ fontFamily: "monospace", fontSize: "0.85em" }}>
                    npm run dev
                  </Box>{" "}
                  (port 4000). Check your Dock/taskbar for Chromium — signing in only inside this browser tab does{" "}
                  <em>not</em> save the session for automation. If no window appears, ensure{" "}
                  <Box component="span" sx={{ fontFamily: "monospace", fontSize: "0.85em" }}>
                    PLAYWRIGHT_CONNECT_HEADLESS
                  </Box>{" "}
                  is not set to{" "}
                  <Box component="span" sx={{ fontFamily: "monospace" }}>
                    true
                  </Box>{" "}
                  in{" "}
                  <Box component="span" sx={{ fontFamily: "monospace" }}>
                    .env
                  </Box>
                  .
                </Typography>
                {authStatus.loginUrl ? (
                  <Button
                    component="a"
                    href={authStatus.loginUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="text"
                    size="small"
                    startIcon={<OpenInNewIcon />}
                    sx={{ alignSelf: "flex-start", textTransform: "none" }}
                  >
                    Open job site (reference — use Chromium window to capture login)
                  </Button>
                ) : null}
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                  <Button
                    variant="outlined"
                    startIcon={<LoginIcon />}
                    onClick={onConnectSite}
                    disabled={connectingAuth}
                  >
                    {connectingAuth ? "Starting..." : "Connect site"}
                  </Button>
                  <Button variant="contained" onClick={onCheckLoginStatus} disabled={checkingAuth}>
                    {checkingAuth ? "Checking..." : "Check Login Status"}
                  </Button>
                </Stack>
              </Stack>
            </Alert>
          ) : null}

          {captchaAssist ? (
            <Alert severity="warning" icon={<SmartToyIcon />} sx={{ mt: 1 }}>
              <Stack spacing={1}>
                <Typography variant="body2" fontWeight={700}>
                  CAPTCHA Required → Resume Application
                </Typography>
                <Typography variant="body2">
                  {captchaAssist.nextAction}
                </Typography>
                {captchaAssist.prefillFields?.length ? (
                  <Typography variant="caption" color="text.secondary">
                    Prefill bundle ready for {captchaAssist.prefillFields.length} fields.
                  </Typography>
                ) : null}
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                  <Button
                    variant="contained"
                    onClick={() => {
                      if (captchaAssist?.jobUrl) {
                        window.open(captchaAssist.jobUrl, "_blank", "noopener,noreferrer");
                      }
                    }}
                  >
                    Open Job & Solve CAPTCHA
                  </Button>
                  <Button
                    variant="outlined"
                    disabled={!captchaAssist.prefillScript}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(captchaAssist.prefillScript);
                        dispatch(
                          setToast({
                            type: "success",
                            message: "Prefill script copied. Paste it in browser console on the job page."
                          })
                        );
                      } catch {
                        dispatch(
                          setToast({
                            type: "warning",
                            message: "Could not copy automatically. Open audit/process response and copy script manually."
                          })
                        );
                      }
                    }}
                  >
                    Copy Prefill Script
                  </Button>
                  <Button
                    variant="text"
                    onClick={() => setCaptchaAssist(null)}
                  >
                    Dismiss
                  </Button>
                </Stack>
              </Stack>
            </Alert>
          ) : null}
        </Stack>
      </Paper>

      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, md: 3 },
          mt: 2,
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider"
        }}
      >
        <Stack
          direction={{ xs: "column", md: "row" }}
          alignItems={{ xs: "flex-start", md: "center" }}
          justifyContent="space-between"
          spacing={2}
          mb={2}
        >
          <Typography variant="h5" fontWeight={700}>
            Your jobs
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Typography variant="body2" color="text.secondary">
              Page size
            </Typography>
            <FormControl size="small" sx={{ minWidth: 90 }}>
              <InputLabel id="page-size-label">Rows</InputLabel>
              <Select
                labelId="page-size-label"
                label="Rows"
                value={pageSize}
                onChange={(event) => {
                  dispatch(setPageSize(Number(event.target.value)));
                }}
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <MenuItem key={option} value={option}>
                    {option}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </Stack>

        <Stack direction="row" spacing={1} mb={2} flexWrap="wrap">
          {FILTERS.map((filter) => {
            const active = activeFilter === filter;
            return (
              <Chip
                key={filter}
                label={filterChipLabel(filter)}
                clickable
                color={active ? "primary" : "default"}
                variant={active ? "filled" : "outlined"}
                onClick={() => {
                  dispatch(setFilter(filter));
                }}
                sx={{ textTransform: "none" }}
              />
            );
          })}
        </Stack>

        {paginatedJobs.length === 0 ? (
          <Typography color="text.secondary">No jobs found for this filter.</Typography>
        ) : (
          <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>URL</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Match score</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedJobs.map((job) => (
                  <TableRow key={job.id} hover>
                    <TableCell sx={{ maxWidth: 360 }}>
                      <a href={job.url} target="_blank" rel="noreferrer" style={{ color: "#1565c0" }}>
                        {job.url}
                      </a>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={statusLabel(job.status)}
                        size="small"
                        color={statusColor(job.status)}
                        sx={{ textTransform: "none", color: "white" }}
                      />
                    </TableCell>
                    <TableCell>
                      {job.matchScore == null && (job.status === "processing" || isLocalJobId(job.id))
                        ? "—"
                        : `${job.matchScore ?? 0}%`}
                    </TableCell>
                    <TableCell>{new Date(job.createdAt).toLocaleString()}</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end" flexWrap="wrap">
                        <Button
                          variant="text"
                          size="small"
                          startIcon={<HistoryIcon />}
                          onClick={() => openAuditDialog(job)}
                        >
                          Audit log
                        </Button>
                        {job.status === "applied" ? (
                          <Typography variant="body2" color="text.secondary" sx={{ alignSelf: "center", px: 1 }}>
                            Applied
                          </Typography>
                        ) : job.status === "applying" || job.status === "processing" || isLocalJobId(job.id) ? (
                          <Typography variant="body2" color="text.secondary" sx={{ alignSelf: "center", px: 1 }}>
                            {job.status === "processing" || isLocalJobId(job.id) ? "Processing…" : "Applying…"}
                          </Typography>
                        ) : (
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<DoneAllIcon />}
                            onClick={() => onMarkApplied(job.id)}
                            disabled={markingJobId === job.id}
                          >
                            {markingJobId === job.id ? "Saving..." : "Mark applied"}
                          </Button>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        <Stack direction="row" alignItems="center" spacing={1.5} mt={2}>
          <Button
            variant="outlined"
            size="small"
            disabled={currentPage <= 1}
            onClick={() => dispatch(setPage(Math.max(1, currentPage - 1)))}
          >
            Previous
          </Button>
          <Typography variant="body2" color="text.secondary">
            Page {currentPage} of {totalPages}
          </Typography>
          <Button
            variant="outlined"
            size="small"
            disabled={currentPage >= totalPages}
            onClick={() => dispatch(setPage(Math.min(totalPages, currentPage + 1)))}
          >
            Next
          </Button>
        </Stack>
      </Paper>

      <Dialog
        open={Boolean(auditDialogJob)}
        onClose={() => setAuditDialogJob(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Apply audit log
          {auditDialogJob?.url ? (
            <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
              {auditDialogJob.url}
            </Typography>
          ) : null}
        </DialogTitle>
        <DialogContent dividers>
          {auditDialogJob && isLocalJobId(auditDialogJob.id) ? (
            <Typography color="text.secondary">
              Audit log is available after this run finishes and the job is saved.
            </Typography>
          ) : auditLoading ? (
            <LinearProgress />
          ) : auditLogs.length === 0 ? (
            <Typography color="text.secondary">No audit entries yet.</Typography>
          ) : (
            <List dense>
              {auditLogs.map((row) => (
                <ListItem key={row.id} alignItems="flex-start" disableGutters>
                  <ListItemText
                    primary={
                      <Typography variant="body2" fontWeight={600}>
                        {row.step}
                      </Typography>
                    }
                    secondary={
                      <>
                        <Typography variant="body2" color="text.secondary">
                          {row.message}
                        </Typography>
                        <Typography variant="caption" color="text.disabled">
                          {row.at ? new Date(row.at).toLocaleString() : ""}
                        </Typography>
                      </>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
      </Dialog>

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
    </>
  );
}
