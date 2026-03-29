"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import LinkIcon from "@mui/icons-material/Link";
import RefreshIcon from "@mui/icons-material/Refresh";
import VerifiedUserIcon from "@mui/icons-material/VerifiedUser";
import LinkOffIcon from "@mui/icons-material/LinkOff";

const PRESET_SITES = ["linkedin.com", "indeed.com", "greenhouse.io", "lever.co"];

function statusColor(status) {
  if (status === "connected") return "success";
  if (status === "blocked") return "warning";
  if (status === "pending") return "info";
  return "default";
}

export default function ConnectedSitesPanel() {
  const [siteInput, setSiteInput] = useState("");
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busySite, setBusySite] = useState(null);
  const [alert, setAlert] = useState(null);

  const knownSites = useMemo(() => {
    const fromSessions = sessions.map((session) => session.site);
    return [...new Set([...PRESET_SITES, ...fromSessions])];
  }, [sessions]);

  async function loadSessions() {
    setLoading(true);
    try {
      const response = await fetch("/api/site-auth/list", { method: "GET" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || "Failed to load connected sites.");
      }
      setSessions(Array.isArray(payload?.sessions) ? payload.sessions : []);
    } catch (error) {
      setAlert({ severity: "error", message: error?.message || "Failed to load connected sites." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSessions();
  }, []);

  function normalizeSite(rawValue) {
    const value = String(rawValue || "").trim().toLowerCase();
    if (!value) return "";
    try {
      const url = value.startsWith("http") ? new URL(value) : new URL(`https://${value}`);
      return url.hostname.replace(/^www\./, "");
    } catch {
      return value.replace(/^www\./, "");
    }
  }

  async function connectSite(site, reconnect = false) {
    const normalizedSite = normalizeSite(site);
    if (!normalizedSite) {
      setAlert({ severity: "error", message: "Site is required." });
      return;
    }

    setBusySite(normalizedSite);
    setAlert(null);
    try {
      const response = await fetch("/api/site-auth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site: normalizedSite, reconnect })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || "Failed to start connect flow.");
      }

      setAlert({
        severity: "success",
        message: `Connect flow started for ${normalizedSite}. Complete login in the opened browser and return here.`
      });
      await loadSessions();
    } catch (error) {
      setAlert({ severity: "error", message: error?.message || "Failed to start connect flow." });
    } finally {
      setBusySite(null);
    }
  }

  async function validateSite(site) {
    const normalizedSite = normalizeSite(site);
    setBusySite(normalizedSite);
    setAlert(null);
    try {
      const response = await fetch("/api/site-auth/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site: normalizedSite, validate: true })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || "Failed to validate site session.");
      }
      await loadSessions();
      setAlert({
        severity: payload?.status === "connected" ? "success" : "warning",
        message:
          payload?.status === "connected"
            ? `${normalizedSite} session is valid.`
            : `${normalizedSite} requires reconnect (${payload?.status || "unknown"}).`
      });
    } catch (error) {
      setAlert({ severity: "error", message: error?.message || "Failed to validate site session." });
    } finally {
      setBusySite(null);
    }
  }

  async function disconnectSite(site) {
    const normalizedSite = normalizeSite(site);
    setBusySite(normalizedSite);
    setAlert(null);
    try {
      const response = await fetch("/api/site-auth/start", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site: normalizedSite })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || "Failed to disconnect site.");
      }
      await loadSessions();
      setAlert({ severity: "success", message: `${normalizedSite} disconnected and session removed.` });
    } catch (error) {
      setAlert({ severity: "error", message: error?.message || "Failed to disconnect site." });
    } finally {
      setBusySite(null);
    }
  }

  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent>
        <Stack spacing={2}>
          <Box>
            <Typography variant="h6" fontWeight={700}>
              Connected Sites
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Connect once per site, validate saved sessions, or disconnect to remove stored auth state.
            </Typography>
          </Box>

          {alert ? <Alert severity={alert.severity}>{alert.message}</Alert> : null}

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              label="Add site"
              placeholder="linkedin.com"
              value={siteInput}
              onChange={(event) => setSiteInput(event.target.value)}
              fullWidth
            />
            <Button
              variant="contained"
              startIcon={<LinkIcon />}
              disabled={busySite !== null}
              onClick={() => {
                connectSite(siteInput, false);
                setSiteInput("");
              }}
            >
              Connect
            </Button>
          </Stack>

          <Divider />

          {loading ? (
            <Stack direction="row" alignItems="center" spacing={1}>
              <CircularProgress size={18} />
              <Typography variant="body2" color="text.secondary">
                Loading site sessions...
              </Typography>
            </Stack>
          ) : (
            <Stack spacing={1.25}>
              {knownSites.map((site) => {
                const session = sessions.find((item) => item.site === site);
                const status = session?.status || "disconnected";
                const busy = busySite === site;

                return (
                  <Box
                    key={site}
                    sx={{
                      border: "1px solid",
                      borderColor: "divider",
                      borderRadius: 2,
                      p: 1.5
                    }}
                  >
                    <Stack
                      direction={{ xs: "column", md: "row" }}
                      spacing={1.5}
                      justifyContent="space-between"
                      alignItems={{ xs: "flex-start", md: "center" }}
                    >
                      <Stack spacing={0.5}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography fontWeight={600}>{site}</Typography>
                          <Chip
                            size="small"
                            label={status}
                            color={statusColor(status)}
                            sx={{ textTransform: "capitalize" }}
                          />
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          {session?.blockerMessage
                            ? `Blocker: ${session.blockerMessage}`
                            : session?.lastCheckedAt
                              ? `Last checked: ${new Date(session.lastCheckedAt).toLocaleString()}`
                              : "No saved session yet"}
                        </Typography>
                      </Stack>

                      <Stack direction="row" spacing={1} flexWrap="wrap">
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<LinkIcon />}
                          disabled={busy}
                          onClick={() => connectSite(site, status !== "disconnected")}
                        >
                          {status === "disconnected" ? "Connect" : "Reconnect"}
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<VerifiedUserIcon />}
                          disabled={busy}
                          onClick={() => validateSite(site)}
                        >
                          Validate
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          startIcon={<LinkOffIcon />}
                          disabled={busy || status === "disconnected"}
                          onClick={() => disconnectSite(site)}
                        >
                          Disconnect
                        </Button>
                        {busy ? <CircularProgress size={18} sx={{ alignSelf: "center" }} /> : null}
                      </Stack>
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
