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

let mosquesCache = []; // super only
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
    goals: { monthly: 500000 },
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

/* Ramadan disabled */
const RAMADAN_ENABLED = false;
const RAMADAN_START_DATE = "2026-02-18";
const RAMADAN_TOTAL_DAYS = 30;

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
   Profile / roles
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
    o.textContent = m.name;
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
    el("next-prayer-name").textContent = "Chargement…";
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
   Timings API
========================= */
function mockData() {
  return { timings: MOCK, date: { hijri: { day: "3", month: { ar: "Rabi' al-Awwal" }, year: "1447" } } };
}

async function fetchTimings() {
  if (!activeMosque) return;

  const base = CITY_COORDS[activeMosque.city] || CITY_COORDS.Medina;
  const method = (activeMosque.method != null) ? activeMosque.method : 3;
  const school = (activeMosque.school != null) ? activeMosque.school : 0;
  const tune = buildTuneParam(activeMosque.offsets || [0, 0, 0, 0, 0, 0]);

  const url = `https://api.aladhan.com/v1/timings?latitude=${base.lat}&longitude=${base.lon}&method=${method}&school=${school}&tune=${tune}`;

  const key = `cache_${activeMosque.id}_${new Date().toDateString()}`;
  const cached = localStorage.getItem(key);
  let loaded = false;

  if (cached) { displayAll(JSON.parse(cached)); loaded = true; }

  try {
    const r = await fetch(url);
    const j = await r.json();
    if (j && j.data) {
      localStorage.setItem(key, JSON.stringify(j.data));
      displayAll(j.data);
    } else {
      throw new Error("bad");
    }
  } catch {
    showStatus(loaded ? "Hors-ligne – cache." : "Données par défaut affichées.", loaded ? "#ca8a04" : "#e11d48");
    if (!loaded) displayAll(mockData());
  }
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
}

function pendingCount() { return latestDonations.filter((x) => x.status === "pending").length; }

function updateAdminBadge() {
  const b = el("admin-badge");
  const n = pendingCount();
  if (!b) return;
  if (n > 0) { b.textContent = String(n); b.style.display = "inline-block"; }
  else b.style.display = "none";
}

function formatDonationRow(d) {
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

  return `
    <td>${ddmmyy(ts)}</td>
    <td><strong>${Number(d.amount || 0).toLocaleString("fr-FR")}</strong></td>
    <td><strong>${escapeHtml(normalizeCategory(d.category))}</strong></td>
    <td>${escapeHtml(d.ref || "")}</td>
    <td>${st}</td>
    <td style="white-space:nowrap">${action}</td>
  `;
}

function renderReqTable() {
  const tb = document.querySelector("#req-table tbody");
  if (!tb) return;

  tb.innerHTML = "";
  latestDonations.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = formatDonationRow(r);
    tb.appendChild(tr);
  });

  tb.querySelectorAll("button[data-act]").forEach((b) => {
    b.onclick = async () => {
      try {
        await setReqStatus(b.dataset.id, b.dataset.act);
        showStatus("Mise à jour OK.", "#16a34a");
      } catch (e) {
        console.error(e);
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
    return;
  }

  await runTransaction(db, async (tx) => {
    // READS first
    const donationSnap = await tx.get(donationRef);
    if (!donationSnap.exists()) return;

    const d = donationSnap.data();
    if (d.status !== "pending") return;

    const mosqueSnap = await tx.get(mosqueRef);
    const mosqueData = mosqueSnap.exists() ? mosqueSnap.data() : {};
    const sums = { ...(mosqueData.stats?.monthlySums || {}) };
    const key = ymKey();

    // WRITES after
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
   WhatsApp buttons
========================= */
function openWhatsApp(to, msg) {
  window.open(`https://wa.me/${encodeURIComponent(to)}?text=${encodeURIComponent(msg)}`, "_blank");
}

function setupDonButtons() {
  el("don-public-category").onchange = () => updatePublicCategoryHelp();

  el("btn-wave").onclick = () => {
    const m = activeMosque;
    const cat = getPublicCategory();
    openWhatsApp(m?.phone || "", `Salam, je souhaite faire un don via *Wave Money*.\nCatégorie : *${cat}*\nMontant : [à renseigner] CFA\nNuméro Wave : ${m?.wave || ""}\nMosquée : ${m?.name || ""}\nBarakAllahou fik.`);
  };

  el("btn-orange").onclick = () => {
    const m = activeMosque;
    const cat = getPublicCategory();
    openWhatsApp(m?.phone || "", `Salam, je souhaite faire un don via *Orange Money*.\nCatégorie : *${cat}*\nMontant : [à renseigner] CFA\nNuméro Orange : ${m?.orange || ""}\nMosquée : ${m?.name || ""}\nBarakAllahou fik.`);
  };

  el("btn-claimed").onclick = () => openDonModal();
  el("don-confirm").onclick = () => submitDonationRequest().catch((e) => alert(e?.message || "Erreur"));
}

/* =========================
   Tasbih
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
  plus.onclick = () => set(get() + 1);
  reset.onclick = () => set(0);
}

/* =========================
   Ramadan
========================= */
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

  if (!RAMADAN_ENABLED) {
    card.style.display = "none";
    return;
  }

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
  el("ramadan-duration").textContent = `Durée du jeûne: ${formatFastingDurationShort(suhoor, iftar)}`;

  card.style.display = "block";
}

/* =========================
   Footer buttons
========================= */
function renderEvents() {
  const box = el("events-list");
  const events = Array.isArray(activeMosque?.events) ? activeMosque.events : [];
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

  el("announce-btn").onclick = () => {
    openModal("modal-ann");
    if (!activeMosque) return;
    localStorage.setItem(`annSeen_${activeMosque.id}_${todayKey()}`, "1");
    el("notif").style.display = "none";
  };

  el("about-btn").onclick = () => openModal("modal-about");
  el("names-btn").onclick = () => openModal("modal-names");

  el("share-btn").onclick = () => {
    if (!activeMosque) return;
    const text = `🕌 ${activeMosque.name}\n${el("gregorian-date").textContent}\n\nFajr: ${el("fajr-time").textContent}\nDhuhr: ${el("dhuhr-time").textContent}\nAsr: ${el("asr-time").textContent}\nMaghrib: ${el("maghrib-time").textContent}\nIsha: ${el("isha-time").textContent}\n\n${location.href}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };
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
   Local fallback + migration
========================= */
function loadLocalMosques() {
  let arr = JSON.parse(localStorage.getItem("mosques") || "null");
  if (!arr || !arr.length) {
    arr = DEFAULT_MOSQUES;
    localStorage.setItem("mosques", JSON.stringify(arr));
  }
  return arr;
}

function loadLocalDonationReq(mosqueId) {
  return JSON.parse(localStorage.getItem(`donreq_${mosqueId}`) || "[]");
}

async function maybeMigrateLocalStorageToFirestore() {
  if (localStorage.getItem(LOCAL_MIGRATION_KEY)) return;

  const localMosques = loadLocalMosques();
  const allowedMosques = currentUser?.role === "super"
    ? localMosques
    : localMosques.filter((m) => m.id === currentUser?.mosqueId);

  for (const m of allowedMosques) {
    try {
      const ref = mosqueDocRef(m.id);
      const exists = await getDoc(ref);

      if (!exists.exists()) {
        await setDoc(ref, {
          name: m.name || "Mosquée",
          city: m.city || "Medina",
          wave: m.wave || "",
          orange: m.orange || "",
          contact: m.contact || "",
          phone: m.phone || "",
          jumua: m.jumua || "13:30",
          ann: m.ann || "",
          events: Array.isArray(m.events) ? m.events : [],
          method: (m.method != null) ? m.method : 3,
          school: (m.school != null) ? m.school : 0,
          offsets: Array.isArray(m.offsets) ? m.offsets : [0, 0, 0, 0, 0, 0],
          goals: { monthly: Number(m.goals?.monthly || 500000) },
        }, { merge: true });
      }

      const localReq = loadLocalDonationReq(m.id).slice(0, 200);
      for (const r of localReq) {
        await addDoc(donationsColRef(m.id), {
          amount: Number(r.amount || 0),
          category: normalizeCategory(r.category),
          ref: String(r.ref || ""),
          status: r.status === "ok" ? "confirmed" : (r.status === "no" ? "rejected" : "pending"),
          createdAt: serverTimestamp(),
          mosqueId: m.id,
        });
      }
    } catch {
      // ignore
    }
  }

  localStorage.setItem(LOCAL_MIGRATION_KEY, "1");
}

/* =========================
   Attach mosque (robust)
========================= */
async function attachMosque(mosqueId) {
  if (unsubMosque) { unsubMosque(); unsubMosque = null; }
  if (unsubDonations) { unsubDonations(); unsubDonations = null; }
  latestDonations = [];

  const localArr = loadLocalMosques();
  const localFallback = localArr.find((m) => m.id === mosqueId) || localArr[0] || DEFAULT_MOSQUES[0];

  try {
    const ref = mosqueDocRef(mosqueId);
    const snap = await getDoc(ref);
    activeMosque = snap.exists() ? { id: snap.id, ...snap.data() } : localFallback;
    setCurrentMosqueId(activeMosque.id);

    unsubMosque = onSnapshot(mosqueDocRef(activeMosque.id), (s) => {
      if (!s.exists()) return;
      activeMosque = { id: s.id, ...s.data() };
      refreshMosqueAccessUI();
      populateMosqueSelector();
      fetchTimings();
      renderDonPublic();
    }, () => {});

    if (SESSION_ROLE !== "guest") {
      const q = query(donationsColRef(activeMosque.id), orderBy("createdAt", "desc"), limit(200));
      unsubDonations = onSnapshot(q, (qs) => {
        latestDonations = qs.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderReqTable();
        renderDonPublic();
      }, () => {});
    }
  } catch {
    activeMosque = localFallback;
    setCurrentMosqueId(activeMosque.id);
  }

  refreshMosqueAccessUI();
  populateMosqueSelector();
  fetchTimings();
}

/* =========================
   Super admin UX + CRUD mosques
========================= */
function slugifyMosqueId(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 32);
}

function ensureAdminUX() {
  const modal = document.getElementById("modal-admin");
  if (!modal) return;
  const box = modal.querySelector(".box.admin");
  if (!box) return;

  if (!document.getElementById("admin-ux-hint")) {
    const hint = document.createElement("div");
    hint.id = "admin-ux-hint";
    hint.className = "small";
    hint.style.marginTop = "6px";
    hint.style.marginBottom = "10px";
    hint.style.textAlign = "left";
    hint.innerHTML = `Super admin : saisis le <strong>nom</strong> puis clique <strong>Ajouter</strong>. L’ID technique est généré automatiquement.`;
    const title = box.querySelector("h3");
    if (title?.parentNode) title.parentNode.insertBefore(hint, title.nextSibling);
  }

  const makeCollapsible = (h3Text) => {
    const h3 = Array.from(box.querySelectorAll("h3")).find((x) => x.textContent.trim() === h3Text);
    if (!h3 || h3.dataset.collapsible === "1") return;

    h3.dataset.collapsible = "1";
    h3.style.cursor = "pointer";
    h3.title = "Cliquer pour plier/déplier";

    const nodes = [];
    let n = h3.nextElementSibling;
    while (n && n.tagName.toLowerCase() !== "h3") {
      nodes.push(n);
      n = n.nextElementSibling;
    }

    let open = true;
    const apply = () => nodes.forEach((x) => { x.style.display = open ? "" : "none"; });

    h3.addEventListener("click", () => {
      open = !open;
      apply();
    });
  };

  makeCollapsible("Collecte (public)");
  makeCollapsible("Demandes de dons (à valider)");
}

function wireSuperAddMosqueUX() {
  const nameInput = document.getElementById("adm-new-name");
  const addBtn = document.getElementById("add-mosque");
  if (!nameInput || !addBtn) return;
  if (addBtn.dataset.wired === "1") return;
  addBtn.dataset.wired = "1";

  if (!document.getElementById("adm-new-preview")) {
    const p = document.createElement("div");
    p.id = "adm-new-preview";
    p.className = "small";
    p.style.marginTop = "6px";
    p.style.textAlign = "left";
    p.textContent = "ID : —";
    nameInput.parentNode.appendChild(p);
  }
  const preview = document.getElementById("adm-new-preview");

  const updatePreview = () => {
    const id = slugifyMosqueId(nameInput.value);
    preview.textContent = `ID : ${id || "—"}`;
  };

  nameInput.addEventListener("input", updatePreview);
  updatePreview();
}

async function refreshMosquesCacheForSuper() {
  const snaps = await getDocs(collection(db, "mosques"));
  mosquesCache = snaps.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function refreshSuperMosquesUI(selectMosqueId = null) {
  await refreshMosquesCacheForSuper();
  populateAdmMosqueSelect();
  if (selectMosqueId) {
    setCurrentMosqueId(selectMosqueId);
    await attachMosque(selectMosqueId);
    fillAdminForm(selectMosqueId);
  }
}

function buildNewMosquePayload(name) {
  return {
    name: name || "Mosquée",
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
    offsets: [0, 0, 0, 0, 0, 0],
    goals: { monthly: 500000 },
    createdAt: serverTimestamp(),
    createdBy: currentUser?.uid || null,
  };
}

function wireSuperMosqueCrud() {
  const addBtn = document.getElementById("add-mosque");
  const delBtn = document.getElementById("del-mosque");
  const newNameInput = document.getElementById("adm-new-name");
  const admSelect = document.getElementById("adm-mosque");

  if (!addBtn || !delBtn || !newNameInput || !admSelect) return;
  if (addBtn.dataset.crudWired === "1") return;
  addBtn.dataset.crudWired = "1";

  addBtn.onclick = async () => {
    try {
      if (SESSION_ROLE !== "super") return;

      const name = String(newNameInput.value || "").trim();
      if (!name) return alert("Nom requis.");

      const id = slugifyMosqueId(name) || `mosq-${Date.now()}`;
      if (mosquesCache.some((m) => m.id === id)) {
        return alert(`ID déjà utilisé: ${id}\nChoisis un autre nom.`);
      }

      await setDoc(mosqueDocRef(id), buildNewMosquePayload(name), { merge: true });

      newNameInput.value = "";
      const preview = document.getElementById("adm-new-preview");
      if (preview) preview.textContent = "ID : —";

      await refreshSuperMosquesUI(id);
      showStatus(`Mosquée ajoutée: ${name} (${id})`, "#16a34a");
    } catch (e) {
      console.error(e);
      alert("Erreur ajout mosquée: " + (e?.message || String(e)));
    }
  };

  delBtn.onclick = async () => {
    try {
      if (SESSION_ROLE !== "super") return;

      const id = admSelect.value;
      const m = mosquesCache.find((x) => x.id === id);
      if (!m) return;

      if (mosquesCache.length <= 1) {
        return alert("Impossible: tu ne peux pas supprimer la dernière mosquée.");
      }

      if (!confirm(`Supprimer la mosquée "${m.name}" (${m.id}) ?`)) return;

      await deleteDoc(mosqueDocRef(id));

      const next = mosquesCache.find((x) => x.id !== id)?.id || DEFAULT_MOSQUES[0].id;
      await refreshSuperMosquesUI(next);
      showStatus(`Mosquée supprimée: ${m.name}`, "#ef4444");
    } catch (e) {
      console.error(e);
      alert("Erreur suppression: " + (e?.message || String(e)));
    }
  };
}

/* =========================
   Admin panel
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
    try {
      await signOut(auth);
      closeAll();
      showStatus("Déconnecté ✅", "#0f172a");
    } catch (e) {
      alert(e?.message || "Erreur déconnexion");
    }
  };

  const saveBtn = document.getElementById("save");
  if (saveBtn?.parentNode) saveBtn.parentNode.insertBefore(btn, saveBtn.nextSibling);
  else box.appendChild(btn);
}

function populateCitySelect(select) {
  select.innerHTML = "";
  Object.keys(CITY_COORDS).forEach((c) => {
    const o = document.createElement("option");
    o.value = c;
    o.textContent = c;
    select.appendChild(o);
  });
}

function populateAdmMosqueSelect() {
  const sel = el("adm-mosque");
  if (!sel) return;
  sel.innerHTML = "";
  mosquesCache.forEach((m) => {
    const o = document.createElement("option");
    o.value = m.id;
    o.textContent = `${m.name || m.id} (${m.id})`;
    sel.appendChild(o);
  });
  sel.value = activeMosque?.id || resolveMosqueId();
  sel.onchange = async (e) => {
    if (!canSelectMosque()) return;
    const id = e.target.value;
    setCurrentMosqueId(id);
    await attachMosque(id);
    fillAdminForm(id);
  };
}

function fillAdminForm(id) {
  const m = (currentUser?.role === "super")
    ? mosquesCache.find((x) => x.id === id)
    : activeMosque;

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

function parseEventsTextarea() {
  return el("adm-events").value
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => {
      const [t, ...r] = l.split("|");
      return { title: (t || "").trim(), date: (r.join("|") || "").trim() };
    });
}

function mosqueToPayloadFromAdminForm() {
  return {
    name: el("adm-name").value.trim() || "Mosquée",
    city: el("adm-city").value,
    wave: el("adm-wave").value.trim(),
    orange: el("adm-orange").value.trim(),
    contact: el("adm-contact").value.trim(),
    phone: el("adm-phone").value.trim(),
    jumua: el("adm-jumua").value || "13:30",
    ann: el("adm-ann").value,
    events: parseEventsTextarea(),
    goals: { monthly: Math.max(0, parseInt(el("adm-goal").value, 10) || 0) },
  };
}

function setupAdmin() {
  el("admin-button").onclick = async () => {
    ensureLogoutButton();
    ensureAdminUX();
    wireSuperAddMosqueUX();

    try {
      if (!auth.currentUser) {
        await promptLogin();
        return;
      }

      const isSuper = SESSION_ROLE === "super";
      el("super-row").style.display = isSuper ? "flex" : "none";
      el("role-hint").textContent = isSuper ? "Mode SUPER ADMIN" : "Mode ADMIN";

      populateCitySelect(el("adm-city"));

      if (isSuper) {
        await refreshMosquesCacheForSuper();
        populateAdmMosqueSelect();
        wireSuperMosqueCrud();
      }

      fillAdminForm(activeMosque?.id || resolveMosqueId());
      openModal("modal-admin");
    } catch (e) {
      console.error(e);
      alert(e?.message || "Erreur");
    }
  };

  el("save").onclick = async () => {
    if (!activeMosque) return;
    if (SESSION_ROLE === "guest") return;

    await setDoc(mosqueDocRef(activeMosque.id), mosqueToPayloadFromAdminForm(), { merge: true });

    if (SESSION_ROLE === "super") {
      await refreshMosquesCacheForSuper();
      populateAdmMosqueSelect();
    }

    closeAll();
    showStatus("Enregistré.", "#16a34a");
  };
}

/* =========================
   Setup donations + category help
========================= */
function setupDonButtonsAndHelp() {
  updatePublicCategoryHelp();
  setupDonButtons();
}

/* =========================
   Setup
========================= */
function setup() {
  bindModals();
  initTheme();

  setupFooter();
  setupDonButtonsAndHelp();
  setupAdmin();
  setupTasbih();

  updateClock();
  setInterval(updateClock, 1000);
  setInterval(updateNextCountdown, 1000);

  renderDonPublic();
  updateAdminBadge();
}

/* =========================
   SAFE BOOT (if something fails)
========================= */
function ensureMosqueAndTimings() {
  try {
    if (!activeMosque) activeMosque = DEFAULT_MOSQUES[0];
    fetchTimings();
  } catch (e) {
    console.error("SAFE BOOT error:", e);
  }
}

window.addEventListener("error", (e) => {
  console.error("JS error:", e?.message || e);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("Unhandled promise:", e?.reason || e);
});

/* =========================
   Boot
========================= */
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

    if (SESSION_ROLE === "super") {
      try {
        await refreshMosquesCacheForSuper();
      } catch {
        mosquesCache = loadLocalMosques();
      }
    }

    await maybeMigrateLocalStorageToFirestore();
    await attachMosque(resolveMosqueId());
  });

  attachMosque(resolveMosqueId()).catch(console.error);

  // fallback timings if something blocks
  setTimeout(() => {
    const fajr = document.getElementById("fajr-time")?.textContent;
    if (!fajr || fajr.includes("--")) ensureMosqueAndTimings();
  }, 1200);
});
