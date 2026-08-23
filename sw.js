// UPInfradesk service worker — offline shell + stale-while-revalidate for links.json.
//
// IMPORTANT: bump CACHE_NAME on every deploy that changes any cached file.
// This is the single most common PWA failure per the build spec (§7) —
// without a version bump, installed phones serve a stale shell forever.
const CACHE_NAME = "upinfradesk-v4";

const SHELL_FILES = [
  "./",
  "./index.html",
  "./links.json",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never cache/proxy third-party destinations

  // links.json: stale-while-revalidate — serve cached instantly, refresh in background.
  if (url.pathname.endsWith("/links.json")) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(req).then((cached) => {
          const network = fetch(req)
            .then((res) => {
              if (res && res.ok) cache.put(req, res.clone());
              return res;
            })
            .catch(() => cached);
          return cached || network;
        })
      )
    );
    return;
  }

  // Everything else in the shell: cache-first, falling back to network.
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});
