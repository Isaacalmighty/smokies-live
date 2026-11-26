/* Smokies Live service worker: makes the app installable and opens the shell instantly.
   Live data, map tile packs and accounts always go to the network. */
const V = 'smokies-v1';
const SHELL = ['./', 'manifest.webmanifest', 'icons/icon-192.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())));
const put = (req, res) => { if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(V).then(c => c.put(req, copy)); } return res; };
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET' || r.headers.has('range')) return;
  const u = new URL(r.url);
  if (r.mode === 'navigate') { // fresh page when online, cached page when not
    e.respondWith(fetch(r).then(res => put('./', res)).catch(() => caches.match('./')));
    return;
  }
  if (/^(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(u.hostname)) { // pinned library versions and fonts never change
    e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(res => put(r, res))));
    return;
  }
  if (u.origin === self.location.origin && /\/(data\/glyphs\/|data\/search\.json|icons\/)/.test(u.pathname)) { // small app files: show cached, refresh behind
    e.respondWith(caches.match(r).then(hit => { const net = fetch(r).then(res => put(r, res)).catch(() => hit); return hit || net; }));
  }
});
