const path = require("path");
const http = require("http");
require("dotenv").config({
  path: path.join(__dirname, "../../.env")
});

const express = require("express");
const {
  isDatabaseUnavailableError,
  databaseUnavailableResponse
} = require("./db-connection-error");
const { prepareProcessJob, runProcessJobPipeline } = require("./processJob");
const {
  markProcessFailure,
  setProcessOutcome,
  getProcessOutcome
} = require("./processStateStore");
const { attachAuditSocket } = require("./auditSocket");
const {
  beginSiteAuthSession,
  listSiteAuthSessions,
  disconnectSiteAuthSession,
  validateSiteAuthSession,
  normalizeSiteFromUrl
} = require("./siteAuthSession");
const {
  fetchAndStorePublicJobs,
  fetchJobsFromUserPreferences
} = require("./publicJobFetch");

/** One connect flow per user+site so double-clicks do not spawn multiple browsers. */
const connectFlowLocks = new Map();

const app = express();
app.use(express.json());

const port = Number(process.env.PORT || 4000);
const server = http.createServer(app);
const { broadcastAudit } = attachAuditSocket(server);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/process", async (req, res) => {
  try {
    const prep = await prepareProcessJob(req.body);
    if (prep.resumed) {
      return res.json({
        job: prep.job,
        site: prep.site,
        resumed: true,
        idempotencyKey: prep.idempotencyKey,
        processState: prep.processState
      });
    }

    res.status(202).json({
      job: prep.job,
      processing: true,
      idempotencyKey: prep.idempotencyKey,
      site: prep.site
    });

    runProcessJobPipeline(prep, { broadcastAudit })
      .then((result) => setProcessOutcome({ idempotencyKey: prep.idempotencyKey, outcome: result }))
      .catch(async (error) => {
        console.error("Background processJob failed:", error);
        await markProcessFailure({
          idempotencyKey: prep.idempotencyKey,
          error: error.message || "Process failed"
        });
        await setProcessOutcome({
          idempotencyKey: prep.idempotencyKey,
          outcome: {
            error: true,
            message: error.message || "Unexpected error while processing job"
          }
        });
      });
  } catch (error) {
    console.error("Failed to start process job:", error);
    if (isDatabaseUnavailableError(error)) {
      return res.status(503).json(databaseUnavailableResponse());
    }
    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: error.message || "Unexpected error while processing job"
    });
  }
});

app.get("/process/outcome", async (req, res) => {
  try {
    const idempotencyKey = req.query.idempotencyKey;
    if (!idempotencyKey || typeof idempotencyKey !== "string") {
      return res.status(400).json({ error: "idempotencyKey is required" });
    }
    const userId = req.query.userId;
    const outcome = await getProcessOutcome({ idempotencyKey });
    if (!outcome) {
      return res.json({ pending: true });
    }
    if (userId && outcome?.job?.userId && outcome.job.userId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    return res.json({ done: true, outcome });
  } catch (error) {
    console.error("GET /process/outcome failed:", error);
    return res.status(500).json({ error: "Failed to load outcome" });
  }
});

app.post("/jobs/fetch-from-preferences", async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId || typeof userId !== "string") {
      return res.status(400).json({ error: "userId is required" });
    }
    const result = await fetchJobsFromUserPreferences(userId);
    return res.json(result);
  } catch (error) {
    console.error("POST /jobs/fetch-from-preferences failed:", error);
    const status = Number(error.status) >= 400 ? Number(error.status) : 500;
    return res.status(status).json({
      error: error.message || "Failed to fetch jobs from user preferences"
    });
  }
});

app.post("/jobs/public-fetch", async (req, res) => {
  try {
    const {
      source,
      query,
      title,
      description,
      location,
      searchUrl,
      limit,
      mode,
      compliance
    } = req.body || {};
    const result = await fetchAndStorePublicJobs({
      source,
      query,
      title,
      description,
      location,
      limit,
      mode,
      compliance,
      searchUrl
    });
    return res.json(result);
  } catch (error) {
    console.error("Failed to fetch public jobs:", error);
    if (error?.status && error?.code) {
      return res.status(error.status).json({
        error: error.code,
        message: error.message,
        details: error.details || null
      });
    }
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: error.message || "Unexpected error while fetching public jobs"
    });
  }
});

app.post("/auth/connect/start", async (req, res) => {
  try {
    const { userId, site, siteUrl } = req.body || {};
    const resolvedSite = site || normalizeSiteFromUrl(siteUrl);

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    if (!resolvedSite) {
      return res.status(400).json({ error: "site or siteUrl is required" });
    }

    const connectUrl = (siteUrl && String(siteUrl).trim()) || `https://${resolvedSite}`;
    const lockKey = `${userId}::${resolvedSite}`;

    if (connectFlowLocks.has(lockKey)) {
      return res.json({
        site: resolvedSite,
        loginUrl: connectUrl,
        inProgress: true,
        message:
          "A login window is already open for this site on the machine running the API server. Finish there or wait until it closes."
      });
    }

    connectFlowLocks.set(lockKey, true);

    res.json({
      site: resolvedSite,
      loginUrl: connectUrl,
      started: true,
      message:
        "A Chromium window should open on the computer that runs the JobCopilot server (e.g. your Mac). Sign in in that window — not only in this browser tab."
    });

    try {
      await beginSiteAuthSession({
        userId,
        site: resolvedSite,
        siteUrl
      });
    } catch (err) {
      console.error("Connect flow failed:", err);
    } finally {
      connectFlowLocks.delete(lockKey);
    }
  } catch (error) {
    console.error("Failed to start connect flow:", error);
    if (!res.headersSent) {
      return res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        message: error.message || "Unexpected error during connect flow"
      });
    }
  }
});

app.get("/auth/connect/status", async (req, res) => {
  try {
    const userId = req.query.userId;
    const site = req.query.site || normalizeSiteFromUrl(req.query.siteUrl);

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    if (!site) {
      return res.status(400).json({ error: "site or siteUrl is required" });
    }

    const status = await validateSiteAuthSession({ userId, site, siteUrl: req.query.siteUrl });
    return res.json(status);
  } catch (error) {
    console.error("Failed to fetch connect status:", error);
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: error.message || "Unexpected error while reading connect status"
    });
  }
});

app.get("/auth/connect/list", async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const sessions = await listSiteAuthSessions({ userId });
    return res.json({ sessions });
  } catch (error) {
    console.error("Failed to list connected sites:", error);
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: error.message || "Unexpected error while listing connected sites"
    });
  }
});

app.post("/auth/connect/validate", async (req, res) => {
  try {
    const { userId, site, siteUrl } = req.body || {};
    const resolvedSite = site || normalizeSiteFromUrl(siteUrl);

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    if (!resolvedSite) {
      return res.status(400).json({ error: "site or siteUrl is required" });
    }

    const result = await validateSiteAuthSession({
      userId,
      site: resolvedSite,
      siteUrl
    });
    return res.json(result);
  } catch (error) {
    console.error("Failed to validate site auth session:", error);
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: error.message || "Unexpected error while validating site auth session"
    });
  }
});

app.post("/auth/connect/disconnect", async (req, res) => {
  try {
    const { userId, site, siteUrl } = req.body || {};
    const resolvedSite = site || normalizeSiteFromUrl(siteUrl);

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    if (!resolvedSite) {
      return res.status(400).json({ error: "site or siteUrl is required" });
    }

    const result = await disconnectSiteAuthSession({
      userId,
      site: resolvedSite
    });
    return res.json(result);
  } catch (error) {
    console.error("Failed to disconnect site auth session:", error);
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: error.message || "Unexpected error while disconnecting site auth session"
    });
  }
});

server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
