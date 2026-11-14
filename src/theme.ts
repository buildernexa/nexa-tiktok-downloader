import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "light" | "dark" | "amoled" | "auto" | "schedule";
export type ThemeStyle = "glass" | "flat" | "neu" | "neon" | "minimal";

export interface ThemeConfig {
  mode: ThemeMode;
  style: ThemeStyle;
  accent: string;
  bg: string;
  fg: string;
  radius: number;
  fontScale: number;
  font: string;
  userPresets: { name: string; config: Omit<ThemeConfig, "userPresets"> }[];
}

export const PRESETS = [
  { id: "sun",      name: "Sun",      accent: "#f5c518", bg: "#fdf6e3", fg: "#111111" },
  { id: "ink",      name: "Ink",      accent: "#8ab4f8", bg: "#14140f", fg: "#f5f5f5" },
  { id: "mint",     name: "Mint",     accent: "#2fa84f", bg: "#e9fff1", fg: "#0d3d20" },
  { id: "berry",    name: "Berry",    accent: "#e5484d", bg: "#fff1f1", fg: "#4a0f10" },
  { id: "ocean",    name: "Ocean",    accent: "#38bdf8", bg: "#ecfeff", fg: "#0c4a6e" },
  { id: "grape",    name: "Grape",    accent: "#a78bfa", bg: "#f5f3ff", fg: "#2e1065" },
  { id: "cyber",    name: "Cyber",    accent: "#ff00aa", bg: "#0a0014", fg: "#00ffcc" },
  { id: "carbon",   name: "Carbon",   accent: "#f59e0b", bg: "#111111", fg: "#f5f5f5" },
  { id: "sky",      name: "Sky",      accent: "#0ea5e9", bg: "#f0f9ff", fg: "#0c2d48" },
  { id: "peach",    name: "Peach",    accent: "#fb7185", bg: "#fff1f2", fg: "#4c0519" },
  { id: "lime",     name: "Lime",     accent: "#84cc16", bg: "#f7fee7", fg: "#1a2e05" },
  { id: "royal",    name: "Royal",    accent: "#4f46e5", bg: "#eef2ff", fg: "#1e1b4b" },
  { id: "rose",     name: "Rose",     accent: "#f43f5e", bg: "#fff1f2", fg: "#4c0519" },
  { id: "teal",     name: "Teal",     accent: "#14b8a6", bg: "#f0fdfa", fg: "#042f2e" },
  { id: "amber",    name: "Amber",    accent: "#f59e0b", bg: "#fffbeb", fg: "#451a03" },
  { id: "violet",   name: "Violet",   accent: "#8b5cf6", bg: "#faf5ff", fg: "#2e1065" },
  { id: "cyan",     name: "Cyan",     accent: "#06b6d4", bg: "#ecfeff", fg: "#083344" },
  { id: "slate",    name: "Slate",    accent: "#64748b", bg: "#f8fafc", fg: "#0f172a" },
  { id: "coffee",   name: "Coffee",   accent: "#a16207", bg: "#fef3c7", fg: "#3f1d0a" },
  { id: "forest",   name: "Forest",   accent: "#16a34a", bg: "#f0fdf4", fg: "#052e16" },
  { id: "crimson",  name: "Crimson",  accent: "#dc2626", bg: "#fef2f2", fg: "#450a0a" },
  { id: "indigo",   name: "Indigo",   accent: "#4338ca", bg: "#eef2ff", fg: "#1e1b4b" },
  { id: "mango",    name: "Mango",    accent: "#f97316", bg: "#fff7ed", fg: "#431407" },
  { id: "aqua",     name: "Aqua",     accent: "#22d3ee", bg: "#ecfeff", fg: "#164e63" },
  { id: "plum",     name: "Plum",     accent: "#c026d3", bg: "#fdf4ff", fg: "#4a044e" },
  { id: "sable",    name: "Sable",    accent: "#a3a3a3", bg: "#171717", fg: "#e5e5e5" },
  { id: "midnight", name: "Midnight", accent: "#6366f1", bg: "#0f172a", fg: "#e2e8f0" },
  { id: "iron",     name: "Iron",     accent: "#9ca3af", bg: "#1f2937", fg: "#f3f4f6" },
  { id: "ember",    name: "Ember",    accent: "#ef4444", bg: "#1c1917", fg: "#fafaf9" },
  { id: "sand",     name: "Sand",     accent: "#d97706", bg: "#fef3c7", fg: "#1c1917" },
];

export const STYLES: ThemeStyle[] = ["flat", "glass", "neu", "neon", "minimal"];
export const FONTS = ["system-ui", "Inter, system-ui", "Georgia, serif", "ui-monospace, monospace", "Verdana, sans-serif"];

const defaults: ThemeConfig = {
  mode: "light",
  style: "flat",
  accent: "#f5c518",
  bg: "#fdf6e3",
  fg: "#111111",
  radius: 12,
  fontScale: 100,
  font: "system-ui",
  userPresets: [],
};

interface ThemeState extends ThemeConfig {
  setTheme: (patch: Partial<ThemeConfig>) => void;
  savePreset: (name: string) => void;
  deletePreset: (name: string) => void;
  reset: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      ...defaults,
      setTheme: (patch) => set((s) => ({ ...s, ...patch })),
      savePreset: (name) => {
        const { userPresets, mode, style, accent, bg, fg, radius, fontScale, font } = get();
        const snap = { mode, style, accent, bg, fg, radius, fontScale, font };
        set({ userPresets: [...userPresets.filter((p) => p.name !== name), { name, config: snap }] });
      },
      deletePreset: (name) => set((s) => ({ userPresets: s.userPresets.filter((p) => p.name !== name) })),
      reset: () => set({ ...defaults }),
    }),
    { name: "nexatools-theme" }
  )
);

export function applyThemeToDocument(cfg: ThemeConfig) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const effective =
    cfg.mode === "amoled" ? "amoled"
    : cfg.mode === "auto" ? (prefersDark ? "dark" : "light")
    : cfg.mode === "schedule" ? scheduleMode()
    : cfg.mode;

  const isDark = effective === "dark" || effective === "amoled";
  const bg = effective === "amoled" ? "#000000" : (isDark ? "#14140f" : cfg.bg);
  const fg = isDark ? "#f5f5f5" : cfg.fg;

  root.style.setProperty("--accent", cfg.accent);
  root.style.setProperty("--bg", bg);
  root.style.setProperty("--fg", fg);
  root.style.setProperty("--radius", `${cfg.radius}px`);
  root.style.setProperty("--scale", `${cfg.fontScale / 100}`);
  root.style.setProperty("--font", cfg.font);
  root.dataset.style = cfg.style;
  root.dataset.mode = effective;
}

function scheduleMode(): "light" | "dark" {
  const h = new Date().getHours();
  return h >= 7 && h < 19 ? "light" : "dark";
}
