# Bus 612 – Schulbus live

Eine Web-App fürs iPhone, die zeigt, wo der Bus 612 gerade ist, wann er an der Haltestelle
ankommt und wann man losgehen muss.

**App:** https://chris21-juniper.github.io/bus612/

| Strecke | Einstieg | Ausstieg |
|---|---|---|
| **Zur Schule** | Riken AG, Neustadt | Rothrist, Sennhof-Dörfli |
| **Nach Hause** | Rothrist, Sennhof-Dörfli | Riken AG, Neustadt |

---

## Inhalt

- [Was die App zeigt](#was-die-app-zeigt)
- [Aufs iPhone holen](#aufs-iphone-holen)
- [Bedienung](#bedienung)
- [Wie genau ist das?](#wie-genau-ist-das)
- [Einstellungen ändern](#einstellungen-ändern)
- [Entwicklung](#entwicklung)
- [Veröffentlichen](#veröffentlichen)
- [Dateien](#dateien)
- [Datenquellen und Lizenzen](#datenquellen-und-lizenzen)

Wie die App intern funktioniert (Abfragen, Positionsberechnung, Sonderfälle), steht in
[docs/technik.md](docs/technik.md).

---

## Was die App zeigt

**Grosse Minutenanzeige**
- Bevor der Bus kommt: Minuten, bis er an der Einstiegshaltestelle abfährt.
- Im Bus: Minuten bis zur Ankunft am Ziel und die Zahl der restlichen Halte.
- Bei weniger als einer Minute steht „jetzt“, bei mehr als zwei Stunden die Uhrzeit.

**Losgeh-Hinweis (Zur Schule)**

| Anzeige | Wann |
|---|---|
| „Losgehen in 12 Min. (06:56)“ | bis zur Losgehzeit (gelb in den letzten 5 Minuten) |
| **„Jetzt losgehen!“** (grün) | ab der Losgehzeit, solange es zu Fuss noch reicht |
| **„Knapp – schnell zur Haltestelle!“** (orange) | wenn die normale Gehzeit nicht mehr reicht |

Losgehzeit = Abfahrt mit Verspätung − Gehzeit (5 Min.) − Puffer (2 Min.).

**Heimweg (Nach Hause)**
- „Zu Hause ca. 12:49“: Ankunft in Riken plus Gehzeit.

**Direkt oder umsteigen**

Viele 612er fahren nicht bis Sennhof-Dörfli, sondern beginnen oder enden am **Rothrist Bahnhof**.
Bei jeder Fahrt steht deshalb ein Etikett:

| Etikett | Bedeutung |
|---|---|
| direkt (grün) | der 612 fährt durch, kein Umsteigen |
| umsteigen (orange) | in Rothrist Bahnhof umsteigen, auf den Bus 603/606 von oder nach Sennhof-Dörfli |
| mit Fussweg (orange) | kein passender Anschlussbus gefunden, zu Fuss zwischen Dörfli und Bahnhof (ca. 12 Min.) |

Beim Umsteigen zeigt eine orange umrandete Zeile den Anschluss, zum Beispiel
„Umsteigen in Rothrist Bahnhof: Bus 603 ab Sennhof-Dörfli 12:23, an 12:27 → Bus 612 ab 12:35“.
Auf dem Heimweg zählt die grosse Anzeige dann zuerst bis zur Abfahrt des 603. Die Zeiten
„ab … · an …“ gelten für die ganze Reise. Die Bus-Knöpfe zeigen ebenfalls „direkt“ oder „umsteigen“.

**Verspätung**

| Etikett | Bedeutung |
|---|---|
| pünktlich (grün) | Echtzeitdaten vorhanden, keine Verspätung |
| +2 Min. (gelb) | bis 3 Minuten Verspätung |
| +5 Min. Verspätung (rot) | mehr als 3 Minuten |
| laut Fahrplan (grau) | (noch) keine Echtzeitdaten, die Zeiten sind die geplanten |

**Karte**
- Linienverlauf auf der Strasse; der eigene Abschnitt ist blau, die Anfahrt des Busses grau gestrichelt.
- Der Bus ist ein blauer Punkt mit Bussymbol. Er pulsiert, wenn Echtzeitdaten vorhanden sind.
- Die eigenen Haltestellen sind gross und beschriftet.

**Haltestellenliste** (aufklappbar): alle Halte mit Fahrplanzeit, abweichende Echtzeit in Rot.
Vergangene Halte sind grau, der aktuelle ist markiert.

## Aufs iPhone holen

1. Die Adresse **in Safari** öffnen (nicht in Chrome oder einer anderen App).
2. Unten auf **Teilen** tippen (Viereck mit Pfeil nach oben).
3. **Zum Home-Bildschirm** → **Hinzufügen**.

Danach gibt es ein blaues „612“-Symbol. Die App startet im Vollbild wie eine normale App.
Updates kommen automatisch: Die App lädt sie im Hintergrund und zeigt sie ab dem übernächsten
Öffnen. Eine Neuinstallation ist nie nötig.

## Bedienung

| Was | Wie |
|---|---|
| Richtung wechseln | oben „Zur Schule“ / „Nach Hause“. Vor 11 Uhr ist automatisch „Zur Schule“ gewählt, danach „Nach Hause“. Eine eigene Wahl gilt 45 Minuten lang. |
| Anderen Bus anzeigen | die Zeit-Knöpfe unter der grossen Anzeige. „unterwegs“ = der Bus ist schon abgefahren (nützlich, wenn man drin sitzt). |
| Sofort aktualisieren | auf die grosse Anzeige tippen |
| Karte frei bewegen | einfach schieben oder zoomen. Die Karte folgt dem Bus dann nicht mehr. |
| Karte wieder dem Bus folgen lassen | Knopf ◎ unten rechts auf der Karte |

Die App fragt die Daten alle 30 Sekunden neu ab, wenn ein Bus in der nächsten Stunde fährt,
sonst alle 5 Minuten. Beim Zurückkehren in die App wird sofort aktualisiert. Unten steht,
wie alt die Daten sind. Ohne Internet erscheint rot „Keine Verbindung“, und die App
rechnet mit dem letzten Stand weiter.

## Wie genau ist das?

- **Zeiten und Verspätungen** kommen aus den offiziellen Echtzeitdaten des Schweizer öV
  und sind so genau wie in der SBB-App.
- **Die Position auf der Karte ist geschätzt.** Echte GPS-Positionen der Busse sind in der
  Schweiz nicht öffentlich. Die App kennt für jede Haltestelle die erwartete Ankunfts- und
  Abfahrtszeit und schiebt den Bus dazwischen gleichmässig der Strasse entlang. Steht der Bus
  im Stau oder wartet er an einer Ampel, merkt die App das erst, wenn die Verkehrsbetriebe
  die Verspätung melden.
- Steht **„laut Fahrplan“**, gibt es keine Echtzeitdaten. Der Punkt fährt dann genau nach Fahrplan.

## Einstellungen ändern

Alle Einstellungen stehen oben in [`app.js`](app.js) im Objekt `CFG`:

| Einstellung | Wert | Bedeutung |
|---|---|---|
| `gehzeit` | 5 | Minuten zu Fuss zwischen zu Hause und der Haltestelle Riken |
| `puffer` | 2 | Reserve-Minuten beim Losgehen am Morgen |
| `schulweg` | 3 | Minuten vom Schulhaus zur Haltestelle Sennhof-Dörfli |
| `richtungen.*.von/nach` | Haltestellen-IDs | Einstieg und Ausstieg je Richtung |
| `richtungen.schule.vorlauf` | 8502388 | Linienanfang Glashütten, Kirche: damit man den Bus schon kommen sieht |
| `takt.nah` / `takt.fern` | 30 s / 5 Min. | Abfrageintervall mit / ohne baldigen Bus |
| `umsteigen.min` / `umsteigen.maxWarte` | 2 / 30 | Minuten zum Umsteigen in Rothrist Bahnhof (mindestens / höchstens warten) |

Haltestellen-IDs findet man so:
`https://transport.opendata.ch/v1/locations?query=Riken%20Neustadt`

Ändert sich die Linienführung (neue Haltestellen, Umleitung auf Dauer), muss `strecke.js`
neu erzeugt werden, siehe [Entwicklung](#entwicklung). Ohne Neuerzeugung funktioniert die
App weiter, zeichnet die neuen Abschnitte aber als gerade Linie.

## Entwicklung

Es braucht keinen Build-Schritt und keine Abhängigkeiten. Lokal starten:

```bash
python3 -m http.server 8612
```

Dann http://localhost:8612 öffnen (Service Worker funktionieren nur über `localhost` oder https).

**Zeit simulieren:** Mit `?zeit=…` tut die App so, als wäre es zu dieser Zeit. So lässt sich
auch am Wochenende oder abends testen:

| Adresse | Zustand |
|---|---|
| `?zeit=2026-11-16T06:45` | Morgen, Bus noch weit weg, „Losgehen in … Min.“ |
| `?zeit=2026-11-16T06:57` | „Jetzt losgehen!“, Bus kurz vor Riken |
| `?zeit=2026-11-16T07:11` | Bus 07:03 unterwegs (Knopf „unterwegs“ antippen) |
| `?zeit=2026-11-16T06:05` | Schulweg mit Umsteigen in Rothrist Bahnhof |
| `?zeit=2026-11-16T12:10` | Heimweg mit Umsteigen: zuerst Bus 603 zum Bahnhof |
| `?zeit=2026-11-16T14:50` | Heimweg direkt |

Das Datum muss ein Schultag mit Fahrplandaten sein (der Fahrplan ist rund ein Jahr im Voraus abrufbar).

**Strassenverlauf neu erzeugen** (nur bei geänderter Linienführung):

```bash
python3 tools/strecke_bauen.py
```

Das Skript holt die Haltestellenfolge beider Richtungen und fragt für jedes Teilstück den
Weg auf der Strasse beim öffentlichen OSRM-Demoserver ab (rund 35 Anfragen, mit Pause
dazwischen). Ergebnis: `strecke.js`.

**Nach Änderungen** an `index.html`, `style.css` oder den Skripten muss nichts weiter getan
werden: Der Service Worker holt die neue Version im Hintergrund, sie erscheint ab dem
übernächsten Öffnen. Damit eine Änderung schon beim nächsten Öffnen komplett da ist, oder
wenn Dateien dazukommen oder wegfallen, die Liste `HUELLE` in [`sw.js`](sw.js) anpassen und
`CACHE` hochzählen (z.B. `schulbus-v4`). Beim lokalen Testen in den Entwicklerwerkzeugen
„Update on reload“ einschalten oder zweimal neu laden.

## Veröffentlichen

Die App läuft auf **GitHub Pages** direkt aus dem Branch `main` (Ordner `/`). Jeder Push
auf `main` ist nach etwa einer Minute online. Die leere Datei `.nojekyll` sorgt dafür, dass
GitHub die Dateien unverändert ausliefert.

Datenschutz: Das Repo und die Seite sind öffentlich. Die App enthält keine Namen und keine
Adressen, nur die Haltestellen der Linie und die Gehzeiten.

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Seitengerüst, Metadaten für den Home-Bildschirm |
| `style.css` | Aussehen, hell und dunkel (folgt der iPhone-Einstellung) |
| `app.js` | Einstellungen (`CFG`), Abfragen, Anzeige, Karte |
| `logik.js` | Reine Rechenlogik: Fahrten auswählen, Verspätung, Busposition |
| `strecke.js` | Strassenverlauf zwischen den Haltestellen (erzeugt, nicht von Hand ändern) |
| `sw.js` | Service Worker: App startet auch ohne Netz |
| `manifest.webmanifest` | Name, Farben und Symbole der App |
| `icons/` | App-Symbol (`icon.svg` ist die Vorlage, die PNGs sind daraus erzeugt) |
| `lib/` | [Leaflet](https://leafletjs.com) 1.9.4 für die Karte |
| `tools/strecke_bauen.py` | erzeugt `strecke.js` |
| `docs/technik.md` | technische Beschreibung |

## Datenquellen und Lizenzen

- **Fahrplan und Echtzeit:** [transport.opendata.ch](https://transport.opendata.ch),
  kostenlos und ohne Schlüssel, Daten der Schweizer öV-Betriebe.
- **Karte:** [swisstopo](https://www.swisstopo.admin.ch), Landeskarte farbig über
  `wmts.geo.admin.ch`, frei nutzbar mit Quellenangabe „© swisstopo“.
- **Strassenverlauf:** einmalig berechnet mit [OSRM](https://project-osrm.org) auf Basis
  von © OpenStreetMap-Mitwirkenden.
- **Leaflet:** BSD-2-Clause-Lizenz, © Vladimir Agafonkin.
