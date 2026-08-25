/* structur-md — service worker: offline shell + cache-first for static assets */
const CACHE = "structur-md-v3";
const SHELL = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png"];
const CDN_RE = /^https:\/\/[^/]+\.supabase\.co\//;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Only handle GET
  if (req.method !== "GET") return;
  // API & Supabase storage: network-first
  if (url.pathname.startsWith("/api/") || CDN_RE.test(req.url)) {
    e.respondWith(
      fetch(req)
        .then((r) => {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return r;
        })
        .catch(() => caches.match(req))
    );
    return;
  }
  // Next static & public assets: cache-first
  if (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/icon-") || url.pathname === "/manifest.json") {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { caches.open(CACHE).then((c) => c.put(req, r.clone())); return r; })));
    return;
  }
  // Navigation: network-first, fallback to shell
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((r) => {
        caches.open(CACHE).then((c) => c.put(req, r.clone()));
        return r;
      }).catch(() => caches.match("/") || caches.match(req))
    );
  }
});
