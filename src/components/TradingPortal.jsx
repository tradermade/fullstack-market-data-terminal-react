import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import GlobalStyles  from "../styles/GlobalStyles.jsx";
import NavBar        from "./NavBar.jsx";
import TopBar        from "./TopBar.jsx";
import CandleChart   from "./CandleChart.jsx";
import StatusBar     from "./StatusBar.jsx";
import TickerPanel   from "./TickerPanel.jsx";
import RightSidebar  from "./RightSidebar.jsx";
import ChartCell     from "./ChartCell.jsx";
import SettingsModal  from "./SettingsModal.jsx";
import { MARKETS, TIMEFRAMES } from "../constants/constants.jsx";
import { usePersistedState } from "../hooks/usePersistedState.js";
import { useSharedMarketData } from "../context/MarketDataContext.jsx";
import { MAX_WINDOW_HOURS, DEFAULT_RANGE_HOURS } from "./TopBar.jsx";

const MS_PER_HOUR = 3_600_000;
const MARKET_LOOKBACK_STEP_MS = 15 * 60_000;
const CACHE_VERSION = "v3";

/* ── Cache helpers ───────────────────────────────────────────────────────── */
const getCacheKey = (sym, tfLabel, rangeHours, anchorKey = "live") =>
  `fx_cache_${CACHE_VERSION}_${sym}_${tfLabel}_${rangeHours}_${anchorKey}`;

const getCachedTimeseries = (sym, tfLabel, rangeHours, anchorKey) => {
  try {
    const raw = sessionStorage.getItem(getCacheKey(sym, tfLabel, rangeHours, anchorKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.data) && typeof parsed.lastFetch === "number") return parsed;
  } catch { /* ignore */ }
  return null;
};

const setCachedTimeseries = (sym, tfLabel, rangeHours, anchorKey, data) => {
  try {
    sessionStorage.setItem(
      getCacheKey(sym, tfLabel, rangeHours, anchorKey),
      JSON.stringify({ data, lastFetch: Date.now() })
    );
  } catch { /* ignore */ }
};

/* ── Date helpers ────────────────────────────────────────────────────────── */
const getRangeKey = (label) => `fx_range_hours_${label}`;
const MIN_CANDLES_PER_WINDOW = 6;
const MIN_RANGE_HOURS = {
  daily: 168,
};

function timeframeHours(tf) {
  if (tf.interval === "daily") return 24 * tf.period;
  if (tf.interval === "hourly") return tf.period;
  return tf.period / 60;
}

function readStoredRange(tfObj) {
  const fallback = DEFAULT_RANGE_HOURS[tfObj.interval] ?? 24;
  try {
    const raw = localStorage.getItem(getRangeKey(tfObj.label));
    if (raw == null) return fallback;
    const parsed = JSON.parse(raw);
    return typeof parsed === "number" && parsed > 0 ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function saveStoredRange(tfObj, hours) {
  try {
    localStorage.setItem(getRangeKey(tfObj.label), JSON.stringify(hours));
  } catch {
    // Storage may be full or unavailable in private mode.
  }
}

function clampRangeForTimeframe(tfObj, hours) {
  const max = MAX_WINDOW_HOURS[tfObj.interval] ?? 48;
  const min = MIN_RANGE_HOURS[tfObj.interval] ?? 0;
  const fallback = DEFAULT_RANGE_HOURS[tfObj.interval] ?? max;
  const clamped = Math.min(hours, max);
  return min > 0 && clamped < min ? Math.min(fallback, max) : clamped;
}

function pickTimeframeForRange(currentTf, hours) {
  const currentCandles = hours / timeframeHours(currentTf);
  if (currentCandles >= MIN_CANDLES_PER_WINDOW) return currentTf;

  const candidates = TIMEFRAMES.filter((candidate) => {
    const max = MAX_WINDOW_HOURS[candidate.interval] ?? 48;
    return hours <= max && hours / timeframeHours(candidate) >= MIN_CANDLES_PER_WINDOW;
  });

  return candidates.find((candidate) => candidate.label === "1H")
    ?? candidates.find((candidate) => candidate.label === "4H")
    ?? candidates[candidates.length - 1]
    ?? currentTf;
}

const formatTMDate = (d, isIntraday) => {
  const y  = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  if (!isIntraday) return `${y}-${mo}-${da}`;
  const h  = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  // Use a space separator instead of a dash for parity with the working vanilla JS version
  return `${y}-${mo}-${da} ${h}:${mi}`;
};

function tickPrice(tick) {
  const price = tick?.mid ?? (
    tick?.bid != null && tick?.ask != null
      ? (tick.bid + tick.ask) / 2
      : tick?.bid ?? tick?.ask
  );
  return Number.isFinite(price) ? Number(price) : null;
}

function tickTimestampMs(tick) {
  const raw = tick?.timestamp ?? tick?.ts ?? tick?.time;
  const normalizeNumeric = (value) => {
    if (value > 10_000_000_000_000_000) return value / 1_000_000;
    if (value > 10_000_000_000_000) return value / 1_000;
    return value < 1_000_000_000_000 ? value * 1000 : value;
  };
  if (typeof raw === "number") return normalizeNumeric(raw);
  if (typeof raw === "string") {
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) return normalizeNumeric(numeric);
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

function candleStartMs(timestampMs, tf) {
  const date = new Date(timestampMs);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  if (tf.interval === "daily") {
    return Date.UTC(year, month, day);
  }

  const hour = date.getUTCHours();
  if (tf.interval === "hourly") {
    return Date.UTC(year, month, day, Math.floor(hour / tf.period) * tf.period, 0, 0, 0);
  }

  const minute = date.getUTCMinutes();
  return Date.UTC(year, month, day, hour, Math.floor(minute / tf.period) * tf.period, 0, 0);
}

function isMarketOpenAt(timestampMs, marketId) {
  if (marketId === "CRYPTO") return true;

  const date = new Date(timestampMs);
  const day = date.getUTCDay();
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes();

  if (marketId === "STOCKS") {
    return day >= 1 && day <= 5 && minutes >= 14 * 60 + 30 && minutes < 21 * 60;
  }

  if (day === 6) return false;
  if (day === 0) return minutes >= 21 * 60;
  if (day === 5) return minutes < 22 * 60;
  return true;
}

function subtractMarketHours(end, hours, marketId) {
  if (marketId === "CRYPTO") {
    return new Date(end.getTime() - hours * MS_PER_HOUR);
  }

  let cursor = end.getTime();
  let remaining = hours * MS_PER_HOUR;
  let guard = 0;
  const maxSteps = Math.ceil((hours * 3 + 24 * 14) * MS_PER_HOUR / MARKET_LOOKBACK_STEP_MS);

  while (remaining > 0 && guard < maxSteps) {
    cursor -= MARKET_LOOKBACK_STEP_MS;
    if (isMarketOpenAt(cursor, marketId)) {
      remaining -= MARKET_LOOKBACK_STEP_MS;
    }
    guard += 1;
  }

  return new Date(cursor);
}

function getFetchStart(end, hours, marketId) {
  if (marketId !== "CRYPTO" && hours <= 48) {
    return subtractMarketHours(end, hours, marketId);
  }
  return new Date(end.getTime() - hours * MS_PER_HOUR);
}

/* ── Main ────────────────────────────────────────────────────────────────── */
export default function TradingPortal() {
  const chartRef = useRef(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const validMarketIds = MARKETS.map(m => m.id);
  const validTfLabels  = TIMEFRAMES.map(t => t.label);

  const [activeMarketId, setActiveMarketId] = usePersistedState(
    "fx_market", "GLOBAL",
    (v) => validMarketIds.includes(v)
  );
  const activeMarket = MARKETS.find(m => m.id === activeMarketId);

  // Initialise symbol from ?symbol= URL param if present
  const urlSymbol = searchParams.get("symbol");
  const [activeSymSym, setActiveSymSym] = usePersistedState(
    "fx_symbol",
    "EURUSD",
    (v) => typeof v === "string" && v.length > 0
  );

  // Sync URL param when symbol is set from URL on first load or refresh
  useEffect(() => {
    if (urlSymbol && urlSymbol !== activeSymSym) {
      setActiveSymSym(urlSymbol);
    }
  }, [urlSymbol, activeSymSym, setActiveSymSym]);

  // Resolve stored sym string back to the full symbol object (may be in any market)
  const activeSym = (() => {
    for (const m of MARKETS) {
      const found = m.symbols.find(s => s.sym === activeSymSym);
      if (found) return found;
    }
    if (urlSymbol) {
      for (const m of MARKETS) {
        const found = m.symbols.find(s => s.sym === urlSymbol);
        if (found) return found;
      }
    }
    return activeMarket.symbols[0];
  })();
  const liveSymbols = useMemo(
    () => activeSym.wsSym ? [activeSym.sym, activeSym.wsSym] : [activeSym.sym],
    [activeSym.sym, activeSym.wsSym]
  );
  const { ticks: liveTicks, ladders: liveLadders, hasLadder } = useSharedMarketData(liveSymbols);
  const liveTick = liveTicks[activeSym.sym];
  const liveLadder = liveLadders?.[activeSym.sym];

  const setActiveSym = (symObj) => {
    setActiveSymSym(symObj.sym);
    setSearchParams({ symbol: symObj.sym }, { replace: true });
  };

  const [tfLabel, setTfLabel] = usePersistedState(
    "fx_tf", TIMEFRAMES[6].label,
    (v) => validTfLabels.includes(v)
  );
  const tf    = TIMEFRAMES.find(t => t.label === tfLabel) ?? TIMEFRAMES[6];
  const setTf = (tfObj) => setTfLabel(tfObj.label);

  const [chartData,  setChartData]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [tickerOpen, setTickerOpen] = useState(false);
  // DOM / Heatmap user toggles (persisted)
  const [domEnabled, setDomEnabled] = usePersistedState("fx_dom_enabled", true, v => typeof v === "boolean");
  const [heatmapEnabled, setHeatmapEnabled] = usePersistedState("fx_heatmap_enabled", true, v => typeof v === "boolean");
  // Multi-chart layout: "1x1" | "2x1" | "1x2" | "2x2"
  const [layoutMode, setLayoutMode] = usePersistedState(
    "fx_layout_mode", "1x1",
    v => ["1x1", "2x1", "1x2", "2x2"].includes(v)
  );
  // Which slot is "focused" in multi-chart — its mini toolbar shows in main TopBar
  const [focusedSlot, setFocusedSlot] = useState(0);
  // Settings modal open/close
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Store range presets per timeframe label
  // Key format: "fx_range_hours_<tfLabel>" e.g. "fx_range_hours_1H"
  const [rangeHours, setRangeHours] = usePersistedState(
    getRangeKey(tfLabel),
    clampRangeForTimeframe(tf, DEFAULT_RANGE_HOURS[tf.interval] ?? 24),
    (v) => typeof v === "number" && v > 0 && v <= (MAX_WINDOW_HOURS[tf.interval] ?? 48)
  );

  // anchorEnd: null = live (end = now), otherwise a timestamp (ms)
  // Null is stored as 0 in localStorage
  const [anchorEndMs, setAnchorEndMs] = usePersistedState(
    "fx_anchor_end", 0,
    (v) => typeof v === "number"
  );
  const anchorEnd = useMemo(() => anchorEndMs ? new Date(anchorEndMs) : null, [anchorEndMs]);
  const setAnchorEnd = (d) => setAnchorEndMs(d ? d.getTime() : 0);

  // When market changes reset to first symbol
  const handleMarketChange = (marketId) => {
    const market = MARKETS.find(m => m.id === marketId);
    setActiveMarketId(marketId);
    setActiveSymSym(market.symbols[0].sym);
  };

  // When TF changes: keep the persisted range for that specific TF.
  // If it's a new TF (never been selected), it will auto-load its default.
  const handleTfChange = (newTf) => {
    const nextRange = clampRangeForTimeframe(newTf, readStoredRange(newTf));
    saveStoredRange(newTf, nextRange);
    setTf(newTf);
    setRangeHours(nextRange);
  };

  // When range changes: also clamp to API max
  const handleRangeChange = (hours) => {
    const nextTf = pickTimeframeForRange(tf, hours);
    const nextRange = clampRangeForTimeframe(nextTf, hours);
    saveStoredRange(nextTf, nextRange);
    if (nextTf.label !== tf.label) setTf(nextTf);
    setRangeHours(nextRange);
  };



  /* ── Parse API quotes to chart bar objects ───────────────────────────── */
  const parseQuotes = (quotes) => quotes.map((q) => ({
    t: new Date(q.date.replace(/(\d{4}-\d{2}-\d{2})[-\s](\d{2}:\d{2})(?::\d{2})?/, "$1T$2:00Z")).getTime(),
    o: Number(q.open),
    h: Number(q.high),
    l: Number(q.low),
    c: Number(q.close),
  }));

  /* ── Full fetch (initial load / key change) ──────────────────────────── */
  useEffect(() => {
    let cancelled = false;

    const fetchCandles = async () => {
      // Cache TTL: 5 min for minute, 30 min for hourly, 6 h for daily
      const cacheTTL = anchorEnd ? 24 * MS_PER_HOUR
                     : tf.interval === "daily" ? 6 * MS_PER_HOUR
                     : tf.interval === "hourly" ? 30 * 60_000
                     : 5 * 60_000;
      const anchorKey = anchorEnd ? String(anchorEnd.getTime()) : "live";

      const cached = getCachedTimeseries(activeSym.sym, tf.label, rangeHours, anchorKey);
      if (cached && (Date.now() - cached.lastFetch) < cacheTTL) {
        if (!cancelled) { setChartData(cached.data); setLoading(false); }
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const isIntraday = tf.interval !== "daily";
        const isCrypto   = activeMarket.id === "CRYPTO";
        const now        = new Date();

        const maxH = MAX_WINDOW_HOURS[tf.interval] ?? 48;
        const clampedRange = Math.min(rangeHours, maxH);

        let end   = anchorEnd ? new Date(anchorEnd.getTime()) : new Date(now.getTime());
        if (end > now) end = new Date(now.getTime());
        const start = getFetchStart(end, clampedRange, activeMarket.id);

        const weekendParam = isCrypto ? "&weekend=true"
                           : tf.interval !== "daily" ? "&weekend=false"
                           : "";

        const url =
          `/api/timeseries` +
          `?currency=${activeSym.sym}` +
          `&start_date=${formatTMDate(start, isIntraday)}` +
          `&end_date=${formatTMDate(end, isIntraday)}` +
          `&interval=${tf.interval}&period=${tf.period}` +
          `&format=records${weekendParam}`;

        const res  = await fetch(url);
        const json = await res.json();

        if (!res.ok)                     throw new Error(json?.error || `HTTP ${res.status}`);
        if (json.error)                  throw new Error(json.error);
        if (!Array.isArray(json.quotes)) throw new Error("No quotes returned from API");

        const newData = parseQuotes(json.quotes);

        if (!cancelled) {
          setChartData(newData);
          setCachedTimeseries(activeSym.sym, tf.label, rangeHours, anchorKey, newData);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to load chart data");
          setChartData([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchCandles();
    return () => { cancelled = true; };
  }, [activeSym.sym, tf, activeMarket, rangeHours, anchorEnd]);

  /* ── Poll last bar every 30 s (live intraday only) ───────────────────── */
  useEffect(() => {
    // Only poll in live mode for intraday timeframes
    if (anchorEnd || tf.interval === "daily") return;

    const isCrypto = activeMarket.id === "CRYPTO";
    // Fetch last 2 periods to capture a forming bar + the bar before it
    const lookbackMs = tf.period * 2 * (tf.interval === "hourly" ? 3_600_000 : 60_000);
    const weekendParam = isCrypto ? "&weekend=true" : "&weekend=false";

    const poll = async () => {
      try {
        const now   = new Date();
        const start = new Date(now.getTime() - lookbackMs);
        const url =
          `/api/timeseries` +
          `?currency=${activeSym.sym}` +
          `&start_date=${formatTMDate(start, true)}` +
          `&end_date=${formatTMDate(now, true)}` +
          `&interval=${tf.interval}&period=${tf.period}` +
          `&format=records${weekendParam}`;

        const res  = await fetch(url);
        if (!res.ok) return;
        const json = await res.json();
        if (!Array.isArray(json.quotes) || json.quotes.length === 0) return;

        const incoming = parseQuotes(json.quotes);

        setChartData((prev) => {
          if (prev.length === 0) return prev;

          let next = [...prev];
          for (const bar of incoming) {
            const idx = next.findIndex((b) => b.t === bar.t);
            if (idx >= 0) {
              // Update existing bar (still forming)
              next[idx] = bar;
            } else if (bar.t > next[next.length - 1].t) {
              // New minute rolled — append
              next.push(bar);
            }
          }

          setCachedTimeseries(activeSym.sym, tf.label, rangeHours, "live", next);
          return next;
        });
      } catch { /* silent - don't disrupt chart on poll failure */ }
    };

    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, [activeSym.sym, tf, activeMarket, rangeHours, anchorEnd]);

  /* ── Infinite history (load older candles when user drags left) ─────── */
  const [loadingHistory, setLoadingHistory] = useState(false);
  const historyExhaustedRef = useRef(false);
  const historyInFlightRef = useRef(false);

  // Reset exhausted/in-flight when key parameters change
  useEffect(() => {
    historyExhaustedRef.current = false;
    historyInFlightRef.current = false;
    setLoadingHistory(false);
  }, [activeSym.sym, tf, anchorEnd]);

  const loadMoreHistory = async (beforeTimestampMs) => {
    if (historyExhaustedRef.current || historyInFlightRef.current) return;
    if (!Number.isFinite(beforeTimestampMs)) return;
    historyInFlightRef.current = true;
    setLoadingHistory(true);

    try {
      const isIntraday = tf.interval !== "daily";
      const isCrypto = activeMarket.id === "CRYPTO";
      const maxH = MAX_WINDOW_HOURS[tf.interval] ?? 48;
      // Fetch one full max-window worth of older data per request.
      const end = new Date(beforeTimestampMs - 1000); // 1s before the oldest candle
      const start = new Date(end.getTime() - maxH * MS_PER_HOUR);

      const weekendParam = isCrypto ? "&weekend=true"
                         : tf.interval !== "daily" ? "&weekend=false"
                         : "";
      const url =
        `/api/timeseries` +
        `?currency=${activeSym.sym}` +
        `&start_date=${formatTMDate(start, isIntraday)}` +
        `&end_date=${formatTMDate(end, isIntraday)}` +
        `&interval=${tf.interval}&period=${tf.period}` +
        `&format=records${weekendParam}`;

      const res = await fetch(url);
      if (!res.ok) { historyExhaustedRef.current = true; return; }
      const json = await res.json();
      if (json?.error || !Array.isArray(json.quotes) || json.quotes.length === 0) {
        historyExhaustedRef.current = true;
        return;
      }

      const older = parseQuotes(json.quotes);
      if (older.length === 0) {
        historyExhaustedRef.current = true;
        return;
      }

      setChartData((prev) => {
        if (prev.length === 0) return older;
        const cutoff = prev[0].t;
        // Only keep bars strictly older than the current first bar (dedupe).
        const filtered = older.filter((bar) => bar.t < cutoff);
        if (filtered.length === 0) {
          historyExhaustedRef.current = true;
          return prev;
        }
        return [...filtered, ...prev];
      });
    } catch {
      // Don't mark exhausted on a network blip — let the user try again next pan
    } finally {
      historyInFlightRef.current = false;
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (anchorEnd || loading || error || !liveTick) return;

    const price = tickPrice(liveTick);
    if (price == null) return;

    const bucketStart = candleStartMs(tickTimestampMs(liveTick), tf);
    const currentBucketStart = candleStartMs(Date.now(), tf);
    if (bucketStart > currentBucketStart) return;

    setChartData((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];

      // Tick belongs to an already-closed bar (older bucket) → ignore.
      if (bucketStart < last.t) return prev;

      const next = [...prev];
      if (bucketStart === last.t) {
        // Same forming bucket → always emit a new object so the chart re-renders
        // even when only the close moves by a single pip (tick crawl on illiquid pairs).
        const updated = {
          ...last,
          h: Math.max(last.h, price),
          l: Math.min(last.l, price),
          c: price,
        };
        next[next.length - 1] = updated;
        return next;
      }

      // New bucket has started — push a fresh candle.
      next.push({ t: bucketStart, o: price, h: price, l: price, c: price });
      return next;
    });
  }, [anchorEnd, error, liveTick, loading, tf]);

  const last = chartData[chartData.length - 1] ?? null;
  const blockingLoad = loading && chartData.length === 0;
  const backgroundLoad = loading && chartData.length > 0;

  return (
    <>
      <GlobalStyles />

      <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--bg-base)]">

        {/* NavBar */}
        <NavBar activeMarket={activeMarketId} onMarketChange={handleMarketChange} />

        {/* TopBar — hidden in multi-chart mode (each cell has its own mini-toolbar) */}
        {layoutMode === "1x1" && (
          <TopBar
            pairs={activeMarket.symbols}
            timeframes={TIMEFRAMES}
            activeSym={activeSym}
            onSymChange={setActiveSym}
            tf={tf}
            onTfChange={handleTfChange}
            lastCandle={last}
            decimals={activeSym.decimals ?? 5}
            chartRef={chartRef}
            rangeHours={rangeHours}
            onRangeChange={handleRangeChange}
            anchorEnd={anchorEnd}
            onAnchorChange={setAnchorEnd}
            displayWindowStart={chartData[0] ? new Date(chartData[0].t) : null}
          />
        )}

        {/* Layout selector — picks how many independent charts to show */}
        <div className="flex h-8 shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-panel)] px-4">
          <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-dim)]">
            Layout
          </span>
          {[
            { id: "1x1", label: "▢",   title: "Single chart" },
            { id: "2x1", label: "◫",   title: "2 columns" },
            { id: "1x2", label: "⊟",   title: "2 rows" },
            { id: "2x2", label: "⊞",   title: "2x2 grid" },
          ].map((opt) => {
            const active = layoutMode === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => setLayoutMode(opt.id)}
                title={opt.title}
                className={`flex h-6 w-7 items-center justify-center rounded border font-mono text-[12px]
                            transition-colors duration-150
                            ${active
                              ? "border-[var(--blue)] bg-[var(--blue)]/15 text-[var(--blue)]"
                              : "border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-dim)] hover:text-[var(--text-secondary)]"}`}
              >
                {opt.label}
              </button>
            );
          })}
          {layoutMode !== "1x1" && (
            <span className="ml-2 font-mono text-[9px] uppercase tracking-wider text-[var(--text-dim)]">
              · Click a cell to focus, or single-chart mode for full toolbar
            </span>
          )}

          {/* Settings (candle colors, theme) — pushed to the right */}
          <button
            onClick={() => setSettingsOpen(true)}
            title="Chart settings · candle colors, theme"
            className="ml-auto flex h-6 items-center gap-1.5 rounded border border-[var(--border)]
                       bg-[var(--bg-card)] px-2 font-mono text-[9px] font-bold uppercase tracking-wider
                       text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:border-[var(--blue)]"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Settings
          </button>
        </div>

        {/* Settings modal (candle colors, theme) */}
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

        {/* Body */}
        <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">

          {/* Chart column */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">

            {/* Chart area */}
            <div className="relative min-h-0 flex-1 overflow-hidden">

              {blockingLoad && (
                <div className="absolute inset-0 z-50 flex flex-col items-center
                                justify-center gap-3.5 bg-[var(--overlay)]">
                  <div
                    className="h-[28px] w-[28px] rounded-full
                               border-2 border-[var(--bg-card)] border-t-[var(--blue)]"
                    style={{ animation: "spin 0.7s linear infinite" }}
                  />
                  <span className="font-mono text-[11px] text-[var(--blue)]">
                    {activeSym.sym} · {tf.label}
                  </span>
                </div>
              )}

              {backgroundLoad && (
                <div className="absolute left-1/2 top-4 z-50 flex -translate-x-1/2 items-center gap-2
                                rounded border border-[var(--border-bright)] bg-[var(--bg-panel)]/95 px-3 py-1.5
                                shadow-lg shadow-black/20">
                  <div
                    className="h-3.5 w-3.5 rounded-full border-2 border-[var(--border-bright)] border-t-[var(--blue)]"
                    style={{ animation: "spin 0.7s linear infinite" }}
                  />
                  <span className="font-mono text-[10px] text-[var(--blue)]">
                    Updating {activeSym.sym} · {tf.label}
                  </span>
                </div>
              )}

              {error && !loading && (
                <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-2">
                  <span className="font-mono text-[13px] text-[var(--red)]">{error}</span>
                  <span className="font-mono text-[10px] text-[var(--text-dim)]">Check API key or symbol availability</span>
                </div>
              )}

              {!error && chartData.length > 0 && layoutMode === "1x1" && (
                <div className="absolute inset-0">
                  <CandleChart
                    ref={chartRef}
                    data={chartData}
                    chartKey={`${activeSym.sym}-${tf.label}`}
                    symbol={activeSym.sym}
                    decimals={activeSym.decimals ?? 5}
                    onLoadMoreHistory={loadMoreHistory}
                    ladder={heatmapEnabled && hasLadder ? liveLadder : null}
                  />
                </div>
              )}

              {/* Multi-chart grid (independent cells, each with own symbol/TF) */}
              {layoutMode !== "1x1" && (
                <div
                  className="absolute inset-0 grid gap-1 bg-[var(--bg-base)] p-1"
                  style={{
                    gridTemplateColumns: layoutMode === "2x1" || layoutMode === "2x2" ? "1fr 1fr" : "1fr",
                    gridTemplateRows:    layoutMode === "1x2" || layoutMode === "2x2" ? "1fr 1fr" : "1fr",
                  }}
                >
                  {Array.from({
                    length: layoutMode === "2x2" ? 4 : layoutMode === "1x1" ? 1 : 2,
                  }).map((_, i) => (
                    <ChartCell
                      key={i}
                      cellId={`slot${i}`}
                      defaultSymbol={i === 0 ? "EURUSD" : i === 1 ? "GBPUSD" : i === 2 ? "USDJPY" : "AUDUSD"}
                      defaultTfLabel={tf.label}
                      defaultRangeHours={rangeHours}
                      focused={focusedSlot === i}
                      onFocus={() => setFocusedSlot(i)}
                    />
                  ))}
                </div>
              )}

              {/* Ladder feature toggles — only visible when account has trader_ladder.
                  Positioned to the left of the Highcharts hamburger/export menu. */}
              {hasLadder && (
                <div className="absolute right-12 top-3 z-40 flex items-center gap-1">
                  <button
                    onClick={() => setDomEnabled(v => !v)}
                    title="Toggle Depth-of-Market panel"
                    className={`rounded border px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wider
                                transition-colors duration-150
                                ${domEnabled
                                  ? "border-[var(--blue)] bg-[var(--blue)]/15 text-[var(--blue)]"
                                  : "border-[var(--border)] bg-[var(--bg-card)]/95 text-[var(--text-dim)] hover:text-[var(--text-secondary)]"}`}
                  >
                    DOM {domEnabled ? "ON" : "OFF"}
                  </button>
                  <button
                    onClick={() => setHeatmapEnabled(v => !v)}
                    title="Toggle liquidity heatmap on chart"
                    className={`rounded border px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wider
                                transition-colors duration-150
                                ${heatmapEnabled
                                  ? "border-[var(--blue)] bg-[var(--blue)]/15 text-[var(--blue)]"
                                  : "border-[var(--border)] bg-[var(--bg-card)]/95 text-[var(--text-dim)] hover:text-[var(--text-secondary)]"}`}
                  >
                    Heatmap {heatmapEnabled ? "ON" : "OFF"}
                  </button>
                </div>
              )}

              {loadingHistory && (
                <div className="absolute left-3 top-1/2 z-40 flex -translate-y-1/2 items-center gap-2
                                rounded border border-[var(--border-bright)] bg-[var(--bg-panel)]/95 px-2.5 py-1.5
                                shadow-lg shadow-black/20 pointer-events-none">
                  <div
                    className="h-3 w-3 rounded-full border-2 border-[var(--border-bright)] border-t-[var(--blue)]"
                    style={{ animation: "spin 0.7s linear infinite" }}
                  />
                  <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--blue)]">
                    Loading history…
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Right sidebar */}
          <div
            className={`
              flex flex-col overflow-hidden
              border-l border-[var(--border)] bg-[var(--bg-panel)]
              transition-all duration-300 ease-in-out
              absolute inset-y-0 right-0 z-30 w-[220px]
              ${tickerOpen ? "translate-x-0" : "translate-x-full"}
              md:relative md:z-auto md:w-[220px] md:translate-x-0
            `}
          >
            <div className="flex-1 overflow-hidden">
              <RightSidebar
                activeMarketId={activeMarketId}
                selectedSymbol={activeSym.sym}
                selectedDecimals={activeSym.decimals ?? 5}
                domEnabled={domEnabled && hasLadder}
              />
            </div>
          </div>

          {/* Mobile backdrop */}
          {tickerOpen && (
            <div
              className="absolute inset-0 z-20 bg-black/50 md:hidden"
              onClick={() => setTickerOpen(false)}
            />
          )}
        </div>

        {/* Status bar */}
        <StatusBar symbol={activeSym.sym} tf={tf} market={activeMarket} />

        {/* Mobile FAB */}
        <button
          onClick={() => setTickerOpen(true)}
          className={`
            fixed bottom-10 right-4 z-40 flex h-11 w-11 items-center justify-center
            rounded-full bg-[var(--blue)] text-white shadow-lg shadow-[var(--blue)]/30
            transition-all duration-200 active:scale-95 md:hidden
            ${tickerOpen ? "opacity-0 pointer-events-none" : "opacity-100"}
          `}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M3 5h12M3 9h12M3 13h7" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </>
  );
}
