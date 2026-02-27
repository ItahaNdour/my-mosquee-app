/**
 * /app.js
 * MyMosque — Sénégal (mobile-first) + offline-friendly
 * - Horaires via GEO (Aladhan). Fallback ville mosquée si GPS refusé.
 * - Dons via Firestore: pending -> admin confirm -> total public.
 * - KPI via Firebase Analytics events.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAnalytics, logEvent, isSupported as analyticsSupported } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-analytics.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* =========================
   CONFIG
========================= */
const ADMIN_PASSWORD = "1234";
const SUPER_ADMIN_PASSWORD = "9999";
let SESSION_ROLE = "guest"; // guest | admin | super

const PRAYER_NAMES = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
const DISPLAY = {
  Fajr: { local: "Souba", ar: "Fajr" },
  Dhuhr: { local: "Tisbar", ar: "Dhuhr" },
  Asr: { local: "Takusan", ar: "Asr" },
  Maghrib: { local: "Timis", ar: "Maghrib" },
  Isha: { local: "Guéwé", ar: "Isha" },
};

const WEEKDAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

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

// Ramadan
const RAMADAN_START_DATE = "2026-02-18";
const RAMADAN_TOTAL_DAYS = 30;

// Dons
const DON_CATEGORIES = ["Zakat", "Sadaqa", "Travaux"];
const DON_CATEGORY_HELP = {
  Zakat: "Zakat : obligation (selon conditions).",
  Sadaqa: "Sadaqa : don libre, pour l’entraide.",
  Travaux: "Travaux : entretien, rénovation, équipement.",
};

const MOCK = { Fajr: "05:45", Sunrise: "07:00", Dhuhr: "13:30", Asr: "16:45", Maghrib: "19:05", Isha: "20:30" };

/* =========================
   FIREBASE
========================= */
const firebaseConfig = {
  apiKey: "AIzaSyCUOJaDJUo37WeFh61DAFHFN3ON6evAAsQ",
  authDomain: "mymosquee-web.firebaseapp.com",
  projectId: "mymosquee-web",
  storageBucket: "mymosquee-web.firebasestorage.app",
  messagingSenderId: "129580574505",
  appId: "1:129580574505:web:4faeac48094084fe3ab938",
  measurementId: "G-PFWSE9H8D5",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let analytics = null;
(async () => {
  try {
    if (await analyticsSupported()) analytics = getAnalytics(app);
  } catch {}
})();

function track(name, params = {}) {
  try {
    if (analytics) logEvent(analytics, name, params);
  } catch {}
}

/* =========================
   HELPERS
========================= */
const el = (id) => document.getElementById(id);

function showStatus(msg, bg = "#2f7d6d") {
  const node = el("status");
  if (!node) return;
  node.textContent = msg;
  node.style.background = bg;
  node.style.display = "block";
  setTimeout(() => { node.style.display = "none"; }, 2500);
}

function fmt(ms) {
  if (ms < 0) return "00:00:00";
  const t = Math.floor(ms / 1000);
  const h = Math.floor(t / 3600) % 24;
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

function parseHM(s) {
  const [h, m] = String(s || "").split(":").map((x) => parseInt(x, 10));
  return { h: Number.isFinite(h) ? h : 0, m: Number.isFinite(m) ? m : 0 };
}

function buildTuneParam(offsets) {
  const a = offsets && offsets.length === 6 ? offsets : [0, 0, 0, 0, 0, 0];
  return a.join(",");
}

function normalizeCategory(cat) {
  const c = String(cat || "").trim();
  if (c === "Travaux / Entretien") return "Travaux";
  return DON_CATEGORIES.includes(c) ? c : "Sadaqa";
}

function ddmmyy(iso) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

function ymKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getUrlMosqueId() {
  const u = new URL(window.location.href);
  const m = (u.searchParams.get("m") || "").trim();
  return m || null;
}

/* =========================
   THEME
========================= */
function applyTheme(theme) {
  document.body.classList.toggle("dark", theme === "dark");
  localStorage.setItem("theme", theme);
  const icon = el("theme-toggle")?.querySelector("i");
  if (icon) icon.className = theme === "dark" ? "fa-solid fa-sun" : "fa-solid fa-moon";
}

function initTheme() {
  const saved = localStorage.getItem("theme") || "light";
  applyTheme(saved);
  el("theme-toggle").onclick = () => {
    const cur = document.body.classList.contains("dark") ? "dark" : "light";
    applyTheme(cur === "dark" ? "light" : "dark");
  };
}

/* =========================
   MODALS + POPUP
========================= */
function openModal(id) { el(id).style.display = "block"; }
function closeAll() { document.querySelectorAll(".modal").forEach((m) => { m.style.display = "none"; }); }

function bindModals() {
  document.querySelectorAll(".modal .close").forEach((x) => x.addEventListener("click", closeAll));
  window.addEventListener("click", (e) => {
    if (e.target && e.target.classList && e.target.classList.contains("modal")) closeAll();
  });
  const ok = el("popup-ok");
  if (ok) ok.onclick = () => closeAll();
}

let popupTimer = null;
function showPopup(title, msg) {
  const t = el("popup-title");
  const p = el("popup-text");
  if (t) t.textContent = title;
  if (p) p.textContent = msg;
  openModal("modal-popup");
  if (popupTimer) clearTimeout(popupTimer);
  popupTimer = setTimeout(() => closeAll(), 10000);
}

/* =========================
   DATA: MOSQUES (Firestore)
========================= */
const DEFAULT_MOSQUES = [
  { id: "bene-tally", name: "Bene Tally", city: "Medina", wave: "772682103", orange: "772682103", contact: "Imam Diallo", phone: "+221772682103", jumua: "13:30", ann: "Bienvenue à Bene Tally.", events: [{ title: "Cours de Fiqh", date: "Mardi après Isha" }], method: 3, school: 0, offsets: [0,0,0,0,0,0], goalMonth: 1000000 },
  { id: "medina-centre", name: "Medina Centre", city: "Dakar", wave: "770000000", orange: "780000000", contact: "Imam Ndiaye", phone: "+221780000000", jumua: "14:00", ann: "Annonce importante pour la Medina.", events: [{ title: "Cercle de Coran", date: "Samedi après Fajr" }], method: 3, school: 0, offsets: [0,0,0,0,0,0], goalMonth: 1000000 },
];

async function ensureMosquesSeed() {
  const snap = await getDocs(collection(db, "mosques"));
  if (!snap.empty) return;

  for (const m of DEFAULT_MOSQUES) {
    await setDoc(doc(db, "mosques", m.id), {
      name: m.name, city: m.city,
      wave: m.wave, orange: m.orange,
      contact: m.contact, phone: m.phone,
      jumua: m.jumua, ann: m.ann,
      events: m.events,
      method: m.method, school: m.school, offsets: m.offsets,
      goalMonth: m.goalMonth,
      createdAt: serverTimestamp(),
    });
  }
}

async function listMosques() {
  const snap = await getDocs(collection(db, "mosques"));
  const arr = [];
  snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
  arr.sort((a,b) => String(a.name||"").localeCompare(String(b.name||"")));
  return arr;
}

function getCurrentMosqueId() {
  const forced = getUrlMosqueId();
  const stored = localStorage.getItem("currentMosqueId");
  return forced || stored || "bene-tally";
}

function setCurrentMosqueId(id) {
  localStorage.setItem("currentMosqueId", id);
}

let currentMosque = null;

/* =========================
   CLOCK + DATES
========================= */
function updateClock() {
  const n = new Date();
  el("current-time").textContent = [n.getHours(), n.getMinutes(), n.getSeconds()].map((v) => String(v).padStart(2, "0")).join(":");
  el("gregorian-date").textContent = `${WEEKDAYS[n.getDay()]} ${n.getDate()} ${MONTHS[n.getMonth()]} ${n.getFullYear()}`;
}

/* =========================
   PRAYER TIMES (GEO first)
========================= */
let timingsData = null;
let lastAlertShown = "";
let playedFor = "";

function playBeep(duration = 650, freq = 740) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    o.connect(g);
    g.connect(ctx.destination);
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    o.start();
    setTimeout(() => {
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05);
      o.stop();
      ctx.close();
    }, duration);
  } catch {}
}

function playChime() {
  playBeep(650, 740);
  if (navigator.vibrate) navigator.vibrate(150);
}

function updateNextCountdown() {
  if (!timingsData) {
    el("next-prayer-name").textContent = "—";
    el("countdown").textContent = "--:--:--";
    return;
  }

  const now = new Date();
  document.querySelectorAll(".list .row").forEach((r) => r.classList.remove("current"));

  const p = {};
  PRAYER_NAMES.forEach((k) => {
    const parts = String(timingsData[k] || "").split(":");
    if (parts.length >= 2) {
      const d = new Date();
      d.setHours(Number(parts[0]), Number(parts[1]), 0, 0);
      p[k] = d;
    }
  });

  // Jumua override Friday
  if (now.getDay() === 5 && currentMosque?.jumua) {
    const hm = parseHM(currentMosque.jumua || "13:30");
    const d = new Date();
    d.setHours(hm.h, hm.m, 0, 0);
    p.Dhuhr = d;
  }

  let name = "";
  let time = null;

  for (const k of PRAYER_NAMES) {
    const d = p[k];
    if (d && now < d) { name = k; time = d; break; }
  }

  if (!name) {
    name = "Fajr";
    const t = String(timingsData.Fajr || "05:45").split(":").map(Number);
    time = new Date();
    time.setDate(time.getDate() + 1);
    time.setHours(t[0] || 5, t[1] || 45, 0, 0);
  }

  el("next-prayer-name").textContent = `${DISPLAY[name].local.toUpperCase()} (${DISPLAY[name].ar})`;
  el("countdown").textContent = fmt(time - now);

  const item = el(`${name.toLowerCase()}-item`);
  if (item) item.classList.add("current");

  const delta = time - now;
  const five = 5 * 60 * 1000;

  if (delta > 0 && delta <= five && lastAlertShown !== name) {
    playChime();
    lastAlertShown = name;
    showStatus(`Dans 5 min : ${DISPLAY[name].local}.`, "#1f5e53");
  }

  if (delta > 1500 && name === playedFor) playedFor = "";
}

function formatFastingDurationShort(fajr, maghrib) {
  if (!fajr || !maghrib) return "—";
  const f = parseHM(fajr);
  const m = parseHM(maghrib);
  const start = f.h * 60 + f.m;
  const end = m.h * 60 + m.m;
  let dur = end - start;
  if (dur < 0) dur += 24 * 60;
  const hh = Math.floor(dur / 60);
  const mm = dur % 60;
  return `${hh}h ${String(mm).padStart(2, "0")}m`;
}

function renderRamadan() {
  const card = el("ramadan-card");
  if (!card) return;

  const start = new Date(`${RAMADAN_START_DATE}T00:00:00`);
  const now = new Date();
  const msDay = 24 * 60 * 60 * 1000;
  const dayIndex = Math.floor((now - start) / msDay) + 1;

  if (dayIndex < 1 || dayIndex > RAMADAN_TOTAL_DAYS) {
    card.style.display = "none";
    return;
  }

  const left = RAMADAN_TOTAL_DAYS - dayIndex;
  el("ramadan-sub").textContent = `${dayIndex} Ramadan • ${WEEKDAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}`;
  el("ramadan-day").textContent = `Jour ${dayIndex}/${RAMADAN_TOTAL_DAYS}`;
  el("ramadan-left").textContent = left === 0 ? "Dernier jour" : `${left} j restants`;

  const iftar = (timingsData && timingsData.Maghrib) ? timingsData.Maghrib : "--:--";
  const suhoor = (timingsData && timingsData.Fajr) ? timingsData.Fajr : "--:--";
  el("ramadan-iftar").textContent = iftar;
  el("ramadan-suhoor").textContent = suhoor;

  const durEl = el("ramadan-duration");
  if (durEl) durEl.textContent = `Durée du jeûne: ${formatFastingDurationShort(suhoor, iftar)}`;

  card.style.display = "block";
}

async function getGeoOnce() {
  if (!navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 }
    );
  });
}

async function fetchTimingsFor(lat, lon) {
  const method = Number(currentMosque?.method ?? 3);
  const school = Number(currentMosque?.school ?? 0);
  const tune = buildTuneParam(currentMosque?.offsets || [0,0,0,0,0,0]);

  // Aladhan (timings)
  const url = `https://api.aladhan.com/v1/timings?latitude=${lat}&longitude=${lon}&method=${method}&school=${school}&tune=${tune}`;

  const cacheKey = `cache_timings_${currentMosque.id}_${new Date().toDateString()}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      displayAll(JSON.parse(cached), true);
    } catch {}
  }

  try {
    const r = await fetch(url);
    const j = await r.json();
    if (j && j.data) {
      localStorage.setItem(cacheKey, JSON.stringify(j.data));
      displayAll(j.data, false);
      return;
    }
    throw new Error("bad_response");
  } catch {
    if (!cached) {
      displayAll({ timings: MOCK, date: { hijri: { day: "—", month: { ar: "—" }, year: "—" } } }, false);
      showStatus("Hors-ligne – horaires par défaut.", "#ca8a04");
    } else {
      showStatus("Hors-ligne – cache.", "#ca8a04");
    }
  }
}

async function fetchTimings() {
  if (!currentMosque) return;

  // GEO first
  const geo = await getGeoOnce();
  if (geo) {
    track("geo_enabled", { ok: 1 });
    await fetchTimingsFor(geo.lat, geo.lon);
    return;
  }

  // fallback: city coords
  const base = CITY_COORDS[currentMosque.city] || CITY_COORDS.Medina;
  track("geo_enabled", { ok: 0 });
  await fetchTimingsFor(base.lat, base.lon);
}

/* =========================
   UI RENDER
========================= */
function updatePublicCategoryHelp() {
  const cat = normalizeCategory(el("don-public-category")?.value);
  const help = el("don-public-category-help");
  if (help) help.textContent = DON_CATEGORY_HELP[cat] || "—";
}

function renderEvents() {
  const box = el("events-list");
  const events = Array.isArray(currentMosque?.events) ? currentMosque.events : [];
  if (!box) return;
  if (!events.length) { box.textContent = "—"; return; }

  const wrap = document.createElement("div");
  wrap.style.display = "grid";
  wrap.style.gap = "8px";

  events.forEach((ev) => {
    const item = document.createElement("div");
    item.style.border = "1px solid rgba(0,0,0,.06)";
    item.style.borderRadius = "12px";
    item.style.padding = "10px 12px";
    item.innerHTML = `<div style="font-weight:900;color:#1f5e53">${String(ev.title || "")}</div>
                      <div class="small">${String(ev.date || "")}</div>`;
    wrap.appendChild(item);
  });

  box.innerHTML = "";
  box.appendChild(wrap);
}

/* =========================
   99 NOMS (COMPLET)
========================= */
const NAMES_99 = [
  { ar:"ٱللَّٰه", fr:"Allah" },
  { ar:"ٱلرَّحْمَٰن", fr:"Ar-Rahman (Le Tout Miséricordieux)" },
  { ar:"ٱلرَّحِيم", fr:"Ar-Rahim (Le Très Miséricordieux)" },
  { ar:"ٱلْمَلِك", fr:"Al-Malik (Le Souverain)" },
  { ar:"ٱلْقُدُّوس", fr:"Al-Quddus (Le Saint)" },
  { ar:"ٱلسَّلَام", fr:"As-Salam (La Paix)" },
  { ar:"ٱلْمُؤْمِن", fr:"Al-Mu’min (Le Garant)" },
  { ar:"ٱلْمُهَيْمِن", fr:"Al-Muhaymin (Le Protecteur)" },
  { ar:"ٱلْعَزِيز", fr:"Al-‘Aziz (Le Tout-Puissant)" },
  { ar:"ٱلْجَبَّار", fr:"Al-Jabbar (Le Contraignant)" },
  { ar:"ٱلْمُتَكَبِّر", fr:"Al-Mutakabbir (Le Suprême)" },
  { ar:"ٱلْخَالِق", fr:"Al-Khaliq (Le Créateur)" },
  { ar:"ٱلْبَارِئ", fr:"Al-Bari’ (Le Producteur)" },
  { ar:"ٱلْمُصَوِّر", fr:"Al-Musawwir (Le Formateur)" },
  { ar:"ٱلْغَفَّار", fr:"Al-Ghaffar (Le Grand Pardonneur)" },
  { ar:"ٱلْقَهَّار", fr:"Al-Qahhar (Le Dominateur)" },
  { ar:"ٱلْوَهَّاب", fr:"Al-Wahhab (Le Donateur)" },
  { ar:"ٱلرَّزَّاق", fr:"Ar-Razzaq (Le Pourvoyeur)" },
  { ar:"ٱلْفَتَّاح", fr:"Al-Fattah (L’Ouvreur)" },
  { ar:"ٱلْعَلِيم", fr:"Al-‘Alim (L’Omniscient)" },
  { ar:"ٱلْقَابِض", fr:"Al-Qabid (Celui qui Retient)" },
  { ar:"ٱلْبَاسِط", fr:"Al-Basit (Celui qui Étend)" },
  { ar:"ٱلْخَافِض", fr:"Al-Khafid (Celui qui Abaisse)" },
  { ar:"ٱلرَّافِع", fr:"Ar-Rafi‘ (Celui qui Élève)" },
  { ar:"ٱلْمُعِزّ", fr:"Al-Mu‘izz (Celui qui Honore)" },
  { ar:"ٱلْمُذِلّ", fr:"Al-Mudhill (Celui qui Humilie)" },
  { ar:"ٱلسَّمِيع", fr:"As-Sami‘ (L’Audient)" },
  { ar:"ٱلْبَصِير", fr:"Al-Basir (Le Clairvoyant)" },
  { ar:"ٱلْحَكَم", fr:"Al-Hakam (Le Juge)" },
  { ar:"ٱلْعَدْل", fr:"Al-‘Adl (Le Juste)" },
  { ar:"ٱللَّطِيف", fr:"Al-Latif (Le Subtil)" },
  { ar:"ٱلْخَبِير", fr:"Al-Khabir (Le Parfaitement Connaisseur)" },
  { ar:"ٱلْحَلِيم", fr:"Al-Halim (Le Longanime)" },
  { ar:"ٱلْعَظِيم", fr:"Al-‘Azim (L’Immense)" },
  { ar:"ٱلْغَفُور", fr:"Al-Ghafur (Le Pardonneur)" },
  { ar:"ٱلشَّكُور", fr:"Ash-Shakur (Le Reconnaissant)" },
  { ar:"ٱلْعَلِيّ", fr:"Al-‘Aliyy (Le Très-Haut)" },
  { ar:"ٱلْكَبِير", fr:"Al-Kabir (Le Très-Grand)" },
  { ar:"ٱلْحَفِيظ", fr:"Al-Hafiz (Le Gardien)" },
  { ar:"ٱلْمُقِيت", fr:"Al-Muqit (Le Nourricier)" },
  { ar:"ٱلْحَسِيب", fr:"Al-Hasib (Celui qui Suffit)" },
  { ar:"ٱلْجَلِيل", fr:"Al-Jalil (Le Majestueux)" },
  { ar:"ٱلْكَرِيم", fr:"Al-Karim (Le Généreux)" },
  { ar:"ٱلرَّقِيب", fr:"Ar-Raqib (Le Vigilant)" },
  { ar:"ٱلْمُجِيب", fr:"Al-Mujib (Celui qui Exauce)" },
  { ar:"ٱلْوَاسِع", fr:"Al-Wasi‘ (L’Immense)" },
  { ar:"ٱلْحَكِيم", fr:"Al-Hakim (Le Sage)" },
  { ar:"ٱلْوَدُود", fr:"Al-Wadud (Le Bien-Aimant)" },
  { ar:"ٱلْمَجِيد", fr:"Al-Majid (Le Glorieux)" },
  { ar:"ٱلْبَاعِث", fr:"Al-Ba‘ith (Le Ressusciteur)" },
  { ar:"ٱلشَّهِيد", fr:"Ash-Shahid (Le Témoin)" },
  { ar:"ٱلْحَقّ", fr:"Al-Haqq (La Vérité)" },
  { ar:"ٱلْوَكِيل", fr:"Al-Wakil (Le Garant)" },
  { ar:"ٱلْقَوِيّ", fr:"Al-Qawiyy (Le Fort)" },
  { ar:"ٱلْمَتِين", fr:"Al-Matin (Le Très-Ferme)" },
  { ar:"ٱلْوَلِيّ", fr:"Al-Waliyy (Le Protecteur)" },
  { ar:"ٱلْحَمِيد", fr:"Al-Hamid (Le Digne de Louange)" },
  { ar:"ٱلْمُحْصِي", fr:"Al-Muhsi (Celui qui Dénombre)" },
  { ar:"ٱلْمُبْدِئ", fr:"Al-Mubdi’ (Celui qui Initie)" },
  { ar:"ٱلْمُعِيد", fr:"Al-Mu‘id (Celui qui Répète)" },
  { ar:"ٱلْمُحْيِي", fr:"Al-Muhyi (Celui qui Donne la Vie)" },
  { ar:"ٱلْمُمِيت", fr:"Al-Mumit (Celui qui Donne la Mort)" },
  { ar:"ٱلْحَيّ", fr:"Al-Hayy (Le Vivant)" },
  { ar:"ٱلْقَيُّوم", fr:"Al-Qayyum (L’Auto-subsistant)" },
  { ar:"ٱلْوَاجِد", fr:"Al-Wajid (Le Riche)" },
  { ar:"ٱلْمَاجِد", fr:"Al-Majid (Le Noble)" },
  { ar:"ٱلْوَاحِد", fr:"Al-Wahid (L’Unique)" },
  { ar:"ٱلْأَحَد", fr:"Al-Ahad (L’Un)" },
  { ar:"ٱلصَّمَد", fr:"As-Samad (Le Seul à être Imploré)" },
  { ar:"ٱلْقَادِر", fr:"Al-Qadir (Le Capable)" },
  { ar:"ٱلْمُقْتَدِر", fr:"Al-Muqtadir (Le Très-Puissant)" },
  { ar:"ٱلْمُقَدِّم", fr:"Al-Muqaddim (Celui qui Avance)" },
  { ar:"ٱلْمُؤَخِّر", fr:"Al-Mu’akhkhir (Celui qui Retarde)" },
  { ar:"ٱلْأَوَّل", fr:"Al-Awwal (Le Premier)" },
  { ar:"ٱلْآخِر", fr:"Al-Akhir (Le Dernier)" },
  { ar:"ٱلظَّاهِر", fr:"Az-Zahir (L’Apparent)" },
  { ar:"ٱلْبَاطِن", fr:"Al-Batin (Le Caché)" },
  { ar:"ٱلْوَالِي", fr:"Al-Wali (Le Gouverneur)" },
  { ar:"ٱلْمُتَعَالِي", fr:"Al-Muta‘ali (Le Très-Élevé)" },
  { ar:"ٱلْبَرّ", fr:"Al-Barr (Le Bienfaisant)" },
  { ar:"ٱلتَّوَّاب", fr:"At-Tawwab (Celui qui Accepte le Repentir)" },
  { ar:"ٱلْمُنْتَقِم", fr:"Al-Muntaqim (Le Vengeur)" },
  { ar:"ٱلْعَفُوّ", fr:"Al-‘Afuww (L’Indulgent)" },
  { ar:"ٱلرَّؤُوف", fr:"Ar-Ra’uf (Le Compatissant)" },
  { ar:"مَالِكُ ٱلْمُلْك", fr:"Malik-ul-Mulk (Maître du Royaume)" },
  { ar:"ذُو ٱلْجَلَالِ وَٱلْإِكْرَام", fr:"Dhul-Jalali wal-Ikram (Majesté & Générosité)" },
  { ar:"ٱلْمُقْسِط", fr:"Al-Muqsit (L’Équitable)" },
  { ar:"ٱلْجَامِع", fr:"Al-Jami‘ (Le Rassembleur)" },
  { ar:"ٱلْغَنِيّ", fr:"Al-Ghaniyy (Le Riche)" },
  { ar:"ٱلْمُغْنِي", fr:"Al-Mughni (Celui qui Enrichit)" },
  { ar:"ٱلْمَانِع", fr:"Al-Mani‘ (Le Protecteur)" },
  { ar:"ٱلضَّارّ", fr:"Ad-Darr (Celui qui Nuit)" },
  { ar:"ٱلنَّافِع", fr:"An-Nafi‘ (Celui qui Profite)" },
  { ar:"ٱلنُّور", fr:"An-Nur (La Lumière)" },
  { ar:"ٱلْهَادِي", fr:"Al-Hadi (Le Guide)" },
  { ar:"ٱلْبَدِيع", fr:"Al-Badi‘ (L’Incomparable)" },
  { ar:"ٱلْبَاقِي", fr:"Al-Baqi (L’Éternel)" },
  { ar:"ٱلْوَارِث", fr:"Al-Warith (L’Héritier)" },
  { ar:"ٱلرَّشِيد", fr:"Ar-Rashid (Le Bien-Guide)" },
  { ar:"ٱلصَّبُور", fr:"As-Sabur (Le Patient)" },
];

function renderNames99() {
  const list = el("names-list");
  if (!list) return;
  list.innerHTML = "";
  NAMES_99.forEach((n, idx) => {
    const li = document.createElement("li");
    li.innerHTML = `<span><strong>${idx + 1}.</strong> ${n.fr}</span><span style="font-weight:900">${n.ar}</span>`;
    list.appendChild(li);
  });
}

/* =========================
   DONATIONS (Firestore)
========================= */
function statsDocId(mosqueId, monthKey) {
  return `${mosqueId}_${monthKey}`;
}

async function getMonthStats(mosqueId, monthKey) {
  const dref = doc(db, "donation_stats", statsDocId(mosqueId, monthKey));
  const snap = await getDoc(dref);
  if (!snap.exists()) return { monthTotal: 0, goalMonth: Number(currentMosque?.goalMonth || 0) };
  const v = snap.data();
  return {
    monthTotal: Number(v.monthTotal || 0),
    goalMonth: Number(v.goalMonth || currentMosque?.goalMonth || 0),
  };
}

async function setGoalMonth(mosqueId, goalMonth) {
  const monthKey = ymKey();
  const dref = doc(db, "donation_stats", statsDocId(mosqueId, monthKey));
  const cur = await getDoc(dref);
  if (cur.exists()) {
    await updateDoc(dref, { goalMonth: Number(goalMonth || 0) });
  } else {
    await setDoc(dref, { mosqueId, monthKey, monthTotal: 0, goalMonth: Number(goalMonth || 0), updatedAt: serverTimestamp() });
  }
}

async function bumpMonthTotal(mosqueId, delta) {
  const monthKey = ymKey();
  const dref = doc(db, "donation_stats", statsDocId(mosqueId, monthKey));
  const snap = await getDoc(dref);
  if (!snap.exists()) {
    await setDoc(dref, { mosqueId, monthKey, monthTotal: Math.max(0, Number(delta || 0)), goalMonth: Number(currentMosque?.goalMonth || 0), updatedAt: serverTimestamp() });
    return;
  }
  const v = snap.data();
  const next = Math.max(0, Number(v.monthTotal || 0) + Number(delta || 0));
  await updateDoc(dref, { monthTotal: next, updatedAt: serverTimestamp() });
}

async function renderPublicStats() {
  const monthKey = ymKey();
  const s = await getMonthStats(currentMosque.id, monthKey);

  el("don-public-goal").textContent = Number(s.goalMonth || 0).toLocaleString("fr-FR");
  el("don-public-month").textContent = Number(s.monthTotal || 0).toLocaleString("fr-FR");

  const goal = Number(s.goalMonth || 0);
  const total = Number(s.monthTotal || 0);
  const p = goal ? Math.min(100, Math.round((total * 100) / goal)) : 0;
  el("don-public-bar").style.width = `${p}%`;
}

async function submitDonationRequest({ amount, category, ref, via }) {
  const payload = {
    mosqueId: currentMosque.id,
    amount: Number(amount || 0),
    category: normalizeCategory(category),
    ref: String(ref || ""),
    via: via || "public",
    status: "pending",
    createdAt: serverTimestamp(),
    createdAtClient: new Date().toISOString(),
  };

  await addDoc(collection(db, "donations_pending"), payload);

  track("submit_donation_request", { mosqueId: currentMosque.id, category: payload.category, amount: payload.amount });
}

/* Pending list (admin) */
let pendingUnsub = null;

function renderAdminPendingRow(tbody, item) {
  const tr = document.createElement("tr");
  const createdIso = item.createdAtClient || new Date().toISOString();
  const date = ddmmyy(createdIso);
  const amount = Number(item.amount || 0).toLocaleString("fr-FR");
  const cat = normalizeCategory(item.category);
  const ref = String(item.ref || "").slice(0, 32);

  tr.innerHTML = `
    <td>${date}</td>
    <td><strong>${amount}</strong></td>
    <td>${cat}</td>
    <td>${ref}</td>
    <td><span class="badge b-p">En attente</span></td>
    <td style="white-space:nowrap">
      <button class="btn btn-primary" data-act="ok" data-id="${item.__id}" style="padding:6px 10px; min-width:auto">OK</button>
      <button class="btn" data-act="no" data-id="${item.__id}" style="padding:6px 10px; min-width:auto; background:#ef4444; color:#fff">X</button>
    </td>
  `;
  tbody.appendChild(tr);
}

function startPendingListener() {
  if (pendingUnsub) pendingUnsub();

  const qy = query(
    collection(db, "donations_pending"),
    where("mosqueId", "==", currentMosque.id),
    where("status", "==", "pending"),
    orderBy("createdAtClient", "desc"),
    limit(50)
  );

  pendingUnsub = onSnapshot(qy, (snap) => {
    const rows = [];
    snap.forEach((d) => rows.push({ __id: d.id, ...d.data() }));

    const badge = el("admin-badge");
    if (badge) {
      badge.textContent = String(rows.length);
      badge.style.display = rows.length ? "inline-block" : "none";
    }

    const tb = document.querySelector("#admin-don-table tbody");
    if (!tb) return;
    tb.innerHTML = "";

    rows.forEach((r) => renderAdminPendingRow(tb, r));

    tb.querySelectorAll("button[data-act]").forEach((b) => {
      b.onclick = async () => {
        const id = b.dataset.id;
        const act = b.dataset.act;
        if (act === "ok") await adminConfirmDonation(id);
        if (act === "no") await adminRejectDonation(id);
      };
    });
  });
}

async function adminConfirmDonation(pendingId) {
  const pref = doc(db, "donations_pending", pendingId);
  const snap = await getDoc(pref);
  if (!snap.exists()) return;

  const data = snap.data();
  if (String(data.status) !== "pending") return;

  // Mark confirmed
  await updateDoc(pref, { status: "confirmed", confirmedAt: serverTimestamp() });

  // Update month total
  await bumpMonthTotal(currentMosque.id, Number(data.amount || 0));

  track("admin_confirm_donation", { mosqueId: currentMosque.id, amount: Number(data.amount || 0) });
  showStatus("Don confirmé ✅");
  await renderPublicStats();
}

async function adminRejectDonation(pendingId) {
  const pref = doc(db, "donations_pending", pendingId);
  const snap = await getDoc(pref);
  if (!snap.exists()) return;

  await updateDoc(pref, { status: "rejected", rejectedAt: serverTimestamp() });
  track("admin_reject_donation", { mosqueId: currentMosque.id });
  showStatus("Don annulé ❌", "#ef4444");
}

/* =========================
   DISPLAY ALL
========================= */
function displayAll(apiData) {
  timingsData = (apiData && apiData.timings) ? apiData.timings : MOCK;

  el("mosque-name").textContent = currentMosque?.name || "Mosquée";
  el("wave-number").textContent = currentMosque?.wave || "—";
  el("orange-number").textContent = currentMosque?.orange || "—";

  el("about-contact-name").textContent = currentMosque?.contact || "—";
  el("about-contact-phone").textContent = currentMosque?.phone || "—";

  PRAYER_NAMES.forEach((k) => {
    el(`${k.toLowerCase()}-name`).textContent = `${DISPLAY[k].local} (${DISPLAY[k].ar})`;
    el(`${k.toLowerCase()}-time`).textContent = timingsData[k] || "--:--";
  });

  el("shuruq-time").textContent = timingsData.Sunrise || "--:--";
  el("jumua-time").textContent = currentMosque?.jumua || "13:30";

  if (apiData?.date?.hijri) {
    el("hijri-date").textContent = `${apiData.date.hijri.day} ${apiData.date.hijri.month.ar} ${apiData.date.hijri.year} AH`;
  } else {
    el("hijri-date").textContent = "Date hégirienne indisponible";
  }

  // annonces + notif
  const ann = String(currentMosque?.ann || "").trim();
  el("announcement-text").textContent = ann || "Aucune annonce.";
  const seenKey = `annSeen_${currentMosque.id}_${new Date().toDateString()}`;
  el("notif").style.display = (ann && !localStorage.getItem(seenKey)) ? "inline-block" : "none";

  updatePublicCategoryHelp();
  updateNextCountdown();
  renderRamadan();
}

/* =========================
   FOOTER
========================= */
function setupFooter() {
  el("events-btn").onclick = () => { renderEvents(); openModal("modal-events"); };

  el("announce-btn").onclick = () => {
    openModal("modal-ann");
    localStorage.setItem(`annSeen_${currentMosque.id}_${new Date().toDateString()}`, "1");
    el("notif").style.display = "none";
  };

  el("about-btn").onclick = () => openModal("modal-about");

  el("names-btn").onclick = () => {
    renderNames99();
    openModal("modal-names");
  };

  el("share-btn").onclick = () => {
    const text =
      `🕌 ${currentMosque?.name}\n${el("gregorian-date").textContent}\n\n` +
      `Fajr: ${el("fajr-time").textContent}\n` +
      `Dhuhr: ${el("dhuhr-time").textContent}\n` +
      `Asr: ${el("asr-time").textContent}\n` +
      `Maghrib: ${el("maghrib-time").textContent}\n` +
      `Isha: ${el("isha-time").textContent}\n\n` +
      `${location.href}`;

    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };
}

/* =========================
   TASBIH
========================= */
function setupTasbih() {
  const k = "tasbih_count";
  const countEl = el("tasbih-count");
  const plus = el("tasbih-plus");
  const reset = el("tasbih-reset");
  if (!countEl || !plus || !reset) return;

  const get = () => parseInt(localStorage.getItem(k) || "0", 10) || 0;
  const set = (v) => { localStorage.setItem(k, String(v)); countEl.textContent = String(v); };

  set(get());
  plus.onclick = () => {
    set(get() + 1);
    if (navigator.vibrate) navigator.vibrate(10);
  };
  reset.onclick = () => set(0);
}

/* =========================
   DON UI
========================= */
function openDonModal() {
  el("don-amount").value = "";
  el("don-ref").value = "";
  el("don-category").value = normalizeCategory(el("don-public-category")?.value);
  openModal("modal-don");
}

function setupDonButtons() {
  el("don-public-category").onchange = () => updatePublicCategoryHelp();

  el("btn-wave").onclick = () => {
    track("click_donate_wave", { mosqueId: currentMosque.id });
    showPopup("Wave", "Tu peux payer via Wave. Ensuite clique sur “J’ai donné” pour soumettre la demande.");
  };

  el("btn-orange").onclick = () => {
    track("click_donate_orange", { mosqueId: currentMosque.id });
    showPopup("Orange Money", "Tu peux payer via Orange Money. Ensuite clique sur “J’ai donné” pour soumettre la demande.");
  };

  el("btn-claimed").onclick = () => openDonModal();

  el("don-confirm").onclick = async () => {
    const amount = parseInt(el("don-amount").value, 10) || 0;
    const category = el("don-category").value;
    const ref = el("don-ref").value.trim();

    if (amount <= 0) {
      showStatus("Montant invalide", "#ef4444");
      return;
    }

    await submitDonationRequest({ amount, category, ref, via: "public" });

    closeAll();
    showPopup(
      "Merci 🤲",
      `Merci pour ton don de ${amount.toLocaleString("fr-FR")} CFA (${normalizeCategory(category)}). Statut : en attente de confirmation. BarakAllahou fik.`
    );
  };
}

/* =========================
   ADMIN
========================= */
function populateCitySelect(select) {
  select.innerHTML = "";
  Object.keys(CITY_COORDS).forEach((c) => {
    const o = document.createElement("option");
    o.value = c;
    o.textContent = c;
    select.appendChild(o);
  });
}

async function populateMosqueSelectorIfAllowed() {
  const forced = getUrlMosqueId();

  // public = mosquée forcée par URL => selection cachée
  // admin/super => selection visible
  const showSelect = SESSION_ROLE !== "guest" && !forced;
  el("mosque-select-row").style.display = showSelect ? "flex" : "none";

  const mosques = await listMosques();
  const sel = el("mosque-selector");
  sel.innerHTML = "";
  mosques.forEach((m) => {
    const o = document.createElement("option");
    o.value = m.id;
    o.textContent = m.name;
    sel.appendChild(o);
  });
  sel.value = currentMosque.id;

  sel.onchange = async (e) => {
    setCurrentMosqueId(e.target.value);
    await loadCurrentMosque();
    await renderPublicStats();
    await fetchTimings();
  };
}

async function loadCurrentMosque() {
  const id = getCurrentMosqueId();
  const snap = await getDoc(doc(db, "mosques", id));
  if (snap.exists()) {
    currentMosque = { id: snap.id, ...snap.data() };
  } else {
    currentMosque = { id: "bene-tally", ...DEFAULT_MOSQUES[0] };
  }

  track("view_mosque", { mosqueId: currentMosque.id });
}

function fillAdminForm() {
  el("adm-name").value = currentMosque?.name || "";
  el("adm-city").value = currentMosque?.city || "Medina";
  el("adm-wave").value = currentMosque?.wave || "";
  el("adm-orange").value = currentMosque?.orange || "";
  el("adm-contact").value = currentMosque?.contact || "";
  el("adm-phone").value = currentMosque?.phone || "";
  el("adm-jumua").value = currentMosque?.jumua || "13:30";
  el("adm-ann").value = currentMosque?.ann || "";
  el("adm-events").value = (currentMosque?.events || []).map((e) => `${e.title} | ${e.date}`).join("\n");
  el("adm-goal-month").value = Number(currentMosque?.goalMonth || 0);
}

async function setupAdmin() {
  el("admin-button").onclick = async () => {
    const pw = prompt("Code d’accès :");
    if (pw === SUPER_ADMIN_PASSWORD) SESSION_ROLE = "super";
    else if (pw === ADMIN_PASSWORD) SESSION_ROLE = "admin";
    else return alert("Code incorrect.");

    const isSuper = SESSION_ROLE === "super";
    el("super-row").style.display = isSuper ? "flex" : "none";
    el("role-hint").textContent = isSuper ? "Mode SUPER ADMIN" : "Mode ADMIN";

    populateCitySelect(el("adm-city"));
    fillAdminForm();

    if (isSuper) {
      const mosques = await listMosques();
      const admSel = el("adm-mosque");
      admSel.innerHTML = "";
      mosques.forEach((m) => {
        const o = document.createElement("option");
        o.value = m.id;
        o.textContent = m.name;
        admSel.appendChild(o);
      });
      admSel.value = currentMosque.id;

      admSel.onchange = async (e) => {
        setCurrentMosqueId(e.target.value);
        await loadCurrentMosque();
        fillAdminForm();
        startPendingListener();
        await renderPublicStats();
        await fetchTimings();
      };

      el("add-mosque").onclick = async () => {
        const name = el("adm-new-name").value.trim();
        if (!name) { showStatus("Nom requis", "#ef4444"); return; }
        const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Date.now().toString(36).slice(-4);

        await setDoc(doc(db, "mosques", id), {
          name,
          city: "Medina",
          wave: "",
          orange: "",
          contact: "",
          phone: "",
          jumua: "13:30",
          ann: "",
          events: [],
          method: 3,
          school: 0,
          offsets: [0,0,0,0,0,0],
          goalMonth: 1000000,
          createdAt: serverTimestamp(),
        });

        el("adm-new-name").value = "";
        showStatus("Mosquée créée ✅");
        await loadCurrentMosque();
        await populateMosqueSelectorIfAllowed();
      };

      el("del-mosque").onclick = async () => {
        if (!confirm("Supprimer cette mosquée ?")) return;
        await deleteDoc(doc(db, "mosques", currentMosque.id));
        showStatus("Mosquée supprimée ✅");
        setCurrentMosqueId("bene-tally");
        await loadCurrentMosque();
        await populateMosqueSelectorIfAllowed();
        await renderPublicStats();
        await fetchTimings();
      };
    }

    openModal("modal-admin");

    await populateMosqueSelectorIfAllowed();
    startPendingListener();
  };

  el("save").onclick = async () => {
    if (!currentMosque) return;

    const events = el("adm-events").value
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => {
        const [t, ...r] = l.split("|");
        return { title: (t || "").trim(), date: (r.join("|") || "").trim() };
      });

    const patch = {
      name: el("adm-name").value.trim() || "Mosquée",
      city: el("adm-city").value,
      wave: el("adm-wave").value.trim(),
      orange: el("adm-orange").value.trim(),
      contact: el("adm-contact").value.trim(),
      phone: el("adm-phone").value.trim(),
      jumua: el("adm-jumua").value || "13:30",
      ann: el("adm-ann").value,
      events,
      goalMonth: Number(el("adm-goal-month").value || 0),
      updatedAt: serverTimestamp(),
    };

    await updateDoc(doc(db, "mosques", currentMosque.id), patch);
    currentMosque = { ...currentMosque, ...patch };

    await setGoalMonth(currentMosque.id, patch.goalMonth);
    await renderPublicStats();

    closeAll();
    await fetchTimings();
    showStatus("Enregistré ✅");
  };
}

/* =========================
   MOSQUE OFFICIAL LINK (share)
========================= */
function enforceMosqueLock() {
  const forced = getUrlMosqueId();
  if (!forced) return;

  // force current mosque id from URL
  setCurrentMosqueId(forced);
}

/* =========================
   INIT
========================= */
async function setup() {
  bindModals();
  initTheme();

  enforceMosqueLock();

  await ensureMosquesSeed();
  await loadCurrentMosque();

  setupFooter();
  setupTasbih();
  setupDonButtons();
  await setupAdmin();

  await populateMosqueSelectorIfAllowed();

  updateClock();
  setInterval(updateClock, 1000);

  await renderPublicStats();
  await fetchTimings();
  setInterval(updateNextCountdown, 1000);
}

document.addEventListener("DOMContentLoaded", () => {
  setup().catch((e) => {
    console.error(e);
    showStatus("Erreur chargement", "#ef4444");
  });
});
