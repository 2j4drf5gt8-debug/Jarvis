// App-Shell offline verfügbar machen; Daten (Supabase, Wetter) nie aus dem Cache.
const V = 'jarvis-v1';
const SHELL = ['./', 'index.html', 'css/jarvis.css', 'css/app.css', 'js/land.js', 'js/scene.js', 'js/main.js', 'js/data.js',
  'js/render.js', 'js/voice.js', 'js/config.js', 'js/core/derive.js', 'js/core/geo.js', 'js/core/view.js', 'assets/cave.jpg',
  'icons/icon-192.png', 'manifest.webmanifest'];
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (u.hostname.endsWith('supabase.co') || u.hostname.includes('open-meteo')) return;
  const sameOrCdn = u.origin === location.origin || /jsdelivr|googleapis|gstatic/.test(u.hostname);
  if (!sameOrCdn) return;
  // Netz zuerst (damit Updates sofort ankommen), sonst Cache
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(V).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
