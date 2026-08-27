// Ledernator BodyScan — Service Worker
// Cached die App-Shell + das MediaPipe Pose-Modell beim ersten Start,
// damit die App danach auch ohne Internetverbindung funktioniert.

const CACHE_NAME = 'ledernator-bodyscan-v3';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

// Diese externen Dateien werden beim ersten Online-Start geladen und
// danach lokal aus dem Cache bedient (kein erneuter Internetzugriff nötig).
const MODEL_ASSETS = [
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs',
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(APP_SHELL);
      // Modell-Assets einzeln laden — falls eines fehlschlägt, App-Shell trotzdem cachen
      for (const url of MODEL_ASSETS) {
        try {
          const res = await fetch(url, { mode: 'cors' });
          if (res.ok) await cache.put(url, res);
        } catch (e) {
          console.warn('Konnte Modell-Asset nicht vorab laden (Internet nötig beim ersten Scan):', url);
        }
      }
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first für die App-Shell (index.html etc.): so kommen Updates sofort an,
// sobald Internet da ist. Nur wenn kein Netz verfügbar ist, wird der Cache genutzt
// (das sichert die Offline-Fähigkeit weiterhin ab).
self.addEventListener('fetch', (event) => {
  const isAppShell = APP_SHELL.some(path => event.request.url.endsWith(path.replace('./','')));
  if (isAppShell) {
    event.respondWith(
      fetch(event.request).then(res => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return res;
      }).catch(() => caches.match(event.request))
    );
    return;
  }
  // Modell-Dateien etc.: weiterhin cache-first (die ändern sich nicht).
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res && res.ok && event.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
