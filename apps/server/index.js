const express = require("express");
const { processJob } = require("./processJob");
const {
  beginSiteAuthSession,
  getSiteAuthStatus,
  normalizeSiteFromUrl
} = require("./siteAuthSession");

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

    const status = await getSiteAuthStatus({ userId, site });
    return res.json(status);
  } catch (error) {
    console.error("Failed to fetch connect status:", error);
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: error.message || "Unexpected error while reading connect status"
    });
  }
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
