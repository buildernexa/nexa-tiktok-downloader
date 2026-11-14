import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Search, Download as DownloadIcon, Plus, Trash2, Play, Pause, RotateCw,
  FolderOpen, Copy, Heart, Sun, Moon, Laptop, List, Grid3X3, GripVertical,
  Save, Upload, RotateCcw, FileVideo, FileAudio, Scissors, Combine, Gauge,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { useAppStore } from "./store";
import { useThemeStore, PRESETS, STYLES, FONTS, type ThemeConfig } from "./theme";
import { useI18n } from "./i18n";

/* ---------------- Dashboard ---------------- */
export function Dashboard() {
  const { t } = useI18n();
  const url = useAppStore((s) => s.urlInput);
  const setUrl = useAppStore((s) => s.setUrlInput);
  const analyze = useAppStore((s) => s.analyzeUrl);
  const analysis = useAppStore((s) => s.analysis);
  const startDownload = useAppStore((s) => s.startDownload);
  const tasks = useAppStore((s) => s.tasks);

  return (
    <div className="page">
      <h1 className="page-title">{t("nav.dashboard")}</h1>
      <p className="page-subtitle">{t("dash.subtitle")}</p>

      <div className="card">
        <label className="label">{t("dash.urlLabel")}</label>
        <div className="row gap-2">
          <input
            className="input flex-1"
            placeholder={t("dash.urlPlaceholder")}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button className="btn btn-primary" onClick={analyze} disabled={!url.trim()}>
            <Search size={16} /> {t("dash.analyze")}
          </button>
        </div>
        <p className="hint">{t("dash.disclaimer")}</p>
      </div>

      {analysis && (
        <div className="card">
          <div className="row gap-3">
            {analysis.thumbnail && (
              <img src={analysis.thumbnail} className="thumb-md" alt="" />
            )}
            <div className="flex-1 min-w-0">
              <h3 className="title-3">{analysis.title}</h3>
              <p className="hint">{analysis.uploader} · {analysis.duration}s</p>
            </div>
          </div>
          <div className="formats">
            {analysis.formats.map((f) => (
              <button
                key={f.formatId}
                onClick={() => startDownload(analysis, f)}
                className="format-btn"
              >
                <span>{f.resolution || f.ext}</span>
                <span className="hint">{f.ext} · {f.formatNote}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h3 className="title-3">{t("dash.activeCount", { n: tasks.filter(t => t.status === "running" || t.status === "queued").length })}</h3>
        {tasks.length === 0 && <p className="empty">{t("common.empty")}</p>}
      </div>
    </div>
  );
}

/* ---------------- Downloads ---------------- */
export function DownloadsPage() {
  const { t } = useI18n();
  const tasks = useAppStore((s) => s.tasks);
  const pause = useAppStore((s) => s.pauseTask);
  const resume = useAppStore((s) => s.resumeTask);
  const cancel = useAppStore((s) => s.cancelTask);
  const remove = useAppStore((s) => s.removeTask);
  const [tab, setTab] = useState<"active" | "queue" | "done" | "failed">("active");

  const visible = tasks.filter((tk) => {
    if (tab === "active") return tk.status === "running" || tk.status === "paused";
    if (tab === "queue") return tk.status === "queued";
    if (tab === "done") return tk.status === "done";
    return tk.status === "failed";
  });

  return (
    <div className="page">
      <h1 className="page-title">{t("nav.downloads")}</h1>
      <div className="tabs">
        {(["active", "queue", "done", "failed"] as const).map((id) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`tab ${tab === id ? "tab-active" : ""}`}
          >
            {t(`dl.${id}`)}
          </button>
        ))}
      </div>

      {visible.length === 0 && <p className="empty">{t("common.empty")}</p>}

      <div className="stack">
        {visible.map((tk) => (
          <div key={tk.id} className="task-card">
            <div className="flex-1 min-w-0">
              <p className="title-4 truncate">{tk.title || tk.url}</p>
              <div className="progress-track">
                <motion.div
                  className="progress-fill"
                  animate={{ width: `${tk.progress}%` }}
                  transition={{ type: "spring", stiffness: 120, damping: 20 }}
                />
              </div>
              <p className="hint">
                {tk.progress.toFixed(1)}% · {tk.speed || "—"} · ETA {tk.eta || "—"}
              </p>
            </div>
            <div className="task-actions">
              {tk.status === "running" && (
                <button className="icon-btn" onClick={() => pause(tk.id)}><Pause size={16} /></button>
              )}
              {tk.status === "paused" && (
                <button className="icon-btn" onClick={() => resume(tk.id)}><Play size={16} /></button>
              )}
              {tk.status !== "done" && (
                <button className="icon-btn" onClick={() => cancel(tk.id)}><RotateCw size={16} /></button>
              )}
              <button className="icon-btn danger" onClick={() => remove(tk.id)}><Trash2 size={16} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Library ---------------- */
export function LibraryPage() {
  const { t } = useI18n();
  const library = useAppStore((s) => s.library);
  const deleteItem = useAppStore((s) => s.deleteLibraryItem);
  const openFolder = useAppStore((s) => s.openInFolder);
  const [q, setQ] = useState("");

  const items = library.filter((it) =>
    (it.title || "").toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="page">
      <h1 className="page-title">{t("nav.library")}</h1>
      <div className="row gap-2">
        <input
          className="input flex-1"
          placeholder={t("lib.search")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {items.length === 0 && <p className="empty">{t("common.empty")}</p>}
      <div className="grid-cards">
        {items.map((it) => (
          <div key={it.id} className="media-card">
            <div className="media-thumb">
              {it.thumbnail ? <img src={it.thumbnail} alt="" /> : <FileVideo size={28} />}
            </div>
            <p className="title-4 truncate">{it.title}</p>
            <p className="hint truncate">{it.path}</p>
            <div className="row gap-2">
              <button className="icon-btn" onClick={() => openFolder(it.path)}><FolderOpen size={14} /></button>
              <button className="icon-btn danger" onClick={() => deleteItem(it.id)}><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Tools ---------------- */
export function ToolsPage() {
  const { t } = useI18n();
  const runFfmpeg = useAppStore((s) => s.runFfmpeg);
  const [tool, setTool] = useState<"convert" | "extract" | "compress" | "trim" | "merge">("convert");
  const [input, setInput] = useState("");
  const [out, setOut] = useState("");
  const [param, setParam] = useState("");

  return (
    <div className="page">
      <h1 className="page-title">{t("nav.tools")}</h1>
      <div className="tabs">
        {(["convert", "extract", "compress", "trim", "merge"] as const).map((id) => (
          <button
            key={id}
            onClick={() => setTool(id)}
            className={`tab ${tool === id ? "tab-active" : ""}`}
          >
            {t(`tools.${id}`)}
          </button>
        ))}
      </div>

      <div className="card stack">
        <label className="label">{t("tools.inputPath")}</label>
        <input className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="/path/to/input.mp4" />

        <label className="label">{t("tools.outputPath")}</label>
        <input className="input" value={out} onChange={(e) => setOut(e.target.value)} placeholder="/path/to/output.mp4" />

        <label className="label">{t("tools.param")}</label>
        <input className="input" value={param} onChange={(e) => setParam(e.target.value)} placeholder="128k / 00:00:30 / ..." />

        <button
          className="btn btn-primary"
          onClick={() => runFfmpeg(tool, input, out, param)}
          disabled={!input || !out}
        >
          {t("tools.run")}
        </button>
      </div>
    </div>
  );
}

/* ---------------- Stats ---------------- */
export function StatsPage() {
  const { t } = useI18n();
  const stats = useAppStore((s) => s.stats);
  const chartData = (stats?.daily ?? []).map((d) => ({ date: d.date, count: d.count }));

  return (
    <div className="page">
      <h1 className="page-title">{t("nav.stats")}</h1>
      <div className="grid-3">
        <div className="card stat-box">
          <span className="hint">{t("stats.total")}</span>
          <span className="stat-num">{stats?.total ?? 0}</span>
        </div>
        <div className="card stat-box">
          <span className="hint">{t("stats.size")}</span>
          <span className="stat-num">{(stats?.sizeMb ?? 0).toFixed(1)} MB</span>
        </div>
        <div className="card stat-box">
          <span className="hint">{t("stats.week")}</span>
          <span className="stat-num">{stats?.week ?? 0}</span>
        </div>
      </div>
      <div className="card" style={{ height: 320 }}>
        <ResponsiveContainer>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Line type="monotone" dataKey="count" stroke="var(--accent)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ---------------- Theme Studio ---------------- */
export function ThemeStudioPage() {
  const { t } = useI18n();
  const theme = useThemeStore();
  const setTheme = useThemeStore((s) => s.setTheme);
  const savePreset = useThemeStore((s) => s.savePreset);
  const deletePreset = useThemeStore((s) => s.deletePreset);
  const [presetName, setPresetName] = useState("");

  const update = <K extends keyof ThemeConfig>(k: K, v: ThemeConfig[K]) => setTheme({ [k]: v } as any);

  return (
    <div className="page">
      <h1 className="page-title">{t("nav.theme")}</h1>

      <section className="card stack">
        <h3 className="title-3">{t("theme.mode")}</h3>
        <div className="row gap-2">
          {(["light", "dark", "amoled", "auto", "schedule"] as const).map((m) => (
            <button
              key={m}
              onClick={() => update("mode", m)}
              className={`chip ${theme.mode === m ? "chip-active" : ""}`}
            >
              {t(`theme.mode.${m}`)}
            </button>
          ))}
        </div>
      </section>

      <section className="card stack">
        <h3 className="title-3">{t("theme.palette")}</h3>
        <div className="preset-grid">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => setTheme({ accent: p.accent, bg: p.bg, fg: p.fg })}
              className="preset-swatch"
              style={{ background: p.bg, color: p.fg, borderColor: p.accent }}
            >
              {p.name}
            </button>
          ))}
        </div>
        <div className="row gap-2">
          <input
            className="input"
            value={theme.accent}
            onChange={(e) => update("accent", e.target.value)}
            placeholder="#f5c518"
          />
          <input
            type="color"
            value={theme.accent}
            onChange={(e) => update("accent", e.target.value)}
            className="color-input"
          />
        </div>
      </section>

      <section className="card stack">
        <h3 className="title-3">{t("theme.style")}</h3>
        <div className="row gap-2 wrap">
          {STYLES.map((s) => (
            <button
              key={s}
              onClick={() => update("style", s)}
              className={`chip ${theme.style === s ? "chip-active" : ""}`}
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      <section className="card stack">
        <h3 className="title-3">{t("theme.shape")}</h3>
        <label className="label">{t("theme.radius")} — {theme.radius}px</label>
        <input type="range" min={0} max={32} value={theme.radius}
          onChange={(e) => update("radius", Number(e.target.value))} />
        <label className="label">{t("theme.scale")} — {theme.fontScale}%</label>
        <input type="range" min={80} max={140} value={theme.fontScale}
          onChange={(e) => update("fontScale", Number(e.target.value))} />
        <label className="label">{t("theme.font")}</label>
        <select className="input" value={theme.font}
          onChange={(e) => update("font", e.target.value)}>
          {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </section>

      <section className="card stack">
        <h3 className="title-3">{t("theme.presets")}</h3>
        <div className="row gap-2">
          <input className="input flex-1" placeholder={t("theme.presetName")}
            value={presetName} onChange={(e) => setPresetName(e.target.value)} />
          <button className="btn btn-primary"
            onClick={() => { if (presetName.trim()) { savePreset(presetName.trim()); setPresetName(""); } }}>
            <Save size={14} /> {t("theme.save")}
          </button>
        </div>
        {theme.userPresets.map((p) => (
          <div key={p.name} className="row gap-2">
            <span className="flex-1">{p.name}</span>
            <button className="icon-btn danger" onClick={() => deletePreset(p.name)}><Trash2 size={14} /></button>
          </div>
        ))}
      </section>
    </div>
  );
}

/* ---------------- Settings ---------------- */
export function SettingsPage() {
  const { t } = useI18n();
  const settings = useAppStore((s) => s.settings);
  const update = useAppStore((s) => s.updateSettings);
  const backup = useAppStore((s) => s.exportBackup);
  const restore = useAppStore((s) => s.importBackup);

  return (
    <div className="page">
      <h1 className="page-title">{t("nav.settings")}</h1>

      <section className="card stack">
        <h3 className="title-3">{t("set.general")}</h3>
        <label className="label">{t("set.language")}</label>
        <select className="input" value={settings.language}
          onChange={(e) => update({ language: e.target.value as any })}>
          <option value="id">Bahasa Indonesia</option>
          <option value="en">English</option>
        </select>

        <label className="label">{t("set.downloadDir")}</label>
        <input className="input" value={settings.downloadDir}
          onChange={(e) => update({ downloadDir: e.target.value })} />

        <label className="label">{t("set.parallel")} — {settings.parallel}</label>
        <input type="range" min={1} max={5} value={settings.parallel}
          onChange={(e) => update({ parallel: Number(e.target.value) })} />

        <label className="row gap-2">
          <input type="checkbox" checked={settings.autoStart}
            onChange={(e) => update({ autoStart: e.target.checked })} />
          <span>{t("set.autostart")}</span>
        </label>
        <label className="row gap-2">
          <input type="checkbox" checked={settings.clipboardWatch}
            onChange={(e) => update({ clipboardWatch: e.target.checked })} />
          <span>{t("set.clipboard")}</span>
        </label>
      </section>

      <section className="card stack">
        <h3 className="title-3">{t("set.backup")}</h3>
        <div className="row gap-2">
          <button className="btn" onClick={backup}><Upload size={14} /> {t("set.export")}</button>
          <button className="btn" onClick={restore}><RotateCcw size={14} /> {t("set.import")}</button>
        </div>
      </section>
    </div>
  );
}

/* ---------------- Log ---------------- */
export function LogPage() {
  const { t } = useI18n();
  const logs = useAppStore((s) => s.logs);
  return (
    <div className="page">
      <h1 className="page-title">{t("nav.log")}</h1>
      <div className="log-box">
        {logs.length === 0 && <p className="hint">{t("common.empty")}</p>}
        {logs.map((l, i) => (
          <div key={i} className="log-row">
            <span className="hint">{l.ts}</span>
            <span className={`log-${l.level}`}>{l.level.toUpperCase()}</span>
            <span>{l.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- About ---------------- */
export function AboutPage() {
  const { t } = useI18n();
  return (
    <div className="page">
      <h1 className="page-title">{t("nav.about")}</h1>
      <div className="card stack">
        <h3 className="title-3">NexaTools Downloader</h3>
        <p>{t("about.body")}</p>
        <p className="hint">{t("about.legal")}</p>
      </div>
    </div>
  );
}
