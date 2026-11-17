self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Keep network requests pass-through so API/SSE and updates never serve stale responses.
self.addEventListener('fetch', () => {});
