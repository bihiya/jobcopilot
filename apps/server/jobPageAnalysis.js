const DEFAULT_TIMEOUT_MS = 15000;

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function countSignals(text, patterns = []) {
  return patterns.reduce((count, pattern) => {
    return count + (text.includes(pattern) ? 1 : 0);
  }, 0);
}

function summarizeSignalHits(signalHits) {
  return Object.entries(signalHits)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => ({ key, count: value }));
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

async function analyzeJobPageAccess({ jobUrl }) {
  try {
    const page = await fetchJobPageHtml(jobUrl);
    const text = normalizeText(page.html);

    const signalHits = {
      login: countSignals(text, [
        "sign in",
        "log in",
        "already have an account",
        "continue with google",
        "continue with linkedin"
      ]),
      signup: countSignals(text, [
        "sign up",
        "create account",
        "join now",
        "register"
      ]),
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

    const requiresLogin = signalHits.authWall > 0 || (signalHits.login > 0 && signalHits.directApply === 0);
    const requiresSignup = signalHits.signup > 0 && signalHits.directApply === 0;
    const canApplyWithoutAuth = signalHits.directApply > 0 && !requiresLogin && !requiresSignup;

    const parsedFields = [];
    const inputRegex = /<input[^>]*>/gi;
    let inputMatch;
    while ((inputMatch = inputRegex.exec(page.html)) !== null) {
      const tag = inputMatch[0] || "";
      const nameMatch = tag.match(/name=["']([^"']+)["']/i);
      const idMatch = tag.match(/id=["']([^"']+)["']/i);
      const placeholderMatch = tag.match(/placeholder=["']([^"']+)["']/i);
      const typeMatch = tag.match(/type=["']([^"']+)["']/i);
      const fieldIdentifier = nameMatch?.[1] || idMatch?.[1] || placeholderMatch?.[1] || null;
      const type = (typeMatch?.[1] || "").toLowerCase();
      if (!fieldIdentifier) continue;
      if (["hidden", "submit", "button", "checkbox", "radio"].includes(type)) continue;
      parsedFields.push({
        fieldIdentifier,
        id: idMatch?.[1] || null,
        name: nameMatch?.[1] || null,
        label: placeholderMatch?.[1] || fieldIdentifier,
        placeholder: placeholderMatch?.[1] || null
      });
      if (parsedFields.length >= 30) break;
    }

    return {
      analyzed: true,
      fetchOk: page.ok,
      statusCode: page.status,
      requiresLogin,
      requiresSignup,
      canApplyWithoutAuth,
      signals: summarizeSignalHits(signalHits),
      parsedFields
    };
  } catch (error) {
    return {
      analyzed: false,
      fetchOk: false,
      statusCode: null,
      requiresLogin: true,
      requiresSignup: false,
      canApplyWithoutAuth: false,
      signals: [],
      parsedFields: [],
      error: error?.message || "Failed to analyze job page"
    };
  }
}

module.exports = {
  analyzeJobPageAccess
};
