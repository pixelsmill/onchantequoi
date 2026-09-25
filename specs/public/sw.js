// Service worker : app hors-ligne (coquille) + réception des audios partagés depuis WhatsApp (Android)
const SHELL = 'chorale-shell-v1';
const FILES = ['/', '/index.html', '/style.css', '/app.js', '/config.js', '/backend-firebase.js', '/backend-demo.js', '/manifest.webmanifest', '/icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('chorale-shell-') && k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Partage depuis WhatsApp : on garde les fichiers, puis on ouvre l'app qui les enverra
  if (e.request.method === 'POST' && url.origin === location.origin && url.pathname === '/share') {
    e.respondWith((async () => {
      const form = await e.request.formData();
      const files = form.getAll('audio').filter((f) => f && f.size);
      const cache = await caches.open('shared');
      let i = 0;
      for (const f of files) {
        await cache.put(`/shared/${Date.now()}-${i++}`, new Response(f, {
          headers: { 'content-type': f.type || 'application/octet-stream', 'x-name': encodeURIComponent(f.name || 'audio') },
        }));
      }
      return Response.redirect('/?partage=1', 303);
    })());
    return;
  }

  // Coquille de l'app : réseau d'abord, cache si hors-ligne
  if (e.request.method === 'GET' && url.origin === location.origin) {
    e.respondWith(fetch(e.request).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(SHELL).then((c) => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('/index.html'))));
  }
});
