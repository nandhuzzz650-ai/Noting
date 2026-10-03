const CACHE_NAME = 'notes-app-v2'; // bumped so existing installs pick up the new index.html + PDF export

const ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

// Third-party scripts the app needs. Cached so the app (and PDF export) work offline.
const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
];
const CDN_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ASSETS);
    // CDN files are best-effort: a failure here must not block installing the app.
    await Promise.allSettled(CDN_ASSETS.map((url) => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Stale-while-revalidate for the app shell and CDN scripts: serve the cached copy
// instantly (works offline) and refresh it in the background for next time.
// Anything else (e.g. Supabase API calls) goes straight to the network.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isCdn = CDN_HOSTS.includes(url.hostname);
  if (!sameOrigin && !isCdn) return;

  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: sameOrigin });

    const network = fetch(req).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
      }
      return res;
    });

    if (cached) {
      network.catch(() => {}); // background refresh; ignore offline errors
      return cached;
    }
    try {
      return await network;
    } catch (err) {
      if (req.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
