/***********************
 * MyMosque - Firebase Step 1 (Firestore + Offline) + Geo timings
 ***********************/

const ADMIN_PASSWORD = '1234';
const SUPER_ADMIN_PASSWORD = '9999';
let SESSION_ROLE = 'guest';

/* Firebase config (fourni par toi) */
const firebaseConfig = {
  apiKey: "AIzaSyCUOJaDJUo37WeFh61DAFHFN3ON6evAAsQ",
  authDomain: "mymosquee-web.firebaseapp.com",
  projectId: "mymosquee-web",
  storageBucket: "mymosquee-web.firebasestorage.app",
  messagingSenderId: "129580574505",
  appId: "1:129580574505:web:4faeac48094084fe3ab938",
  measurementId: "G-PFWSE9H8D5"
};

let db = null;
let firestoreReady = false;

const PRAYER_NAMES = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const DISPLAY = {
  Fajr: { local: 'Souba', ar: 'Fajr' },
  Dhuhr: { local: 'Tisbar', ar: 'Dhuhr' },
  Asr: { local: 'Takusan', ar: 'Asr' },
  Maghrib: { local: 'Timis', ar: 'Maghrib' },
  Isha: { local: 'Guéwé', ar: 'Isha' },
};

const WEEKDAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

const CITY_COORDS = {
  Medina: { lat: 14.673, lon: -17.447 },
  Dakar: { lat: 14.7167, lon: -17.4677 },
  Pikine: { lat: 14.75, lon: -17.37 },
  Guédiawaye: { lat: 14.7833, lon: -17.4167 },
  Rufisque: { lat: 14.7236, lon: -17.2658 },
  Thiaroye: { lat: 14.7431, lon: -17.3325 },
  Yoff: { lat: 14.767, lon: -17.47 },
  'Parcelles Assainies': { lat: 14.7398, lon: -17.447 },
  "M'bao": { lat: 14.72, lon: -17.26 },
};

/* Ramadan (fixé comme avant dans ton app) */
const RAMADAN_START_DATE = '2026-02-18';
const RAMADAN_TOTAL_DAYS = 30;

const DON_CATEGORIES = ['Zakat', 'Sadaqa', 'Travaux'];
const DON_CATEGORY_HELP = {
  Zakat: 'Zakat : obligation (selon conditions).',
  Sadaqa: 'Sadaqa : don libre, pour l’entraide.',
  Travaux: 'Travaux : entretien, rénovation, équipement.',
};

const el = (id) => document.getElementById(id);

let timingsData = null;
let lastAlertShown = '';
let playedFor = '';
let currentMosqueId = null;

function qs() { return new URLSearchParams(location.search); }
function getOfficialMosqueIdFromUrl() { return qs().get('m'); }

function showStatus(msg, bg) {
  const node = el('status');
  if (!node) return;
  node.textContent = msg;
  node.style.background = bg || '#2f7d6d';
  node.style.display = 'block';
  setTimeout(() => { node.style.display = 'none'; }, 2500);
}

function fmt(ms) {
  if (ms < 0) return '00:00:00';
  const t = Math.floor(ms / 1000);
  const h = Math.floor(t / 3600) % 24;
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function parseHM(s) {
  const [h, m] = String(s || '').split(':').map((x) => parseInt(x, 10));
  return { h: Number.isFinite(h) ? h : 0, m: Number.isFinite(m) ? m : 0 };
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function ymKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function isoDayKey(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 10);
}

/***********************
 * Dark mode (déjà validé)
 ***********************/
function isDark() { return localStorage.getItem('dark') === '1'; }
function setDark(v) {
  localStorage.setItem('dark', v ? '1' : '0');
  document.body.classList.toggle('dark', !!v);
}
function toggleDark() { setDark(!isDark()); }

/***********************
 * Firebase init
 ***********************/
async function initFirebase() {
  try {
    if (!window.firebase) return;
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();

    // offline persistence
    await db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

    firestoreReady = true;
  } catch (e) {
    firestoreReady = false;
  }
}

/***********************
 * Data model Firestore
 * - mosques (collection)
 *   - {name, city, wave, orange, contact, phone, jumua, ann, events, goalMonthly, createdAt}
 * - mosques/{mosqueId}/donations (subcollection)
 *   - {amount, category, ref, status: 'pending'|'ok'|'no', createdAt, method, dateKey, monthKey}
 ***********************/
function mosquesCol() { return db.collection('mosques'); }
function donationsCol(mosqueId) { return mosquesCol().doc(mosqueId).collection('donations'); }

/***********************
 * Default seed (si Firestore vide)
 ***********************/
const DEFAULT_MOSQUES = [
  { id: 'bene-tally', name: 'Bene Tally', city: 'Medina', wave: '772682103', orange: '772682103', contact: 'Imam Diallo', phone: '+221772682103', jumua: '13:30', ann: 'Bienvenue à Bene Tally.', events: [{ title: 'Cours de Fiqh', date: 'Mardi après Isha' }], goalMonthly: 100000 },
  { id: 'medina-centre', name: 'Medina Centre', city: 'Dakar', wave: '770000000', orange: '780000000', contact: 'Imam Ndiaye', phone: '+221780000000', jumua: '14:00', ann: 'Annonce importante pour la Medina.', events: [{ title: 'Cercle de Coran', date: 'Samedi après Fajr' }], goalMonthly: 100000 },
];

async function ensureSeedIfEmpty() {
  if (!firestoreReady) return;

  const snap = await mosquesCol().limit(1).get();
  if (!snap.empty) return;

  const batch = db.batch();
  DEFAULT_MOSQUES.forEach((m) => {
    batch.set(mosquesCol().doc(m.id), {
      name: m.name,
      city: m.city,
      wave: m.wave,
      orange: m.orange,
      contact: m.contact,
      phone: m.phone,
      jumua: m.jumua,
      ann: m.ann,
      events: m.events,
      goalMonthly: m.goalMonthly,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
}

/***********************
 * Mosque selection rules
 * - Public: no switching UI.
 * - If URL has ?m=xxx => locked mosque.
 * - If no ?m => uses last seen mosque (localStorage) or first.
 ***********************/
function getStoredMosqueId() {
  return localStorage.getItem('currentMosqueId');
}
function setStoredMosqueId(id) {
  localStorage.setItem('currentMosqueId', id);
}

async function fetchMosques() {
  if (!firestoreReady) {
    // offline fallback: keep seed in localStorage
    let arr = JSON.parse(localStorage.getItem('mosques') || 'null');
    if (!arr || !arr.length) {
      arr = DEFAULT_MOSQUES.map((m) => ({ ...m }));
      localStorage.setItem('mosques', JSON.stringify(arr));
      setStoredMosqueId(arr[0].id);
    }
    return arr.map((m) => ({
      id: m.id, name: m.name, city: m.city, wave: m.wave, orange: m.orange,
      contact: m.contact, phone: m.phone, jumua: m.jumua, ann: m.ann, events: m.events, goalMonthly: m.goalMonthly || 100000,
    }));
  }

  const snap = await mosquesCol().get();
  const arr = [];
  snap.forEach((doc) => {
    const d = doc.data() || {};
    arr.push({
      id: doc.id,
      name: d.name || 'Mosquée',
      city: d.city || 'Medina',
      wave: d.wave || '',
      orange: d.orange || '',
      contact: d.contact || '',
      phone: d.phone || '',
      jumua: d.jumua || '13:30',
      ann: d.ann || '',
      events: Array.isArray(d.events) ? d.events : [],
      goalMonthly: Number(d.goalMonthly || 100000),
    });
  });
  arr.sort((a, b) => a.name.localeCompare(b.name));
  return arr;
}

let MOSQUES = [];

function getCurrentMosque() {
  const id = currentMosqueId || (MOSQUES[0] ? MOSQUES[0].id : null);
  return MOSQUES.find((m) => m.id === id) || MOSQUES[0];
}

function applyMosqueLocking() {
  const official = getOfficialMosqueIdFromUrl();
  if (official) {
    currentMosqueId = official;
    setStoredMosqueId(official);
    // public cannot switch
    el('mosque-select-row').style.display = 'none';
    return;
  }

  const last = getStoredMosqueId();
  if (last && MOSQUES.some((m) => m.id === last)) currentMosqueId = last;
  else if (MOSQUES[0]) currentMosqueId = MOSQUES[0].id;

  // public cannot switch
  el('mosque-select-row').style.display = 'none';
}

/***********************
 * UI: dates + clock
 ***********************/
function updateClock() {
  const n = new Date();
  el('current-time').textContent = [n.getHours(), n.getMinutes(), n.getSeconds()].map((v) => String(v).padStart(2, '0')).join(':');
  el('gregorian-date').textContent = `${WEEKDAYS[n.getDay()]} ${n.getDate()} ${MONTHS[n.getMonth()]} ${n.getFullYear()}`;
}

/***********************
 * Events
 ***********************/
function renderEvents() {
  const m = getCurrentMosque();
  const box = el('events-list');
  const events = Array.isArray(m.events) ? m.events : [];
  if (!events.length) { box.textContent = '—'; return; }

  const wrap = document.createElement('div');
  wrap.style.display = 'grid';
  wrap.style.gap = '8px';

  events.forEach((ev) => {
    const item = document.createElement('div');
    item.style.border = '1px solid rgba(0,0,0,.06)';
    item.style.borderRadius = '12px';
    item.style.padding = '10px 12px';
    item.innerHTML = `<div style="font-weight:900;color:#1f5e53">${escapeHtml(ev.title || '')}</div>
                      <div class="small">${escapeHtml(ev.date || '')}</div>`;
    wrap.appendChild(item);
  });

  box.innerHTML = '';
  box.appendChild(wrap);
}

/***********************
 * Ramadan compact
 ***********************/
function formatFastingDurationShort(fajr, maghrib) {
  if (!fajr || !maghrib) return '—';
  const f = parseHM(fajr);
  const m = parseHM(maghrib);
  const start = f.h * 60 + f.m;
  const end = m.h * 60 + m.m;
  let dur = end - start;
  if (dur < 0) dur += 24 * 60;
  const hh = Math.floor(dur / 60);
  const mm = dur % 60;
  return `${hh}h ${String(mm).padStart(2, '0')}m`;
}

function renderRamadan() {
  const card = el('ramadan-card');
  if (!card) return;

  const start = new Date(`${RAMADAN_START_DATE}T00:00:00`);
  const now = new Date();
  const msDay = 24 * 60 * 60 * 1000;
  const dayIndex = Math.floor((now - start) / msDay) + 1;

  if (dayIndex < 1 || dayIndex > RAMADAN_TOTAL_DAYS) {
    card.style.display = 'none';
    return;
  }

  const left = RAMADAN_TOTAL_DAYS - dayIndex;
  el('ramadan-sub').textContent = `${dayIndex} Ramadan • ${WEEKDAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}`;
  el('ramadan-day').textContent = `Jour ${dayIndex}/${RAMADAN_TOTAL_DAYS}`;
  el('ramadan-left').textContent = left === 0 ? 'Dernier jour' : `${left} j restants`;

  const iftar = (timingsData && timingsData.Maghrib) ? timingsData.Maghrib : '--:--';
  const imsak = (timingsData && timingsData.Fajr) ? timingsData.Fajr : '--:--';
  const shuruq = (timingsData && timingsData.Sunrise) ? timingsData.Sunrise : '--:--';

  el('ramadan-iftar').textContent = iftar;
  el('ramadan-imsak').textContent = imsak;
  el('ramadan-shuruq').textContent = shuruq;

  const durEl = el('ramadan-duration');
  if (durEl) durEl.textContent = `Durée du jeûne: ${formatFastingDurationShort(imsak, iftar)}`;

  card.style.display = 'block';
}

/***********************
 * Audio (bip léger)
 ***********************/
function playBeep(duration = 600, freq = 880) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
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

function playChime() { playBeep(650, 740); navigator.vibrate && navigator.vibrate(150); }

/***********************
 * Timings: GEO first, Senegal-friendly + offline cache
 * - If user allows GPS: use exact lat/lon
 * - else: use mosque city fallback
 * - method: MWL (3) (cohérent Sénégal)
 ***********************/
function getGeoPosition(timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('no geo'));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 },
    );
  });
}

function cacheKeyForTimings(lat, lon) {
  const d = new Date().toDateString();
  // round coords to reduce key explosion
  const la = Math.round(lat * 1000) / 1000;
  const lo = Math.round(lon * 1000) / 1000;
  return `timings_${d}_${la}_${lo}`;
}

async function fetchTimings() {
  const m = getCurrentMosque();
  if (!m) return;

  // choose coords
  let coords = null;
  try {
    coords = await getGeoPosition(7000);
  } catch {
    const fallback = CITY_COORDS[m.city] || CITY_COORDS.Medina;
    coords = { lat: fallback.lat, lon: fallback.lon, acc: null };
  }

  const method = 3; // MWL
  const school = 0; // Maliki/Shafi
  const url = `https://api.aladhan.com/v1/timings?latitude=${coords.lat}&longitude=${coords.lon}&method=${method}&school=${school}`;

  const k = cacheKeyForTimings(coords.lat, coords.lon);
  const cached = localStorage.getItem(k);
  let loaded = false;

  if (cached) { displayAll(JSON.parse(cached)); loaded = true; }

  try {
    const r = await fetch(url);
    const j = await r.json();
    if (j && j.data) {
      localStorage.setItem(k, JSON.stringify(j.data));
      displayAll(j.data);
    } else {
      throw new Error('bad');
    }
  } catch {
    showStatus(loaded ? 'Hors-ligne – cache.' : 'Connexion faible – données indisponibles.', loaded ? '#ca8a04' : '#e11d48');
  }
}

/***********************
 * Next prayer logic
 ***********************/
function updateNextCountdown() {
  if (!timingsData) {
    el('next-prayer-name').textContent = '—';
    el('countdown').textContent = '--:--:--';
    return;
  }

  const now = new Date();
  document.querySelectorAll('.list .row').forEach((r) => r.classList.remove('current'));

  const p = {};
  PRAYER_NAMES.forEach((k) => {
    const parts = String(timingsData[k] || '').split(':');
    if (parts.length >= 2) {
      const d = new Date();
      d.setHours(Number(parts[0]), Number(parts[1]), 0, 0);
      p[k] = d;
    }
  });

  // Jumua overwrite Dhuhr on Friday (if set)
  const m = getCurrentMosque();
  if (now.getDay() === 5 && m.jumua) {
    const hm = parseHM(m.jumua || '13:30');
    const d = new Date();
    d.setHours(hm.h, hm.m, 0, 0);
    p.Dhuhr = d;
  }

  let name = '';
  let time = null;

  for (const k of PRAYER_NAMES) {
    const d = p[k];
    if (d && now < d) { name = k; time = d; break; }
  }

  if (!name) {
    name = 'Fajr';
    const t = String(timingsData.Fajr || '05:45').split(':').map(Number);
    time = new Date();
    time.setDate(time.getDate() + 1);
    time.setHours(t[0] || 5, t[1] || 45, 0, 0);
  }

  el('next-prayer-name').textContent = `${DISPLAY[name].local.toUpperCase()} (${DISPLAY[name].ar})`;
  el('countdown').textContent = fmt(time - now);

  const item = el(`${name.toLowerCase()}-item`);
  if (item) item.classList.add('current');

  const delta = time - now;
  const five = 5 * 60 * 1000;

  if (delta > 0 && delta <= five && lastAlertShown !== name) {
    playChime();
    lastAlertShown = name;
    showStatus(`Dans 5 min : ${DISPLAY[name].local}.`, '#1f5e53');
  }
}

/***********************
 * Dons (Firestore)
 * - public totals: only status=ok within current month
 * - submit: creates status=pending (no public increment)
 * - admin validates -> status ok/no
 ***********************/
function normalizeCategory(cat) {
  const c = String(cat || '').trim();
  if (c === 'Travaux / Entretien') return 'Travaux';
  return DON_CATEGORIES.includes(c) ? c : 'Sadaqa';
}

function getPublicCategory() {
  const sel = el('don-public-category');
  if (!sel) return 'Sadaqa';
  return normalizeCategory(sel.value);
}

function updatePublicCategoryHelp() {
  const cat = getPublicCategory();
  const help = el('don-public-category-help');
  if (help) help.textContent = DON_CATEGORY_HELP[cat] || '—';
}

function getMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0);
  return { start, end, monthKey: ymKey() };
}

function formatShortDate(ts) {
  const d = ts instanceof Date ? ts : new Date(ts);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

async function computePublicMonthTotal(mosqueId) {
  if (!firestoreReady) return { total: 0, pendingCount: 0 };

  const { start, end } = getMonthRange();

  const okSnap = await donationsCol(mosqueId)
    .where('status', '==', 'ok')
    .where('createdAt', '>=', start)
    .where('createdAt', '<', end)
    .get();

  let total = 0;
  okSnap.forEach((doc) => { total += Number(doc.data().amount || 0); });

  const pendingSnap = await donationsCol(mosqueId).where('status', '==', 'pending').get();
  const pendingCount = pendingSnap.size;

  return { total, pendingCount };
}

function updatePublicKpi(goal, monthTotal) {
  el('don-public-goal').textContent = Number(goal || 0).toLocaleString('fr-FR');
  el('don-public-month').textContent = Number(monthTotal || 0).toLocaleString('fr-FR');

  const p = goal ? Math.min(100, Math.round((monthTotal * 100) / goal)) : 0;
  el('don-public-bar').style.width = `${p}%`;
}

function setAdminBadge(n) {
  const b = el('admin-badge');
  if (!b) return;
  if (n > 0) {
    b.textContent = String(n);
    b.style.display = 'inline-block';
  } else {
    b.style.display = 'none';
  }
}

function openWhatsApp(to, msg) {
  window.open(`https://wa.me/${encodeURIComponent(to)}?text=${encodeURIComponent(msg)}`, '_blank');
}

/* mini modal donation */
function openModal(id) { el(id).style.display = 'block'; }
function closeAll() { document.querySelectorAll('.modal').forEach((m) => { m.style.display = 'none'; }); }
function bindModals() {
  document.querySelectorAll('.modal .close').forEach((x) => x.addEventListener('click', closeAll));
  window.addEventListener('click', (e) => {
    if (e.target && e.target.classList && e.target.classList.contains('modal')) closeAll();
  });
}

function showThanksPopup(text) {
  el('thanks-text').textContent = text;
  openModal('modal-thanks');

  // 10 seconds auto-close
  const t = setTimeout(() => { closeAll(); }, 10000);

  el('thanks-ok').onclick = () => {
    clearTimeout(t);
    closeAll();
  };
}

function setupDonationButtons() {
  el('don-public-category').onchange = () => updatePublicCategoryHelp();

  el('btn-wave').onclick = () => {
    const m = getCurrentMosque();
    const cat = getPublicCategory();
    openWhatsApp(m.phone || '', `Salam, je souhaite faire un don via *Wave Money*.\nCatégorie : *${cat}*\nMontant : [à renseigner] CFA\nNuméro Wave : ${m.wave}\nMosquée : ${m.name}\nBarakAllahou fik.`);
  };

  el('btn-orange').onclick = () => {
    const m = getCurrentMosque();
    const cat = getPublicCategory();
    openWhatsApp(m.phone || '', `Salam, je souhaite faire un don via *Orange Money*.\nCatégorie : *${cat}*\nMontant : [à renseigner] CFA\nNuméro Orange : ${m.orange}\nMosquée : ${m.name}\nBarakAllahou fik.`);
  };

  // “J’ai donné” => opens mini form (validated)
  el('btn-claimed').onclick = () => {
    el('don-amt').value = '';
    el('don-ref').value = '';
    el('don-category').value = getPublicCategory();
    openModal('modal-don');
  };

  el('don-cancel').onclick = () => closeAll();

  el('don-confirm').onclick = async () => {
    const m = getCurrentMosque();
    const amount = parseInt(el('don-amt').value, 10) || 0;
    const ref = (el('don-ref').value || '').trim();
    const category = normalizeCategory(el('don-category').value);

    if (amount <= 0) return alert('Montant invalide');

    // Submit pending donation request
    try {
      if (firestoreReady) {
        const now = new Date();
        await donationsCol(m.id).add({
          amount,
          category,
          ref,
          status: 'pending',
          createdAt: now,
          dateKey: isoDayKey(now),
          monthKey: ymKey(),
          method: 'Déclaré',
        });
      } else {
        // offline fallback (local only)
        const k = `pending_${m.id}_${Date.now()}`;
        localStorage.setItem(k, JSON.stringify({ amount, category, ref, status: 'pending', createdAt: new Date().toISOString() }));
      }

      closeAll();
      showThanksPopup(`Merci pour votre don de ${amount.toLocaleString('fr-FR')} CFA.\nStatut : en attente de confirmation.`);

      // refresh KPIs (pending does NOT add total)
      await refreshDonationsUI();

    } catch (e) {
      alert("Impossible d'envoyer maintenant. Réessaie quand la connexion revient.");
    }
  };
}

async function refreshDonationsUI() {
  const m = getCurrentMosque();
  if (!m) return;

  const goal = Number(m.goalMonthly || 100000);

  if (firestoreReady) {
    const { total, pendingCount } = await computePublicMonthTotal(m.id);
    updatePublicKpi(goal, total);

    // Admin badge: pending count (notification)
    if (SESSION_ROLE !== 'guest') setAdminBadge(pendingCount);
    else setAdminBadge(0);

    // admin table refresh if open
    await renderAdminDonationsTable();
  } else {
    updatePublicKpi(goal, 0);
  }
}

/***********************
 * Admin: donations table (pending + validate)
 ***********************/
async function renderAdminDonationsTable() {
  const tb = document.querySelector('#don-table tbody');
  if (!tb) return;
  tb.innerHTML = '';

  if (SESSION_ROLE === 'guest') return;
  if (!firestoreReady) return;

  const m = getCurrentMosque();
  const snap = await donationsCol(m.id).orderBy('createdAt', 'desc').limit(50).get();

  snap.forEach((doc) => {
    const r = doc.data() || {};
    const status = r.status || 'pending';
    const st = status === 'ok'
      ? '<span class="badge b-ok">Confirmé</span>'
      : (status === 'no'
        ? '<span class="badge b-no">Annulé</span>'
        : '<span class="badge b-p">En attente</span>');

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatShortDate(r.createdAt && r.createdAt.toDate ? r.createdAt.toDate() : r.createdAt)}</td>
      <td><strong>${Number(r.amount || 0).toLocaleString('fr-FR')}</strong></td>
      <td><strong>${escapeHtml(normalizeCategory(r.category))}</strong></td>
      <td>${escapeHtml(r.ref || '')}</td>
      <td>${st}</td>
      <td style="white-space:nowrap">
        ${status === 'pending' ? `
          <button data-act="ok" data-id="${doc.id}" class="btn btn-primary" style="padding:6px 10px; min-width:auto">OK</button>
          <button data-act="no" data-id="${doc.id}" class="btn" style="padding:6px 10px; min-width:auto; background:#ef4444; color:#fff">X</button>
        ` : `
          <button data-act="del" data-id="${doc.id}" class="btn btn-ghost" style="padding:6px 10px; min-width:auto">—</button>
        `}
      </td>
    `;
    tb.appendChild(tr);
  });

  tb.querySelectorAll('button[data-act]').forEach((b) => {
    b.onclick = async () => {
      const id = b.dataset.id;
      const act = b.dataset.act;

      if (act === 'ok' || act === 'no') {
        await donationsCol(getCurrentMosque().id).doc(id).update({ status: act });
        await refreshDonationsUI();
      }
    };
  });
}

/***********************
 * 99 names (complet)
 ***********************/
const NAMES_99 = [
  { ar:'ٱللَّٰه', fr:'Allah' },
  { ar:'ٱلرَّحْمَٰن', fr:'Ar-Rahman (Le Tout Miséricordieux)' },
  { ar:'ٱلرَّحِيم', fr:'Ar-Rahim (Le Très Miséricordieux)' },
  { ar:'ٱلْمَلِك', fr:'Al-Malik (Le Souverain)' },
  { ar:'ٱلْقُدُّوس', fr:'Al-Quddus (Le Saint)' },
  { ar:'ٱلسَّلَام', fr:'As-Salam (La Paix)' },
  { ar:'ٱلْمُؤْمِن', fr:"Al-Mu’min (Le Garant)" },
  { ar:'ٱلْمُهَيْمِن', fr:'Al-Muhaymin (Le Protecteur)' },
  { ar:'ٱلْعَزِيز', fr:'Al-‘Aziz (Le Tout-Puissant)' },
  { ar:'ٱلْجَبَّار', fr:'Al-Jabbar (Le Contraignant)' },
  { ar:'ٱلْمُتَكَبِّر', fr:'Al-Mutakabbir (Le Suprême)' },
  { ar:'ٱلْخَالِق', fr:'Al-Khaliq (Le Créateur)' },
  { ar:'ٱلْبَارِئ', fr:'Al-Bari’ (Le Producteur)' },
  { ar:'ٱلْمُصَوِّر', fr:'Al-Musawwir (Le Formateur)' },
  { ar:'ٱلْغَفَّار', fr:'Al-Ghaffar (Le Grand Pardonneur)' },
  { ar:'ٱلْقَهَّار', fr:'Al-Qahhar (Le Dominateur)' },
  { ar:'ٱلْوَهَّاب', fr:'Al-Wahhab (Le Donateur)' },
  { ar:'ٱلرَّزَّاق', fr:'Ar-Razzaq (Le Pourvoyeur)' },
  { ar:'ٱلْفَتَّاح', fr:'Al-Fattah (L’Ouvreur)' },
  { ar:'ٱلْعَلِيم', fr:'Al-‘Alim (L’Omniscient)' },
  { ar:'ٱلْقَابِض', fr:'Al-Qabid (Celui qui Retient)' },
  { ar:'ٱلْبَاسِط', fr:'Al-Basit (Celui qui Étend)' },
  { ar:'ٱلْخَافِض', fr:'Al-Khafid (Celui qui Abaisse)' },
  { ar:'ٱلرَّافِع', fr:'Ar-Rafi‘ (Celui qui Élève)' },
  { ar:'ٱلْمُعِزّ', fr:'Al-Mu‘izz (Celui qui Honore)' },
  { ar:'ٱلْمُذِلّ', fr:'Al-Mudhill (Celui qui Humilie)' },
  { ar:'ٱلسَّمِيع', fr:'As-Sami‘ (L’Audient)' },
  { ar:'ٱلْبَصِير', fr:'Al-Basir (Le Clairvoyant)' },
  { ar:'ٱلْحَكَم', fr:'Al-Hakam (Le Juge)' },
  { ar:'ٱلْعَدْل', fr:'Al-‘Adl (Le Juste)' },
  { ar:'ٱللَّطِيف', fr:'Al-Latif (Le Subtil)' },
  { ar:'ٱلْخَبِير', fr:'Al-Khabir (Le Parfaitement Connaisseur)' },
  { ar:'ٱلْحَلِيم', fr:'Al-Halim (Le Longanime)' },
  { ar:'ٱلْعَظِيم', fr:'Al-‘Azim (L’Immense)' },
  { ar:'ٱلْغَفُور', fr:'Al-Ghafur (Le Pardonneur)' },
  { ar:'ٱلشَّكُور', fr:'Ash-Shakur (Le Reconnaissant)' },
  { ar:'ٱلْعَلِيّ', fr:'Al-‘Aliyy (Le Très-Haut)' },
  { ar:'ٱلْكَبِير', fr:'Al-Kabir (Le Très-Grand)' },
  { ar:'ٱلْحَفِيظ', fr:'Al-Hafiz (Le Gardien)' },
  { ar:'ٱلْمُقِيت', fr:'Al-Muqit (Le Nourricier)' },
  { ar:'ٱلْحَسِيب', fr:'Al-Hasib (Celui qui Suffit)' },
  { ar:'ٱلْجَلِيل', fr:'Al-Jalil (Le Majestueux)' },
  { ar:'ٱلْكَرِيم', fr:'Al-Karim (Le Généreux)' },
  { ar:'ٱلرَّقِيب', fr:'Ar-Raqib (Le Vigilant)' },
  { ar:'ٱلْمُجِيب', fr:'Al-Mujib (Celui qui Exauce)' },
  { ar:'ٱلْوَاسِع', fr:'Al-Wasi‘ (L’Immense)' },
  { ar:'ٱلْحَكِيم', fr:'Al-Hakim (Le Sage)' },
  { ar:'ٱلْوَدُود', fr:'Al-Wadud (Le Bien-Aimant)' },
  { ar:'ٱلْمَجِيد', fr:'Al-Majid (Le Glorieux)' },
  { ar:'ٱلْبَاعِث', fr:'Al-Ba‘ith (Le Ressusciteur)' },
  { ar:'ٱلشَّهِيد', fr:'Ash-Shahid (Le Témoin)' },
  { ar:'ٱلْحَقّ', fr:'Al-Haqq (La Vérité)' },
  { ar:'ٱلْوَكِيل', fr:'Al-Wakil (Le Garant)' },
  { ar:'ٱلْقَوِيّ', fr:'Al-Qawiyy (Le Fort)' },
  { ar:'ٱلْمَتِين', fr:'Al-Matin (Le Très-Ferme)' },
  { ar:'ٱلْوَلِيّ', fr:'Al-Waliyy (Le Protecteur)' },
  { ar:'ٱلْحَمِيد', fr:'Al-Hamid (Le Digne de Louange)' },
  { ar:'ٱلْمُحْصِي', fr:'Al-Muhsi (Celui qui Dénombre)' },
  { ar:'ٱلْمُبْدِئ', fr:'Al-Mubdi’ (Celui qui Initie)' },
  { ar:'ٱلْمُعِيد', fr:'Al-Mu‘id (Celui qui Répète)' },
  { ar:'ٱلْمُحْيِي', fr:'Al-Muhyi (Celui qui Donne la Vie)' },
  { ar:'ٱلْمُمِيت', fr:'Al-Mumit (Celui qui Donne la Mort)' },
  { ar:'ٱلْحَيّ', fr:'Al-Hayy (Le Vivant)' },
  { ar:'ٱلْقَيُّوم', fr:'Al-Qayyum (L’Auto-subsistant)' },
  { ar:'ٱلْوَاجِد', fr:'Al-Wajid (Le Riche)' },
  { ar:'ٱلْمَاجِد', fr:'Al-Majid (Le Noble)' },
  { ar:'ٱلْوَاحِد', fr:'Al-Wahid (L’Unique)' },
  { ar:'ٱلْأَحَد', fr:'Al-Ahad (L’Un)' },
  { ar:'ٱلصَّمَد', fr:'As-Samad (Le Seul à être Imploré)' },
  { ar:'ٱلْقَادِر', fr:'Al-Qadir (Le Capable)' },
  { ar:'ٱلْمُقْتَدِر', fr:'Al-Muqtadir (Le Très-Puissant)' },
  { ar:'ٱلْمُقَدِّم', fr:'Al-Muqaddim (Celui qui Avance)' },
  { ar:'ٱلْمُؤَخِّر', fr:'Al-Mu’akhkhir (Celui qui Retarde)' },
  { ar:'ٱلْأَوَّل', fr:'Al-Awwal (Le Premier)' },
  { ar:'ٱلْآخِر', fr:'Al-Akhir (Le Dernier)' },
  { ar:'ٱلظَّاهِر', fr:'Az-Zahir (L’Apparent)' },
  { ar:'ٱلْبَاطِن', fr:'Al-Batin (Le Caché)' },
  { ar:'ٱلْوَالِي', fr:'Al-Wali (Le Gouverneur)' },
  { ar:'ٱلْمُتَعَالِي', fr:'Al-Muta‘ali (Le Très-Élevé)' },
  { ar:'ٱلْبَرّ', fr:'Al-Barr (Le Bienfaisant)' },
  { ar:'ٱلتَّوَّاب', fr:'At-Tawwab (Celui qui Accepte le Repentir)' },
  { ar:'ٱلْمُنْتَقِم', fr:'Al-Muntaqim (Le Vengeur)' },
  { ar:'ٱلْعَفُوّ', fr:'Al-‘Afuww (L’Indulgent)' },
  { ar:'ٱلرَّؤُوف', fr:'Ar-Ra’uf (Le Compatissant)' },
  { ar:'مَالِكُ ٱلْمُلْك', fr:'Malik-ul-Mulk (Maître du Royaume)' },
  { ar:'ذُو ٱلْجَلَالِ وَٱلْإِكْرَام', fr:'Dhul-Jalali wal-Ikram (Majesté & Générosité)' },
  { ar:'ٱلْمُقْسِط', fr:'Al-Muqsit (L’Équitable)' },
  { ar:'ٱلْجَامِع', fr:'Al-Jami‘ (Le Rassembleur)' },
  { ar:'ٱلْغَنِيّ', fr:'Al-Ghaniyy (Le Riche)' },
  { ar:'ٱلْمُغْنِي', fr:'Al-Mughni (Celui qui Enrichit)' },
  { ar:'ٱلْمَانِع', fr:'Al-Mani‘ (Le Protecteur)' },
  { ar:'ٱلضَّارّ', fr:'Ad-Darr (Celui qui Nuit)' },
  { ar:'ٱلنَّافِع', fr:'An-Nafi‘ (Celui qui Profite)' },
  { ar:'ٱلنُّور', fr:'An-Nur (La Lumière)' },
  { ar:'ٱلْهَادِي', fr:'Al-Hadi (Le Guide)' },
  { ar:'ٱلْبَدِيع', fr:'Al-Badi‘ (L’Incomparable)' },
  { ar:'ٱلْبَاقِي', fr:'Al-Baqi (L’Éternel)' },
  { ar:'ٱلْوَارِث', fr:'Al-Warith (L’Héritier)' },
  { ar:'ٱلرَّشِيد', fr:'Ar-Rashid (Le Bien-Guide)' },
  { ar:'ٱلصَّبُور', fr:'As-Sabur (Le Patient)' },
];

function renderNames99() {
  const list = el('names-list');
  const header = el('names-header');
  if (!list || !header) return;

  header.textContent = `Les 99 Noms d'Allah`;
  list.innerHTML = '';

  NAMES_99.forEach((n, idx) => {
    const li = document.createElement('li');
    li.innerHTML = `<span><strong>${idx + 1}.</strong> ${escapeHtml(n.fr)}</span><span style="font-weight:900">${escapeHtml(n.ar)}</span>`;
    list.appendChild(li);
  });
}

/***********************
 * Footer + modals
 ***********************/
function setupFooter() {
  el('events-btn').onclick = () => { renderEvents(); openModal('modal-events'); };

  el('announce-btn').onclick = () => {
    openModal('modal-ann');
    const m = getCurrentMosque();
    localStorage.setItem(`annSeen_${m.id}_${todayKey()}`, '1');
    el('notif').style.display = 'none';
  };

  el('about-btn').onclick = () => openModal('modal-about');

  el('names-btn').onclick = () => {
    renderNames99();
    openModal('modal-names');
  };

  el('share-btn').onclick = () => {
    const m = getCurrentMosque();
    const text = `🕌 ${m.name}\n${el('gregorian-date').textContent}\n\nFajr: ${el('fajr-time').textContent}\nDhuhr: ${el('dhuhr-time').textContent}\nAsr: ${el('asr-time').textContent}\nMaghrib: ${el('maghrib-time').textContent}\nIsha: ${el('isha-time').textContent}\n\n${location.href}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };
}

/***********************
 * Admin panel (simple)
 * - No complex method/offsets for admins
 * - Super admin can add/delete mosques
 ***********************/
function populateCitySelect(select) {
  select.innerHTML = '';
  Object.keys(CITY_COORDS).forEach((c) => {
    const o = document.createElement('option');
    o.value = c;
    o.textContent = c;
    select.appendChild(o);
  });
}

function populateAdminMosqueSelect() {
  const sel = el('adm-mosque');
  if (!sel) return;
  sel.innerHTML = '';
  MOSQUES.forEach((m) => {
    const o = document.createElement('option');
    o.value = m.id;
    o.textContent = m.name;
    sel.appendChild(o);
  });
  sel.value = getCurrentMosque().id;

  sel.onchange = async (e) => {
    currentMosqueId = e.target.value;
    setStoredMosqueId(currentMosqueId);
    fillAdminForm();
    await refreshDonationsUI();
    await fetchTimings();
  };
}

function fillAdminForm() {
  const m = getCurrentMosque();
  if (!m) return;

  el('adm-name').value = m.name || '';
  el('adm-city').value = m.city || 'Medina';
  el('adm-wave').value = m.wave || '';
  el('adm-orange').value = m.orange || '';
  el('adm-contact').value = m.contact || '';
  el('adm-phone').value = m.phone || '';
  el('adm-jumua').value = m.jumua || '13:30';
  el('adm-ann').value = m.ann || '';
  el('adm-events').value = (m.events || []).map((e) => `${e.title} | ${e.date}`).join('\n');
  el('adm-goal').value = Number(m.goalMonthly || 100000);
}

async function saveCurrentMosqueFromAdmin() {
  const m = getCurrentMosque();
  if (!m) return;

  const events = (el('adm-events').value || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [t, ...r] = l.split('|');
      return { title: (t || '').trim(), date: (r.join('|') || '').trim() };
    });

  const update = {
    name: el('adm-name').value.trim() || 'Mosquée',
    city: el('adm-city').value,
    wave: el('adm-wave').value.trim(),
    orange: el('adm-orange').value.trim(),
    contact: el('adm-contact').value.trim(),
    phone: el('adm-phone').value.trim(),
    jumua: el('adm-jumua').value || '13:30',
    ann: el('adm-ann').value || '',
    events,
    goalMonthly: parseInt(el('adm-goal').value, 10) || 100000,
  };

  if (firestoreReady) {
    await mosquesCol().doc(m.id).set(update, { merge: true });
  } else {
    // local fallback
    const idx = MOSQUES.findIndex((x) => x.id === m.id);
    if (idx >= 0) MOSQUES[idx] = { ...MOSQUES[idx], ...update };
    localStorage.setItem('mosques', JSON.stringify(MOSQUES));
  }
}

async function addMosqueAsSuper() {
  const name = (el('adm-new-name').value || '').trim();
  if (!name) return alert('Nom requis');

  // slug id
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const docId = id || `mosquee-${Date.now()}`;

  if (firestoreReady) {
    await mosquesCol().doc(docId).set({
      name,
      city: 'Medina',
      wave: '',
      orange: '',
      contact: '',
      phone: '',
      jumua: '13:30',
      ann: '',
      events: [],
      goalMonthly: 100000,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  el('adm-new-name').value = '';
  await loadAndRenderMosques();
  showStatus('Mosquée ajoutée.');
}

async function deleteMosqueAsSuper() {
  const m = getCurrentMosque();
  if (!m) return;
  if (!confirm(`Supprimer "${m.name}" ?`)) return;

  if (firestoreReady) {
    await mosquesCol().doc(m.id).delete();
  }

  await loadAndRenderMosques();
  showStatus('Mosquée supprimée.');
}

function setupAdmin() {
  el('admin-button').onclick = async () => {
    const pw = prompt('Code d’accès :');
    if (pw === SUPER_ADMIN_PASSWORD) SESSION_ROLE = 'super';
    else if (pw === ADMIN_PASSWORD) SESSION_ROLE = 'admin';
    else return alert('Code incorrect.');

    const isSuper = SESSION_ROLE === 'super';
    el('super-row').style.display = isSuper ? 'flex' : 'none';
    el('role-hint').textContent = isSuper ? 'Mode SUPER ADMIN' : 'Mode ADMIN';

    populateCitySelect(el('adm-city'));
    populateAdminMosqueSelect();
    fillAdminForm();

    openModal('modal-admin');

    await renderAdminDonationsTable();
    await refreshDonationsUI();
  };

  el('add-mosque').onclick = addMosqueAsSuper;
  el('del-mosque').onclick = deleteMosqueAsSuper;

  el('save').onclick = async () => {
    await saveCurrentMosqueFromAdmin();
    closeAll();
    await loadAndRenderMosques();
    await fetchTimings();
    await refreshDonationsUI();
    showStatus('Enregistré.');
  };
}

/***********************
 * Tasbih
 ***********************/
function setupTasbih() {
  const k = 'tasbih_count';
  const countEl = el('tasbih-count');
  const plus = el('tasbih-plus');
  const reset = el('tasbih-reset');
  if (!countEl || !plus || !reset) return;

  const get = () => parseInt(localStorage.getItem(k) || '0', 10) || 0;
  const set = (v) => { localStorage.setItem(k, String(v)); countEl.textContent = String(v); };

  set(get());

  plus.onclick = () => {
    set(get() + 1);
    // haptique léger
    navigator.vibrate && navigator.vibrate(20);
  };
  reset.onclick = () => set(0);
}

/***********************
 * Render everything
 ***********************/
function displayAll(data) {
  timingsData = (data && data.timings) ? data.timings : null;
  const m = getCurrentMosque();
  if (!m) return;

  el('mosque-name').textContent = m.name;
  el('wave-number').textContent = m.wave || '—';
  el('orange-number').textContent = m.orange || '—';

  el('about-contact-name').textContent = m.contact || '—';
  el('about-contact-phone').textContent = m.phone || '—';

  if (timingsData) {
    PRAYER_NAMES.forEach((k) => {
      el(`${k.toLowerCase()}-name`).textContent = `${DISPLAY[k].local} (${DISPLAY[k].ar})`;
      el(`${k.toLowerCase()}-time`).textContent = timingsData[k] || '--:--';
    });

    el('shuruq-time').textContent = timingsData.Sunrise || '--:--';
    el('jumua-time').textContent = m.jumua || '13:30';
  }

  // Hijri from API response if available
  if (data && data.date && data.date.hijri) {
    el('hijri-date').textContent = `${data.date.hijri.day} ${data.date.hijri.month.ar} ${data.date.hijri.year} AH`;
  } else {
    el('hijri-date').textContent = '—';
  }

  // announcements + notif
  const ann = String(m.ann || '').trim();
  el('announcement-text').textContent = ann || 'Aucune annonce.';
  const seenKey = `annSeen_${m.id}_${todayKey()}`;
  el('notif').style.display = (ann && !localStorage.getItem(seenKey)) ? 'inline-block' : 'none';

  updatePublicCategoryHelp();
  updateNextCountdown();
  renderEvents();
  renderRamadan();
}

/***********************
 * Load mosques + initial render
 ***********************/
async function loadAndRenderMosques() {
  if (firestoreReady) await ensureSeedIfEmpty();

  MOSQUES = await fetchMosques();

  applyMosqueLocking();

  // if locked id doesn't exist, fallback to first
  if (!MOSQUES.some((x) => x.id === currentMosqueId) && MOSQUES[0]) {
    currentMosqueId = MOSQUES[0].id;
    setStoredMosqueId(currentMosqueId);
  }

  // update UI immediately
  const m = getCurrentMosque();
  el('mosque-name').textContent = m ? m.name : 'Mosquée';
  el('wave-number').textContent = m ? (m.wave || '—') : '—';
  el('orange-number').textContent = m ? (m.orange || '—') : '—';
  el('jumua-time').textContent = m ? (m.jumua || '--:--') : '--:--';

  await refreshDonationsUI();
}

/***********************
 * Setup
 ***********************/
async function setup() {
  // dark mode initial
  setDark(isDark());

  bindModals();
  setupFooter();
  setupDonationButtons();
  setupAdmin();
  setupTasbih();

  // quick: toggle dark mode by double click on title (simple)
  el('mosque-name').ondblclick = () => toggleDark();

  updateClock();
  setInterval(updateClock, 1000);

  await initFirebase();
  await loadAndRenderMosques();

  await fetchTimings();
  setInterval(updateNextCountdown, 1000);

  // refresh donation KPIs periodically (light)
  setInterval(() => { refreshDonationsUI().catch(()=>{}); }, 15000);
}

document.addEventListener('DOMContentLoaded', setup);
