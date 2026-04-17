// VERSION STABLE - FIX HORAIRES + FALLBACK SAFE

// =========================
// CONFIG
// =========================
const BUILD = "7800";

// =========================
// SAFE TIMINGS (JAMAIS VIDE)
// =========================
const DEFAULT_TIMINGS = {
  Fajr: "05:30",
  Sunrise: "06:45",
  Dhuhr: "13:30",
  Asr: "17:00",
  Maghrib: "20:15",
  Isha: "21:30",
};

// =========================
// STATE
// =========================
let timingsData = DEFAULT_TIMINGS;
let activeMosque = {
  id: "bene-tally",
  city: "Dakar",
};

// =========================
// GPS
// =========================
function getCoords() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        });
      },
      () => resolve(null),
      { timeout: 5000 }
    );
  });
}

// =========================
// FETCH API SAFE
// =========================
async function fetchTimings() {
  try {
    let coords = await getCoords();

    // fallback Dakar
    if (!coords) {
      coords = { lat: 14.7167, lon: -17.4677 };
    }

    const url = `https://api.aladhan.com/v1/timings?latitude=${coords.lat}&longitude=${coords.lon}&method=3`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    const data = await res.json();

    if (!data?.data?.timings) throw new Error("API ERROR");

    timingsData = data.data.timings;

  } catch (err) {
    console.warn("Erreur horaires → fallback utilisé", err);

    // ⚠️ IMPORTANT : ON GARDE LES DERNIERS OU DEFAULT
    if (!timingsData) timingsData = DEFAULT_TIMINGS;
  }

  displayTimings();
}

// =========================
// DISPLAY (JAMAIS VIDE)
// =========================
function displayTimings() {
  if (!timingsData) timingsData = DEFAULT_TIMINGS;

  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val || "--:--";
  };

  set("fajr", timingsData.Fajr);
  set("dhuhr", timingsData.Dhuhr);
  set("asr", timingsData.Asr);
  set("maghrib", timingsData.Maghrib);
  set("isha", timingsData.Isha);
}

// =========================
// CLOCK
// =========================
function startClock() {
  setInterval(() => {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, "0");
    const m = String(now.getMinutes()).padStart(2, "0");
    const s = String(now.getSeconds()).padStart(2, "0");

    const el = document.getElementById("clock");
    if (el) el.textContent = `${h}:${m}:${s}`;
  }, 1000);
}

// =========================
// INIT
// =========================
function init() {
  startClock();
  displayTimings(); // ⚠️ affiche direct
  fetchTimings();   // update après
}

// =========================
// START
// =========================
document.addEventListener("DOMContentLoaded", init);
