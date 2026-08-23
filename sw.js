// UPInfradesk service worker.
//
// IMPORTANT: bump CACHE_NAME on every deploy that changes any cached file.
// Without it, installed phones keep serving an old shell (spec §7).
const CACHE_NAME = "upinfradesk-v5";

// Content files are listed by the app itself; see CONTENT_FILES below.
const SHELL_FILES = [
  "./",
  "./index.html",
  "./links.json",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];

// Per-category content files. Kept in sync with links.json "categories[].file".
const CONTENT_FILES = [
  "./data/land-gis.json",
  "./data/investor.json",
  "./data/policy.json",
  "./data/central.json",
  "./data/reference.json",
  "./data/investup.json",
  "./data/contacts.json"
];

const PRECACHE = SHELL_FILES.concat(CONTENT_FILES);

function isDataRequest(url) {
  return url.pathname.endsWith("/links.json") || /\/data\/[^/]+\.json$/.test(url.pathname);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // addAll() rejects the whole install if any single file fails, which would
      // leave the old worker in charge indefinitely. Cache each file
      // independently so one bad entry cannot block the update.
      Promise.all(
        PRECACHE.map((file) =>
          cache.add(new Request(file, { cache: "reload" })).catch(() => {})
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never proxy third-party destinations

  // The page shell: network-first.
  //
  // This was previously cache-first, which meant a returning visitor kept
  // getting the previously cached HTML even after a deploy -- and an old shell
  // paired with newer data files fails to render at all. Going to the network
  // first means an online visitor always gets the current page, while an
  // offline one still falls back to the cached copy.
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches
            .open(CACHE_NAME)
            .then((c) => c.match(req).then((hit) => hit || c.match("./index.html")))
            .then(
              (hit) =>
                hit ||
                new Response(
                  "<!doctype html><meta charset=utf-8><title>Offline</title>" +
                    "<p style=\"font:16px system-ui;padding:24px\">UPInfradesk is offline and no cached copy is available yet. " +
                    "Reconnect and reload once to install it for offline use.",
                  { headers: { "Content-Type": "text/html; charset=utf-8" } }
                )
            )
        )
    );
    return;
  }

  // Content JSON: serve cached immediately, refresh in the background.
  if (isDataRequest(url)) {
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

  // Static assets: cache-first, but scoped to the CURRENT cache only. An
  // unscoped caches.match() can return an entry from a cache that is still
  // pending deletion, which is how stale assets survive a version bump.
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
            return res;
          })
      )
    )
  );
});
