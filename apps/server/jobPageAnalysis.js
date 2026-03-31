const { chromium } = require("playwright");

const DEFAULT_TIMEOUT_MS = 20000;

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function countSignals(text, patterns = []) {
  return patterns.reduce((count, pattern) => count + (text.includes(pattern) ? 1 : 0), 0);
}

function summarizeSignalHits(signalHits) {
  return Object.entries(signalHits)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => ({ key, count: value }));
}

function deriveAccessDecision(signalHits) {
  const requiresLogin = signalHits.authWall > 0 || (signalHits.login > 0 && signalHits.directApply === 0);
  const requiresSignup = signalHits.signup > 0 && signalHits.directApply === 0;
  const canApplyWithoutAuth = signalHits.directApply > 0 && !requiresLogin && !requiresSignup;
  return { requiresLogin, requiresSignup, canApplyWithoutAuth };
}

function evaluateSignalsFromText(rawText) {
  const text = normalizeText(rawText);
  const signalHits = {
    login: countSignals(text, [
      "sign in",
      "log in",
      "already have an account",
      "continue with google",
      "continue with linkedin"
    ]),
    signup: countSignals(text, ["sign up", "create account", "join now", "register"]),
    directApply: countSignals(text, [
      "easy apply",
      "quick apply",
      "apply now",
      "one click apply",
      "submit application"
    ]),
    authWall: countSignals(text, [
      "to continue, please sign in",
      "login required",
      "please log in to apply"
    ])
  };

  return {
    signalHits,
    signals: summarizeSignalHits(signalHits),
    ...deriveAccessDecision(signalHits)
  };
}

function normalizeFieldRecord(field) {
  const fallbackId = field.name || field.id || field.label || field.placeholder || null;
  return {
    fieldIdentifier: field.fieldIdentifier || fallbackId,
    id: field.id || null,
    name: field.name || null,
    label: field.label || fallbackId,
    placeholder: field.placeholder || null,
    type: field.type || "text",
    required: Boolean(field.required),
    options: Array.isArray(field.options) ? field.options.slice(0, 50) : [],
    section: field.section || null,
    step: field.step || 1,
    validationRules: Array.isArray(field.validationRules) ? field.validationRules : []
  };
}

async function analyzeWithPlaywright(jobUrl) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const response = await page.goto(jobUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45000
    });

    await page.waitForTimeout(1200);

    const domAnalysis = await page.evaluate(() => {
      function getLabelFor(control) {
        const id = control.getAttribute("id");
        if (id) {
          const label = document.querySelector(`label[for="${id}"]`);
          if (label?.textContent) return label.textContent.trim();
        }
        const wrappedLabel = control.closest("label");
        if (wrappedLabel?.textContent) {
          return wrappedLabel.textContent.trim();
        }
        const aria = control.getAttribute("aria-label");
        if (aria) return aria.trim();
        return null;
      }

      const controls = Array.from(document.querySelectorAll("input, select, textarea"));
      const parsedFields = controls
        .map((control) => {
          const tag = control.tagName.toLowerCase();
          const type = tag === "input" ? (control.getAttribute("type") || "text").toLowerCase() : tag;
          if (["hidden", "submit", "button", "reset", "image"].includes(type)) {
            return null;
          }

          const options =
            tag === "select"
              ? Array.from(control.querySelectorAll("option"))
                  .map((option) => (option.textContent || "").trim())
                  .filter(Boolean)
              : [];

          const validationRules = [];
          if (control.hasAttribute("required")) validationRules.push("required");
          const minLength = control.getAttribute("minlength");
          if (minLength) validationRules.push(`minlength:${minLength}`);
          const maxLength = control.getAttribute("maxlength");
          if (maxLength) validationRules.push(`maxlength:${maxLength}`);
          const pattern = control.getAttribute("pattern");
          if (pattern) validationRules.push(`pattern:${pattern}`);

          const section =
            control.closest("fieldset")?.querySelector("legend")?.textContent?.trim() ||
            control.closest("section")?.getAttribute("aria-label") ||
            control.closest("form")?.getAttribute("id") ||
            null;

          const stepHolder = control.closest("[data-step], [data-current-step], [aria-current='step']");
          const stepRaw =
            stepHolder?.getAttribute("data-step") ||
            stepHolder?.getAttribute("data-current-step") ||
            null;
          const step = Number(stepRaw);

          const id = control.getAttribute("id");
          const name = control.getAttribute("name");
          const placeholder = control.getAttribute("placeholder");
          const label = getLabelFor(control);
          const fieldIdentifier = name || id || label || placeholder;

          if (!fieldIdentifier) {
            return null;
          }

          return {
            fieldIdentifier,
            id,
            name,
            label,
            placeholder,
            type,
            required: control.hasAttribute("required"),
            options,
            section,
            step: Number.isFinite(step) && step > 0 ? step : 1,
            validationRules
          };
        })
        .filter(Boolean)
        .slice(0, 80);

      const authWallSelectors = [
        "form[action*='login' i]",
        "form[action*='signin' i]",
        "input[name*='password' i]",
        "button:has-text('Sign in')",
        "button:has-text('Log in')",
        "a[href*='login' i]",
        "a[href*='signin' i]",
        "button[disabled]"
      ];

      const buttonTexts = Array.from(document.querySelectorAll("button, a[role='button']"))
        .map((node) => (node.textContent || "").trim())
        .filter(Boolean)
        .slice(0, 200)
        .join(" ");

      const oauthButtons = document.querySelectorAll(
        "button[aria-label*='google' i], button[aria-label*='linkedin' i], button[aria-label*='github' i]"
      ).length;

      return {
        text: document.body?.innerText || "",
        html: document.documentElement?.outerHTML || "",
        parsedFields,
        oauthButtons,
        hasAuthForm:
          Boolean(document.querySelector("form[action*='login' i], form[action*='signin' i], input[name*='password' i]")) ||
          /sign\s*in|log\s*in/i.test(buttonTexts),
        hasDisabledApplyButton: Array.from(document.querySelectorAll("button, a[role='button']")).some((btn) => {
          const label = (btn.textContent || "").toLowerCase();
          const disabled = btn.hasAttribute("disabled") || btn.getAttribute("aria-disabled") === "true";
          return disabled && (label.includes("apply") || label.includes("submit"));
        })
      };
    });

    const textSignal = evaluateSignalsFromText(domAnalysis.text || "");
    const robustSignalHits = {
      ...textSignal.signalHits,
      authWall: textSignal.signalHits.authWall + (domAnalysis.hasAuthForm ? 2 : 0) + (domAnalysis.oauthButtons > 0 ? 1 : 0),
      directApply:
        textSignal.signalHits.directApply + (domAnalysis.hasDisabledApplyButton ? 0 : 1)
    };
    const robustSignals = summarizeSignalHits(robustSignalHits);
    const decision = deriveAccessDecision(robustSignalHits);

    return {
      analyzer: "playwright",
      analyzed: true,
      fetchOk: Boolean(response?.ok()),
      statusCode: response?.status() || null,
      ...decision,
      signals: robustSignals,
      parsedFields: (domAnalysis.parsedFields || []).map(normalizeFieldRecord),
      selectors: {
        hasAuthForm: domAnalysis.hasAuthForm,
        oauthButtons: domAnalysis.oauthButtons,
        hasDisabledApplyButton: domAnalysis.hasDisabledApplyButton
      }
    };
  } finally {
    await browser.close();
  }
}

async function fetchJobPageHtml(jobUrl) {
  const response = await fetch(jobUrl, {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml"
    },
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
  });

  return {
    ok: response.ok,
    status: response.status,
    html: await response.text()
  };
}

function parseFieldsFromRawHtml(html) {
  const text = String(html || "");
  const fields = [];
  const fieldRegex = /<(input|select|textarea)([^>]*)>/gi;
  let match;
  while ((match = fieldRegex.exec(text)) !== null) {
    const tag = (match[1] || "").toLowerCase();
    const attrs = match[2] || "";
    const getAttr = (name) => attrs.match(new RegExp(`${name}=["']([^"']+)["']`, "i"))?.[1] || null;

    const type = tag === "input" ? String(getAttr("type") || "text").toLowerCase() : tag;
    if (["hidden", "submit", "button", "reset", "image"].includes(type)) {
      continue;
    }

    const name = getAttr("name");
    const id = getAttr("id");
    const placeholder = getAttr("placeholder");
    const required = /\srequired(\s|>|=)/i.test(attrs);
    const fieldIdentifier = name || id || placeholder;
    if (!fieldIdentifier) continue;

    fields.push(
      normalizeFieldRecord({
        fieldIdentifier,
        id,
        name,
        label: placeholder || fieldIdentifier,
        placeholder,
        type,
        required,
        options: [],
        section: null,
        step: 1,
        validationRules: required ? ["required"] : []
      })
    );

    if (fields.length >= 80) break;
  }

  return fields;
}

async function analyzeJobPageAccess({ jobUrl }) {
  try {
    return await analyzeWithPlaywright(jobUrl);
  } catch (playwrightError) {
    try {
      const page = await fetchJobPageHtml(jobUrl);
      const signalSummary = evaluateSignalsFromText(page.html);

      return {
        analyzer: "http_fallback",
        analyzed: true,
        fetchOk: page.ok,
        statusCode: page.status,
        requiresLogin: signalSummary.requiresLogin,
        requiresSignup: signalSummary.requiresSignup,
        canApplyWithoutAuth: signalSummary.canApplyWithoutAuth,
        signals: signalSummary.signals,
        parsedFields: parseFieldsFromRawHtml(page.html),
        selectors: {
          hasAuthForm: false,
          oauthButtons: 0,
          hasDisabledApplyButton: false
        },
        fallbackReason: playwrightError?.message || "Playwright analysis failed"
      };
    } catch (httpError) {
      return {
        analyzer: "none",
        analyzed: false,
        fetchOk: false,
        statusCode: null,
        requiresLogin: true,
        requiresSignup: false,
        canApplyWithoutAuth: false,
        signals: [],
        parsedFields: [],
        selectors: {
          hasAuthForm: false,
          oauthButtons: 0,
          hasDisabledApplyButton: false
        },
        error: httpError?.message || playwrightError?.message || "Failed to analyze job page"
      };
    }
  }
}

module.exports = {
  analyzeJobPageAccess
};
