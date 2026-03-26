const DEFAULT_USER_AGENTS = [
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

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAntiBotResponse(status, body) {
  const content = String(body || "").toLowerCase();
  if (status === 403 || status === 429) return true;
  return (
    content.includes("captcha") ||
    content.includes("verify you are human") ||
    content.includes("challenge") ||
    content.includes("access denied") ||
    content.includes("cloudflare")
  );
}

function createRotatingHttpClient(config = {}) {
  const provider = String(config.provider || "default");
  const timeoutMs = parseNumber(
    config.timeoutMs || process.env.PUBLIC_JOB_FETCH_TIMEOUT_MS,
    15000
  );
  const retries = Math.max(
    1,
    parseNumber(config.retries || process.env.PUBLIC_JOB_FETCH_RETRIES, 3)
  );
  const circuitBreakerMinutes = parseNumber(
    process.env.PUBLIC_JOB_FETCH_CIRCUIT_BREAKER_MINUTES,
    10
  );
  const state = getProviderState(provider);
  const userAgents = parseList(process.env.PUBLIC_JOB_FETCH_USER_AGENTS);
  const resolvedUserAgents = userAgents.length > 0 ? userAgents : DEFAULT_USER_AGENTS;
  const proxyPool = parseList(process.env.PUBLIC_JOB_FETCH_PROXIES);

  async function get(url, extra = {}) {
    const now = Date.now();
    if (state.blockedUntil > now) {
      const blocker = {
        type: "rate_limited",
        message: `Provider temporarily blocked until ${new Date(state.blockedUntil).toISOString()}`
      };
      const error = new Error(blocker.message);
      error.blocker = blocker;
      error.status = 429;
      throw error;
    }

    let lastError = null;
    for (let attempt = 0; attempt < retries; attempt += 1) {
      const userAgent = resolvedUserAgents[attempt % resolvedUserAgents.length];
      const proxy = proxyPool.length > 0 ? proxyPool[attempt % proxyPool.length] : null;

      try {
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "User-Agent": userAgent,
            Accept: "application/json, text/html;q=0.9,*/*;q=0.8",
            ...(proxy ? { "X-Proxy-Target": proxy } : {}),
            ...(extra.headers || {})
          },
          signal: AbortSignal.timeout(timeoutMs)
        });

        const body = await response.text();
        if (isAntiBotResponse(response.status, body)) {
          state.antiBotHits += 1;
          if (state.antiBotHits >= 3) {
            state.blockedUntil = Date.now() + circuitBreakerMinutes * 60 * 1000;
          }
          const blocker = {
            type: "anti_bot_challenge",
            message: "Anti-bot challenge detected."
          };
          const error = new Error(blocker.message);
          error.blocker = blocker;
          error.status = response.status;
          error.body = body;
          lastError = error;
          if (attempt < retries - 1) {
            await sleep(250 * 2 ** attempt);
          }
          continue;
        }

        state.antiBotHits = 0;
        return {
          status: response.status,
          ok: response.ok,
          body,
          userAgent,
          proxy
        };
      } catch (error) {
        lastError = error;
        if (attempt < retries - 1) {
          await sleep(250 * 2 ** attempt);
        }
      }
    }

    const fallback = new Error(
      lastError?.message || "Failed to fetch provider data after retries"
    );
    if (lastError?.blocker) {
      fallback.blocker = lastError.blocker;
      fallback.status = lastError.status;
      fallback.body = lastError.body;
    } else {
      fallback.blocker = {
        type: "provider_unreachable",
        message: fallback.message
      };
      fallback.status = 502;
    }
    throw fallback;
  }

  return {
    get
  };
}

module.exports = {
  createRotatingHttpClient
};
