"""Strassenverlauf der Linie 612 einmalig berechnen -> strecke.js

Holt die Haltestellenfolge beider Richtungen bei transport.opendata.ch und
fragt fuer jedes Teilstueck (Haltestelle -> naechste Haltestelle) den Weg auf
der Strasse beim OSRM-Demoserver ab. Ergebnis: strecke.js mit
  STRECKE = {"<von_id>><nach_id>": [[lat, lon], ...], ...}
Die App nutzt diese Linien fuer Karte und Busposition; fehlt ein Stueck,
zeichnet sie eine gerade Linie.

Nur neu ausfuehren, wenn sich die Linienfuehrung aendert:
    python3 tools/strecke_bauen.py
"""
import datetime as dt
import json
import pathlib
import subprocess
import time
import urllib.parse

UA = {"User-Agent": "schulbus-strecke"}
OPENDATA = "https://transport.opendata.ch/v1/connections"
OSRM = "https://router.project-osrm.org/route/v1/driving/"
LINIE = "612"
# (von, nach) moeglichst weit aussen, damit die ganze Linie drin ist
RICHTUNGEN = [("8502388", "8502378"),   # Glashuetten, Kirche -> Rothrist, Sennhof-Doerfli
              ("8502378", "8502388"),   # zurueck
              ("8572690", "8502388")]   # ab Rothrist, Bahnhof (manche Fahrten starten dort)
ZIEL = pathlib.Path(__file__).resolve().parent.parent / "strecke.js"


def hole(url):
    # curl statt urllib: das Python von macOS scheitert teils am TLS des OSRM-Servers
    aus = subprocess.run(["curl", "-sSf", "-m", "30", "-A", UA["User-Agent"], url],
                         check=True, capture_output=True)
    return json.loads(aus.stdout)


def naechster_werktag():
    d = dt.date.today() + dt.timedelta(days=1)
    while d.weekday() >= 5:
        d += dt.timedelta(days=1)
    return d


def stopfolgen():
    tag = naechster_werktag()
    folgen = []
    for von, nach in RICHTUNGEN:
        for zeit in ("07:00", "12:00", "16:00"):
            q = urllib.parse.urlencode({"from": von, "to": nach, "date": tag.isoformat(),
                                        "time": zeit, "direct": 1, "limit": 4})
            for c in hole(f"{OPENDATA}?{q}").get("connections", []):
                for s in c["sections"]:
                    j = s.get("journey")
                    if j and str(j.get("number")) == LINIE:
                        folge = [(p["station"]["id"], p["station"]["coordinate"]["x"],
                                  p["station"]["coordinate"]["y"]) for p in j["passList"]]
                        if folge not in folgen:
                            folgen.append(folge)
            time.sleep(0.5)
    return folgen


def strassenstueck(a, b):
    pfad = f"{a[2]},{a[1]};{b[2]},{b[1]}"
    d = hole(f"{OSRM}{pfad}?overview=full&geometries=geojson")
    return [[round(lat, 6), round(lon, 6)] for lon, lat in d["routes"][0]["geometry"]["coordinates"]]


def main():
    stuecke = {}
    for folge in stopfolgen():
        for a, b in zip(folge, folge[1:]):
            key = f"{a[0]}>{b[0]}"
            if key in stuecke:
                continue
            try:
                stuecke[key] = strassenstueck(a, b)
                print("ok ", key, len(stuecke[key]), "Punkte")
            except Exception as e:
                print("fehlt", key, e)
            time.sleep(1)   # Demoserver schonen
    ZIEL.write_text("// Erzeugt von tools/strecke_bauen.py, nicht von Hand bearbeiten.\n"
                    f"const STRECKE = {json.dumps(stuecke, separators=(',', ':'))};\n")
    print(f"{len(stuecke)} Teilstuecke -> {ZIEL}")


if __name__ == "__main__":
    main()
