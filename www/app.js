// file: www/app.js — 3 jalur cascade, download via Capacitor Filesystem
const HISTORY_KEY = "nexa_tt_history";
const THEME_KEY = "nexa_tt_theme";
const MAX_HISTORY = 20;

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const form = $("#dl-form");
const input = $("#url");
const btn = $("#dl-btn");
const statusLabel = $("#status-label");
const resultCard = $("#result");
const modePill = $("#mode-pill");
const cover = $("#cover");
const coverPh = $("#cover-ph");
const titleEl = $("#title");
const authorEl = $("#author");
const durationEl = $("#duration");
const sourceEl = $("#source");
const saveBtn = $("#save-btn");
const openLink = $("#open-link");
const copyBtn = $("#copy-link");
const closeBtn = $("#close-result");
const historyCard = $("#history");
const historyList = $("#history-list");
const historyToggle = $("#history-toggle");
const clearHistoryBtn = $("#clear-history");
const pasteBtn = $("#paste-btn");
const themeToggle = $("#theme-toggle");
const toastEl = $("#toast");

let mode = "video";
let quality = "hd";
let lastResult = null;

// ---- capacitor detection ----
const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

// ---- chips ----
$$(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    $$(".chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    mode = chip.dataset.mode;
    quality = chip.dataset.quality || "hd";
  });
});

$$(".tile[data-mode]").forEach((t) =>
  t.addEventListener("click", () => {
    mode = t.dataset.mode;
    $$(".chip").forEach((c) => {
      c.classList.toggle("active",
        c.dataset.mode === mode &&
        (mode === "audio" || mode === "thumb" || c.dataset.quality === quality));
    });
    input.focus();
  })
);

$$(".tile[data-jump]").forEach((t) =>
  t.addEventListener("click", () => {
    input.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  })
);

// ---- helpers ----
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.add("hidden"), 2200);
}
const setStatus = (t) => (statusLabel.textContent = t);

function fmtDuration(s) {
  if (!s) return "—";
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}
function escapeHtml(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
function cleanUrl(raw) {
  const s = (raw || "").trim();
  if (!/tiktok\.com/i.test(s)) throw new Error("Invalid URL");
  return s.split("?")[0];
}

// ---- history ----
const loadHistory = () => { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; } };
const saveHistory = (l) => localStorage.setItem(HISTORY_KEY, JSON.stringify(l.slice(0, MAX_HISTORY)));

function renderHistory() {
  const list = loadHistory();
  historyList.innerHTML = "";
  if (!list.length) {
    historyList.innerHTML = `<li class="history-empty">Empty</li>`;
    return;
  }
  list.forEach((it) => {
    const li = document.createElement("li");
    li.className = "history-item";
    li.innerHTML = `
      ${it.cover ? `<img class="history-thumb" src="${it.cover}" alt="">` : `<div class="history-thumb"></div>`}
      <div class="history-meta">
        <p class="history-title">${escapeHtml(it.title)}</p>
        <p class="history-sub">@${escapeHtml(it.author)} · ${escapeHtml(it.mode)}</p>
      </div>
      <a class="icon-btn" href="${it.url}" target="_blank" rel="noopener">↗</a>`;
    historyList.appendChild(li);
  });
}
function pushHistory(it) {
  const list = loadHistory();
  list.unshift(it);
  saveHistory(list);
  renderHistory();
}

// ---- API jalur 1: cobalt ----
async function tryCobalt(url) {
  const body = {
    url,
    vQuality: quality === "hd" ? "720" : "480",
    isAudioOnly: mode === "audio",
    isNoTTWatermark: true,
  };
  const r = await fetch("https://api.cobalt.tools/api/json", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.status === "error") throw new Error(d.text || "cobalt failed");
  const url2 = d.url || d.picker?.[0]?.url || (d.stream && d.stream.url);
  if (!url2) throw new Error("cobalt: no url");
  return { direct: url2, source: "cobalt", title: "", author: "", cover: "" };
}

// ---- API jalur 2: tikwm ----
async function tryTikwm(url) {
  const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`;
  const r = await fetch(api);
  const d = await r.json().catch(() => ({}));
  if (d.code !== 0 || !d.data) throw new Error("tikwm failed");
  const dd = d.data;
  let direct;
  if (mode === "audio") direct = dd.music;
  else if (mode === "thumb") direct = dd.origin_cover || dd.cover;
  else direct = dd.hdplay || dd.play;
  if (!direct) throw new Error("tikwm: no url");
  return {
    direct,
    source: "tikwm",
    title: dd.title || "",
    author: dd.author?.unique_id || "",
    cover: dd.origin_cover || dd.cover || "",
    duration: dd.duration || 0,
  };
}

// ---- API jalur 3: tiktok oembed metadata only ----
async function tryOembed(url) {
  const r = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
  if (!r.ok) throw new Error("oembed failed");
  const j = await r.json();
  return { title: j.title || "", author: j.author_name || "", cover: j.thumbnail_url || "" };
}

// ---- cascade ----
async function resolve(url) {
  const attempts = [tryCobalt, tryTikwm];
  let lastErr;
  for (const fn of attempts) {
    try {
      const r = await fn(url);
      return r;
    } catch (e) { lastErr = e; }
  }
  // metadata-only fallback supaya user tetap dapat cover + judul
  try {
    const meta = await tryOembed(url);
    throw Object.assign(new Error("download unavailable"), { meta, lastErr });
  } catch (e) {
    throw lastErr || new Error("all paths failed");
  }
}

// ---- save file (native vs web) ----
async function saveToDevice(directUrl, filename) {
  if (isNative) {
    try {
      const { Filesystem, Directory } = window.Capacitor.Plugins;
      const res = await fetch(directUrl);
      const blob = await res.blob();
      const b64 = await blobToBase64(blob);
      await Filesystem.writeFile({
        path: filename,
        data: b64,
        directory: Directory.Documents,
        recursive: true,
      });
      toast("Saved to Documents");
      return;
    } catch (e) {
      console.warn("native save failed, fallback to browser", e);
    }
  }
  // fallback: anchor download
  const a = document.createElement("a");
  a.href = directUrl;
  a.download = filename;
  a.target = "_blank";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast("Download started");
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

// ---- submit ----
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  resultCard.classList.add("hidden");

  let url;
  try { url = cleanUrl(input.value); }
  catch { toast("Invalid URL"); return; }

  btn.disabled = true;
  btn.querySelector(".btn-label").textContent = "...";
  setStatus("Working");

  try {
    const r = await resolve(url);
    lastResult = r;

    modePill.textContent = mode.toUpperCase() + (mode === "video" ? " " + quality.toUpperCase() : "");
    titleEl.textContent = r.title || "—";
    authorEl.textContent = "@" + (r.author || "unknown");
    durationEl.textContent = r.duration ? fmtDuration(r.duration) : "—";
    sourceEl.textContent = r.source || "—";

    if (r.cover) {
      cover.src = r.cover;
      cover.classList.remove("hidden");
      coverPh.classList.add("hidden");
    } else {
      cover.classList.add("hidden");
      coverPh.classList.remove("hidden");
    }

    openLink.href = r.direct || "#";
    resultCard.classList.remove("hidden");
    setStatus("Ready");
    toast("OK");

    pushHistory({
      title: titleEl.textContent,
      author: r.author || "unknown",
      cover: r.cover || "",
      mode: modePill.textContent,
      url,
      ts: Date.now(),
    });
  } catch (err) {
    setStatus("Error");
    toast(err.message || "Failed");
  } finally {
    btn.disabled = false;
    btn.querySelector(".btn-label").textContent = "GET";
  }
});

// ---- action buttons ----
saveBtn.addEventListener("click", () => {
  if (!lastResult || !lastResult.direct) return toast("Nothing to save");
  const ext = mode === "audio" ? "mp3" : (mode === "thumb" ? "jpg" : "mp4");
  saveToDevice(lastResult.direct, `nexa_${Date.now()}.${ext}`);
});

copyBtn.addEventListener("click", async () => {
  if (!lastResult || !lastResult.direct) return;
  try { await navigator.clipboard.writeText(lastResult.direct); toast("Copied"); }
  catch { toast("Copy failed"); }
});

pasteBtn.addEventListener("click", async () => {
  try {
    const txt = await navigator.clipboard.readText();
    if (txt) input.value = txt.trim();
  } catch { toast("Clipboard blocked"); }
});

closeBtn.addEventListener("click", () => resultCard.classList.add("hidden"));

historyToggle.addEventListener("click", () => {
  historyCard.classList.toggle("hidden");
  if (!historyCard.classList.contains("hidden")) {
    renderHistory();
    historyCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

clearHistoryBtn.addEventListener("click", () => {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
  toast("Cleared");
});

// ---- theme ----
const applyTheme = (dark) => {
  document.body.classList.toggle("dark", dark);
  localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
};
themeToggle.addEventListener("click", () => applyTheme(!document.body.classList.contains("dark")));

// ---- init ----
(function init() {
  applyTheme(localStorage.getItem(THEME_KEY) === "dark");
  renderHistory();
  fetch("https://api.cobalt.tools/api/serverInfo")
    .then((r) => setStatus(r.ok ? "Ready" : "Limited"))
    .catch(() => setStatus("Offline"));
})();
