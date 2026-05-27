import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CandleChart from "./CandleChart.jsx";
import { MARKETS, TIMEFRAMES } from "../constants/constants.jsx";
import { useSharedMarketData } from "../context/MarketDataContext.jsx";

// Same major-pair priority used by the main TopBar so the dropdown looks consistent.
const MAJOR_PAIRS = new Set([
  "EURUSD","GBPUSD","USDJPY","USDCHF","USDCAD","AUDUSD","NZDUSD",
  "EURGBP","EURJPY","GBPJPY","EURCHF","AUDJPY","CADJPY","CHFJPY",
  "BTCUSD","ETHUSD","XRPUSD","XAUUSD","XAGUSD","XPTUSD",
]);

function CellSymbolPicker({ allPairs, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [search, setSearch] = useState("");
  const btnRef = useRef(null);
  const popRef = useRef(null);

  const query = search.trim().toUpperCase();
  const list = useMemo(() => {
    if (!query) {
      const majors = allPairs.filter(p => MAJOR_PAIRS.has(p.sym));
      const rest = allPairs.filter(p => !MAJOR_PAIRS.has(p.sym))
        .sort((a, b) => a.sym.localeCompare(b.sym));
      return [...majors, ...rest].slice(0, 300);
    }
    return allPairs
      .filter(p => p.sym.includes(query) || p.base.includes(query) || p.quote.includes(query))
      .slice(0, 500);
  }, [allPairs, query]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!popRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const toggle = (e) => {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - 240) });
    }
    setOpen(v => !v);
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={toggle}
        className="flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--bg-card)] px-1.5 py-0.5
                   font-mono text-[10px] font-semibold text-[var(--text-primary)] hover:border-[var(--blue)]"
      >
        <span>{value}</span>
        <svg width="8" height="8" viewBox="0 0 10 10"><path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>
      </button>
      {open && createPortal(
        <div
          ref={popRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 10000 }}
          className="w-60 rounded border border-[var(--border-bright)] bg-[var(--bg-panel)] shadow-xl shadow-black/50 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-2 border-b border-[var(--border)]">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search FX pair or code…"
              className="w-full rounded-sm bg-[var(--bg-card)] border border-[var(--border-bright)] px-2 py-1.5 text-[11px]
                         text-[var(--text-primary)] outline-none focus:border-[var(--blue)]"
            />
          </div>
          <div className="max-h-72 overflow-y-auto">
            {list.length === 0 ? (
              <div className="px-3 py-3 font-mono text-[10px] text-[var(--text-dim)]">No matching pairs</div>
            ) : (
              list.map((p) => (
                <button
                  key={p.sym}
                  onClick={() => { onChange(p.sym); setOpen(false); setSearch(""); }}
                  className={`flex w-full items-center justify-between px-3 py-1.5 font-mono text-[10px]
                              ${p.sym === value
                                ? "bg-[var(--blue)]/15 text-[var(--blue)]"
                                : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"}`}
                >
                  <span className="font-bold">{p.base}<span className="text-[var(--text-dim)]">/</span>{p.quote}</span>
                  <span className="text-[var(--text-dim)] text-[9px]">{p.sym}</span>
                </button>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

const MS_PER_HOUR = 3_600_000;

// Discover the default symbol's full descriptor across all markets.
function findSymObj(symStr) {
  for (const m of MARKETS) {
    const f = m.symbols.find((s) => s.sym === symStr);
    if (f) return f;
  }
  return MARKETS[0].symbols[0];
}

function formatTMDate(d, isIntraday) {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  if (!isIntraday) return `${y}-${mo}-${da}`;
  const h = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${y}-${mo}-${da} ${h}:${mi}`;
}

function candleStartMs(timestampMs, tf) {
  const date = new Date(timestampMs);
  const y = date.getUTCFullYear();
  const mo = date.getUTCMonth();
  const d = date.getUTCDate();
  if (tf.interval === "daily") return Date.UTC(y, mo, d);
  const h = date.getUTCHours();
  if (tf.interval === "hourly") return Date.UTC(y, mo, d, Math.floor(h / tf.period) * tf.period);
  const mi = date.getUTCMinutes();
  return Date.UTC(y, mo, d, h, Math.floor(mi / tf.period) * tf.period);
}

/**
 * Self-contained chart panel: own symbol + TF + data fetch + live ticks.
 * Used by TradingPortal in multi-chart layouts (2x1 / 1x2 / 2x2).
 */
export default function ChartCell({
  cellId,
  defaultSymbol = "EURUSD",
  defaultTfLabel = "1H",
  defaultRangeHours = 168,
  focused = false,
  onFocus,
}) {
  // Per-cell state, persisted in localStorage by cellId
  const [symbolSym, setSymbolSym] = useState(() => {
    try { return localStorage.getItem(`cell_${cellId}_sym`) || defaultSymbol; }
    catch { return defaultSymbol; }
  });
  const [tfLabel, setTfLabel] = useState(() => {
    try { return localStorage.getItem(`cell_${cellId}_tf`) || defaultTfLabel; }
    catch { return defaultTfLabel; }
  });

  useEffect(() => { try { localStorage.setItem(`cell_${cellId}_sym`, symbolSym); } catch {} }, [cellId, symbolSym]);
  useEffect(() => { try { localStorage.setItem(`cell_${cellId}_tf`, tfLabel); } catch {} }, [cellId, tfLabel]);

  const symObj = useMemo(() => findSymObj(symbolSym), [symbolSym]);
  const tf = useMemo(() => TIMEFRAMES.find((t) => t.label === tfLabel) ?? TIMEFRAMES[6], [tfLabel]);
  const rangeHours = defaultRangeHours;

  const { ticks } = useSharedMarketData(useMemo(() => [symObj.sym], [symObj.sym]));
  const liveTick = ticks[symObj.sym];

  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Find activeMarket from the symbol
  const activeMarket = useMemo(() => {
    for (const m of MARKETS) if (m.symbols.find((s) => s.sym === symObj.sym)) return m;
    return MARKETS[0];
  }, [symObj.sym]);

  // Data fetch
  useEffect(() => {
    let cancelled = false;
    const fetchCandles = async () => {
      setLoading(true);
      setError(null);
      try {
        const isIntraday = tf.interval !== "daily";
        const isCrypto = activeMarket.id === "CRYPTO";
        const now = new Date();
        const end = new Date(now.getTime());
        const start = new Date(end.getTime() - rangeHours * MS_PER_HOUR);
        const weekendParam = isCrypto ? "&weekend=true"
                           : tf.interval !== "daily" ? "&weekend=false"
                           : "";
        const url =
          `/api/timeseries` +
          `?currency=${symObj.sym}` +
          `&start_date=${formatTMDate(start, isIntraday)}` +
          `&end_date=${formatTMDate(end, isIntraday)}` +
          `&interval=${tf.interval}&period=${tf.period}` +
          `&format=records${weekendParam}`;
        const res = await fetch(url);
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        if (json.error) throw new Error(json.error);
        if (!Array.isArray(json.quotes)) throw new Error("No quotes");
        const data = json.quotes.map((q) => ({
          t: new Date(q.date.replace(/(\d{4}-\d{2}-\d{2})[-\s](\d{2}:\d{2})(?::\d{2})?/, "$1T$2:00Z")).getTime(),
          o: Number(q.open), h: Number(q.high), l: Number(q.low), c: Number(q.close),
        }));
        if (!cancelled) setChartData(data);
      } catch (err) {
        if (!cancelled) { setError(err.message); setChartData([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchCandles();
    return () => { cancelled = true; };
  }, [symObj.sym, tf, activeMarket, rangeHours]);

  // Live tick → update last candle
  useEffect(() => {
    if (!liveTick || loading || error) return;
    const price = liveTick.mid ?? liveTick.bid ?? liveTick.ask;
    if (!Number.isFinite(price)) return;
    const bucket = candleStartMs(Date.now(), tf);
    setChartData((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (bucket < last.t) return prev;
      const next = [...prev];
      if (bucket === last.t) {
        next[next.length - 1] = { ...last, h: Math.max(last.h, price), l: Math.min(last.l, price), c: price };
      } else {
        next.push({ t: bucket, o: price, h: price, l: price, c: price });
      }
      return next;
    });
  }, [liveTick, loading, error, tf]);

  // Symbol dropdown — show currencies + a few common types
  const allPairs = useMemo(() => MARKETS.flatMap((m) => m.symbols), []);

  return (
    <div
      onClick={onFocus}
      className={`relative flex h-full flex-col overflow-hidden border ${focused ? "border-[var(--blue)]" : "border-[var(--border)]"}`}
    >
      {/* Mini toolbar */}
      <div className="flex shrink-0 items-center justify-between gap-1 border-b border-[var(--border)] bg-[var(--bg-panel)] px-2 py-1">
        <CellSymbolPicker
          allPairs={allPairs}
          value={symObj.sym}
          onChange={(sym) => setSymbolSym(sym)}
        />
        <div className="flex gap-0.5">
          {["5 Min", "15 Min", "1H", "4H", "1D"].map((label) => {
            const t = TIMEFRAMES.find((tf) => tf.label === label);
            if (!t) return null;
            const active = tfLabel === label;
            return (
              <button
                key={label}
                onClick={(e) => { e.stopPropagation(); setTfLabel(label); }}
                className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider
                            ${active
                              ? "bg-[var(--blue)] text-white"
                              : "text-[var(--text-dim)] hover:text-[var(--text-secondary)]"}`}
              >
                {label.replace(" Min", "M").replace(" ", "")}
              </button>
            );
          })}
        </div>
      </div>

      {/* Chart */}
      <div className="relative flex-1 overflow-hidden">
        {loading && !chartData.length && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--bg-base)]/80">
            <span className="font-mono text-[10px] text-[var(--blue)]">{symObj.sym} · {tf.label}</span>
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <span className="font-mono text-[10px] text-[var(--red)]">{error}</span>
          </div>
        )}
        {chartData.length > 0 && (
          <div className="absolute inset-0">
            <CandleChart
              data={chartData}
              chartKey={`${symObj.sym}-${tf.label}-${cellId}`}
              symbol={symObj.sym}
              decimals={symObj.decimals ?? 5}
            />
          </div>
        )}
      </div>
    </div>
  );
}
