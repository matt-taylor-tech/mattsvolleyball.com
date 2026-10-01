// Service worker: makes the site installable and keeps it usable offline.
//
// - Pages: network first, so a deploy shows up on the next load. A copy of
//   each page visited is kept for when there's no signal; pages never visited
//   fall back to /offline/.
// - /_assets/: cache first. Astro hashes these filenames, so a cached copy
//   can never be stale.
// - Everything else (the /api/ functions, calendar feeds, TeamLinkt, images)
//   goes straight to the network, untouched.
//
// Bump VERSION to drop every cache on the next visit.

const VERSION = 'v1';
const PAGES = `mv-pages-${VERSION}`;
const ASSETS = `mv-assets-${VERSION}`;
const OFFLINE_URL = '/offline/';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(PAGES).then((cache) => cache.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== PAGES && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirstPage(request) {
  const cache = await caches.open(PAGES);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request, { ignoreSearch: true })) || (await cache.match(OFFLINE_URL));
  }
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(ASSETS);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request));
  } else if (url.pathname.startsWith('/_assets/')) {
    event.respondWith(cacheFirstAsset(request));
  }
});
