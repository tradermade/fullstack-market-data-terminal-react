import { useEffect, useState } from "react";
import TickerPanel from "./TickerPanel.jsx";
import NewsPanel from "./NewsPanel.jsx";

const TAB_STORAGE_KEY = "fx_sidebar_tab";

function loadTab() {
  try {
    const t = localStorage.getItem(TAB_STORAGE_KEY);
    return t === "watchlist" || t === "news" ? t : "watchlist";
  } catch { return "watchlist"; }
}
function saveTab(t) {
  try { localStorage.setItem(TAB_STORAGE_KEY, t); } catch { /* ignore */ }
}

export default function RightSidebar({
  activeMarketId,
  selectedSymbol,
}) {
  const [tab, setTab] = useState(loadTab);

  // Persist tab
  useEffect(() => { saveTab(tab); }, [tab]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Tabs */}
      <div className="flex shrink-0 border-b border-[var(--border)] bg-[var(--bg-panel)]">
        {[
          { id: "watchlist", label: "Watchlist" },
          { id: "news",      label: "News" },
        ].map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 px-2 py-1.5 font-mono text-[9px] font-bold uppercase tracking-widest
                          transition-colors duration-100
                          ${active
                            ? "border-b-2 border-[var(--blue)] text-[var(--blue)]"
                            : "text-[var(--text-dim)] hover:text-[var(--text-secondary)]"}`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div className="flex-1 overflow-hidden">
        {tab === "watchlist"
          ? <TickerPanel activeMarketId={activeMarketId} selectedSymbol={selectedSymbol} />
          : <NewsPanel />
        }
      </div>
    </div>
  );
}
