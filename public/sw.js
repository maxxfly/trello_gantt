/* Service worker minimal : hors-ligne par cache (stratégie réseau d'abord
 * pour la navigation, cache d'abord pour les ressources immuables).
 * Déployable dans un sous-dossier : tout est relatif à la racine de l'app. */

const CACHE = 'gantt-trello-v1';

// Ressources de la coquille (chemins relatifs à la portée du SW).
const SHELL = ['./', './index.html', './manifest.webmanifest', './favicon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Ne jamais intercepter les appels à l'API Trello (données toujours live).
  if (url.hostname.endsWith('trello.com') && url.pathname.startsWith('/1/')) return;

  if (req.mode === 'navigate') {
    // Navigation : réseau d'abord, repli sur la page en cache (hors-ligne).
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() =>
          caches.match('./index.html').then((r) => r || caches.match('./'))
        )
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Ressources statiques (assets hachés, icônes…) : cache d'abord.
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
