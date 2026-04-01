const { URL } = require("url");

const SOURCE_CONFIG = {
  linkedin: {
    domain: "linkedin.com",
    officialApiEnv: "LINKEDIN_OFFICIAL_API_URL"
  },
  google: {
    domain: "google.com",
    officialApiEnv: "GOOGLE_JOBS_OFFICIAL_API_URL"
  },
  naukri: {
    domain: "naukri.com",
    officialApiEnv: "NAUKRI_OFFICIAL_API_URL"
  },
  instahyre: {
    domain: "instahyre.com",
    officialApiEnv: "INSTAHYRE_OFFICIAL_API_URL"
  }
};

function normalizeSource(source) {
  return String(source || "").trim().toLowerCase();
}

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function isAllowedSource(source) {
  const allowList = parseList(process.env.PUBLIC_JOB_FETCH_ALLOWED_SOURCES);
  if (allowList.length === 0) {
    return source === "linkedin" || source === "google";
  }
  return allowList.includes(source);
}

function resolveSourceConfig(source) {
  return SOURCE_CONFIG[source] || null;
}

function normalizeDomain(urlOrDomain) {
  if (!urlOrDomain) return null;
  const raw = String(urlOrDomain).trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    return parsed.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//i, "").replace(/^www\./i, "").toLowerCase();
  }
}

function isDomainAllowed(source, target) {
  const config = resolveSourceConfig(source);
  if (!config?.domain) return false;
  const expected = normalizeDomain(config.domain);
  const actual = normalizeDomain(target);
  if (!actual) return false;
  return actual === expected || actual.endsWith(`.${expected}`);
}

function evaluateCompliance({
  source,
  searchUrl,
  requireOfficialApi = false,
  /** When true (e.g. user “Discover” fetch), ignore REQUIRE_OFFICIAL_API_ONLY for HTML providers. */
  allowHtmlPublicFetch = false
}) {
  const normalizedSource = normalizeSource(source);
  const sourceConfig = resolveSourceConfig(normalizedSource);

  if (!sourceConfig) {
    return {
      allowed: false,
      blocker: {
        type: "unsupported_source",
        message: `Unsupported source "${normalizedSource}".`
      }
    };
  }

  if (!isAllowedSource(normalizedSource)) {
    return {
      allowed: false,
      blocker: {
        type: "source_not_allowed",
        message: `Source "${normalizedSource}" is not enabled by policy.`
      }
    };
  }

  const envRequiresOfficialApi = parseBoolean(process.env.REQUIRE_OFFICIAL_API_ONLY, false);
  const requireOfficialApiOnly =
    (envRequiresOfficialApi && !allowHtmlPublicFetch) || Boolean(requireOfficialApi);
  const officialApiUrl = process.env[sourceConfig.officialApiEnv] || null;
  if (requireOfficialApiOnly && !officialApiUrl) {
    return {
      allowed: false,
      blocker: {
        type: "official_api_required",
        message:
          `Compliance policy requires official API for ${normalizedSource}. ` +
          `Set ${sourceConfig.officialApiEnv} to proceed, or use Discover fetch from the app (HTML), or set REQUIRE_OFFICIAL_API_ONLY=false.`
      }
    };
  }

  if (searchUrl && !isDomainAllowed(normalizedSource, searchUrl)) {
    return {
      allowed: false,
      blocker: {
        type: "domain_not_allowed",
        message: `Provided search URL domain is not allowed for source "${normalizedSource}".`
      }
    };
  }

  return {
    allowed: true,
    sourceConfig,
    officialApiUrl
  };
}

function getOfficialApiStatus(source) {
  const normalizedSource = normalizeSource(source);
  const sourceConfig = resolveSourceConfig(normalizedSource);
  const officialApiUrl = sourceConfig?.officialApiEnv
    ? process.env[sourceConfig.officialApiEnv] || null
    : null;
  return {
    source: normalizedSource,
    available: Boolean(officialApiUrl),
    endpoint: officialApiUrl
  };
}

function getComplianceMeta({ source }) {
  const normalizedSource = normalizeSource(source);
  return {
    source: normalizedSource,
    allowedSources: parseList(process.env.PUBLIC_JOB_FETCH_ALLOWED_SOURCES),
    requireOfficialApiOnly: parseBoolean(process.env.REQUIRE_OFFICIAL_API_ONLY, false)
  };
}

function assertProviderFetchAllowed({
  source,
  allowScraping = false,
  hasOfficialApi = false,
  requireOfficialApi = false,
  allowHtmlPublicFetch = false
}) {
  const normalizedSource = normalizeSource(source);
  if (!isAllowedSource(normalizedSource)) {
    const error = new Error(`Source "${normalizedSource}" is not enabled by policy.`);
    error.code = "SOURCE_NOT_ALLOWED";
    error.status = 403;
    error.details = { source: normalizedSource };
    throw error;
  }

  const envRequiresOfficialApi = parseBoolean(process.env.REQUIRE_OFFICIAL_API_ONLY, false);
  const requireOfficialApiOnly =
    (envRequiresOfficialApi && !allowHtmlPublicFetch) || Boolean(requireOfficialApi);
  if (requireOfficialApiOnly && !hasOfficialApi) {
    const config = resolveSourceConfig(normalizedSource);
    const error = new Error(
      `Compliance policy requires official API for ${normalizedSource}. ` +
        `Set ${config?.officialApiEnv || "OFFICIAL_API_URL"} to proceed.`
    );
    error.code = "OFFICIAL_API_REQUIRED";
    error.status = 403;
    error.details = {
      source: normalizedSource,
      officialApiEnv: config?.officialApiEnv || null
    };
    throw error;
  }

  const scrapeAllowedByEnv = parseBoolean(process.env.PUBLIC_JOB_FETCH_ALLOW_SCRAPING, true);
  if (
    allowScraping &&
    !scrapeAllowedByEnv &&
    !hasOfficialApi &&
    !allowHtmlPublicFetch
  ) {
    const error = new Error(
      `Scraping mode is disabled by policy for source "${normalizedSource}".`
    );
    error.code = "SCRAPING_DISABLED";
    error.status = 403;
    error.details = {
      source: normalizedSource,
      hint: "Set PUBLIC_JOB_FETCH_ALLOW_SCRAPING=true if policy permits."
    };
    throw error;
  }
}

module.exports = {
  parseBoolean,
  normalizeSource,
  evaluateCompliance,
  resolveSourceConfig,
  isAllowedSource,
  isDomainAllowed,
  normalizeDomain,
  assertProviderFetchAllowed,
  getOfficialApiStatus,
  getComplianceMeta
};
