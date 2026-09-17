// Previous cache: yieldalpha-shell-v3. v4 invalidates it after adding the
// research workflow module while keeping the migration history explicit.
const CACHE_NAME = "yieldalpha-shell-v4";
const APP_SHELL = ["./", "./index.html", "./styles.css", "./app.js", "./analysis.js", "./data-sources.js", "./public-data.js", "./dashboard.js", "./notifications.js", "./privacy.js", "./research-workflows.js", "./manifest.webmanifest", "./icons/icon.svg", "./icons/icon-maskable.svg", "./lib/index.js"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  if (event.request.mode === "navigate") {
    const refresh = fetch(event.request).then((response) => {
      if (response.ok) return caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", response.clone())).then(() => response);
      throw new Error(`Navigation request failed: ${response.status}`);
    });
    event.respondWith(refresh.catch(() => caches.match("./index.html")));
    return;
  }
  event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
    const cached = await cache.match(event.request);
    const refresh = fetch(event.request).then((response) => {
      if (!response.ok) throw new Error(`Asset request failed: ${response.status}`);
      return cache.put(event.request, response.clone()).then(() => response);
    });
    if (cached) {
      // Serve immediately on mobile connections and refresh the cache for the
      // next visit. The browser owns the request lifetime via waitUntil.
      event.waitUntil(refresh.catch(() => undefined));
      return cached;
    }
    return refresh.catch(() => cached ?? Response.error());
  }));
});
