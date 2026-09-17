import { loadDashboard } from "./dashboard.js";
import { bindNotificationControls, notifyUnreadAlerts } from "./notifications.js";
import { bindPrivacyControls } from "./privacy.js";
import { bindAnalysisControls } from "./analysis.js";
import { bindDataSourceControls } from "./data-sources.js";
import { bindPublicDataControls } from "./public-data.js";
import { loadPublicSnapshot } from "./public-data.js";
import { bindResearchWorkflowControls } from "./research-workflows.js";

const VERSION = "0.1.0";
const LAST_CHECKED_KEY = "yieldalpha:last-checked";
const root = document.documentElement;
const connectionStatus = document.querySelector("#connection-status");
const offlineShellStatus = document.querySelector("#offline-shell-status");
const lastUpdated = document.querySelector("#last-updated");
const installButton = document.querySelector("#install-button");
let deferredInstallPrompt;
let offlineShellReady = false;
let lastResumeRefresh = 0;

function formatTimestamp(value) {
  if (!value) return "Not checked yet";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function readLocal(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeLocal(key, value) {
  try { localStorage.setItem(key, value); } catch { /* Private browsing may deny local preferences. */ }
}

function updateConnectionStatus() {
  const online = navigator.onLine;
  connectionStatus.classList.toggle("online", online);
  connectionStatus.classList.toggle("offline", !online);
  connectionStatus.querySelector("span:last-child").textContent = online ? "Online" : "Offline";
  offlineShellStatus.textContent = offlineShellReady ? "Available" : "Checking";
  const banner = document.querySelector("#offline-banner");
  if (banner) {
    banner.hidden = online;
    banner.textContent = online ? "" : "Offline mode: local workspace data is available; provider values may be stale or unavailable.";
  }
}

function updateLastChecked() {
  const stored = readLocal(LAST_CHECKED_KEY);
  lastUpdated.textContent = `Last checked: ${formatTimestamp(stored)}`;
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    offlineShellStatus.textContent = "Unsupported";
    return;
  }
  try {
    await navigator.serviceWorker.register("./sw.js", { scope: "./" });
    offlineShellReady = true;
    updateConnectionStatus();
  } catch {
    offlineShellReady = false;
    offlineShellStatus.textContent = "Unavailable";
  }
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.hidden = false;
});

installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = undefined;
  installButton.hidden = true;
});

document.querySelector("#refresh-button").addEventListener("click", () => {
  const timestamp = new Date().toISOString();
  writeLocal(LAST_CHECKED_KEY, timestamp);
  updateLastChecked();
  loadDashboard();
  notifyUnreadAlerts();
});

document.querySelector("#theme-button").addEventListener("click", () => {
  root.classList.toggle("dark");
  writeLocal("yieldalpha:theme", root.classList.contains("dark") ? "dark" : "light");
});

if (readLocal("yieldalpha:theme") === "dark") root.classList.add("dark");
window.addEventListener("online", () => {
  updateConnectionStatus();
  // Re-read a newly generated local snapshot when connectivity returns. The
  // Python companion remains responsible for generating the snapshot.
  loadPublicSnapshot().catch(() => undefined);
});
window.addEventListener("offline", updateConnectionStatus);
function refreshSnapshotOnResume() {
  if (!navigator.onLine || Date.now() - lastResumeRefresh < 60_000) return;
  lastResumeRefresh = Date.now();
  loadPublicSnapshot().catch(() => undefined);
}
window.addEventListener("focus", refreshSnapshotOnResume);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refreshSnapshotOnResume();
});
document.querySelector("#app-version").textContent = `PWA shell · v${VERSION}`;
bindNotificationControls();
bindPrivacyControls();
bindAnalysisControls();
bindDataSourceControls();
bindPublicDataControls();
bindResearchWorkflowControls();
updateConnectionStatus();
updateLastChecked();
registerServiceWorker();
loadDashboard();
notifyUnreadAlerts();
