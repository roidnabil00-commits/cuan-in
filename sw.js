// Simpan sebagai sw.js
const CACHE_NAME = 'cuan-in-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/login.html',
  '/app.js',
  '/db-config.js',
  '/manifest.json',
  '/qris.jpg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});