/**
 * Tiny loader run on the employer site via a bookmark. Injects a one-time script from JobCopilot.
 * @param {string} origin - e.g. https://app.example.com (no trailing slash)
 * @param {string} sessionKey - from POST /api/prefill/session
 */
export function buildPrefillBookmarkletHref(origin, sessionKey) {
  if (!origin || !sessionKey) {
    return "";
  }
  const loader = `(function(){var u=${JSON.stringify(origin)};var k=${JSON.stringify(sessionKey)};var s=document.createElement("script");s.src=u+"/api/prefill/session/"+encodeURIComponent(k);s.async=true;s.charset="utf-8";s.onerror=function(){alert("JobCopilot could not load prefill. Create a new fill link on your dashboard.")};(document.head||document.documentElement).appendChild(s);})();`;
  return `javascript:${encodeURIComponent(loader)}`;
}
