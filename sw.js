const CACHE_NAME = 'underworld-cache-v1';
const assetsToCache = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json',
    './assets/gem_icon.png'
    // Add paths to your most important weapon images here
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(assetsToCache);
        })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});