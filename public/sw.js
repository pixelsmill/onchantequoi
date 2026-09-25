// Service worker de l'app : le service worker Angular (hors-ligne, mises à jour)
// + réception des audios partagés depuis WhatsApp sur Android (share_target du manifeste).

// Doit être déclaré AVANT le service worker Angular pour passer en premier.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || url.origin !== self.location.origin || url.pathname !== '/share') {
    return;
  }
  event.stopImmediatePropagation();
  event.respondWith(
    (async () => {
      // On range les fichiers, puis on ouvre l'app qui les enverra (UploadService.takeShared).
      // Quoi qu'il arrive, on ouvre l'app : jamais de page d'erreur réseau.
      try {
        const form = await event.request.formData();
        const files = form.getAll('audio').filter((f) => f && typeof f !== 'string' && f.size);
        const cache = await caches.open('shared');
        let i = 0;
        for (const f of files) {
          await cache.put(
            `/shared/${Date.now()}-${i++}`,
            new Response(f, {
              headers: {
                'content-type': f.type || 'application/octet-stream',
                'x-name': encodeURIComponent(f.name || 'audio'),
              },
            }),
          );
        }
        return Response.redirect('/a-classer?partage=1', 303);
      } catch (e) {
        console.warn('partage', e);
        return Response.redirect('/a-classer?partage=echec', 303);
      }
    })(),
  );
});

importScripts('./ngsw-worker.js');
