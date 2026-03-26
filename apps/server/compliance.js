const { URL } = require("url");

const SOURCE_CONFIG = {
  linkedin: {
    domain: "linkedin.com",
    officialApiEnv: "LINKEDIN_OFFICIAL_API_URL"
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
    return source === "linkedin";
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

function evaluateCompliance({ source, searchUrl }) {
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

  const requireOfficialApi = parseBoolean(process.env.REQUIRE_OFFICIAL_API_ONLY, false);
  const officialApiUrl = process.env[sourceConfig.officialApiEnv] || null;
  if (requireOfficialApi && !officialApiUrl) {
    return {
      allowed: false,
      blocker: {
        type: "official_api_required",
        message:
          `Compliance policy requires official API for ${normalizedSource}. ` +
          `Set ${sourceConfig.officialApiEnv} to proceed.`
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

module.exports = {
  evaluateCompliance,
  parseBoolean
};
