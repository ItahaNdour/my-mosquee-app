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
import * as adhan from "https://cdn.jsdelivr.net/npm/adhan@4.4.3/lib/bundles/adhan.esm.js";

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

let _pageViewLogged = false;

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

let popupTimer = null;
function showPopup(msg, title = "Merci 🙏") {
  const t = el("popup-title");
  const p = el("popup-text");
  if (t) t.textContent = title;
  if (p) p.textContent = msg;
  openModal("modal-popup");
  if (popupTimer) clearTimeout(popupTimer);
  popupTimer = setTimeout(() => closeAll(), 10000);
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
   Tracking events
========================= */
const SESSION_ID_KEY = "mm_session_id_v1";

function getSessionId() {
  let sid = localStorage.getItem(SESSION_ID_KEY);
  if (!sid) {
    sid = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(SESSION_ID_KEY, sid);
  }
  return sid;
}

function sanitizeMeta(meta) {
  const out = {};
  if (!meta || typeof meta !== "object") return out;
  Object.keys(meta).slice(0, 12).forEach((k) => {
    const v = meta[k];
    if (v == null) return;
    if (typeof v === "string") out[k] = v.slice(0, 120);
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
  });
  return out;
}

async function logEvent(type, meta = {}) {
  try {
    await addDoc(collection(db, "events"), {
      type: String(type || "unknown").slice(0, 40),
      mosqueId: activeMosque?.id || resolveMosqueId() || null,
      role: SESSION_ROLE,
      uid: auth.currentUser?.uid || null,
      sessionId: getSessionId(),
      path: location.pathname,
      createdAt: serverTimestamp(),
      meta: sanitizeMeta(meta),
    });
  } catch {}
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
  const lockedName = el("mosque-locked-name");
  const row = el("mosque-select-row");
  if (!locked || !lockedName || !row) return;

  if (canSelectMosque()) {
    locked.style.display = "none";
    row.style.display = "flex";
  } else {
    row.style.display = "none";
    locked.style.display = "inline-flex";
    lockedName.textContent = activeMosque?.name || "—";
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
   Compact header CSS
========================= */
function injectCompactHeaderCss() {
  if (document.getElementById("mm-compact-css")) return;
  const style = document.createElement("style");
  style.id = "mm-compact-css";
  style.textContent = `
    .header{padding:10px !important}
    .title{margin:2px 0 0 !important; font-size:20px !important}
    .dates{margin-top:2px !important}
    .clock{margin:8px 0 6px !important}
    .next{padding:8px 10px !important}
    #mm-geo-row{margin:4px 0 2px !important}
    .sel-row{margin:6px 0 4px !important}
    .mosque-locked{margin:6px auto 2px !important; padding:6px 10px !important}
  `;
  document.head.appendChild(style);
}

/* =========================
   GPS AUTO (no button)
========================= */
const GEO_ENABLED_KEY = "mm_geo_enabled_v5";
const GEO_LAST_KEY = "mm_geo_last_v5";
const GEO_LAST_FETCH_KEY = "mm_geo_last_fetch_v5";
const GEO_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const GEO_FETCH_DEBOUNCE_MS = 30 * 60 * 1000;
const GEO_DEFAULT_ON = true;

function isGeoEnabled() {
  const v = localStorage.getItem(GEO_ENABLED_KEY);
  if (v == null) return GEO_DEFAULT_ON;
  return v === "1";
}
function setGeoEnabled(on) {
  localStorage.setItem(GEO_ENABLED_KEY, on ? "1" : "0");
}

function loadLastCoords() {
  try {
    const raw = localStorage.getItem(GEO_LAST_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj.lat !== "number" || typeof obj.lon !== "number" || typeof obj.ts !== "number") return null;
    if (Date.now() - obj.ts > GEO_CACHE_MAX_AGE_MS) return null;
    return { lat: obj.lat, lon: obj.lon };
  } catch {
    return null;
  }
}
function saveLastCoords(lat, lon) {
  localStorage.setItem(GEO_LAST_KEY, JSON.stringify({ lat, lon, ts: Date.now() }));
}
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

  const anchor = document.getElementById("mosque-select-row") || document.getElementById("mosque-locked");
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
      logEvent("geo_toggle", { on: !!toggle.checked });
      if (toggle.checked) await ensureAutoGeoWarmup();
      await fetchTimings();
    };
  }
}

/* =========================
   Clock / countdown
========================= */
function updateClock() {
  const n = new Date();
  el("current-time").textContent = [n.getHours(), n.getMinutes(), n.getSeconds()].map((v) => String(v).padStart(2, "0")).join(":");
  el("gregorian-date").textContent = `${WEEKDAYS[n.getDay()]} ${n.getDate()} ${MONTHS[n.getMonth()]} ${n.getFullYear()}`;
}

function fmt(ms) {
  if (ms < 0) return "00:00:00";
  const t = Math.floor(ms / 1000);
  const h = Math.floor(t / 3600) % 24;
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

function updateNextCountdown() {
  if (!timingsData) {
    el("next-prayer-name").textContent = "Chargement...";
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

  if (now.getDay() === 5 && activeMosque?.jumua) {
    const hm = parseHM(activeMosque.jumua || "13:30");
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
}

/* =========================
   Timings: local calculation (adhan-js)
========================= */
function pad2(n) { return String(n).padStart(2, "0"); }

function formatHHMM(dateObj) {
  if (!dateObj || !(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return "--:--";
  return `${pad2(dateObj.getHours())}:${pad2(dateObj.getMinutes())}`;
}

function getAsrMadhabFromMosque() {
  return activeMosque?.school === 1 ? adhan.Madhab.Hanafi : adhan.Madhab.Shafi;
}

/**
 * No country mapping:
 * - default MWL
 * - for high latitudes we switch to MoonsightingCommittee + recommended high-lat rule
 */
function getCalcParamsAuto(coords) {
  const lat = coords.latitude;
  const params =
    lat >= 45
      ? adhan.CalculationMethod.MoonsightingCommittee()
      : adhan.CalculationMethod.MuslimWorldLeague();

  params.madhab = getAsrMadhabFromMosque();
  params.highLatitudeRule = adhan.HighLatitudeRule.recommended(coords);

  const off = Array.isArray(activeMosque?.offsets) && activeMosque.offsets.length === 6
    ? activeMosque.offsets
    : [0, 0, 0, 0, 0, 0];

  params.adjustments.fajr = Number(off[0] || 0);
  params.adjustments.sunrise = Number(off[1] || 0);
  params.adjustments.dhuhr = Number(off[2] || 0);
  params.adjustments.asr = Number(off[3] || 0);
  params.adjustments.maghrib = Number(off[4] || 0);
  params.adjustments.isha = Number(off[5] || 0);

  return params;
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

  const coords = new adhan.Coordinates(base.lat, base.lon);
  const params = getCalcParamsAuto(coords);
  const date = new Date();
  const pt = new adhan.PrayerTimes(coords, date, params);

  const timings = {
    Fajr: formatHHMM(pt.fajr),
    Sunrise: formatHHMM(pt.sunrise),
    Dhuhr: formatHHMM(pt.dhuhr),
    Asr: formatHHMM(pt.asr),
    Maghrib: formatHHMM(pt.maghrib),
    Isha: formatHHMM(pt.isha),
  };

  displayAll({
    timings,
    date: { hijri: { day: "—", month: { ar: "—" }, year: "—" } },
  });
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
  showPopup(`Merci pour votre don de ${amount.toLocaleString("fr-FR")} CFA.\nIl est en attente de confirmation.`, "Merci 🙏");
  logEvent("don_submit_pending", { amount, category });
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
        alert("Impossible de valider : " + (e?.message || String(e)));
        showStatus("Erreur validation.", "#ef4444");
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
    logEvent("don_deleted", { donationId });
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
      tx.update(donationRef, { status: "confirmed", confirmedAt: serverTimestamp(), confirmedByUid: auth.currentUser?.uid || null });
      tx.set(mosqueRef, { stats: { monthlySums: sums } }, { merge: true });
    } else if (act === "no") {
      tx.update(donationRef, { status: "rejected" });
    }
  });

  if (act === "ok") logEvent("don_confirmed", { donationId });
  if (act === "no") logEvent("don_rejected", { donationId });
}

/* WhatsApp */
function openWhatsApp(to, msg) {
  window.open(`https://wa.me/${encodeURIComponent(to)}?text=${encodeURIComponent(msg)}`, "_blank");
}

function setupDonButtons() {
  el("don-public-category").onchange = () => updatePublicCategoryHelp();

  el("btn-wave").onclick = () => {
    const m = activeMosque;
    const cat = getPublicCategory();
    logEvent("don_click_wave", { category: cat });
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
    logEvent("don_click_orange", { category: cat });
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
   Tasbih (no vibration)
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
  if (toolBox) {
    toolBox.dataset.toolKey = "tasbih";
    toolBox.dataset.toolLabel = "Tasbih";
  }

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
        <select id="tasbih-goal" style="padding:6px 10px;border-radius:10px;border:1px solid rgba(229,231,235,.7);font-weight:900">
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
   Tools bubbles (Hadith/Du'a/Dhikr)
========================= */
const HADITHS = [
  { titleFr: "Patience", ar: "الصَّبْرُ ضِيَاءٌ", phon: "As-sabr ḍiyā’", fr: "La patience est une lumière." },
  { titleFr: "Parole", ar: "فَلْيَقُلْ خَيْرًا أَوْ لِيَصْمُتْ", phon: "Fal-yaqul khayran aw liyasmut", fr: "Dis du bien ou tais-toi." },
];

const DUAS = [
  { titleFr: "Guidance", ar: "اللَّهُمَّ اهْدِنِي وَيَسِّرْ لِي", phon: "Allāhumma ihdinī wa yassir lī", fr: "Ô Allah, guide-moi et facilite-moi." },
  { titleFr: "Protection", ar: "اللَّهُمَّ احْفَظْنِي مِنَ الشَّرِّ", phon: "Allāhumma ihfaẓnī mina-sh-sharr", fr: "Ô Allah, protège-moi du mal." },
];

const DHIKR = [
  { titleFr: "Tasbih", ar: "سُبْحَانَ اللَّهِ وَبِحَمْدِهِ", phon: "Subḥānallāhi wa biḥamdih", fr: "Gloire à Allah et louange à Lui." },
  { titleFr: "Tahlil", ar: "لَا إِلَهَ إِلَّا اللَّهُ", phon: "Lā ilāha illā Allāh", fr: "Il n’y a de divinité qu’Allah." },
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

function ensureDailyModal() {
  if (document.getElementById("modal-daily")) return;

  const modal = document.createElement("div");
  modal.id = "modal-daily";
  modal.className = "modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.innerHTML = `
    <div class="box">
      <span class="close">&times;</span>
      <h3 id="mm-daily-title">—</h3>
      <div id="mm-daily-ar" style="margin-top:10px;font-weight:700;font-size:16px;line-height:1.5;direction:rtl;text-align:right"></div>
      <div id="mm-daily-phon" style="margin-top:8px;font-weight:600;font-size:13px;line-height:1.35;color:var(--muted)"></div>
      <div id="mm-daily-fr" style="margin-top:10px;font-weight:600;font-size:14px;line-height:1.5"></div>
      <button id="mm-daily-share" class="save" style="margin-top:12px;background:var(--green)">
        <i class="fa-brands fa-whatsapp"></i> Partager
      </button>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector(".close").addEventListener("click", closeAll);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeAll(); });

  document.getElementById("mm-daily-share").onclick = () => {
    const t = document.getElementById("mm-daily-title")?.textContent || "";
    const ar = document.getElementById("mm-daily-ar")?.textContent || "";
    const phon = document.getElementById("mm-daily-phon")?.textContent || "";
    const fr = document.getElementById("mm-daily-fr")?.textContent || "";
    const msg = `🕌 ${t}\n\n${ar}\n${phon}\n\n${fr}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };
}

function openDaily(kind) {
  ensureDailyModal();
  const map = {
    hadith: { label: "Hadith", list: HADITHS, key: "hadith_offset", emoji: "📜" },
    dua: { label: "Du'a", list: DUAS, key: "dua_offset", emoji: "🤲" },
    dhikr: { label: "Dhikr", list: DHIKR, key: "dhikr_offset", emoji: "🧿" },
  };
  const cfg = map[kind];
  if (!cfg) return;

  const item = pickDaily(cfg.list, cfg.key);

  document.getElementById("mm-daily-title").textContent = `${cfg.emoji} ${cfg.label} du jour • ${item.titleFr}`;
  document.getElementById("mm-daily-ar").textContent = item.ar || "";
  document.getElementById("mm-daily-phon").textContent = item.phon ? `Phonétique : ${item.phon}` : "";
  document.getElementById("mm-daily-fr").textContent = item.fr || "";

  logEvent("tools_read", { tool: kind });
  openModal("modal-daily");
}

function addToolCard(id, toolKey, toolLabel, iconHtml, list, offsetKey) {
  const toolsGrid = document.querySelector(".tools-grid");
  if (!toolsGrid) return;
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

    <div style="margin-top:10px; display:flex; gap:8px">
      <button class="btn btn-primary" data-read="1" style="flex:1">Lire</button>
      <button class="btn btn-ghost" data-change="1" style="flex:1">Changer</button>
    </div>
  `;

  toolsGrid.appendChild(card);

  card.querySelector('[data-read="1"]').onclick = () => openDaily(toolKey);
  card.querySelector('[data-change="1"]').onclick = () => {
    const cur = parseInt(localStorage.getItem(offsetKey) || "0", 10) || 0;
    localStorage.setItem(offsetKey, String(cur + 1));
    const next = pickDaily(list, offsetKey);

    card.querySelector(".mm-mini").textContent = next.titleFr;
    card.querySelector(".mm-fr").textContent = next.fr;
    card.querySelector(".mm-phon").textContent = next.phon || "";
    card.querySelector(".mm-ar").textContent = next.ar;

    showStatus(`${toolLabel} changé ✅`, "#16a34a");
    logEvent("tools_change_daily", { tool: toolKey });
  };
}

function setupToolsBubbles() {
  injectToolsStylesOnce();

  const toolsSection = document.querySelector(".card.tools");
  if (!toolsSection) return;

  const grid = toolsSection.querySelector(".tools-grid");
  if (!grid) return;

  addToolCard("mm-hadith-card", "hadith", "Hadith", '<i class="fa-solid fa-book-open"></i>', HADITHS, "hadith_offset");
  addToolCard("mm-dua-card", "dua", "Du\'a", '<i class="fa-solid fa-hands-praying"></i>', DUAS, "dua_offset");
  addToolCard("mm-dhikr-card", "dhikr", "Dhikr", '<i class="fa-solid fa-circle-dot"></i>', DHIKR, "dhikr_offset");

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

    const seen = new Set();
    Array.from(stage.querySelectorAll(".tool")).forEach((t) => {
      const key = t.dataset.toolKey;
      if (!key || seen.has(key)) return;
      seen.add(key);

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
    logEvent("tools_tab", { tab: key });
  };

  pills.forEach((p) => { p.onclick = () => pick(p.dataset.target); });

  const exists = tools.some((t) => t.dataset.toolKey === saved);
  pick(exists ? saved : (tools[0]?.dataset.toolKey || "hadith"));
}

/* =========================
   99 Names (complete)
========================= */
const NAMES_99 = [
  { ar: "ٱللَّٰه", fr: "Allah" },
  { ar: "ٱلرَّحْمَٰن", fr: "Ar-Rahman (Le Tout Miséricordieux)" },
  { ar: "ٱلرَّحِيم", fr: "Ar-Rahim (Le Très Miséricordieux)" },
  { ar: "ٱلْمَلِك", fr: "Al-Malik (Le Souverain)" },
  { ar: "ٱلْقُدُّوس", fr: "Al-Quddus (Le Saint)" },
  { ar: "ٱلسَّلَام", fr: "As-Salam (La Paix)" },
  { ar: "ٱلْمُؤْمِن", fr: "Al-Mu’min (Le Garant)" },
  { ar: "ٱلْمُهَيْمِن", fr: "Al-Muhaymin (Le Protecteur)" },
  { ar: "ٱلْعَزِيز", fr: "Al-‘Aziz (Le Tout-Puissant)" },
  { ar: "ٱلْجَبَّار", fr: "Al-Jabbar (Le Contraignant)" },
  { ar: "ٱلْمُتَكَبِّر", fr: "Al-Mutakabbir (Le Suprême)" },
  { ar: "ٱلْخَالِق", fr: "Al-Khaliq (Le Créateur)" },
  { ar: "ٱلْبَارِئ", fr: "Al-Bari’ (Le Producteur)" },
  { ar: "ٱلْمُصَوِّر", fr: "Al-Musawwir (Le Formateur)" },
  { ar: "ٱلْغَفَّار", fr: "Al-Ghaffar (Le Grand Pardonneur)" },
  { ar: "ٱلْقَهَّار", fr: "Al-Qahhar (Le Dominateur)" },
  { ar: "ٱلْوَهَّاب", fr: "Al-Wahhab (Le Donateur)" },
  { ar: "ٱلرَّزَّاق", fr: "Ar-Razzaq (Le Pourvoyeur)" },
  { ar: "ٱلْفَتَّاح", fr: "Al-Fattah (L’Ouvreur)" },
  { ar: "ٱلْعَلِيم", fr: "Al-‘Alim (L’Omniscient)" },
  { ar: "ٱلْقَابِض", fr: "Al-Qabid (Celui qui Retient)" },
  { ar: "ٱلْبَاسِط", fr: "Al-Basit (Celui qui Étend)" },
  { ar: "ٱلْخَافِض", fr: "Al-Khafid (Celui qui Abaisse)" },
  { ar: "ٱلرَّافِع", fr: "Ar-Rafi‘ (Celui qui Élève)" },
  { ar: "ٱلْمُعِزّ", fr: "Al-Mu‘izz (Celui qui Honore)" },
  { ar: "ٱلْمُذِلّ", fr: "Al-Mudhill (Celui qui Humilie)" },
  { ar: "ٱلسَّمِيع", fr: "As-Sami‘ (L’Audient)" },
  { ar: "ٱلْبَصِير", fr: "Al-Basir (Le Clairvoyant)" },
  { ar: "ٱلْحَكَم", fr: "Al-Hakam (Le Juge)" },
  { ar: "ٱلْعَدْل", fr: "Al-‘Adl (Le Juste)" },
  { ar: "ٱللَّطِيف", fr: "Al-Latif (Le Subtil)" },
  { ar: "ٱلْخَبِير", fr: "Al-Khabir (Le Parfaitement Connaisseur)" },
  { ar: "ٱلْحَلِيم", fr: "Al-Halim (Le Longanime)" },
  { ar: "ٱلْعَظِيم", fr: "Al-‘Azim (L’Immense)" },
  { ar: "ٱلْغَفُور", fr: "Al-Ghafur (Le Pardonneur)" },
  { ar: "ٱلشَّكُور", fr: "Ash-Shakur (Le Reconnaissant)" },
  { ar: "ٱلْعَلِيّ", fr: "Al-‘Aliyy (Le Très-Haut)" },
  { ar: "ٱلْكَبِير", fr: "Al-Kabir (Le Très-Grand)" },
  { ar: "ٱلْحَفِيظ", fr: "Al-Hafiz (Le Gardien)" },
  { ar: "ٱلْمُقِيت", fr: "Al-Muqit (Le Nourricier)" },
  { ar: "ٱلْحَسِيب", fr: "Al-Hasib (Celui qui Suffit)" },
  { ar: "ٱلْجَلِيل", fr: "Al-Jalil (Le Majestueux)" },
  { ar: "ٱلْكَرِيم", fr: "Al-Karim (Le Généreux)" },
  { ar: "ٱلرَّقِيب", fr: "Ar-Raqib (Le Vigilant)" },
  { ar: "ٱلْمُجِيب", fr: "Al-Mujib (Celui qui Exauce)" },
  { ar: "ٱلْوَاسِع", fr: "Al-Wasi‘ (L’Immense)" },
  { ar: "ٱلْحَكِيم", fr: "Al-Hakim (Le Sage)" },
  { ar: "ٱلْوَدُود", fr: "Al-Wadud (Le Bien-Aimant)" },
  { ar: "ٱلْمَجِيد", fr: "Al-Majid (Le Glorieux)" },
  { ar: "ٱلْبَاعِث", fr: "Al-Ba‘ith (Le Ressusciteur)" },
  { ar: "ٱلشَّهِيد", fr: "Ash-Shahid (Le Témoin)" },
  { ar: "ٱلْحَقّ", fr: "Al-Haqq (La Vérité)" },
  { ar: "ٱلْوَكِيل", fr: "Al-Wakil (Le Garant)" },
  { ar: "ٱلْقَوِيّ", fr: "Al-Qawiyy (Le Fort)" },
  { ar: "ٱلْمَتِين", fr: "Al-Matin (Le Très-Ferme)" },
  { ar: "ٱلْوَلِيّ", fr: "Al-Waliyy (Le Protecteur)" },
  { ar: "ٱلْحَمِيد", fr: "Al-Hamid (Le Digne de Louange)" },
  { ar: "ٱلْمُحْصِي", fr: "Al-Muhsi (Celui qui Dénombre)" },
  { ar: "ٱلْمُبْدِئ", fr: "Al-Mubdi’ (Celui qui Initie)" },
  { ar: "ٱلْمُعِيد", fr: "Al-Mu‘id (Celui qui Répète)" },
  { ar: "ٱلْمُحْيِي", fr: "Al-Muhyi (Celui qui Donne la Vie)" },
  { ar: "ٱلْمُمِيت", fr: "Al-Mumit (Celui qui Donne la Mort)" },
  { ar: "ٱلْحَيّ", fr: "Al-Hayy (Le Vivant)" },
  { ar: "ٱلْقَيُّوم", fr: "Al-Qayyum (L’Auto-subsistant)" },
  { ar: "ٱلْوَاجِد", fr: "Al-Wajid (Le Riche)" },
  { ar: "ٱلْمَاجِد", fr: "Al-Majid (Le Noble)" },
  { ar: "ٱلْوَاحِد", fr: "Al-Wahid (L’Unique)" },
  { ar: "ٱلْأَحَد", fr: "Al-Ahad (L’Un)" },
  { ar: "ٱلصَّمَد", fr: "As-Samad (Le Seul à être Imploré)" },
  { ar: "ٱلْقَادِر", fr: "Al-Qadir (Le Capable)" },
  { ar: "ٱلْمُقْتَدِر", fr: "Al-Muqtadir (Le Très-Puissant)" },
  { ar: "ٱلْمُقَدِّم", fr: "Al-Muqaddim (Celui qui Avance)" },
  { ar: "ٱلْمُؤَخِّر", fr: "Al-Mu’akhkhir (Celui qui Retarde)" },
  { ar: "ٱلْأَوَّل", fr: "Al-Awwal (Le Premier)" },
  { ar: "ٱلْآخِر", fr: "Al-Akhir (Le Dernier)" },
  { ar: "ٱلظَّاهِر", fr: "Az-Zahir (L’Apparent)" },
  { ar: "ٱلْبَاطِن", fr: "Al-Batin (Le Caché)" },
  { ar: "ٱلْوَالِي", fr: "Al-Wali (Le Gouverneur)" },
  { ar: "ٱلْمُتَعَالِي", fr: "Al-Muta‘ali (Le Très-Élevé)" },
  { ar: "ٱلْبَرّ", fr: "Al-Barr (Le Bienfaisant)" },
  { ar: "ٱلتَّوَّاب", fr: "At-Tawwab (Celui qui Accepte le Repentir)" },
  { ar: "ٱلْمُنْتَقِم", fr: "Al-Muntaqim (Le Vengeur)" },
  { ar: "ٱلْعَفُوّ", fr: "Al-‘Afuww (L’Indulgent)" },
  { ar: "ٱلرَّؤُوف", fr: "Ar-Ra’uf (Le Compatissant)" },
  { ar: "مَالِكُ ٱلْمُلْك", fr: "Malik-ul-Mulk (Maître du Royaume)" },
  { ar: "ذُو ٱلْجَلَالِ وَٱلْإِكْرَام", fr: "Dhul-Jalali wal-Ikram (Majesté & Générosité)" },
  { ar: "ٱلْمُقْسِط", fr: "Al-Muqsit (L’Équitable)" },
  { ar: "ٱلْجَامِع", fr: "Al-Jami‘ (Le Rassembleur)" },
  { ar: "ٱلْغَنِيّ", fr: "Al-Ghaniyy (Le Riche)" },
  { ar: "ٱلْمُغْنِي", fr: "Al-Mughni (Celui qui Enrichit)" },
  { ar: "ٱلْمَانِع", fr: "Al-Mani‘ (Le Protecteur)" },
  { ar: "ٱلضَّارّ", fr: "Ad-Darr (Celui qui Nuit)" },
  { ar: "ٱلنَّافِع", fr: "An-Nafi‘ (Celui qui Profite)" },
  { ar: "ٱلنُّور", fr: "An-Nur (La Lumière)" },
  { ar: "ٱلْهَادِي", fr: "Al-Hadi (Le Guide)" },
  { ar: "ٱلْبَدِيع", fr: "Al-Badi‘ (L’Incomparable)" },
  { ar: "ٱلْبَاقِي", fr: "Al-Baqi (L’Éternel)" },
  { ar: "ٱلْوَارِث", fr: "Al-Warith (L’Héritier)" },
  { ar: "ٱلرَّشِيد", fr: "Ar-Rashid (Le Bien-Guide)" },
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
   Footer + Events
========================= */
function renderEvents() {
  const m = activeMosque;
  const box = el("events-list");
  const events = Array.isArray(m?.events) ? m.events : [];
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
  el("events-btn").onclick = () => { renderEvents(); openModal("modal-events"); logEvent("open_events"); };

  el("announce-btn").onclick = () => {
    openModal("modal-ann");
    if (!activeMosque) return;
    localStorage.setItem(`annSeen_${activeMosque.id}_${todayKey()}`, "1");
    el("notif").style.display = "none";
    logEvent("open_announcements");
  };

  el("about-btn").onclick = () => { openModal("modal-about"); logEvent("open_about"); };

  el("names-btn").onclick = () => {
    renderNames99();
    openModal("modal-names");
    logEvent("open_names99");
  };

  el("share-btn").onclick = () => {
    if (!activeMosque) return;
    const text = `🕌 ${activeMosque.name}\n${el("gregorian-date").textContent}\n\nFajr: ${el("fajr-time").textContent}\nDhuhr: ${el("dhuhr-time").textContent}\nAsr: ${el("asr-time").textContent}\nMaghrib: ${el("maghrib-time").textContent}\nIsha: ${el("isha-time").textContent}\n\n${location.href}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    logEvent("share_whatsapp");
  };
}

/* =========================
   Ramadan (hidden)
========================= */
function renderRamadan() {
  const card = el("ramadan-card");
  if (!card) return;
  card.style.display = RAMADAN_ENABLED ? "block" : "none";
}

/* =========================
   Display
========================= */
function displayAll(data) {
  timingsData = (data && data.timings) ? data.timings : MOCK;
  const m = activeMosque || DEFAULT_MOSQUES[0];

  el("mosque-name").textContent = m.name;
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

  if (data && data.date && data.date.hijri) {
    el("hijri-date").textContent = `${data.date.hijri.day} ${data.date.hijri.month.ar} ${data.date.hijri.year} AH`;
  } else {
    el("hijri-date").textContent = "—";
  }

  const ann = String(m.ann || "").trim();
  el("announcement-text").textContent = ann || "Aucune annonce.";
  const seenKey = `annSeen_${m.id}_${todayKey()}`;
  el("notif").style.display = (ann && !localStorage.getItem(seenKey)) ? "inline-block" : "none";

  updatePublicCategoryHelp();
  updateNextCountdown();
  renderDonPublic();
  renderReqTable();
  renderEvents();
  renderRamadan();
  refreshMosqueAccessUI();
  populateMosqueSelector();
}

/* =========================
   Admin (panel + logout + save mosque)
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
    logEvent("admin_logout");
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
    logEvent("admin_open_panel");
  };

  saveBtn.onclick = async () => {
    if (!activeMosque) return;
    if (SESSION_ROLE === "guest") return;

    const payload = mosqueToPayloadFromAdminForm();
    await setDoc(mosqueDocRef(activeMosque.id), payload, { merge: true });
    closeAll();
    showStatus("Enregistré.");
    logEvent("mosque_saved", { mosqueId: activeMosque.id });
  };
}

/* =========================
   Attach mosque + subscriptions
========================= */
async function attachMosque(mosqueId) {
  if (unsubMosque) { unsubMosque(); unsubMosque = null; }
  if (unsubDonations) { unsubDonations(); unsubDonations = null; }
  latestDonations = [];

  const ref = mosqueDocRef(mosqueId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    activeMosque = DEFAULT_MOSQUES.find((m) => m.id === mosqueId) || DEFAULT_MOSQUES[0];
    setCurrentMosqueId(activeMosque.id);
    refreshMosqueAccessUI();
    populateMosqueSelector();
    await ensureAutoGeoWarmup();
    await fetchTimings();
    return;
  }

  activeMosque = { id: snap.id, ...snap.data() };
  setCurrentMosqueId(activeMosque.id);

  unsubMosque = onSnapshot(ref, async (s) => {
    if (!s.exists()) return;
    activeMosque = { id: s.id, ...s.data() };
    refreshMosqueAccessUI();
    populateMosqueSelector();
    await ensureAutoGeoWarmup();
    await fetchTimings();
    renderDonPublic();
  });

  if (SESSION_ROLE !== "guest") {
    const q = query(donationsColRef(mosqueId), orderBy("createdAt", "desc"), limit(200));
    unsubDonations = onSnapshot(q, (qs) => {
      latestDonations = qs.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderReqTable();
      updateAdminBadge();
      renderDonPublic();
    });
  }

  refreshMosqueAccessUI();
  populateMosqueSelector();
  await ensureAutoGeoWarmup();
  await fetchTimings();
}

/* =========================
   Setup
========================= */
function setup() {
  bindModals();
  initTheme();

  injectCompactHeaderCss();
  injectGeoToggleUI();

  setupFooter();
  setupDonButtons();
  setupAdmin();
  setupTasbih();
  setupToolsBubbles();

  updateClock();
  setInterval(updateClock, 1000);
  setInterval(updateNextCountdown, 1000);

  updatePublicCategoryHelp();
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

      if (!_pageViewLogged) {
        _pageViewLogged = true;
        logEvent("page_view", { forced: !!getUrlMosqueId() });
      }
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

    if (!_pageViewLogged) {
      _pageViewLogged = true;
      logEvent("page_view", { forced: !!getUrlMosqueId(), role: SESSION_ROLE });
    }
  });

  ensureAutoGeoWarmup().catch(() => {});
  attachMosque(resolveMosqueId()).catch(console.error);
});
