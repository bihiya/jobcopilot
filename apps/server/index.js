const express = require("express");
const { processJob } = require("./processJob");
const {
  beginSiteAuthSession,
  listSiteAuthSessions,
  disconnectSiteAuthSession,
  validateSiteAuthSession,
  normalizeSiteFromUrl
} = require("./siteAuthSession");
const { fetchAndStorePublicJobs } = require("./publicJobFetch");

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/process", async (req, res) => {
  try {
    const result = await processJob(req.body);
    res.json(result);
  } catch (error) {
    console.error("Failed to process job:", error);
    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: error.message || "Unexpected error while processing job"
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
      limit,
      mode
    } = req.body || {};
    const result = await fetchAndStorePublicJobs({
      source,
      query,
      title,
      description,
      location,
      limit,
      mode
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

    const result = await beginSiteAuthSession({
      userId,
      site: resolvedSite,
      siteUrl
    });
    return res.json(result);
  } catch (error) {
    console.error("Failed to start connect flow:", error);
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: error.message || "Unexpected error during connect flow"
    });
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

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
