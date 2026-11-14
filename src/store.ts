import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type TaskStatus = "queued" | "running" | "paused" | "done" | "failed";

export interface Task {
  id: string;
  url: string;
  title: string;
  thumbnail?: string;
  formatId: string;
  progress: number;
  speed?: string;
  eta?: string;
  status: TaskStatus;
  path?: string;
}

export interface Format {
  formatId: string;
  ext: string;
  resolution?: string;
  formatNote: string;
  hasDrm: boolean;
  filesize?: number;
}

export interface Analysis {
  url: string;
  title: string;
  uploader: string;
  duration: number;
  thumbnail?: string;
  formats: Format[];
}

export interface Settings {
  language: "id" | "en";
  downloadDir: string;
  parallel: number;
  autoStart: boolean;
  clipboardWatch: boolean;
}

export interface LibItem {
  id: string;
  title: string;
  path: string;
  thumbnail?: string;
  kind: "video" | "audio";
  sizeMb: number;
  ts: number;
}

export interface DailyStat { date: string; count: number; }
export interface Stats { total: number; sizeMb: number; week: number; daily: DailyStat[]; }

export interface LogEntry { ts: string; level: "info" | "warn" | "error"; message: string; }
export interface Toast { id: string; kind: "ok" | "err" | "info"; message: string; }

interface AppState {
  urlInput: string;
  analysis: Analysis | null;
  tasks: Task[];
  library: LibItem[];
  settings: Settings;
  stats: Stats | null;
  logs: LogEntry[];
  toasts: Toast[];
  bootstrapped: boolean;

  setUrlInput: (v: string) => void;
  analyzeUrl: () => Promise<void>;
  startDownload: (a: Analysis, f: Format) => Promise<void>;
  pauseTask: (id: string) => Promise<void>;
  resumeTask: (id: string) => Promise<void>;
  cancelTask: (id: string) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
  deleteLibraryItem: (id: string) => Promise<void>;
  openInFolder: (path: string) => Promise<void>;
  runFfmpeg: (tool: string, input: string, out: string, param: string) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  exportBackup: () => Promise<void>;
  importBackup: () => Promise<void>;
  refreshLibrary: () => Promise<void>;
  refreshStats: () => Promise<void>;
  bootstrap: () => Promise<void>;
  pushToast: (message: string, kind?: Toast["kind"]) => void;
  dismissToast: (id: string) => void;
  pushLog: (level: LogEntry["level"], message: string) => void;
}

const defaultSettings: Settings = {
  language: "id",
  downloadDir: "",
  parallel: 2,
  autoStart: false,
  clipboardWatch: true,
};

let unlisten: UnlistenFn[] = [];

export const useAppStore = create<AppState>((set, get) => ({
  urlInput: "",
  analysis: null,
  tasks: [],
  library: [],
  settings: defaultSettings,
  stats: null,
  logs: [],
  toasts: [],
  bootstrapped: false,

  setUrlInput: (v) => set({ urlInput: v }),

  pushToast: (message, kind = "info") => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }));
    setTimeout(() => get().dismissToast(id), 4000);
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  pushLog: (level, message) => set((s) => ({
    logs: [
      { ts: new Date().toISOString().slice(11, 19), level, message },
      ...s.logs,
    ].slice(0, 500),
  })),

  async bootstrap() {
    if (get().bootstrapped) return;
    try {
      const settings = await invoke<Settings>("get_settings").catch(() => defaultSettings);
      set({ settings });
      await get().refreshLibrary();
      await get().refreshStats();
      const tasks = await invoke<Task[]>("list_tasks").catch(() => []);
      set({ tasks });

      unlisten.forEach((fn) => fn());
      unlisten = [];

      unlisten.push(await listen<Task>("task-update", (ev) => {
        set((s) => {
          const idx = s.tasks.findIndex((t) => t.id === ev.payload.id);
          if (idx === -1) return { tasks: [...s.tasks, ev.payload] };
          const copy = [...s.tasks];
          copy[idx] = ev.payload;
          return { tasks: copy };
        });
      }));

      unlisten.push(await listen<LogEntry>("log", (ev) => {
        set((s) => ({ logs: [ev.payload, ...s.logs].slice(0, 500) }));
      }));

      set({ bootstrapped: true });
    } catch (e) {
      get().pushLog("error", String(e));
      set({ bootstrapped: true });
    }
  },

  async analyzeUrl() {
    const url = get().urlInput.trim();
    if (!url) return;
    try {
      const a = await invoke<Analysis>("analyze_url", { url });
      const safeFormats = a.formats.filter((f) => !f.hasDrm);
      if (safeFormats.length === 0) {
        get().pushToast("DRM content rejected", "err");
        return;
      }
      set({ analysis: { ...a, formats: safeFormats } });
    } catch (e) {
      get().pushToast(String(e), "err");
      get().pushLog("error", String(e));
    }
  },

  async startDownload(a, f) {
    try {
      await invoke<string>("start_download", {
        url: a.url,
        formatId: f.formatId,
        title: a.title,
        thumbnail: a.thumbnail ?? "",
      });
      get().pushToast("Download queued", "ok");
    } catch (e) {
      get().pushToast(String(e), "err");
    }
  },

  async pauseTask(id) { await invoke("pause_task", { id }); },
  async resumeTask(id) { await invoke("resume_task", { id }); },
  async cancelTask(id) { await invoke("cancel_task", { id }); },
  async removeTask(id) {
    await invoke("remove_task", { id });
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
  },

  async deleteLibraryItem(id) {
    try {
      await invoke("delete_library_item", { id });
      await get().refreshLibrary();
      get().pushToast("Deleted", "ok");
    } catch (e) { get().pushToast(String(e), "err"); }
  },

  async openInFolder(path) {
    await invoke("open_in_folder", { path }).catch(() => {});
  },

  async runFfmpeg(tool, input, out, param) {
    try {
      await invoke("run_ffmpeg", { tool, input, output: out, param });
      get().pushToast("Processing", "ok");
    } catch (e) {
      get().pushToast(String(e), "err");
      get().pushLog("error", String(e));
    }
  },

  async updateSettings(patch) {
    const merged = { ...get().settings, ...patch };
    set({ settings: merged });
    await invoke("save_settings", { settings: merged }).catch(() => {});
  },

  async exportBackup() {
    try {
      await invoke("export_backup");
      get().pushToast("Backup saved", "ok");
    } catch (e) { get().pushToast(String(e), "err"); }
  },

  async importBackup() {
    try {
      await invoke("import_backup");
      get().pushToast("Backup restored", "ok");
      await get().refreshLibrary();
    } catch (e) { get().pushToast(String(e), "err"); }
  },

  async refreshLibrary() {
    const library = await invoke<LibItem[]>("list_library").catch(() => []);
    set({ library });
  },

  async refreshStats() {
    const stats = await invoke<Stats>("get_stats").catch(() => null);
    set({ stats });
  },
}));
