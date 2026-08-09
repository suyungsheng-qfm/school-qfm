const CACHE_NAME = "class-hub-v4";
const APP_FILES = ["./", "./login.html", "./index.html", "./admin.html", "./styles.css", "./app-overrides.css", "./app.js", "./admin.js", "./login.js", "./firebase.js", "./firebase-config.js", "./manifest.webmanifest", "./assets/11508.jpeg"];
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES))));
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("class-hub-") && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
self.addEventListener("fetch", (event) => { if (event.request.method !== "GET") return; event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request))); });
