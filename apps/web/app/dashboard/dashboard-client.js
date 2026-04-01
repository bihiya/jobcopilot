"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";
import { useDispatch, useSelector } from "react-redux";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import WorkOutlineIcon from "@mui/icons-material/WorkOutline";
import LoginIcon from "@mui/icons-material/Login";
import HistoryIcon from "@mui/icons-material/History";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ShareOutlinedIcon from "@mui/icons-material/ShareOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
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
import { buildPrefillBookmarkletHref } from "@/lib/prefill-bookmarklet";
import { buildAuditShareText } from "@/lib/audit-share-text";

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

function mergeAuditByTime(prev, next) {
  const byId = new Map();
  for (const r of prev || []) {
    if (r?.id) byId.set(r.id, r);
  }
  for (const r of next || []) {
    if (r?.id) byId.set(r.id, r);
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime()
  );
}

function renderAuditMeta(row) {
  if (!row?.meta || typeof row.meta !== "object") return null;
  const meta = row.meta;
  const parts = [];
  if (meta.parsedFieldCount != null) parts.push(`Fields detected on screen: ${meta.parsedFieldCount}`);
  if (meta.buttonCount != null || meta.count != null) {
    parts.push(`Buttons/controls detected: ${meta.buttonCount ?? meta.count}`);
  }
  if (meta.framesSampled != null) parts.push(`Frames sampled: ${meta.framesSampled}`);
  if (meta.summary) parts.push(`OpenAI recommendation summary: ${meta.summary}`);
  if (Array.isArray(meta.steps) && meta.steps.length) {
    parts.push(`Suggested next steps:\n${meta.steps.map((step, idx) => `${idx + 1}. ${step}`).join("\n")}`);
  }
  if (Array.isArray(meta.fieldLabelsSample) && meta.fieldLabelsSample.length) {
    parts.push(`Field labels sample: ${meta.fieldLabelsSample.join(", ")}`);
  }
  if (Array.isArray(meta.buttons) && meta.buttons.length) {
    parts.push(
      `Visible controls sample:\n${meta.buttons
        .slice(0, 15)
        .map((btn, idx) => `${idx + 1}. ${btn.text || btn.ariaLabel || btn.tag || "(unnamed control)"}`)
        .join("\n")}`
    );
  }
  return parts.length ? parts.join("\n\n") : JSON.stringify(meta, null, 2);
}

export default function DashboardClient({ initialJobs, initialFilter, initialPage, databaseError }) {
  const dispatch = useDispatch();
  const {
    jobs,
    processing,
    markingJobId,
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
  const [prefillSessionKey, setPrefillSessionKey] = useState(null);
  const [pageOrigin, setPageOrigin] = useState("");
  const [advancedPrefillOpen, setAdvancedPrefillOpen] = useState(false);
  const [captchaAcknowledged, setCaptchaAcknowledged] = useState(false);
  const [deletingJobId, setDeletingJobId] = useState(null);
  const auditDialogJobRef = useRef(null);
  const liveAuditBufferRef = useRef(new Map());
  const liveAuditCleanupRef = useRef(null);

  auditDialogJobRef.current = auditDialogJob;

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

  useEffect(() => {
    return () => {
      liveAuditCleanupRef.current?.();
    };
  }, []);

  useEffect(() => {
    setPageOrigin(typeof window !== "undefined" ? window.location.origin : "");
  }, []);

  useEffect(() => {
    const script = captchaAssist?.prefillScript;
    if (!script) {
      setPrefillSessionKey(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/prefill/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ script })
        });
        const data = await r.json().catch(() => ({}));
        if (!cancelled && r.ok && data.key) {
          setPrefillSessionKey(data.key);
        } else if (!cancelled) {
          setPrefillSessionKey(null);
        }
      } catch {
        if (!cancelled) setPrefillSessionKey(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [captchaAssist?.prefillScript]);

  useEffect(() => {
    setCaptchaAcknowledged(false);
  }, [captchaAssist]);

  const filteredJobs = useMemo(() => {
    if (activeFilter === "all") return jobs;
    return jobs.filter((job) => job.status === activeFilter);
  }, [jobs, activeFilter]);

  const currentPage = Math.max(1, page);
  const jobColumns = useMemo(
    () => [
      {
        field: "url",
        headerName: "URL",
        flex: 1,
        minWidth: 260,
        renderCell: (params) => (
          <a href={params.row.url} target="_blank" rel="noreferrer" style={{ color: "#1565c0" }}>
            {params.row.url}
          </a>
        )
      },
      {
        field: "status",
        headerName: "Status",
        minWidth: 140,
        renderCell: (params) => (
          <Chip
            label={statusLabel(params.row.status)}
            size="small"
            color={statusColor(params.row.status)}
            sx={{ textTransform: "none", color: "white", mt: 1 }}
          />
        )
      },
      {
        field: "matchScore",
        headerName: "Match score",
        minWidth: 120,
        valueGetter: (_, row) =>
          row.matchScore == null && (row.status === "processing" || isLocalJobId(row.id))
            ? "—"
            : `${row.matchScore ?? 0}%`
      },
      {
        field: "createdAt",
        headerName: "Created",
        minWidth: 170,
        valueGetter: (_, row) => new Date(row.createdAt).toLocaleString()
      },
      {
        field: "actions",
        headerName: "Actions",
        minWidth: 320,
        sortable: false,
        filterable: false,
        renderCell: (params) => (
          <Stack direction="row" spacing={0.5} justifyContent="flex-end" flexWrap="wrap" sx={{ mt: 0.5 }}>
            <Button variant="text" size="small" startIcon={<HistoryIcon />} onClick={() => openAuditDialog(params.row)}>
              Audit log
            </Button>
            <Button
              variant="text"
              size="small"
              color="error"
              startIcon={<DeleteOutlineIcon />}
              disabled={deletingJobId === params.row.id}
              onClick={() => onDeleteJob(params.row)}
            >
              {deletingJobId === params.row.id ? "Deleting…" : "Delete"}
            </Button>
            {params.row.status === "applied" ? (
              <Typography variant="body2" color="text.secondary" sx={{ alignSelf: "center", px: 1 }}>
                Applied
              </Typography>
            ) : params.row.status === "applying" ||
              params.row.status === "processing" ||
              isLocalJobId(params.row.id) ? (
              <Typography variant="body2" color="text.secondary" sx={{ alignSelf: "center", px: 1 }}>
                {params.row.status === "processing" || isLocalJobId(params.row.id)
                  ? "Processing…"
                  : "Applying…"}
              </Typography>
            ) : (
              <Button
                variant="outlined"
                size="small"
                startIcon={<DoneAllIcon />}
                onClick={() => onMarkApplied(params.row.id)}
                disabled={markingJobId === params.row.id}
              >
                {markingJobId === params.row.id ? "Saving..." : "Mark applied"}
              </Button>
            )}
          </Stack>
        )
      }
    ],
    [deletingJobId, markingJobId, openAuditDialog]
  );

  function closeAuditDialog() {
    setAuditDialogJob(null);
    setAuditLogs([]);
    setAuditLoading(false);
  }

  const openAuditDialog = useCallback(
    async (job) => {
      if (!job?.id) return;
      setAuditDialogJob(job);

      const buffered = liveAuditBufferRef.current.get(job.id);
      if (buffered?.length) {
        setAuditLogs(buffered);
      } else {
        setAuditLogs([]);
      }

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
        setAuditLogs((prev) => mergeAuditByTime(prev, data.logs || []));
      } catch {
        dispatch(setToast({ type: "error", message: "Failed to load audit log." }));
        setAuditLogs([]);
      } finally {
        setAuditLoading(false);
      }
    },
    [dispatch]
  );

  function stopLiveAudit() {
    liveAuditCleanupRef.current?.();
    liveAuditCleanupRef.current = null;
  }

  async function startLiveAuditForJob(jobId) {
    stopLiveAudit();
    try {
      const tokenRes = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/audit/socket-token`, {
        method: "POST"
      });
      const tokenPayload = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || !tokenPayload.token) {
        return;
      }
      const socketUrl = tokenPayload.socketUrl || "http://localhost:4000";
      const socket = io(socketUrl, {
        path: "/socket.io",
        auth: { token: tokenPayload.token },
        transports: ["websocket", "polling"]
      });

      const appendEntry = (entry) => {
        if (!entry?.id) return;
        const list = liveAuditBufferRef.current.get(jobId) || [];
        if (list.some((e) => e.id === entry.id)) return;
        list.push(entry);
        liveAuditBufferRef.current.set(jobId, list);
        if (auditDialogJobRef.current?.id === jobId) {
          setAuditLogs([...list]);
        }
      };

      socket.on("audit:entry", appendEntry);

      const poll = async () => {
        try {
          const r = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/audit`);
          const data = await r.json().catch(() => ({}));
          if (r.ok && Array.isArray(data.logs)) {
            const merged = mergeAuditByTime(liveAuditBufferRef.current.get(jobId) || [], data.logs);
            liveAuditBufferRef.current.set(jobId, merged);
            if (auditDialogJobRef.current?.id === jobId) {
              setAuditLogs(merged);
            }
          }
        } catch {
          /* ignore */
        }
      };

      await poll();
      const pollId = setInterval(poll, 2000);

      liveAuditCleanupRef.current = () => {
        socket.disconnect();
        clearInterval(pollId);
      };
    } catch {
      /* live audit is optional */
    }
  }

  function handleProcessOutcome(payload, options = {}) {
    const { replaceOptimisticWithJob } = options;
    const jobUrl =
      (typeof options.jobUrl === "string" && options.jobUrl.trim() !== ""
        ? options.jobUrl
        : null) ??
      (typeof payload?.job?.url === "string" ? payload.job.url : "") ??
      "";
    if (payload?.error) {
      replaceOptimisticWithJob(null);
      dispatch(setToast({ type: "error", message: payload.message || "Process failed." }));
      return;
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
            "Use the CAPTCHA dialog: open the job page, complete the human check, then use the fill helper bookmark if needed.",
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

    let processingAsync = false;
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

      if (payload.resumed) {
        handleProcessOutcome(payload, { jobUrl, replaceOptimisticWithJob });
        return;
      }

      if (response.status === 202 && payload?.processing && payload?.job?.id && payload?.idempotencyKey) {
        processingAsync = true;
        const { job, idempotencyKey } = payload;
        replaceOptimisticWithJob(job);
        dispatch(upsertJob(job));
        if (
          auditDialogJobRef.current &&
          isLocalJobId(auditDialogJobRef.current.id) &&
          auditDialogJobRef.current.url === jobUrl
        ) {
          setAuditDialogJob(job);
          setAuditLogs(liveAuditBufferRef.current.get(job.id) || []);
          setAuditLoading(false);
        }
        startLiveAuditForJob(job.id);

        const pollOutcome = async () => {
          const maxMs = 15 * 60 * 1000;
          const start = Date.now();
          try {
            while (Date.now() - start < maxMs) {
              await new Promise((r) => setTimeout(r, 1000));
              const r = await fetch(
                `/api/process/outcome?idempotencyKey=${encodeURIComponent(idempotencyKey)}`
              );
              const data = await r.json().catch(() => ({}));
              if (data.pending) {
                continue;
              }
              if (data.done && data.outcome) {
                stopLiveAudit();
                handleProcessOutcome(data.outcome, { jobUrl, replaceOptimisticWithJob });
                return;
              }
            }
            stopLiveAudit();
            dispatch(setToast({ type: "error", message: "Job processing timed out." }));
          } finally {
            dispatch(setProcessing(false));
          }
        };

        pollOutcome();
        return;
      }

      handleProcessOutcome(payload, { jobUrl, replaceOptimisticWithJob });
    } catch (error) {
      stopLiveAudit();
      dispatch(removeJob(tempId));
      dispatch(
        setToast({
          type: "error",
          message: error?.message || "Unexpected error while processing job."
        })
      );
    } finally {
      if (!processingAsync) {
        dispatch(setProcessing(false));
      }
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

  async function onDeleteJob(job) {
    if (!job?.id) return;
    if (
      !window.confirm(
        `Delete this job from your list?\n\n${String(job.url || "").slice(0, 200)}${String(job.url || "").length > 200 ? "…" : ""}`
      )
    ) {
      return;
    }

    if (isLocalJobId(job.id)) {
      dispatch(removeJob(job.id));
      liveAuditBufferRef.current.delete(job.id);
      if (auditDialogJob?.id === job.id) {
        closeAuditDialog();
      }
      dispatch(setToast({ type: "success", message: "Removed from list." }));
      return;
    }

    setDeletingJobId(job.id);
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(job.id)}`, {
        method: "DELETE"
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Failed to delete job.");
      }
      dispatch(removeJob(job.id));
      liveAuditBufferRef.current.delete(job.id);
      if (auditDialogJob?.id === job.id) {
        closeAuditDialog();
      }
      dispatch(setToast({ type: "success", message: "Job deleted." }));
    } catch (error) {
      dispatch(
        setToast({
          type: "error",
          message: error?.message || "Could not delete job."
        })
      );
    } finally {
      setDeletingJobId(null);
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

        {filteredJobs.length === 0 ? (
          <Typography color="text.secondary">No jobs found for this filter.</Typography>
        ) : (
          <Box sx={{ height: 520 }}>
            <DataGrid
              rows={filteredJobs}
              columns={jobColumns}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              pagination
              paginationModel={{ page: currentPage - 1, pageSize }}
              onPaginationModelChange={(model) => {
                dispatch(setPage(model.page + 1));
                dispatch(setPageSize(model.pageSize));
              }}
              disableRowSelectionOnClick
            />
          </Box>
        )}
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
              Saving the job… Live audit entries appear here as soon as the server assigns a job id (usually within a
              second). You can close this dialog and reopen it from the table.
            </Typography>
          ) : auditLoading ? (
            <LinearProgress />
          ) : auditLogs.length === 0 ? (
            <Typography color="text.secondary">No audit entries yet.</Typography>
          ) : (
            <List dense>
              {auditLogs.map((row) => (
                <ListItem key={row.id} alignItems="flex-start" disableGutters>
                  <Accordion disableGutters sx={{ width: "100%" }}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <ListItemText
                        primary={
                          <Typography variant="body2" fontWeight={700}>
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
                    </AccordionSummary>
                    <AccordionDetails>
                      <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
                        {renderAuditMeta(row) || "No additional details captured for this step."}
                      </Typography>
                    </AccordionDetails>
                  </Accordion>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, gap: 1, flexWrap: "wrap", justifyContent: "space-between" }}>
          <Button
            variant="contained"
            startIcon={<ShareOutlinedIcon />}
            disabled={!auditDialogJob?.url || auditLogs.length === 0}
            onClick={async () => {
              const text = buildAuditShareText({
                jobUrl: auditDialogJob.url,
                auditRows: auditLogs
              });
              try {
                await navigator.clipboard.writeText(text);
                dispatch(
                  setToast({
                    type: "success",
                    message: "Share report copied — paste into Slack, email, or notes."
                  })
                );
              } catch {
                dispatch(
                  setToast({
                    type: "error",
                    message: "Clipboard not available. Copy the audit lines manually."
                  })
                );
              }
            }}
          >
            Copy share report
          </Button>
          <Button variant="outlined" onClick={() => setAuditDialogJob(null)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(captchaAssist)}
        onClose={() => {
          setCaptchaAssist(null);
          setAdvancedPrefillOpen(false);
        }}
        maxWidth="sm"
        fullWidth
        scroll="paper"
        aria-labelledby="captcha-dialog-title"
      >
        <DialogTitle id="captcha-dialog-title">
          <Stack direction="row" alignItems="center" spacing={1}>
            <SmartToyIcon color="warning" />
            <span>CAPTCHA required — your action</span>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              The employer site showed a human check (CAPTCHA). Automation cannot complete it for you. Follow the
              steps below, then confirm at the bottom.
            </Typography>
            <Typography variant="body2">{captchaAssist?.nextAction}</Typography>
            {captchaAssist?.prefillFields?.length ? (
              <Typography variant="caption" color="text.secondary">
                Mapped values ready for {captchaAssist.prefillFields.length} field
                {captchaAssist.prefillFields.length === 1 ? "" : "s"}.
              </Typography>
            ) : null}
            <Typography variant="body2">
              <strong>Fill helper:</strong> copy the bookmarklet URL, add it as a bookmark, open the job page, solve the
              CAPTCHA, then click the bookmark once to apply your saved field values.
            </Typography>
            {prefillSessionKey && pageOrigin ? (
              <Stack spacing={1}>
                <Button
                  variant="contained"
                  onClick={async () => {
                    const href = buildPrefillBookmarkletHref(pageOrigin, prefillSessionKey);
                    try {
                      await navigator.clipboard.writeText(href);
                      dispatch(
                        setToast({
                          type: "success",
                          message:
                            "Bookmarklet URL copied. Create a bookmark with this URL, then use it on the job page after the CAPTCHA."
                        })
                      );
                    } catch {
                      dispatch(
                        setToast({
                          type: "warning",
                          message: "Copy the URL from the field below manually."
                        })
                      );
                    }
                  }}
                >
                  Copy fill helper (bookmarklet URL)
                </Button>
                <TextField
                  size="small"
                  fullWidth
                  label="Bookmark URL"
                  value={buildPrefillBookmarkletHref(pageOrigin, prefillSessionKey)}
                  InputProps={{ readOnly: true }}
                  onFocus={(e) => e.target.select()}
                />
              </Stack>
            ) : (
              <Typography variant="caption" color="text.secondary">
                Preparing a one-time fill link…
              </Typography>
            )}
            <Button
              size="small"
              variant="text"
              onClick={() => setAdvancedPrefillOpen((o) => !o)}
              sx={{ alignSelf: "flex-start", textTransform: "none" }}
            >
              {advancedPrefillOpen ? "Hide" : "Show"} advanced (raw script)
            </Button>
            <Collapse in={advancedPrefillOpen}>
              <Stack spacing={1}>
                <Button
                  variant="outlined"
                  size="small"
                  disabled={!captchaAssist?.prefillScript}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(captchaAssist.prefillScript);
                      dispatch(setToast({ type: "success", message: "Raw script copied." }));
                    } catch {
                      dispatch(setToast({ type: "warning", message: "Could not copy raw script." }));
                    }
                  }}
                >
                  Copy raw script
                </Button>
              </Stack>
            </Collapse>
            <Button
              variant="outlined"
              startIcon={<OpenInNewIcon />}
              onClick={() => {
                if (captchaAssist?.jobUrl) {
                  window.open(captchaAssist.jobUrl, "_blank", "noopener,noreferrer");
                }
              }}
            >
              Open job page in new tab
            </Button>
            <FormControlLabel
              control={
                <Checkbox
                  checked={captchaAcknowledged}
                  onChange={(e) => setCaptchaAcknowledged(e.target.checked)}
                  color="primary"
                />
              }
              label="I finished the CAPTCHA (and used the fill helper on the job page if needed)."
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, flexWrap: "wrap", gap: 1 }}>
          <Button
            onClick={() => {
              setCaptchaAssist(null);
              setAdvancedPrefillOpen(false);
            }}
          >
            Dismiss
          </Button>
          <Button
            variant="contained"
            disabled={!captchaAcknowledged}
            onClick={() => {
              setCaptchaAssist(null);
              setAdvancedPrefillOpen(false);
              dispatch(
                setToast({
                  type: "success",
                  message:
                    "Noted. If you have not submitted the application yet, complete it on the employer site."
                })
              );
            }}
          >
            Done
          </Button>
        </DialogActions>
      </Dialog>

    </>
  );
}
