const { prisma } = require("./db");

const COLLECTION_NAME = "site_domain_credentials";

function sanitizeSegment(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
}

function inferDomainLabel(site) {
  const host = String(site || "").trim().toLowerCase();
  const parts = host.split(".").filter(Boolean);
  if (parts.length >= 2) {
    return parts[parts.length - 2];
  }
  return parts[0] || "site";
}

function generateCredentialSeed({ email, site }) {
  const emailLocal = sanitizeSegment(String(email || "user").split("@")[0] || "user");
  const domainLabel = sanitizeSegment(inferDomainLabel(site));
  const username = `${emailLocal}_${domainLabel}`.slice(0, 48) || `user_${domainLabel}`;
  const randomSuffix = Math.random().toString(36).slice(2, 10);
  const password = `JC_${domainLabel}_${randomSuffix}`;
  return { username, password };
}

async function findDomainCredential({ userId, site }) {
  const result = await prisma.$runCommandRaw({
    find: COLLECTION_NAME,
    filter: { userId, site },
    limit: 1
  });

  const firstBatch = result?.cursor?.firstBatch || [];
  return firstBatch[0] || null;
}

async function createDomainCredential({ userId, site, email }) {
  const generated = generateCredentialSeed({ email, site });
  const now = new Date();

  await prisma.$runCommandRaw({
    insert: COLLECTION_NAME,
    documents: [
      {
        userId,
        site,
        username: generated.username,
        password: generated.password,
        createdAt: now,
        updatedAt: now
      }
    ]
  });

  return {
    site,
    username: generated.username,
    password: generated.password,
    createdNow: true
  };
}

async function ensureDomainCredential({ userId, site, email }) {
  const existing = await findDomainCredential({ userId, site });
  if (existing) {
    return {
      site,
      username: existing.username,
      password: existing.password,
      createdNow: false
    };
  }

  return createDomainCredential({ userId, site, email });
}

module.exports = {
  ensureDomainCredential
};
