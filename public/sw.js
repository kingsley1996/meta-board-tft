// Passthrough service worker: exists so the app is installable. No caching —
// stale comp data would be worse than an extra request.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
