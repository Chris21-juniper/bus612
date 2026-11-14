# Bus 612 – Schulbus live

Web-App fürs iPhone: Wo ist der Bus 612, wann kommt er, wann losgehen?

- **Zur Schule**: Riken AG, Neustadt → Rothrist, Sennhof-Dörfli, mit Anfahrt ab Glashütten
- **Nach Hause**: Sennhof-Dörfli → Riken AG, Neustadt (manche Mittagsbusse fahren erst ab
  Rothrist Bahnhof; die App sagt dann, wann man zu Fuss losgehen muss)
- Grosse Minutenanzeige, „Losgehen in … Min.“ / „Jetzt losgehen!“, Verspätung, „zu Hause ca.“
- Karte (swisstopo) mit Bus auf der Strasse, Haltestellenliste
- Richtung automatisch: vor 11 Uhr „Zur Schule“, danach „Nach Hause“

## Woher kommen die Daten?

transport.opendata.ch (gratis, ohne Schlüssel, mit Echtzeit-Verspätungen). Echte GPS-Positionen gibt es nicht offen: Die Position wird aus
Fahrplan und Verspätung an den Haltestellen geschätzt. Steht „laut Fahrplan“, liegen
(noch) keine Echtzeitdaten vor.

Gehzeit, Puffer und Schulweg stehen oben in `app.js` (`CFG`).

## Aufs iPhone

Die Seite muss über **https** erreichbar sein (z.B. GitHub Pages). Dann in Safari öffnen →
Teilen → **Zum Home-Bildschirm**. Die App startet danach im Vollbild mit eigenem Symbol.

## Lokal ausprobieren

```bash
python3 -m http.server 8612
```

Dann http://localhost:8612 öffnen. Mit `?zeit=2026-11-16T06:58` tut die App so, als wäre
es zu dieser Zeit (praktisch am Wochenende).

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html`, `style.css` | Oberfläche |
| `app.js` | Einstellungen, Abfrage, Anzeige, Karte |
| `logik.js` | Fahrten auswählen, Verspätung, Busposition (ohne Oberfläche) |
| `strecke.js` | Strassenverlauf zwischen den Haltestellen (erzeugt) |
| `tools/strecke_bauen.py` | erzeugt `strecke.js` neu, falls die Linie anders fährt |
| `sw.js`, `manifest.webmanifest`, `icons/` | Home-Bildschirm-App, offline startbar |
| `lib/` | Leaflet 1.9.4 (Karte) |
