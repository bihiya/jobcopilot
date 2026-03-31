const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const {
  getSessionFilePath,
  markSessionChecked,
  detectBlocker,
  isAuthenticatedHeuristic
} = require("./siteAuthSession");
const { markCredentialResult } = require("./domainCredentialStore");

/**
 * Try to fill one form control matched by fieldIdentifier (name, id, label, placeholder).
 */
async function tryFillElement(locator, value) {
  const count = await locator.count();
  if (!count) return false;
  const el = locator.first();
  const tag = await el.evaluate((node) => node.tagName.toLowerCase());
  const inputType = (await el.getAttribute("type"))?.toLowerCase() || "text";
  if (inputType === "hidden") return false;
  if (inputType === "file") return false;
  if (inputType === "checkbox" || inputType === "radio") return false;

  const str = String(value ?? "");
  if (tag === "select") {
    await el.selectOption({ label: str }).catch(async () => {
      await el.selectOption({ value: str }).catch(async () => {
        const opts = await el.locator("option").all();
        for (const opt of opts) {
          const t = (await opt.textContent())?.trim();
          if (t && str.toLowerCase().includes(t.toLowerCase())) {
            await opt.click();
            return;
          }
        }
      });
    });
    return true;
  }

  await el.fill(str);
  return true;
}

async function fillOneField(page, fieldIdentifier, value) {
  if (value == null || value === "") return false;
  const id = String(fieldIdentifier || "").trim();
  if (!id) return false;
  const strVal = String(value);

  const safeAttr = id.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const byName = page.locator(
    `input[name="${safeAttr}"], textarea[name="${safeAttr}"], select[name="${safeAttr}"]`
  );
  if (await byName.count()) {
    if (await tryFillElement(byName, strVal)) return true;
  }

  if (/^[\w.-]+$/.test(id)) {
    const byId = page.locator(`[id="${id.replace(/"/g, '\\"')}"]`);
    if (await byId.count()) {
      if (await tryFillElement(byId, strVal)) return true;
    }
  }

  try {
    const byLabel = page.getByLabel(id, { exact: false }).first();
    if (await byLabel.count()) {
      if (await tryFillElement(byLabel, strVal)) return true;
    }
  } catch {
    /* no matching label */
  }

  try {
    const byPh = page.getByPlaceholder(id, { exact: false }).first();
    if (await byPh.count()) {
      if (await tryFillElement(byPh, strVal)) return true;
    }
  } catch {
    /* no matching placeholder */
  }

  return false;
}

/**
 * Fill mapped fields on the current page (best-effort). Runs before captcha / auth checks.
 */
async function fillFieldsOnPage(page, filledFields) {
  const attempts = [];
  let filledCount = 0;
  for (const field of filledFields || []) {
    const ok = await fillOneField(page, field.fieldIdentifier, field.value);
    attempts.push({ fieldIdentifier: field.fieldIdentifier, ok });
    if (ok) filledCount += 1;
  }
  return { filledCount, attempts };
}

async function verifyAnonymousJobPage({ jobUrl }) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(jobUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    return {
      isAuthenticated: true,
      blocker: null,
      anonymous: true
    };
  } catch (error) {
    return {
      isAuthenticated: false,
      blocker: {
        blockerType: "site_error",
        message: error.message || "Failed to open job page without a saved site session."
      }
    };
  } finally {
    await browser.close();
  }
}

async function verifyAuthenticatedSession({
  userId,
  site,
  jobUrl,
  allowWithoutSavedSession = false
}) {
  const sessionFile = getSessionFilePath({ userId, site });
  const hasSessionFile = fs.existsSync(sessionFile);

  if (!hasSessionFile && allowWithoutSavedSession) {
    return verifyAnonymousJobPage({ jobUrl });
  }

  if (!hasSessionFile) {
    return {
      isAuthenticated: false,
      blocker: {
        blockerType: "auth_required",
        message: `No saved session for ${site}. Connect once under Settings or when prompted, then retry.`
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

    const disabled = await locator
      .evaluate((node) => {
        return node.hasAttribute("disabled") || node.getAttribute("aria-disabled") === "true";
      })
      .catch(() => false);

    if (disabled) continue;

    await locator.click({ timeout: 7000 }).catch(() => null);
    await page.waitForTimeout(1500);
    return true;
  }

  return false;
}

async function saveApplyScreenshot(page, { userId, site }) {
  const screenshotDir = path.resolve(__dirname, "../../data/apply-screenshots", String(userId));
  await fs.promises.mkdir(screenshotDir, { recursive: true });
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

const CAPTCHA_USER_MESSAGE =
  "A captcha appeared after the form was filled. Complete the challenge on the employer site (open the job URL in your browser), then submit the application yourself.";

const TWO_FACTOR_USER_MESSAGE =
  "Two-factor or a verification step was detected after filling the form. Finish verification on the employer site, then submit manually if needed.";

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

async function trySubmitAndConfirm(page) {
  const clickedSubmit = await trySubmit(page);
  const confirmation = clickedSubmit
    ? await detectSubmissionSuccess(page)
    : { success: false, confirmationText: "Submit action not found or disabled." };
  return { clickedSubmit, confirmation };
}

function buildFieldFillSummaryFromAttempts(fillSummary) {
  return (fillSummary?.attempts || []).map(({ fieldIdentifier, ok }) => ({
    fieldIdentifier,
    filled: ok
  }));
}

/**
 * Opens the job page, fills mapped fields, detects captcha / blockers, then attempts submit.
 */
async function runApplyFlowWithPlaywright({
  userId,
  site,
  jobUrl,
  filledFields = [],
  skipAuthVerification = false,
  allowWithoutSavedSession = false
}) {
  const sessionFile = getSessionFilePath({ userId, site });
  const hasSessionFile = fs.existsSync(sessionFile);
  const browser = await chromium.launch({ headless: true });
  let context;
  try {
    if (skipAuthVerification) {
      context = await browser.newContext();
    } else if (!hasSessionFile) {
      if (!allowWithoutSavedSession) {
        await markCredentialResult({ userId, site, success: false });
        return {
          applied: false,
          blocker: {
            type: "auth_required",
            message: `No saved session for ${site}. Connect once under Settings or when prompted, then retry.`
          },
          fillSummary: { filledCount: 0, attempts: [] },
          manualPrefill: buildManualPrefillBundle(filledFields)
        };
      }
      context = await browser.newContext();
    } else {
      const verification = await verifyAuthenticatedSession({ userId, site, jobUrl });
      if (verification.blocker) {
        await markCredentialResult({ userId, site, success: false });
        return {
          applied: false,
          blocker: {
            type: verification.blocker.blockerType || "unknown",
            message: verification.blocker.message
          },
          failureReason: verification.blocker.message,
          manualPrefill: buildManualPrefillBundle(filledFields),
          fillSummary: { filledCount: 0, attempts: [] }
        };
      }
      if (!verification.isAuthenticated) {
        await markCredentialResult({ userId, site, success: false });
        return {
          applied: false,
          blocker: {
            type: "login_required",
            message: "Still appears logged out on the job page."
          },
          failureReason: "not_authenticated",
          manualPrefill: buildManualPrefillBundle(filledFields),
          fillSummary: { filledCount: 0, attempts: [] }
        };
      }
      context = await browser.newContext({ storageState: sessionFile });
    }

    const page = await context.newPage();
    await page.goto(jobUrl, { waitUntil: "domcontentloaded", timeout: 45000 });

    const fillSummary = await fillFieldsOnPage(page, filledFields);
    await new Promise((r) => setTimeout(r, 400));

    const content = await page.content();
    let blocker = detectBlocker(content);

    if (blocker?.blockerType === "captcha") {
      await markCredentialResult({ userId, site, success: false });
      const manualPrefill = buildManualPrefillBundle(filledFields);
      return {
        applied: false,
        blocker: {
          type: "captcha",
          message: CAPTCHA_USER_MESSAGE
        },
        failureReason: blocker.blockerType,
        fillSummary,
        manualPrefill,
        nextAction:
          "CAPTCHA detected. Open the job page, solve CAPTCHA manually, run manualPrefill.prefillScript in browser console, then submit."
      };
    }

    if (blocker?.blockerType === "two_factor") {
      await markCredentialResult({ userId, site, success: false });
      return {
        applied: false,
        blocker: {
          type: "two_factor",
          message: TWO_FACTOR_USER_MESSAGE
        },
        failureReason: blocker.blockerType,
        fillSummary,
        manualPrefill: buildManualPrefillBundle(filledFields),
        nextAction:
          "Open the job page manually, run manualPrefill.prefillScript, and complete the remaining step."
      };
    }

    if (blocker) {
      await markCredentialResult({ userId, site, success: false });
      const manualPrefill = buildManualPrefillBundle(filledFields);
      return {
        applied: false,
        blocker: {
          type: blocker.blockerType || "unknown",
          message: blocker.message
        },
        failureReason: blocker.blockerType,
        fillSummary,
        manualPrefill,
        nextAction:
          "Open the job page manually, run manualPrefill.prefillScript, and complete the remaining step."
      };
    }

    const isAuthenticated = isAuthenticatedHeuristic(page.url(), content);
    if (hasSessionFile) {
      await markSessionChecked({ userId, site, isAuthenticated });
    }

    if (!isAuthenticated) {
      await markCredentialResult({ userId, site, success: false });
      return {
        applied: false,
        blocker: {
          type: "login_required",
          message: "Still appears logged out on the job page after filling fields."
        },
        failureReason: "not_authenticated",
        fillSummary,
        manualPrefill: buildManualPrefillBundle(filledFields)
      };
    }

    let submission = await trySubmitAndConfirm(page);
    if (!submission.confirmation.success) {
      await page.waitForTimeout(1000);
      submission = await trySubmitAndConfirm(page);
    }
    const screenshotPath = await saveApplyScreenshot(page, { userId, site });
    const fieldFillSummary = buildFieldFillSummaryFromAttempts(fillSummary);
    const requiredUnfilled = fieldFillSummary.filter((item) => !item.filled);

    if (submission.confirmation.success) {
      await markCredentialResult({ userId, site, success: true });
      return {
        applied: true,
        blocker: null,
        submittedAt: new Date().toISOString(),
        confirmationText: submission.confirmation.confirmationText,
        screenshotPath,
        failureReason: null,
        fieldFillSummary,
        fillSummary
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
      fieldFillSummary,
      unfilledFields: requiredUnfilled,
      manualPrefill,
      fillSummary,
      note: hasSessionFile
        ? "Form fields filled where matched; submit attempted but confirmation not detected."
        : "Form fields filled where matched (no saved employer login); submit attempted but confirmation not detected."
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
      manualPrefill,
      fillSummary: { filledCount: 0, attempts: [] }
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
