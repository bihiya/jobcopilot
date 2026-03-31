const path = require("path");
const fs = require("fs/promises");
const { chromium } = require("playwright");
const { getSessionFilePath, markSessionChecked } = require("./siteAuthSession");
const { markCredentialResult } = require("./domainCredentialStore");

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
      await markSessionChecked({ userId, site, isAuthenticated: false });
      return {
        isAuthenticated: false,
        blocker
      };
    }

    const isAuthenticated = isAuthenticatedHeuristic(page.url(), content);
    await markSessionChecked({ userId, site, isAuthenticated });
    return {
      isAuthenticated,
      blocker: null
    };
  } catch (error) {
    await markSessionChecked({ userId, site, isAuthenticated: false });
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

async function fillField(page, field) {
  const selectors = [];
  if (field.name) selectors.push(`[name="${field.name}"]`);
  if (field.id) selectors.push(`#${field.id}`);
  if (field.fieldIdentifier) selectors.push(`[name="${field.fieldIdentifier}"]`, `#${field.fieldIdentifier}`);

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) === 0) continue;

    try {
      const tag = await locator.evaluate((el) => el.tagName.toLowerCase());
      if (tag === "select") {
        await locator.selectOption(String(field.value));
      } else {
        await locator.fill(String(field.value));
      }
      return true;
    } catch {
      // Continue trying other selectors.
    }
  }

  return false;
}

async function trySubmit(page) {
  const candidates = [
    "button:has-text('Apply')",
    "button:has-text('Apply now')",
    "button:has-text('Submit')",
    "button[type='submit']",
    "input[type='submit']"
  ];

  for (const selector of candidates) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) === 0) continue;

    const disabled = await locator.evaluate((node) => {
      return node.hasAttribute("disabled") || node.getAttribute("aria-disabled") === "true";
    }).catch(() => false);

    if (disabled) continue;

    await locator.click({ timeout: 7000 }).catch(() => null);
    await page.waitForTimeout(1500);
    return true;
  }

  return false;
}

async function saveApplyScreenshot(page, { userId, site }) {
  const screenshotDir = path.resolve(__dirname, "../../data/apply-screenshots", String(userId));
  await fs.mkdir(screenshotDir, { recursive: true });
  const fileName = `${String(site).replace(/[^a-zA-Z0-9._-]/g, "_")}-${Date.now()}.png`;
  const absolutePath = path.join(screenshotDir, fileName);
  await page.screenshot({ path: absolutePath, fullPage: true });
  return absolutePath;
}

async function detectSubmissionSuccess(page) {
  const text = (await page.content()).toLowerCase();
  if (text.includes("application submitted") || text.includes("thanks for applying")) {
    return {
      success: true,
      confirmationText: "Detected application submission confirmation in page content."
    };
  }

  return {
    success: false,
    confirmationText: "No clear submission confirmation detected."
  };
}

function buildManualPrefillBundle(filledFields = []) {
  const usable = (filledFields || [])
    .filter((field) => field && field.value !== null && field.value !== undefined && field.value !== "")
    .map((field) => ({
      fieldIdentifier: field.fieldIdentifier || field.name || field.id || "",
      name: field.name || null,
      id: field.id || null,
      value: String(field.value)
    }));

  const scriptRows = usable
    .map((field) => {
      const serialized = JSON.stringify(field);
      return `    ${serialized}`;
    })
    .join(",\n");

  const prefillScript = `(function () {\n  const rows = [\n${scriptRows}\n  ];\n  let filled = 0;\n  for (const row of rows) {\n    const selectors = [];\n    if (row.name) selectors.push('[name=\"' + row.name + '\"]');\n    if (row.id) selectors.push('#' + row.id);\n    if (row.fieldIdentifier) {\n      selectors.push('[name=\"' + row.fieldIdentifier + '\"]');\n      selectors.push('#' + row.fieldIdentifier);\n    }\n\n    let target = null;\n    for (const selector of selectors) {\n      const node = document.querySelector(selector);\n      if (node) {\n        target = node;\n        break;\n      }\n    }\n    if (!target) continue;\n\n    if (target.tagName === 'SELECT') {\n      target.value = row.value;\n      target.dispatchEvent(new Event('change', { bubbles: true }));\n      filled += 1;\n      continue;\n    }\n\n    target.focus();\n    target.value = row.value;\n    target.dispatchEvent(new Event('input', { bubbles: true }));\n    target.dispatchEvent(new Event('change', { bubbles: true }));\n    filled += 1;\n  }\n  console.log('JobCopilot prefill complete. Filled fields:', filled, 'of', rows.length);\n})();`;

  return {
    fields: usable,
    prefillScript
  };
}

async function executeSubmitFlow({ page, filledFields }) {
  const filledResults = [];
  for (const field of filledFields || []) {
    if (field.value === null || field.value === undefined || field.value === "") {
      continue;
    }
    const filled = await fillField(page, field);
    filledResults.push({ fieldIdentifier: field.fieldIdentifier, filled });
  }

  const requiredUnfilled = filledResults.filter((item) => !item.filled);
  const clickedSubmit = await trySubmit(page);
  const confirmation = clickedSubmit ? await detectSubmissionSuccess(page) : { success: false, confirmationText: "Submit action not found or disabled." };

  return {
    filledResults,
    requiredUnfilled,
    clickedSubmit,
    confirmation
  };
}

async function runApplyFlowWithPlaywright({ userId, site, jobUrl, filledFields = [], skipAuthVerification = false }) {
  const browser = await chromium.launch({ headless: true });
  let context;
  try {
    if (skipAuthVerification) {
      context = await browser.newContext();
    } else {
      const verification = await verifyAuthenticatedSession({ userId, site, jobUrl });
      if (verification.blocker) {
        await markCredentialResult({ userId, site, success: false });
        const manualPrefill = buildManualPrefillBundle(filledFields);
        return {
          applied: false,
          blocker: {
            type: verification.blocker.blockerType || "unknown",
            message: verification.blocker.message
          },
          failureReason: verification.blocker.message,
          manualPrefill
        };
      }
      if (!verification.isAuthenticated) {
        await markCredentialResult({ userId, site, success: false });
        const manualPrefill = buildManualPrefillBundle(filledFields);
        return {
          applied: false,
          blocker: {
            type: "login_required",
            message: "Still appears logged out on the job page."
          },
          failureReason: "not_authenticated",
          manualPrefill
        };
      }
      const sessionFile = getSessionFilePath({ userId, site });
      context = await browser.newContext({ storageState: sessionFile });
    }

    const page = await context.newPage();
    await page.goto(jobUrl, { waitUntil: "domcontentloaded", timeout: 45000 });

    const blocked = detectBlocker(await page.content());
    if (blocked) {
      await markCredentialResult({ userId, site, success: false });
      const manualPrefill = buildManualPrefillBundle(filledFields);
      return {
        applied: false,
        blocker: {
          type: blocked.blockerType,
          message: blocked.message
        },
        failureReason: blocked.blockerType,
        manualPrefill,
        nextAction:
          blocked.blockerType === "captcha"
            ? "CAPTCHA detected. Open the job page, solve CAPTCHA manually, run manualPrefill.prefillScript in browser console, then submit."
            : "Open the job page manually, run manualPrefill.prefillScript, and complete the remaining step."
      };
    }

    let submission = await executeSubmitFlow({ page, filledFields });
    if (!submission.confirmation.success) {
      await page.waitForTimeout(1000);
      submission = await executeSubmitFlow({ page, filledFields });
    }
    const screenshotPath = await saveApplyScreenshot(page, { userId, site });

    if (submission.confirmation.success) {
      await markCredentialResult({ userId, site, success: true });
      return {
        applied: true,
        blocker: null,
        submittedAt: new Date().toISOString(),
        confirmationText: submission.confirmation.confirmationText,
        screenshotPath,
        failureReason: null,
        fieldFillSummary: submission.filledResults
      };
    }

    await markCredentialResult({ userId, site, success: false });
    const manualPrefill = buildManualPrefillBundle(filledFields);
    return {
      applied: false,
      blocker: null,
      submittedAt: null,
      confirmationText: submission.confirmation.confirmationText,
      screenshotPath,
      failureReason: submission.clickedSubmit ? "confirmation_not_detected" : "submit_not_found_or_disabled",
      fieldFillSummary: submission.filledResults,
      unfilledFields: submission.requiredUnfilled,
      manualPrefill
    };
  } catch (error) {
    await markCredentialResult({ userId, site, success: false }).catch(() => null);
    const manualPrefill = buildManualPrefillBundle(filledFields);
    return {
      applied: false,
      blocker: {
        type: "apply_flow_error",
        message: error.message || "Apply flow failed"
      },
      failureReason: error.message || "apply_flow_error",
      manualPrefill
    };
  } finally {
    if (context) {
      await context.close().catch(() => null);
    }
    await browser.close().catch(() => null);
  }
}

module.exports = {
  detectBlocker,
  verifyAuthenticatedSession,
  runApplyFlowWithPlaywright
};
