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
  if (normalized.includes("fullstack") || normalized.includes("full stack")) {
    return "Full-stack engineering role across UI, APIs, and persistence layers.";
  }
  return "Software engineering role with product development responsibilities.";
}

function inferTitleFromUrl(url) {
  const normalized = normalizeText(url);
  if (normalized.includes("frontend")) return "Frontend Engineer";
  if (normalized.includes("backend")) return "Backend Engineer";
  if (normalized.includes("fullstack") || normalized.includes("full stack")) {
    return "Full Stack Engineer";
  }
  if (normalized.includes("data")) return "Data Engineer";
  return "Software Engineer";
}

async function fetchLinkedInJobs({ searchUrl, titleQuery, descriptionQuery }) {
  // Placeholder provider fetcher. This is intentionally deterministic and
  // structured so we can drop in real scraping/API logic later without changing
  // route contracts.
  const candidates = [
    {
      source: "linkedin",
      externalId: `li-${Buffer.from(`${searchUrl}-1`).toString("base64").slice(0, 16)}`,
      jobUrl: searchUrl,
      title: inferTitleFromUrl(searchUrl),
      company: "LinkedIn Candidate Co",
      location: "Remote",
      description: inferDescriptionFromUrl(searchUrl),
      postedAt: new Date()
    }
  ];

  return candidates.filter((job) => {
    const titleOk = hasKeywordMatch(job.title, titleQuery);
    const descriptionOk = hasKeywordMatch(job.description, descriptionQuery);
    return titleOk && descriptionOk;
  });
}

module.exports = {
  fetchLinkedInJobs
};
