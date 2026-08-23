const CACHE_NAME = "class-hub-v73";
const APP_FILES = ["./", "./login.html", "./index.html", "./admin.html", "./lottery-draw.html", "./styles.css", "./app-overrides.css?v=73", "./login-overrides.css", "./admin-overrides.css", "./admin-pages.css", "./school-import.css", "./admin-calendar-view.css", "./admin-account-nav.css", "./admin-documents.css?v=73", "./admin-document-print.css?v=73", "./admin-document-editor.css?v=73", "./admin-document-layout.css?v=73", "./admin-document-source.css?v=73", "./admin-document-widths.css?v=73", "./admin-document-headings.css?v=73", "./admin-document-exam.css?v=73", "./admin-document-subjects.css?v=73", "./calendar-overrides.css", "./calendar-nav.css", "./school-calendar.css", "./lottery-draw.css", "./app.js?v=73", "./admin.js?v=73", "./lottery-draw.js", "./login.js", "./firebase.js", "./firebase-config.js", "./manifest.webmanifest", "./assets/11508.jpeg"];

self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)).then(() => self.skipWaiting())));
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("class-hub-") && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then((response) => { const copy=response.clone(); caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)); return response; }).catch(() => caches.match(event.request)));
});
