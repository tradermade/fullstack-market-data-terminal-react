import { useCallback, useEffect, useRef, useState } from "react";
import DOMPanel from "./DOMPanel.jsx";
import TickerPanel from "./TickerPanel.jsx";
import NewsPanel from "./NewsPanel.jsx";

const STORAGE_KEY = "fx_dom_split_pct";
const TAB_STORAGE_KEY = "fx_sidebar_tab";
const DEFAULT_SPLIT_PCT = 45;
const MIN_PCT = 15;
const MAX_PCT = 85;

function loadSplit() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return DEFAULT_SPLIT_PCT;
    const n = JSON.parse(raw);
    return typeof n === "number" && n >= MIN_PCT && n <= MAX_PCT ? n : DEFAULT_SPLIT_PCT;
  } catch { return DEFAULT_SPLIT_PCT; }
}
function saveSplit(pct) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pct)); } catch { /* ignore */ }
}
function loadTab() {
  try {
    const t = localStorage.getItem(TAB_STORAGE_KEY);
    return t === "watchlist" || t === "news" ? t : "watchlist";
  } catch { return "watchlist"; }
}
function saveTab(t) {
  try { localStorage.setItem(TAB_STORAGE_KEY, t); } catch { /* ignore */ }
}

/**
 * Layout:
 *   ┌─ DOM (top half)        ─┐   ← only when domEnabled
 *   ├─── draggable divider ───┤
 *   ┌─ Tabs: Watchlist | News ┐
 *   ├─ Active tab content     ┤
 *   └─────────────────────────┘
 *
 * When DOM is disabled, the tabs + content take the entire sidebar.
 */
export default function RightSidebar({
  activeMarketId,
  selectedSymbol,
  selectedDecimals = 5,
  domEnabled,
}) {
  const containerRef = useRef(null);
  const [splitPct, setSplitPct] = useState(loadSplit);
  const [dragging, setDragging] = useState(false);
  const [tab, setTab] = useState(loadTab);

  // Persist tab
  useEffect(() => { saveTab(tab); }, [tab]);

  // Persist split after drag ends
  useEffect(() => {
    if (!dragging) saveSplit(splitPct);
  }, [dragging, splitPct]);

  const onPointerDown = useCallback((e) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const move = (e) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const y = e.clientY ?? e.touches?.[0]?.clientY;
      if (y == null) return;
      const pct = ((y - rect.top) / rect.height) * 100;
      setSplitPct(Math.max(MIN_PCT, Math.min(MAX_PCT, pct)));
    };
    const up = () => setDragging(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [dragging]);

  // The bottom section: tabs + active panel
  const bottomSection = (
    <div className="flex h-full flex-col">
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

  if (!domEnabled) {
    return (
      <div ref={containerRef} className="flex h-full flex-col overflow-hidden">
        {bottomSection}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex h-full flex-col overflow-hidden">
      {/* DOM */}
      <div className="overflow-hidden" style={{ height: `${splitPct}%` }}>
        <DOMPanel symbol={selectedSymbol} decimals={selectedDecimals} />
      </div>

      {/* Draggable divider */}
      <div
        onPointerDown={onPointerDown}
        className={`flex shrink-0 cursor-row-resize items-center justify-center gap-1
                    border-y border-[var(--border)] bg-[var(--bg-card)] py-[3px]
                    hover:bg-[var(--bg-hover)] ${dragging ? "bg-[var(--bg-hover)]" : ""}`}
        title="Drag to resize"
      >
        <span className="h-[2px] w-6 rounded-full bg-[var(--border-bright)]" />
        <span className="h-[2px] w-6 rounded-full bg-[var(--border-bright)]" />
      </div>

      {/* Tabs + active content */}
      <div className="flex-1 overflow-hidden" style={{ height: `${100 - splitPct}%` }}>
        {bottomSection}
      </div>

      {dragging && <style>{`body { user-select: none !important; cursor: row-resize !important; }`}</style>}
    </div>
  );
}
