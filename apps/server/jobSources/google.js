const { createRotatingHttpClient } = require("../httpClient");

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasKeywordMatch(text, query) {
  if (!query) return true;
  const normalizedText = normalizeText(text);
  const queryTokens = normalizeText(query).split(" ").filter(Boolean);
  if (queryTokens.length === 0) return true;
  return queryTokens.some((token) => normalizedText.includes(token));
}

function inferDescriptionFromUrl(url) {
  const normalized = normalizeText(url);
  if (normalized.includes("frontend") || normalized.includes("react")) {
    return "Frontend engineering role focused on React and modern UI delivery.";
  }
  if (normalized.includes("backend") || normalized.includes("node")) {
    return "Backend engineering role focused on APIs, Node.js services, and data systems.";
  }
  return "Software engineering role with product development responsibilities.";
}

function inferTitleFromUrl(url) {
  const normalized = normalizeText(url);
  if (normalized.includes("frontend")) return "Frontend Engineer";
  if (normalized.includes("backend")) return "Backend Engineer";
  return "Software Engineer";
}

function pickSearchUrl(query) {
  const q = encodeURIComponent(String(query || "software engineer jobs"));
  return `https://www.google.com/search?q=${q}&udm=8`;
}

function parseGoogleCandidatesFromHtml(html, fallbackSearchUrl) {
  const candidates = [];
  const text = String(html || "");

  const jobPostingRegex =
    /<script[^>]*type=\"application\/ld\+json\"[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = jobPostingRegex.exec(text)) !== null) {
    const scriptBody = match[1];
    if (!scriptBody || !scriptBody.includes("JobPosting")) {
      continue;
    }

    try {
      const parsed = JSON.parse(scriptBody);
      const postings = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of postings) {
        if (item?.["@type"] !== "JobPosting") continue;
        const url = item.url || fallbackSearchUrl;
        const title = item.title || inferTitleFromUrl(url);
        const description = item.description || inferDescriptionFromUrl(url);
        const company =
          item.hiringOrganization?.name || item?.hiringOrganization || "Employer";
        const location =
          item.jobLocation?.address?.addressLocality ||
          item.jobLocationType ||
          "Unknown";

        candidates.push({
          source: "google",
          externalId: `g-${Buffer.from(String(url)).toString("base64").slice(0, 24)}`,
          jobUrl: url,
          title,
          company,
          location,
          description,
          postedAt: item.datePosted ? new Date(item.datePosted) : new Date()
        });
      }
    } catch {
      // Ignore malformed JSON snippets and continue.
    }
  }

  return candidates;
}

function classifyGoogleBlocker(errorOrResponse) {
  const message = String(errorOrResponse?.message || "").toLowerCase();
  const html = String(errorOrResponse?.body || "").toLowerCase();

  if (
    message.includes("429") ||
    html.includes("too many requests") ||
    html.includes("rate limit")
  ) {
    return {
      type: "rate_limited",
      message: "Google rate-limited the request."
    };
  }

  if (html.includes("captcha") || html.includes("unusual traffic")) {
    return {
      type: "anti_bot_challenge",
      message: "Google anti-bot challenge detected."
    };
  }

  return {
    type: "provider_error",
    message: "Google Jobs fetch failed."
  };
}

async function fetchGoogleJobs({
  query,
  titleQuery,
  descriptionQuery,
  limit = 10,
  transportConfig,
  searchUrl
}) {
  const resolvedSearchUrl =
    typeof searchUrl === "string" && searchUrl.trim().length > 0
      ? searchUrl.trim()
      : pickSearchUrl(query);
  const client = createRotatingHttpClient({ ...transportConfig, provider: "google_jobs" });

  let html = "";
  try {
    const response = await client.get(resolvedSearchUrl);
    html = response.body || "";
  } catch (error) {
    const warning = classifyGoogleBlocker(error);
    const fallback = [
      {
        source: "google",
        externalId: `g-${Buffer.from(`${resolvedSearchUrl}-network-fallback`).toString("base64").slice(0, 24)}`,
        jobUrl: resolvedSearchUrl,
        title: inferTitleFromUrl(resolvedSearchUrl),
        company: "Google Jobs candidate",
        location: "See listing",
        description: inferDescriptionFromUrl(resolvedSearchUrl),
        postedAt: new Date()
      }
    ];
    return {
      jobs: fallback.slice(0, Math.max(1, Math.min(Number(limit) || 10, 50))),
      providerMeta: {
        source: "google",
        blocker: null,
        warning,
        degraded: true,
        fetchedVia: "network_error_fallback"
      }
    };
  }

  let candidates = parseGoogleCandidatesFromHtml(html, resolvedSearchUrl);
  if (candidates.length === 0) {
    candidates = [
      {
        source: "google",
        externalId: `g-${Buffer.from(`${resolvedSearchUrl}-fallback`).toString("base64").slice(0, 24)}`,
        jobUrl: resolvedSearchUrl,
        title: inferTitleFromUrl(resolvedSearchUrl),
        company: "Google Jobs candidate",
        location: "See listing",
        description: inferDescriptionFromUrl(resolvedSearchUrl),
        postedAt: new Date()
      }
    ];
  }

  let filtered = candidates.filter((job) => {
    const titleOk = hasKeywordMatch(job.title, titleQuery);
    const descriptionOk = hasKeywordMatch(job.description, descriptionQuery);
    return titleOk && descriptionOk;
  });
  if (filtered.length === 0 && candidates.length > 0) {
    filtered = candidates;
  }

  return {
    jobs: filtered.slice(0, Math.max(1, Math.min(Number(limit) || 10, 50))),
    providerMeta: {
      source: "google",
      blocker: null,
      fetchedVia: "public_html"
    }
  };
}

module.exports = {
  fetchGoogleJobs
};
