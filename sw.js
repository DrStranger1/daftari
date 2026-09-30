/* Offline support: keep the app working with no internet.
 * Strategy: try the network first (so updates show up straight away),
 * fall back to the saved copy when offline or the network is too slow.
 * Bump VERSION whenever you change app files. */
const VERSION = 'daftari-v3';
const FILES = ['./', 'index.html', 'app.js', 'styles.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];
const NETWORK_TIMEOUT_MS = 3000;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const network = fetch(e.request, { cache: 'no-cache' }).then(res => {
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    });
    const timeout = new Promise(resolve => setTimeout(resolve, NETWORK_TIMEOUT_MS));
    try {
      const res = await Promise.race([network, timeout]);
      if (res) return res;                       // network answered in time
    } catch (err) { /* offline */ }
    const hit = await cache.match(e.request, { ignoreSearch: true });
    return hit || network;                        // slow network and nothing saved: keep waiting
  })());
});
