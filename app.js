// =========================
// SAFE PATCH (NE TOUCHE PAS UI)
// =========================

// ---------- STATE ----------
let timings = null;
let tasbih = 0;
let goal = 33;

// ---------- FALLBACK ----------
const DEFAULT = {
  Fajr: "05:45",
  Dhuhr: "13:30",
  Asr: "16:45",
  Maghrib: "19:15",
  Isha: "20:30",
};

// ---------- CLOCK ----------
setInterval(() => {
  const d = new Date();
  const el = document.getElementById("clock");
  if (el) el.textContent = d.toLocaleTimeString();
}, 1000);

// ---------- FETCH HORAIRES ----------
async function loadTimings() {
  try {
    let lat = 14.7167, lon = -17.4677;

    const pos = await new Promise(res =>
      navigator.geolocation.getCurrentPosition(res, () => res(null))
    );

    if (pos) {
      lat = pos.coords.latitude;
      lon = pos.coords.longitude;
    }

    const r = await fetch(
      `https://api.aladhan.com/v1/timings?latitude=${lat}&longitude=${lon}&method=3`
    );

    const data = await r.json();

    if (!data?.data?.timings) throw "API error";

    timings = data.data.timings;

  } catch (e) {
    console.warn("Fallback horaires", e);
    timings = DEFAULT;
  }

  displayTimings();
}

// ---------- DISPLAY ----------
function displayTimings() {
  if (!timings) timings = DEFAULT;

  setSafe("fajr", timings.Fajr);
  setSafe("dhuhr", timings.Dhuhr);
  setSafe("asr", timings.Asr);
  setSafe("maghrib", timings.Maghrib);
  setSafe("isha", timings.Isha);
}

function setSafe(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val || "--:--";
}

// ---------- TASBIH ----------
function updateTasbih() {
  setSafe("tasbih-count", tasbih);
}

document.addEventListener("click", (e) => {
  if (e.target.id === "btn-plus") {
    if (tasbih < goal) tasbih++;
    updateTasbih();
  }

  if (e.target.id === "btn-reset") {
    tasbih = 0;
    updateTasbih();
  }
});

// ---------- HADITH / DUA / DHIKR ----------
const HADITHS = [
  ["La patience est une lumière", "As-sabr diya", "الصبر ضياء"],
  ["Sourire est une aumône", "Tabassum sadaqa", "تبسمك صدقة"],
  ["Facilitez et ne compliquez pas", "Yassirou", "يسروا ولا تعسروا"],
];

const DUAS = [
  ["Guide-moi", "Allahumma ihdini", "اللهم اهدني"],
  ["Pardonne-moi", "Allahumma ghfir li", "اللهم اغفر لي"],
  ["Protège-moi", "Allahumma ihfazni", "اللهم احفظني"],
];

const DHIKR = [
  ["SubhanAllah", "SubhanAllah", "سبحان الله"],
  ["Alhamdulillah", "Alhamdulillah", "الحمد لله"],
  ["Allahu Akbar", "Allahu Akbar", "الله أكبر"],
];

function random(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function setTriple(ids, data) {
  setSafe(ids[0], data[0]);
  setSafe(ids[1], data[1]);
  setSafe(ids[2], data[2]);
}

// boutons
document.addEventListener("click", (e) => {
  if (e.target.id === "btn-hadith-change")
    setTriple(["hadith-fr", "hadith-ph", "hadith-ar"], random(HADITHS));

  if (e.target.id === "btn-dua-change")
    setTriple(["dua-fr", "dua-ph", "dua-ar"], random(DUAS));

  if (e.target.id === "btn-dhikr-change")
    setTriple(["dhikr-fr", "dhikr-ph", "dhikr-ar"], random(DHIKR));
});

// ---------- INIT ----------
function init() {
  displayTimings(); // direct
  loadTimings();   // API
  updateTasbih();
}

document.addEventListener("DOMContentLoaded", init);
