/* ============================================================
   Muslim College AI Study Agent — Service Worker
   Caches the app shell so the app installs & opens offline.
   ============================================================ */

const CACHE = 'mc-study-agent-v6';

const ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.webmanifest',
  './css/base.css',
  './css/components.css',
  './css/login.css',
  './css/layout.css',
  './css/chat.css',
  './css/pages.css',
  './css/responsive.css',
  './js/config.js',
  './js/state.js',
  './js/utils.js',
  './js/router.js',
  './js/api.js',
  './js/chat.js',
  './js/pdf.js',
  './js/pwa.js',
  './js/auth.js',
  './js/ui.js',
  './js/admin.js',
  './js/debug.js',
  './js/pages/login.js',
  './js/pages/agent.js',
  './js/pages/tools.js',
  './js/pages/admin.js',
  './js/pages/debug.js',
  './js/pages/about.js',
  './js/pages/settings.js',
  './assets/logo.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable-512.png',
  './assets/CollegeMainBuildingImage.png',
];

// Install: pre-cache the app shell.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches and take control.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

// Fetch: cache-first for static assets, network-first fallback to cache,
// and a final fallback to the cached app shell.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Development bypass: on Live Server (localhost) always hit the network,
  // so edits appear instantly and never get hidden by the cache.
  const url = new URL(req.url);
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    event.respondWith(fetch(req));
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req)
        .then((res) => {
          // Cache successful same-origin responses for offline use.
          if (res && res.ok && req.url.startsWith(self.location.origin)) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});