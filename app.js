/* Schulbus 612: Oberflaeche. Logik steht in logik.js. */
"use strict";

const CFG = {
  linie: "612",
  // Minuten zu Fuss
  gehzeit: 5,          // zu Hause <-> Haltestelle Riken
  puffer: 2,
  schulweg: 3,         // Schulhaus -> Haltestelle Doerfli
  richtungen: {
    schule: {
      von: { id: "8510524", name: "Riken AG, Neustadt" },
      nach: { id: "8502378", name: "Rothrist, Sennhof-Dörfli" },
      vorlauf: "8502388",           // Glashuetten, Kirche: Linienanfang, fuer die Anfahrt
    },
    heim: {
      von: { id: "8502378", name: "Rothrist, Sennhof-Dörfli" },
      nach: { id: "8510524", name: "Riken AG, Neustadt" },
      vorlauf: null,                // die Fahrten beginnen hier
    },
  },
  takt: { nah: 30000, fern: 300000 },   // Abfrage alle 30 s, wenn ein Bus bald faehrt
  // Beginnt/endet der 612 nicht am Doerfli (sondern z.B. in Rothrist, Bahnhof), wird ein
  // Anschlussbus zwischen Doerfli und diesem Halt gesucht.
  umsteigen: { min: 2, maxWarte: 30 },  // Minuten: mindestens zum Umsteigen, hoechstens warten
  // Standort beim Oeffnen der App: nahe Riken -> "Zur Schule", nahe Rothrist -> "Nach Hause".
  // Mittelpunkte sind die Haltestellen, Radius in Metern.
  orte: {
    schule: { lat: 47.272252, lon: 7.846854, radius: 1500 },   // um Riken AG, Neustadt
    heim:   { lat: 47.305584, lon: 7.888969, radius: 2500 },   // um Rothrist, Sennhof-Doerfli
  },
};

const MIN = 60000;

// Zum Ausprobieren: ?zeit=2026-11-16T06:58 laesst die App so tun, als waere es dann.
const ZEIT_VERSATZ = (() => {
  const z = new URLSearchParams(location.search).get("zeit");
  const t = z ? new Date(z).getTime() : NaN;
  return isNaN(t) ? 0 : t - Date.now();
})();
const jetztMs = () => Date.now() + ZEIT_VERSATZ;
// Zum Ausprobieren: ?ort=47.2723,7.8469 setzt den eigenen Standort fest (statt GPS).
const ORT_FEST = (() => {
  const m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(new URLSearchParams(location.search).get("ort") || "");
  return m ? { lat: +m[1], lon: +m[2], genau: 10 } : null;
})();
const $ = id => document.getElementById(id);
const kurzName = n => /, Bahnhof$/.test(n) ? n.replace(",", "") : n.replace(/^(Riken AG|Rothrist|Murgenthal), /, "");
// Formatierer einmal anlegen: toLocale*String baut bei jedem Aufruf einen neuen (jede Sekunde dutzendfach)
const FMT_UHR = new Intl.DateTimeFormat("de-CH", { hour: "2-digit", minute: "2-digit" });
const FMT_TAG = new Intl.DateTimeFormat("de-CH", { weekday: "short" });
const uhr = ms => FMT_UHR.format(ms);
const wochentag = ms => FMT_TAG.format(ms);
// Texte aus der API nie ungeprueft als HTML einsetzen
const esc = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// localStorage kann fehlen oder werfen (privater Modus, volle Quote, kaputter Inhalt)
const speicher = {
  lies(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } },
  schreib(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* egal */ } },
};

const zustand = {
  richtung: null,
  fahrten: [],
  gewaehlt: null,           // key der vom Kind angetippten Fahrt
  stand: null,              // Zeitpunkt der letzten guten Antwort
  fehler: false,
  folgen: true,
  abfrage: 0,               // laufende Nummer: veraltete Antworten verwerfen
  ort: null,                // eigener Standort {lat, lon, genau, wann}; bleibt auf dem Geraet
  ortEntscheidet: true,     // naechster Standort darf die Richtung waehlen (nur beim Oeffnen)
};

// ---- Richtung -------------------------------------------------------------------

function eigeneWahl() {
  const gemerkt = speicher.lies("richtung");
  return gemerkt && CFG.richtungen[gemerkt.r] && Date.now() - gemerkt.wann < 45 * MIN ? gemerkt.r : null;
}

/** Richtung aus dem Standort: nahe zu Hause -> Schule, nahe Rothrist -> Heim, sonst null. */
function richtungNachOrt() {
  const o = zustand.ort;
  if (!o || Date.now() - o.wann > 5 * MIN) return null;
  let beste = null, bestD = Infinity;
  for (const [r, z] of Object.entries(CFG.orte)) {
    const d = L.latLng(o.lat, o.lon).distanceTo([z.lat, z.lon]);
    if (d <= z.radius && d < bestD) { beste = r; bestD = d; }
  }
  return beste;
}

/** Reihenfolge: eigene Wahl (45 Min.) > Standort > Tageszeit (vor 11 Uhr Schule). */
function richtungNachZeit() {
  return eigeneWahl() || richtungNachOrt() || (new Date(jetztMs()).getHours() < 11 ? "schule" : "heim");
}

function setzeRichtung(r, vonHand) {
  if (vonHand) speicher.schreib("richtung", { r, wann: Date.now() });
  if (zustand.richtung === r) return;
  zustand.richtung = r;
  zustand.fahrten = [];
  zustand.gewaehlt = null;
  // Stand und Fehler gehoeren zur alten Richtung: sonst stuende kurz "Kein Bus gefunden"
  // bzw. "Stand vor 3 Min." von Daten, die gar nicht angezeigt werden
  zustand.stand = null;
  zustand.fehler = false;
  $("btn-schule").classList.toggle("aktiv", r === "schule");
  $("btn-heim").classList.toggle("aktiv", r === "heim");
  $("btn-schule").setAttribute("aria-selected", r === "schule");
  $("btn-heim").setAttribute("aria-selected", r === "heim");
  const rc = CFG.richtungen[r];
  $("strecke-text").textContent = `${kurzName(rc.von.name)} → ${kurzName(rc.nach.name)}`;
  kartenEbene.leeren();
  zeichne();
  aktualisiere();
}

// ---- Daten ------------------------------------------------------------------------

// Mit Zeitlimit: Ein haengender Abruf (Funkloch) wuerde sonst nie fertig, und weil die
// naechste Abfrage erst danach geplant wird, froeren die Live-Daten still ein.
async function holeJson(url, ms = 10000) {
  const abbruch = new AbortController();
  const uhrwerk = setTimeout(() => abbruch.abort(), ms);
  try {
    const r = await fetch(url, { cache: "no-store", signal: abbruch.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(uhrwerk);
  }
}

let naechsteAbfrage = null;

async function aktualisiere() {
  clearTimeout(naechsteAbfrage);
  const nr = ++zustand.abfrage;
  const r = zustand.richtung, rc = CFG.richtungen[r];
  // 40 Min. zurueck: ein Bus, der schon unterwegs ist, soll noch dabei sein
  const ab = new Date(jetztMs() - 40 * MIN);
  try {
    const [kurz, lang] = await Promise.all([
      holeJson(Logik.verbindungsUrl(rc.von.id, rc.nach.id, ab, 8)),
      rc.vorlauf ? holeJson(Logik.verbindungsUrl(rc.vorlauf, rc.nach.id, new Date(ab - 15 * MIN), 8)).catch(() => null)
                 : Promise.resolve(null),
    ]);
    if (nr !== zustand.abfrage) return;       // inzwischen neu abgefragt / umgeschaltet
    const fahrten = Logik.fahrtenBauen(kurz, lang, CFG.linie, rc.von.id, rc.nach.id);
    await anschluesseSuchen(fahrten, rc);
    if (nr !== zustand.abfrage) return;
    zustand.fahrten = fahrten;
    zustand.stand = Date.now();
    zustand.fehler = false;
  } catch (e) {
    if (nr !== zustand.abfrage) return;
    console.warn("Abfrage fehlgeschlagen", e);
    zustand.fehler = true;
  }
  zeichne();
  planeNaechste();
}

/** Fuer Fahrten mit Umsteigen den Anschlussbus Doerfli <-> Umsteigehalt holen.
 *  Schlaegt das fehl, bleibt die Fahrt gueltig; angezeigt wird dann der Fussweg. */
async function anschluesseSuchen(fahrten, rc) {
  const nachHalt = new Map();
  for (const f of fahrten) {
    const h = Logik.umsteigeHalt(f);
    if (!h) continue;
    // vor: Doerfli -> Halt, rechtzeitig vor der Abfahrt; nach: Halt -> Doerfli, ab Ankunft
    const t = h.seite === "vor" ? f.einstieg.abPlan - (CFG.umsteigen.maxWarte + 15) * MIN : f.ausstieg.anPlan - 5 * MIN;
    const k = `${h.seite}|${h.id}`;
    const alt = nachHalt.get(k);
    if (!alt || t < alt.t) nachHalt.set(k, { h, t });
  }
  const busse = new Map();
  await Promise.all([...nachHalt].map(async ([k, { h, t }]) => {
    const [von, nach] = h.seite === "vor" ? [rc.von.id, h.id] : [h.id, rc.nach.id];
    try {
      busse.set(k, Logik.anschlussBusse(await holeJson(Logik.verbindungsUrl(von, nach, new Date(t), 16)), von, nach));
    } catch (e) { console.warn("Anschluss nicht abrufbar", e); }
  }));
  for (const f of fahrten) {
    const h = Logik.umsteigeHalt(f);
    f.anschluss = h ? Logik.passenderAnschluss(f, busse.get(`${h.seite}|${h.id}`) || [], CFG.umsteigen.min, CFG.umsteigen.maxWarte) : null;
  }
}

function planeNaechste() {
  const f = aktuelleFahrt();
  const bald = f && f.einstieg.ab - jetztMs() < 60 * MIN && f.ausstieg.an > jetztMs() - 5 * MIN;
  const warte = zustand.fehler ? 15000 : (bald ? CFG.takt.nah : CFG.takt.fern);
  naechsteAbfrage = setTimeout(() => { if (!document.hidden) aktualisiere(); }, warte);
}

function aktuelleFahrt() {
  const jetzt = jetztMs();
  const liste = Logik.auswahl(zustand.fahrten, jetzt, 4);
  return liste.find(f => f.key === zustand.gewaehlt) || Logik.vorgabe(liste, jetzt);
}

// ---- Anzeige -----------------------------------------------------------------------

function minutenBis(ms) { return Math.max(0, Math.ceil((ms - jetztMs()) / MIN)); }

function statusText(f) {
  if (!f.echtzeit) return { text: "laut Fahrplan", klasse: "grau" };
  const v = f.einstieg.verspaetung || 0;
  if (v <= 0) return { text: "pünktlich", klasse: "gruen" };
  if (v <= 3) return { text: `+${v} Min.`, klasse: "gelb" };
  return { text: `+${v} Min. Verspätung`, klasse: "rot" };
}

function zeichne() {
  const jetzt = jetztMs();
  const f = aktuelleFahrt();
  const haupt = $("hauptkarte");
  haupt.className = "karte-gross";

  zeichneAuswahl(f, jetzt);

  if (!f) {
    $("cd-zahl").textContent = "–";
    $("cd-einheit").textContent = "";
    $("cd-text").textContent = zustand.fehler ? "Busdaten zurzeit nicht verfügbar" :
      (zustand.stand ? "Kein Bus 612 gefunden" : "Lade Busdaten…");
    $("status").textContent = "–"; $("status").className = "pille grau";
    $("zeiten").textContent = ""; $("tipp").hidden = true;
    $("art").hidden = true; $("umstieg").hidden = true;
    zeichneStand();
    return;
  }

  const pos = Logik.position(f, jetzt, STRECKE);
  const e = f.einstieg, a = f.ausstieg;
  const st = statusText(f);
  $("status").textContent = st.text; $("status").className = `pille ${st.klasse}`;
  const tag = new Date(e.abPlan).toDateString() !== new Date(jetztMs()).toDateString() ? `${wochentag(e.abPlan)} ` : "";
  const an = f.anschluss, vor = an && an.seite === "vor" ? an : null, nach = an && an.seite === "nach" ? an : null;
  // Zeiten der ganzen Reise ab/bis Doerfli bzw. Riken, nicht nur des 612
  $("zeiten").textContent = `ab ${tag}${uhr(vor ? vor.abPlan : e.abPlan)} · an ${uhr(nach ? nach.anPlan : a.anPlan)}`;
  const direkt = Logik.istDirekt(f);
  $("art").hidden = false;
  $("art").textContent = direkt ? "direkt" : (an ? "umsteigen" : "mit Fussweg");
  $("art").className = `pille ${direkt ? "direkt" : "um"}`;
  zeigeUmstieg(f);
  const fussWeg = nach ? `, dann Bus ${nach.linie} um ${uhr(nach.ab)}` : f.fussNach ? `, dann ${f.fussNach} Min. zu Fuss` : "";

  const tipp = $("tipp");
  tipp.hidden = true;

  if (vor && jetzt < vor.ab) {
    // Zuerst mit dem Anschlussbus zum Umsteigehalt
    zeigeZahl(vor.ab);
    $("cd-text").textContent = `bis Bus ${vor.linie} in ${kurzName(CFG.richtungen[zustand.richtung].von.name)} abfährt`;
    const los = vor.ab - CFG.schulweg * MIN;
    const heim = uhr(a.an + (CFG.gehzeit + f.fussNach) * MIN);
    tipp.hidden = false;
    if (jetzt < los) {
      tipp.textContent = `Los um ${uhr(los)} zum Bus ${vor.linie} · zu Hause ca. ${heim}`; tipp.className = "tipp";
    } else {
      tipp.textContent = `Jetzt los zur Haltestelle! · zu Hause ca. ${heim}`; tipp.className = "tipp jetzt"; haupt.classList.add("jetzt");
    }
  } else if (jetzt < e.ab) {
    // Bus kommt noch
    zeigeZahl(e.ab);
    $("cd-text").textContent = anfahrtText(f, pos);
    if (vor) {
      tipp.hidden = false; tipp.className = "tipp";
      tipp.textContent = `Im Bus ${vor.linie} · in ${kurzName(e.name)} umsteigen auf den 612 (${uhr(e.ab)})`;
    } else if (zustand.richtung === "schule") {
      const los = e.ab - (CFG.gehzeit + CFG.puffer + f.fussVor) * MIN;
      const knapp = e.ab - (CFG.gehzeit + f.fussVor) * MIN;
      tipp.hidden = false;
      if (jetzt < los) {
        const m = minutenBis(los);
        tipp.textContent = m > 90 ? `Losgehen um ${uhr(los)}` : `Losgehen in ${m} Min. (${uhr(los)})`;
        tipp.className = m <= 5 ? "tipp bald" : "tipp";
        if (m <= 5) haupt.classList.add("bald");
      } else if (jetzt < knapp) {
        tipp.textContent = "Jetzt losgehen!"; tipp.className = "tipp jetzt"; haupt.classList.add("jetzt");
      } else {
        tipp.textContent = "Knapp – schnell zur Haltestelle!"; tipp.className = "tipp knapp"; haupt.classList.add("knapp");
      }
    } else {
      const los = e.ab - (CFG.schulweg + f.fussVor) * MIN;
      const heim = uhr(a.an + (CFG.gehzeit + f.fussNach) * MIN);
      tipp.hidden = false;
      tipp.className = "tipp";
      if (f.fussVor) {
        tipp.textContent = jetzt < los
          ? `Bus fährt ab ${kurzName(e.name)}: ${f.fussVor} Min. zu Fuss, los um ${uhr(los)} · zu Hause ca. ${heim}`
          : `Jetzt los zur Haltestelle ${kurzName(e.name)}! · zu Hause ca. ${heim}`;
        if (jetzt >= los) tipp.className = "tipp jetzt";
      } else {
        tipp.textContent = jetzt < los ? `Zu Hause ca. ${heim}` : `Zur Haltestelle! · zu Hause ca. ${heim}`;
      }
    }
  } else if (jetzt < a.an) {
    // unterwegs zwischen Einstieg und Ausstieg
    zeigeZahl(a.an);
    const noch = Math.max(1, f.ai - pos.index);
    $("cd-text").textContent = `bis ${kurzName(a.name)} · noch ${noch} Halt${noch === 1 ? "" : "e"}`;
    haupt.classList.add("unterwegs");
    tipp.hidden = false; tipp.className = "tipp";
    tipp.textContent = zustand.richtung === "heim"
      ? `Unterwegs · zu Hause ca. ${uhr(a.an + (CFG.gehzeit + f.fussNach) * MIN)}`
      : `Unterwegs · Ankunft ${uhr(a.an)}${fussWeg}`;
  } else {
    $("cd-zahl").textContent = "✓"; $("cd-einheit").textContent = "";
    $("cd-text").textContent = `Angekommen in ${kurzName(a.name)}`;
  }

  kartenEbene.zeige(f, pos);
  zeichneHaltestellen(f, pos);
  zeichneStand();
}

/** Zeile mit dem Umsteigen bzw. Fussweg; bei direkten Fahrten ausgeblendet. */
function zeigeUmstieg(f) {
  const el = $("umstieg"), an = f.anschluss;
  const rc = CFG.richtungen[zustand.richtung];
  let text = "";
  if (an && an.seite === "vor") {
    text = `Umsteigen in ${kurzName(f.einstieg.name)}: Bus ${an.linie} ab ${kurzName(rc.von.name)} ${uhr(an.ab)}, ` +
           `an ${uhr(an.an)} → Bus 612 ab ${uhr(f.einstieg.ab)}`;
  } else if (an && an.seite === "nach") {
    text = `Umsteigen in ${kurzName(f.ausstieg.name)}: an ${uhr(f.ausstieg.an)} → Bus ${an.linie} ab ${uhr(an.ab)}, ` +
           `an ${kurzName(rc.nach.name)} ${uhr(an.an)}`;
  } else if (f.fussVor) {
    text = `Der 612 fährt erst ab ${kurzName(f.einstieg.name)}: ${f.fussVor} Min. zu Fuss dorthin`;
  } else if (f.fussNach) {
    text = `Der 612 fährt nur bis ${kurzName(f.ausstieg.name)}: dann ${f.fussNach} Min. zu Fuss`;
  }
  el.hidden = !text;
  if (el.textContent !== text) el.textContent = text;
}

function zeigeZahl(ziel) {
  const ms = ziel - jetztMs();
  if (ms < MIN) { $("cd-zahl").textContent = "jetzt"; $("cd-einheit").textContent = ""; return; }
  const m = Math.ceil(ms / MIN);
  if (m >= 120) { $("cd-zahl").textContent = uhr(ziel); $("cd-einheit").textContent = ""; return; }
  $("cd-zahl").textContent = String(m);
  $("cd-einheit").textContent = "Min.";
}

function anfahrtText(f, pos) {
  const halte = f.ei - pos.index;     // Halte bis zum Einstieg (inkl. Einstieg)
  if (pos.zustand === "start") {
    return f.mitAnfahrt ? `Bus startet ${uhr(f.stops[0].ab)} in ${kurzName(f.stops[0].name)}`
                        : `bis der Bus in ${kurzName(f.einstieg.name)} abfährt`;
  }
  if (pos.zustand === "halt" && pos.index === f.ei) return `Bus steht in ${kurzName(f.einstieg.name)}`;
  if (pos.zustand === "fahrt" && halte <= 1) return "Bus kommt gleich!";
  const wo = pos.zustand === "fahrt" ? "nach" : "in";
  return `Bus ${wo} ${kurzName(f.stops[pos.index].name)} · noch ${halte} Halt${halte === 1 ? "" : "e"}`;
}

function zeichneAuswahl(aktiv, jetzt) {
  const box = $("fahrten");
  const teile = Logik.auswahl(zustand.fahrten, jetzt, 4).map(f => {
    const v = f.echtzeit && f.einstieg.verspaetung > 0 ? ` <em>+${f.einstieg.verspaetung}</em>` : "";
    const vor = f.anschluss && f.anschluss.seite === "vor" ? f.anschluss : null;
    const weg = jetzt >= f.einstieg.ab ? `<small>unterwegs</small>`
              : Logik.istDirekt(f) ? `<small>direkt</small>` : `<small class="um">umsteigen</small>`;
    // Abfahrt am eigenen Halt: bei Umsteigen die des Anschlussbusses
    return { key: f.key, aktiv: !!aktiv && f.key === aktiv.key, html: `${uhr(vor ? vor.abPlan : f.einstieg.abPlan)}${v}${weg}` };
  });
  // nur neu bauen, wenn sich etwas aendert (sonst geht ein Antippen verloren)
  const signatur = JSON.stringify(teile);
  if (box.dataset.signatur === signatur) return;
  box.dataset.signatur = signatur;
  box.innerHTML = "";
  for (const t of teile) {
    const b = document.createElement("button");
    b.className = "fahrt" + (t.aktiv ? " aktiv" : "");
    b.setAttribute("role", "option");
    b.setAttribute("aria-selected", t.aktiv);
    b.innerHTML = t.html;
    b.onclick = () => { zustand.gewaehlt = t.key; zustand.folgen = true; kartenEbene.leeren(); zeichne(); };
    box.appendChild(b);
  }
}

function zeichneHaltestellen(f, pos) {
  const ol = $("haltestellen");
  const zeilen = f.stops.slice(0, f.ai + 1).map((s, i) => {
    const vorbei = i < pos.index || (i === pos.index && pos.zustand !== "start" && pos.zustand !== "halt") ||
                   pos.zustand === "ende";
    const klasse = [vorbei ? "vorbei" : "", i === f.ei || i === f.ai ? "meine" : "",
                    i === pos.index && pos.zustand !== "ende" ? "hier" : ""].join(" ");
    const zeit = i === 0 ? s.ab : s.an;
    const plan = i === 0 ? s.abPlan : s.anPlan;
    const sp = f.echtzeit && zeit !== plan ? ` <em>${uhr(zeit)}</em>` : "";
    return `<li class="${klasse}"><span class="t">${uhr(plan)}${sp}</span><span class="n">${esc(s.name)}</span></li>`;
  }).join("");
  // Die Liste aendert sich nur bei jedem Halt; nicht jede Sekunde 18 Elemente neu bauen
  if (ol.dataset.signatur === zeilen) return;
  ol.dataset.signatur = zeilen;
  ol.innerHTML = zeilen;
  $("haltestellen-titel").textContent = `Haltestellen (${f.ai - (f.mitAnfahrt ? 0 : f.ei) + 1})`;
}

function zeichneStand() {
  const el = $("stand");
  if (!zustand.stand) { el.textContent = zustand.fehler ? "Keine Verbindung" : "–"; return; }
  const s = Math.round((Date.now() - zustand.stand) / 1000);
  const alt = s < 60 ? `vor ${s} s` : `vor ${Math.round(s / 60)} Min.`;
  el.textContent = zustand.fehler ? `Keine Verbindung · Stand ${alt}` : `Aktualisiert ${alt}`;
  el.className = zustand.fehler ? "fehler" : "";
}

// ---- Karte ---------------------------------------------------------------------------

const kartenEbene = (() => {
  const karte = L.map("karte", { zoomControl: false, attributionControl: false })
    .setView([47.287, 7.86], 13);
  L.tileLayer("https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg",
    { maxNativeZoom: 18, maxZoom: 19, minZoom: 10 }).addTo(karte);

  const gruppe = L.layerGroup().addTo(karte);
  // Eigener Standort: eigene Ebene, bleibt beim Umschalten der Fahrt stehen
  const ichKreis = L.circle([0, 0], { radius: 0, className: "ich-genau", interactive: false });
  const ichPunkt = L.marker([0, 0], { interactive: false, zIndexOffset: 500,
    icon: L.divIcon({ className: "ich-marker", html: "<div></div>", iconSize: [22, 22], iconAnchor: [11, 11] }) });
  let busMarker = null, gezeichnetFuer = null, zuletztEingepasst = 0;

  const busIcon = echtzeit => L.divIcon({
    className: "bus-marker" + (echtzeit ? " live" : ""),
    html: `<div class="puls"></div><div class="bus"><svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M5 4.5C5 3 6.5 2 12 2s7 1 7 2.5V17a1 1 0 0 1-1 1v1.5a1 1 0 0 1-2 0V18H8v1.5a1 1 0 0 1-2 0V18a1 1 0 0 1-1-1V4.5ZM7 6v5h10V6H7Zm1 7.3a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Zm8 0a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z"/></svg></div>`,
    iconSize: [40, 40], iconAnchor: [20, 20],
  });

  function linieFuer(f, von, bis) {
    const pts = [];
    for (let i = von; i < bis; i++) {
      const stueck = Logik.teilstueck(STRECKE, f.stops[i], f.stops[i + 1]);
      pts.push(...(pts.length ? stueck.slice(1) : stueck));
    }
    return pts;
  }

  function zeichneStrecke(f) {
    gruppe.clearLayers();
    if (f.ei > 0) L.polyline(linieFuer(f, 0, f.ei), { className: "linie-anfahrt", weight: 5 }).addTo(gruppe);
    L.polyline(linieFuer(f, f.ei, f.ai), { className: "linie-fahrt", weight: 7 }).addTo(gruppe);
    f.stops.forEach((s, i) => {
      if (i > f.ai) return;
      const meine = i === f.ei || i === f.ai;
      L.circleMarker([s.lat, s.lon], {
        radius: meine ? 8 : 4, weight: meine ? 3 : 2,
        className: meine ? "halt-meine" : "halt",
      }).bindTooltip(meine ? `<b>${esc(s.name)}</b>` : esc(s.name), { permanent: meine, direction: "right", offset: [8, 0],
                                                         className: "halt-name" })
        .addTo(gruppe);
    });
    busMarker = L.marker([f.stops[0].lat, f.stops[0].lon], { icon: busIcon(f.echtzeit), zIndexOffset: 1000 }).addTo(gruppe);
    gezeichnetFuer = `${f.key}|${f.echtzeit}`;
  }

  // Sobald das Kind selbst schiebt oder zoomt, folgt die Karte nicht mehr
  const selbst = () => { zustand.folgen = false; $("btn-folgen").setAttribute("aria-pressed", "false"); };
  for (const ev of ["touchstart", "mousedown", "wheel"]) karte.getContainer().addEventListener(ev, selbst, { passive: true });

  return {
    karte,
    leeren() { gruppe.clearLayers(); gezeichnetFuer = null; busMarker = null; },
    ich(o) {
      if (!karte.hasLayer(ichPunkt)) { ichKreis.addTo(karte); ichPunkt.addTo(karte); }
      ichPunkt.setLatLng([o.lat, o.lon]);
      ichKreis.setLatLng([o.lat, o.lon]).setRadius(o.genau < 300 ? o.genau : 0);
    },
    zeige(f, pos) {
      if (gezeichnetFuer !== `${f.key}|${f.echtzeit}`) { zeichneStrecke(f); zuletztEingepasst = 0; }
      busMarker.setLatLng([pos.lat, pos.lon]);
      // Bus und Einstieg im Bild, solange er noch kommt, danach Bus und Ziel
      if (zustand.folgen && jetztMs() - zuletztEingepasst > 8000) {
        zuletztEingepasst = jetztMs();
        const vorher = jetztMs() < f.einstieg.ab;
        const ziel = vorher ? f.einstieg : f.ausstieg;
        let b = L.latLngBounds([[pos.lat, pos.lon], [ziel.lat, ziel.lon]]);
        if (b.getNorthEast().distanceTo(b.getSouthWest()) < 800) {
          // Bus steht (fast) an der Haltestelle: vorher die ganze Fahrt, am Schluss das Ziel zeigen
          b = vorher ? L.latLngBounds(linieFuer(f, f.ei, f.ai)) : b.pad(1.5);
        }
        // Solange der Bus noch kommt: auch sich selbst zeigen, wenn man in der Naehe des Einstiegs ist
        const o = zustand.ort;
        if (vorher && o && Date.now() - o.wann < 5 * MIN &&
            L.latLng(o.lat, o.lon).distanceTo([f.einstieg.lat, f.einstieg.lon]) < 3000) b.extend([o.lat, o.lon]);
        karte.fitBounds(b, { padding: [40, 40], maxZoom: 15, animate: true });
      }
    },
  };
})();

// ---- Eigener Standort -------------------------------------------------------------------
// Nur auf dem Geraet: wird weder gespeichert noch irgendwohin geschickt.

const standort = (() => {
  let wache = null;

  function neu(o) {
    zustand.ort = { lat: o.lat, lon: o.lon, genau: o.genau, wann: Date.now() };
    kartenEbene.ich(zustand.ort);
    // Nur direkt nach dem Oeffnen die Richtung waehlen, nicht unterwegs umschalten
    if (zustand.ortEntscheidet && o.genau < 1000) {
      zustand.ortEntscheidet = false;
      const r = eigeneWahl() || richtungNachOrt();
      if (r && r !== zustand.richtung) setzeRichtung(r, false);
    }
  }

  return {
    start() {
      if (ORT_FEST) { neu(ORT_FEST); return; }
      if (wache !== null || !("geolocation" in navigator)) return;
      wache = navigator.geolocation.watchPosition(
        p => neu({ lat: p.coords.latitude, lon: p.coords.longitude, genau: p.coords.accuracy }),
        e => { console.info("Standort nicht verfügbar", e.message); if (e.code === 1) standort.stopp(); },
        { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 });
    },
    stopp() {
      if (wache !== null) navigator.geolocation.clearWatch(wache);
      wache = null;
    },
  };
})();

// ---- Start ---------------------------------------------------------------------------

$("btn-schule").onclick = () => setzeRichtung("schule", true);
$("btn-heim").onclick = () => setzeRichtung("heim", true);
$("btn-folgen").onclick = () => {
  zustand.folgen = true; $("btn-folgen").setAttribute("aria-pressed", "true");
  kartenEbene.leeren(); zeichne();
};
$("hauptkarte").onclick = () => aktualisiere();

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    zustand.ortEntscheidet = true;      // wie ein Neustart: der naechste Standort darf waehlen
    standort.start();
    const r = richtungNachZeit();
    if (r !== zustand.richtung) setzeRichtung(r, false); else aktualisiere();
  } else {
    standort.stopp();                   // im Hintergrund kein GPS (Akku)
  }
});

// Ein Fehler beim Zeichnen darf die Uhr nicht anhalten; nur einmal melden statt jede Sekunde
let zeichenFehlerGemeldet = false;
setInterval(() => {
  if (document.hidden) return;
  try { zeichne(); } catch (e) {
    if (!zeichenFehlerGemeldet) { console.error("Zeichnen fehlgeschlagen", e); zeichenFehlerGemeldet = true; }
  }
}, 1000);
setzeRichtung(richtungNachZeit(), false);
standort.start();

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
