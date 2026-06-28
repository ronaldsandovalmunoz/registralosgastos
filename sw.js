// Service Worker — Registra los Gastos
// Actualiza CACHE_VERSION en cada deploy para forzar refresco en todos los clientes
const CACHE_VERSION = 'gastos-v3';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_VERSION).then(c => c.addAll(['/', '/index.html']))
  );
  self.skipWaiting(); // activa el nuevo SW de inmediato
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    )
  );
  self.clients.claim(); // toma control de todos los tabs abiertos
});

self.addEventListener('fetch', e => {
  // Solo interceptar navegación (HTML principal)
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          const clone = r.clone();
          caches.open(CACHE_VERSION).then(c => c.put(e.request, clone));
          return r;
        })
        .catch(() => caches.match(e.request))
    );
  }
});
