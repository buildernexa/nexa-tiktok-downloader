import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home, Download, Library, Wrench, BarChart3, Palette, Settings, ScrollText, Info, X,
} from "lucide-react";
import {
  Dashboard, DownloadsPage, LibraryPage, ToolsPage, StatsPage,
  ThemeStudioPage, SettingsPage, LogPage, AboutPage,
} from "./pages";
import { useAppStore } from "./store";
import { useI18n } from "./i18n";
import { applyThemeToDocument, useThemeStore } from "./theme";

type PageId =
  | "dashboard" | "downloads" | "library" | "tools"
  | "stats" | "theme" | "settings" | "log" | "about";

const NAV: { id: PageId; icon: any; key: string }[] = [
  { id: "dashboard", icon: Home,     key: "nav.dashboard" },
  { id: "downloads", icon: Download, key: "nav.downloads" },
  { id: "library",   icon: Library,  key: "nav.library" },
  { id: "tools",     icon: Wrench,   key: "nav.tools" },
  { id: "stats",     icon: BarChart3,key: "nav.stats" },
  { id: "theme",     icon: Palette,  key: "nav.theme" },
  { id: "settings",  icon: Settings, key: "nav.settings" },
  { id: "log",       icon: ScrollText,key: "nav.log" },
  { id: "about",     icon: Info,     key: "nav.about" },
];

export default function App() {
  const [page, setPage] = useState<PageId>("dashboard");
  const { t } = useI18n();
  const bootstrap = useAppStore((s) => s.bootstrap);
  const toasts = useAppStore((s) => s.toasts);
  const dismissToast = useAppStore((s) => s.dismissToast);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  useEffect(() => {
    const unsub = useThemeStore.subscribe((s) => applyThemeToDocument(s));
    applyThemeToDocument(useThemeStore.getState());
    return () => unsub();
  }, []);

  const Page = useMemo(() => {
    switch (page) {
      case "dashboard": return <Dashboard />;
      case "downloads": return <DownloadsPage />;
      case "library":   return <LibraryPage />;
      case "tools":     return <ToolsPage />;
      case "stats":     return <StatsPage />;
      case "theme":     return <ThemeStudioPage />;
      case "settings":  return <SettingsPage />;
      case "log":       return <LogPage />;
      case "about":     return <AboutPage />;
    }
  }, [page]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">N</div>
          <div className="brand-text">
            <span className="brand-title">NexaTools</span>
            <span className="brand-sub">Downloader</span>
          </div>
        </div>
        <nav>
          {NAV.map(({ id, icon: Icon, key }) => (
            <button
              key={id}
              onClick={() => setPage(id)}
              className={`nav-item ${page === id ? "nav-item-active" : ""}`}
            >
              <Icon size={18} />
              <span>{t(key)}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="text-xs opacity-60">v1.0.0</span>
        </div>
      </aside>

      <main className="main">
        <AnimatePresence mode="wait">
          <motion.div
            key={page}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.2, 0.9, 0.25, 1] }}
            className="page-wrap"
          >
            {Page}
          </motion.div>
        </AnimatePresence>
      </main>

      <div className="toast-stack">
        <AnimatePresence>
          {toasts.map((tt) => (
            <motion.div
              key={tt.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className={`toast toast-${tt.kind}`}
            >
              <span>{tt.message}</span>
              <button onClick={() => dismissToast(tt.id)}><X size={14} /></button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
