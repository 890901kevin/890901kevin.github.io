const CACHE = 'budget-pwa-v2';
const CACHE_PREFIX = 'budget-pwa-';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const INDEX_URL = new URL('./index.html', self.registration.scope).href;
const STATIC_URLS = new Set(ASSETS.slice(2).map(path => new URL(path, self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    // Revalidate with the server instead of reusing the browser's HTTP cache.
    const response = await fetch(request, { cache: 'no-cache' });
    if (response.ok) {
      // A cache write failure must not hide a successful network response.
      try {
        await cache.put(request, response.clone());
        if (request.mode === 'navigate') await cache.put(INDEX_URL, response.clone());
      } catch (error) {
        console.warn('Unable to cache the latest HTML', error);
      }
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request) || (request.mode === 'navigate' && await cache.match(INDEX_URL));
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    try { await cache.put(request, response.clone()); } catch (error) {
      console.warn('Unable to cache a static asset', error);
    }
  }
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate' || request.destination === 'document' || url.pathname.endsWith('.html')) {
    event.respondWith(networkFirst(request));
  } else if (STATIC_URLS.has(url.href)) {
    event.respondWith(cacheFirst(request));
  }
});
