// App-Huelle offline verfuegbar; Busdaten und Kartenkacheln immer frisch aus dem Netz.
const CACHE = "schulbus-v1";
const HUELLE = ["./", "index.html", "style.css", "app.js", "logik.js", "strecke.js",
                "lib/leaflet.js", "lib/leaflet.css", "manifest.webmanifest",
                "icons/icon-180.png", "icons/icon-192.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(HUELLE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;           // API und Karte: normal ueber das Netz
  // zuerst Netz (damit Updates ankommen), sonst Cache
  e.respondWith(fetch(e.request).then(r => {
    const kopie = r.clone();
    caches.open(CACHE).then(c => c.put(e.request, kopie));
    return r;
  }).catch(() => caches.match(e.request)));
});
