// Nexa Hub v3.1 — semua fitur v3 dipertahankan, animasi konsisten
const HISTORY_KEY = "nexa_hub_history_v3";
const THEME_KEY = "nexa_hub_theme";
const MAX_HISTORY = 20;

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const isNative = !!(window.Capacitor?.isNativePlatform?.());

let currentMode = "download-video";
let currentData = null;

const form = $("#dl-form");
const input = $("#url");
const btn = $("#dl-btn");
const statusLabel = $("#status-label");
const resultCard = $("#result");
const modePill = $("#mode-pill");
const titleEl = $("#title");
const authorEl = $("#author");
const saveBtn = $("#save-btn");
const copyBtn = $("#copy-link");
const closeBtn = $("#close-result");
const historyCard = $("#history-card");
const historyList = $("#history-list");
const toastEl = $("#toast");
const vidPlayer = $("#video-player");
const audPlayer = $("#audio-player");
const coverImg = $("#cover-img");
const coverPh = $("#cover-ph");

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.add("hidden"), 2400);
}
const setStatus = (t) => (statusLabel.textContent = t);
const escapeHtml = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
function cleanUrl(raw) {
  const s = (raw || "").trim();
  if (!/tiktok\.com/i.test(s)) throw new Error("Invalid TikTok URL");
  return s.split("?")[0];
}

$$("#main-actions .chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    $$("#main-actions .chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    currentMode = chip.dataset.action;
  });
});

const loadHistory = () => { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; } };
const saveHistory = (l) => localStorage.setItem(HISTORY_KEY, JSON.stringify(l.slice(0, MAX_HISTORY)));

function renderHistory() {
  const list = loadHistory();
  historyList.innerHTML = "";
  if (!list.length) { historyList.innerHTML = `<li class="history-empty">No history yet</li>`; return; }
  list.forEach((it) => {
    const li = document.createElement("li");
    li.className = "history-item";
    li.innerHTML = `
      ${it.cover ? `<img class="history-thumb" src="${it.cover}" alt="">` : `<div class="history-thumb"></div>`}
      <div class="history-meta">
        <p class="history-title">${escapeHtml(it.title)}</p>
        <p class="history-sub">@${escapeHtml(it.author)} · ${escapeHtml(it.mode)}</p>
      </div>
      <a class="icon-btn" href="${it.url}" target="_blank" rel="noopener" style="width:36px;height:36px"><svg style="width:16px;height:16px"><use href="#i-external"/></svg></a>`;
    historyList.appendChild(li);
  });
}
function pushHistory(it) { const l = loadHistory(); l.unshift(it); saveHistory(l); }

async function tryCobalt(url, isAudio) {
  const body = { url, vQuality: "720", isAudioOnly: isAudio, isNoTTWatermark: true };
  const r = await fetch("https://api.cobalt.tools/api/json", {
    method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.status === "error") throw new Error("Cobalt failed");
  const direct = d.url || d.picker?.[0]?.url || (d.stream && d.stream.url);
  if (!direct) throw new Error("No URL");
  return { direct, source: "Cobalt" };
}
async function tryTikwm(url) {
  const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`;
  const r = await fetch(api);
  const d = await r.json().catch(() => ({}));
  if (d.code !== 0 || !d.data) throw new Error("Tikwm failed");
  const dd = d.data;
  let direct = dd.hdplay || dd.play;
  if (currentMode === "download-audio") direct = dd.music;
  if (currentMode === "download-cover") direct = dd.origin_cover || dd.cover;
  if (currentMode === "download-slideshow") direct = dd.images ? dd.images[0] : direct;
  if (!direct) throw new Error("No URL");
  return { direct, source: "Tikwm", title: dd.title || "", author: dd.author?.unique_id || "", cover: dd.origin_cover || dd.cover || "", duration: dd.duration || 0 };
}
async function resolveData(url) {
  const isAudio = currentMode === "download-audio";
  try {
    const c = await tryCobalt(url, isAudio);
    const t = await tryTikwm(url);
    return { ...t, direct: c.direct };
  } catch {
    try { return await tryTikwm(url); } catch { throw new Error("All servers failed."); }
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  resultCard.classList.add("hidden");
  let url;
  try { url = cleanUrl(input.value); } catch { toast("Invalid URL"); return; }
  btn.disabled = true;
  btn.querySelector(".btn-label").textContent = "Loading";
  setStatus("Working");
  try {
    const data = await resolveData(url);
    currentData = data;
    modePill.textContent = currentMode.replace("download-", "");
    titleEl.textContent = data.title || "Untitled";
    authorEl.textContent = "@" + (data.author || "unknown");

    vidPlayer.classList.add("hidden");
    audPlayer.classList.add("hidden");
    vidPlayer.pause(); audPlayer.pause();
    vidPlayer.removeAttribute("src"); audPlayer.removeAttribute("src");
    coverImg.classList.add("hidden");
    coverPh.classList.remove("hidden");

    if (currentMode === "download-video" || currentMode === "download-slideshow") {
      vidPlayer.src = data.direct;
      vidPlayer.classList.remove("hidden");
    } else if (currentMode === "download-audio") {
      audPlayer.src = data.direct;
      audPlayer.classList.remove("hidden");
    }
    if (data.cover) { coverImg.src = data.cover; coverImg.classList.remove("hidden"); coverPh.classList.add("hidden"); }

    resultCard.classList.remove("hidden");
    resultCard.scrollIntoView({ behavior: "smooth", block: "start" });
    setStatus("Ready");
    toast("Extracted");
    pushHistory({ title: titleEl.textContent, author: data.author, cover: data.cover, mode: modePill.textContent, url, ts: Date.now() });
  } catch (err) {
    setStatus("Error");
    toast(err.message || "Failed");
  } finally {
    btn.disabled = false;
    btn.querySelector(".btn-label").textContent = "Execute";
  }
});

saveBtn.addEventListener("click", async () => {
  if (!currentData?.direct) return toast("No data");
  let ext = "mp4";
  if (currentMode === "download-audio") ext = "mp3";
  if (currentMode === "download-cover") ext = "jpg";
  const filename = `nexa_${Date.now()}.${ext}`;

  if (isNative) {
    try {
      const { Filesystem, Directory } = window.Capacitor.Plugins;
      toast("Downloading");
      const res = await fetch(currentData.direct);
      const blob = await res.blob();
      const b64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(",")[1]);
        r.onerror = rej; r.readAsDataURL(blob);
      });
      await Filesystem.writeFile({ path: filename, data: b64, directory: Directory.Documents, recursive: true });
      toast("Saved to Documents");
    } catch { toast("Save failed"); }
  } else {
    const a = document.createElement("a");
    a.href = currentData.direct; a.download = filename; a.target = "_blank"; a.click();
    toast("Downloading");
  }
});

const framesCard = $("#frames-card");
const canvas = $("#frame-canvas");
const ctx = canvas.getContext("2d");
const btnSaveFrame = $("#btn-save-frame");

$("#btn-frames").addEventListener("click", () => {
  if (!currentData || (currentMode !== "download-video" && currentMode !== "download-slideshow")) return toast("Load video first");
  framesCard.classList.remove("hidden");
  framesCard.scrollIntoView({ behavior: "smooth" });
  canvas.width = vidPlayer.videoWidth || 720;
  canvas.height = vidPlayer.videoHeight || 1280;
  ctx.drawImage(vidPlayer, 0, 0, canvas.width, canvas.height);
});
$("#btn-take-frame").addEventListener("click", () => {
  ctx.drawImage(vidPlayer, 0, 0, canvas.width, canvas.height);
  btnSaveFrame.classList.remove("hidden");
  toast("Captured");
});
$("#btn-save-frame").addEventListener("click", async () => {
  const b64 = canvas.toDataURL("image/jpeg", 0.9);
  const filename = `frame_${Date.now()}.jpg`;
  if (isNative) {
    try {
      const { Filesystem, Directory } = window.Capacitor.Plugins;
      await Filesystem.writeFile({ path: filename, data: b64.split(",")[1], directory: Directory.Documents });
      toast("Saved");
    } catch { toast("Failed"); }
  } else {
    const a = document.createElement("a"); a.href = b64; a.download = filename; a.click();
    toast("Saved");
  }
});
$("#close-frames").addEventListener("click", () => framesCard.classList.add("hidden"));

$("#btn-history").addEventListener("click", () => {
  historyCard.classList.toggle("hidden");
  if (!historyCard.classList.contains("hidden")) { renderHistory(); historyCard.scrollIntoView({ behavior: "smooth" }); }
});
$("#close-history").addEventListener("click", () => historyCard.classList.add("hidden"));

$("#btn-theme").addEventListener("click", () => {
  document.body.classList.toggle("dark");
  localStorage.setItem(THEME_KEY, document.body.classList.contains("dark") ? "dark" : "light");
});

$("#btn-clear").addEventListener("click", () => { localStorage.removeItem(HISTORY_KEY); renderHistory(); toast("Cleared"); });
$("#btn-link-extract").addEventListener("click", () => {
  if (!currentData?.direct) return toast("No active link");
  navigator.clipboard.writeText(currentData.direct); toast("URL copied");
});
$("#btn-qr").addEventListener("click", () => {
  if (!currentData?.direct) return toast("No active link");
  window.open(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(currentData.direct)}`, "_blank");
});
$("#paste-btn").addEventListener("click", async () => {
  try { const t = await navigator.clipboard.readText(); if (t) input.value = t.trim(); } catch { toast("Clipboard blocked"); }
});
$("#copy-link").addEventListener("click", () => {
  if (!currentData) return;
  navigator.clipboard.writeText(currentData.direct); toast("Copied");
});
$("#close-result").addEventListener("click", () => { resultCard.classList.add("hidden"); vidPlayer.pause(); audPlayer.pause(); });

(function init() {
  if (localStorage.getItem(THEME_KEY) === "dark") document.body.classList.add("dark");
  renderHistory();
  fetch("https://api.cobalt.tools/api/serverInfo").then((r) => setStatus(r.ok ? "Ready" : "Limited")).catch(() => setStatus("Offline"));
})();
