/*
 * Better-IGRS service worker (hand-rolled, no dependencies).
 *
 * Strategy table (the whole spec):
 * - Navigations (HTML): network-first, fall back to last-good cached HTML of
 *   the same path, then to the cached /404.html SPA shell.
 * - Hashed immutable assets (/assets/*.{js,css,webp,png,svg,woff2} with a
 *   content-hash filename): cache-first.
 * - Unhashed mutable assets (rating/descriptor icons) and daily-refreshed
 *   data (/assets/data/json/*, /assets/i18n/*): stale-while-revalidate.
 * - /proxy/steam/*, any cross-origin request, and non-GET requests: bypassed
 *   entirely so the Steam Checker keeps its own retry/error UX.
 *
 * Kill switch: set VERSION to 'off' and deploy — the activate handler then
 * unregisters itself and deletes every cache on next visit.
 */
const VERSION = 'v1';
const SHELL_CACHE = `igrs-shell-${VERSION}`;
const ASSET_CACHE = `igrs-assets-${VERSION}`;
const DATA_CACHE = `igrs-data-${VERSION}`;
// Mutable (unhashed) assets get their own cache so the LRU trim below can
// never evict immutable hashed chunks cached in ASSET_CACHE.
const MUTABLE_CACHE = `igrs-mutable-${VERSION}`;
const CURRENT_CACHES = [SHELL_CACHE, ASSET_CACHE, DATA_CACHE, MUTABLE_CACHE];
// FIFO caps for stale-while-revalidate caches (mirrors steam-api discipline):
// data/i18n stay tight; the finite image set gets headroom to stop churn.
const SWR_MAX_ENTRIES = 8;
const MUTABLE_MAX_ENTRIES = 64;
// Vite emits `<name>-<8-char-hash>.<ext>` for immutable chunks.
const HASHED_ASSET_RE = /^\/assets\/.+-[A-Za-z0-9_-]{8}\.(js|css|webp|png|svg|woff2?)$/;
const MUTABLE_ASSET_RE = /^\/assets\/.+\.(js|css|webp|png|svg|woff2?)$/;
// SPA shell served at unknown paths; precached so first-visit-deep-link
// navigations still boot offline.
const SHELL_URL = new URL('404.html', self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache => cache.add(SHELL_URL)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    if (VERSION === 'off') {
      const names = await caches.keys();
      await Promise.all(names.filter(name => name.startsWith('igrs-')).map(name => caches.delete(name)));
      await self.registration.unregister();
      return;
    }
    const names = await caches.keys();
    await Promise.all(
      names.filter(name => !CURRENT_CACHES.includes(name)).map(name => caches.delete(name))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Steam proxy calls etc.
  if (url.pathname.startsWith('/proxy/')) return; // same-origin steam proxy stays online-only

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (url.pathname.startsWith('/assets/data/json/') || url.pathname.startsWith('/assets/i18n/')) {
    event.respondWith(staleWhileRevalidate(event, request, DATA_CACHE, SWR_MAX_ENTRIES));
    return;
  }

  if (HASHED_ASSET_RE.test(url.pathname)) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  if (MUTABLE_ASSET_RE.test(url.pathname)) {
    // Unhashed mutable assets (rating/descriptor icons) must not freeze
    // forever, but the set is finite (~dozens) — a loose cap avoids churn.
    event.respondWith(staleWhileRevalidate(event, request, MUTABLE_CACHE, MUTABLE_MAX_ENTRIES));
  }
  // Everything else: default network behavior.
});

async function handleNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const samePath = await caches.match(request);
    if (samePath) return samePath;
    const shell = await caches.match(SHELL_URL);
    if (shell) return shell;
    throw error;
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(event, request, cacheName, maxEntries) {
  const cached = await caches.match(request);
  const refresh = (async () => {
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(cacheName);
        await cache.put(request, response.clone());
        if (maxEntries) await trimFifo(cache, maxEntries);
      }
    } catch {
      // Offline or transient failure: the cached copy (if any) stays authoritative.
    }
  })();
  if (event && typeof event.waitUntil === 'function') event.waitUntil(refresh);
  if (cached) return cached;
  await refresh;
  const response = await caches.match(request);
  if (response) return response;
  throw new Error(`SWR fetch failed and no cache entry: ${request.url}`);
}

async function trimFifo(cache, maxEntries) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - maxEntries; i += 1) {
    await cache.delete(keys[i]);
  }
}
