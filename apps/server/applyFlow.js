const { chromium } = require("playwright");
const { getSessionStoragePath, markSessionBlocked } = require("./siteAuthSession");

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

async function verifyAuthenticatedSession({ userId, site, jobUrl }) {
  const sessionFile = await getSessionStoragePath({ userId, site });
  if (!sessionFile) {
    return {
      isAuthenticated: false,
      blocker: {
        blockerType: "auth_required",
        message: `Login required for ${site}. Connect once and retry.`
      }
    };
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ storageState: sessionFile });
    const page = await context.newPage();
    await page.goto(jobUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    const content = await page.content();
    const blocker = detectBlocker(content);
    if (blocker) {
      await markSessionBlocked({
        userId,
        site,
        blockerType: blocker.blockerType,
        blockerMessage: blocker.message
      });
      return {
        isAuthenticated: false,
        blocker
      };
    }

    return {
      isAuthenticated: isAuthenticatedHeuristic(page.url(), content),
      blocker: null
    };
  } catch (error) {
    await markSessionBlocked({
      userId,
      site,
      blockerType: "site_error",
      blockerMessage: error.message || "Failed to verify site authentication."
    });
    return {
      isAuthenticated: false,
      blocker: {
        blockerType: "site_error",
        message: error.message || "Failed to verify site authentication."
      }
    };
  } finally {
    await browser.close();
  }
}

module.exports = {
  detectBlocker,
  verifyAuthenticatedSession
};

