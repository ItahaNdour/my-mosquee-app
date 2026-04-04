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
const BUILD = "7300";

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

// Ramadan OFF (on réactivera plus tard)
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
   Audio (Adhan step 2: MP3)
========================= */
const ADHAN_ENABLED_KEY = "mm_adhan_enabled_v1";

// Mets ton MP3 ici (dans ton repo) : assets/adhan.mp3
const ADHAN_AUDIO_URL = "./assets/adhan.mp3";

function isAdhanEnabled() {
  return localStorage.getItem(ADHAN_ENABLED_KEY) === "1";
}
function setAdhanEnabled(on) {
  localStorage.setItem(ADHAN_ENABLED_KEY, on ? "1" : "0");
}

function ensureAudioUnlock() {
  if (audioUnlocked) return;

  const unlock = async () => {
    try {
      // iOS: unlock audio context by user gesture
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
    // play() may fail without gesture; we fallback to beep
    await a.play();
    return true;
  } catch (e) {
    console.warn("Adhan MP3 blocked/unavailable, fallback beep:", e);
    playAdhanBeepFallback();
    return false;
  }
}

async function playAdhan() {
  if (!audioUnlocked) return false;
  const ok = await playAdhanMp3();
  return ok;
}

function maybePlayAdhanForPrayer(prayerName) {
  if (!isAdhanEnabled()) return;
  if (!audioUnlocked) return;

  const key = `mm_adhan_${todayKey()}_${prayerName}`;
  if (localStorage.getItem(key) === "1") return;

  localStorage.setItem(key, "1");
  playAdhan().then((ok) => {
    showStatus(ok ? `Adhan MP3 : ${DISPLAY[prayerName]?.local || prayerName}` : `Adhan (fallback) : ${DISPLAY[prayerName]?.local || prayerName}`, "#16a34a");
  });
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
   GPS AUTO (robuste: fallback si refus)
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
   Clock / Countdown + Adhan trigger
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
   Timings via AlAdhan API (fallback sûr)
========================= */
function buildTuneParam(offsets) {
  const a = offsets && offsets.length === 6 ? offsets : [0, 0, 0, 0, 0, 0];
  return a.join(",");
}

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
   Donations
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
   Tasbih + Outils (inchangé)
   ... (ton code outils ici est déjà OK dans ton site actuel)
========================= */
// Ici on ne retouche pas tes outils actuels : ils sont déjà OK chez toi.

/* =========================
   99 names (OK)
========================= */
// Ici on ne retouche pas : déjà OK chez toi.

/* =========================
   Events / Footer / Admin / Display / Attach mosque / Setup
   (inchangé par rapport à ta version stable)
========================= */
// IMPORTANT: comme tu dis "le site est bon", on ne touche pas plus ici.
// Tu gardes exactement ta base stable actuelle pour ces parties.

/* =========================
   Build badge
========================= */
function injectBuildBadge() {
  if (document.getElementById("mm-build")) return;
  const badge = document.createElement("div");
  badge.id = "mm-build";
  badge.style.position = "fixed";
  badge.style.right = "8px";
  badge.style.bottom = "86px";
  badge.style.zIndex = "999";
  badge.style.fontSize = "10px";
  badge.style.opacity = "0.35";
  badge.style.fontWeight = "900";
  badge.textContent = `v${BUILD}`;
  document.body.appendChild(badge);
}

/* =========================
   Minimal init (adhan only)
========================= */
document.addEventListener("DOMContentLoaded", () => {
  ensureAudioUnlock();
  injectAdhanToggleUI();
  injectBuildBadge();
});
