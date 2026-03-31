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

const AUTH_PATH_RE = /\/(login|signin|sign-in|signup|sign-up|register|oauth|auth)\b/i;

/**
 * Load the job URL in a fresh browser context and guess whether the user must save
 * an employer-site session (login/signup) before we can apply. Public apply forms
 * (file upload, apply without password, etc.) return requiresSavedSession: false.
 */
async function probeJobPageRequiresSavedSession(jobUrl) {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(jobUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    const pathname = new URL(page.url()).pathname.toLowerCase();
    if (AUTH_PATH_RE.test(pathname)) {
      return { requiresSavedSession: true, reason: "auth_path" };
    }

    const probe = await page.evaluate(() => {
      const lower = (document.body?.innerText || "").slice(0, 16000).toLowerCase();
      return {
        hasPassword: !!document.querySelector('input[type="password"]'),
        hasFile: !!document.querySelector('input[type="file"]'),
        hasTextarea: !!document.querySelector("textarea"),
        formCount: document.querySelectorAll("form").length,
        lower
      };
    });

    if (probe.hasFile) {
      return { requiresSavedSession: false, reason: "has_file_upload" };
    }
    if (probe.formCount > 0 && probe.hasTextarea && !probe.hasPassword) {
      return { requiresSavedSession: false, reason: "form_without_password" };
    }

    if (probe.hasPassword && !probe.hasFile) {
      const loginIntent =
        /\b(sign in|log in|sign-in|log-in)\b[\s\S]{0,120}\b(apply|your account|continue)\b/i.test(
          probe.lower
        ) ||
        /\b(sign in|log in)\b.*\b(to|with)\b.*\b(google|linkedin|microsoft|sso)\b/i.test(
          probe.lower
        ) ||
        /\bcreate (an? )?(account|profile)\b[\s\S]{0,120}\b(to|before)\b[\s\S]{0,80}\b(apply|continue)\b/i.test(
          probe.lower
        );
      if (loginIntent) {
        return { requiresSavedSession: true, reason: "login_or_sso_gate" };
      }
    }

    if (
      probe.hasPassword &&
      !probe.hasFile &&
      /\b(sign up|register|create (an? )?account)\b/i.test(probe.lower)
    ) {
      return { requiresSavedSession: true, reason: "signup_gate" };
    }

    if (/\b(apply|application|submit (your|an) application)\b/i.test(probe.lower) && !probe.hasPassword) {
      return { requiresSavedSession: false, reason: "apply_without_password" };
    }

    return { requiresSavedSession: false, reason: "no_clear_login_gate" };
  } catch (err) {
    console.warn("probeJobPageRequiresSavedSession:", err?.message || err);
    return { requiresSavedSession: true, reason: "probe_failed" };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
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

async function canAutoApply({ userId, site, jobUrl }) {
  const status = await getSiteAuthStatus({ userId, site });
  if (status.connected) {
    return {
      authenticated: true,
      hadStoredSession: true,
      probeReason: null
    };
  }
  if (!jobUrl) {
    return {
      authenticated: false,
      hadStoredSession: false,
      probeReason: null
    };
  }
  const probe = await probeJobPageRequiresSavedSession(jobUrl);
  if (!probe.requiresSavedSession) {
    return {
      authenticated: true,
      hadStoredSession: false,
      probeReason: probe.reason
    };
  }
  return {
    authenticated: false,
    hadStoredSession: false,
    probeReason: probe.reason
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Site login must open a visible browser on the machine running this API (your Mac when
 * developing locally). PLAYWRIGHT_HEADLESS does not apply here — use PLAYWRIGHT_CONNECT_HEADLESS=true
 * only for headless/CI where no display is available.
 */
async function beginSiteAuthSession({ userId, site, siteUrl }) {
  const storageStatePath = getSessionFilePath({ userId, site });
  await ensureStorageDirectory(storageStatePath);

  const connectUrl = (siteUrl && String(siteUrl).trim()) || `https://${site}`;
  const headless = String(process.env.PLAYWRIGHT_CONNECT_HEADLESS || "").toLowerCase() === "true";
  const waitMs = Number(process.env.PLAYWRIGHT_CONNECT_WAIT_MS || 120000);
  const saveEveryMs = Number(process.env.PLAYWRIGHT_CONNECT_SAVE_INTERVAL_MS || 5000);

  const browser = await chromium.launch({
    headless,
    channel: headless ? undefined : process.env.PLAYWRIGHT_CHROMIUM_CHANNEL || undefined
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(connectUrl, { waitUntil: "domcontentloaded", timeout: 45000 });

    // While the user signs in, persist cookies periodically so "Check login status" works before the window closes.
    let elapsed = 0;
    while (elapsed < waitMs) {
      const slice = Math.min(saveEveryMs, waitMs - elapsed);
      await delay(slice);
      elapsed += slice;
      try {
        await context.storageState({ path: storageStatePath });
        const content = await page.content();
        const blocker = detectBlocker(content);
        const authenticated = blocker ? false : isAuthenticatedHeuristic(page.url(), content);
        await upsertAuthSession({
          userId,
          site,
          storageStatePath,
          isAuthenticated: authenticated
        });
      } catch (persistErr) {
        console.warn("Site auth periodic save skipped:", persistErr?.message || persistErr);
      }
    }

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
  isAuthenticatedHeuristic,
  probeJobPageRequiresSavedSession
};
