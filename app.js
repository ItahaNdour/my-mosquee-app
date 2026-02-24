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

// ⚠️ Tu m’as dit : Ramadan a commencé le 18 février
// Mets l’année correcte ici si besoin (ex: 2026-02-18).
const RAMADAN_START_DATE = '2026-02-18';
const RAMADAN_TOTAL_DAYS = 30;

const KAABA = { lat: 21.4225, lon: 39.8262 };

const el = (id) => document.getElementById(id);

let timingsData = null;
let lastAlertShown = '';
let playedFor = '';

let qiblaBearingDeg = null;
let currentHeadingDeg = null;
let qiblaWatchActive = false;

function showStatus(msg, bg) {
  const node = el('status');
  if (!node) return;
  node.textContent = msg;
  node.style.background = bg || '#2f7d6d';
  node.style.display = 'block';
  setTimeout(() => { node.style.display = 'none'; }, 3000);
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

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function ymKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function keyDay() { return new Date().toISOString().slice(0, 10); }

function updateClock() {
  const n = new Date();
  el('current-time').textContent = [n.getHours(), n.getMinutes(), n.getSeconds()].map((v) => String(v).padStart(2, '0')).join(':');
  el('gregorian-date').textContent = `${WEEKDAYS[n.getDay()]} ${n.getDate()} ${MONTHS[n.getMonth()]} ${n.getFullYear()}`;
}

function populateMosqueSelector() {
  const arr = loadMosques();
  const sel = el('mosque-selector');
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
    item.innerHTML = `<div style="font-weight:800;color:#1f5e53">${escapeHtml(ev.title || '')}</div>
                      <div class="small">${escapeHtml(ev.date || '')}</div>`;
    wrap.appendChild(item);
  });

  box.innerHTML = '';
  box.appendChild(wrap);
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

  el('ramadan-sub').textContent = `Début: ${RAMADAN_START_DATE} • Aujourd’hui: ${now.toISOString().slice(0, 10)}`;
  el('ramadan-day').textContent = `Jour ${dayIndex}/${RAMADAN_TOTAL_DAYS}`;
  el('ramadan-left').textContent = left === 0 ? 'Dernier jour' : `${left} jour(s) restant(s)`;

  el('ramadan-iftar').textContent = (timingsData && timingsData.Maghrib) ? timingsData.Maghrib : '--:--';
  el('ramadan-suhoor').textContent = (timingsData && timingsData.Fajr) ? timingsData.Fajr : '--:--';

  card.style.display = 'block';
}

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

function playChime() { if (isQuietNow()) return; playBeep(700, 740); navigator.vibrate && navigator.vibrate(200); }

function playAdhan() {
  const m = getCurrentMosque();
  if (isQuietNow()) return;

  if (m.adhanUrl) {
    const a = new Audio(m.adhanUrl);
    a.play().catch(() => playBeep(1200, 660));
  } else {
    playBeep(1200, 660);
  }
}

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

function displayAll(data) {
  timingsData = (data && data.timings) ? data.timings : MOCK;
  const m = getCurrentMosque();

  el('mosque-name').textContent = m.name;
  el('wave-number').textContent = m.wave || '—';
  el('orange-number').textContent = m.orange || '—';
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

  updateNextCountdown();
  renderDonation();
  renderDonTable();
  renderEvents();
  renderRamadan();

  qiblaSetFallbackFromMosque();
}

function openWhatsApp(to, msg) {
  window.open(`https://wa.me/${encodeURIComponent(to)}?text=${encodeURIComponent(msg)}`, '_blank');
}

function setupDonButtons() {
  el('btn-wave').onclick = () => {
    const m = getCurrentMosque();
    openWhatsApp(m.phone || '', `Salam, je souhaite faire un don via *Wave Money*.
Montant : [à renseigner] CFA
Numéro Wave : ${m.wave}
Mosquée : ${m.name}
BarakAllahou fik.`);
  };

  el('btn-orange').onclick = () => {
    const m = getCurrentMosque();
    openWhatsApp(m.phone || '', `Salam, je souhaite faire un don via *Orange Money*.
Montant : [à renseigner] CFA
Numéro Orange : ${m.orange}
Mosquée : ${m.name}
BarakAllahou fik.`);
  };

  el('btn-claimed').onclick = () => {
    const m = getCurrentMosque();
    openWhatsApp(m.phone || '', `Salam, *j’ai donné* [montant] CFA via [Wave/Orange].
Référence : [collez le reçu]
Mosquée : ${m.name}`);
  };
}

/* Donations */
function kGoal(m) { return `dong_${m.id}`; }
function getGoal(m) { const g = localStorage.getItem(kGoal(m)); return g ? parseInt(g, 10) : 100000; }
function setGoal(m, val) { localStorage.setItem(kGoal(m), String(Math.max(0, parseInt(val, 10) || 0))); }
function kList(m) { return `donlist_${m.id}_${keyDay()}`; }
function kMonthSum(m) { return `donm_${m.id}_${ymKey()}`; }
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
  tb.innerHTML = '';

  loadList(m).forEach((r) => {
    const tr = document.createElement('tr');
    const st = r.status === 'ok'
      ? '<span class="badge b-ok">Confirmé</span>'
      : (r.status === 'no'
        ? '<span class="badge b-no">Annulé</span>'
        : '<span class="badge b-p">En attente</span>');

    tr.innerHTML = `<td>${new Date(r.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
      <td><strong>${r.amount.toLocaleString('fr-FR')}</strong></td>
      <td>${escapeHtml(r.method || '')}</td>
      <td>${escapeHtml(r.ref || '')}</td>
      <td>${st}</td>
      <td style="white-space:nowrap">
        <button data-act="ok" data-id="${r.id}" class="btn btn-primary" style="padding:6px 10px">OK</button>
        <button data-act="no" data-id="${r.id}" class="btn" style="padding:6px 10px; background:#ef4444; color:#fff">X</button>
      </td>`;
    tb.appendChild(tr);
  });

  tb.querySelectorAll('button[data-act]').forEach((b) => {
    b.onclick = () => setEntryStatus(b.dataset.id, b.dataset.act);
  });
}

function addDonationEntry({ amount, method, ref }) {
  const m = getCurrentMosque();
  const list = loadList(m);
  const id = Date.now().toString(36);

  list.unshift({
    id,
    ts: new Date().toISOString(),
    amount: Number(amount) || 0,
    method: method || 'Wave',
    ref: ref || '',
    status: 'pending',
  });

  saveList(m, list);
  renderDonTable();
  renderDonation();
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

/* Qibla */
const normDeg = (d) => ((d % 360) + 360) % 360;
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

function computeBearing(fromLat, fromLon, toLat, toLon) {
  const φ1 = toRad(fromLat);
  const φ2 = toRad(toLat);
  const Δλ = toRad(toLon - fromLon);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return normDeg(toDeg(Math.atan2(y, x)));
}

function qiblaUpdateMapsLink(lat, lon) {
  const origin = `${lat},${lon}`;
  const dest = `${KAABA.lat},${KAABA.lon}`;
  el('qibla-maps').onclick = () => window.open(
    `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}`,
    '_blank',
  );
}

function qiblaRenderNeedle() {
  if (qiblaBearingDeg == null) return;
  const rot = currentHeadingDeg == null ? qiblaBearingDeg : normDeg(qiblaBearingDeg - currentHeadingDeg);
  el('qibla-needle').style.transform = `rotate(${rot}deg)`;
  el('qibla-bearing').textContent = `${Math.round(qiblaBearingDeg)}°`;
  el('qibla-heading').textContent = currentHeadingDeg == null ? '—°' : `${Math.round(normDeg(currentHeadingDeg))}°`;
}

function qiblaSetFallbackFromMosque() {
  const m = getCurrentMosque();
  const base = CITY_COORDS[m.city] || CITY_COORDS.Medina;
  qiblaBearingDeg = computeBearing(base.lat, base.lon, KAABA.lat, KAABA.lon);
  qiblaUpdateMapsLink(base.lat, base.lon);
  qiblaRenderNeedle();
  el('qibla-status').textContent = `Mode ville (${m.city}). Clique sur Activer pour GPS + boussole.`;
}

async function qiblaRequestGeo() {
  if (!navigator.geolocation) {
    el('qibla-status').textContent = 'Géoloc indisponible. Utilisation ville mosquée.';
    return false;
  }

  el('qibla-status').textContent = 'Localisation…';

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        qiblaBearingDeg = computeBearing(lat, lon, KAABA.lat, KAABA.lon);
        qiblaUpdateMapsLink(lat, lon);
        el('qibla-status').textContent = 'OK. Tourne doucement pour stabiliser.';
        qiblaRenderNeedle();
        resolve(true);
      },
      () => {
        el('qibla-status').textContent = 'Permission GPS refusée. Utilisation ville mosquée.';
        resolve(false);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  });
}

function qiblaGetHeading(ev) {
  if (typeof ev.webkitCompassHeading === 'number') return ev.webkitCompassHeading;
  if (typeof ev.alpha === 'number') return 360 - ev.alpha;
  return null;
}

function qiblaOnOrientation(ev) {
  const h = qiblaGetHeading(ev);
  if (h == null) return;
  currentHeadingDeg = h;
  qiblaRenderNeedle();
}

async function qiblaStartCompass() {
  if (qiblaWatchActive) return;

  qiblaSetFallbackFromMosque();
  await qiblaRequestGeo();

  const DOE = window.DeviceOrientationEvent;
  if (!DOE) {
    el('qibla-status').textContent = 'Cap non supporté sur ce navigateur. Utilise Google Maps.';
    return;
  }

  if (typeof DOE.requestPermission === 'function') {
    el('qibla-status').textContent = 'Permission cap…';
    try {
      const res = await DOE.requestPermission();
      if (res !== 'granted') {
        el('qibla-status').textContent = 'Permission cap refusée. Utilise Google Maps.';
        return;
      }
    } catch {
      el('qibla-status').textContent = 'Permission cap impossible. Utilise Google Maps.';
      return;
    }
  }

  window.addEventListener('deviceorientation', qiblaOnOrientation, { passive: true });
  qiblaWatchActive = true;
  el('qibla-status').textContent = 'Boussole active. Tourne doucement pour stabiliser.';
}

/* Footer + modals */
function setupFooter() {
  el('events-btn').onclick = () => { renderEvents(); openModal('modal-events'); };
  el('announce-btn').onclick = () => {
    openModal('modal-ann');
    const m = getCurrentMosque();
    localStorage.setItem(`annSeen_${m.id}_${todayKey()}`, '1');
    el('notif').style.display = 'none';
  };
  el('about-btn').onclick = () => openModal('modal-about');
  el('names-btn').onclick = () => openModal('modal-names');
  el('share-btn').onclick = () => {
    const m = getCurrentMosque();
    const text = `🕌 ${m.name}\n${el('gregorian-date').textContent}\n\nFajr: ${el('fajr-time').textContent}\nDhuhr: ${el('dhuhr-time').textContent}\nAsr: ${el('asr-time').textContent}\nMaghrib: ${el('maghrib-time').textContent}\nIsha: ${el('isha-time').textContent}\n\n${location.href}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };
}

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
  el('adm-adhan-url').value = m.adhanUrl || '';
  el('adm-quiet').value = m.quiet || '22:00-05:00';
  el('adm-allow-fajr').checked = !!m.allowFajr;

  el('adm-goal').value = getGoal(m);
}

function setupAdmin() {
  el('admin-button').onclick = () => {
    const pw = prompt('Code d’accès :');
    if (pw === SUPER_ADMIN_PASSWORD) SESSION_ROLE = 'super';
    else if (pw === ADMIN_PASSWORD) SESSION_ROLE = 'admin';
    else return alert('Code incorrect.');

    const isSuper = SESSION_ROLE === 'super';
    el('super-row').style.display = isSuper ? 'flex' : 'none';
    el('advanced-block').style.display = isSuper ? 'block' : 'none';
    el('role-hint').textContent = isSuper ? 'Mode SUPER ADMIN' : 'Mode ADMIN (mosquée verrouillée)';

    el('don-admin').style.display = 'block';

    populateCitySelect(el('adm-city'));
    fillAdminForm(getCurrentMosque().id);

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

/* Init */
function setup() {
  bindModals();
  populateMosqueSelector();
  setupFooter();
  setupDonButtons();
  setupAdmin();

  el('don-add').onclick = () => {
    const amt = parseInt(el('don-amt').value, 10) || 0;
    if (amt <= 0) return alert('Montant invalide');
    addDonationEntry({ amount: amt, method: el('don-method').value, ref: el('don-ref').value });
    el('don-amt').value = '';
    el('don-ref').value = '';
  };

  el('qibla-start').onclick = () => qiblaStartCompass();

  updateClock();
  setInterval(updateClock, 1000);

  fetchTimings();
  setInterval(updateNextCountdown, 1000);

  qiblaSetFallbackFromMosque();
}

document.addEventListener('DOMContentLoaded', setup);