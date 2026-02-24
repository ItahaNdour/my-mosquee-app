/* =========================
FILE: app.js
========================= */

const SUPER_ADMIN_PIN = "9999";

/**
 * Ramadan:
 * - Tu peux changer l'année ici. (Tu m'avais dit: “Ramadan a commencé le 18 février”)
 * - Mets la vraie date ISO du début pour l’année en cours.
 */
const RAMADAN_START_ISO = "2026-02-18";
const RAMADAN_TOTAL_DAYS = 30;

const KAABA = { lat: 21.4225, lon: 39.8262 };

const CITY_COORDS = {
  Medina: { lat: 14.673, lon: -17.447 },
  Dakar: { lat: 14.7167, lon: -17.4677 },
  Pikine: { lat: 14.75, lon: -17.37 },
  Guédiawaye: { lat: 14.7833, lon: -17.4167 },
  Rufisque: { lat: 14.7236, lon: -17.2658 },
  Thiaroye: { lat: 14.7431, lon: -17.3325 },
  Yoff: { lat: 14.767, lon: -17.47 },
  "Parcelles Assainies": { lat: 14.7398, lon: -17.447 },
  "M'bao": { lat: 14.72, lon: -17.26 },
};

const DEFAULT_MOSQUES = [
  {
    id: "bene-tally",
    name: "Bene Tally",
    city: "Medina",
    wave: "772682103",
    orange: "772682103",
    phone: "+221772682103",
    ann: "Bienvenue à Bene Tally.",
  },
];

const el = (id) => document.getElementById(id);

function showStatus(msg, bg = "#2f7d6d") {
  const s = el("status");
  s.textContent = msg;
  s.style.background = bg;
  s.style.display = "block";
  setTimeout(() => (s.style.display = "none"), 2800);
}

/* ---------------------------
   Local storage helpers
--------------------------- */
function lsGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}
function lsSet(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

/* ---------------------------
   Session (PIN)
--------------------------- */
function loadSession() {
  return lsGet("session", { role: "guest" });
}
function saveSession(s) {
  lsSet("session", s);
}
function clearSession() {
  localStorage.removeItem("session");
}

/* ---------------------------
   Mosques
--------------------------- */
function loadMosques() {
  let mosques = lsGet("mosques", null);
  if (!mosques || !mosques.length) {
    mosques = DEFAULT_MOSQUES;
    lsSet("mosques", mosques);
    localStorage.setItem("currentMosqueId", mosques[0].id);
  }
  return mosques;
}
function saveMosques(mosques) {
  lsSet("mosques", mosques);
}
function getCurrentMosqueId() {
  return localStorage.getItem("currentMosqueId") || loadMosques()[0].id;
}
function setCurrentMosqueId(id) {
  localStorage.setItem("currentMosqueId", id);
}
function getMosqueById(id) {
  return loadMosques().find((m) => m.id === id) || loadMosques()[0];
}

/* ---------------------------
   Impact (Super Admin only)
--------------------------- */
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
function impactKey(mosqueId) {
  return `impact_${mosqueId}_${todayKey()}`;
}
function impactLoad(mosqueId) {
  return lsGet(impactKey(mosqueId), {
    visits: 0,
    donClicks: 0,
    claims: 0,
    ann: 0,
    share: 0,
    qibla: 0,
  });
}
function impactSave(mosqueId, o) {
  lsSet(impactKey(mosqueId), o);
}
function impactInc(field) {
  const mosqueId = getCurrentMosqueId();
  const o = impactLoad(mosqueId);
  o[field] = (o[field] || 0) + 1;
  impactSave(mosqueId, o);
  renderImpactIfSuper();
}
function impactVisitOnce() {
  const mosqueId = getCurrentMosqueId();
  const flag = `visit_${mosqueId}_${todayKey()}`;
  if (sessionStorage.getItem(flag)) return;
  sessionStorage.setItem(flag, "1");
  impactInc("visits");
}
function renderImpactIfSuper() {
  const s = loadSession();
  const panel = el("impact-admin");
  if (s.role !== "super_admin") {
    panel.style.display = "none";
    return;
  }
  panel.style.display = "block";
  const mosqueId = getCurrentMosqueId();
  const o = impactLoad(mosqueId);
  el("stat-visits").textContent = o.visits;
  el("stat-don-clicks").textContent = o.donClicks;
  el("stat-claims").textContent = o.claims;
  el("stat-ann").textContent = o.ann;
  el("stat-share").textContent = o.share;
  el("stat-qibla").textContent = o.qibla;
}

/* ---------------------------
   Donations (local)
--------------------------- */
function donListKey(mosqueId) {
  return `donlist_${mosqueId}_${todayKey()}`;
}
function loadDonList(mosqueId) {
  return lsGet(donListKey(mosqueId), []);
}
function saveDonList(mosqueId, list) {
  lsSet(donListKey(mosqueId), list);
}
function addDonation({ amount, method, ref, who, source }) {
  const mosqueId = getCurrentMosqueId();
  const list = loadDonList(mosqueId);
  list.unshift({
    id: Date.now().toString(36),
    ts: new Date().toISOString(),
    amount,
    method,
    ref,
    who: who || "",
    source: source || "manual",
    status: "pending",
  });
  saveDonList(mosqueId, list);
  renderDonTable();
}
function setDonationStatus(id, status) {
  const mosqueId = getCurrentMosqueId();
  const list = loadDonList(mosqueId);
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return;
  list[i].status = status;
  saveDonList(mosqueId, list);
  renderDonTable();
}
function badgeHtml(status) {
  if (status === "ok") return `<span class="badge b-ok">Confirmé</span>`;
  if (status === "no") return `<span class="badge b-no">Annulé</span>`;
  return `<span class="badge b-p">En attente</span>`;
}
function renderDonTable() {
  const s = loadSession();
  const admin = el("don-admin");
  admin.style.display = s.role === "guest" ? "none" : "block";
  el("don-role-pill").textContent = s.role === "super_admin" ? "Super Admin" : "Admin Mosquée";

  const mosqueId = getCurrentMosqueId();
  const list = loadDonList(mosqueId);

  const tb = el("don-table").querySelector("tbody");
  tb.innerHTML = "";

  list.forEach((d) => {
    const tr = document.createElement("tr");
    const time = new Date(d.ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

    tr.innerHTML = `
      <td>${time}</td>
      <td><strong>${Number(d.amount).toLocaleString("fr-FR")}</strong></td>
      <td>${escapeHtml(d.method)}</td>
      <td>${escapeHtml(d.ref || "")}</td>
      <td>${badgeHtml(d.status)}</td>
      <td style="white-space:nowrap">
        <button class="btn" data-ok="${d.id}" style="padding:6px 10px">OK</button>
        <button class="btn ghost" data-no="${d.id}" style="padding:6px 10px">X</button>
      </td>
    `;
    tb.appendChild(tr);
  });

  tb.querySelectorAll("button[data-ok]").forEach((b) => {
    b.onclick = () => setDonationStatus(b.dataset.ok, "ok");
  });
  tb.querySelectorAll("button[data-no]").forEach((b) => {
    b.onclick = () => setDonationStatus(b.dataset.no, "no");
  });
}

/* ---------------------------
   Ramadan module (inspiré)
--------------------------- */
function dayDiffUTC(a, b) {
  const ms = 24 * 60 * 60 * 1000;
  const A = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const B = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.floor((B - A) / ms);
}
function formatHM(hm) {
  if (!hm) return "--:--";
  const m = hm.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "--:--";
  return `${String(m[1]).padStart(2, "0")}:${m[2]}`;
}
function formatFastDuration(fajr, maghrib) {
  const f = parseHM(fajr);
  const m = parseHM(maghrib);
  if (!f || !m) return "—";
  const start = f.h * 60 + f.m;
  const end = m.h * 60 + m.m;
  let dur = end - start;
  if (dur < 0) dur += 24 * 60;
  const hh = Math.floor(dur / 60);
  const mm = dur % 60;
  return `${hh} heures ${mm} minutes`;
}
function parseHM(s) {
  const m = String(s || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return { h: parseInt(m[1], 10), m: parseInt(m[2], 10) };
}
function inRamadan(now) {
  const start = new Date(`${RAMADAN_START_ISO}T00:00:00Z`);
  const idx = dayDiffUTC(start, now) + 1;
  return { active: idx >= 1 && idx <= RAMADAN_TOTAL_DAYS, dayIndex: idx };
}

/* ---------------------------
   Time / header
--------------------------- */
const WEEKDAYS = ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];
const MONTHS = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

function updateClock() {
  const n = new Date();
  el("current-time").textContent =
    `${String(n.getHours()).padStart(2,"0")}:${String(n.getMinutes()).padStart(2,"0")}:${String(n.getSeconds()).padStart(2,"0")}`;
  el("greg-line").textContent = `${WEEKDAYS[n.getDay()]} ${n.getDate()} ${MONTHS[n.getMonth()]}`;
}

/* ---------------------------
   Aladhan timings: today + tomorrow
--------------------------- */
function buildAladhanUrl(dateISO, lat, lon) {
  // dateISO format: YYYY-MM-DD
  // Using /timings/{date} for reliable tomorrow.
  return `https://api.aladhan.com/v1/timings/${dateISO}?latitude=${lat}&longitude=${lon}&method=3&school=0`;
}

async function fetchTimingsFor(dateISO, lat, lon) {
  const cacheKey = `timings_${lat}_${lon}_${dateISO}`;
  const cached = lsGet(cacheKey, null);
  if (cached) return cached;

  const url = buildAladhanUrl(dateISO, lat, lon);
  const r = await fetch(url);
  const j = await r.json();
  if (!j || !j.data) throw new Error("timings_failed");
  lsSet(cacheKey, j.data);
  return j.data;
}

let todayData = null;
let tomorrowData = null;

async function refreshTimingsBundle() {
  const mosque = getMosqueById(getCurrentMosqueId());
  el("mosque-name").textContent = mosque.name;
  el("city-pill").textContent = mosque.city;
  el("ram-loc").textContent = `${mosque.city}, Sénégal`;
  el("wave-number").textContent = mosque.wave || "—";
  el("orange-number").textContent = mosque.orange || "—";
  el("ann-body").textContent = mosque.ann || "Aucune annonce.";

  const coords = CITY_COORDS[mosque.city] || CITY_COORDS.Medina;

  const now = new Date();
  const todayISO = now.toISOString().slice(0, 10);
  const tom = new Date(now);
  tom.setDate(now.getDate() + 1);
  const tomISO = tom.toISOString().slice(0, 10);

  try {
    const [t1, t2] = await Promise.all([
      fetchTimingsFor(todayISO, coords.lat, coords.lon),
      fetchTimingsFor(tomISO, coords.lat, coords.lon),
    ]);
    todayData = t1;
    tomorrowData = t2;
    renderDates();
    renderRamadan();
    renderNextPrayer();
  } catch {
    showStatus("Impossible de charger les horaires (réseau).", "#e11d48");
  }
}

function renderDates() {
  if (!todayData?.date?.hijri) {
    el("hijri-line").textContent = "—";
    return;
  }
  const h = todayData.date.hijri;
  el("hijri-line").textContent = `${h.day} ${h.month?.ar || ""} ${h.year} AH`.trim();
}

function renderRamadan() {
  const now = new Date();
  const st = inRamadan(now);
  const card = el("ramadan-card");
  if (!st.active) {
    card.style.display = "none";
    return;
  }
  card.style.display = "block";

  const day = st.dayIndex;
  el("ram-day").textContent = `Jour ${day}/${RAMADAN_TOTAL_DAYS}`;
  el("ram-sub").textContent = `${day} Ramadan • ${WEEKDAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}`;

  const fajr = todayData?.timings?.Fajr;
  const maghrib = todayData?.timings?.Maghrib;
  el("ram-suhoor").textContent = formatHM(fajr);
  el("ram-iftar").textContent = formatHM(maghrib);
  el("ram-duration").textContent = `Durée du jeûne d’aujourd’hui: ${formatFastDuration(fajr, maghrib)}.`;

  const fajrT = tomorrowData?.timings?.Fajr;
  const magT = tomorrowData?.timings?.Maghrib;
  el("ram-suhoor-tom").textContent = formatHM(fajrT);
  el("ram-iftar-tom").textContent = formatHM(magT);
}

/* ---------------------------
   Next prayer countdown
--------------------------- */
const PRAYER_ORDER = ["Fajr","Dhuhr","Asr","Maghrib","Isha"];

function nextPrayerFromTimings(timings) {
  const now = new Date();
  for (const p of PRAYER_ORDER) {
    const hm = parseHM(timings?.[p]);
    if (!hm) continue;
    const d = new Date();
    d.setHours(hm.h, hm.m, 0, 0);
    if (now < d) return { name: p, at: d };
  }
  // else tomorrow Fajr
  const hm = parseHM(tomorrowData?.timings?.Fajr);
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hm?.h ?? 5, hm?.m ?? 45, 0, 0);
  return { name: "Fajr", at: d };
}

function fmtHMS(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
}

let nextTarget = null;

function renderNextPrayer() {
  if (!todayData?.timings) return;
  nextTarget = nextPrayerFromTimings(todayData.timings);
  el("next-prayer-name").textContent = nextTarget.name;
}

function tickCountdown() {
  if (!nextTarget) return;
  const ms = nextTarget.at - new Date();
  el("countdown").textContent = fmtHMS(ms);
}

/* ---------------------------
   Qibla (améliorée)
--------------------------- */
const normDeg = (d) => ((d % 360) + 360) % 360;
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

function computeBearing(fromLat, fromLon, toLat, toLon) {
  const φ1 = toRad(fromLat);
  const φ2 = toRad(toLat);
  const Δλ = toRad(toLon - fromLon);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return normDeg(toDeg(Math.atan2(y, x)));
}

function screenAngle() {
  try {
    if (screen.orientation && typeof screen.orientation.angle === "number") return screen.orientation.angle;
  } catch {}
  return typeof window.orientation === "number" ? window.orientation : 0;
}

let qiblaBearingDeg = null;
let currentHeadingDeg = null;
let qiblaActive = false;

function qiblaUpdateNeedle() {
  if (qiblaBearingDeg == null) return;
  const rot = currentHeadingDeg == null ? qiblaBearingDeg : normDeg(qiblaBearingDeg - currentHeadingDeg);
  el("needle").style.transform = `rotate(${rot}deg)`;
  el("qibla-bearing").textContent = `${Math.round(qiblaBearingDeg)}°`;
  el("qibla-heading").textContent = currentHeadingDeg == null ? "—°" : `${Math.round(normDeg(currentHeadingDeg))}°`;
}

function qiblaUpdateMapsLink(lat, lon) {
  const origin = `${lat},${lon}`;
  const dest = `${KAABA.lat},${KAABA.lon}`;
  el("qibla-maps").onclick = () => window.open(
    `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}`,
    "_blank"
  );
}

function qiblaFallbackCity() {
  const mosque = getMosqueById(getCurrentMosqueId());
  const base = CITY_COORDS[mosque.city] || CITY_COORDS.Medina;
  qiblaBearingDeg = computeBearing(base.lat, base.lon, KAABA.lat, KAABA.lon);
  qiblaUpdateMapsLink(base.lat, base.lon);
  qiblaUpdateNeedle();
  el("qibla-status").textContent = `Mode ville (${mosque.city}). Active GPS pour précision.`;
}

async function qiblaGeo() {
  if (!navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 30000 }
    );
  });
}

function qiblaGetHeading(ev) {
  if (typeof ev.webkitCompassHeading === "number") return ev.webkitCompassHeading;
  if (typeof ev.alpha === "number") return normDeg((360 - ev.alpha) + screenAngle());
  return null;
}

function onOrientation(ev) {
  const h = qiblaGetHeading(ev);
  if (h == null) return;
  currentHeadingDeg = h;
  qiblaUpdateNeedle();
}

async function startQibla() {
  if (qiblaActive) return;
  impactInc("qibla");

  qiblaFallbackCity();
  el("qibla-status").textContent = "GPS…";
  const geo = await qiblaGeo();
  if (geo) {
    qiblaBearingDeg = computeBearing(geo.lat, geo.lon, KAABA.lat, KAABA.lon);
    qiblaUpdateMapsLink(geo.lat, geo.lon);
    el("qibla-status").textContent = "GPS OK. Calibre en “8” si la boussole dérive.";
    qiblaUpdateNeedle();
  } else {
    el("qibla-status").textContent = "GPS refusé. Mode ville actif.";
  }

  const DOE = window.DeviceOrientationEvent;
  if (!DOE) {
    el("qibla-status").textContent += " (Boussole non supportée)";
    return;
  }

  if (typeof DOE.requestPermission === "function") {
    try {
      const res = await DOE.requestPermission();
      if (res !== "granted") return;
    } catch {
      return;
    }
  }

  window.addEventListener("deviceorientation", onOrientation, { passive: true });
  qiblaActive = true;
}

/* ---------------------------
   99 Names of Allah (restore)
--------------------------- */
const ALLAH_NAMES = [
  { ar:"ٱلرَّحْمَٰنُ", en:"Ar-Rahman", fr:"Le Tout Miséricordieux" },
  { ar:"ٱلرَّحِيمُ", en:"Ar-Rahim", fr:"Le Très Miséricordieux" },
  { ar:"ٱلْمَلِكُ", en:"Al-Malik", fr:"Le Souverain" },
  { ar:"ٱلْقُدُّوسُ", en:"Al-Quddus", fr:"Le Saint" },
  { ar:"ٱلسَّلَامُ", en:"As-Salam", fr:"La Paix" },
  { ar:"ٱلْمُؤْمِنُ", en:"Al-Mu'min", fr:"Le Fidèle" },
  { ar:"ٱلْمُهَيْمِنُ", en:"Al-Muhaymin", fr:"Le Protecteur" },
  { ar:"ٱلْعَزِيزُ", en:"Al-Aziz", fr:"Le Tout Puissant" },
  { ar:"ٱلْجَبَّارُ", en:"Al-Jabbar", fr:"Le Contraignant" },
  { ar:"ٱلْمُتَكَبِّرُ", en:"Al-Mutakabbir", fr:"L'Immense" },
  { ar:"ٱلْخَالِقُ", en:"Al-Khaliq", fr:"Le Créateur" },
  { ar:"ٱلْبَارِئُ", en:"Al-Bari'", fr:"Le Producteur" },
  { ar:"ٱلْمُصَوِّرُ", en:"Al-Musawwir", fr:"Le Formateur" },
  { ar:"ٱلْغَفَّارُ", en:"Al-Ghaffar", fr:"Le Grand Pardonneur" },
  { ar:"ٱلْقَهَّارُ", en:"Al-Qahhar", fr:"Le Dominateur" },
  { ar:"ٱلْوَهَّابُ", en:"Al-Wahhab", fr:"Le Donateur" },
  { ar:"ٱلرَّزَّاقُ", en:"Ar-Razzaq", fr:"Le Pourvoyeur" },
  { ar:"ٱلْفَتَّاحُ", en:"Al-Fattah", fr:"Le Grand Juge" },
  { ar:"ٱلْعَلِيمُ", en:"Al-Alim", fr:"L'Omniscient" },
  { ar:"ٱلْقَابِضُ", en:"Al-Qabid", fr:"Celui qui retient" },
  { ar:"ٱلْبَاسِطُ", en:"Al-Basit", fr:"Celui qui étend" },
  { ar:"ٱلْخَافِضُ", en:"Al-Khafid", fr:"Celui qui abaisse" },
  { ar:"ٱلرَّافِعُ", en:"Ar-Rafi'", fr:"Celui qui élève" },
  { ar:"ٱلْمُعِزُّ", en:"Al-Mu'izz", fr:"Celui qui donne la puissance" },
  { ar:"ٱلْمُذِلُّ", en:"Al-Muzill", fr:"Celui qui humilie" },
  { ar:"ٱلسَّمِيعُ", en:"As-Sami'", fr:"L'Audient" },
  { ar:"ٱلْبَصِيرُ", en:"Al-Basir", fr:"Le Clairvoyant" },
  { ar:"ٱلْحَكَمُ", en:"Al-Hakam", fr:"Le Juge" },
  { ar:"ٱلْعَدْلُ", en:"Al-Adl", fr:"Le Juste" },
  { ar:"ٱللَّطِيفُ", en:"Al-Latif", fr:"Le Subtil" },
  { ar:"ٱلْخَبِيرُ", en:"Al-Khabir", fr:"Le Bien Informé" },
  { ar:"ٱلْحَلِيمُ", en:"Al-Halim", fr:"Le Clément" },
  { ar:"ٱلْعَظِيمُ", en:"Al-Azim", fr:"L'Immense" },
  { ar:"ٱلْغَفُورُ", en:"Al-Ghafur", fr:"Le Pardonneur" },
  { ar:"ٱلشَّكُورُ", en:"Ash-Shakur", fr:"Le Reconnaissant" },
  { ar:"ٱلْعَلِيُّ", en:"Al-Ali", fr:"Le Très Haut" },
  { ar:"ٱلْكَبِيرُ", en:"Al-Kabir", fr:"Le Grand" },
  { ar:"ٱلْحَفِيظُ", en:"Al-Hafiz", fr:"Le Préservateur" },
  { ar:"ٱلْمُقِيتُ", en:"Al-Muqit", fr:"Le Nourricier" },
  { ar:"ٱلْحَسِيبُ", en:"Al-Hasib", fr:"Celui qui règle les comptes" },
  { ar:"ٱلْجَلِيلُ", en:"Al-Jalil", fr:"Le Majestueux" },
  { ar:"ٱلْكَرِيمُ", en:"Al-Karim", fr:"Le Généreux" },
  { ar:"ٱلرَّقِيبُ", en:"Ar-Raqib", fr:"L'Observateur" },
  { ar:"ٱلْمُجِيبُ", en:"Al-Mujib", fr:"Celui qui exauce" },
  { ar:"ٱلْوَاسِعُ", en:"Al-Wasi'", fr:"Le Vaste" },
  { ar:"ٱلْحَكِيمُ", en:"Al-Hakim", fr:"Le Sage" },
  { ar:"ٱلْوَدُودُ", en:"Al-Wadud", fr:"Le Bien Aimé" },
  { ar:"ٱلْمَجِيدُ", en:"Al-Majid", fr:"Le Glorieux" },
  { ar:"ٱلْبَاعِثُ", en:"Al-Ba'ith", fr:"Le Ressusciteur" },
  { ar:"ٱلشَّهِيدُ", en:"Ash-Shahid", fr:"Le Témoin" },
  { ar:"ٱلْحَقُّ", en:"Al-Haqq", fr:"La Vérité" },
  { ar:"ٱلْوَكِيلُ", en:"Al-Wakil", fr:"Le Gérant" },
  { ar:"ٱلْقَوِيُّ", en:"Al-Qawi", fr:"Le Fort" },
  { ar:"ٱلْمَتِينُ", en:"Al-Matin", fr:"L'Inébranlable" },
  { ar:"ٱلْوَلِيُّ", en:"Al-Wali", fr:"Le Protecteur" },
  { ar:"ٱلْحَمِيدُ", en:"Al-Hamid", fr:"Le Loué" },
  { ar:"ٱلْمُحْصِي", en:"Al-Muhsi", fr:"Celui qui tient compte de tout" },
  { ar:"ٱلْمُبْدِئُ", en:"Al-Mubdi'", fr:"L'Auteur" },
  { ar:"ٱلْمُعِيدُ", en:"Al-Mu'id", fr:"Celui qui ramène" },
  { ar:"ٱلْمُحْيِي", en:"Al-Muhyi", fr:"Celui qui donne la vie" },
  { ar:"ٱلْمُمِيتُ", en:"Al-Mumit", fr:"Celui qui donne la mort" },
  { ar:"ٱلْحَيُّ", en:"Al-Hayy", fr:"Le Vivant" },
  { ar:"ٱلْقَيُّومُ", en:"Al-Qayyum", fr:"L'Immuable" },
  { ar:"ٱلْوَاجِدُ", en:"Al-Wajid", fr:"Le Noble" },
  { ar:"ٱلْمُجِيدُ", en:"Al-Majid", fr:"Le Glorieux" },
  { ar:"ٱلْوَاحِدُ", en:"Al-Wahid", fr:"L'Unique" },
  { ar:"ٱلصَّمَدُ", en:"As-Samad", fr:"Le Seul à être imploré" },
  { ar:"ٱلْقَادِرُ", en:"Al-Qadir", fr:"Le Puissant" },
  { ar:"ٱلْمُقْتَدِرُ", en:"Al-Muqtadir", fr:"Le Très Puissant" },
  { ar:"ٱلْمُقَدِّمُ", en:"Al-Muqaddim", fr:"Celui qui avance" },
  { ar:"ٱلْمُؤَخِّرُ", en:"Al-Mu'akhkhir", fr:"Celui qui retarde" },
  { ar:"ٱلْأَوَّلُ", en:"Al-Awwal", fr:"Le Premier" },
  { ar:"ٱلْآخِرُ", en:"Al-Akhir", fr:"Le Dernier" },
  { ar:"ٱلظَّاهِرُ", en:"Az-Zahir", fr:"L'Apparent" },
  { ar:"ٱلْبَاطِنُ", en:"Al-Batin", fr:"Le Caché" },
  { ar:"ٱلْوَالِي", en:"Al-Wali", fr:"Le Maître" },
  { ar:"ٱلْمُتَعَالِي", en:"Al-Muta'ali", fr:"Le Sublime" },
  { ar:"ٱلْبَرُّ", en:"Al-Barr", fr:"Le Bienfaisant" },
  { ar:"ٱلتَّوَّابُ", en:"At-Tawwab", fr:"L'Accueillant au Repentir" },
  { ar:"ٱلْمُنْتَقِمُ", en:"Al-Muntaqim", fr:"Le Vengeur" },
  { ar:"ٱلْعَفُوُّ", en:"Al-'Afuww", fr:"Le Pardonneur" },
  { ar:"ٱلرَّءُوفُ", en:"Ar-Ra'uf", fr:"Le Plein de Compassion" },
  { ar:"مَٰلِكُ ٱلْمُلْكِ", en:"Malik-ul-Mulk", fr:"Le Possesseur du Royaume" },
  { ar:"ذُو ٱلْجَلَٰلِ وَٱلْإِكْرَامِ", en:"Dhul-Jalal wal-Ikram", fr:"Majesté et Générosité" },
  { ar:"ٱلْمُقْسِطُ", en:"Al-Muqsit", fr:"L'Équitable" },
  { ar:"ٱلْجَامِعُ", en:"Al-Jami'", fr:"Le Rassembleur" },
  { ar:"ٱلْغَنِيُّ", en:"Al-Ghani", fr:"Le Riche" },
  { ar:"ٱلْمُغْنِي", en:"Al-Mughni", fr:"Celui qui enrichit" },
  { ar:"ٱلْمَانِعُ", en:"Al-Mani'", fr:"Celui qui empêche" },
  { ar:"ٱلضَّارُّ", en:"Ad-Darr", fr:"Celui qui nuit" },
  { ar:"ٱلنَّافِعُ", en:"An-Nafi'", fr:"Celui qui est bénéfique" },
  { ar:"ٱلنُّورُ", en:"An-Nur", fr:"La Lumière" },
  { ar:"ٱلْهَادِي", en:"Al-Hadi", fr:"Le Guide" },
  { ar:"ٱلْبَدِيعُ", en:"Al-Badi'", fr:"L'Inventeur" },
  { ar:"ٱلْبَاقِي", en:"Al-Baqi", fr:"Le Permanent" },
  { ar:"ٱلْوَارِثُ", en:"Al-Warith", fr:"L'Héritier" },
  { ar:"ٱلرَّشِيدُ", en:"Ar-Rashid", fr:"Le Bien Guidé" },
  { ar:"ٱلصَّبُورُ", en:"As-Sabur", fr:"Le Patient" },
];

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

function renderNames(filter = "") {
  const q = filter.trim().toLowerCase();
  const list = el("names-list");
  list.innerHTML = "";

  const items = ALLAH_NAMES.map((n, idx) => ({ ...n, idx: idx + 1 }))
    .filter((n) => {
      if (!q) return true;
      return (
        n.fr.toLowerCase().includes(q) ||
        n.en.toLowerCase().includes(q) ||
        n.ar.includes(filter.trim())
      );
    });

  el("names-title").textContent = `Les 99 Noms d’Allah (${items.length}/${ALLAH_NAMES.length})`;

  items.forEach((n) => {
    const div = document.createElement("div");
    div.className = "name-item";
    div.innerHTML = `
      <div class="name-left">
        <div class="name-fr">${n.idx}. ${escapeHtml(n.fr)}</div>
        <div class="name-en">${escapeHtml(n.en)}</div>
      </div>
      <div class="name-ar">${escapeHtml(n.ar)}</div>
    `;
    list.appendChild(div);
  });
}

/* ---------------------------
   Modals
--------------------------- */
function openModal(id) {
  const m = el(id);
  m.style.display = "block";
  m.setAttribute("aria-hidden", "false");
}
function closeModal(id) {
  const m = el(id);
  m.style.display = "none";
  m.setAttribute("aria-hidden", "true");
}
function bindModals() {
  document.querySelectorAll("[data-close]").forEach((b) => {
    b.onclick = () => closeModal(b.dataset.close);
  });
  window.addEventListener("click", (e) => {
    if (e.target.classList && e.target.classList.contains("modal")) {
      closeModal(e.target.id);
    }
  });
}

/* ---------------------------
   WhatsApp quick actions
--------------------------- */
function openWhatsApp(phone, msg) {
  const p = String(phone || "").replace(/\s+/g, "");
  window.open(`https://wa.me/${encodeURIComponent(p)}?text=${encodeURIComponent(msg)}`, "_blank");
}

/* ---------------------------
   Login
--------------------------- */
function login() {
  openModal("modal-login");
  const s = loadSession();
  el("logout").style.display = s.role === "guest" ? "none" : "block";
}
function doLogin() {
  const role = el("login-role").value;
  const pin = String(el("login-pin").value || "").trim();

  if (!pin) return showStatus("PIN requis.", "#e11d48");

  if (role === "super_admin") {
    if (pin !== SUPER_ADMIN_PIN) return showStatus("PIN Super Admin incorrect.", "#e11d48");
    saveSession({ role: "super_admin" });
    closeModal("modal-login");
    showStatus("Super Admin connecté.");
    renderDonTable();
    renderImpactIfSuper();
    return;
  }

  // Admin mosquée: tu pourras remettre ton système multi-compte local plus tard
  saveSession({ role: "mosque_admin" });
  closeModal("modal-login");
  showStatus("Admin Mosquée connecté.");
  renderDonTable();
  renderImpactIfSuper();
}
function doLogout() {
  clearSession();
  closeModal("modal-login");
  showStatus("Déconnecté.");
  renderDonTable();
  renderImpactIfSuper();
}

/* ---------------------------
   Wire UI
--------------------------- */
function populateMosqueSelector() {
  const sel = el("mosque-selector");
  sel.innerHTML = "";
  loadMosques().forEach((m) => {
    const o = document.createElement("option");
    o.value = m.id;
    o.textContent = m.name;
    sel.appendChild(o);
  });
  sel.value = getCurrentMosqueId();
  sel.onchange = async (e) => {
    setCurrentMosqueId(e.target.value);
    impactVisitOnce();
    await refreshTimingsBundle();
    renderDonTable();
    renderImpactIfSuper();
    qiblaFallbackCity();
  };
}

/* ---------------------------
   Announce / Share / Names
--------------------------- */
function setupFooter() {
  el("names-btn").onclick = () => {
    renderNames("");
    el("names-search").value = "";
    openModal("modal-names");
  };

  el("names-search").oninput = (e) => renderNames(e.target.value);

  el("names-random").onclick = () => {
    const idx = Math.floor(Math.random() * ALLAH_NAMES.length);
    const pick = ALLAH_NAMES[idx];
    el("names-search").value = pick.fr;
    renderNames(pick.fr);
    showStatus(`Nom aléatoire: ${pick.fr}`, "#2f7d6d");
  };

  el("announce-btn").onclick = () => {
    impactInc("ann");
    openModal("modal-ann");
  };

  el("share-btn").onclick = () => {
    impactInc("share");
    const m = getMosqueById(getCurrentMosqueId());
    const text = `🕌 ${m.name} (${m.city})\n${el("greg-line").textContent}\n\nLien: ${location.href}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };
}

/* ---------------------------
   Donation buttons + claim
--------------------------- */
function setupDonButtons() {
  el("btn-wave").onclick = () => {
    impactInc("donClicks");
    const m = getMosqueById(getCurrentMosqueId());
    openWhatsApp(m.phone, `Salam 🙏\nJe souhaite faire un don via *Wave Money*.\nMosquée: ${m.name}\nNuméro Wave: ${m.wave}\nMontant: [à renseigner] CFA\nBarakAllahou fik.`);
  };
  el("btn-orange").onclick = () => {
    impactInc("donClicks");
    const m = getMosqueById(getCurrentMosqueId());
    openWhatsApp(m.phone, `Salam 🙏\nJe souhaite faire un don via *Orange Money*.\nMosquée: ${m.name}\nNuméro Orange: ${m.orange}\nMontant: [à renseigner] CFA\nBarakAllahou fik.`);
  };
  el("btn-claimed").onclick = () => openModal("modal-claim");

  el("claim-submit").onclick = () => {
    const amt = parseInt(el("claim-amt").value, 10) || 0;
    const method = el("claim-method").value;
    const ref = String(el("claim-ref").value || "").trim();
    const name = String(el("claim-name").value || "").trim();

    if (amt <= 0) return showStatus("Montant invalide.", "#e11d48");
    if ((method === "Wave" || method === "Orange") && ref.length < 4) {
      return showStatus("Référence obligatoire pour Wave/Orange.", "#e11d48");
    }

    addDonation({ amount: amt, method, ref, who: name, source: "user" });
    impactInc("claims");

    el("claim-amt").value = "";
    el("claim-ref").value = "";
    el("claim-name").value = "";

    closeModal("modal-claim");
    showStatus("Merci. Don déclaré (en attente de validation).");
  };

  el("don-add").onclick = () => {
    const s = loadSession();
    if (s.role === "guest") return showStatus("Connexion requise.", "#e11d48");

    const amt = parseInt(el("don-amt").value, 10) || 0;
    const method = el("don-method").value;
    const ref = String(el("don-ref").value || "").trim();

    if (amt <= 0) return showStatus("Montant invalide.", "#e11d48");
    if ((method === "Wave" || method === "Orange") && ref.length < 4) {
      return showStatus("Référence obligatoire pour Wave/Orange.", "#e11d48");
    }

    addDonation({ amount: amt, method, ref, who: "admin", source: "manual" });
    el("don-amt").value = "";
    el("don-ref").value = "";
    showStatus("Ajouté (en attente).");
  };
}

/* ---------------------------
   Impact reset
--------------------------- */
function setupImpact() {
  el("impact-reset").onclick = () => {
    const s = loadSession();
    if (s.role !== "super_admin") return;
    impactSave(getCurrentMosqueId(), {
      visits: 0,
      donClicks: 0,
      claims: 0,
      ann: 0,
      share: 0,
      qibla: 0,
    });
    renderImpactIfSuper();
    showStatus("Impact reset (aujourd’hui).", "#0ea5e9");
  };
}

/* ---------------------------
   Misc
--------------------------- */
function setupHeader() {
  el("login-button").onclick = login;
  el("login-submit").onclick = doLogin;
  el("logout").onclick = doLogout;
  el("back-btn").onclick = () => history.back();
}

/* ---------------------------
   Boot
--------------------------- */
async function setup() {
  loadMosques();
  populateMosqueSelector();
  bindModals();
  setupHeader();
  setupFooter();
  setupDonButtons();
  setupImpact();

  impactVisitOnce();
  updateClock();
  setInterval(updateClock, 1000);

  await refreshTimingsBundle();
  setInterval(tickCountdown, 1000);

  qiblaFallbackCity();
  el("qibla-start").onclick = startQibla;

  renderDonTable();
  renderImpactIfSuper();
}

document.addEventListener("DOMContentLoaded", setup);
