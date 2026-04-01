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

const LOCAL_MIGRATION_KEY = "firestore_migrated_v1";

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
  },
  {
    id: "medina-centre",
    name: "Medina Centre",
    city: "Dakar",
    wave: "770000000",
    orange: "780000000",
    contact: "Imam Ndiaye",
    phone: "+221780000000",
    jumua: "14:00",
    ann: "Annonce importante pour la Medina.",
    events: [{ title: "Cercle de Coran", date: "Samedi après Fajr" }],
    method: 3,
    school: 0,
    offsets: [0, 0, 0, 0, 0, 0],
  },
];

const MOCK = { Fajr: "05:45", Sunrise: "07:00", Dhuhr: "13:30", Asr: "16:45", Maghrib: "19:05", Isha: "20:30" };

/* Ramadan : caché */
const RAMADAN_ENABLED = false;

/* Dons */
const DON_CATEGORIES = ["Zakat", "Sadaqa", "Travaux"];
const DON_CATEGORY_HELP = {
  Zakat: "Zakat : obligation (selon conditions).",
  Sadaqa: "Sadaqa : don libre, pour l’entraide.",
  Travaux: "Travaux : entretien, rénovation, équipement.",
};

/* =========================
   DOM helpers
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
   ✅ GPS settings (Étape 1)
========================= */
const GEO_ENABLED_KEY = "mm_geo_enabled_v1";
const GEO_LAST_KEY = "mm_geo_last_v1"; // JSON {lat, lon, ts}
const GEO_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12h

function isGeoEnabled() {
  return localStorage.getItem(GEO_ENABLED_KEY) === "1";
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

function getCoordsRoundedKey(lat, lon) {
  // arrondi pour cache stable (~1.1km à 2 décimales)
  const r = (x) => Math.round(x * 100) / 100;
  return `${r(lat)}_${r(lon)}`;
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
        } else {
          resolve(null);
        }
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

function injectGeoToggleUI() {
  if (document.getElementById("mm-geo-row")) return;

  const header = document.querySelector(".header");
  const anchor = document.getElementById("mosque-select-row") || document.getElementById("mosque-locked");
  if (!header || !anchor) return;

  const row = document.createElement("div");
  row.id = "mm-geo-row";
  row.style.display = "flex";
  row.style.justifyContent = "center";
  row.style.alignItems = "center";
  row.style.gap = "10px";
  row.style.margin = "8px 0 4px";
  row.innerHTML = `
    <label style="display:flex;align-items:center;gap:8px;font-weight:900;font-size:12px;color:var(--muted)">
      <input id="mm-geo-toggle" type="checkbox" />
      GPS (horaires selon ta position)
    </label>
    <button id="mm-geo-refresh" class="btn btn-ghost" style="padding:8px 10px;min-width:auto">
      Actualiser
    </button>
  `;

  anchor.parentNode.insertBefore(row, anchor.nextSibling);

  const toggle = document.getElementById("mm-geo-toggle");
  const refresh = document.getElementById("mm-geo-refresh");

  if (toggle) {
    toggle.checked = isGeoEnabled();
    toggle.onchange = async () => {
      setGeoEnabled(!!toggle.checked);
      if (toggle.checked) showStatus("GPS activé ✅", "#16a34a");
      else showStatus("GPS désactivé", "#0f172a");
      await fetchTimings();
    };
  }

  if (refresh) {
    refresh.onclick = async () => {
      if (!isGeoEnabled()) {
        showStatus("Active GPS d’abord.", "#ca8a04");
        return;
      }
      showStatus("GPS: recherche…", "#1f5e53");
      await getUserCoordsOnce({ timeoutMs: 9000 });
      await fetchTimings();
    };
  }
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
function openModal(id) { const n = el(id); if (n) n.style.display = "block"; }
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
   Mosque selector
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
   Clock / countdown
========================= */
function updateClock() {
  const n = new Date();
  const time = [n.getHours(), n.getMinutes(), n.getSeconds()].map((v) => String(v).padStart(2, "0")).join(":");
  const date = `${WEEKDAYS[n.getDay()]} ${n.getDate()} ${MONTHS[n.getMonth()]} ${n.getFullYear()}`;
  const t = el("current-time");
  const g = el("gregorian-date");
  if (t) t.textContent = time;
  if (g) g.textContent = date;
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
    const n = el("next-prayer-name");
    const c = el("countdown");
    if (n) n.textContent = "Chargement...";
    if (c) c.textContent = "--:--:--";
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

  const n = el("next-prayer-name");
  const c = el("countdown");
  if (n) n.textContent = `${DISPLAY[name].local.toUpperCase()} (${DISPLAY[name].ar})`;
  if (c) c.textContent = fmt(time - now);

  const item = el(`${name.toLowerCase()}-item`);
  if (item) item.classList.add("current");
}

/* =========================
   Timings API (✅ GPS)
========================= */
async function fetchTimings() {
  if (!activeMosque) return;

  // 1) coords from GPS (if enabled), else city coords
  let coords = null;
  if (isGeoEnabled()) {
    coords = loadLastCoords();
    if (!coords) coords = await getUserCoordsOnce({ timeoutMs: 8000 });
    if (!coords) showStatus("GPS non disponible → ville mosquée.", "#ca8a04");
  }

  const base = coords || (CITY_COORDS[activeMosque.city] || CITY_COORDS.Medina);

  const method = (activeMosque.method != null) ? activeMosque.method : 3;
  const school = (activeMosque.school != null) ? activeMosque.school : 0;
  const tune = buildTuneParam(activeMosque.offsets || [0, 0, 0, 0, 0, 0]);

  const url = `https://api.aladhan.com/v1/timings?latitude=${base.lat}&longitude=${base.lon}&method=${method}&school=${school}&tune=${tune}`;

  // 2) cache depends on coords
  const coordKey = getCoordsRoundedKey(base.lat, base.lon);
  const key = `cache_${activeMosque.id}_${new Date().toDateString()}_${coordKey}`;

  const cached = localStorage.getItem(key);
  let loaded = false;

  if (cached) {
    displayAll(JSON.parse(cached));
    loaded = true;
  }

  try {
    const r = await fetch(url);
    const j = await r.json();
    if (j && j.data) {
      localStorage.setItem(key, JSON.stringify(j.data));
      displayAll(j.data);
      if (coords) showStatus("Horaires GPS ✅", "#16a34a");
    } else throw new Error("bad");
  } catch {
    showStatus(loaded ? "Hors-ligne – cache." : "Données par défaut affichées.", loaded ? "#ca8a04" : "#e11d48");
    if (!loaded) displayAll({ timings: MOCK, date: { hijri: { day: "—", month: { ar: "—" }, year: "—" } } });
  }
}

/* =========================
   Dons (inchangé)
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
        console.error(e);
        alert("Impossible : " + (e?.message || String(e)));
        showStatus("Erreur.", "#ef4444");
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

/* WhatsApp */
function openWhatsApp(to, msg) {
  window.open(`https://wa.me/${encodeURIComponent(to)}?text=${encodeURIComponent(msg)}`, "_blank");
}

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

/* Tasbih minimal (inchangé) */
function setupTasbih() {
  const k = "tasbih_count";
  const countEl = el("tasbih-count");
  const plus = el("tasbih-plus");
  const reset = el("tasbih-reset");
  if (!countEl || !plus || !reset) return;

  const get = () => parseInt(localStorage.getItem(k) || "0", 10) || 0;
  const set = (v) => { localStorage.setItem(k, String(v)); countEl.textContent = String(v); };

  set(get());
  plus.onclick = () => set(get() + 1);
  reset.onclick = () => set(0);
}

/* Ramadan hidden */
function renderRamadan() {
  const card = el("ramadan-card");
  if (!card) return;
  card.style.display = RAMADAN_ENABLED ? "block" : "none";
}

/* Display */
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
  renderRamadan();
  refreshMosqueAccessUI();
  populateMosqueSelector();
}

/* Attach mosque */
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
    fetchTimings();
    return;
  }

  activeMosque = { id: snap.id, ...snap.data() };
  setCurrentMosqueId(activeMosque.id);

  unsubMosque = onSnapshot(ref, (s) => {
    if (!s.exists()) return;
    activeMosque = { id: s.id, ...s.data() };
    refreshMosqueAccessUI();
    populateMosqueSelector();
    fetchTimings();
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
  fetchTimings();
}

/* Setup */
function setup() {
  bindModals();
  initTheme();
  injectGeoToggleUI(); // ✅ inject GPS toggle

  setupDonButtons();
  setupTasbih();

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
    await attachMosque(resolveMosqueId());
  });

  attachMosque(resolveMosqueId()).catch(console.error);
});
