// App-Huelle offline verfuegbar; Busdaten und Kartenkacheln immer frisch aus dem Netz.
const CACHE = "schulbus-v5";
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
  // Sofort aus dem Cache antworten (schneller Start auch bei schlechtem Netz) und im
  // Hintergrund die neue Version holen: Updates sind beim naechsten Oeffnen da.
  // Nur gute Antworten (200) speichern, damit ein Fehler nie eine gute Datei ersetzt.
  const netz = fetch(e.request).then(r => {
    if (r.ok) { const kopie = r.clone(); caches.open(CACHE).then(c => c.put(e.request, kopie)); }
    return r;
  });
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(alt => {
    if (alt) { e.waitUntil(netz.catch(() => {})); return alt; }
    return netz;
  }));
});
