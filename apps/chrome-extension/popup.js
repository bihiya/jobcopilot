const originInput = document.getElementById("origin");
const sessionKeyInput = document.getElementById("sessionKey");
const statusEl = document.getElementById("status");
const dashboardLink = document.getElementById("dashboardLink");

const DEFAULT_ORIGIN = "http://localhost:3000";

function showStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = type;
}

function normalizeOrigin(rawOrigin) {
  if (!rawOrigin) return "";
  try {
    const parsed = new URL(rawOrigin.trim());
    return parsed.origin;
  } catch {
    return "";
  }
}

function refreshDashboardLink(origin) {
  const useOrigin = origin || DEFAULT_ORIGIN;
  dashboardLink.href = `${useOrigin}/dashboard`;
}

async function loadConfig() {
  const { jobcopilotPrefillOrigin, jobcopilotPrefillSessionKey } = await chrome.storage.sync.get([
    "jobcopilotPrefillOrigin",
    "jobcopilotPrefillSessionKey"
  ]);

  originInput.value = jobcopilotPrefillOrigin || DEFAULT_ORIGIN;
  sessionKeyInput.value = jobcopilotPrefillSessionKey || "";
  refreshDashboardLink(originInput.value);
}

async function saveConfig() {
  const origin = normalizeOrigin(originInput.value);
  const sessionKey = sessionKeyInput.value.trim();

  if (!origin) {
    showStatus("Please enter a valid app origin URL.", "error");
    return null;
  }

  if (!sessionKey) {
    showStatus("Please enter a prefill session key.", "error");
    return null;
  }

  await chrome.storage.sync.set({
    jobcopilotPrefillOrigin: origin,
    jobcopilotPrefillSessionKey: sessionKey
  });

  originInput.value = origin;
  refreshDashboardLink(origin);
  showStatus("Saved.", "ok");

  return { origin, sessionKey };
}

async function runPrefill() {
  const saved = await saveConfig();
  if (!saved) return;

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.id) {
    showStatus("Could not identify the active tab.", "error");
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      args: [saved.origin, saved.sessionKey],
      func: (origin, sessionKey) => {
        const script = document.createElement("script");
        script.src = `${origin}/api/prefill/session/${encodeURIComponent(sessionKey)}`;
        script.async = true;
        script.charset = "utf-8";
        script.onerror = () => {
          alert("JobCopilot prefill failed to load. Please generate a fresh session key.");
        };
        (document.head || document.documentElement).appendChild(script);
      }
    });

    showStatus("Prefill script injected into current tab.", "ok");
  } catch (error) {
    showStatus(`Injection failed: ${error?.message || "Unknown error"}`, "error");
  }
}

document.getElementById("save").addEventListener("click", saveConfig);
document.getElementById("run").addEventListener("click", runPrefill);
originInput.addEventListener("input", () => refreshDashboardLink(normalizeOrigin(originInput.value)));

loadConfig().catch(() => {
  showStatus("Could not load saved configuration.", "error");
});
