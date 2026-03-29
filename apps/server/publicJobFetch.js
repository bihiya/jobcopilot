const { prisma } = require("./db");
const { fetchLinkedInJobs } = require("./jobSources/linkedin");
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
  return null;
}

async function saveExternalJob(job) {
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
      url: job.url,
      titleMatched: job.titleMatch,
      descriptionMatch: job.descriptionMatch,
      score: job.matchScore
    },
    create: {
      source: job.source,
      sourceJobId: job.externalId,
      url: job.url,
      title: job.title,
      company: job.company,
      location: job.location,
      description: job.description,
      titleMatched: job.titleMatch,
      descriptionMatch: job.descriptionMatch,
      score: job.matchScore
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
  searchUrl
}) {
  const normalizedSource = normalizeSource(source);
  const complianceMeta = getComplianceMeta({ source: normalizedSource });
  const officialApi = getOfficialApiStatus(normalizedSource);
  const requireOfficialApi =
    compliance.requireOfficialApi === true || mode === "official_api_only";
  const allowScraping = compliance.allowScraping ?? mode === "scrape";
  const complianceCheck = evaluateCompliance({
    source: normalizedSource,
    searchUrl,
    requireOfficialApi
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
    requireOfficialApi
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
      url: job.url,
      titleMatch,
      descriptionMatch,
      matchScore: score
    });

    stored.push(saved);
  }

  return {
    source: normalizedSource,
    fetchedCount: jobs.length,
    savedCount: stored.length,
    jobs: stored,
    compliance: complianceMeta,
    officialApi
  };
}

module.exports = {
  fetchAndStorePublicJobs
};
