const { prisma } = require("./db");

const COLLECTION_NAME = "site_domain_credentials";
const MAX_FAILURES_BEFORE_LOCK = Number(process.env.SITE_CREDENTIAL_MAX_FAILURES || 3);
const LOCK_MINUTES = Number(process.env.SITE_CREDENTIAL_LOCK_MINUTES || 30);
const ROTATE_DAYS = Number(process.env.SITE_CREDENTIAL_ROTATE_DAYS || 30);

let indexesEnsured = false;

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

async function ensureIndexes() {
  if (indexesEnsured) return;
  try {
    await prisma.$runCommandRaw({
      createIndexes: COLLECTION_NAME,
      indexes: [
        {
          key: { userId: 1, site: 1 },
          name: "user_site_unique",
          unique: true
        }
      ]
    });
  } catch {
    // No-op if index already exists or permissions are restricted.
  }
  indexesEnsured = true;
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

function shouldRotateCredential(record) {
  if (!record) return true;
  if (record.failureCount >= MAX_FAILURES_BEFORE_LOCK) return true;

  const updatedAt = new Date(record.passwordUpdatedAt || record.updatedAt || record.createdAt || 0);
  const ageMs = Date.now() - updatedAt.getTime();
  return ageMs > ROTATE_DAYS * 24 * 60 * 60 * 1000;
}

function toPublicCredential(record) {
  return {
    site: record.site,
    username: record.username,
    password: record.password,
    status: record.status,
    lastUsedAt: record.lastUsedAt || null,
    failureCount: Number(record.failureCount || 0),
    lockedUntil: record.lockedUntil || null,
    source: record.source || "generated",
    createdNow: false,
    rotatedNow: false
  };
}

async function createDomainCredential({ userId, site, email, source = "generated" }) {
  const generated = generateCredentialSeed({ email, site });
  const now = new Date();

  const result = await prisma.$runCommandRaw({
    findAndModify: COLLECTION_NAME,
    query: { userId, site },
    update: {
      $setOnInsert: {
        userId,
        site,
        username: generated.username,
        password: generated.password,
        status: "ACTIVE",
        failureCount: 0,
        lockedUntil: null,
        source,
        createdAt: now,
        updatedAt: now,
        passwordUpdatedAt: now,
        lastUsedAt: null
      }
    },
    new: true,
    upsert: true
  });

  const value = result?.value || null;
  if (!value) {
    return {
      site,
      username: generated.username,
      password: generated.password,
      status: "ACTIVE",
      lastUsedAt: null,
      failureCount: 0,
      lockedUntil: null,
      source,
      createdNow: true,
      rotatedNow: false
    };
  }

  const isFresh = value?.createdAt && Math.abs(new Date(value.createdAt).getTime() - now.getTime()) < 5000;
  return {
    ...toPublicCredential(value),
    createdNow: isFresh
  };
}

async function rotateDomainCredential({ userId, site, email }) {
  const generated = generateCredentialSeed({ email, site });
  const now = new Date();
  const result = await prisma.$runCommandRaw({
    findAndModify: COLLECTION_NAME,
    query: { userId, site },
    update: {
      $set: {
        username: generated.username,
        password: generated.password,
        status: "ACTIVE",
        failureCount: 0,
        lockedUntil: null,
        updatedAt: now,
        passwordUpdatedAt: now,
        source: "rotated"
      }
    },
    new: true,
    upsert: true
  });

  return {
    ...toPublicCredential(result?.value || { site, username: generated.username, password: generated.password }),
    createdNow: false,
    rotatedNow: true
  };
}

async function ensureDomainCredential({ userId, site, email }) {
  await ensureIndexes();
  const existing = await findDomainCredential({ userId, site });

  if (!existing) {
    return createDomainCredential({ userId, site, email, source: "generated" });
  }

  const lockedUntil = existing.lockedUntil ? new Date(existing.lockedUntil) : null;
  const stillLocked = lockedUntil && lockedUntil.getTime() > Date.now();
  if (stillLocked) {
    return {
      ...toPublicCredential(existing),
      status: "LOCKED",
      createdNow: false,
      rotatedNow: false
    };
  }

  if (shouldRotateCredential(existing)) {
    return rotateDomainCredential({ userId, site, email });
  }

  return toPublicCredential(existing);
}

async function markCredentialResult({ userId, site, success }) {
  const now = new Date();
  const existing = await findDomainCredential({ userId, site });
  if (!existing) return null;

  if (success) {
    await prisma.$runCommandRaw({
      update: COLLECTION_NAME,
      updates: [
        {
          q: { userId, site },
          u: {
            $set: {
              status: "ACTIVE",
              failureCount: 0,
              lockedUntil: null,
              lastUsedAt: now,
              updatedAt: now
            }
          },
          upsert: false
        }
      ]
    });
    return { success: true };
  }

  const nextFailureCount = Number(existing.failureCount || 0) + 1;
  const lock = nextFailureCount >= MAX_FAILURES_BEFORE_LOCK;
  await prisma.$runCommandRaw({
    update: COLLECTION_NAME,
    updates: [
      {
        q: { userId, site },
        u: {
          $set: {
            status: lock ? "LOCKED" : "ACTIVE",
            failureCount: nextFailureCount,
            lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : null,
            updatedAt: now
          }
        },
        upsert: false
      }
    ]
  });

  return { success: false, failureCount: nextFailureCount, locked: lock };
}

module.exports = {
  ensureDomainCredential,
  markCredentialResult
};
