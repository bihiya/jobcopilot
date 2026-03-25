"use client";

import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
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

const FILTERS = ["all", "pending", "ready", "applied"];
const PAGE_SIZE_OPTIONS = [5, 10, 25];

function statusColor(status) {
  if (status === "applied") return "success";
  if (status === "ready") return "info";
  return "warning";
}

export default function DashboardClient({ initialJobs, initialFilter, initialPage }) {
  const [jobs, setJobs] = useState(initialJobs);
  const [processing, setProcessing] = useState(false);
  const [markingJobId, setMarkingJobId] = useState(null);
  const [toast, setToast] = useState(null);
  const [activeFilter, setActiveFilter] = useState(
    FILTERS.includes(initialFilter) ? initialFilter : "all"
  );
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(Math.max(1, Number(initialPage || 1)));
  const [jobUrlInput, setJobUrlInput] = useState("");

  const filteredJobs = useMemo(() => {
    if (activeFilter === "all") return jobs;
    return jobs.filter((job) => job.status === activeFilter);
  }, [jobs, activeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const paginatedJobs = filteredJobs.slice(start, start + pageSize);

  async function onProcessJob(event) {
    event.preventDefault();
    const jobUrl = String(jobUrlInput || "").trim();

    if (!jobUrl) {
      setToast({ type: "error", message: "Job URL is required." });
      return;
    }

    setProcessing(true);
    setToast(null);

    try {
      const response = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobUrl, formFields: [] })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || "Failed to process job.");
      }

      if (payload?.job) {
        setJobs((prev) => [payload.job, ...prev.filter((item) => item.id !== payload.job.id)]);
      }
      setJobUrlInput("");
      setToast({ type: "success", message: "Job processed successfully." });
    } catch (error) {
      setToast({
        type: "error",
        message: error?.message || "Unexpected error while processing job."
      });
    } finally {
      setProcessing(false);
    }
  }

  async function onMarkApplied(jobId) {
    setMarkingJobId(jobId);
    setToast(null);

    try {
      const response = await fetch(`/api/jobs/${jobId}/apply`, {
        method: "PATCH"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || "Failed to mark job as applied.");
      }

      if (payload?.job) {
        setJobs((prev) =>
          prev.map((job) => (job.id === payload.job.id ? payload.job : job))
        );
      }
      setToast({ type: "success", message: "Job marked as applied." });
    } catch (error) {
      setToast({
        type: "error",
        message: error?.message || "Unexpected error while updating job."
      });
    } finally {
      setMarkingJobId(null);
    }
  }

  return (
    <>
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
                  setPageSize(Number(event.target.value));
                  setPage(1);
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
                label={filter}
                clickable
                color={active ? "primary" : "default"}
                variant={active ? "filled" : "outlined"}
                onClick={() => {
                  setActiveFilter(filter);
                  setPage(1);
                }}
                sx={{ textTransform: "capitalize" }}
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
                  <TableCell>Actions</TableCell>
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
                        {job.status}
                        size="small"
                        color={statusColor(job.status)}
                        sx={{ textTransform: "capitalize", color: "white" }}
                      />
                    </TableCell>
                    <TableCell>{job.matchScore ?? 0}%</TableCell>
                    <TableCell>{new Date(job.createdAt).toLocaleString()}</TableCell>
                    <TableCell>
                      {job.status === "applied" ? (
                        <Typography variant="body2" color="text.secondary">
                          Already applied
                        </Typography>
                      ) : (
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<DoneAllIcon />}
                          onClick={() => onMarkApplied(job.id)}
                          disabled={markingJobId === job.id}
                        >
                          {markingJobId === job.id ? "Saving..." : "Mark as applied"}
                        </Button>
                      )}
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
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
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
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          >
            Next
          </Button>
        </Stack>
      </Paper>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={3500}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          onClose={() => setToast(null)}
          severity={toast?.type === "error" ? "error" : "success"}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {toast?.message || ""}
        </Alert>
      </Snackbar>
    </>
  );
}
