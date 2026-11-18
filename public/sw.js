// Simple offline cache for the app shell. API and Supabase calls always go to the network.
const CACHE = "gympath-v2";
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/manifest.webmanifest", "/icon.svg"]))); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api/") || u.pathname.startsWith("/videos/") || e.request.headers.has("range")) return;
  const save = (r) => { if (r.ok && r.status === 200) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {}); } return r; };
  // Built files have a content hash in their name, so a cached copy is always right — open instantly from cache.
  if (u.pathname.startsWith("/assets/")) { e.respondWith(caches.match(e.request).then((m) => m || fetch(e.request).then(save))); return; }
  e.respondWith(fetch(e.request).then(save).catch(() => caches.match(e.request).then((m) => m || caches.match("/"))));
});
