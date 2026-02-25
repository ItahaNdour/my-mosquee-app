/* MyMosque - Local first (Sénégal) - Admin via Téléphone + PIN */

const RAMADAN_START_DATE = '2026-02-18';
const RAMADAN_TOTAL_DAYS = 30;

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
  {
    id: 'bene-tally',
    name: 'Bene Tally',
    city: 'Medina',
    wave: '772682103',
    orange: '772682103',
    contact: 'Imam Diallo',
    phone: '+221772682103',
    jumua: '13:30',
    ann: 'Bienvenue à Bene Tally.',
    events: [{ title: 'Cours de Fiqh', date: 'Mardi après Isha' }],
    method: 3,
    school: 0,
    offsets: [0, 0, 0, 0, 0, 0],
    adhanUrl: '',
    quiet: '22:00-05:00',
    allowFajr: true,
  },
  {
    id: 'medina-centre',
    name: 'Medina Centre',
    city: 'Dakar',
    wave: '770000000',
    orange: '780000000',
    contact: 'Imam Ndiaye',
    phone: '+221780000000',
    jumua: '14:00',
    ann: 'Annonce importante pour la Medina.',
    events: [{ title: 'Cercle de Coran', date: 'Samedi après Fajr' }],
    method: 3,
    school: 0,
    offsets: [0, 0, 0, 0, 0, 0],
    adhanUrl: '',
    quiet: '22:00-05:00',
    allowFajr: true,
  },
];

const MOCK = { Fajr: '05:45', Sunrise: '07:00', Dhuhr: '13:30', Asr: '16:45', Maghrib: '19:05', Isha: '20:30' };
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
let SESSION = { role: 'guest', adminPhone: null, mosqueId: null };

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

/* ---------- URL /?m=... ---------- */
function getQueryParam(name) {
  const p = new URLSearchParams(window.location.search);
  return p.get(name);
}

function applyMosqueFromUrl() {
  const m = getQueryParam('m');
  if (!m) return false;
  const arr = loadMosques();
  if (!arr.some((x) => x.id === m)) return false;
  localStorage.setItem('currentMosqueId', m);
  return true;
}

/* ---------- Slug generator ---------- */
function stripDiacritics(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function slugifyName(name) {
  const base = stripDiacritics(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return base || `mosquee-${Date.now().toString(36)}`;
}

function uniqueMosqueIdFromName(name) {
  const mosques = loadMosques();
  const base = slugifyName(name);
  let id = base;
  let n = 2;
  while (mosques.some((m) => m.id === id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  return id;
}

/* ---------- Storage: Mosques ---------- */
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

/* ---------- Storage: Admin users (phone + pin) ---------- */
function normalizePhone(p) {
  return String(p || '').trim().replace(/\s+/g, '');
}

function loadAdminUsers() {
  let users = JSON.parse(localStorage.getItem('adminUsers') || 'null');
  if (!Array.isArray(users) || !users.length) {
    const mosques = loadMosques();
    users = [];

    users.push({ phone: '+221770000000', pin: '9999', role: 'super', mosqueId: null });

    mosques.forEach((m) => {
      users.push({ phone: normalizePhone(m.phone), pin: '1234', role: 'admin', mosqueId: m.id });
    });

    localStorage.setItem('adminUsers', JSON.stringify(users));
  }
  return users;
}

function saveAdminUsers(users) {
  localStorage.setItem('adminUsers', JSON.stringify(users));
}

function authenticate(phone, pin) {
  const p = normalizePhone(phone);
  const users = loadAdminUsers();
  return users.find((x) => normalizePhone(x.phone) === p && String(x.pin) === String(pin || '').trim()) || null;
}

function setSession(user) {
  SESSION.role = user.role;
  SESSION.adminPhone = user.phone;
  SESSION.mosqueId = user.mosqueId || null;
}

function clearSession() {
  SESSION = { role: 'guest', adminPhone: null, mosqueId: null };
}

/* ---------- Clock ---------- */
function updateClock() {
  const n = new Date();
  el('current-time').textContent = [n.getHours(), n.getMinutes(), n.getSeconds()].map((v) => String(v).padStart(2, '0')).join(':');
  el('gregorian-date').textContent = `${WEEKDAYS[n.getDay()]} ${n.getDate()} ${MONTHS[n.getMonth()]} ${n.getFullYear()}`;
}

/* ---------- Ramadan ---------- */
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
  const suhoor = (timingsData && timingsData.Fajr) ? timingsData.Fajr : '--:--';
  el('ramadan-iftar').textContent = iftar;
  el('ramadan-suhoor').textContent = suhoor;

  const durEl = el('ramadan-duration');
  if (durEl) durEl.textContent = formatFastingDurationShort(suhoor, iftar);

  card.style.display = 'block';
}

/* ---------- Audio ---------- */
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

/* ---------- Next prayer ---------- */
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

/* ---------- API timings ---------- */
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

/* ---------- Donations ---------- */
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

function openWhatsApp(to, msg) {
  window.open(`https://wa.me/${encodeURIComponent(to)}?text=${encodeURIComponent(msg)}`, '_blank');
}

function setupDonButtons() {
  el('don-public-category').onchange = () => updatePublicCategoryHelp();

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

  el('btn-claimed').onclick = () => {
    const m = getCurrentMosque();
    const cat = getPublicCategory();
    openWhatsApp(m.phone || '', `Salam, *j’ai donné* [montant] CFA via [Wave/Orange/Espèces].
Catégorie : *${cat}*
Référence : [collez le reçu]
Mosquée : ${m.name}`);
  };
}

function kGoal(m) { return `dong_${m.id}`; }
function getGoal(m) { const g = localStorage.getItem(kGoal(m)); return g ? parseInt(g, 10) : 100000; }
function setGoal(m, val) { localStorage.setItem(kGoal(m), String(Math.max(0, parseInt(val, 10) || 0))); }

function kListForDay(m, dayKey) { return `donlist_${m.id}_${dayKey}`; }
function kList(m) { return kListForDay(m, keyDay()); }
function kMonthSum(m) { return `donm_${m.id}_${ymKey()}`; }

function loadListForDay(m, dayKey) { return JSON.parse(localStorage.getItem(kListForDay(m, dayKey)) || '[]'); }
function loadList(m) { return JSON.parse(localStorage.getItem(kList(m)) || '[]'); }
function saveList(m, list) { localStorage.setItem(kList(m), JSON.stringify(list)); }

function monthSum(m) { return parseInt(localStorage.getItem(kMonthSum(m)) || '0', 10); }
function setMonthSum(m, v) { localStorage.setItem(kMonthSum(m), String(Math.max(0, parseInt(v, 10) || 0))); }

function confirmedSumToday() {
  const m = getCurrentMosque();
  return loadList(m).filter((x) => x.status === 'ok').reduce((s, x) => s + x.amount, 0);
}

function renderDonation() {
  const m = getCurrentMosque();
  const goal = getGoal(m);
  const day = confirmedSumToday();
  const month = monthSum(m);

  el('don-goal').textContent = goal.toLocaleString('fr-FR');
  el('don-today').textContent = day.toLocaleString('fr-FR');
  el('don-month').textContent = month.toLocaleString('fr-FR');

  const left = Math.max(0, goal - day);
  el('don-left').textContent = left.toLocaleString('fr-FR');

  const p = goal ? Math.min(100, Math.round((day * 100) / goal)) : 0;
  el('don-bar').style.width = `${p}%`;
}

function renderDonTable() {
  const m = getCurrentMosque();
  const tb = document.querySelector('#don-table tbody');
  if (!tb) return;
  tb.innerHTML = '';

  loadList(m).forEach((r) => {
    const tr = document.createElement('tr');
    const st = r.status === 'ok'
      ? '<span class="badge b-ok">Confirmé</span>'
      : (r.status === 'no'
        ? '<span class="badge b-no">Annulé</span>'
        : '<span class="badge b-p">En attente</span>');

    const category = normalizeCategory(r.category);

    tr.innerHTML = `<td>${new Date(r.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
      <td><strong>${r.amount.toLocaleString('fr-FR')}</strong></td>
      <td>${escapeHtml(r.method || '')}</td>
      <td><strong>${escapeHtml(category)}</strong></td>
      <td>${escapeHtml(r.ref || '')}</td>
      <td>${st}</td>
      <td style="white-space:nowrap">
        <button data-act="ok" data-id="${r.id}" class="btn btn-primary" style="padding:6px 10px; min-width:auto">OK</button>
        <button data-act="no" data-id="${r.id}" class="btn" style="padding:6px 10px; min-width:auto; background:#ef4444; color:#fff">X</button>
      </td>`;
    tb.appendChild(tr);
  });

  tb.querySelectorAll('button[data-act]').forEach((b) => {
    b.onclick = () => setEntryStatus(b.dataset.id, b.dataset.act);
  });
}

function addDonationEntry({ amount, method, ref, category }) {
  const m = getCurrentMosque();
  const list = loadList(m);
  const id = Date.now().toString(36);

  list.unshift({
    id,
    ts: new Date().toISOString(),
    amount: Number(amount) || 0,
    method: method || 'Wave',
    category: normalizeCategory(category),
    ref: ref || '',
    status: 'pending',
  });

  saveList(m, list);
  renderDonTable();
  renderDonation();
  renderDonWeekStats();
}

function setEntryStatus(id, newStatus) {
  const m = getCurrentMosque();
  const list = loadList(m);
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return;

  const wasOk = list[i].status === 'ok';
  list[i].status = newStatus;
  saveList(m, list);

  if (newStatus === 'ok' && !wasOk) setMonthSum(m, monthSum(m) + list[i].amount);
  if (wasOk && newStatus !== 'ok') setMonthSum(m, monthSum(m) - list[i].amount);

  renderDonTable();
  renderDonation();
  renderDonWeekStats();
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
    const list = loadListForDay(m, dk);
    list
      .filter((x) => x.status === 'ok')
      .forEach((x) => {
        const cat = normalizeCategory(x.category);
        totals.all += Number(x.amount) || 0;
        totals[cat] += Number(x.amount) || 0;
      });
  });

  return totals;
}

function renderDonWeekStats() {
  const w = el('don-week');
  if (!w) return;

  const totals = computeWeekStats();
  el('don-week').textContent = totals.all.toLocaleString('fr-FR');
  el('don-week-zakat').textContent = totals.Zakat.toLocaleString('fr-FR');
  el('don-week-sadaqa').textContent = totals.Sadaqa.toLocaleString('fr-FR');
  el('don-week-travaux').textContent = totals.Travaux.toLocaleString('fr-FR');
}

/* ---------- Qibla (Maps only) ---------- */
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

/* ---------- Tasbih ---------- */
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
    if (navigator.vibrate) navigator.vibrate(12);
  };
  reset.onclick = () => set(0);
}

/* ---------- Events ---------- */
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

/* ---------- Modals ---------- */
function openModal(id) { el(id).style.display = 'block'; }
function closeAll() { document.querySelectorAll('.modal').forEach((m) => { m.style.display = 'none'; }); }
function bindModals() {
  document.querySelectorAll('.modal .close').forEach((x) => x.addEventListener('click', closeAll));
  window.addEventListener('click', (e) => {
    if (e.target && e.target.classList && e.target.classList.contains('modal')) closeAll();
  });
}

/* ---------- 99 Noms (COMPLETS) ---------- */
const NAMES_99 = [
  { n: 1, ar: 'ٱللَّٰه', fr: 'Allah' },
  { n: 2, ar: 'ٱلرَّحْمَٰن', fr: 'Ar-Rahman (Le Tout Miséricordieux)' },
  { n: 3, ar: 'ٱلرَّحِيم', fr: 'Ar-Rahim (Le Très Miséricordieux)' },
  { n: 4, ar: 'ٱلْمَلِك', fr: 'Al-Malik (Le Souverain)' },
  { n: 5, ar: 'ٱلْقُدُّوس', fr: 'Al-Quddus (Le Saint)' },
  { n: 6, ar: 'ٱلسَّلَام', fr: 'As-Salam (La Paix)' },
  { n: 7, ar: 'ٱلْمُؤْمِن', fr: 'Al-Mu’min (Le Garant)' },
  { n: 8, ar: 'ٱلْمُهَيْمِن', fr: 'Al-Muhaymin (Le Protecteur)' },
  { n: 9, ar: 'ٱلْعَزِيز', fr: 'Al-‘Aziz (Le Tout-Puissant)' },
  { n: 10, ar: 'ٱلْجَبَّار', fr: 'Al-Jabbar (Le Contraignant)' },
  { n: 11, ar: 'ٱلْمُتَكَبِّر', fr: 'Al-Mutakabbir (Le Suprême)' },
  { n: 12, ar: 'ٱلْخَالِق', fr: 'Al-Khaliq (Le Créateur)' },
  { n: 13, ar: 'ٱلْبَارِئ', fr: 'Al-Bari’ (Le Producteur)' },
  { n: 14, ar: 'ٱلْمُصَوِّر', fr: 'Al-Musawwir (Le Formateur)' },
  { n: 15, ar: 'ٱلْغَفَّار', fr: 'Al-Ghaffar (Le Grand Pardonneur)' },
  { n: 16, ar: 'ٱلْقَهَّار', fr: 'Al-Qahhar (Le Dominateur Suprême)' },
  { n: 17, ar: 'ٱلْوَهَّاب', fr: 'Al-Wahhab (Le Donateur)' },
  { n: 18, ar: 'ٱلرَّزَّاق', fr: 'Ar-Razzaq (Le Pourvoyeur)' },
  { n: 19, ar: 'ٱلْفَتَّاح', fr: 'Al-Fattah (L’Ouvreur)' },
  { n: 20, ar: 'ٱلْعَلِيم', fr: 'Al-‘Alim (L’Omniscient)' },
  { n: 21, ar: 'ٱلْقَابِض', fr: 'Al-Qabid (Celui qui retient)' },
  { n: 22, ar: 'ٱلْبَاسِط', fr: 'Al-Basit (Celui qui étend)' },
  { n: 23, ar: 'ٱلْخَافِض', fr: 'Al-Khafid (Celui qui abaisse)' },
  { n: 24, ar: 'ٱلرَّافِع', fr: 'Ar-Rafi‘ (Celui qui élève)' },
  { n: 25, ar: 'ٱلْمُعِزّ', fr: 'Al-Mu‘izz (Celui qui honore)' },
  { n: 26, ar: 'ٱلْمُذِلّ', fr: 'Al-Mudhill (Celui qui humilie)' },
  { n: 27, ar: 'ٱلسَّمِيع', fr: 'As-Sami‘ (L’Audient)' },
  { n: 28, ar: 'ٱلْبَصِير', fr: 'Al-Basir (Le Clairvoyant)' },
  { n: 29, ar: 'ٱلْحَكَم', fr: 'Al-Hakam (L’Arbitre)' },
  { n: 30, ar: 'ٱلْعَدْل', fr: 'Al-‘Adl (Le Juste)' },
  { n: 31, ar: 'ٱللَّطِيف', fr: 'Al-Latif (Le Subtil)' },
  { n: 32, ar: 'ٱلْخَبِير', fr: 'Al-Khabir (Le Bien Informé)' },
  { n: 33, ar: 'ٱلْحَلِيم', fr: 'Al-Halim (Le Longanime)' },
  { n: 34, ar: 'ٱلْعَظِيم', fr: 'Al-‘Azim (L’Immense)' },
  { n: 35, ar: 'ٱلْغَفُور', fr: 'Al-Ghafur (Le Pardonneur)' },
  { n: 36, ar: 'ٱلشَّكُور', fr: 'Ash-Shakur (Le Reconnaissant)' },
  { n: 37, ar: 'ٱلْعَلِيّ', fr: 'Al-‘Aliyy (Le Très-Haut)' },
  { n: 38, ar: 'ٱلْكَبِير', fr: 'Al-Kabir (Le Très Grand)' },
  { n: 39, ar: 'ٱلْحَفِيظ', fr: 'Al-Hafiz (Le Gardien)' },
  { n: 40, ar: 'ٱلْمُقِيت', fr: 'Al-Muqit (Le Nourricier)' },
  { n: 41, ar: 'ٱلْحَسِيب', fr: 'Al-Hasib (Celui qui suffit)' },
  { n: 42, ar: 'ٱلْجَلِيل', fr: 'Al-Jalil (Le Majestueux)' },
  { n: 43, ar: 'ٱلْكَرِيم', fr: 'Al-Karim (Le Généreux)' },
  { n: 44, ar: 'ٱلرَّقِيب', fr: 'Ar-Raqib (Le Vigilant)' },
  { n: 45, ar: 'ٱلْمُجِيب', fr: 'Al-Mujib (Celui qui exauce)' },
  { n: 46, ar: 'ٱلْوَاسِع', fr: 'Al-Wasi‘ (L’Immense)' },
  { n: 47, ar: 'ٱلْحَكِيم', fr: 'Al-Hakim (Le Sage)' },
  { n: 48, ar: 'ٱلْوَدُود', fr: 'Al-Wadud (Le Tout-Aimant)' },
  { n: 49, ar: 'ٱلْمَجِيد', fr: 'Al-Majid (Le Très Glorieux)' },
  { n: 50, ar: 'ٱلْبَاعِث', fr: 'Al-Ba‘ith (Celui qui ressuscite)' },
  { n: 51, ar: 'ٱلشَّهِيد', fr: 'Ash-Shahid (Le Témoin)' },
  { n: 52, ar: 'ٱلْحَقّ', fr: 'Al-Haqq (La Vérité)' },
  { n: 53, ar: 'ٱلْوَكِيل', fr: 'Al-Wakil (Le Garant)' },
  { n: 54, ar: 'ٱلْقَوِيّ', fr: 'Al-Qawiyy (Le Fort)' },
  { n: 55, ar: 'ٱلْمَتِين', fr: 'Al-Matin (L’Inébranlable)' },
  { n: 56, ar: 'ٱلْوَلِيّ', fr: 'Al-Waliyy (Le Protecteur)' },
  { n: 57, ar: 'ٱلْحَمِيد', fr: 'Al-Hamid (Le Digne de louange)' },
  { n: 58, ar: 'ٱلْمُحْصِي', fr: 'Al-Muhsi (Celui qui dénombre)' },
  { n: 59, ar: 'ٱلْمُبْدِئ', fr: 'Al-Mubdi’ (Le Commenceur)' },
  { n: 60, ar: 'ٱلْمُعِيد', fr: 'Al-Mu‘id (Le Restaurateur)' },
  { n: 61, ar: 'ٱلْمُحْيِي', fr: 'Al-Muhyi (Le Donneur de vie)' },
  { n: 62, ar: 'ٱلْمُمِيت', fr: 'Al-Mumit (Le Donneur de mort)' },
  { n: 63, ar: 'ٱلْحَيّ', fr: 'Al-Hayy (Le Vivant)' },
  { n: 64, ar: 'ٱلْقَيُّوم', fr: 'Al-Qayyum (Le Subsistant)' },
  { n: 65, ar: 'ٱلْوَاجِد', fr: 'Al-Wajid (Le Trouveur)' },
  { n: 66, ar: 'ٱلْمَاجِد', fr: 'Al-Majid (Le Noble)' },
  { n: 67, ar: 'ٱلْوَاحِد', fr: 'Al-Wahid (L’Unique)' },
  { n: 68, ar: 'ٱلْأَحَد', fr: 'Al-Ahad (L’Un)' },
  { n: 69, ar: 'ٱلصَّمَد', fr: 'As-Samad (L’Absolu)' },
  { n: 70, ar: 'ٱلْقَادِر', fr: 'Al-Qadir (Le Capable)' },
  { n: 71, ar: 'ٱلْمُقْتَدِر', fr: 'Al-Muqtadir (Le Tout-Puissant)' },
  { n: 72, ar: 'ٱلْمُقَدِّم', fr: 'Al-Muqaddim (Celui qui avance)' },
  { n: 73, ar: 'ٱلْمُؤَخِّر', fr: 'Al-Mu’akhkhir (Celui qui retarde)' },
  { n: 74, ar: 'ٱلْأَوَّل', fr: 'Al-Awwal (Le Premier)' },
  { n: 75, ar: 'ٱلْآخِر', fr: 'Al-Akhir (Le Dernier)' },
  { n: 76, ar: 'ٱلظَّاهِر', fr: 'Az-Zahir (L’Apparent)' },
  { n: 77, ar: 'ٱلْبَاطِن', fr: 'Al-Batin (Le Caché)' },
  { n: 78, ar: 'ٱلْوَالِي', fr: 'Al-Wali (Le Gouverneur)' },
  { n: 79, ar: 'ٱلْمُتَعَالِي', fr: 'Al-Muta‘ali (Le Très-Élevé)' },
  { n: 80, ar: 'ٱلْبَرّ', fr: 'Al-Barr (Le Bienfaisant)' },
  { n: 81, ar: 'ٱلتَّوَّاب', fr: 'At-Tawwab (Celui qui accepte le repentir)' },
  { n: 82, ar: 'ٱلْمُنْتَقِم', fr: 'Al-Muntaqim (Le Vengeur)' },
  { n: 83, ar: 'ٱلْعَفُوّ', fr: 'Al-‘Afuww (L’Indulgent)' },
  { n: 84, ar: 'ٱلرَّءُوف', fr: 'Ar-Ra’uf (Le Compatissant)' },
  { n: 85, ar: 'مَالِكُ ٱلْمُلْك', fr: 'Malik-ul-Mulk (Maître du Royaume)' },
  { n: 86, ar: 'ذُو ٱلْجَلَالِ وَٱلْإِكْرَام', fr: 'Dhu-l-Jalal wa-l-Ikram (Majesté et Générosité)' },
  { n: 87, ar: 'ٱلْمُقْسِط', fr: 'Al-Muqsit (L’Équitable)' },
  { n: 88, ar: 'ٱلْجَامِع', fr: 'Al-Jami‘ (Le Rassembleur)' },
  { n: 89, ar: 'ٱلْغَنِيّ', fr: 'Al-Ghaniyy (Le Riche)' },
  { n: 90, ar: 'ٱلْمُغْنِي', fr: 'Al-Mughni (Celui qui enrichit)' },
  { n: 91, ar: 'ٱلْمَانِع', fr: 'Al-Mani‘ (L’Empêcheur)' },
  { n: 92, ar: 'ٱلضَّارّ', fr: 'Ad-Darr (Celui qui peut nuire)' },
  { n: 93, ar: 'ٱلنَّافِع', fr: 'An-Nafi‘ (Celui qui profite)' },
  { n: 94, ar: 'ٱلنُّور', fr: 'An-Nur (La Lumière)' },
  { n: 95, ar: 'ٱلْهَادِي', fr: 'Al-Hadi (Le Guide)' },
  { n: 96, ar: 'ٱلْبَدِيع', fr: 'Al-Badi‘ (L’Incomparable)' },
  { n: 97, ar: 'ٱلْبَاقِي', fr: 'Al-Baqi (L’Éternel)' },
  { n: 98, ar: 'ٱلْوَارِث', fr: 'Al-Warith (L’Héritier)' },
  { n: 99, ar: 'ٱلرَّشِيد', fr: 'Ar-Rashid (Le Guide vers la droiture)' },
];

function renderNames99() {
  const list = el('names-list');
  const header = el('names-header');
  if (!list || !header) return;

  header.textContent = "Les 99 Noms d'Allah";
  list.innerHTML = '';

  NAMES_99.forEach((x) => {
    const li = document.createElement('li');
    li.innerHTML = `<span><strong>${x.n}.</strong> ${escapeHtml(x.fr)}</span><span style="font-weight:900">${escapeHtml(x.ar)}</span>`;
    list.appendChild(li);
  });
}

/* ---------- Footer ---------- */
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
    const url = buildOfficialUrlForMosque(m.id);
    const text = `🕌 ${m.name}\n${el('gregorian-date').textContent}\n\nFajr: ${el('fajr-time').textContent}\nDhuhr: ${el('dhuhr-time').textContent}\nAsr: ${el('asr-time').textContent}\nMaghrib: ${el('maghrib-time').textContent}\nIsha: ${el('isha-time').textContent}\n\nLien officiel:\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };
}

/* ---------- Admin helpers ---------- */
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

  el('adm-id').value = m.id;
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
  el('adm-adhan-url').value = m.adhanUrl || '';
  el('adm-quiet').value = m.quiet || '22:00-05:00';
  el('adm-allow-fajr').checked = !!m.allowFajr;

  el('adm-goal').value = getGoal(m);
  updateOfficialLinkInput();
}

function populateAdminMosqueSelect() {
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

  if (SESSION.role === 'admin') {
    sel.value = SESSION.mosqueId;
    sel.disabled = true;
  } else {
    sel.disabled = false;
  }

  sel.onchange = (e) => {
    setCurrentMosque(e.target.value);
    fillAdminForm(e.target.value);
    fetchTimings();
    showStatus('Mosquée changée.', '#1f5e53');
  };
}

function buildOfficialUrlForMosque(mosqueId) {
  const origin = window.location.origin;
  const path = window.location.pathname;
  return `${origin}${path}?m=${encodeURIComponent(mosqueId)}`;
}

function updateOfficialLinkInput() {
  const cur = getCurrentMosque().id;
  const url = buildOfficialUrlForMosque(cur);
  const input = el('official-url');
  if (input) input.value = url;
}

/* ---------- SUPER: Gestion admins (minimaliste) ---------- */
function getAdminForMosque(mosqueId) {
  const users = loadAdminUsers();
  return users.find((u) => u.role === 'admin' && u.mosqueId === mosqueId) || null;
}

function upsertAdminForMosque(mosqueId, phone, pin) {
  const users = loadAdminUsers();
  const p = normalizePhone(phone);
  const n = String(pin || '').trim();

  let admin = users.find((u) => u.role === 'admin' && u.mosqueId === mosqueId);
  if (!admin) {
    admin = { phone: p, pin: n || '1234', role: 'admin', mosqueId };
    users.push(admin);
  } else {
    admin.phone = p;
    admin.pin = n || admin.pin || '1234';
  }

  saveAdminUsers(users);
}

function resetAdminPin(mosqueId) {
  const admin = getAdminForMosque(mosqueId);
  const phone = admin ? admin.phone : '';
  upsertAdminForMosque(mosqueId, phone, '1234');
}

function renderAdminManagement() {
  const block = el('admin-mgmt-block');
  const list = el('admin-mgmt-list');
  if (!block || !list) return;

  if (SESSION.role !== 'super') {
    block.style.display = 'none';
    return;
  }

  block.style.display = 'block';
  list.innerHTML = '';

  const mosques = loadMosques();

  mosques.forEach((m) => {
    const admin = getAdminForMosque(m.id);
    const phoneVal = admin?.phone || '';
    const pinVal = admin?.pin || '1234';

    const card = document.createElement('div');
    card.style.borderRadius = '14px';
    card.style.background = '#f8fffd';
    card.style.border = '1px dashed #bfe4db';
    card.style.padding = '12px';

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div style="font-weight:900;color:#1f5e53">🕌 ${escapeHtml(m.name)} <span class="small">(${escapeHtml(m.id)})</span></div>
        <div class="small">Lien: <strong>${escapeHtml(buildOfficialUrlForMosque(m.id))}</strong></div>
      </div>

      <div style="margin-top:10px; display:grid; gap:8px">
        <div style="background:#fff;border-radius:12px;padding:10px;box-shadow:inset 0 0 0 1px #e5e7eb">
          <div class="small" style="margin-bottom:6px">Admin principal</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div>
              <label style="margin-top:0">Téléphone</label>
              <input data-admin-phone="${escapeHtml(m.id)}" inputmode="tel" placeholder="+22177xxxxxxx" value="${escapeHtml(phoneVal)}"/>
            </div>
            <div>
              <label style="margin-top:0">PIN</label>
              <input data-admin-pin="${escapeHtml(m.id)}" inputmode="numeric" placeholder="1234" value="${escapeHtml(pinVal)}"/>
            </div>
          </div>

          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
            <button class="btn btn-primary" data-admin-save="${escapeHtml(m.id)}" style="min-width:auto">
              <i class="fa-solid fa-floppy-disk"></i> Sauver
            </button>
            <button class="btn btn-ghost" data-admin-reset="${escapeHtml(m.id)}" style="min-width:auto">
              <i class="fa-solid fa-rotate-left"></i> Reset PIN (1234)
            </button>
          </div>
        </div>
      </div>
    `;

    list.appendChild(card);
  });

  list.querySelectorAll('button[data-admin-save]').forEach((b) => {
    b.onclick = () => {
      const mosqueId = b.dataset.adminSave;
      const phone = list.querySelector(`input[data-admin-phone="${CSS.escape(mosqueId)}"]`)?.value || '';
      const pin = list.querySelector(`input[data-admin-pin="${CSS.escape(mosqueId)}"]`)?.value || '';
      upsertAdminForMosque(mosqueId, phone, pin);
      showStatus('Admin sauvegardé.', '#1f5e53');
    };
  });

  list.querySelectorAll('button[data-admin-reset]').forEach((b) => {
    b.onclick = () => {
      const mosqueId = b.dataset.adminReset;
      resetAdminPin(mosqueId);
      renderAdminManagement();
      showStatus('PIN réinitialisé à 1234.', '#ca8a04');
    };
  });
}

/* ---------- Add/Delete mosque (super) ---------- */
function createMosqueFromNameFlow() {
  const name = prompt('Nom de la nouvelle mosquée :');
  if (!name || !name.trim()) return null;

  const id = uniqueMosqueIdFromName(name.trim());
  const city = prompt('Ville (ex: Medina, Dakar, Pikine...) :', 'Medina') || 'Medina';

  const adminPhone = prompt('Téléphone admin (WhatsApp) :', '+221') || '';
  const adminPin = prompt('PIN admin (4 chiffres) :', '1234') || '1234';

  const mosque = {
    id,
    name: name.trim(),
    city: Object.keys(CITY_COORDS).includes(city) ? city : 'Medina',
    wave: '',
    orange: '',
    contact: '',
    phone: normalizePhone(adminPhone) || '',
    jumua: '13:30',
    ann: '',
    events: [],
    method: 3,
    school: 0,
    offsets: [0, 0, 0, 0, 0, 0],
    adhanUrl: '',
    quiet: '22:00-05:00',
    allowFajr: true,
  };

  return { mosque, adminPhone, adminPin };
}

/* ---------- Admin auth & panel ---------- */
function setupAdminAuthAndPanel() {
  const adminBtn = el('admin-button');
  const loginBox = el('admin-login');
  const panelBox = el('admin-panel');
  const loginHint = el('login-hint');

  const loginPhone = el('login-phone');
  const loginPin = el('login-pin');
  const loginSubmit = el('login-submit');
  const logoutBtn = el('logout');

  const roleHint = el('role-hint');
  const superActions = el('super-actions');
  const advancedBlock = el('advanced-block');

  const addMosqueBtn = el('add-mosque');
  const delMosqueBtn = el('del-mosque');

  function showLogin() {
    loginBox.style.display = 'block';
    panelBox.style.display = 'none';
    loginHint.textContent = '';
    loginPhone.value = '';
    loginPin.value = '';
  }

  function showPanel() {
    loginBox.style.display = 'none';
    panelBox.style.display = 'block';

    const isSuper = SESSION.role === 'super';
    roleHint.textContent = isSuper ? 'SUPER ADMIN' : `ADMIN (${SESSION.adminPhone})`;

    superActions.style.display = isSuper ? 'flex' : 'none';
    advancedBlock.style.display = isSuper ? 'block' : 'none';

    el('don-admin').style.display = 'block';

    populateCitySelect(el('adm-city'));

    if (SESSION.role === 'admin' && SESSION.mosqueId) setCurrentMosque(SESSION.mosqueId);

    populateAdminMosqueSelect();
    fillAdminForm(getCurrentMosque().id);
    renderDonation();
    renderDonTable();
    renderDonWeekStats();

    renderAdminManagement();
  }

  adminBtn.onclick = () => {
    openModal('modal-admin');
    showLogin();
  };

  loginSubmit.onclick = () => {
    const phone = normalizePhone(loginPhone.value);
    const pin = String(loginPin.value || '').trim();

    const user = authenticate(phone, pin);
    if (!user) {
      loginHint.textContent = 'Téléphone ou PIN incorrect.';
      loginHint.style.color = '#b91c1c';
      return;
    }

    setSession(user);

    if (SESSION.role === 'admin' && SESSION.mosqueId) setCurrentMosque(SESSION.mosqueId);

    showPanel();
    closeAll();
    fetchTimings();
    showStatus('Connecté.', '#1f5e53');
  };

  logoutBtn.onclick = () => {
    clearSession();
    showLogin();
    closeAll();
    showStatus('Déconnecté.', '#ca8a04');
  };

  el('copy-url').onclick = async () => {
    try {
      await navigator.clipboard.writeText(el('official-url').value);
      showStatus('Lien copié.');
    } catch {
      el('official-url').select();
      document.execCommand('copy');
      showStatus('Lien copié.');
    }
  };

  addMosqueBtn.onclick = () => {
    if (SESSION.role !== 'super') return showStatus('Réservé SUPER ADMIN.', '#b91c1c');

    const res = createMosqueFromNameFlow();
    if (!res) return;

    const { mosque, adminPhone, adminPin } = res;

    const arr = loadMosques();
    arr.push(mosque);
    saveMosques(arr);

    upsertAdminForMosque(mosque.id, adminPhone, adminPin);

    setCurrentMosque(mosque.id);
    populateAdminMosqueSelect();
    fillAdminForm(mosque.id);
    fetchTimings();
    renderAdminManagement();
    showStatus(`Mosquée ajoutée: ${mosque.name}`);
  };

  delMosqueBtn.onclick = () => {
    if (SESSION.role !== 'super') return showStatus('Réservé SUPER ADMIN.', '#b91c1c');

    const cur = getCurrentMosque();
    const ok = confirm(`Supprimer la mosquée "${cur.name}" ? (ID: ${cur.id})`);
    if (!ok) return;

    let arr = loadMosques();
    arr = arr.filter((m) => m.id !== cur.id);

    if (!arr.length) {
      alert('Impossible: il faut au moins 1 mosquée.');
      return;
    }

    saveMosques(arr);

    const users = loadAdminUsers();
    saveAdminUsers(users.filter((u) => !(u.role === 'admin' && u.mosqueId === cur.id)));

    setCurrentMosque(arr[0].id);
    populateAdminMosqueSelect();
    fillAdminForm(arr[0].id);
    fetchTimings();
    renderAdminManagement();
    showStatus('Mosquée supprimée.', '#ca8a04');
  };

  el('save').onclick = () => {
    const arr = loadMosques();
    const cur = getCurrentMosque();

    if (SESSION.role === 'admin' && SESSION.mosqueId && cur.id !== SESSION.mosqueId) {
      showStatus('Action refusée (mosquée verrouillée).', '#b91c1c');
      setCurrentMosque(SESSION.mosqueId);
      populateAdminMosqueSelect();
      fillAdminForm(SESSION.mosqueId);
      return;
    }

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
      phone: normalizePhone(el('adm-phone').value.trim()),
      jumua: el('adm-jumua').value || '13:30',
      ann: el('adm-ann').value,
      events: el('adm-events').value.split('\n').filter((l) => l.trim() !== '').map((l) => {
        const [t, ...r] = l.split('|');
        return { title: (t || '').trim(), date: (r.join('|') || '').trim() };
      }),
      method: parseInt(el('adm-method').value, 10),
      school: parseInt(el('adm-school').value, 10),
      offsets,
      adhanUrl: el('adm-adhan-url').value.trim(),
      quiet: el('adm-quiet').value.trim() || '22:00-05:00',
      allowFajr: el('adm-allow-fajr').checked,
    };

    saveMosques(arr);
    setGoal(getCurrentMosque(), el('adm-goal').value);

    closeAll();
    fetchTimings();
    showStatus('Enregistré.');
  };
}

/* ---------- Quick amounts ---------- */
function setupQuickAmounts() {
  document.querySelectorAll('.chip[data-amt]').forEach((b) => {
    b.onclick = () => {
      const amt = parseInt(b.dataset.amt, 10) || 0;
      const input = el('don-amt');
      const cur = parseInt(input.value || '0', 10) || 0;
      input.value = String(cur + amt);
      input.focus();
    };
  });
}

/* ---------- Display all ---------- */
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
  renderDonation();
  renderDonTable();
  renderDonWeekStats();
  renderEvents();
  renderRamadan();
  setupQiblaMaps();

  const idEl = el('adm-id');
  if (idEl) idEl.value = m.id;

  const off = el('official-url');
  if (off) off.value = buildOfficialUrlForMosque(m.id);
}

/* ---------- Init ---------- */
function setupDonAdminAdd() {
  el('don-add').onclick = () => {
    const amt = parseInt(el('don-amt').value, 10) || 0;
    if (amt <= 0) return alert('Montant invalide');

    addDonationEntry({
      amount: amt,
      method: el('don-method').value,
      category: el('don-category').value,
      ref: el('don-ref').value,
    });

    el('don-amt').value = '';
    el('don-ref').value = '';
  };
}

function setup() {
  applyMosqueFromUrl();
  loadMosques();
  loadAdminUsers();

  bindModals();
  setupFooter();
  setupDonButtons();
  setupQuickAmounts();
  setupTasbih();
  setupDonAdminAdd();
  setupAdminAuthAndPanel();

  updateClock();
  setInterval(updateClock, 1000);

  fetchTimings();
  setInterval(updateNextCountdown, 1000);
}

document.addEventListener('DOMContentLoaded', setup);
