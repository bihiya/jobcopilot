"use client";

import { useCallback, useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { setToast } from "@/lib/store/dashboard-slice";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  FormGroup,
  LinearProgress,
  Link,
  Paper,
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
import SearchIcon from "@mui/icons-material/Search";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";

const defaultForm = {
  sourceLinkedIn: true,
  sourceGoogle: true,
  query: "",
  title: "",
  description: "",
  location: "",
  limit: 10,
  linkedinSearchUrl: "",
  googleSearchUrl: ""
};

function normalizePrefsFromProfile(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...defaultForm };
  }
  const sources = Array.isArray(raw.sources) ? raw.sources.map((s) => String(s).toLowerCase()) : [];
  const su =
    raw.searchUrlBySource && typeof raw.searchUrlBySource === "object"
      ? raw.searchUrlBySource
      : {};
  return {
    sourceLinkedIn: sources.length === 0 ? true : sources.includes("linkedin"),
    sourceGoogle: sources.length === 0 ? true : sources.includes("google"),
    query: typeof raw.query === "string" ? raw.query : "",
    title: typeof raw.title === "string" ? raw.title : "",
    description: typeof raw.description === "string" ? raw.description : "",
    location: typeof raw.location === "string" ? raw.location : "",
    limit: Math.min(50, Math.max(1, Number(raw.limit) || 10)),
    linkedinSearchUrl: typeof su.linkedin === "string" ? su.linkedin : "",
    googleSearchUrl: typeof su.google === "string" ? su.google : ""
  };
}

function buildJobSearchPreferences(form) {
  const sources = [];
  if (form.sourceLinkedIn) sources.push("linkedin");
  if (form.sourceGoogle) sources.push("google");
  const searchUrlBySource = {};
  if (form.linkedinSearchUrl.trim()) {
    searchUrlBySource.linkedin = form.linkedinSearchUrl.trim();
  }
  if (form.googleSearchUrl.trim()) {
    searchUrlBySource.google = form.googleSearchUrl.trim();
  }
  return {
    sources,
    query: form.query.trim(),
    title: form.title.trim(),
    description: form.description.trim(),
    location: form.location.trim(),
    limit: form.limit,
    mode: "default",
    compliance: {},
    ...(Object.keys(searchUrlBySource).length > 0 ? { searchUrlBySource } : {})
  };
}

export default function JobDiscoveryPanel({ databaseError }) {
  const dispatch = useDispatch();
  const [form, setForm] = useState(defaultForm);
  const [externalJobs, setExternalJobs] = useState([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingExternal, setLoadingExternal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoadingProfile(true);
    try {
      const r = await fetch("/api/profile");
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.profile) {
        setForm(normalizePrefsFromProfile(data.profile.jobSearchPreferences));
      }
    } catch {
      /* keep defaults */
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  const loadExternalJobs = useCallback(async () => {
    setLoadingExternal(true);
    try {
      const r = await fetch("/api/jobs/external");
      const data = await r.json().catch(() => ({}));
      if (r.ok && Array.isArray(data.jobs)) {
        setExternalJobs(data.jobs);
      } else {
        setExternalJobs([]);
      }
    } catch {
      setExternalJobs([]);
    } finally {
      setLoadingExternal(false);
    }
  }, []);

  useEffect(() => {
    if (databaseError) return;
    loadProfile();
    loadExternalJobs();
  }, [databaseError, loadProfile, loadExternalJobs]);

  async function onSavePreferences(event) {
    event.preventDefault();
    const prefs = buildJobSearchPreferences(form);
    if (prefs.sources.length === 0) {
      dispatch(
        setToast({ type: "error", message: "Select at least one source (LinkedIn or Google)." })
      );
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobSearchPreferences: prefs })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(data?.error || "Could not save preferences.");
      }
      dispatch(setToast({ type: "success", message: "Search preferences saved." }));
    } catch (e) {
      dispatch(setToast({ type: "error", message: e?.message || "Save failed." }));
    } finally {
      setSaving(false);
    }
  }

  async function onFetchJobs() {
    const prefs = buildJobSearchPreferences(form);
    if (prefs.sources.length === 0) {
      dispatch(
        setToast({ type: "error", message: "Select at least one source (LinkedIn or Google)." })
      );
      return;
    }
    setFetching(true);
    try {
      const saveR = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobSearchPreferences: prefs })
      });
      const saveData = await saveR.json().catch(() => ({}));
      if (!saveR.ok) {
        throw new Error(saveData?.error || "Could not save preferences before fetch.");
      }
      const r = await fetch("/api/jobs/fetch-preferences", { method: "POST" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(data?.error || data?.message || "Fetch failed.");
      }
      const saved = data.totalSaved ?? 0;
      const blockerDetail =
        Array.isArray(data.blockers) && data.blockers.length > 0
          ? ` Blocked: ${data.blockers.map((b) => `${b.source}: ${b.blocker?.message || b.blocker?.type || "?"}`).join("; ")}`
          : "";
      const warnDetail =
        Array.isArray(data.warnings) && data.warnings.length > 0
          ? ` Note: ${data.warnings.map((w) => `${w.source} used fallback (${w.warning?.message || w.warning?.type || "degraded"})`).join("; ")}`
          : "";
      dispatch(
        setToast({
          type: data.blockers?.length ? "warning" : "success",
          message: `Fetch finished. Saved ${saved} job row(s).${blockerDetail}${warnDetail}`
        })
      );
      await loadExternalJobs();
    } catch (e) {
      dispatch(setToast({ type: "error", message: e?.message || "Fetch failed." }));
    } finally {
      setFetching(false);
    }
  }

  if (databaseError) {
    return (
      <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }}>
        <Typography variant="body2" fontWeight={600} gutterBottom>
          Database unavailable
        </Typography>
        <Typography variant="body2">{databaseError}</Typography>
      </Alert>
    );
  }

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2, md: 3 },
        mt: 0,
        borderRadius: 3,
        border: "1px solid",
        borderColor: "divider",
        background: "linear-gradient(135deg, #faf8ff 0%, #f5f9ff 50%, #f8fff9 100%)"
      }}
    >
      <Stack spacing={2}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
          <Typography variant="subtitle1" fontWeight={700} color="text.secondary">
            Search &amp; filters
          </Typography>
          <Button
            size="small"
            variant="outlined"
            startIcon={<RefreshRoundedIcon />}
            onClick={() => {
              loadProfile();
              loadExternalJobs();
            }}
            disabled={loadingProfile || loadingExternal || fetching}
          >
            Refresh list
          </Button>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          Choose LinkedIn and/or Google, set keywords and location. &quot;Fetch jobs now&quot; saves your preferences
          and runs the search; use &quot;Save preferences&quot; if you only want to store settings. Fetched rows
          appear in the table below.
        </Typography>

        {loadingProfile ? <LinearProgress /> : null}

        <Box component="form" onSubmit={onSavePreferences}>
          <Stack spacing={2}>
            <FormGroup row sx={{ gap: 2 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.sourceLinkedIn}
                    onChange={(e) => setForm((f) => ({ ...f, sourceLinkedIn: e.target.checked }))}
                  />
                }
                label="LinkedIn"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.sourceGoogle}
                    onChange={(e) => setForm((f) => ({ ...f, sourceGoogle: e.target.checked }))}
                  />
                }
                label="Google"
              />
            </FormGroup>

            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label="Search query"
                value={form.query}
                onChange={(e) => setForm((f) => ({ ...f, query: e.target.value }))}
                placeholder="e.g. senior react developer"
                fullWidth
              />
              <TextField
                label="Location"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="e.g. Berlin"
                fullWidth
              />
              <TextField
                label="Max jobs / source"
                type="number"
                inputProps={{ min: 1, max: 50 }}
                value={form.limit}
                onChange={(e) =>
                  setForm((f) => ({ ...f, limit: Math.min(50, Math.max(1, Number(e.target.value) || 10)) }))
                }
                sx={{ minWidth: 140 }}
              />
            </Stack>

            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label="Title filter (optional)"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                fullWidth
              />
              <TextField
                label="Description filter (optional)"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                fullWidth
              />
            </Stack>

            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label="Custom LinkedIn search URL (optional)"
                value={form.linkedinSearchUrl}
                onChange={(e) => setForm((f) => ({ ...f, linkedinSearchUrl: e.target.value }))}
                placeholder="https://www.linkedin.com/jobs/search/?keywords=..."
                fullWidth
              />
              <TextField
                label="Custom Google search URL (optional)"
                value={form.googleSearchUrl}
                onChange={(e) => setForm((f) => ({ ...f, googleSearchUrl: e.target.value }))}
                placeholder="https://www.google.com/search?q=..."
                fullWidth
              />
            </Stack>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              <Button
                type="submit"
                variant="outlined"
                startIcon={<SaveOutlinedIcon />}
                disabled={saving || fetching || loadingProfile}
              >
                {saving ? "Saving…" : "Save preferences"}
              </Button>
              <Button
                type="button"
                variant="contained"
                startIcon={<SearchIcon />}
                onClick={onFetchJobs}
                disabled={saving || fetching || loadingProfile}
              >
                {fetching ? "Fetching…" : "Fetch jobs now"}
              </Button>
            </Stack>
          </Stack>
        </Box>

        <Typography variant="subtitle1" fontWeight={700} sx={{ pt: 1 }}>
          Fetched openings
        </Typography>
        {loadingExternal ? <LinearProgress /> : null}
        <TableContainer sx={{ maxHeight: 360, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Title</TableCell>
                <TableCell>Company</TableCell>
                <TableCell>Source</TableCell>
                <TableCell>Location</TableCell>
                <TableCell align="right">Score</TableCell>
                <TableCell>Link</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {externalJobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Typography variant="body2" color="text.secondary">
                      No discovered jobs yet. Save preferences and click &quot;Fetch jobs now&quot;, or refresh the list.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                externalJobs.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell sx={{ maxWidth: 220 }}>{row.title}</TableCell>
                    <TableCell sx={{ maxWidth: 160 }}>{row.company || "—"}</TableCell>
                    <TableCell>{row.source}</TableCell>
                    <TableCell sx={{ maxWidth: 140 }}>{row.location || "—"}</TableCell>
                    <TableCell align="right">{row.score != null ? Math.round(row.score) : "—"}</TableCell>
                    <TableCell sx={{ maxWidth: 120 }}>
                      {row.url ? (
                        <Link href={row.url} target="_blank" rel="noopener noreferrer" variant="body2">
                          Open
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Stack>
    </Paper>
  );
}
