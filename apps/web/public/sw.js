/* Service worker for the mobile app (/m). Keeps the app shell usable offline.
 *  - /m pages: network first, falling back to the cached shell.
 *  - /api/*: network first (GETs fall back to cache; POSTs such as /api/sync are never cached).
 *  - /_next/static/*, icons and the manifest: cache first (file names are content-hashed).
 * Everything else (the desktop site) is left to the network.
 */
const VERSION = "rounds-m-v1";
const SHELL = ["/m", "/manifest.webmanifest", "/icons/icon.svg", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(request);
    if (res.ok && request.method === "GET") cache.put(fallbackUrl ?? request, res.clone());
    return res;
  } catch (err) {
    const hit = (await cache.match(request, { ignoreSearch: true })) ?? (fallbackUrl && (await cache.match(fallbackUrl)));
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) {
    if (request.method === "GET") event.respondWith(networkFirst(request));
    return;
  }
  if (request.method !== "GET") return;
  if (url.pathname === "/m" || url.pathname.startsWith("/m/")) {
    event.respondWith(networkFirst(request, request.mode === "navigate" ? "/m" : undefined));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest") {
    event.respondWith(cacheFirst(request));
  }
});
