const CACHE_NAME = 'cuan-in-pos-v2'; // Ganti versi kalau ada update besar
const urlsToCache = [
  '/',
  '/index.html',
  '/login.html',
  '/admin.html',
  '/laporan.html',
  '/dapur.html',
  '/app.js',
  '/db-config.js',
  '/style.css',
  '/manifest.json',
  '/qris.jpg',
  '/icon.png', // <--- TAMBAHKAN INI
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js' 
];

// 1. INSTALL: Download aset awal
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting(); // Paksa SW baru untuk segera aktif
});

// 2. ACTIVATE: Hapus cache lama (Penting buat update!)
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('Hapus cache lama:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim(); // Ambil alih kontrol halaman segera
});

// 3. FETCH: Strategi "Network First" (Internet Dulu, Baru Cache)
self.addEventListener('fetch', event => {
  // Abaikan request ke Supabase (biar data selalu realtime & tidak di-cache)
  if (event.request.url.includes('supabase.co')) {
    return; 
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Kalau ada internet, ambil file baru & simpan ke cache (update cache)
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME)
          .then(cache => {
            cache.put(event.request, responseToCache);
          });
        return response;
      })
      .catch(() => {
        // Kalau internet mati (OFFLINE), baru ambil dari cache
        return caches.match(event.request);
      })
  );
});