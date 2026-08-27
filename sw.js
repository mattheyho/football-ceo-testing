const CACHE_NAME = "football-ceo-v0.23.0-pwa-1";

// Everything required to boot the current Football CEO build offline.
// These paths are relative so they work correctly from the GitHub Pages
// /football-ceo-testing/ project path as well as local/test hosting.
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",

  // Core game runtime
  "./database.js",
  "./world-leagues.js",
  "./world-players.js",
  "./championship-simulation.js",
  "./state.js",
  "./finance.js",
  "./stadiums.js",
  "./stakeholders.js",
  "./staff.js",
  "./commercial.js",
  "./transfers.js",
  "./simulation.js",
  "./ui.js",
  "./game.js",

  // App icons
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-512-maskable.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigation is network-first so an updated deployment is picked up quickly,
  // with the installed app shell available as an offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put("./index.html", copy));
          }
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Runtime code/data is network-first when online. This prevents a newly
  // deployed database or game script from booting against an older cached file.
  // The app-shell cache remains the offline fallback; ignoreSearch lets the
  // versioned ?v= build URLs fall back to their unversioned cached equivalents.
  const isRuntimeAsset = /\.(?:js|css|json)$/.test(url.pathname);
  if (isRuntimeAsset) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then(hit => hit || caches.match(request,{ignoreSearch:true})))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request))
  );
});
