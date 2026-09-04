/**
 * RogueDay service worker.
 *
 * Strategy:
 * - Navigations: network-first with a cached app-shell fallback, so a new
 *   deploy is picked up when online but the game still opens offline.
 * - Everything else (hashed build assets, icons, manifest): cache-first.
 *
 * The worker never contacts anything but this app's own origin. It caches no
 * player data - saves live in localStorage and are never sent anywhere.
 */

const CACHE_VERSION = 'rogueday-v1';
const SHELL_URL = './index.html';

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) =>
        // Individual failures must not abort the whole install.
        Promise.all(
          PRECACHE.map((url) =>
            cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(SHELL_URL, copy));
          return response;
        })
        .catch(() =>
          caches
            .match(SHELL_URL)
            .then((cached) => cached ?? caches.match('./'))
            .then(
              (cached) =>
                cached ??
                new Response('<h1>RogueDay är offline och saknar cache.</h1>', {
                  headers: { 'Content-Type': 'text/html; charset=utf-8' },
                  status: 503,
                }),
            ),
        ),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached ?? Response.error());
    }),
  );
});
