// VibeTrace Service Worker
// Permet à l'app de tourner en arrière-plan

const CACHE_NAME = 'vibetrace-v1';
const ASSETS = [
  '/',
  '/index.html',
  'https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
];

// ── Installation : mise en cache des assets ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // On essaie de mettre en cache, mais on ignore les erreurs réseau
      return Promise.allSettled(ASSETS.map(url => cache.add(url).catch(() => {})));
    }).then(() => self.skipWaiting())
  );
});

// ── Activation : nettoyage des anciens caches ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch : cache-first pour les assets, network-first pour le reste ──
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Ne pas intercepter les requêtes API météo ou Nominatim
  if (url.hostname.includes('openweathermap') ||
      url.hostname.includes('nominatim') ||
      url.hostname.includes('youtube') ||
      url.hostname.includes('ytimg')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        // Mettre en cache les nouvelles ressources statiques
        if (response.ok && e.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => cached || new Response('Hors ligne', {status: 503}));
    })
  );
});

// ── Message depuis la page principale ──
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

// ── Background Sync (pour relancer la détection GPS) ──
self.addEventListener('sync', e => {
  if (e.tag === 'gps-check') {
    // Notifier la page active de relancer le GPS
    e.waitUntil(
      self.clients.matchAll({type: 'window'}).then(clients => {
        clients.forEach(client => client.postMessage({type: 'gps-resync'}));
      })
    );
  }
});

// ── Push notifications (optionnel, pour changement de zone) ──
self.addEventListener('push', e => {
  const data = e.data?.json() || {};
  e.waitUntil(
    self.registration.showNotification(data.title || 'VibeTrace', {
      body: data.body || '🎵 Changement de zone',
      icon: data.icon || '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'zone-change',
      renotify: true,
    })
  );
});
