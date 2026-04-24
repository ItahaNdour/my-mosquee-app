// =========================
// STATE
// =========================
let tasbih = 0;

const DEFAULT = {
  Fajr: "05:45",
  Dhuhr: "13:30",
  Asr: "16:45",
  Maghrib: "19:15",
  Isha: "20:30",
};

let timings = DEFAULT;

// =========================
// CLOCK
// =========================
setInterval(() => {
  const d = new Date();
  document.getElementById("clock").textContent =
    d.toLocaleTimeString();
}, 1000);

// =========================
// TIMINGS
// =========================
async function loadTimings() {
  try {
    const pos = await new Promise((res) =>
      navigator.geolocation.getCurrentPosition(res, () => res(null))
    );

    let lat = 14.7167, lon = -17.4677;

    if (pos) {
      lat = pos.coords.latitude;
      lon = pos.coords.longitude;
    }

    const r = await fetch(
      `https://api.aladhan.com/v1/timings?latitude=${lat}&longitude=${lon}&method=3`
    );

    const data = await r.json();
    timings = data.data.timings;

  } catch {
    timings = DEFAULT;
  }

  display();
}

function display() {
  for (let k in DEFAULT) {
    document.getElementById(k.toLowerCase()).textContent =
      timings[k] || "--:--";
  }
}

display();
loadTimings();

// =========================
// TASBIH
// =========================
document.getElementById("btn-plus").onclick = () => {
  tasbih++;
  document.getElementById("tasbih-count").textContent = tasbih;
};

document.getElementById("btn-reset").onclick = () => {
  tasbih = 0;
  document.getElementById("tasbih-count").textContent = tasbih;
};

// =========================
// TOOLS SWITCH
// =========================
const tools = ["tasbih", "hadith", "dua", "dhikr"];

tools.forEach(t => {
  document.getElementById("btn-" + t).onclick = () => {
    tools.forEach(x =>
      document.getElementById(x).classList.add("hidden")
    );
    document.getElementById(t).classList.remove("hidden");
  };
});

// =========================
// CONTENT
// =========================
const hadiths = [
  ["La patience est une lumière", "As-sabr diya", "الصبر ضياء"],
  ["Sourire est une aumône", "Tabassum sadaqa", "تبسمك صدقة"]
];

const duas = [
  ["Guide-moi", "Allahumma ihdini", "اللهم اهدني"],
  ["Pardonne-moi", "Allahumma ghfir li", "اللهم اغفر لي"]
];

const dhikr = [
  ["SubhanAllah", "SubhanAllah", "سبحان الله"],
  ["Alhamdulillah", "Alhamdulillah", "الحمد لله"]
];

function setContent(arr, ids) {
  const r = arr[Math.floor(Math.random() * arr.length)];
  document.getElementById(ids[0]).textContent = r[0];
  document.getElementById(ids[1]).textContent = r[1];
  document.getElementById(ids[2]).textContent = r[2];
}

document.getElementById("btn-hadith-change").onclick =
  () => setContent(hadiths, ["hadith-fr", "hadith-ph", "hadith-ar"]);

document.getElementById("btn-dua-change").onclick =
  () => setContent(duas, ["dua-fr", "dua-ph", "dua-ar"]);

document.getElementById("btn-dhikr-change").onclick =
  () => setContent(dhikr, ["dhikr-fr", "dhikr-ph", "dhikr-ar"]);
