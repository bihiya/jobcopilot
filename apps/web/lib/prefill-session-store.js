const TTL_MS = 20 * 60 * 1000;
const MAX_SCRIPT_CHARS = 512 * 1024;

function getStore() {
  if (!globalThis.__jobcopilotPrefillSessions) {
    globalThis.__jobcopilotPrefillSessions = new Map();
  }
  return globalThis.__jobcopilotPrefillSessions;
}

function sweepExpired(store) {
  const now = Date.now();
  for (const [k, v] of store.entries()) {
    if (v.expiresAt < now) store.delete(k);
  }
}

/**
 * @param {string} userId
 * @param {string} script
 * @returns {string | null} session key or null if too large
 */
export function createPrefillSession(userId, script) {
  if (typeof script !== "string" || script.length > MAX_SCRIPT_CHARS) {
    return null;
  }
  const store = getStore();
  sweepExpired(store);
  const key = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  store.set(key, {
    userId,
    script,
    expiresAt: Date.now() + TTL_MS
  });
  return key;
}

/**
 * One-time read: removes session after successful fetch.
 * @param {string} key
 * @returns {string | null}
 */
export function takePrefillScript(key) {
  if (!key || typeof key !== "string") {
    return null;
  }
  const store = getStore();
  sweepExpired(store);
  const row = store.get(key);
  if (!row || row.expiresAt < Date.now()) {
    store.delete(key);
    return null;
  }
  store.delete(key);
  return row.script;
}

export { MAX_SCRIPT_CHARS };
