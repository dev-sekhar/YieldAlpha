const DATABASE_NAME = "yieldalpha-workspace";
const SEEN_ALERTS_KEY = "yieldalpha:notification-seen-alerts";
const PREFERENCES_KEY = "yieldalpha:notification-preferences";

export function readNotificationPreferences() {
  const defaults = { browserNotifications: false, vibrateCriticalHigh: true };
  try {
    const saved = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? "{}");
    return { ...defaults, ...(typeof saved === "object" && saved !== null ? saved : {}) };
  } catch {
    return defaults;
  }
}

export function saveNotificationPreferences(preferences) {
  const next = { ...readNotificationPreferences(), ...preferences };
  try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify(next)); } catch { /* Browser privacy mode may disable local preferences. */ }
  return next;
}

function statusElement() {
  return document.querySelector("#notification-status");
}

function setStatus(message) {
  const element = statusElement();
  if (element) element.textContent = message;
}

function supported() {
  return typeof Notification !== "undefined";
}

function readSeen() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SEEN_ALERTS_KEY) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function writeSeen(seen) {
  try { localStorage.setItem(SEEN_ALERTS_KEY, JSON.stringify([...seen].slice(-250))); } catch { /* Notification delivery still works for this session. */ }
}

async function readAlerts() {
  if (typeof indexedDB === "undefined" || typeof indexedDB.databases !== "function") return [];
  const databases = await indexedDB.databases();
  if (!databases.some((database) => database.name === DATABASE_NAME)) return [];
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to read alerts"));
  });
  try {
    if (!database.objectStoreNames.contains("alerts")) return [];
    return await new Promise((resolve, reject) => {
      const request = database.transaction("alerts", "readonly").objectStore("alerts").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Unable to read alerts"));
    });
  } finally {
    database.close();
  }
}

async function primeSeenAlerts() {
  const seen = readSeen();
  for (const alert of await readAlerts()) seen.add(alert.id);
  writeSeen(seen);
}

export async function requestBrowserNotifications() {
  if (!supported()) {
    setStatus("Browser notifications unavailable");
    return "unsupported";
  }
  const permission = await Notification.requestPermission();
  if (permission === "granted") {
    try {
      await primeSeenAlerts();
      saveNotificationPreferences({ browserNotifications: true });
      setStatus("Enabled · new alerts will notify");
    } catch {
      setStatus("Enabled · alert history unavailable");
    }
  } else if (permission === "denied") { saveNotificationPreferences({ browserNotifications: false }); setStatus("Blocked in browser settings"); }
  else setStatus("Not enabled");
  return permission;
}

export function bindNotificationControls() {
  const button = document.querySelector("#notification-button");
  if (!button) return;
  if (!supported()) {
    button.disabled = true;
    setStatus("Browser notifications unavailable");
    return;
  }
  const preferences = readNotificationPreferences();
  const vibrate = document.querySelector("#notification-vibrate");
  if (vibrate) {
    vibrate.checked = preferences.vibrateCriticalHigh;
    vibrate.addEventListener("change", () => { saveNotificationPreferences({ vibrateCriticalHigh: vibrate.checked }); });
  }
  setStatus(Notification.permission === "granted" ? "Enabled · new alerts will notify" : "Not enabled");
  button.addEventListener("click", () => { requestBrowserNotifications(); });
}

export async function notifyUnreadAlerts() {
  if (!supported() || Notification.permission !== "granted" || !readNotificationPreferences().browserNotifications) return 0;
  try {
    const preferences = readNotificationPreferences();
    const seen = readSeen();
    const alerts = (await readAlerts()).filter((alert) => alert.status === "unread" && alert.status !== "archived" && !seen.has(alert.id));
    for (const alert of alerts.slice(-10)) {
      const notification = new Notification(alert.title, { body: alert.message, tag: alert.id, renotify: alert.priority === "critical" || alert.priority === "high" });
      notification.onclick = () => {
        window.focus();
        window.location.hash = alert.detailRoute?.split("#")[1] ?? "alerts";
        notification.close();
      };
      if (preferences.vibrateCriticalHigh && (alert.priority === "critical" || alert.priority === "high") && "vibrate" in navigator) navigator.vibrate([120, 60, 120]);
      seen.add(alert.id);
    }
    writeSeen(seen);
    return alerts.length;
  } catch {
    return 0;
  }
}
