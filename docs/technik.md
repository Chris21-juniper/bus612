# Bus 612 – Technik

Wie die App intern arbeitet. Für Bedienung und Einstellungen siehe [README](../README.md).

## Überblick

```
transport.opendata.ch ──► app.js: aktualisiere() ──► logik.js: fahrtenBauen()
   (connections-API)                                       │
                                                           ▼
                          app.js: zeichne()  ◄── jede Sekunde ── logik.js: position()
                                │                                     │
                                ├─ Countdown, Hinweise                └─ strecke.js (Strassenverlauf)
                                ├─ Bus-Auswahl
                                ├─ Karte (Leaflet + swisstopo)
                                └─ Haltestellenliste
```

- Eine statische Seite ohne Server und ohne Build. Alles läuft im Browser.
- `logik.js` enthält nur Rechenlogik ohne Zugriff auf die Seite und lässt sich auch in Node laden
  (`module.exports`). Im Browser liegt sie unter `window.Logik`.
- `app.js` holt die Daten, hält den Zustand und zeichnet die Oberfläche.

## Abfrage

Endpunkt: `https://transport.opendata.ch/v1/connections` (CORS erlaubt, kein Schlüssel).

Pro Aktualisierung gehen bis zu zwei Anfragen parallel raus:

| Anfrage | von → nach | ab Zeit | Zweck |
|---|---|---|---|
| kurz | Einstieg → Ausstieg | jetzt − 40 Min. | die eigentlichen Fahrten, auch schon abgefahrene, in denen man vielleicht sitzt |
| lang (nur „Zur Schule“) | Linienanfang Glashütten → Ausstieg | jetzt − 55 Min. | dieselben Fahrten ab Linienanfang, damit man den Bus schon **kommen** sieht |

Danach, nur wenn eine Fahrt nicht direkt ist (siehe [Umsteigen](#umsteigen)), eine dritte
Anfrage für den Anschlussbus zwischen Sennhof-Dörfli und dem Umsteigehalt (`limit=16`).
Scheitert sie, zeigt die App statt des Anschlussbusses den Fussweg.

Parameter: `direct=1`, `limit=8`. Jede Anfrage bricht nach 10 Sekunden ab (`AbortController`
in `holeJson`); sonst bliebe ein hängender Abruf im Funkloch ewig offen und die nächste
Abfrage würde nie geplant. Scheitert die lange Anfrage, läuft die App mit der kurzen
weiter (ohne Anfahrt). Scheitert die kurze, bleibt der letzte Stand stehen, unten erscheint
„Keine Verbindung“, und es wird nach 15 Sekunden neu versucht.

**Takt** (`planeNaechste`): 30 s, wenn die gewählte Fahrt in der nächsten Stunde abfährt und
nicht schon länger als 5 Minuten angekommen ist, sonst 5 Minuten. Ist die App im Hintergrund,
wird nicht abgefragt. Beim Zurückkehren wird sofort aktualisiert und die Richtung neu bestimmt.

Jede Abfrage bekommt eine laufende Nummer. Kommt eine Antwort an, nachdem schon eine neuere
gestartet wurde (z.B. nach einem Richtungswechsel), wird sie verworfen.

## Fahrten bauen (`fahrtenBauen`)

1. **Filtern** (`fahrtenDerLinie`): Nur Verbindungen mit `transfers === 0` und genau einem
   Abschnitt mit Fahrzeug der Linie `612`. Die API liefert trotz `direct=1` auch andere Linien
   (S23, 603) und Verbindungen mit Umsteigen.
2. **Doppelte entfernen** (`ohneDoppelte`): Dieselbe Fahrt (gleicher `journey.name`, gleiche
   Abfahrt) kommt teils zweimal, einmal mit und einmal ohne Echtzeit. Die mit Echtzeit gewinnt.
3. **Mit der langen Antwort verbinden**: Gesucht wird eine Fahrt mit gleichem Namen, deren
   Haltestellenliste den Einstieg mit derselben Abfahrtszeit enthält. Gefunden → die Fahrt hat
   die vollständige Haltestellenliste ab Linienanfang (`mitAnfahrt: true`). Hat die lange
   Fahrt an einer Haltestelle keine Verspätung, die kurze aber schon, wird die der kurzen
   übernommen (`mitEchtzeitAus`, Abgleich über Haltestellen-ID und Fahrplanzeit). Sonst
   zeigte die App „pünktlich“, obwohl nur die kurze Antwort Echtzeit enthielt.
4. **Haltestellen berechnen** (`haltestellen`), siehe unten. Einträge ohne Zeit oder ohne
   Koordinaten werden dabei verworfen.
5. **Einstieg und Ausstieg** suchen (`ei`, `ai` = Index in `stops`). Der Ausstieg wird von
   hinten gesucht, weil eine Haltestelle bei Schleifen zweimal vorkommen kann.

Ergebnis pro Fahrt:

```js
{
  key,                 // "061210@<Abfahrt am Einstieg in ms>", eindeutig für die Auswahl
  name, linie, ziel,
  stops: [{ id, name, lat, lon, anPlan, abPlan, an, ab, verspaetung }],
  ei, ai,              // Index von Einstieg und Ausstieg in stops
  echtzeit,            // true, wenn eine der verwendeten Haltestellen eine Verspätung gemeldet hat
  mitAnfahrt,          // true, wenn stops ab Linienanfang beginnt
  fussVor, fussNach,   // Minuten zu Fuss vor / nach dem Bus (meist 0)
}
```

Alle Zeiten sind Millisekunden seit 1970. Verwendet werden `arrivalTimestamp` und
`departureTimestamp` der API (Sekunden). Die ISO-Texte mit `+0100` liest Safari nicht zuverlässig.

## Verspätung

Die API meldet `delay` (Minuten) pro Haltestelle, oft aber nicht an allen. Regel:

- Haltestelle mit eigener Verspätung → diese.
- Sonst die zuletzt gemeldete Verspätung einer **früheren** Haltestelle (wird nach vorne weitergetragen).
- Vor der ersten Meldung → die erste gemeldete Verspätung der Fahrt.
- Keine Meldung auf der ganzen Fahrt → 0, Anzeige „laut Fahrplan“.

`an` / `ab` = Fahrplanzeit + Verspätung. Die Abfahrt liegt nie vor der Ankunft.
Fehlt die Ankunft (erste Haltestelle) oder die Abfahrt (letzte), wird die jeweils andere Zeit genommen.

## Fussweg-Fahrten

Einige Fahrten (z.B. Mittagsbusse nach Hause) beginnen nicht am gewünschten Einstieg. Die API
liefert dann eine Verbindung „ohne Umsteigen“, deren erster Abschnitt ein Fussweg ist
(Sennhof-Dörfli → Rothrist, Bahnhof, ca. 12 Min.). Erkennung:

```
fussVor  = (Abfahrt erste Bus-Haltestelle − Abfahrt der Verbindung) in Minuten
fussNach = (Ankunft der Verbindung − Ankunft letzte Bus-Haltestelle) in Minuten
```

Ist `fussVor > 0`, gilt die erste Haltestelle des Busses als Einstieg (entsprechend `fussNach`
für den Ausstieg). Die Anzeige rechnet den Fussweg in die Losgeh- und Ankunftszeiten ein.

## Umsteigen

Viele 612er fahren nicht bis Sennhof-Dörfli, sondern beginnen oder enden in Rothrist, Bahnhof
(z.B. Schule 06:17, 08:33, 12:21; Heim 12:35, 13:20). Zwischen Bahnhof und Dörfli fahren die
Busse 603/606 etwa alle 15 Minuten (4–5 Min. Fahrzeit).

- `istDirekt(f)`: weder `fussVor` noch `fussNach` → „direkt“.
- `umsteigeHalt(f)`: Halt, an dem der 612 beginnt (`seite: "vor"`) bzw. endet (`"nach"`).
- `anschlussBusse(daten, von, nach)`: direkte Busse jeder Linie zwischen den beiden Halten, ohne
  Fussweg-Abschnitte, Zeiten in ms inkl. Verspätung.
- `passenderAnschluss(f, busse, min, maxWarte)`:
  - `vor` (Heimweg): der **letzte** Bus, der spätestens `min` Minuten vor der 612-Abfahrt am
    Umsteigehalt ankommt.
  - `nach` (Schulweg): der **erste** Bus, der frühestens `min` Minuten nach der 612-Ankunft abfährt.
  - Wartezeit höchstens `maxWarte` Minuten, sonst `null` (dann wird der Fussweg angezeigt).

Einstellungen in `CFG.umsteigen`: `min` 2, `maxWarte` 30. Das Ergebnis steht in `f.anschluss`
(`linie`, `ab`, `an`, `abPlan`, `anPlan`, `seite`, `halt`, `warte`).

Anzeige: Etikett „direkt“ / „umsteigen“ / „mit Fussweg“, eine gestrichelte Zeile mit dem
Umsteigen und auf den Bus-Knöpfen „direkt“ bzw. „umsteigen“. Die Zeiten „ab … · an …“ gelten
für die ganze Reise ab/bis Dörfli. Beim Heimweg mit Anschluss zählt der Countdown zuerst bis zur
Abfahrt des Anschlussbusses, Losgehzeit = dessen Abfahrt − `schulweg`. Danach („Im Bus 603 …“)
zählt er bis zur Abfahrt des 612. Die Karte zeigt nur den 612.

## Busposition (`position`)

Für die aktuelle Zeit `t`:

| Lage | Ergebnis |
|---|---|
| `t` vor der Abfahrt an der ersten Haltestelle | `start`: an der ersten Haltestelle |
| `an ≤ t < ab` an Haltestelle i | `halt`: an Haltestelle i |
| `ab(i) ≤ t < an(i+1)` | `fahrt`: zwischen i und i+1, Anteil = verstrichene / gesamte Fahrzeit des Abschnitts |
| nach der Ankunft an der letzten | `ende`: an der letzten Haltestelle |

Bei `fahrt` wird der Punkt entlang des Strassenverlaufs verschoben (`punktAufLinie`): Die Länge
der Teilstrecke wird aus den Linienpunkten berechnet und der Anteil auf diese Länge umgelegt.
Die Geschwindigkeit ist innerhalb eines Abschnitts also gleichmässig.

**Strassenverlauf:** `strecke.js` definiert `STRECKE` mit einem Eintrag pro Teilstück
`"<von-ID>><nach-ID>"` → Liste von `[lat, lon]`. Fehlt ein Teilstück, wird eine gerade Linie
zwischen den Haltestellen verwendet (`teilstueck`).

## Auswahl und Anzeige

- **Auswahl** (`auswahl`): bis zu 4 Fahrten, die am Ausstieg noch nicht angekommen sind.
- **Vorgabe** (`vorgabe`): die erste Fahrt, die am Einstieg noch nicht abgefahren ist. Hat das
  Kind eine Fahrt angetippt, bleibt diese gewählt (`zustand.gewaehlt`), solange sie in der Auswahl ist.
- `zeichne()` läuft jede Sekunde und rechnet Countdown und Position aus den gespeicherten
  Fahrten neu. Die Daten selbst kommen nur im Abfragetakt.
- Die Bus-Knöpfe werden nur neu gebaut, wenn sich ihr Inhalt ändert. Sonst würde ein Antippen
  verloren gehen, weil der Knopf zwischen Berühren und Loslassen ersetzt wird.

**Losgeh-Regeln** (Zur Schule), mit `e.ab` = Abfahrt am Einstieg inkl. Verspätung:

```
los   = e.ab − (gehzeit + puffer + fussVor)     vorher:  "Losgehen in X Min."
knapp = e.ab − (gehzeit + fussVor)              los…knapp: "Jetzt losgehen!"
                                                ab knapp:  "Knapp – schnell zur Haltestelle!"
```

**Heimweg:** `los = e.ab − (schulweg + fussVor)`, zu Hause = Ankunft + gehzeit + fussNach.
Mit Anschlussbus: `los = Abfahrt Anschluss − schulweg`.

**Richtung:** vor 11 Uhr „Zur Schule“, sonst „Nach Hause“. Eine eigene Wahl wird in
`localStorage` (`richtung`) für 45 Minuten gemerkt.

## Karte

- Leaflet mit swisstopo-Kacheln `ch.swisstopo.pixelkarte-farbe` (Web-Mercator, bis Zoom 18).
- Linien und Haltestellen werden nur neu gezeichnet, wenn eine andere Fahrt gewählt wird oder
  Echtzeit dazukommt. Der Busmarker wird jede Sekunde verschoben.
- **Folgen:** Höchstens alle 8 Sekunden wird der Ausschnitt angepasst: Bus und Einstieg, solange
  der Bus noch kommt, danach Bus und Ziel. Sind beide weniger als 800 m auseinander, wird vor der
  Abfahrt die ganze Fahrt gezeigt, danach etwas Umgebung um das Ziel. Maximal Zoom 15.
- Berührt man die Karte (Touch, Maus, Mausrad), wird das Folgen ausgeschaltet. Der Knopf ◎
  schaltet es wieder ein.

## Offline und Home-Bildschirm

- `manifest.webmanifest` + `apple-mobile-web-app-*`-Metadaten in `index.html`: Vollbild-App mit
  eigenem Symbol.
- `sw.js`: Beim Installieren werden die eigenen Dateien (`HUELLE`) im Cache `schulbus-v2`
  abgelegt. Abrufe der eigenen Dateien werden **sofort aus dem Cache** beantwortet (schneller
  Start auch bei schlechtem Netz), gleichzeitig wird die neue Version im Hintergrund geholt
  und gespeichert („stale-while-revalidate“). Eine Änderung ist also ab dem **übernächsten**
  Öffnen sichtbar. Nur Antworten mit Status 200 werden gespeichert. Abrufe anderer Server
  (Busdaten, Kartenkacheln) laufen am Service Worker vorbei.
- Ohne Netz startet die App also, zeigt aber keine Busdaten.

## Robustheit und Sicherheit

- Texte aus der API (Haltestellennamen) werden vor dem Einsetzen als HTML maskiert (`esc`),
  auch in den Karten-Tooltips. So kann ein manipulierter Name kein Skript einschleusen.
- `localStorage` ist in `speicher` gekapselt. Im privaten Modus oder bei kaputtem Inhalt
  läuft die App ohne gemerkte Richtung weiter.
- Wirft `zeichne()` einen Fehler, läuft der Sekundentakt weiter. Der Fehler wird einmal in die
  Konsole geschrieben.
- Die Haltestellenliste wird nur neu aufgebaut, wenn sich ihr Inhalt ändert. Uhrzeiten werden mit
  einmal angelegten `Intl.DateTimeFormat`-Objekten formatiert.
- Es gibt keine Schlüssel, keine Anmeldung und keine eigenen Server.

## Testen

- **Zeit simulieren:** `?zeit=JJJJ-MM-TTTHH:MM` verschiebt die App-Uhr (`ZEIT_VERSATZ`). Die
  Anzeige „Aktualisiert vor …“ und das Merken der Richtung nutzen weiter die echte Uhr.
- **Logik in der Browser-Konsole:**

  ```js
  const d = await fetch(Logik.verbindungsUrl("8502378", "8510524", new Date("2026-11-16T11:30"), 8)).then(r => r.json());
  Logik.fahrtenBauen(d, null, "612", "8502378", "8510524").map(f => [f.key, f.fussVor]);
  ```

- Getestete Zustände (Mo 16.11.2026): Anfahrt ab Glashütten, „Jetzt losgehen!“, Bus unterwegs
  mit Restzahl der Halte, Heimweg direkt ab Dörfli, Heimweg mit Umsteigen am Bahnhof (12:10, 12:25), Schulweg mit
  Umsteigen (06:05, 06:24), Dunkelmodus.

## Bekannte Grenzen

- Die Position ist geschätzt (keine GPS-Daten öffentlich verfügbar).
- Ausfälle und Umleitungen zeigt die App nur, wenn sie in den Verbindungsdaten erscheinen.
  Störungsmeldungen als Text werden nicht angezeigt.
- Kein Hinweis auf dem Sperrbildschirm und keine Push-Mitteilungen: Das kann eine Web-App
  auf dem iPhone nicht ohne Server. Dafür bräuchte es eine native App.
- Die Abfrage ist auf `limit=8` Verbindungen begrenzt. Verkehren viele andere Linien auf der
  Strecke, kann die übernächste 612 fehlen. Sie erscheint, sobald die erste vorbei ist.
