const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
];

const providerState = new Map();

function getProviderState(provider) {
  if (!providerState.has(provider)) {
    providerState.set(provider, {
      antiBotHits: 0,
      blockedUntil: 0
    });
  }
  return providerState.get(provider);
}

function parseProxyPool() {
  return String(process.env.JOB_FETCH_PROXIES || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isAntiBotResponse(status, body) {
  const content = String(body || "").toLowerCase();
  if (status === 403 || status === 429) return true;
  return (
    content.includes("captcha") ||
    content.includes("verify you are human") ||
    content.includes("access denied") ||
    content.includes("cloudflare")
  );
}

async function fetchWithRotation({
  provider,
  url,
  headers = {},
  timeoutMs = 15000,
  retries = 3
}) {
  const state = getProviderState(provider);
  const now = Date.now();
  if (state.blockedUntil > now) {
    return {
      ok: false,
      status: 429,
      blocked: true,
      blocker: {
        type: "rate_limited",
        message: `Provider temporarily blocked until ${new Date(state.blockedUntil).toISOString()}`
      }
    };
  }

  const proxies = parseProxyPool();

  let lastError = null;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const userAgent = USER_AGENTS[attempt % USER_AGENTS.length];
    const proxy = proxies.length > 0 ? proxies[attempt % proxies.length] : null;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": userAgent,
          Accept: "application/json, text/html;q=0.9,*/*;q=0.8",
          ...(proxy ? { "X-Proxy-Target": proxy } : {}),
          ...headers
        },
        signal: AbortSignal.timeout(timeoutMs)
      });

      const body = await response.text();
      if (isAntiBotResponse(response.status, body)) {
        state.antiBotHits += 1;
        if (state.antiBotHits >= 3) {
          state.blockedUntil = Date.now() + 10 * 60 * 1000;
        }
        lastError = new Error("Anti-bot challenge detected");
        continue;
      }

      state.antiBotHits = 0;
      return {
        ok: response.ok,
        status: response.status,
        body,
        userAgent,
        proxy
      };
    } catch (error) {
      lastError = error;
    }
  }

  return {
    ok: false,
    status: 502,
    blocker: {
      type: "provider_unreachable",
      message: lastError?.message || "Failed to fetch provider data after retries"
    }
  };
}

module.exports = {
  fetchWithRotation
};
