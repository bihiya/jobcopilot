const path = require("path");
const fs = require("fs/promises");
const { prisma } = require("./db");

const STORAGE_ROOT = path.resolve(__dirname, "../../data/auth-sessions");

function ensureSafeSegment(value) {
  return String(value || "").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function buildStoragePath({ userId, site }) {
  const safeUserId = ensureSafeSegment(userId);
  const safeSite = ensureSafeSegment(site);
  return path.join(STORAGE_ROOT, safeUserId, `${safeSite}.json`);
}

async function ensureStorageDirectory(storagePath) {
  await fs.mkdir(path.dirname(storagePath), { recursive: true });
}

async function getSiteAuthSession({ userId, site }) {
  return prisma.siteAuthSession.findUnique({
    where: {
      userId_site: {
        userId,
        site
      }
    }
  });
}

async function markPending({ userId, site }) {
  const storagePath = buildStoragePath({ userId, site });
  await ensureStorageDirectory(storagePath);

  return prisma.siteAuthSession.upsert({
    where: {
      userId_site: {
        userId,
        site
      }
    },
    update: {
      storagePath,
      status: "pending",
      blockerType: null,
      blockerMessage: null
    },
    create: {
      userId,
      site,
      storagePath,
      status: "pending"
    }
  });
}

async function markConnected({ userId, site, storagePath }) {
  return prisma.siteAuthSession.upsert({
    where: {
      userId_site: {
        userId,
        site
      }
    },
    update: {
      storagePath,
      status: "connected",
      blockerType: null,
      blockerMessage: null
    },
    create: {
      userId,
      site,
      storagePath,
      status: "connected"
    }
  });
}

async function markBlocked({ userId, site, blockerType, blockerMessage }) {
  return prisma.siteAuthSession.upsert({
    where: {
      userId_site: {
        userId,
        site
      }
    },
    update: {
      status: "blocked",
      blockerType,
      blockerMessage
    },
    create: {
      userId,
      site,
      storagePath: buildStoragePath({ userId, site }),
      status: "blocked",
      blockerType,
      blockerMessage
    }
  });
}

module.exports = {
  STORAGE_ROOT,
  buildStoragePath,
  getSiteAuthSession,
  markPending,
  markConnected,
  markBlocked
};
