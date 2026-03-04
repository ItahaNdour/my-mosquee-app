/* ======================
   ACCÈS / RÔLES
========================= */
const ADMIN_PASSWORD = '1234';
const SUPER_ADMIN_PASSWORD = '9999';
let SESSION_ROLE = 'guest'; // guest | admin | super

/* =========================
   TEXTES
========================= */
const PRAYER_NAMES = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const DISPLAY = {
  Fajr: { local: 'Souba', ar: 'Fajr' },
  Dhuhr: { local: 'Tisbar', ar: 'Dhuhr' },
  Asr: { local: 'Takusan', ar: 'Asr' },
  Maghrib: { local: 'Timis', ar: 'Maghrib' },
  Isha: { local: 'Guéwé', ar: 'Isha' },
};

const WEEKDAYS = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

const DON_CATEGORIES = ['Zakat', 'Sadaqa', 'Travaux'];
const DON_CATEGORY_HELP = {
  Zakat: 'Zakat : obligation (selon conditions).',
  Sadaqa: 'Sadaqa : don libre, pour l’entraide.',
  Travaux: 'Travaux : entretien, rénovation, équipement.',
};

const DEFAULT_MOSQUES = [
  { id:'bene-tally', name:'Bene Tally', city:'Medina', wave:'772682103', orange:'772682103', contact:'Imam Diallo', phone:'+221772682103', jumua:'13:30', ann:'Bienvenue à Bene Tally.', events:[{title:'Cours de Fiqh',date:'Mardi après Isha'}] },
  { id:'medina-centre', name:'Medina Centre', city:'Dakar', wave:'770000000', orange:'780000000', contact:'Imam Ndiaye', phone:'+221780000000', jumua:'14:00', ann:'Annonce importante pour la Medina.', events:[{title:'Cercle de Coran',date:'Samedi après Fajr'}] },
];

// Sénégal: fallback coords par ville (quand pas de GPS)
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

// Ramadan (affichage)
const RAMADAN_START_DATE = '2026-02-18';
const RAMADAN_TOTAL_DAYS = 30;

const el = (id) => document.getElementById(id);

/* =========================
   STATE
========================= */
let timingsData = null;     // {Fajr, Dhuhr, ...}
let lastAlertShown = '';
let playedFor = '';

/* =========================
   UTILS
========================= */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function fmt(ms) {
  if (ms < 0) return '00:00:00';
  const t = Math.floor(ms / 1000);
  const h = Math.floor(t / 3600) % 24;
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}
function parseHM(s) {
  const [h, m] = String(s || '').split(':').map((x) => parseInt(x, 10));
  return { h: Number.isFinite(h) ? h : 0, m: Number.isFinite(m) ? m : 0 };
}
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}
function ymKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function isoDayKey(d) {
  const x = new Date(d);
  x.setHours(0,0,0,0);
  return x.toISOString().slice(0,10);
}
function keyDay() { return new Date().toISOString().slice(0,10); }

function showPopup(msg) {
  const wrap = el('popup');
  const text = el('popup-text');
  const ok = el('popup-ok');
  if (!wrap || !text || !ok) return;

  text.textContent = msg;
  wrap.style.display = 'flex';

  const close = () => { wrap.style.display = 'none'; };
  ok.onclick = close;

  // auto close 10s
  setTimeout(close, 10000);
}

/* =========================
   THEME (dark)
========================= */
function loadTheme() {
  const t = localStorage.getItem('theme') || 'light';
  document.body.classList.toggle('dark', t === 'dark');
}
function toggleTheme() {
  const isDark = document.body.classList.toggle('dark');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

/* =========================
   MOSQUÉES (local)
========================= */
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
  sel.onchange = (e) => { setCurrentMosque(e.target.value); fetchTimings(); renderAllStatic(); };
}

/* =========================
   CLOCK / DATES
========================= */
function updateClock() {
  const n = new Date();
  el('current-time').textContent = [n.getHours(), n.getMinutes(), n.getSeconds()].map((v)=>String(v).padStart(2,'0')).join(':');
  el('gregorian-date').textContent = `${WEEKDAYS[n.getDay()]} ${n.getDate()} ${MONTHS[n.getMonth()]} ${n.getFullYear()}`;
}

/* =========================
   GEO + API (Aladhan)
   - GPS si autorisé (France / Sénégal)
   - Sinon fallback ville mosquée (Sénégal)
   - Cache offline par jour + position arrondie
========================= */
function roundCoord(x) { return Math.round(Number(x)*100)/100; } // 0.01 ~ 1km
function getFallbackCoords() {
  const m = getCurrentMosque();
  return CITY_COORDS[m.city] || CITY_COORDS.Medina;
}

function getGeoCoords() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy:true, timeout:8000, maximumAge:300000 }
    );
  });
}

// Méthode Sénégal / MWL par défaut
function buildApiUrl(lat, lon) {
  const method = 3; // MWL
  const school = 0; // Maliki/Shafi
  return `https://api.aladhan.com/v1/timings?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&method=${method}&school=${school}`;
}

async function fetchTimings() {
  const m = getCurrentMosque();
  const gps = await getGeoCoords();
  const base = gps || getFallbackCoords();

  const latKey = roundCoord(base.lat);
  const lonKey = roundCoord(base.lon);
  const cacheKey = `timings_${latKey}_${lonKey}_${new Date().toDateString()}`;

  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const data = JSON.parse(cached);
      displayAll(data);
    } catch {}
  }

  try {
    const url = buildApiUrl(base.lat, base.lon);
    const r = await fetch(url);
    const j = await r.json();
    if (j && j.data) {
      localStorage.setItem(cacheKey, JSON.stringify(j.data));
      displayAll(j.data);
    } else {
      throw new Error('bad data');
    }
  } catch {
    // si pas de cache, on affiche placeholders mais on garde app vivante
    if (!cached) {
      displayAll({ timings: { Fajr:'--:--', Dhuhr:'--:--', Asr:'--:--', Maghrib:'--:--', Isha:'--:--', Sunrise:'--:--', Imsak:'--:--' }, date: null });
    }
  }
}

/* =========================
   RAMADAN
========================= */
function formatFastingDurationShort(fajr, maghrib) {
  if (!fajr || !maghrib || fajr==='--:--' || maghrib==='--:--') return '—';
  const f = parseHM(fajr);
  const m = parseHM(maghrib);
  const start = f.h*60 + f.m;
  const end = m.h*60 + m.m;
  let dur = end - start;
  if (dur < 0) dur += 24*60;
  const hh = Math.floor(dur/60);
  const mm = dur%60;
  return `${hh}h ${String(mm).padStart(2,'0')}m`;
}

function renderRamadan(dataTimings) {
  const card = el('ramadan-card');
  if (!card) return;

  const start = new Date(`${RAMADAN_START_DATE}T00:00:00`);
  const now = new Date();
  const msDay = 24*60*60*1000;
  const dayIndex = Math.floor((now - start)/msDay) + 1;

  if (dayIndex < 1 || dayIndex > RAMADAN_TOTAL_DAYS) {
    card.style.display = 'none';
    return;
  }

  const left = RAMADAN_TOTAL_DAYS - dayIndex;

  el('ramadan-sub').textContent = `${dayIndex} Ramadan • ${WEEKDAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}`;
  el('ramadan-day').textContent = `Jour ${dayIndex}/${RAMADAN_TOTAL_DAYS}`;
  el('ramadan-left').textContent = left === 0 ? 'Dernier jour' : `${left} j restants`;

  const iftar = (dataTimings && dataTimings.Maghrib) ? dataTimings.Maghrib : '--:--';
  const suhoor = (dataTimings && dataTimings.Fajr) ? dataTimings.Fajr : '--:--';
  const shuruq = (dataTimings && dataTimings.Sunrise) ? dataTimings.Sunrise : '--:--';
  const imsak = (dataTimings && dataTimings.Imsak) ? dataTimings.Imsak : '--:--';

  el('ramadan-iftar').textContent = iftar;
  el('ramadan-suhoor').textContent = suhoor;
  el('ramadan-shuruq').textContent = shuruq;
  el('ramadan-imsak').textContent = imsak;

  const durEl = el('ramadan-duration');
  if (durEl) durEl.textContent = `Durée du jeûne: ${formatFastingDurationShort(suhoor, iftar)}`;

  card.style.display = 'block';
}

/* =========================
   NEXT PRAYER
========================= */
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
    if (parts.length >= 2 && parts[0] !== '--') {
      const d = new Date();
      d.setHours(Number(parts[0]), Number(parts[1]), 0, 0);
      p[k] = d;
    }
  });

  // Jumua remplace Dhuhr le vendredi (heure mosquée)
  const m = getCurrentMosque();
  if (now.getDay() === 5 && m.jumua && p.Dhuhr) {
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
}

/* =========================
   EVENTS
========================= */
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

/* =========================
   DONATIONS (local, par mosquée)
   - Fidèle: crée une demande "pending"
   - Admin: valide (ok) -> total mois public augmente
   - Badge rouge = nb pending
========================= */
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

function kGoalMonth(m) { return `don_goal_month_${m.id}`; }
function getGoalMonth(m) {
  const v = localStorage.getItem(kGoalMonth(m));
  return v ? parseInt(v,10) : 500000;
}
function setGoalMonth(m, val) {
  localStorage.setItem(kGoalMonth(m), String(Math.max(0, parseInt(val,10) || 0)));
}

function kMonthSum(m) { return `don_month_sum_${m.id}_${ymKey()}`; }
function monthSum(m) { return parseInt(localStorage.getItem(kMonthSum(m)) || '0', 10); }
function setMonthSum(m, v) { localStorage.setItem(kMonthSum(m), String(Math.max(0, parseInt(v,10) || 0))); }

function kReqList(m) { return `don_requests_${m.id}`; } // demandes (toutes dates)
function loadReqList(m) { return JSON.parse(localStorage.getItem(kReqList(m)) || '[]'); }
function saveReqList(m, list) { localStorage.setItem(kReqList(m), JSON.stringify(list)); }

function shortDateFR(iso) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

function pendingCount(m) {
  return loadReqList(m).filter((x)=>x.status==='pending').length;
}
function updateAdminBadge() {
  const m = getCurrentMosque();
  const n = pendingCount(m);
  const badge = el('admin-badge');
  if (!badge) return;
  badge.textContent = String(n);
  badge.style.display = n > 0 ? 'inline-block' : 'none';
}

function renderPublicDonation() {
  const m = getCurrentMosque();
  const goal = getGoalMonth(m);
  const month = monthSum(m);

  el('don-public-goal').textContent = goal.toLocaleString('fr-FR');
  el('don-public-month').textContent = month.toLocaleString('fr-FR');

  const p = goal ? Math.min(100, Math.round((month * 100) / goal)) : 0;
  el('don-public-bar').style.width = `${p}%`;
}

function openModal(id) { el(id).style.display = 'block'; }
function closeAll() { document.querySelectorAll('.modal').forEach((m) => { m.style.display = 'none'; }); }

function renderAdminDonTable() {
  const tb = document.querySelector('#don-table tbody');
  if (!tb) return;

  const m = getCurrentMosque();
  const list = loadReqList(m);

  tb.innerHTML = '';

  list.slice(0, 200).forEach((r) => {
    const tr = document.createElement('tr');

    const st = r.status === 'ok'
      ? '<span class="badge b-ok">Confirmé</span>'
      : (r.status === 'no'
        ? '<span class="badge b-no">Refusé</span>'
        : '<span class="badge b-p">En attente</span>');

    const actions = (r.status === 'pending')
      ? `<button data-act="ok" data-id="${r.id}" class="btn btn-primary" style="padding:6px 10px; min-width:auto">OK</button>
         <button data-act="no" data-id="${r.id}" class="btn" style="padding:6px 10px; min-width:auto; background:#ef4444; color:#fff">X</button>`
      : `<button data-act="del" data-id="${r.id}" class="btn btn-ghost" style="padding:6px 10px; min-width:auto">Suppr.</button>`;

    tr.innerHTML = `
      <td>${shortDateFR(r.ts)}</td>
      <td><strong>${Number(r.amount||0).toLocaleString('fr-FR')}</strong></td>
      <td><strong>${escapeHtml(normalizeCategory(r.category))}</strong></td>
      <td>${escapeHtml(r.ref || '')}</td>
      <td>${st}</td>
      <td style="white-space:nowrap">${actions}</td>
    `;
    tb.appendChild(tr);
  });

  tb.querySelectorAll('button[data-act]').forEach((b) => {
    b.onclick = () => setReqStatus(b.dataset.id, b.dataset.act);
  });
}

function addDonationRequest({ amount, category, ref }) {
  const m = getCurrentMosque();
  const list = loadReqList(m);
  const id = Date.now().toString(36) + Math.random().toString(16).slice(2);

  list.unshift({
    id,
    ts: new Date().toISOString(),
    amount: Number(amount) || 0,
    category: normalizeCategory(category),
    ref: String(ref || '').trim(),
    status: 'pending',
  });

  saveReqList(m, list);
  updateAdminBadge();

  // Message fidèle (ne compte pas)
  showPopup(`BarakAllahu fik ✅\nTon don de ${Number(amount).toLocaleString('fr-FR')} CFA est en attente de confirmation.`);
}

function setReqStatus(id, act) {
  const m = getCurrentMosque();
  const list = loadReqList(m);
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return;

  const prev = list[i].status;

  if (act === 'ok') list[i].status = 'ok';
  if (act === 'no') list[i].status = 'no';
  if (act === 'del') {
    list.splice(i, 1);
    saveReqList(m, list);
    renderAdminDonTable();
    updateAdminBadge();
    return;
  }

  // Comptabiliser uniquement quand on passe en ok (et une seule fois)
  if (prev !== 'ok' && list[i].status === 'ok') {
    setMonthSum(m, monthSum(m) + (Number(list[i].amount) || 0));
  }
  // si on annule un ok
  if (prev === 'ok' && list[i].status !== 'ok') {
    setMonthSum(m, Math.max(0, monthSum(m) - (Number(list[i].amount) || 0)));
  }

  saveReqList(m, list);
  renderPublicDonation();
  renderAdminDonTable();
  updateAdminBadge();
}

/* WhatsApp (Wave / Orange) */
function openWhatsApp(to, msg) {
  if (!to) return;
  const num = String(to).replace(/\s+/g,'').replace('+','');
  window.open(`https://wa.me/${encodeURIComponent(num)}?text=${encodeURIComponent(msg)}`, '_blank');
}
function setupDonButtons() {
  const catSel = el('don-public-category');
  if (catSel) catSel.onchange = updatePublicCategoryHelp;

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

  // Ouvre mini-form (fidèle)
  el('btn-claimed').onclick = () => {
    const m = getCurrentMosque();
    el('don-f-cat').value = getPublicCategory();
    openModal('modal-don');
  };

  el('don-f-send').onclick = () => {
    const amt = parseInt(el('don-f-amt').value, 10) || 0;
    if (amt <= 0) return alert('Montant invalide');

    addDonationRequest({
      amount: amt,
      category: el('don-f-cat').value,
      ref: el('don-f-ref').value,
    });

    el('don-f-amt').value = '';
    el('don-f-ref').value = '';
    closeAll();
  };
}

/* =========================
   TASBIH
========================= */
function setupTasbih() {
  const k = 'tasbih_count';
  const countEl = el('tasbih-count');
  const plus = el('tasbih-plus');
  const reset = el('tasbih-reset');
  if (!countEl || !plus || !reset) return;

  const get = () => parseInt(localStorage.getItem(k) || '0', 10) || 0;
  const set = (v) => {
    localStorage.setItem(k, String(v));
    countEl.textContent = String(v);
  };

  set(get());
  plus.onclick = () => { set(get() + 1); if (navigator.vibrate) navigator.vibrate(15); };
  reset.onclick = () => set(0);
}

/* =========================
   MODALS + FOOTER
========================= */
function bindModals() {
  document.querySelectorAll('.modal .close').forEach((x) => {
    x.addEventListener('click', closeAll);
  });
  document.querySelectorAll('[data-close="don"]').forEach((x) => x.addEventListener('click', closeAll));
  document.querySelectorAll('[data-close="admin"]').forEach((x) => x.addEventListener('click', closeAll));

  window.addEventListener('click', (e) => {
    if (e.target && e.target.classList && e.target.classList.contains('modal')) closeAll();
  });
}

/* 99 Noms (inchangé) */
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
    li.innerHTML = `<span><strong>${idx+1}.</strong> ${escapeHtml(n.fr)}</span><span style="font-weight:900">${escapeHtml(n.ar)}</span>`;
    list.appendChild(li);
  });
}

function setupFooter() {
  el('events-btn').onclick = () => { renderEvents(); openModal('modal-events'); };

  el('announce-btn').onclick = () => {
    openModal('modal-ann');
    const m = getCurrentMosque();
    localStorage.setItem(`annSeen_${m.id}_${todayKey()}`, '1');
    el('notif').style.display = 'none';
  };

  el('about-btn').onclick = () => openModal('modal-about');

  el('names-btn').onclick = () => { renderNames99(); openModal('modal-names'); };

  el('share-btn').onclick = () => {
    const m = getCurrentMosque();
    const text = `🕌 ${m.name}\n${el('gregorian-date').textContent}\n\nFajr: ${el('fajr-time').textContent}\nDhuhr: ${el('dhuhr-time').textContent}\nAsr: ${el('asr-time').textContent}\nMaghrib: ${el('maghrib-time').textContent}\nIsha: ${el('isha-time').textContent}\n\n${location.href}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };
}

/* =========================
   ADMIN
========================= */
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
  el('adm-events').value = (m.events || []).map((e)=>`${e.title} | ${e.date}`).join('\n');
  el('adm-goal-month').value = getGoalMonth(m);

  // table dons
  renderAdminDonTable();
  updateAdminBadge();
}

function setupAdmin() {
  el('admin-button').onclick = () => {
    const pw = prompt('Code d’accès :');
    if (pw === SUPER_ADMIN_PASSWORD) SESSION_ROLE = 'super';
    else if (pw === ADMIN_PASSWORD) SESSION_ROLE = 'admin';
    else return alert('Code incorrect.');

    const isSuper = SESSION_ROLE === 'super';
    el('super-row').style.display = isSuper ? 'flex' : 'none';
    el('role-hint').textContent = isSuper ? 'Mode SUPER ADMIN' : 'Mode ADMIN';

    // SUPER: montre select mosquée
    el('mosque-select-row').style.display = isSuper ? 'flex' : 'none';

    // super admin: selector et gestion mosquées
    if (isSuper) {
      populateMosqueSelector();
    }

    // remplit city list
    populateCitySelect(el('adm-city'));

    // super row - select mosquée
    const admMosque = el('adm-mosque');
    if (admMosque) {
      admMosque.innerHTML = '';
      loadMosques().forEach((mo) => {
        const o = document.createElement('option');
        o.value = mo.id;
        o.textContent = mo.name;
        admMosque.appendChild(o);
      });
      admMosque.value = getCurrentMosque().id;
      admMosque.onchange = (e) => {
        setCurrentMosque(e.target.value);
        fillAdminForm(getCurrentMosque().id);
        renderAllStatic();
        fetchTimings();
      };
    }

    fillAdminForm(getCurrentMosque().id);
    openModal('modal-admin');
  };

  // Ajouter / Supprimer mosquée (super)
  el('add-mosque').onclick = () => {
    if (SESSION_ROLE !== 'super') return;

    const name = String(el('adm-new-name').value || '').trim();
    if (!name) return alert('Nom manquant');

    const id = name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') + '-' + Date.now().toString(36);
    const arr = loadMosques();
    arr.push({
      id, name,
      city:'Medina',
      wave:'', orange:'',
      contact:'', phone:'',
      jumua:'13:30',
      ann:'',
      events:[]
    });
    saveMosques(arr);
    el('adm-new-name').value = '';
    populateMosqueSelector();
    fillAdminForm(getCurrentMosque().id);
    alert('Mosquée ajoutée.');
  };

  el('del-mosque').onclick = () => {
    if (SESSION_ROLE !== 'super') return;

    const arr = loadMosques();
    if (arr.length <= 1) return alert('Impossible de supprimer la dernière mosquée.');

    const cur = getCurrentMosque();
    const idx = arr.findIndex((x)=>x.id===cur.id);
    if (idx < 0) return;

    if (!confirm(`Supprimer "${cur.name}" ?`)) return;
    arr.splice(idx,1);
    saveMosques(arr);
    setCurrentMosque(arr[0].id);
    populateMosqueSelector();
    fillAdminForm(getCurrentMosque().id);
    renderAllStatic();
    fetchTimings();
  };

  el('save').onclick = () => {
    const arr = loadMosques();
    const cur = getCurrentMosque();
    const idx = arr.findIndex((x) => x.id === cur.id);
    if (idx < 0) return;

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
      events: el('adm-events').value.split('\n').filter((l)=>l.trim()!=='').map((l) => {
        const [t, ...r] = l.split('|');
        return { title:(t||'').trim(), date:(r.join('|')||'').trim() };
      }),
    };

    saveMosques(arr);
    setGoalMonth(getCurrentMosque(), el('adm-goal-month').value);

    closeAll();
    renderAllStatic();
    fetchTimings();
    renderPublicDonation();
    updateAdminBadge();
  };
}

/* =========================
   RENDER STATIC (infos mosquée)
========================= */
function renderAllStatic() {
  const m = getCurrentMosque();

  el('mosque-name').textContent = m.name;
  el('wave-number').textContent = m.wave || '—';
  el('orange-number').textContent = m.orange || '—';
  el('cash-info').textContent = m.name || 'Mosquée';

  el('about-contact-name').textContent = m.contact || '—';
  el('about-contact-phone').textContent = m.phone || '—';

  el('jumua-time').textContent = m.jumua || '13:30';

  const ann = String(m.ann || '').trim();
  el('announcement-text').textContent = ann || 'Aucune annonce.';
  const seenKey = `annSeen_${m.id}_${todayKey()}`;
  el('notif').style.display = (ann && !localStorage.getItem(seenKey)) ? 'inline-block' : 'none';

  updatePublicCategoryHelp();
  renderPublicDonation();
  updateAdminBadge();
}

/* =========================
   DISPLAY ALL (API)
========================= */
function displayAll(data) {
  timingsData = (data && data.timings) ? data.timings : null;

  // hijri
  if (data && data.date && data.date.hijri) {
    el('hijri-date').textContent = `${data.date.hijri.day} ${data.date.hijri.month.ar} ${data.date.hijri.year} AH`;
  } else {
    el('hijri-date').textContent = 'Date hégirienne indisponible';
  }

  // prays
  if (timingsData) {
    PRAYER_NAMES.forEach((k) => {
      el(`${k.toLowerCase()}-name`).textContent = `${DISPLAY[k].local} (${DISPLAY[k].ar})`;
      el(`${k.toLowerCase()}-time`).textContent = timingsData[k] || '--:--';
    });
    el('shuruq-time').textContent = timingsData.Sunrise || '--:--';
  }

  renderRamadan(timingsData);
  updateNextCountdown();
}

/* =========================
   SETUP
========================= */
function setup() {
  loadTheme();
  bindModals();
  setupFooter();
  setupDonButtons();
  setupAdmin();
  setupTasbih();

  // theme toggle
  el('theme-toggle').onclick = toggleTheme;

  updateClock();
  setInterval(updateClock, 1000);

  renderAllStatic();

  // IMPORTANT: public ne voit pas le selector
  el('mosque-select-row').style.display = 'none';

  fetchTimings();
  setInterval(updateNextCountdown, 1000);
}

document.addEventListener('DOMContentLoaded', setup);

