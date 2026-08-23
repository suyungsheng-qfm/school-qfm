const CACHE_NAME = "class-hub-v75";
const APP_FILES = ["./", "./login.html", "./index.html", "./admin.html", "./lottery-draw.html", "./styles.css", "./app-overrides.css?v=75", "./login-overrides.css", "./admin-overrides.css", "./admin-pages.css", "./school-import.css", "./admin-calendar-view.css", "./admin-account-nav.css", "./admin-documents.css?v=75", "./admin-document-print.css?v=75", "./admin-document-editor.css?v=75", "./admin-document-layout.css?v=75", "./admin-document-source.css?v=75", "./admin-document-widths.css?v=75", "./admin-document-headings.css?v=75", "./admin-document-exam.css?v=75", "./admin-document-subjects.css?v=75", "./calendar-overrides.css", "./calendar-nav.css", "./school-calendar.css", "./lottery-draw.css", "./app.js?v=75", "./admin.js?v=75", "./lottery-draw.js", "./login.js", "./firebase.js", "./firebase-config.js", "./manifest.webmanifest", "./assets/11508.jpeg"];

self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)).then(() => self.skipWaiting())));
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("class-hub-") && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then((response) => { const copy=response.clone(); caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)); return response; }).catch(() => caches.match(event.request)));
});
