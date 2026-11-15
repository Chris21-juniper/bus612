/* Schulbus: reine Logik ohne Oberflaeche (auch in Node testbar).
 *
 * Datenquelle: transport.opendata.ch (gratis, ohne Schluessel, mit Echtzeit).
 * Echte GPS-Positionen der Busse gibt es nicht offen. Die Position wird aus den
 * (verspaetungskorrigierten) Zeiten an den Haltestellen geschaetzt und entlang
 * der Strasse zwischen zwei Haltestellen verschoben.
 */
(function (global) {
  "use strict";

  const API = "https://transport.opendata.ch/v1/connections";

  // ---- Abfrage ---------------------------------------------------------------

  function zweistellig(n) { return String(n).padStart(2, "0"); }

  /** Ortszeit Schweiz fuer die Abfrage (Geraet steht in der Schweiz). */
  function datumZeit(d) {
    return {
      date: `${d.getFullYear()}-${zweistellig(d.getMonth() + 1)}-${zweistellig(d.getDate())}`,
      time: `${zweistellig(d.getHours())}:${zweistellig(d.getMinutes())}`,
    };
  }

  function verbindungsUrl(von, nach, ab, limit) {
    const { date, time } = datumZeit(ab);
    const q = new URLSearchParams({ from: von, to: nach, date, time, direct: 1, limit: limit || 6 });
    return `${API}?${q}`;
  }

  // ---- Fahrten aus der Antwort -------------------------------------------------

  /** Direkte Fahrten der Linie aus einer connections-Antwort: [{name, passList}] */
  function fahrtenDerLinie(daten, linie) {
    const aus = [];
    for (const c of (daten && daten.connections) || []) {
      const fahrten = (c.sections || []).map(s => s.journey).filter(Boolean);
      if (c.transfers !== 0 || fahrten.length !== 1 || String(fahrten[0].number) !== linie) continue;
      // Manche Fahrten brauchen einen Fussweg (z.B. Doerfli -> Rothrist, Bahnhof)
      const pl = fahrten[0].passList || [];
      const busAb = (pl[0] || {}).departureTimestamp, busAn = (pl[pl.length - 1] || {}).arrivalTimestamp;
      const fussVor = c.from && c.from.departureTimestamp && busAb ? Math.round((busAb - c.from.departureTimestamp) / 60) : 0;
      const fussNach = c.to && c.to.arrivalTimestamp && busAn ? Math.round((c.to.arrivalTimestamp - busAn) / 60) : 0;
      aus.push({ name: fahrten[0].name, ziel: fahrten[0].to, passList: pl,
                 fussVor: Math.max(0, fussVor), fussNach: Math.max(0, fussNach) });
    }
    return aus;
  }

  function hatEchtzeit(passList) {
    return passList.some(p => p.delay !== null && p.delay !== undefined);
  }

  /** Haltestellen mit Fahrplan- und geschaetzter Zeit (ms). Verspaetung wird nach vorne
   *  weitergetragen, wenn eine Haltestelle selbst keine hat. */
  function haltestellen(passList) {
    // Eintraege ohne Zeit oder Koordinaten verwerfen: sie wuerden NaN-Zeiten bzw. eine
    // ungueltige Kartenposition erzeugen (Leaflet wirft dann bei jedem Zeichnen).
    passList = passList.filter(p => {
      const st = p.station || p.location || {};
      return (p.arrivalTimestamp || p.departureTimestamp) &&
             st.coordinate && Number.isFinite(st.coordinate.x) && Number.isFinite(st.coordinate.y);
    });
    let letzte = null;
    const erste = passList.find(p => p.delay !== null && p.delay !== undefined);
    const start = erste ? erste.delay : null;
    return passList.map(p => {
      if (p.delay !== null && p.delay !== undefined) letzte = p.delay;
      const v = (p.delay !== null && p.delay !== undefined) ? p.delay : (letzte !== null ? letzte : start);
      const an = p.arrivalTimestamp ? p.arrivalTimestamp * 1000 : null;
      const ab = p.departureTimestamp ? p.departureTimestamp * 1000 : null;
      const anPlan = an || ab, abPlan = ab || an;
      const plus = (v || 0) * 60000;
      const st = p.station || p.location || {};
      return {
        id: st.id, name: st.name || "",
        lat: st.coordinate && st.coordinate.x, lon: st.coordinate && st.coordinate.y,
        anPlan, abPlan, an: anPlan + plus, ab: Math.max(abPlan + plus, anPlan + plus),
        verspaetung: v,
      };
    });
  }

  /** Eine Fahrt fuer die Anzeige. kurz = Abschnitt Einstieg->Ausstieg,
   *  lang = dieselbe Fahrt ab Linienanfang (fuer die Anfahrt), falls gefunden. */
  /** Verspaetungen aus der kurzen Antwort in die lange uebernehmen, wo diese keine hat.
   *  Ohne das zeigte die App "puenktlich", wenn nur die kurze Antwort Echtzeit enthielt. */
  function mitEchtzeitAus(langPl, kurzPl) {
    const schluessel = p => `${(p.station || {}).id}@${p.departureTimestamp || p.arrivalTimestamp}`;
    const delays = new Map(kurzPl.filter(p => p.delay !== null && p.delay !== undefined)
                                 .map(p => [schluessel(p), p.delay]));
    if (!delays.size) return langPl;
    return langPl.map(p => (p.delay === null || p.delay === undefined) && delays.has(schluessel(p))
      ? Object.assign({}, p, { delay: delays.get(schluessel(p)) }) : p);
  }

  function baueFahrt(kurz, lang, linie, einstiegId, ausstiegId) {
    const quelle = lang ? mitEchtzeitAus(lang.passList, kurz.passList) : kurz.passList;
    const stops = haltestellen(quelle);
    const pl = kurz.passList;
    // Einstieg/Ausstieg sind normalerweise die gewuenschten Haltestellen; mit Fussweg
    // sind es die erste/letzte Haltestelle des Busses.
    const einId = kurz.fussVor ? (pl[0].station || {}).id : einstiegId;
    const ausId = kurz.fussNach ? (pl[pl.length - 1].station || {}).id : ausstiegId;
    const ei = stops.findIndex(s => s.id === einId);
    let ai = -1;
    for (let i = stops.length - 1; i > ei; i--) if (stops[i].id === ausId) { ai = i; break; }
    if (ei < 0 || ai < 0) return null;
    const echtzeit = hatEchtzeit(quelle);   // nur, wenn die verwendeten Zeiten Echtzeit enthalten
    return {
      key: `${kurz.name}@${stops[ei].abPlan}`,
      linie, name: kurz.name, ziel: kurz.ziel, stops, ei, ai, echtzeit,
      fussVor: kurz.fussVor || 0, fussNach: kurz.fussNach || 0,
      mitAnfahrt: !!lang,
      get einstieg() { return this.stops[this.ei]; },
      get ausstieg() { return this.stops[this.ai]; },
    };
  }

  /** Doppelte Eintraege derselben Fahrt: der mit Echtzeit gewinnt. */
  function ohneDoppelte(fahrten) {
    const nachKey = new Map();
    for (const f of fahrten) {
      const key = `${f.name}@${(f.passList[0] || {}).departureTimestamp}`;
      const alt = nachKey.get(key);
      if (!alt || (!hatEchtzeit(alt.passList) && hatEchtzeit(f.passList))) nachKey.set(key, f);
    }
    return [...nachKey.values()];
  }

  /** Aus beiden Antworten die Fahrten bauen, nach Abfahrt sortiert. */
  function fahrtenBauen(kurzDaten, langDaten, linie, einstiegId, ausstiegId) {
    const kurz = ohneDoppelte(fahrtenDerLinie(kurzDaten, linie));
    const lang = langDaten ? fahrtenDerLinie(langDaten, linie) : [];
    const fahrten = [];
    for (const k of kurz) {
      const abEinstieg = (k.passList[0] || {}).departureTimestamp;
      // dieselbe Fahrt ab Linienanfang: gleicher Name, gleiche Abfahrt am Einstieg
      const passende = lang.filter(l => l.name === k.name &&
        l.passList.some(p => (p.station || {}).id === einstiegId && p.departureTimestamp === abEinstieg));
      const l = passende.find(x => hatEchtzeit(x.passList)) || passende[0] || null;
      const f = baueFahrt(k, l, linie, einstiegId, ausstiegId);
      if (f) fahrten.push(f);
    }
    return fahrten.sort((a, b) => a.einstieg.abPlan - b.einstieg.abPlan);
  }

  // ---- Umsteigen -------------------------------------------------------------------

  /** Fahrt ohne Umsteigen zwischen den gewuenschten Haltestellen? */
  function istDirekt(f) { return !f.fussVor && !f.fussNach; }

  /** Wo umgestiegen werden muss: der Halt, an dem der 612 beginnt bzw. endet. null = direkt. */
  function umsteigeHalt(f) {
    if (f.fussVor) return { seite: "vor", id: f.einstieg.id, name: f.einstieg.name };
    if (f.fussNach) return { seite: "nach", id: f.ausstieg.id, name: f.ausstieg.name };
    return null;
  }

  /** Direkte Busse (jede Linie) aus einer connections-Antwort, Zeiten in ms mit Verspaetung. */
  function anschlussBusse(daten, vonId, nachId) {
    const aus = [];
    for (const c of (daten && daten.connections) || []) {
      const s = c.sections || [];
      // nur echte Busfahrten ohne Fussweg am Anfang oder Ende
      if (c.transfers !== 0 || s.length !== 1 || !s[0].journey) continue;
      const d = s[0].departure || {}, a = s[0].arrival || {};
      if ((d.station || {}).id !== vonId || (a.station || {}).id !== nachId) continue;
      if (!d.departureTimestamp || !a.arrivalTimestamp) continue;
      const vAb = d.delay, vAn = a.delay !== null && a.delay !== undefined ? a.delay : vAb;
      const echtzeit = (vAb !== null && vAb !== undefined) || (a.delay !== null && a.delay !== undefined);
      aus.push({
        linie: String(s[0].journey.number || s[0].journey.name || ""),
        abPlan: d.departureTimestamp * 1000, anPlan: a.arrivalTimestamp * 1000,
        ab: (d.departureTimestamp + (vAb || 0) * 60) * 1000,
        an: (a.arrivalTimestamp + (vAn || 0) * 60) * 1000,
        echtzeit,
      });
    }
    return aus.sort((x, y) => x.abPlan - y.abPlan);
  }

  /** Passenden Anschlussbus fuer eine Fahrt mit Umsteigen suchen.
   *  vor:  letzter Bus, der genug frueh beim 612 ist (zum Umsteigen).
   *  nach: erster Bus nach der Ankunft des 612.
   *  Gibt null, wenn keiner passt; dann bleibt nur der Fussweg. */
  function passenderAnschluss(f, busse, umsteigeMin, maxWarteMin) {
    const halt = umsteigeHalt(f);
    if (!halt) return null;
    const um = (umsteigeMin || 0) * 60000, max = (maxWarteMin || 30) * 60000;
    if (halt.seite === "vor") {
      const bis = f.einstieg.ab - um;
      const passt = busse.filter(b => b.an <= bis && f.einstieg.ab - b.an <= max);
      const b = passt[passt.length - 1];
      return b ? Object.assign({ seite: "vor", halt: halt.name, warte: Math.round((f.einstieg.ab - b.an) / 60000) }, b) : null;
    }
    const ab = f.ausstieg.an + um;
    const b = busse.find(x => x.ab >= ab && x.ab - f.ausstieg.an <= max);
    return b ? Object.assign({ seite: "nach", halt: halt.name, warte: Math.round((b.ab - f.ausstieg.an) / 60000) }, b) : null;
  }

  // ---- Position ------------------------------------------------------------------

  function abstand(a, b) {   // Meter, genuegt fuer kurze Strecken
    const r = 6371000, k = Math.PI / 180;
    const x = (b[1] - a[1]) * k * Math.cos(((a[0] + b[0]) / 2) * k);
    const y = (b[0] - a[0]) * k;
    return Math.sqrt(x * x + y * y) * r;
  }

  function teilstueck(strecke, a, b) {
    const linie = strecke && strecke[`${a.id}>${b.id}`];
    return linie && linie.length > 1 ? linie : [[a.lat, a.lon], [b.lat, b.lon]];
  }

  function punktAufLinie(linie, anteil) {
    const laengen = [];
    let summe = 0;
    for (let i = 1; i < linie.length; i++) { const d = abstand(linie[i - 1], linie[i]); laengen.push(d); summe += d; }
    let rest = Math.min(Math.max(anteil, 0), 1) * summe;
    for (let i = 0; i < laengen.length; i++) {
      if (rest <= laengen[i] || i === laengen.length - 1) {
        const t = laengen[i] ? rest / laengen[i] : 0;
        const p = linie[i], q = linie[i + 1];
        return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
      }
      rest -= laengen[i];
    }
    return linie[linie.length - 1];
  }

  /** Wo ist der Bus jetzt?
   *  zustand: 'start' (noch nicht losgefahren) | 'halt' | 'fahrt' | 'ende'
   *  index: letzte erreichte Haltestelle; lat/lon: geschaetzte Position */
  function position(fahrt, jetzt, strecke) {
    const s = fahrt.stops;
    if (jetzt < s[0].ab) return { zustand: "start", index: 0, lat: s[0].lat, lon: s[0].lon };
    for (let i = 0; i < s.length; i++) {
      if (jetzt >= s[i].an && jetzt < s[i].ab) return { zustand: "halt", index: i, lat: s[i].lat, lon: s[i].lon };
      const n = s[i + 1];
      if (n && jetzt >= s[i].ab && jetzt < n.an) {
        const anteil = (jetzt - s[i].ab) / Math.max(n.an - s[i].ab, 1);
        const [lat, lon] = punktAufLinie(teilstueck(strecke, s[i], n), anteil);
        return { zustand: "fahrt", index: i, anteil, lat, lon };
      }
    }
    const l = s[s.length - 1];
    return { zustand: "ende", index: s.length - 1, lat: l.lat, lon: l.lon };
  }

  /** Welche Fahrten zur Auswahl? Alles, was am Ausstieg noch nicht angekommen ist. */
  function auswahl(fahrten, jetzt, anzahl) {
    return fahrten.filter(f => f.ausstieg.an > jetzt).slice(0, anzahl || 4);
  }

  /** Vorgabe: die naechste Fahrt, die am Einstieg noch nicht weg ist. */
  function vorgabe(fahrten, jetzt) {
    return fahrten.find(f => f.einstieg.ab > jetzt) || fahrten[0] || null;
  }

  const api = { verbindungsUrl, fahrtenDerLinie, haltestellen, fahrtenBauen, position,
                punktAufLinie, teilstueck, auswahl, vorgabe, hatEchtzeit,
                istDirekt, umsteigeHalt, anschlussBusse, passenderAnschluss };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.Logik = api;
})(this);
