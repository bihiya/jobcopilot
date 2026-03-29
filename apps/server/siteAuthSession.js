const path = require("path");
const fs = require("fs/promises");
const { chromium } = require("playwright");
const { prisma } = require("./db");

const STORAGE_ROOT = path.resolve(__dirname, "../../data/auth-sessions");

function ensureSafeSegment(value) {
  return String(value || "").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function normalizeSiteFromUrl(siteUrl) {
  if (!siteUrl) return null;
  try {
    const parsed = new URL(siteUrl);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function detectBlocker(pageContent) {
  const text = (pageContent || "").toLowerCase();
  if (text.includes("captcha") || text.includes("verify you are human")) {
    return { blockerType: "captcha", message: "Captcha challenge detected." };
  }
  if (
    text.includes("two-factor") ||
    text.includes("2fa") ||
    text.includes("verification code")
  ) {
    return { blockerType: "two_factor", message: "Two-factor verification required." };
  }
  if (text.includes("sign up") || text.includes("create account")) {
    return { blockerType: "signup_required", message: "Signup is required on target site." };
  }
  if (text.includes("sign in") || text.includes("log in")) {
    return { blockerType: "login_required", message: "Login required on target site." };
  }
  return null;
}

function isAuthenticatedHeuristic(pageUrl, pageContent) {
  const url = (pageUrl || "").toLowerCase();
  const text = (pageContent || "").toLowerCase();
  if (url.includes("login") || url.includes("signin")) return false;
  if (
    text.includes("sign in") ||
    text.includes("log in") ||
    text.includes("continue with google")
  ) {
    return false;
  }
  return true;
}

function getSessionFilePath({ userId, site }) {
  const safeUserId = ensureSafeSegment(userId);
  const safeSite = ensureSafeSegment(site);
  return path.join(STORAGE_ROOT, safeUserId, `${safeSite}.json`);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureStorageDirectory(storagePath) {
  await fs.mkdir(path.dirname(storagePath), { recursive: true });
}

async function upsertAuthSession({ userId, site, storageStatePath, isAuthenticated }) {
  const now = new Date();
  return prisma.authSession.upsert({
    where: {
      userId_site: {
        userId,
        site
      }
    },
    update: {
      storageStatePath,
      isAuthenticated,
      lastCheckedAt: now,
      lastAuthenticatedAt: isAuthenticated ? now : null
    },
    create: {
      userId,
      site,
      storageStatePath,
      isAuthenticated,
      lastCheckedAt: now,
      lastAuthenticatedAt: isAuthenticated ? now : null
    }
  });
}

async function markSessionChecked({ userId, site, isAuthenticated }) {
  const now = new Date();
  return prisma.authSession.upsert({
    where: {
      userId_site: {
        userId,
        site
      }
    },
    update: {
      isAuthenticated,
      lastCheckedAt: now,
      ...(isAuthenticated ? { lastAuthenticatedAt: now } : {})
    },
    create: {
      userId,
      site,
      storageStatePath: getSessionFilePath({ userId, site }),
      isAuthenticated,
      lastCheckedAt: now,
      ...(isAuthenticated ? { lastAuthenticatedAt: now } : {})
    }
  });
}

async function getSiteAuthStatus({ userId, site }) {
  const session = await prisma.authSession.findUnique({
    where: {
      userId_site: {
        userId,
        site
      }
    }
  });

  if (!session) {
    return {
      site,
      connected: false,
      requiresAuth: true
    };
  }

  const exists = await fileExists(session.storageStatePath);
  const connected = Boolean(session.isAuthenticated && exists);
  return {
    site,
    connected,
    requiresAuth: !connected,
    isAuthenticated: session.isAuthenticated,
    storageExists: exists,
    lastCheckedAt: session.lastCheckedAt,
    lastAuthenticatedAt: session.lastAuthenticatedAt
  };
}

async function listSiteAuthSessions({ userId }) {
  const sessions = await prisma.authSession.findMany({
    where: { userId },
    orderBy: { site: "asc" }
  });

  return Promise.all(
    sessions.map(async (session) => {
      const exists = await fileExists(session.storageStatePath);
      return {
        site: session.site,
        connected: Boolean(session.isAuthenticated && exists),
        isAuthenticated: session.isAuthenticated,
        storageExists: exists,
        lastCheckedAt: session.lastCheckedAt,
        lastAuthenticatedAt: session.lastAuthenticatedAt
      };
    })
  );
}

async function disconnectSiteAuthSession({ userId, site }) {
  const session = await prisma.authSession.findUnique({
    where: {
      userId_site: {
        userId,
        site
      }
    }
  });

  if (session?.storageStatePath) {
    await fs.rm(session.storageStatePath, { force: true });
  }

  if (!session) {
    return {
      site,
      disconnected: true
    };
  }

  await prisma.authSession.update({
    where: {
      userId_site: {
        userId,
        site
      }
    },
    data: {
      isAuthenticated: false,
      lastCheckedAt: new Date()
    }
  });

  return {
    site,
    disconnected: true
  };
}

async function canAutoApply({ userId, site }) {
  const status = await getSiteAuthStatus({ userId, site });
  return {
    authenticated: status.connected
  };
}

/** Used by Express `/auth/connect/status` and `/auth/connect/validate`. */
async function validateSiteAuthSession({ userId, site, siteUrl }) {
  const resolvedSite =
    site || (siteUrl ? normalizeSiteFromUrl(siteUrl) : null);
  if (!resolvedSite) {
    return {
      site: null,
      connected: false,
      authenticated: false,
      requiresAuth: true,
      status: "disconnected",
      error: "site or siteUrl is required"
    };
  }
  const status = await getSiteAuthStatus({ userId, site: resolvedSite });
  return {
    ...status,
    site: resolvedSite,
    authenticated: status.connected,
    status: status.connected ? "connected" : "disconnected"
  };
}

async function beginSiteAuthSession({ userId, site, siteUrl }) {
  const storageStatePath = getSessionFilePath({ userId, site });
  await ensureStorageDirectory(storageStatePath);

  const connectUrl = siteUrl || `https://${site}`;
  const headless = String(process.env.PLAYWRIGHT_HEADLESS || "false") === "true";
  const waitMs = Number(process.env.PLAYWRIGHT_CONNECT_WAIT_MS || 90000);
  const browser = await chromium.launch({ headless });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(connectUrl, { waitUntil: "domcontentloaded", timeout: 45000 });

    // Manual assisted login window. Keep it open while user logs in.
    await page.waitForTimeout(waitMs);

    const content = await page.content();
    const blocker = detectBlocker(content);
    const authenticated = blocker ? false : isAuthenticatedHeuristic(page.url(), content);

    await context.storageState({ path: storageStatePath });
    await upsertAuthSession({
      userId,
      site,
      storageStatePath,
      isAuthenticated: authenticated
    });

    return {
      site,
      connected: authenticated,
      requiresAuth: !authenticated,
      blocker: blocker
        ? {
            type: blocker.blockerType,
            message: blocker.message
          }
        : null,
      message: authenticated
        ? `Connected ${site} successfully.`
        : `Session saved but ${site} still appears unauthenticated.`
    };
  } finally {
    await browser.close();
  }
}

module.exports = {
  STORAGE_ROOT,
  normalizeSiteFromUrl,
  getSessionFilePath,
  getSiteAuthStatus,
  listSiteAuthSessions,
  disconnectSiteAuthSession,
  beginSiteAuthSession,
  canAutoApply,
  validateSiteAuthSession,
  markSessionChecked,
  detectBlocker,
  isAuthenticatedHeuristic
};
