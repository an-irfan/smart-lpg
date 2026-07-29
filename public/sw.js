// Minimal service worker: enables "Add to Home Screen" / install prompts.
// Live sensor data always goes to the network (no caching of API/stream routes).
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Pass-through: just let requests hit the network as normal.
  event.respondWith(fetch(event.request));
});
