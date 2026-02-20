/**
 * sw.js — Service Worker
 *
 * IMPORTANT: When you update any file, bump CACHE_NAME version
 * (e.g. v1.0.1 → v1.0.2) so users get the fresh version.
 * Otherwise the old cached version will keep loading.
 */

const CACHE_NAME = 'iit-learn-v1.1.0';

const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './storage.js',
  './xpEngine.js',
  './src/ui/index.js',
  './src/ui/modals.js',
  './src/ui/graph.js',
  './src/ui/lectureCard.js',
  './src/ui/weekCard.js',
  './manifest.json',
  './icon-192.svg',
  './icon-512.svg'
];

/* ── Install: pre-cache all app files ── */
self.addEventListener('install', event => {
  console.log('[SW] Installing cache:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => {
        console.log('[SW] All files cached');
        return self.skipWaiting();
      })
      .catch(err => console.error('[SW] Cache install failed:', err))
  );
});

/* ── Activate: delete old caches ── */
self.addEventListener('activate', event => {
  console.log('[SW] Activating, clearing old caches');
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] Deleting old cache:', k);
          return caches.delete(k);
        })
      ))
      .then(() => self.clients.claim())
  );
});

/* ── Fetch: serve from cache, fall back to network ── */
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  // Skip cross-origin requests (Google Fonts etc — let them go to network)
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
    })
  );
});
