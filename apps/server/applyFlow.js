const { chromium } = require("playwright");
const { getSessionFilePath } = require("./siteAuthSession");

function normalizeSite(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
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
  const sessionFile = getSessionFilePath({ userId, site });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ storageState: sessionFile });
    const page = await context.newPage();
    await page.goto(jobUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    const content = await page.content();
    const blocker = detectBlocker(content);
    if (blocker) {
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
  normalizeSite,
  detectBlocker,
  verifyAuthenticatedSession
};

