const CACHE_NAME = "class-hub-v1";
const APP_FILES = ["./", "./index.html", "./admin.html", "./styles.css", "./app.js", "./admin.js", "./firebase.js", "./firebase-config.js", "./manifest.webmanifest", "./icon.svg"];
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES))));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => { if (event.request.method !== "GET") return; event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request))); });
