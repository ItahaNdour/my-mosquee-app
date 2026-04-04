// /app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  addDoc,
  deleteDoc,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  serverTimestamp,
  runTransaction,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* =========================
   Build
========================= */
const BUILD = "7500";

/* =========================
   Firebase
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
const auth = getAuth(app);
const db = getFirestore(app);

/* =========================
   Session / State
========================= */
let SESSION_ROLE = "guest"; // guest | admin | super
let currentUser = null; // { uid, role, mosqueId }

let mosquesCache = [];
let activeMosque = null;

let unsubMosque = null;
let unsubDonations = null;

let timingsData = null;
let latestDonations = [];

let audioUnlocked = false;

/* =========================
   Constants
========================= */
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

const DEFAULT_MOSQUES = [
  {
    id: "bene-tally",
    name: "Bene Tally",
    city: "Medina",
    wave: "772682103",
    orange: "772682103",
    contact: "Imam Diallo",
    phone: "+221772682103",
    jumua: "13:30",
    ann: "Bienvenue à Bene Tally.",
    events: [{ title: "Cours de Fiqh", date: "Mardi après Isha" }],
    method: 3,
    school: 0,
    offsets: [0, 0, 0, 0, 0, 0],
    goals: { monthly: 500000 },
  },
];

const MOCK = { Fajr: "05:45", Sunrise: "07:00", Dhuhr: "13:30", Asr: "16:45", Maghrib: "19:05", Isha: "20:30" };

const DON_CATEGORIES = ["Zakat", "Sadaqa", "Travaux"];
const DON_CATEGORY_HELP = {
  Zakat: "Zakat : obligation (selon conditions).",
  Sadaqa: "Sadaqa : don libre, pour l’entraide.",
  Travaux: "Travaux : entretien, rénovation, équipement.",
};

// Ramadan OFF
const RAMADAN_ENABLED = false;

/* =========================
   DOM utils
========================= */
const el = (id) => document.getElementById(id);

function showStatus(msg, bg) {
  const node = el("status");
  if (!node) return;
  node.textContent = msg;
  node.style.background = bg || "#2f7d6d";
  node.style.display = "block";
  setTimeout(() => { node.style.display = "none"; }, 2500);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function parseHM(s) {
  const [h, m] = String(s || "").split(":").map((x) => parseInt(x, 10));
  return { h: Number.isFinite(h) ? h : 0, m: Number.isFinite(m) ? m : 0 };
}

function buildTuneParam(offsets) {
  const a = offsets && offsets.length === 6 ? offsets : [0, 0, 0, 0, 0, 0];
  return a.join(",");
}

function ddmmyy(iso) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function ymKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getUrlMosqueId() {
  const u = new URL(window.location.href);
  const m = (u.searchParams.get("m") || "").trim();
  return m || null;
}

function resolveMosqueId() {
  const forced = getUrlMosqueId();
  if (forced) return forced;
  if (currentUser?.role === "admin" && currentUser?.mosqueId) return currentUser.mosqueId;
  return localStorage.getItem("currentMosqueId") || DEFAULT_MOSQUES[0].id;
}

function setCurrentMosqueId(id) {
  localStorage.setItem("currentMosqueId", id);
}

/* =========================
   Theme
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
   Modals
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

/* =========================
   Clipboard / WhatsApp
========================= */
async function copyToClipboard(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = t;
      ta.setAttribute("readonly", "true");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return !!ok;
    } catch {
      return false;
    }
  }
}

function openWhatsAppText(text) {
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
}
function openWhatsApp(to, msg) {
  window.open(`https://wa.me/${encodeURIComponent(to)}?text=${encodeURIComponent(msg)}`, "_blank");
}

/* =========================
   Adhan (toggle + test)
   (On garde la version actuelle: le son “à l’heure” ne marche que si la page est ouverte.)
========================= */
const ADHAN_ENABLED_KEY = "mm_adhan_enabled_v1";
const ADHAN_AUDIO_URL = "./assets/adhan.mp3";

function isAdhanEnabled() { return localStorage.getItem(ADHAN_ENABLED_KEY) === "1"; }
function setAdhanEnabled(on) { localStorage.setItem(ADHAN_ENABLED_KEY, on ? "1" : "0"); }

function ensureAudioUnlock() {
  if (audioUnlocked) return;
  const unlock = async () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.value = 0.0001;
      o.start();
      o.stop(ctx.currentTime + 0.01);
      await ctx.close();
      audioUnlocked = true;
    } catch {}
  };
  document.addEventListener("pointerdown", unlock, { capture: true, once: true });
  document.addEventListener("keydown", unlock, { capture: true, once: true });
}

function playAdhanBeepFallback() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 660;
    o.connect(g);
    g.connect(ctx.destination);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.03);
    o.start();
    const seq = [660, 740, 660, 520, 660];
    seq.forEach((f, i) => o.frequency.setValueAtTime(f, ctx.currentTime + i * 0.22));
    setTimeout(async () => {
      try {
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05);
        o.stop(ctx.currentTime + 0.06);
        await ctx.close();
      } catch {}
    }, 1200);
  } catch {}
}

async function playAdhanMp3() {
  const a = new Audio(ADHAN_AUDIO_URL);
  a.preload = "auto";
  a.crossOrigin = "anonymous";
  a.volume = 1;
  try {
    await a.play();
    return true;
  } catch (e) {
    console.warn("Adhan MP3 blocked/unavailable -> fallback beep", e);
    playAdhanBeepFallback();
    return false;
  }
}

async function playAdhan() {
  if (!audioUnlocked) return false;
  return playAdhanMp3();
}

function maybePlayAdhanForPrayer(prayerName) {
  if (!isAdhanEnabled()) return;
  if (!audioUnlocked) return;

  const key = `mm_adhan_${todayKey()}_${prayerName}`;
  if (localStorage.getItem(key) === "1") return;

  localStorage.setItem(key, "1");
  playAdhan().then(() => {});
}

function injectAdhanToggleUI() {
  if (document.getElementById("mm-adhan-row")) return;

  const anchor = document.getElementById("mm-geo-row") || document.getElementById("mosque-select-row") || document.querySelector(".header");
  if (!anchor?.parentNode) return;

  const row = document.createElement("div");
  row.id = "mm-adhan-row";
  row.style.display = "flex";
  row.style.justifyContent = "center";
  row.style.alignItems = "center";
  row.style.gap = "10px";
  row.style.margin = "2px 0 6px";
  row.innerHTML = `
    <label style="display:flex;align-items:center;gap:8px;font-weight:900;font-size:12px;color:var(--muted)">
      <input id="mm-adhan-toggle" type="checkbox" />
      Adhan (son)
    </label>
    <button id="mm-adhan-test" class="btn btn-ghost" style="padding:6px 10px; min-width:auto">Tester</button>
  `;
  anchor.parentNode.insertBefore(row, anchor.nextSibling);

  const toggle = document.getElementById("mm-adhan-toggle");
  const test = document.getElementById("mm-adhan-test");

  if (toggle) {
    toggle.checked = isAdhanEnabled();
    toggle.onchange = () => {
      setAdhanEnabled(!!toggle.checked);
      ensureAudioUnlock();
      showStatus(toggle.checked ? "Adhan activé ✅" : "Adhan désactivé", toggle.checked ? "#16a34a" : "#0f172a");
    };
  }

  if (test) {
    test.onclick = async () => {
      ensureAudioUnlock();
      const ok = await playAdhan();
      showStatus(ok ? "Test Adhan MP3 ✅" : "Test Adhan (fallback) ✅", "#16a34a");
    };
  }
}

/* =========================
   Auth (phone -> pseudo email)
========================= */
const PSEUDO_DOMAIN = "mymosque.sn";

function normalizePhone(input) {
  const raw = String(input || "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 9) return digits.slice(-9);
  return digits;
}
function phoneToEmail(phone9) {
  const p = normalizePhone(phone9);
  return `admin-${p}@${PSEUDO_DOMAIN}`;
}
async function promptLogin() {
  const phoneOrEmail = prompt("Admin - Téléphone (9 chiffres) ou Email :");
  if (!phoneOrEmail) return null;
  const pin = prompt("Code (PIN) :");
  if (!pin) return null;
  const email = phoneOrEmail.includes("@") ? phoneOrEmail.trim() : phoneToEmail(phoneOrEmail);
  return signInWithEmailAndPassword(auth, email, pin);
}

/* =========================
   Firestore refs
========================= */
function usersDocRef(uid) { return doc(db, "users", uid); }
function mosqueDocRef(mosqueId) { return doc(db, "mosques", mosqueId); }
function donationsColRef(mosqueId) { return collection(db, "mosques", mosqueId, "donations"); }

/* =========================
   Roles
========================= */
async function loadUserProfile(uid) {
  const snap = await getDoc(usersDocRef(uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  const role = data.role;
  const mosqueId = data.mosqueId || null;
  if (role !== "admin" && role !== "super") return null;
  if (role === "admin" && !mosqueId) return null;
  return { uid, role, mosqueId };
}

async function refreshMosquesCacheForSuper() {
  const snaps = await getDocs(collection(db, "mosques"));
  mosquesCache = snaps.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* =========================
   Mosque selector UI
========================= */
function canSelectMosque() {
  const forced = !!getUrlMosqueId();
  return currentUser?.role === "super" && !forced;
}

function refreshMosqueAccessUI() {
  const locked = el("mosque-locked");
  const row = el("mosque-select-row");
  const title = el("mosque-name");
  if (!locked || !row || !title) return;

  if (canSelectMosque()) {
    row.style.display = "flex";
    locked.style.display = "none";
    title.style.display = "none";
  } else {
    row.style.display = "none";
    locked.style.display = "none";
    title.style.display = "";
    title.textContent = activeMosque?.name || "Mosquée";
  }
}

function populateMosqueSelector() {
  const sel = el("mosque-selector");
  if (!sel) return;
  sel.innerHTML = "";

  const list = (currentUser?.role === "super") ? mosquesCache : (activeMosque ? [activeMosque] : []);
  list.forEach((m) => {
    const o = document.createElement("option");
    o.value = m.id;
    o.textContent = m.name || m.id;
    sel.appendChild(o);
  });

  sel.value = activeMosque?.id || resolveMosqueId();
  sel.onchange = async (e) => {
    if (!canSelectMosque()) return;
    const id = e.target.value;
    setCurrentMosqueId(id);
    await attachMosque(id);
  };
}

/* =========================
   GPS AUTO (fallback safe)
========================= */
const GEO_ENABLED_KEY = "mm_geo_enabled_v6";
const GEO_LAST_KEY = "mm_geo_last_v6";
const GEO_LAST_FETCH_KEY = "mm_geo_last_fetch_v6";
const GEO_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const GEO_FETCH_DEBOUNCE_MS = 30 * 60 * 1000;
const GEO_DEFAULT_ON = true;

function isGeoEnabled() {
  const v = localStorage.getItem(GEO_ENABLED_KEY);
  if (v == null) return GEO_DEFAULT_ON;
  return v === "1";
}
function setGeoEnabled(on) { localStorage.setItem(GEO_ENABLED_KEY, on ? "1" : "0"); }

function loadLastCoords() {
  try {
    const raw = localStorage.getItem(GEO_LAST_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj.lat !== "number" || typeof obj.lon !== "number" || typeof obj.ts !== "number") return null;
    if (Date.now() - obj.ts > GEO_CACHE_MAX_AGE_MS) return null;
    return { lat: obj.lat, lon: obj.lon };
  } catch { return null; }
}
function saveLastCoords(lat, lon) { localStorage.setItem(GEO_LAST_KEY, JSON.stringify({ lat, lon, ts: Date.now() })); }
function shouldRefetchGeoNow() {
  const last = parseInt(localStorage.getItem(GEO_LAST_FETCH_KEY) || "0", 10) || 0;
  return Date.now() - last > GEO_FETCH_DEBOUNCE_MS;
}

async function getUserCoordsOnce({ timeoutMs = 8000 } = {}) {
  if (!("geolocation" in navigator)) return null;
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve(null);
    }, timeoutMs);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        const lat = pos?.coords?.latitude;
        const lon = pos?.coords?.longitude;
        if (typeof lat === "number" && typeof lon === "number") {
          saveLastCoords(lat, lon);
          resolve({ lat, lon });
        } else resolve(null);
      },
      () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: false, maximumAge: 5 * 60 * 1000, timeout: timeoutMs }
    );
  });
}

async function ensureAutoGeoWarmup() {
  if (!isGeoEnabled()) return;
  if (!shouldRefetchGeoNow()) return;
  localStorage.setItem(GEO_LAST_FETCH_KEY, String(Date.now()));
  const cached = loadLastCoords();
  if (cached) return;
  getUserCoordsOnce({ timeoutMs: 7000 }).catch(() => {});
}

function injectGeoToggleUI() {
  if (document.getElementById("mm-geo-row")) return;
  const anchor = document.getElementById("mosque-select-row") || document.getElementById("mosque-locked") || document.querySelector(".header");
  if (!anchor?.parentNode) return;

  const row = document.createElement("div");
  row.id = "mm-geo-row";
  row.style.display = "flex";
  row.style.justifyContent = "center";
  row.style.alignItems = "center";
  row.style.gap = "10px";
  row.style.margin = "6px 0 2px";
  row.innerHTML = `
    <label style="display:flex;align-items:center;gap:8px;font-weight:900;font-size:12px;color:var(--muted)">
      <input id="mm-geo-toggle" type="checkbox" />
      GPS (horaires selon ta position)
    </label>
  `;
  anchor.parentNode.insertBefore(row, anchor.nextSibling);

  const toggle = document.getElementById("mm-geo-toggle");
  if (toggle) {
    toggle.checked = isGeoEnabled();
    toggle.onchange = async () => {
      setGeoEnabled(!!toggle.checked);
      if (toggle.checked) await ensureAutoGeoWarmup();
      await fetchTimingsSafe();
    };
  }
}

/* =========================
   Hijri local
========================= */
function computeHijriText() {
  const d = new Date();
  try {
    const partsFr = new Intl.DateTimeFormat("fr-FR-u-ca-islamic", { day: "numeric", month: "long", year: "numeric" }).formatToParts(d);
    const partsAr = new Intl.DateTimeFormat("ar-SA-u-ca-islamic", { day: "numeric", month: "long", year: "numeric" }).formatToParts(d);
    const get = (parts, type) => parts.find((p) => p.type === type)?.value || "";
    const fr = `${get(partsFr, "day")} ${get(partsFr, "month")} ${get(partsFr, "year")} AH`;
    const ar = `${get(partsAr, "day")} ${get(partsAr, "month")} ${get(partsAr, "year")}`;
    return `${fr} • ${ar}`;
  } catch {
    return "—";
  }
}

/* =========================
   Clock / Countdown + adhan trigger
========================= */
function updateClock() {
  const n = new Date();
  el("current-time").textContent = [n.getHours(), n.getMinutes(), n.getSeconds()].map((v) => String(v).padStart(2, "0")).join(":");
  el("gregorian-date").textContent = `${WEEKDAYS[n.getDay()]} ${n.getDate()} ${MONTHS[n.getMonth()]} ${n.getFullYear()}`;
  const hijri = el("hijri-date");
  if (hijri) hijri.textContent = computeHijriText();
}

function fmt(ms) {
  if (ms < 0) return "00:00:00";
  const t = Math.floor(ms / 1000);
  const h = Math.floor(t / 3600) % 24;
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

function buildPrayerTimesForToday() {
  if (!timingsData) return {};
  const out = {};
  PRAYER_NAMES.forEach((k) => {
    const parts = String(timingsData[k] || "").split(":");
    if (parts.length >= 2) {
      const d = new Date();
      d.setHours(Number(parts[0]), Number(parts[1]), 0, 0);
      out[k] = d;
    }
  });

  const now = new Date();
  if (now.getDay() === 5 && activeMosque?.jumua) {
    const hm = parseHM(activeMosque.jumua || "13:30");
    const d = new Date();
    d.setHours(hm.h, hm.m, 0, 0);
    out.Dhuhr = d;
  }
  return out;
}

function checkAdhan(now) {
  if (!timingsData) return;
  const times = buildPrayerTimesForToday();
  const windowMs = 15 * 1000;
  PRAYER_NAMES.forEach((k) => {
    const t = times[k];
    if (!t) return;
    const delta = Math.abs(now - t);
    if (delta <= windowMs) maybePlayAdhanForPrayer(k);
  });
}

function updateNextCountdown() {
  if (!timingsData) {
    el("next-prayer-name").textContent = "Chargement...";
    el("countdown").textContent = "--:--:--";
    return;
  }

  const now = new Date();
  checkAdhan(now);

  document.querySelectorAll(".list .row").forEach((r) => r.classList.remove("current"));

  const p = buildPrayerTimesForToday();

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
}

/* =========================
   Timings via AlAdhan API
========================= */
async function fetchTimingsSafe() {
  try {
    await fetchTimings();
  } catch (e) {
    console.error("fetchTimings failed:", e);
    showStatus("Horaires indisponibles (fallback).", "#ca8a04");
    displayAll({ timings: MOCK });
  }
}

async function fetchTimings() {
  if (!activeMosque) return;

  let base = null;
  if (isGeoEnabled()) {
    base = loadLastCoords();
    if (!base && shouldRefetchGeoNow()) {
      localStorage.setItem(GEO_LAST_FETCH_KEY, String(Date.now()));
      base = await getUserCoordsOnce({ timeoutMs: 7000 });
    }
  }

  if (!base) base = CITY_COORDS[activeMosque.city] || CITY_COORDS.Medina;

  const method = (activeMosque.method != null) ? activeMosque.method : 3;
  const school = (activeMosque.school != null) ? activeMosque.school : 0;
  const tune = buildTuneParam(activeMosque.offsets || [0, 0, 0, 0, 0, 0]);

  const url = `https://api.aladhan.com/v1/timings?latitude=${base.lat}&longitude=${base.lon}&method=${method}&school=${school}&tune=${encodeURIComponent(tune)}`;

  const key = `cache_${activeMosque.id}_${new Date().toDateString()}_${isGeoEnabled() ? "geo" : "city"}`;
  const cached = localStorage.getItem(key);

  if (cached) {
    displayAll(JSON.parse(cached));
  } else {
    displayAll({ timings: MOCK });
  }

  const r = await fetch(url);
  const j = await r.json();
  if (!j || !j.data || !j.data.timings) throw new Error("bad_api");

  localStorage.setItem(key, JSON.stringify(j.data));
  displayAll(j.data);
}

/* =========================
   Dons
========================= */
function normalizeCategory(cat) {
  const c = String(cat || "").trim();
  if (c === "Travaux / Entretien") return "Travaux";
  return DON_CATEGORIES.includes(c) ? c : "Sadaqa";
}
function getPublicCategory() {
  const sel = el("don-public-category");
  if (!sel) return "Sadaqa";
  return normalizeCategory(sel.value);
}
function updatePublicCategoryHelp() {
  const cat = getPublicCategory();
  const help = el("don-public-category-help");
  if (help) help.textContent = DON_CATEGORY_HELP[cat] || "—";
}

function getMonthlyGoal(m) { return Number(m?.goals?.monthly ?? 500000); }
function getMonthlySum(m) {
  const sums = m?.stats?.monthlySums || {};
  return Number(sums[ymKey()] ?? 0);
}

function renderDonPublic() {
  if (!activeMosque) return;
  const goal = getMonthlyGoal(activeMosque);
  const month = getMonthlySum(activeMosque);
  el("don-public-goal").textContent = goal.toLocaleString("fr-FR");
  el("don-public-month").textContent = month.toLocaleString("fr-FR");
  const p = goal ? Math.min(100, Math.round((month * 100) / goal)) : 0;
  el("don-public-bar").style.width = `${p}%`;
}

function openDonModal() {
  el("don-amount").value = "";
  el("don-ref").value = "";
  el("don-category").value = getPublicCategory();
  openModal("modal-don");
}

async function submitDonationRequest() {
  if (!activeMosque) return;

  const amount = parseInt(el("don-amount").value, 10) || 0;
  const category = normalizeCategory(el("don-category").value);
  const ref = String(el("don-ref").value || "").trim();

  if (amount <= 0) return alert("Montant invalide");

  await addDoc(donationsColRef(activeMosque.id), {
    amount,
    category,
    ref,
    status: "pending",
    createdAt: serverTimestamp(),
    mosqueId: activeMosque.id,
  });

  closeAll();
  showStatus("Don envoyé (en attente).", "#16a34a");
}

function pendingCount() { return latestDonations.filter((x) => x.status === "pending").length; }
function updateAdminBadge() {
  const b = el("admin-badge");
  const n = pendingCount();
  if (!b) return;
  if (n > 0) { b.textContent = String(n); b.style.display = "inline-block"; }
  else b.style.display = "none";
}

function renderReqTable() {
  const tb = document.querySelector("#req-table tbody");
  if (!tb) return;
  tb.innerHTML = "";

  latestDonations.forEach((d) => {
    const tr = document.createElement("tr");
    const ts = d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : new Date().toISOString();

    const st = d.status === "confirmed"
      ? '<span class="badge b-ok">Confirmé</span>'
      : (d.status === "rejected"
        ? '<span class="badge b-no">Annulé</span>'
        : '<span class="badge b-p">En attente</span>');

    const action = d.status === "pending"
      ? `<button data-act="ok" data-id="${d.id}" class="btn btn-primary" style="padding:6px 10px; min-width:auto">OK</button>
         <button data-act="no" data-id="${d.id}" class="btn" style="padding:6px 10px; min-width:auto; background:#ef4444; color:#fff">X</button>`
      : `<button data-act="del" data-id="${d.id}" class="btn btn-ghost" style="padding:6px 10px; min-width:auto">Suppr.</button>`;

    tr.innerHTML = `
      <td>${ddmmyy(ts)}</td>
      <td><strong>${Number(d.amount || 0).toLocaleString("fr-FR")}</strong></td>
      <td><strong>${escapeHtml(normalizeCategory(d.category))}</strong></td>
      <td>${escapeHtml(d.ref || "")}</td>
      <td>${st}</td>
      <td style="white-space:nowrap">${action}</td>
    `;
    tb.appendChild(tr);
  });

  tb.querySelectorAll("button[data-act]").forEach((b) => {
    b.onclick = async () => {
      try {
        await setReqStatus(b.dataset.id, b.dataset.act);
        showStatus("Mise à jour OK.", "#16a34a");
      } catch (e) {
        alert("Impossible : " + (e?.message || String(e)));
      }
    };
  });

  updateAdminBadge();
}

async function setReqStatus(donationId, act) {
  if (!activeMosque) return;
  if (SESSION_ROLE === "guest") return;

  const mosqueId = activeMosque.id;
  const donationRef = doc(db, "mosques", mosqueId, "donations", donationId);
  const mosqueRef = mosqueDocRef(mosqueId);

  if (act === "del") {
    await deleteDoc(donationRef);
    return;
  }

  await runTransaction(db, async (tx) => {
    const donationSnap = await tx.get(donationRef);
    if (!donationSnap.exists()) return;

    const d = donationSnap.data();
    if (d.status !== "pending") return;

    const mosqueSnap = await tx.get(mosqueRef);
    const mosqueData = mosqueSnap.exists() ? mosqueSnap.data() : {};
    const sums = { ...(mosqueData.stats?.monthlySums || {}) };
    const key = ymKey();

    if (act === "ok") {
      sums[key] = Number(sums[key] || 0) + Number(d.amount || 0);
      tx.update(donationRef, { status: "confirmed", confirmedAt: serverTimestamp() });
      tx.set(mosqueRef, { stats: { monthlySums: sums } }, { merge: true });
    } else if (act === "no") {
      tx.update(donationRef, { status: "rejected" });
    }
  });
}

/* =========================
   Don buttons
========================= */
function setupDonButtons() {
  el("don-public-category").onchange = () => updatePublicCategoryHelp();

  el("btn-wave").onclick = () => {
    const m = activeMosque;
    const cat = getPublicCategory();
    openWhatsApp(m?.phone || "", `Salam, je souhaite faire un don via *Wave Money*.
Catégorie : *${cat}*
Montant : [à renseigner] CFA
Numéro Wave : ${m?.wave || ""}
Mosquée : ${m?.name || ""}
BarakAllahou fik.`);
  };

  el("btn-orange").onclick = () => {
    const m = activeMosque;
    const cat = getPublicCategory();
    openWhatsApp(m?.phone || "", `Salam, je souhaite faire un don via *Orange Money*.
Catégorie : *${cat}*
Montant : [à renseigner] CFA
Numéro Orange : ${m?.orange || ""}
Mosquée : ${m?.name || ""}
BarakAllahou fik.`);
  };

  el("btn-claimed").onclick = () => openDonModal();
  el("don-confirm").onclick = () => submitDonationRequest().catch((e) => alert(e?.message || "Erreur"));
}

/* =========================
   Tasbih (objectif + barre + today/reste)
========================= */
function setupTasbih() {
  const K_CYCLE = "tasbih_cycle_count";
  const K_DAY = "tasbih_day_count";
  const K_GOAL = "tasbih_goal";
  const K_DAY_KEY = "tasbih_day_key";

  const countEl = el("tasbih-count");
  const plus = el("tasbih-plus");
  const reset = el("tasbih-reset");
  if (!countEl || !plus || !reset) return;

  const toolBox = countEl.closest(".tool");

  const dayKey = todayKey();
  const storedDayKey = localStorage.getItem(K_DAY_KEY);
  if (storedDayKey !== dayKey) {
    localStorage.setItem(K_DAY_KEY, dayKey);
    localStorage.setItem(K_DAY, "0");
  }

  const getGoal = () => {
    const g = parseInt(localStorage.getItem(K_GOAL) || "33", 10);
    return [33, 99, 100].includes(g) ? g : 33;
  };
  const setGoal = (v) => {
    const g = parseInt(v, 10);
    localStorage.setItem(K_GOAL, String([33, 99, 100].includes(g) ? g : 33));
    if (getCycle() >= getGoal()) setCycle(0);
    renderMeta();
  };

  const getCycle = () => parseInt(localStorage.getItem(K_CYCLE) || "0", 10) || 0;
  const setCycle = (v) => {
    const nv = Math.max(0, parseInt(v, 10) || 0);
    localStorage.setItem(K_CYCLE, String(nv));
    countEl.textContent = String(nv);
  };

  const getDay = () => parseInt(localStorage.getItem(K_DAY) || "0", 10) || 0;
  const setDay = (v) => localStorage.setItem(K_DAY, String(Math.max(0, parseInt(v, 10) || 0)));

  if (!document.getElementById("tasbih-meta")) {
    const meta = document.createElement("div");
    meta.id = "tasbih-meta";
    meta.className = "small";
    meta.style.display = "grid";
    meta.style.gap = "6px";
    meta.style.marginTop = "8px";
    meta.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <span style="font-weight:900">Objectif</span>
        <select id="tasbih-goal" style="padding:6px 10px;border-radius:10px;border:1px solid rgba(229,231,235,.7);font-weight:900;background:var(--card);color:var(--ink)">
          <option value="33">33</option>
          <option value="99">99</option>
          <option value="100">100</option>
        </select>
      </div>

      <div style="height:8px;border-radius:999px;overflow:hidden;background:rgba(232,244,241,.95)">
        <span id="tasbih-progress" style="display:block;height:100%;width:0%;background:#16a34a"></span>
      </div>

      <div style="display:flex;justify-content:space-between;gap:10px">
        <span>Aujourd’hui : <strong id="tasbih-today">0</strong></span>
        <span>Reste : <strong id="tasbih-left">0</strong></span>
      </div>
    `;
    toolBox?.querySelector(".tasbih")?.appendChild(meta);
  }

  const goalSel = document.getElementById("tasbih-goal");

  function renderMeta() {
    const goal = getGoal();
    const cycle = getCycle();
    const today = getDay();
    const left = Math.max(0, goal - cycle);
    const pct = goal ? Math.min(100, Math.round((cycle * 100) / goal)) : 0;

    const todayEl = document.getElementById("tasbih-today");
    const leftEl = document.getElementById("tasbih-left");
    const bar = document.getElementById("tasbih-progress");

    if (todayEl) todayEl.textContent = String(today);
    if (leftEl) leftEl.textContent = String(left);
    if (bar) bar.style.width = `${pct}%`;
    if (goalSel) goalSel.value = String(goal);
  }

  setCycle(getCycle());
  renderMeta();

  plus.onclick = () => {
    const goal = getGoal();
    const next = getCycle() + 1;
    setDay(getDay() + 1);

    if (next >= goal) {
      setCycle(0);
      showStatus(`Objectif ${goal} atteint ✅`, "#16a34a");
    } else {
      setCycle(next);
    }
    renderMeta();
  };

  reset.onclick = () => {
    setCycle(0);
    setDay(0);
    renderMeta();
  };

  if (goalSel) goalSel.onchange = () => setGoal(goalSel.value);
}

/* =========================
   Outils: 10+ items (Hadith/Du'a/Dhikr)
========================= */
const HADITHS = [
  { titleFr: "Intention", ar: "انما الاعمال بالنيات", phon: "Innamal a‘mālu bin-niyyāt", fr: "Les actions valent par les intentions." },
  { titleFr: "Miséricorde", ar: "الراحمون يرحمهم الرحمن", phon: "Ar-rāḥimūna yarḥamuhum ar-Raḥmān", fr: "Les miséricordieux seront traités avec miséricorde." },
  { titleFr: "Faciliter", ar: "يسروا ولا تعسروا", phon: "Yassirū wa lā tu‘assirū", fr: "Facilitez et ne rendez pas difficile." },
  { titleFr: "Fraternité", ar: "المسلم اخو المسلم", phon: "Al-muslim akhū al-muslim", fr: "Le musulman est le frère du musulman." },
  { titleFr: "Sincérité", ar: "الدين النصيحة", phon: "Ad-dīn an-naṣīḥa", fr: "La religion est conseil sincère." },
  { titleFr: "Bon comportement", ar: "خيركم احسنكم اخلاقا", phon: "Khayrukum aḥsanukum akhlāqan", fr: "Les meilleurs sont ceux qui ont le meilleur comportement." },
  { titleFr: "Parole", ar: "فليقل خيرا او ليصمت", phon: "Fal-yaqul khayran aw liyasmut", fr: "Dis du bien ou tais-toi." },
  { titleFr: "Force", ar: "القوي خير واحب الى الله", phon: "Al-qawiy khayr wa aḥabbu ilā Allāh", fr: "Le croyant fort est meilleur et plus aimé d’Allah." },
  { titleFr: "Confiance", ar: "لو توكلتم على الله حق توكله", phon: "Law tawakkaltum ‘alā Allāh ḥaqqa tawakkulih", fr: "Si vous placiez votre confiance en Allah comme il se doit…" },
  { titleFr: "Patience", ar: "الصبر ضياء", phon: "Aṣ-ṣabr ḍiyā’", fr: "La patience est une lumière." },
  { titleFr: "Douceur", ar: "ان الله رفيق يحب الرفق", phon: "Inna Allāha rafīq yuḥibbu ar-rifq", fr: "Allah est Doux et aime la douceur." },
];

const DUAS = [
  { titleFr: "Guidance", ar: "اللهم اهدني ويسر لي", phon: "Allāhumma ihdinī wa yassir lī", fr: "Ô Allah, guide-moi et facilite-moi." },
  { titleFr: "Pardon", ar: "اللهم اغفر لي", phon: "Allāhumma ighfir lī", fr: "Ô Allah, pardonne-moi." },
  { titleFr: "Bien ici-bas", ar: "ربنا آتنا في الدنيا حسنة", phon: "Rabbana ātinā fid-dunyā ḥasana", fr: "Seigneur, accorde-nous une belle part ici-bas." },
  { titleFr: "Bien dans l’au-delà", ar: "وفي الآخرة حسنة", phon: "Wa fil-ākhirati ḥasana", fr: "…et une belle part dans l’au-delà." },
  { titleFr: "Protection Feu", ar: "وقنا عذاب النار", phon: "Wa qinā ‘adhāban-nār", fr: "…et protège-nous du châtiment du Feu." },
  { titleFr: "Sérénité", ar: "اللهم اني اسالك السكينة", phon: "Allāhumma innī as’aluka as-sakīna", fr: "Ô Allah, je Te demande la sérénité." },
  { titleFr: "Santé", ar: "اللهم عافني في بدني", phon: "Allāhumma ‘āfinī fī badanī", fr: "Ô Allah, accorde-moi la santé." },
  { titleFr: "Protection", ar: "اللهم احفظني من الشر", phon: "Allāhumma iḥfaẓnī mina-sh-sharr", fr: "Ô Allah, protège-moi du mal." },
  { titleFr: "Bonne fin", ar: "اللهم حسن خاتمتي", phon: "Allāhumma ḥassin khātimatī", fr: "Ô Allah, accorde-moi une bonne fin." },
  { titleFr: "Soutien", ar: "حسبي الله ونعم الوكيل", phon: "Ḥasbiyallāhu wa ni‘mal-wakīl", fr: "Allah me suffit, Il est le meilleur garant." },
  { titleFr: "Augmente-moi", ar: "رب زدني علما", phon: "Rabbi zidnī ‘ilmā", fr: "Seigneur, augmente-moi en science." },
];

const DHIKR = [
  { titleFr: "Tasbih", ar: "سبحان الله", phon: "Subḥānallāh", fr: "Gloire à Allah." },
  { titleFr: "Hamd", ar: "الحمد لله", phon: "Al-ḥamdu lillāh", fr: "Louange à Allah." },
  { titleFr: "Takbir", ar: "الله اكبر", phon: "Allāhu akbar", fr: "Allah est le Plus Grand." },
  { titleFr: "Tahlil", ar: "لا اله الا الله", phon: "Lā ilāha illā Allāh", fr: "Il n’y a de divinité qu’Allah." },
  { titleFr: "Istighfar", ar: "استغفر الله", phon: "Astaghfirullāh", fr: "Je demande pardon à Allah." },
  { titleFr: "Salat ‘ala Nabi", ar: "اللهم صل على محمد", phon: "Allāhumma ṣalli ‘alā Muḥammad", fr: "Ô Allah, prie sur Muhammad." },
  { titleFr: "Hasbouna", ar: "حسبنا الله ونعم الوكيل", phon: "Ḥasbunallāhu wa ni‘mal-wakīl", fr: "Allah nous suffit, Il est le meilleur garant." },
  { titleFr: "La hawla", ar: "لا حول ولا قوة الا بالله", phon: "Lā ḥawla wa lā quwwata illā billāh", fr: "Nulle force ni puissance sans Allah." },
  { titleFr: "Subhan + Hamd", ar: "سبحان الله وبحمده", phon: "Subḥānallāhi wa biḥamdih", fr: "Gloire et louange à Allah." },
  { titleFr: "Subhan (grand)", ar: "سبحان الله العظيم", phon: "Subḥānallāhi al-‘Aẓīm", fr: "Gloire à Allah l’Immense." },
  { titleFr: "Dua Yunus", ar: "لا اله الا انت سبحانك اني كنت من الظالمين", phon: "Lā ilāha illā anta subḥānaka innī kuntu mina-ẓ-ẓālimīn", fr: "Il n’y a de divinité que Toi… j’étais parmi les injustes." },
];

function injectToolsStylesOnce() {
  if (document.getElementById("mm-tools-style")) return;
  const style = document.createElement("style");
  style.id = "mm-tools-style";
  style.textContent = `
    .mm-pill-row{display:flex;gap:8px;overflow:auto;padding:8px 2px 2px;margin-top:6px;scrollbar-width:none}
    .mm-pill-row::-webkit-scrollbar{display:none}
    .mm-pill{
      border:none;cursor:pointer;border-radius:999px;padding:8px 12px;font-weight:900;white-space:nowrap;
      background:rgba(244,250,248,.9);
      box-shadow:inset 0 0 0 1px rgba(227,240,235,.95);
      color:#1f5e53;font-size:13px;
    }
    body.dark .mm-pill{background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px rgba(255,255,255,.10);color:var(--ink)}
    .mm-pill.active{background:var(--green);color:#fff}
    .mm-tools-stage{margin-top:10px}
    .mm-tools-stage .tool{display:none}
    .mm-tools-stage .tool.mm-active{display:block}
    .mm-mini{font-size:12px;color:var(--muted);font-weight:600;margin-top:-6px}
    .mm-fr{font-size:13px;font-weight:600;line-height:1.35;margin-top:6px}
    .mm-phon{font-size:12px;font-weight:600;line-height:1.35;margin-top:6px;color:var(--muted)}
    .mm-ar{font-size:12px;font-weight:600;line-height:1.35;direction:rtl;text-align:right;margin-top:6px;opacity:.95}
  `;
  document.head.appendChild(style);
}

function dayIndex(listLen) {
  const s = todayKey();
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return listLen ? h % listLen : 0;
}

function pickDaily(list, offsetKey) {
  const base = dayIndex(list.length);
  const off = parseInt(localStorage.getItem(offsetKey) || "0", 10) || 0;
  return list[(base + off) % list.length];
}

function addToolCard(toolKey, toolLabel, iconHtml, list, offsetKey) {
  const toolsGrid = document.querySelector(".tools-grid");
  if (!toolsGrid) return;

  const id = `mm-${toolKey}-card`;
  if (document.getElementById(id)) return;

  const item = pickDaily(list, offsetKey);
  const card = document.createElement("div");
  card.id = id;
  card.className = "tool";
  card.dataset.toolKey = toolKey;
  card.dataset.toolLabel = toolLabel;

  card.innerHTML = `
    <div class="tool-title">${iconHtml} ${toolLabel} du jour</div>
    <div class="mm-mini">${escapeHtml(item.titleFr)}</div>
    <div class="mm-fr">${escapeHtml(item.fr)}</div>
    <div class="mm-phon">${item.phon ? escapeHtml(item.phon) : ""}</div>
    <div class="mm-ar">${escapeHtml(item.ar)}</div>

    <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap">
      <button class="btn btn-primary" data-share="1" style="flex:1; min-width:110px">Partager</button>
      <button class="btn btn-ghost" data-copy="1" style="flex:1; min-width:110px">Copier</button>
      <button class="btn btn-primary" data-change="1" style="flex:1; min-width:110px">Changer</button>
    </div>
  `;

  toolsGrid.appendChild(card);

  card.querySelector('[data-share="1"]').onclick = () => {
    const it = pickDaily(list, offsetKey);
    const msg = `🕌 ${toolLabel} • ${it.titleFr}\n\n${it.ar}\n${it.phon ? it.phon + "\n\n" : "\n"}${it.fr}`;
    openWhatsAppText(msg);
  };

  card.querySelector('[data-copy="1"]').onclick = async () => {
    const it = pickDaily(list, offsetKey);
    const msg = `🕌 ${toolLabel} • ${it.titleFr}\n\n${it.ar}\n${it.phon ? it.phon + "\n\n" : "\n"}${it.fr}`;
    const ok = await copyToClipboard(msg);
    showStatus(ok ? "Copié ✅" : "Impossible de copier.", ok ? "#16a34a" : "#ef4444");
  };

  card.querySelector('[data-change="1"]').onclick = () => {
    const cur = parseInt(localStorage.getItem(offsetKey) || "0", 10) || 0;
    localStorage.setItem(offsetKey, String(cur + 1));
    const next = pickDaily(list, offsetKey);

    card.querySelector(".mm-mini").textContent = next.titleFr;
    card.querySelector(".mm-fr").textContent = next.fr;
    card.querySelector(".mm-phon").textContent = next.phon || "";
    card.querySelector(".mm-ar").textContent = next.ar;

    showStatus(`${toolLabel} changé ✅`, "#16a34a");
  };
}

function setupToolsBubbles() {
  injectToolsStylesOnce();
  const toolsSection = document.querySelector(".card.tools");
  if (!toolsSection) return;

  const grid = toolsSection.querySelector(".tools-grid");
  if (!grid) return;

  const tasbihTool = grid.querySelector("#tasbih-count")?.closest(".tool");
  if (tasbihTool) {
    tasbihTool.dataset.toolKey = "tasbih";
    tasbihTool.dataset.toolLabel = "Tasbih";
  }

  addToolCard("hadith", "Hadith", '<i class="fa-solid fa-book-open"></i>', HADITHS, "hadith_offset");
  addToolCard("dua", "Du\'a", '<i class="fa-solid fa-hands-praying"></i>', DUAS, "dua_offset");
  addToolCard("dhikr", "Dhikr", '<i class="fa-solid fa-circle-dot"></i>', DHIKR, "dhikr_offset");

  if (!document.getElementById("mm-pill-row")) {
    const tools = Array.from(grid.querySelectorAll(".tool"));

    const pillRow = document.createElement("div");
    pillRow.id = "mm-pill-row";
    pillRow.className = "mm-pill-row";

    const stage = document.createElement("div");
    stage.id = "mm-tools-stage";
    stage.className = "mm-tools-stage";

    tools.forEach((t) => stage.appendChild(t));

    grid.innerHTML = "";
    grid.appendChild(pillRow);
    grid.appendChild(stage);

    const order = ["tasbih", "hadith", "dua", "dhikr"];
    order.forEach((key) => {
      const t = Array.from(stage.querySelectorAll(".tool")).find((x) => x.dataset.toolKey === key);
      if (!t) return;
      const pill = document.createElement("button");
      pill.className = "mm-pill";
      pill.dataset.target = key;
      pill.textContent = t.dataset.toolLabel || key;
      pillRow.appendChild(pill);
    });
  }

  const stage = document.getElementById("mm-tools-stage");
  const pillRow = document.getElementById("mm-pill-row");
  if (!stage || !pillRow) return;

  const tools = Array.from(stage.querySelectorAll(".tool"));
  const pills = Array.from(pillRow.querySelectorAll(".mm-pill"));

  const saved = localStorage.getItem("tools_tab") || "tasbih";
  const pick = (key) => {
    localStorage.setItem("tools_tab", key);
    tools.forEach((t) => t.classList.toggle("mm-active", t.dataset.toolKey === key));
    pills.forEach((p) => p.classList.toggle("active", p.dataset.target === key));
  };

  pills.forEach((p) => { p.onclick = () => pick(p.dataset.target); });

  const exists = tools.some((t) => t.dataset.toolKey === saved);
  pick(exists ? saved : "tasbih");
}

/* =========================
   99 Names (déjà OK chez toi si tu as la liste complète)
   (Je laisse tel quel, tu peux garder ta version complète actuelle)
========================= */
const NAMES_99 = [
  { ar: "ٱللَّٰه", fr: "Allah" },
  { ar: "ٱلرَّحْمَٰن", fr: "Ar-Rahman (Le Tout Miséricordieux)" },
  { ar: "ٱلرَّحِيم", fr: "Ar-Rahim (Le Très Miséricordieux)" },
  // ... garde ici ta liste complète 99 si tu l’as déjà
  { ar: "ٱلصَّبُور", fr: "As-Sabur (Le Patient)" },
];

function renderNames99() {
  const list = el("names-list");
  const header = el("names-header");
  if (!list || !header) return;
  header.textContent = "Les 99 Noms d'Allah";
  list.innerHTML = "";
  NAMES_99.forEach((n, idx) => {
    const li = document.createElement("li");
    li.innerHTML = `<span><strong>${idx + 1}.</strong> ${escapeHtml(n.fr)}</span><span style="font-weight:900">${escapeHtml(n.ar)}</span>`;
    list.appendChild(li);
  });
}

/* =========================
   Footer / Events
========================= */
function renderEvents() {
  const box = el("events-list");
  const events = Array.isArray(activeMosque?.events) ? activeMosque.events : [];
  if (!box) return;
  if (!events.length) { box.textContent = "—"; return; }

  const wrap = document.createElement("div");
  wrap.style.display = "grid";
  wrap.style.gap = "8px";

  events.forEach((ev) => {
    const item = document.createElement("div");
    item.style.border = "1px solid rgba(238,242,247,.9)";
    item.style.borderRadius = "12px";
    item.style.padding = "10px 12px";
    item.innerHTML = `<div style="font-weight:900;color:#1f5e53">${escapeHtml(ev.title || "")}</div>
                      <div class="small">${escapeHtml(ev.date || "")}</div>`;
    wrap.appendChild(item);
  });

  box.innerHTML = "";
  box.appendChild(wrap);
}

function setupFooter() {
  el("events-btn").onclick = () => { renderEvents(); openModal("modal-events"); };
  el("announce-btn").onclick = () => openModal("modal-ann");
  el("about-btn").onclick = () => openModal("modal-about");
  el("names-btn").onclick = () => { renderNames99(); openModal("modal-names"); };

  el("share-btn").onclick = () => {
    if (!activeMosque) return;
    const text = `🕌 ${activeMosque.name}\n${el("gregorian-date").textContent}\n\nFajr: ${el("fajr-time").textContent}\nDhuhr: ${el("dhuhr-time").textContent}\nAsr: ${el("asr-time").textContent}\nMaghrib: ${el("maghrib-time").textContent}\nIsha: ${el("isha-time").textContent}\n\n${location.href}`;
    openWhatsAppText(text);
  };
}

/* =========================
   Ramadan hidden
========================= */
function renderRamadan() {
  const card = el("ramadan-card");
  if (!card) return;
  card.style.display = RAMADAN_ENABLED ? "block" : "none";
}

/* =========================
   Admin (logout + save)
========================= */
function ensureLogoutButton() {
  const modal = document.getElementById("modal-admin");
  if (!modal) return;
  const box = modal.querySelector(".box.admin");
  if (!box) return;
  if (document.getElementById("btn-logout")) return;

  const btn = document.createElement("button");
  btn.id = "btn-logout";
  btn.className = "save";
  btn.style.background = "#0f172a";
  btn.style.marginTop = "10px";
  btn.innerHTML = `<i class="fa-solid fa-right-from-bracket"></i> Déconnexion`;

  btn.onclick = async () => {
    await signOut(auth);
    closeAll();
    showStatus("Déconnecté ✅", "#0f172a");
  };

  const saveBtn = document.getElementById("save");
  if (saveBtn?.parentNode) saveBtn.parentNode.insertBefore(btn, saveBtn.nextSibling);
  else box.appendChild(btn);
}

function parseEventsTextarea() {
  const t = el("adm-events");
  if (!t) return [];
  return t.value
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => {
      const [title, ...rest] = l.split("|");
      return { title: (title || "").trim(), date: (rest.join("|") || "").trim() };
    });
}

function mosqueToPayloadFromAdminForm() {
  return {
    name: el("adm-name")?.value?.trim() || "Mosquée",
    city: el("adm-city")?.value || "Medina",
    wave: el("adm-wave")?.value?.trim() || "",
    orange: el("adm-orange")?.value?.trim() || "",
    contact: el("adm-contact")?.value?.trim() || "",
    phone: el("adm-phone")?.value?.trim() || "",
    jumua: el("adm-jumua")?.value || "13:30",
    ann: el("adm-ann")?.value || "",
    events: parseEventsTextarea(),
    goals: { monthly: Math.max(0, parseInt(el("adm-goal")?.value || "0", 10) || 0) },
  };
}

function fillAdminForm() {
  const m = activeMosque;
  if (!m) return;
  el("adm-name").value = m.name || "";
  el("adm-city").value = m.city || "Medina";
  el("adm-wave").value = m.wave || "";
  el("adm-orange").value = m.orange || "";
  el("adm-contact").value = m.contact || "";
  el("adm-phone").value = m.phone || "";
  el("adm-jumua").value = m.jumua || "13:30";
  el("adm-ann").value = m.ann || "";
  el("adm-events").value = (m.events || []).map((e) => `${e.title} | ${e.date}`).join("\n");
  el("adm-goal").value = getMonthlyGoal(m);
  renderReqTable();
}

function setupAdmin() {
  const adminBtn = el("admin-button");
  const saveBtn = el("save");
  if (!adminBtn || !saveBtn) return;

  adminBtn.onclick = async () => {
    ensureLogoutButton();
    if (!auth.currentUser) {
      await promptLogin();
      return;
    }
    fillAdminForm();
    openModal("modal-admin");
  };

  saveBtn.onclick = async () => {
    if (!activeMosque) return;
    if (SESSION_ROLE === "guest") return;
    const payload = mosqueToPayloadFromAdminForm();
    await setDoc(mosqueDocRef(activeMosque.id), payload, { merge: true });
    closeAll();
    showStatus("Enregistré.");
    await fetchTimingsSafe();
  };
}

/* =========================
   Display / Attach mosque
========================= */
function displayAll(data) {
  timingsData = (data && data.timings) ? data.timings : MOCK;
  const m = activeMosque || DEFAULT_MOSQUES[0];

  el("mosque-name").textContent = m.name || "Mosquée";
  el("wave-number").textContent = m.wave || "—";
  el("orange-number").textContent = m.orange || "—";
  el("cash-info").textContent = m.name || "Mosquée";

  el("about-contact-name").textContent = m.contact || "—";
  el("about-contact-phone").textContent = m.phone || "—";

  PRAYER_NAMES.forEach((k) => {
    el(`${k.toLowerCase()}-name`).textContent = `${DISPLAY[k].local} (${DISPLAY[k].ar})`;
    el(`${k.toLowerCase()}-time`).textContent = timingsData[k] || "--:--";
  });

  el("shuruq-time").textContent = timingsData.Sunrise || "--:--";
  el("jumua-time").textContent = m.jumua || "13:30";

  updateNextCountdown();
  renderDonPublic();
  renderReqTable();
  renderEvents();
  renderRamadan();
  refreshMosqueAccessUI();
  populateMosqueSelector();
}

async function attachMosque(mosqueId) {
  if (unsubMosque) { unsubMosque(); unsubMosque = null; }
  if (unsubDonations) { unsubDonations(); unsubDonations = null; }
  latestDonations = [];

  const ref = mosqueDocRef(mosqueId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    activeMosque = DEFAULT_MOSQUES.find((m) => m.id === mosqueId) || DEFAULT_MOSQUES[0];
    setCurrentMosqueId(activeMosque.id);
    displayAll({ timings: MOCK });
    await ensureAutoGeoWarmup();
    await fetchTimingsSafe();
    return;
  }

  activeMosque = { id: snap.id, ...snap.data() };
  setCurrentMosqueId(activeMosque.id);

  displayAll({ timings: MOCK });

  unsubMosque = onSnapshot(ref, async (s) => {
    if (!s.exists()) return;
    activeMosque = { id: s.id, ...s.data() };
    await ensureAutoGeoWarmup();
    await fetchTimingsSafe();
    renderDonPublic();
  });

  refreshMosqueAccessUI();
  populateMosqueSelector();
  await ensureAutoGeoWarmup();
  await fetchTimingsSafe();
}

/* =========================
   PWA: Service Worker register
========================= */
async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js", { scope: "./" });
  } catch (e) {
    console.warn("SW register failed:", e);
  }
}

/* =========================
   Setup
========================= */
function setup() {
  bindModals();
  initTheme();

  injectGeoToggleUI();
  injectAdhanToggleUI();
  ensureAudioUnlock();
  registerServiceWorker();

  setupFooter();
  setupDonButtons();
  setupAdmin();
  setupTasbih();
  setupToolsBubbles();

  updateClock();
  setInterval(updateClock, 1000);
  setInterval(updateNextCountdown, 1000);

  renderDonPublic();
  updateAdminBadge();
  renderRamadan();
}

document.addEventListener("DOMContentLoaded", () => {
  setup();

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      currentUser = null;
      SESSION_ROLE = "guest";
      mosquesCache = [];
      await ensureAutoGeoWarmup();
      await attachMosque(resolveMosqueId());
      return;
    }

    const profile = await loadUserProfile(user.uid);
    if (!profile) {
      await signOut(auth);
      alert("Compte non autorisé (doc users/{uid} manquant ou invalide).");
      return;
    }

    currentUser = profile;
    SESSION_ROLE = profile.role;

    if (SESSION_ROLE === "super") await refreshMosquesCacheForSuper();

    await ensureAutoGeoWarmup();
    await attachMosque(resolveMosqueId());
  });

  ensureAutoGeoWarmup().catch(() => {});
  attachMosque(resolveMosqueId()).catch(console.error);
});
