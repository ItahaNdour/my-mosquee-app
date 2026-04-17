// =========================
// VERSION FULL STABLE FIX
// =========================

const BUILD = "FINAL-8000";

// =========================
// DEFAULT (ANTI BUG)
// =========================
const DEFAULT_TIMINGS = {
  Fajr: "05:45",
  Sunrise: "07:00",
  Dhuhr: "13:30",
  Asr: "16:45",
  Maghrib: "19:15",
  Isha: "20:30",
};

// =========================
// STATE
// =========================
let timings = DEFAULT_TIMINGS;
let tasbihCount = 0;
let tasbihGoal = 33;

// =========================
// TOOLS DATA
// =========================
const HADITHS = [
  { fr: "La patience est une lumière.", ar: "الصبر ضياء", ph: "As-sabr diya" },
  { fr: "Allah regarde vos cœurs.", ar: "إن الله لا ينظر إلى صوركم", ph: "Allah la yandhur ila suwarikum" },
  { fr: "La meilleure parole est le dhikr.", ar: "أفضل الذكر", ph: "Afdal adh-dhikr" },
  { fr: "Facilitez et ne compliquez pas.", ar: "يسروا ولا تعسروا", ph: "Yassirou wala tu'assirou" },
  { fr: "Sourire est une aumône.", ar: "تبسمك صدقة", ph: "Tabassumuka sadaqa" },
];

const DUA = [
  { fr: "Ô Allah guide-moi", ar: "اللهم اهدني", ph: "Allahumma ihdini" },
  { fr: "Ô Allah pardonne-moi", ar: "اللهم اغفر لي", ph: "Allahumma ghfir li" },
  { fr: "Ô Allah protège-moi", ar: "اللهم احفظني", ph: "Allahumma ihfazni" },
];

const DHIKR = [
  { fr: "Gloire à Allah", ar: "سبحان الله", ph: "SubhanAllah" },
  { fr: "Louange à Allah", ar: "الحمد لله", ph: "Alhamdulillah" },
  { fr: "Allah est grand", ar: "الله أكبر", ph: "Allahu Akbar" },
];

// =========================
// GPS
// =========================
function getCoords() {
  return new Promise((resolve) => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve({ lat: 14.7167, lon: -17.4677 }) // Dakar fallback
    );
  });
}

// =========================
// FETCH TIMINGS (SAFE)
// =========================
async function loadTimings() {
  try {
    const coords = await getCoords();

    const res = await fetch(
      `https://api.aladhan.com/v1/timings?latitude=${coords.lat}&longitude=${coords.lon}&method=3`
    );

    const data = await res.json();

    if (!data?.data?.timings) throw "API fail";

    timings = data.data.timings;
  } catch (e) {
    console.warn("Fallback horaires", e);
    timings = DEFAULT_TIMINGS;
  }

  displayTimings();
}

// =========================
// DISPLAY TIMINGS
// =========================
function displayTimings() {
  set("fajr", timings.Fajr);
  set("dhuhr", timings.Dhuhr);
  set("asr", timings.Asr);
  set("maghrib", timings.Maghrib);
  set("isha", timings.Isha);
}

function set(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val || "--:--";
}

// =========================
// CLOCK
// =========================
function startClock() {
  setInterval(() => {
    const d = new Date();
    const time =
      String(d.getHours()).padStart(2, "0") +
      ":" +
      String(d.getMinutes()).padStart(2, "0") +
      ":" +
      String(d.getSeconds()).padStart(2, "0");

    const el = document.getElementById("clock");
    if (el) el.textContent = time;
  }, 1000);
}

// =========================
// TASBIH
// =========================
function tasbihPlus() {
  if (tasbihCount < tasbihGoal) tasbihCount++;
  updateTasbih();
}

function tasbihReset() {
  tasbihCount = 0;
  updateTasbih();
}

function updateTasbih() {
  set("tasbih-count", tasbihCount);
}

// =========================
// TOOLS SWITCH
// =========================
function showTool(type) {
  document.querySelectorAll(".tool-content").forEach(el => el.style.display = "none");

  document.getElementById(type).style.display = "block";

  document.querySelectorAll(".tool-btn").forEach(b => b.classList.remove("active"));
  document.getElementById("btn-" + type).classList.add("active");
}

// =========================
// RANDOM CONTENT
// =========================
function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function changeHadith() {
  const h = randomItem(HADITHS);
  set("hadith-fr", h.fr);
  set("hadith-ar", h.ar);
  set("hadith-ph", h.ph);
}

function changeDua() {
  const d = randomItem(DUA);
  set("dua-fr", d.fr);
  set("dua-ar", d.ar);
  set("dua-ph", d.ph);
}

function changeDhikr() {
  const d = randomItem(DHIKR);
  set("dhikr-fr", d.fr);
  set("dhikr-ar", d.ar);
  set("dhikr-ph", d.ph);
}

// =========================
// INIT
// =========================
function init() {
  startClock();
  displayTimings(); // instant
  loadTimings();    // update API

  changeHadith();
  changeDua();
  changeDhikr();

  updateTasbih();

  // bind buttons
  document.getElementById("btn-plus")?.addEventListener("click", tasbihPlus);
  document.getElementById("btn-reset")?.addEventListener("click", tasbihReset);

  document.getElementById("btn-hadith-change")?.addEventListener("click", changeHadith);
  document.getElementById("btn-dua-change")?.addEventListener("click", changeDua);
  document.getElementById("btn-dhikr-change")?.addEventListener("click", changeDhikr);
}

// =========================
// START
// =========================
document.addEventListener("DOMContentLoaded", init);
