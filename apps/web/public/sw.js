const CACHE_NAME = 'autamedica-static-v2';
const STATIC_PATHS = new Set(['/manifest.json', '/favicon.ico']);
const STATIC_PREFIXES = ['/_astro/', '/images/', '/fonts/'];

// Never pre-cache a portal's root HTML: it may contain the current patient's data.
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.allSettled(keys
        .filter(key => key.startsWith('autamedica-') && key !== CACHE_NAME)
        .map(key => caches.delete(key)));
    } catch { /* Restricted storage must not keep the old worker in control. */ }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // Clinical APIs and portal HTML always use the network. They must never fall
  // back to an older patient's or another country's cached directory/credentials.
  if (request.method !== 'GET' || url.origin !== self.location.origin
      || request.headers.has('authorization')
      || url.pathname === '/api' || url.pathname.startsWith('/api/')) return;
  const isStatic = STATIC_PATHS.has(url.pathname)
    || STATIC_PREFIXES.some(prefix => url.pathname.startsWith(prefix));
  if (!isStatic) return;

  event.respondWith((async () => {
    let cache;
    try {
      cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
    } catch { cache = undefined; }
    const response = await fetch(request);
    const policy = response.headers.get('cache-control') ?? '';
    const type = response.headers.get('content-type') ?? '';
    if (cache && response.ok && !response.redirected && !/\b(private|no-store)\b/i.test(policy)
        && !type.includes('text/html')) {
      try { await cache.put(request, response.clone()); } catch { /* Cache is optional. */ }
    }
    return response;
  })());
});

