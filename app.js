const ADMIN_PASSWORD = '1234';
const SUPER_ADMIN_PASSWORD = '9999';
let SESSION_ROLE = 'guest';

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

const DEFAULT_MOSQUES = [
  { id: 'bene-tally', name: 'Bene Tally', city: 'Medina', wave: '772682103', orange: '772682103', contact: 'Imam Diallo', phone: '+221772682103', jumua: '13:30', ann: 'Bienvenue à Bene Tally.', events: [{ title: 'Cours de Fiqh', date: 'Mardi après Isha' }], method: 3, school: 0, offsets: [0, 0, 0, 0, 0, 0], adhanUrl: '', quiet: '22:00-05:00', allowFajr: true },
  { id: 'medina-centre', name: 'Medina Centre', city: 'Dakar', wave: '770000000', orange: '780000000', contact: 'Imam Ndiaye', phone: '+221780000000', jumua: '14:00', ann: 'Annonce importante pour la Medina.', events: [{ title: 'Cercle de Coran', date: 'Samedi après Fajr' }], method: 3, school: 0, offsets: [0, 0, 0, 0, 0, 0], adhanUrl: '', quiet: '22:00-05:00', allowFajr: true },
];

const MOCK = { Fajr: '05:45', Sunrise: '07:00', Dhuhr: '13:30', Asr: '16:45', Maghrib: '19:05', Isha: '20:30' };

// ⚠️ Ramadan start (tu m’avais donné 18 février)
const RAMADAN_START_DATE = '2026-02-18';
const RAMADAN_TOTAL_DAYS = 30;

const KAABA = { lat: 21.4225, lon: 39.8262 };

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

function buildTuneParam(offsets) {
  const a = offsets && offsets.length === 6 ? offsets : [0, 0, 0, 0, 0, 0];
  return a.join(',');
}

/* Mosques */
function loadMosques() {
  let arr = JSON.parse(localStorage.getItem('mosques') || 'null');
  if (!arr || !arr.length) {
    arr = DEFAULT_MOSQUES;
    localStorage.setItem('mosques', JSON.stringify(arr));
    localStorage.setItem('currentMosqueId', arr[0].id);
  }
  return arr;
}

function saveMosques(arr) { localStorage.setItem('mosques', JSON.stringify(arr)); }

function getCurrentMosque() {
  const arr = loadMosques();
  const id = localStorage.getItem('currentMosqueId') || arr[0].id;
  return arr.find((m) => m.id === id) || arr[0];
}

function setCurrentMosque(id) { localStorage.setItem('currentMosqueId', id); }

/* URL lock */
function getForcedMosqueIdFromURL() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('m');
  return id ? String(id).trim() : '';
}

function applyMosqueLockIfForced() {
  const forcedId = getForcedMosqueIdFromURL();
  if (!forcedId) return false;

  const arr = loadMosques();
  const exists = arr.some((x) => x.id === forcedId);
  if (!exists) return false;

  setCurrentMosque(forcedId);

  const selRow = el('mosque-select-row');
  const lockLine = el('mosque-lockline');
  const sel = el('mosque-selector');
  const lock = el('mosque-lock');

  if (sel) {
    sel.value = forcedId;
    sel.disabled = true;
    sel.style.opacity = '0.65';
    sel.style.cursor = 'not-allowed';
  }
  if (lock) lock.style.display = 'inline-block';

  if (selRow) selRow.style.display = 'none'; // étape suivante du link: cacher le select
  if (lockLine) lockLine.style.display = 'flex';

  return true;
}

function isMosqueForced() {
  return !!getForcedMosqueIdFromURL();
}

function generatePublicLinkForMosque(mosqueId) {
  const base = window.location.origin + window.location.pathname;
  return `${base}?m=${encodeURIComponent(mosqueId)}`;
}

/* Dates */
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
function keyDay() { return new Date().toISOString().slice(0, 10); }

function updateClock() {
  const n = new Date();
  el('current-time').textContent = [n.getHours(), n.getMinutes(), n.getSeconds()].map((v) => String(v).padStart(2, '0')).join(':');
  el('gregorian-date').textContent = `${WEEKDAYS[n.getDay()]} ${n.getDate()} ${MONTHS[n.getMonth()]} ${n.getFullYear()}`;
}

/* Selector */
function populateMosqueSelector() {
  const arr = loadMosques();
  const sel = el('mosque-selector');
  if (!sel) return;

  sel.innerHTML = '';
  arr.forEach((m) => {
    const o = document.createElement('option');
    o.value = m.id;
    o.textContent = m.name;
    sel.appendChild(o);
  });

  sel.value = getCurrentMosque().id;

  sel.onchange = (e) => {
    setCurrentMosque(e.target.value);
    fetchTimings();
  };
}

/* Events */
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
    item.style.border = '1px solid #eef2f7';
    item.style.borderRadius = '12px';
    item.style.padding = '10px 12px';
    item.innerHTML = `<div style="font-weight:900;color:#1f5e53">${escapeHtml(ev.title || '')}</div>
                      <div class="small">${escapeHtml(ev.date || '')}</div>`;
    wrap.appendChild(item);
  });

  box.innerHTML = '';
  box.appendChild(wrap);
}

/* Ramadan compact A */
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

  el('ramadan-day').textContent = `Jour ${dayIndex}/${RAMADAN_TOTAL_DAYS}`;
  el('ramadan-left').textContent = left === 0 ? 'Dernier jour' : `${left} j restants`;
  el('ramadan-sub').textContent = `${dayIndex} Ramadan • ${WEEKDAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}`;

  el('ramadan-iftar').textContent = (timingsData && timingsData.Maghrib) ? timingsData.Maghrib : '--:--';
  el('ramadan-suhoor').textContent = (timingsData && timingsData.Fajr) ? timingsData.Fajr : '--:--';

  card.style.display = 'block';
}

/* Audio */
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

function isQuietNow() {
  const m = getCurrentMosque();
  const q = String(m.quiet || '22:00-05:00').split('-');
  if (q.length !== 2) return false;

  const s = parseHM(q[0]);
  const e = parseHM(q[1]);
  const now = new Date();
  const n = now.getHours() * 60 + now.getMinutes();
  const start = s.h * 60 + s.m;
  const end = e.h * 60 + e.m;
  const inRange = start <= end ? (n >= start && n < end) : (n >= start || n < end);

  const txt = String(el('next-prayer-name')?.textContent || '').toLowerCase();
  const isFajr = txt.includes('fajr') || txt.includes('souba');

  return inRange && !(m.allowFajr && isFajr);
}

function playChime() { if (isQuietNow()) return; playBeep(650, 740); navigator.vibrate && navigator.vibrate(150); }

function playAdhan() {
  const m = getCurrentMosque();
  if (isQuietNow()) return;

  if (m.adhanUrl) {
    const a = new Audio(m.adhanUrl);
    a.play().catch(() => playBeep(1000, 660));
  } else {
    playBeep(1000, 660);
  }
}

/* Next prayer */
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

  if (delta <= 900 && playedFor !== name) {
    playAdhan();
    playedFor = name;
  }

  if (delta > 1500 && name === playedFor) playedFor = '';
}

/* API timings */
function mockData() {
  return { timings: MOCK, date: { hijri: { day: '3', month: { ar: "Rabi' al-Awwal" }, year: '1447' } } };
}

async function fetchTimings() {
  const m = getCurrentMosque();
  const base = CITY_COORDS[m.city] || CITY_COORDS.Medina;

  const method = (m.method != null) ? m.method : 3;
  const school = (m.school != null) ? m.school : 0;
  const tune = buildTuneParam(m.offsets || [0, 0, 0, 0, 0, 0]);

  const url = `https://api.aladhan.com/v1/timings?latitude=${base.lat}&longitude=${base.lon}&method=${method}&school=${school}&tune=${tune}`;

  const key = `cache_${m.id}_${new Date().toDateString()}`;
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
      throw new Error('bad');
    }
  } catch {
    showStatus(loaded ? 'Hors-ligne – cache.' : 'Données par défaut affichées.', loaded ? '#ca8a04' : '#e11d48');
    if (!loaded) displayAll(mockData());
  }
}

/* Donations (secure: pending -> admin confirm -> totals update) */
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

function kGoal(m) { return `dong_${m.id}`; }
function getGoal(m) { const g = localStorage.getItem(kGoal(m)); return g ? parseInt(g, 10) : 100000; }
function setGoal(m, val) { localStorage.setItem(kGoal(m), String(Math.max(0, parseInt(val, 10) || 0))); }

function kConfirmedDay(m, dayKey) { return `donok_${m.id}_${dayKey}`; }
function kConfirmedToday(m) { return kConfirmedDay(m, keyDay()); }
function kMonthSum(m) { return `donm_${m.id}_${ymKey()}`; }

function loadConfirmedForDay(m, dayKey) { return JSON.parse(localStorage.getItem(kConfirmedDay(m, dayKey)) || '[]'); }
function saveConfirmedForDay(m, dayKey, list) { localStorage.setItem(kConfirmedDay(m, dayKey), JSON.stringify(list)); }

function monthSum(m) { return parseInt(localStorage.getItem(kMonthSum(m)) || '0', 10); }
function setMonthSum(m, v) { localStorage.setItem(kMonthSum(m), String(Math.max(0, parseInt(v, 10) || 0))); }

/* Pending list */
function kPending(m) { return `donpending_${m.id}`; }
function loadPending(m) { return JSON.parse(localStorage.getItem(kPending(m)) || '[]'); }
function savePending(m, list) { localStorage.setItem(kPending(m), JSON.stringify(list)); }

/* keep storage sane */
function trimList(list, maxLen) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, Math.max(0, maxLen));
}

function confirmedSumToday() {
  const m = getCurrentMosque();
  return loadConfirmedForDay(m, keyDay()).reduce((s, x) => s + (Number(x.amount) || 0), 0);
}

function renderDonationAdminKpis() {
  const m = getCurrentMosque();
  const goal = getGoal(m);
  const day = confirmedSumToday();
  const month = monthSum(m);

  if (el('don-goal')) el('don-goal').textContent = goal.toLocaleString('fr-FR');
  if (el('don-today')) el('don-today').textContent = day.toLocaleString('fr-FR');
  if (el('don-month')) el('don-month').textContent = month.toLocaleString('fr-FR');

  const left = Math.max(0, goal - day);
  if (el('don-left')) el('don-left').textContent = left.toLocaleString('fr-FR');

  const p = goal ? Math.min(100, Math.round((day * 100) / goal)) : 0;
  if (el('don-bar')) el('don-bar').style.width = `${p}%`;
}

function getLastNDaysKeys(n) {
  const keys = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  for (let i = 0; i < n; i += 1) {
    const x = new Date(d);
    x.setDate(d.getDate() - i);
    keys.push(isoDayKey(x));
  }
  return keys;
}

function computeWeekStats() {
  const m = getCurrentMosque();
  const dayKeys = getLastNDaysKeys(7);
  const totals = { all: 0, Zakat: 0, Sadaqa: 0, Travaux: 0 };

  dayKeys.forEach((dk) => {
    const list = loadConfirmedForDay(m, dk);
    list.forEach((x) => {
      const cat = normalizeCategory(x.category);
      totals.all += Number(x.amount) || 0;
      totals[cat] += Number(x.amount) || 0;
    });
  });

  return totals;
}

function renderDonWeekStats() {
  const totals = computeWeekStats();
  if (el('don-week')) el('don-week').textContent = totals.all.toLocaleString('fr-FR');
  if (el('don-week-zakat')) el('don-week-zakat').textContent = totals.Zakat.toLocaleString('fr-FR');
  if (el('don-week-sadaqa')) el('don-week-sadaqa').textContent = totals.Sadaqa.toLocaleString('fr-FR');
  if (el('don-week-travaux')) el('don-week-travaux').textContent = totals.Travaux.toLocaleString('fr-FR');
}

/* Admin notification badge */
function updateAdminPendingBadge() {
  const m = getCurrentMosque();
  const pending = loadPending(m);
  const count = pending.length;

  const badge = el('admin-badge');
  const pill = el('adm-pending-pill');

  if (badge) {
    if (count > 0) {
      badge.textContent = String(count);
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }

  if (pill) {
    if (count > 0) {
      pill.textContent = String(count);
      pill.style.display = 'inline-block';
    } else {
      pill.style.display = 'none';
    }
  }
}

function playNotify() {
  navigator.vibrate && navigator.vibrate(80);
  playBeep(120, 1040);
}

/* Public submits pending */
function addPendingDonation({ amount, method, category, ref }) {
  const m = getCurrentMosque();
  const list = loadPending(m);

  const entry = {
    id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    ts: new Date().toISOString(),
    amount: Number(amount) || 0,
    method: method || 'Wave',
    category: normalizeCategory(category),
    ref: String(ref || '').trim(),
    status: 'pending',
  };

  list.unshift(entry);
  savePending(m, trimList(list, 200));

  updateAdminPendingBadge();
  playNotify();
}

/* Confirm / reject in admin */
function confirmPending(id) {
  const m = getCurrentMosque();
  const pending = loadPending(m);
  const idx = pending.findIndex((x) => x.id === id);
  if (idx < 0) return;

  const x = pending[idx];

  // remove from pending
  pending.splice(idx, 1);
  savePending(m, pending);

  // add to confirmed today (keep small)
  const dayKey = keyDay();
  const confirmed = loadConfirmedForDay(m, dayKey);
  confirmed.unshift({
    id: x.id,
    ts: x.ts,
    amount: Number(x.amount) || 0,
    method: x.method,
    category: x.category,
    ref: x.ref,
  });
  saveConfirmedForDay(m, dayKey, trimList(confirmed, 200));

  // update month sum
  setMonthSum(m, monthSum(m) + (Number(x.amount) || 0));

  updateAdminPendingBadge();
  renderDonationAdminKpis();
  renderDonWeekStats();
  renderDonTableAdmin();
}

function rejectPending(id) {
  const m = getCurrentMosque();
  const pending = loadPending(m);
  const idx = pending.findIndex((x) => x.id === id);
  if (idx < 0) return;

  pending.splice(idx, 1);
  savePending(m, pending);

  updateAdminPendingBadge();
  renderDonTableAdmin();
}

function renderDonTableAdmin() {
  const tb = document.querySelector('#don-table tbody');
  if (!tb) return;

  const m = getCurrentMosque();
  const pending = loadPending(m);

  tb.innerHTML = '';

  if (!pending.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="7" class="small" style="padding:10px">Aucun don en attente.</td>`;
    tb.appendChild(tr);
    return;
  }

  pending.forEach((r) => {
    const tr = document.createElement('tr');
    const st = '<span class="badge b-p">En attente</span>';
    tr.innerHTML = `
      <td>${new Date(r.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
      <td><strong>${(Number(r.amount) || 0).toLocaleString('fr-FR')}</strong></td>
      <td>${escapeHtml(r.method || '')}</td>
      <td><strong>${escapeHtml(normalizeCategory(r.category))}</strong></td>
      <td>${escapeHtml(r.ref || '')}</td>
      <td>${st}</td>
      <td style="white-space:nowrap">
        <button data-act="ok" data-id="${r.id}" class="btn btn-primary" style="padding:6px 10px; min-width:auto">OK</button>
        <button data-act="no" data-id="${r.id}" class="btn" style="padding:6px 10px; min-width:auto; background:#ef4444; color:#fff">X</button>
      </td>
    `;
    tb.appendChild(tr);
  });

  tb.querySelectorAll('button[data-act]').forEach((b) => {
    b.onclick = () => {
      if (b.dataset.act === 'ok') confirmPending(b.dataset.id);
      else rejectPending(b.dataset.id);
    };
  });
}

/* WhatsApp shortcuts (no totals update) */
function openWhatsApp(to, msg) {
  window.open(`https://wa.me/${encodeURIComponent(to)}?text=${encodeURIComponent(msg)}`, '_blank');
}

function setupDonButtons() {
  const catSel = el('don-public-category');
  if (catSel) catSel.onchange = () => updatePublicCategoryHelp();

  el('btn-wave').onclick = () => {
    const m = getCurrentMosque();
    const cat = getPublicCategory();
    openWhatsApp(m.phone || '', `Salam, je souhaite faire un don via *Wave Money*.
Catégorie : *${cat}*
Montant : [à renseigner] CFA
Numéro Wave : ${m.wave}
Mosquée : ${m.name}
BarakAllahou fik.`);
  };

  el('btn-orange').onclick = () => {
    const m = getCurrentMosque();
    const cat = getPublicCategory();
    openWhatsApp(m.phone || '', `Salam, je souhaite faire un don via *Orange Money*.
Catégorie : *${cat}*
Montant : [à renseigner] CFA
Numéro Orange : ${m.orange}
Mosquée : ${m.name}
BarakAllahou fik.`);
  };

  // open modal to submit pending donation
  el('btn-claimed').onclick = () => {
    const modal = el('modal-donate');
    if (!modal) return;
    el('pub-category').value = getPublicCategory();
    modal.style.display = 'block';
  };

  // submit pending
  el('pub-submit').onclick = () => {
    const amt = parseInt(el('pub-amt').value, 10) || 0;
    if (amt <= 0) return alert('Montant invalide');

    addPendingDonation({
      amount: amt,
      method: el('pub-method').value,
      category: el('pub-category').value,
      ref: el('pub-ref').value,
    });

    // clean
    el('pub-amt').value = '';
    el('pub-ref').value = '';

    closeAll();
    showStatus(`Merci pour votre don de ${amt.toLocaleString('fr-FR')} CFA. En attente de confirmation.`, '#1f5e53');
  };
}

/* Qibla (Maps only) */
function openQiblaInMaps(originLat, originLon) {
  const origin = `${originLat},${originLon}`;
  const dest = `${KAABA.lat},${KAABA.lon}`;
  window.open(`https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}`, '_blank');
}

function setupQiblaMaps() {
  const btn = el('qibla-maps-btn');
  const status = el('qibla-maps-status');
  if (!btn || !status) return;

  const m = getCurrentMosque();
  const base = CITY_COORDS[m.city] || CITY_COORDS.Medina;

  status.textContent = `Ville: ${m.city} (par défaut).`;
  btn.onclick = () => openQiblaInMaps(base.lat, base.lon);

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        status.textContent = 'GPS: OK (plus précis).';
        btn.onclick = () => openQiblaInMaps(pos.coords.latitude, pos.coords.longitude);
      },
      () => { status.textContent = `GPS refusé. Ville: ${m.city}.`; },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  }
}

/* Tasbih */
function setupTasbih() {
  const k = 'tasbih_count';
  const countEl = el('tasbih-count');
  const plus = el('tasbih-plus');
  const reset = el('tasbih-reset');
  if (!countEl || !plus || !reset) return;

  const get = () => parseInt(localStorage.getItem(k) || '0', 10) || 0;
  const set = (v) => { localStorage.setItem(k, String(v)); countEl.textContent = String(v); };

  set(get());
  plus.onclick = () => set(get() + 1);
  reset.onclick = () => set(0);
}

/* Modals */
function openModal(id) { el(id).style.display = 'block'; }
function closeAll() { document.querySelectorAll('.modal').forEach((m) => { m.style.display = 'none'; }); }
function bindModals() {
  document.querySelectorAll('.modal .close').forEach((x) => x.addEventListener('click', closeAll));
  window.addEventListener('click', (e) => {
    if (e.target && e.target.classList && e.target.classList.contains('modal')) closeAll();
  });
}

/* 99 Names (inchangé avec parenthèses) */
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

/* Footer */
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

/* Admin */
function populateCitySelect(select) {
  select.innerHTML = '';
  Object.keys(CITY_COORDS).forEach((c) => {
    const o = document.createElement('option');
    o.value = c;
    o.textContent = c;
    select.appendChild(o);
  });
}

function fillAdminForm(id) {
  const m = loadMosques().find((x) => x.id === id);
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
  el('adm-method').value = (m.method != null) ? m.method : 3;
  el('adm-school').value = (m.school != null) ? m.school : 0;
  el('adm-offsets').value = (m.offsets && m.offsets.length === 6 ? m.offsets : [0, 0, 0, 0, 0, 0]).join(',');
  if (el('adm-adhan-url')) el('adm-adhan-url').value = m.adhanUrl || '';
  if (el('adm-quiet')) el('adm-quiet').value = m.quiet || '22:00-05:00';
  if (el('adm-allow-fajr')) el('adm-allow-fajr').checked = !!m.allowFajr;

  el('adm-goal').value = getGoal(m);

  const linkInput = el('adm-public-link');
  if (linkInput) linkInput.value = generatePublicLinkForMosque(m.id);
}

function populateAdmMosqueSelect() {
  const sel = el('adm-mosque');
  if (!sel) return;

  const arr = loadMosques();
  sel.innerHTML = '';
  arr.forEach((m) => {
    const o = document.createElement('option');
    o.value = m.id;
    o.textContent = m.name;
    sel.appendChild(o);
  });
  sel.value = getCurrentMosque().id;

  sel.onchange = () => {
    setCurrentMosque(sel.value);
    fillAdminForm(sel.value);
    updateAdminPendingBadge();
    renderDonationAdminKpis();
    renderDonWeekStats();
    renderDonTableAdmin();
  };
}

function setupAdmin() {
  el('admin-button').onclick = () => {
    const pw = prompt('Code d’accès :');
    if (pw === SUPER_ADMIN_PASSWORD) SESSION_ROLE = 'super';
    else if (pw === ADMIN_PASSWORD) SESSION_ROLE = 'admin';
    else return alert('Code incorrect.');

    const isSuper = SESSION_ROLE === 'super';
    el('super-row').style.display = isSuper ? 'flex' : 'none';
    if (el('advanced-block')) el('advanced-block').style.display = isSuper ? 'block' : 'none';
    el('role-hint').textContent = isSuper ? 'Mode SUPER ADMIN' : 'Mode ADMIN (mosquée verrouillée)';

    populateCitySelect(el('adm-city'));

    if (isSuper) populateAdmMosqueSelect();

    fillAdminForm(getCurrentMosque().id);
    renderDonationAdminKpis();
    renderDonWeekStats();
    renderDonTableAdmin();
    updateAdminPendingBadge();

    // link buttons
    const linkInput = el('adm-public-link');
    el('adm-copy-link').onclick = async () => {
      try {
        await navigator.clipboard.writeText(linkInput.value);
        showStatus('Lien copié.');
      } catch {
        alert('Copie impossible. Copie manuelle.');
      }
    };

    el('adm-share-link').onclick = () => {
      const m = getCurrentMosque();
      const text = `🕌 Mosquée ${m.name}\nLien officiel :\n${linkInput.value}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    };

    openModal('modal-admin');
  };

  el('save').onclick = () => {
    const arr = loadMosques();
    const cur = getCurrentMosque();
    const idx = arr.findIndex((x) => x.id === cur.id);
    if (idx < 0) return;

    let offsets = el('adm-offsets').value.split(',').map((v) => parseInt(v.trim(), 10));
    if (offsets.length !== 6 || offsets.some(Number.isNaN)) offsets = [0, 0, 0, 0, 0, 0];

    arr[idx] = {
      ...arr[idx],
      name: el('adm-name').value.trim() || 'Mosquée',
      city: el('adm-city').value,
      wave: el('adm-wave').value.trim(),
      orange: el('adm-orange').value.trim(),
      contact: el('adm-contact').value.trim(),
      phone: el('adm-phone').value.trim(),
      jumua: el('adm-jumua').value || '13:30',
      ann: el('adm-ann').value,
      events: el('adm-events').value.split('\n').filter((l) => l.trim() !== '').map((l) => {
        const [t, ...r] = l.split('|');
        return { title: (t || '').trim(), date: (r.join('|') || '').trim() };
      }),
      method: parseInt(el('adm-method').value, 10),
      school: parseInt(el('adm-school').value, 10),
      offsets,
      adhanUrl: el('adm-adhan-url') ? el('adm-adhan-url').value.trim() : '',
      quiet: el('adm-quiet') ? (el('adm-quiet').value.trim() || '22:00-05:00') : '22:00-05:00',
      allowFajr: el('adm-allow-fajr') ? el('adm-allow-fajr').checked : true,
    };

    saveMosques(arr);
    setGoal(getCurrentMosque(), el('adm-goal').value);

    closeAll();
    fetchTimings();
    showStatus('Enregistré.');
  };
}

/* Display all */
function displayAll(data) {
  timingsData = (data && data.timings) ? data.timings : MOCK;
  const m = getCurrentMosque();

  el('mosque-name').textContent = m.name;
  el('wave-number').textContent = m.wave || '—';
  el('orange-number').textContent = m.orange || '—';
  el('cash-info').textContent = m.name || 'Mosquée';

  el('about-contact-name').textContent = m.contact || '—';
  el('about-contact-phone').textContent = m.phone || '—';

  PRAYER_NAMES.forEach((k) => {
    el(`${k.toLowerCase()}-name`).textContent = `${DISPLAY[k].local} (${DISPLAY[k].ar})`;
    el(`${k.toLowerCase()}-time`).textContent = timingsData[k] || '--:--';
  });

  el('shuruq-time').textContent = timingsData.Sunrise || '--:--';
  el('jumua-time').textContent = m.jumua || '13:30';

  if (data && data.date && data.date.hijri) {
    el('hijri-date').textContent = `${data.date.hijri.day} ${data.date.hijri.month.ar} ${data.date.hijri.year} AH`;
  } else {
    el('hijri-date').textContent = 'Date hégirienne indisponible';
  }

  const ann = String(m.ann || '').trim();
  el('announcement-text').textContent = ann || 'Aucune annonce.';
  const seenKey = `annSeen_${m.id}_${todayKey()}`;
  el('notif').style.display = (ann && !localStorage.getItem(seenKey)) ? 'inline-block' : 'none';

  updatePublicCategoryHelp();
  updateNextCountdown();
  renderRamadan();
  setupQiblaMaps();
  updateAdminPendingBadge();
}

/* Init */
function setup() {
  bindModals();
  populateMosqueSelector();
  applyMosqueLockIfForced();

  setupFooter();
  setupDonButtons();
  setupAdmin();
  setupTasbih();

  updateClock();
  setInterval(updateClock, 1000);

  fetchTimings();
  setInterval(updateNextCountdown, 1000);
}

document.addEventListener('DOMContentLoaded', setup);
