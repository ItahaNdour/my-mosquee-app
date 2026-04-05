// /sw.js
const CACHE_NAME = "mymosque-cache-v1";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./assets/adhan.mp3",
];

function normalizeRequestToCacheKey(request) {
  const url = new URL(request.url);
  // Ignore query strings like ?v=7700 so cache works with versioned URLs
  return url.origin + url.pathname;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const cacheKey = normalizeRequestToCacheKey(req);

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(cacheKey);
      if (cached) return cached;

      try {
        const res = await fetch(req);
        if (res && res.ok) {
          cache.put(cacheKey, res.clone()).catch(() => {});
        }
        return res;
      } catch {
        // If offline and no cache
        return cached || new Response("Offline", { status: 503, statusText: "Offline" });
      }
    })
  );
});
