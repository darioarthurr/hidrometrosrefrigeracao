const CACHE_NAME = 'hidrometros-v2';
const urlsToCache = [
  '/hidrometrosrefrigeracao/',
  '/hidrometrosrefrigeracao/assets/style.css',
  '/hidrometrosrefrigeracao/assets/app.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) return response;
        return fetch(event.request);
      })
  );
});
