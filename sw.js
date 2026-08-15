// Minimal service worker — exists only to satisfy Chrome's PWA installability
// criteria (needed for the one-tap "Install App" button on Android).
// Deliberately does NOT cache anything: every request still goes straight to
// the network, every time. This avoids the "I updated the site but the app
// still shows the old version" problem a caching service worker can cause.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
