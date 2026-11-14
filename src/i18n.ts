import { create } from "zustand";

const DICT = {
  id: {
    "nav.dashboard": "Dashboard",
    "nav.downloads": "Unduhan",
    "nav.library": "Library",
    "nav.tools": "Tools",
    "nav.stats": "Statistik",
    "nav.theme": "Theme Studio",
    "nav.settings": "Pengaturan",
    "nav.log": "Log",
    "nav.about": "Tentang",
    "common.empty": "Belum ada data",
    "dash.subtitle": "Tempel URL, analisis, unduh.",
    "dash.urlLabel": "URL",
    "dash.urlPlaceholder": "https://...",
    "dash.analyze": "Analisis",
    "dash.disclaimer": "Hanya untuk konten milik sendiri / berlisensi / izin pemilik. Konten DRM ditolak otomatis.",
    "dash.activeCount": "Unduhan aktif: {n}",
    "dl.active": "Aktif",
    "dl.queue": "Antrean",
    "dl.done": "Selesai",
    "dl.failed": "Gagal",
    "lib.search": "Cari…",
    "tools.convert": "Konversi",
    "tools.extract": "Ekstrak Audio",
    "tools.compress": "Kompres",
    "tools.trim": "Potong",
    "tools.merge": "Gabung",
    "tools.inputPath": "Path input",
    "tools.outputPath": "Path output",
    "tools.param": "Parameter",
    "tools.run": "Jalankan",
    "stats.total": "Total",
    "stats.size": "Ukuran",
    "stats.week": "Minggu ini",
    "theme.mode": "Mode",
    "theme.mode.light": "Terang",
    "theme.mode.dark": "Gelap",
    "theme.mode.amoled": "AMOLED",
    "theme.mode.auto": "Otomatis",
    "theme.mode.schedule": "Jadwal",
    "theme.palette": "Palet",
    "theme.style": "Gaya",
    "theme.shape": "Bentuk",
    "theme.radius": "Radius",
    "theme.scale": "Skala Font",
    "theme.font": "Font",
    "theme.presets": "Preset",
    "theme.presetName": "Nama preset",
    "theme.save": "Simpan",
    "set.general": "Umum",
    "set.language": "Bahasa",
    "set.downloadDir": "Folder unduhan",
    "set.parallel": "Unduhan paralel",
    "set.autostart": "Jalankan saat startup",
    "set.clipboard": "Pantau clipboard",
    "set.backup": "Backup",
    "set.export": "Ekspor",
    "set.import": "Impor",
    "about.body": "NexaTools Downloader — unduh video/audio dari ribuan situs.",
    "about.legal": "Gunakan hanya untuk konten milik sendiri, berlisensi, atau dengan izin pemilik.",
  },
  en: {
    "nav.dashboard": "Dashboard",
    "nav.downloads": "Downloads",
    "nav.library": "Library",
    "nav.tools": "Tools",
    "nav.stats": "Statistics",
    "nav.theme": "Theme Studio",
    "nav.settings": "Settings",
    "nav.log": "Log",
    "nav.about": "About",
    "common.empty": "Nothing here yet",
    "dash.subtitle": "Paste URL, analyze, download.",
    "dash.urlLabel": "URL",
    "dash.urlPlaceholder": "https://...",
    "dash.analyze": "Analyze",
    "dash.disclaimer": "Only for your own, licensed, or authorized content. DRM is rejected automatically.",
    "dash.activeCount": "Active downloads: {n}",
    "dl.active": "Active",
    "dl.queue": "Queue",
    "dl.done": "Done",
    "dl.failed": "Failed",
    "lib.search": "Search…",
    "tools.convert": "Convert",
    "tools.extract": "Extract Audio",
    "tools.compress": "Compress",
    "tools.trim": "Trim",
    "tools.merge": "Merge",
    "tools.inputPath": "Input path",
    "tools.outputPath": "Output path",
    "tools.param": "Parameter",
    "tools.run": "Run",
    "stats.total": "Total",
    "stats.size": "Size",
    "stats.week": "This week",
    "theme.mode": "Mode",
    "theme.mode.light": "Light",
    "theme.mode.dark": "Dark",
    "theme.mode.amoled": "AMOLED",
    "theme.mode.auto": "Auto",
    "theme.mode.schedule": "Schedule",
    "theme.palette": "Palette",
    "theme.style": "Style",
    "theme.shape": "Shape",
    "theme.radius": "Radius",
    "theme.scale": "Font scale",
    "theme.font": "Font",
    "theme.presets": "Presets",
    "theme.presetName": "Preset name",
    "theme.save": "Save",
    "set.general": "General",
    "set.language": "Language",
    "set.downloadDir": "Download folder",
    "set.parallel": "Parallel downloads",
    "set.autostart": "Run at startup",
    "set.clipboard": "Watch clipboard",
    "set.backup": "Backup",
    "set.export": "Export",
    "set.import": "Import",
    "about.body": "NexaTools Downloader — download video/audio from thousands of sites.",
    "about.legal": "Use only for your own content, licensed content, or with the owner's permission.",
  },
} as const;

type Lang = keyof typeof DICT;
type Dict = typeof DICT["id"];
type Key = keyof Dict;

import { create as _create } from "zustand";

interface I18nState {
  lang: Lang;
  setLang: (l: Lang) => void;
}

const useI18nStore = _create<I18nState>((set) => ({
  lang: "id",
  setLang: (lang) => set({ lang }),
}));

export function useI18n() {
  const lang = useI18nStore((s) => s.lang);
  const setLang = useI18nStore((s) => s.setLang);
  const t = (key: string, vars?: Record<string, any>): string => {
    const raw = (DICT[lang] as Record<string, string>)[key] ?? key;
    if (!vars) return raw;
    return raw.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
  };
  return { t, lang, setLang };
}

export { useI18nStore };
