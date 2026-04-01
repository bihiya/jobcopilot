const { prisma } = require("./db");
const { fetchLinkedInJobs } = require("./jobSources/linkedin");
const { fetchGoogleJobs } = require("./jobSources/google");
const {
  assertProviderFetchAllowed,
  getOfficialApiStatus,
  getComplianceMeta,
  evaluateCompliance
} = require("./compliance");

function normalizeSource(source) {
  return String(source || "linkedin").trim().toLowerCase();
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsPhrase(haystack, needle) {
  if (!needle) return true;
  return normalizeText(haystack).includes(normalizeText(needle));
}

function computeMatch(job, titleQuery, descriptionQuery) {
  const titleMatch = containsPhrase(job.title, titleQuery);
  const descriptionMatch = containsPhrase(job.description, descriptionQuery);
  const score = (titleMatch ? 50 : 0) + (descriptionMatch ? 50 : 0);
  return {
    titleMatch,
    descriptionMatch,
    score
  };
}

function providerFor(source) {
  if (source === "linkedin") {
    return fetchLinkedInJobs;
  }
  if (source === "google") {
    return fetchGoogleJobs;
  }
  return null;
}

function skillsToQuery(skills) {
  if (!skills) return "";
  if (Array.isArray(skills)) {
    return skills
      .slice(0, 5)
      .map((s) => String(s || "").trim())
      .filter(Boolean)
      .join(" ");
  }
  if (typeof skills === "string") return skills.trim();
  return "";
}

function resolveJobSearchPreferences(profile) {
  const raw = profile.jobSearchPreferences;
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};

  const sourcesRaw = obj.sources;
  let sources = Array.isArray(sourcesRaw)
    ? sourcesRaw.map((s) => String(s).trim().toLowerCase()).filter(Boolean)
    : ["linkedin", "google"];

  if (sources.length === 0) {
    sources = ["linkedin", "google"];
  }

  const headline = String(profile.headline || "").trim();
  const fromSkills = skillsToQuery(profile.skills);
  const loc = String(profile.currentLocation || "").trim();

  const query =
    String(obj.query || "").trim() ||
    [headline, fromSkills].filter(Boolean).join(" ").trim() ||
    "software engineer";

  const title = String(obj.title || "").trim();
  const description = String(obj.description || "").trim();
  const location = String(obj.location || loc || "").trim();

  const limit = Math.min(50, Math.max(1, Number(obj.limit) || 10));
  /** "scrape" enables HTML fetch path; avoids empty results when title/description filters are strict. */
  const mode = String(obj.mode || "scrape");
  const compliance = typeof obj.compliance === "object" && obj.compliance ? obj.compliance : {};
  const searchUrlBySource =
    typeof obj.searchUrlBySource === "object" && obj.searchUrlBySource ? obj.searchUrlBySource : {};

  return {
    sources,
    query,
    title,
    description,
    location,
    limit,
    mode,
    compliance,
    searchUrlBySource
  };
}

function jobRecordUrl(job) {
  return job.url || job.jobUrl || "";
}

async function saveExternalJob(job) {
  const url = jobRecordUrl(job);
  return prisma.externalJob.upsert({
    where: {
      source_sourceJobId: {
        source: job.source,
        sourceJobId: job.externalId
      }
    },
    update: {
      title: job.title,
      company: job.company,
      location: job.location,
      description: job.description,
      url,
      titleMatched: job.titleMatch,
      descriptionMatch: job.descriptionMatch,
      score: job.matchScore,
      ...(job.userId ? { userId: job.userId } : {}),
      ...(job.query != null && job.query !== "" ? { query: job.query } : {})
    },
    create: {
      source: job.source,
      sourceJobId: job.externalId,
      url,
      title: job.title,
      company: job.company,
      location: job.location,
      description: job.description,
      titleMatched: job.titleMatch,
      descriptionMatch: job.descriptionMatch,
      score: job.matchScore,
      userId: job.userId ?? null,
      query: job.query ?? null
    }
  });
}

async function fetchAndStorePublicJobs({
  source = "linkedin",
  query,
  title,
  description,
  limit = 10,
  location,
  mode = "default",
  compliance = {},
  searchUrl,
  userId,
  savedQuery,
  /** User Discover flow: relax REQUIRE_OFFICIAL_API_ONLY / scraping env gates for HTML providers. */
  allowHtmlPublicFetch = false
}) {
  const normalizedSource = normalizeSource(source);
  const queryLabel = savedQuery != null && savedQuery !== "" ? savedQuery : query;
  const complianceMeta = getComplianceMeta({ source: normalizedSource });
  const officialApi = getOfficialApiStatus(normalizedSource);
  const requireOfficialApi =
    compliance.requireOfficialApi === true || mode === "official_api_only";
  const allowScraping =
    compliance.allowScraping != null
      ? compliance.allowScraping
      : mode === "scrape" || allowHtmlPublicFetch;
  const complianceCheck = evaluateCompliance({
    source: normalizedSource,
    searchUrl,
    requireOfficialApi,
    allowHtmlPublicFetch
  });

  if (!complianceCheck.allowed) {
    return {
      source: normalizedSource,
      fetchedCount: 0,
      savedCount: 0,
      jobs: [],
      blocker: complianceCheck.blocker,
      providerMeta: null,
      compliance: complianceMeta,
      officialApi
    };
  }

  assertProviderFetchAllowed({
    source: normalizedSource,
    allowScraping,
    hasOfficialApi: officialApi.available,
    requireOfficialApi,
    allowHtmlPublicFetch
  });

  const provider = providerFor(normalizedSource);
  if (!provider) {
    throw new Error(`Unsupported source "${normalizedSource}".`);
  }

  const providerResult = await provider({
    query,
    titleQuery: title,
    descriptionQuery: description,
    locationQuery: location,
    limit,
    mode,
    searchUrl
  });
  const jobs = Array.isArray(providerResult?.jobs) ? providerResult.jobs : [];
  const providerMeta = providerResult?.providerMeta || null;

  if (providerMeta?.blocker) {
    return {
      source: normalizedSource,
      fetchedCount: 0,
      savedCount: 0,
      jobs: [],
      blocker: providerMeta.blocker,
      providerMeta,
      compliance: complianceMeta,
      officialApi
    };
  }
  const providerWarning = providerMeta?.warning || null;
  const stored = [];

  for (const job of jobs) {
    const { titleMatch, descriptionMatch, score } = computeMatch(
      job,
      title,
      description
    );

    const saved = await saveExternalJob({
      source: normalizedSource,
      externalId: job.externalId,
      title: job.title,
      company: job.company || null,
      location: job.location || null,
      description: job.description || null,
      url: jobRecordUrl(job),
      titleMatch,
      descriptionMatch,
      matchScore: score,
      userId: userId || null,
      query: queryLabel || null
    });

    stored.push(saved);
  }

  return {
    source: normalizedSource,
    fetchedCount: jobs.length,
    savedCount: stored.length,
    jobs: stored,
    compliance: complianceMeta,
    officialApi,
    warning: providerWarning,
    degraded: Boolean(providerMeta?.degraded)
  };
}

async function fetchJobsFromUserPreferences(userId) {
  if (!userId) {
    const err = new Error("userId is required");
    err.status = 400;
    throw err;
  }

  const profile = await prisma.userProfile.findUnique({
    where: { userId }
  });

  if (!profile) {
    const err = new Error("User profile not found");
    err.status = 404;
    throw err;
  }

  const prefs = resolveJobSearchPreferences(profile);
  const results = [];
  let totalFetched = 0;
  let totalSaved = 0;
  const blockers = [];
  const warnings = [];

  for (const source of prefs.sources) {
    const provider = providerFor(source);
    if (!provider) {
      results.push({
        source,
        skipped: true,
        message: `Unsupported source "${source}"`
      });
      continue;
    }

    try {
      const searchUrl =
        typeof prefs.searchUrlBySource[source] === "string"
          ? prefs.searchUrlBySource[source]
          : undefined;

      const one = await fetchAndStorePublicJobs({
        source,
        query: prefs.query,
        title: prefs.title,
        description: prefs.description,
        location: prefs.location,
        limit: prefs.limit,
        mode: prefs.mode === "official_api_only" ? prefs.mode : "scrape",
        compliance: {
          ...prefs.compliance,
          allowScraping: prefs.compliance?.allowScraping !== false
        },
        searchUrl,
        userId,
        savedQuery: prefs.query,
        allowHtmlPublicFetch: true
      });

      totalFetched += one.fetchedCount || 0;
      totalSaved += one.savedCount || 0;
      if (one.blocker) {
        blockers.push({ source, blocker: one.blocker });
      }
      if (one.warning) {
        warnings.push({ source, warning: one.warning, degraded: one.degraded });
      }
      results.push(one);
    } catch (error) {
      results.push({
        source,
        error: error.message || "Fetch failed",
        code: error.code || null
      });
    }
  }

  return {
    userId,
    preferences: prefs,
    totalFetched,
    totalSaved,
    results,
    blockers,
    warnings
  };
}

module.exports = {
  fetchAndStorePublicJobs,
  fetchJobsFromUserPreferences,
  resolveJobSearchPreferences
};
