import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import GlobalStyles  from "../styles/GlobalStyles.jsx";
import NavBar        from "./NavBar.jsx";
import TopBar        from "./TopBar.jsx";
import CandleChart   from "./CandleChart.jsx";
import StatusBar     from "./StatusBar.jsx";
import RightSidebar  from "./RightSidebar.jsx";
import SettingsModal  from "./SettingsModal.jsx";
import { MARKETS, TIMEFRAMES } from "../constants/constants.jsx";
import { usePersistedState } from "../hooks/usePersistedState.js";
import { useSharedMarketData } from "../context/MarketDataContext.jsx";
import { MAX_WINDOW_HOURS, DEFAULT_RANGE_HOURS } from "./TopBar.jsx";

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const MARKET_LOOKBACK_STEP_MS = 15 * 60_000;
const EMPTY_WINDOW_BACKTRACK_ATTEMPTS = 5;
const CANDLE_CLOSE_REST_DELAY_MS = 1500;
const CANDLE_CLOSE_REST_RETRY_DELAYS_MS = [8_000, 20_000, 40_000, 65_000, 90_000];
const CANDLE_CORRECTION_POLL_MS = 15_000;
const CACHE_VERSION = "v13";
const FX_INTRADAY_MAX_HOURS = 48;
const INDICATOR_WARMUP_BARS = 0;

/* ── Cache helpers ───────────────────────────────────────────────────────── */
const getCacheKey = (sym, tfLabel, rangeHours, anchorKey = "live") =>
  `fx_cache_${CACHE_VERSION}_${sym}_${tfLabel}_${rangeHours}_${anchorKey}`;

const isValidCandle = (bar) => (
  bar &&
  Number.isFinite(bar.t) &&
  ["o", "h", "l", "c"].every((key) => Number.isFinite(bar[key]) && bar[key] > 0)
);

const getCachedTimeseries = (sym, tfLabel, rangeHours, anchorKey) => {
  try {
    const raw = sessionStorage.getItem(getCacheKey(sym, tfLabel, rangeHours, anchorKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      Array.isArray(parsed.data) &&
      parsed.data.length > 0 &&
      parsed.data.every(isValidCandle) &&
      typeof parsed.lastFetch === "number"
    ) {
      return parsed;
    }
  } catch { /* ignore */ }
  return null;
};

const setCachedTimeseries = (sym, tfLabel, rangeHours, anchorKey, payload) => {
  try {
    const next = Array.isArray(payload) ? { data: payload } : payload;
    sessionStorage.setItem(
      getCacheKey(sym, tfLabel, rangeHours, anchorKey),
      JSON.stringify({ ...next, lastFetch: Date.now() })
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

function getMaxWindowHours(tfObj, marketId) {
  if (marketId === "GLOBAL") {
    if (tfObj.interval === "minute") {
      return tfObj.period <= 5 ? 48 : 168;
    }
    if (tfObj.interval === "hourly") {
      return tfObj.period === 1 ? 336 : 720;
    }
  }
  return MAX_WINDOW_HOURS[tfObj.interval] ?? 48;
}

function clampRangeForTimeframe(tfObj, hours, marketId = "CRYPTO") {
  const max = getMaxWindowHours(tfObj, marketId);
  const min = MIN_RANGE_HOURS[tfObj.interval] ?? 0;
  const fallback = DEFAULT_RANGE_HOURS[tfObj.interval] ?? max;
  const clamped = Math.min(hours, max);
  return min > 0 && clamped < min ? Math.min(fallback, max) : clamped;
}

function getIndicatorWarmupHours(tfObj, rangeHours, marketId) {
  const max = getMaxWindowHours(tfObj, marketId);
  const room = Math.max(0, max - rangeHours);
  if (room <= 0) return 0;
  return Math.min(timeframeHours(tfObj) * INDICATOR_WARMUP_BARS, room);
}

function pickTimeframeForRange(currentTf, hours, marketId) {
  const currentMax = getMaxWindowHours(currentTf, marketId);
  const currentCandles = hours / timeframeHours(currentTf);
  if (hours <= currentMax && currentCandles >= MIN_CANDLES_PER_WINDOW) return currentTf;

  const candidates = TIMEFRAMES.filter((candidate) => {
    const max = getMaxWindowHours(candidate, marketId);
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

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function floorToUtcHour(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), 0, 0, 0));
}

function ceilToUtcHour(date) {
  const floored = floorToUtcHour(date);
  return floored.getTime() === date.getTime()
    ? floored
    : new Date(floored.getTime() + MS_PER_HOUR);
}

function tickPrice(tick) {
  const price = tick?.mid ?? (
    tick?.bid != null && tick?.ask != null
      ? (tick.bid + tick.ask) / 2
      : tick?.bid ?? tick?.ask
  );
  return Number.isFinite(price) ? Number(price) : null;
}

function isChartTick(tick) {
  return tick?.source !== "rest_live";
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

function tickReceivedAtMs(tick) {
  return Number.isFinite(tick?.receivedAt) ? tick.receivedAt : tickTimestampMs(tick);
}

function freshTickPriceForBucket(tick, tf, bucketStart) {
  if (!isChartTick(tick)) return null;

  const price = tickPrice(tick);
  if (price == null) return null;

  const receivedBucketStart = candleStartMs(tickReceivedAtMs(tick), tf);
  return receivedBucketStart >= bucketStart ? price : null;
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

function timeframeMs(tf) {
  if (tf.interval === "daily") return tf.period * MS_PER_DAY;
  if (tf.interval === "hourly") return tf.period * MS_PER_HOUR;
  return tf.period * 60_000;
}

function nextCandleBoundaryMs(timestampMs, tf) {
  return candleStartMs(timestampMs, tf) + timeframeMs(tf);
}

function candleFromTick(tick, tf) {
  if (!isChartTick(tick)) return null;

  const price = tickPrice(tick);
  if (price == null) return null;

  const sourceBucketStart = candleStartMs(tickTimestampMs(tick), tf);
  const receivedAt = tickReceivedAtMs(tick);
  const receivedBucketStart = candleStartMs(receivedAt, tf);
  const currentBucketStart = candleStartMs(Date.now(), tf);
  if (sourceBucketStart > currentBucketStart) return null;

  // Around candle boundaries the upstream tick timestamp can lag by a few
  // seconds. Use the browser receipt bucket for live rendering so a new candle
  // starts on time; the REST close poll corrects final OHLC shortly after.
  const bucketStart = Math.max(sourceBucketStart, receivedBucketStart);

  return { t: bucketStart, o: price, h: price, l: price, c: price };
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

function getFetchStart(end, hours, marketId, options = {}) {
  if (options.alignOneDayToUtcDay && hours <= 24 && end.getUTCHours() >= 12) {
    return startOfUtcDay(end);
  }

  const rawStart = marketId !== "CRYPTO" && hours <= 48
    ? subtractMarketHours(end, hours, marketId)
    : new Date(end.getTime() - hours * MS_PER_HOUR);

  return ceilToUtcHour(rawStart);
}

function getFetchEnd(end, marketId) {
  if (marketId === "CRYPTO" || isMarketOpenAt(end.getTime(), marketId)) {
    return end;
  }

  let cursor = end.getTime();
  const maxSteps = 7 * 24 * 60;
  for (let step = 0; step < maxSteps; step += 1) {
    cursor -= 60_000;
    if (isMarketOpenAt(cursor, marketId)) {
      return new Date(cursor);
    }
  }

  return end;
}

function normalizeSymbol(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function findMarketSymbol(value) {
  const symbol = normalizeSymbol(value);
  if (!symbol) return null;

  for (const market of MARKETS) {
    const found = market.symbols.find((item) => item.sym === symbol || item.wsSym === symbol);
    if (found) return { market, symbol: found };
  }
  return null;
}

function parseQuoteTimestampMs(value) {
  if (value == null) return null;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
  }

  const normalized = raw.includes("T")
    ? raw
    : /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? `${raw}T00:00:00Z`
      : raw.replace(/^(\d{4}-\d{2}-\d{2})[-\s](\d{2}:\d{2})(?::\d{2})?$/, "$1T$2:00Z");

  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function quoteDisplayTimeMs(timestampMs, tfObj) {
  if (!Number.isFinite(timestampMs) || tfObj.interval === "daily") return timestampMs;
  return timestampMs - timeframeMs(tfObj);
}

function parseQuotes(quotes, tfObj) {
  return quotes
    .map((q) => {
      const rawTime = parseQuoteTimestampMs(q.date ?? q.timestamp ?? q.time);
      const t = quoteDisplayTimeMs(rawTime, tfObj);
      let o = Number(q.open);
      const h = Number(q.high);
      const l = Number(q.low);
      const c = Number(q.close);
      if (!Number.isFinite(o) || o <= 0) {
        o = [c, h, l].find((value) => Number.isFinite(value) && value > 0);
      }
      if (![t, o, h, l, c].every(Number.isFinite)) return null;
      if ([o, h, l, c].some((value) => value <= 0)) return null;
      return { t, o, h, l, c };
    })
    .filter(Boolean);
}

async function fetchJson(url) {
  const res = await fetch(url);
  const json = await res.json();

  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  if (json.error) throw new Error(json.error);
  if (!Array.isArray(json.quotes)) throw new Error("No quotes returned from API");

  return json;
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
  const storedMarket = MARKETS.find(m => m.id === activeMarketId) ?? MARKETS[0];

  // Initialise symbol from ?symbol= URL param if present
  const urlSymbol = normalizeSymbol(searchParams.get("symbol"));
  const [activeSymSym, setActiveSymSym] = usePersistedState(
    "fx_symbol",
    "EURUSD",
    (v) => typeof v === "string" && v.length > 0
  );

  // Read URL param ONCE on mount and copy into state. After that, state is
  // the source of truth and the URL is just a reflection of state (updated
  // by handleMarketChange / setActiveSym). This eliminates the race condition
  // where clicking a tab made state update faster than URL, then the URL
  // would arrive a tick later and overwrite the user's choice.
  const didInitFromUrlRef = useRef(false);
  useEffect(() => {
    if (didInitFromUrlRef.current) return;
    didInitFromUrlRef.current = true;
    const resolvedUrl = findMarketSymbol(urlSymbol);
    if (resolvedUrl && resolvedUrl.symbol.sym !== activeSymSym) {
      setActiveSymSym(resolvedUrl.symbol.sym);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // STATE is the source of truth now — resolve the active symbol/market from
  // activeSymSym (which click handlers update directly).
  const resolvedActive = findMarketSymbol(activeSymSym);
  const activeMarket = resolvedActive?.market ?? storedMarket;
  const activeSym = resolvedActive?.symbol ?? activeMarket.symbols[0];

  // Keep activeMarketId in sync with the actual market the symbol belongs to.
  useEffect(() => {
    if (activeMarket.id !== activeMarketId) {
      setActiveMarketId(activeMarket.id);
    }
  }, [activeMarket.id, activeMarketId, setActiveMarketId]);

  const liveSymbols = useMemo(
    () => activeSym.wsSym ? [activeSym.sym, activeSym.wsSym] : [activeSym.sym],
    [activeSym.sym, activeSym.wsSym]
  );
  const { ticks: liveTicks } = useSharedMarketData(liveSymbols);
  const liveTick = liveTicks[activeSym.sym];
  const liveTickRef = useRef(null);
  const restAuthoritativeCandlesRef = useRef(new Set());

  useEffect(() => {
    liveTickRef.current = liveTick;
  }, [liveTick]);

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
  const [chartWindowStartMs, setChartWindowStartMs] = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [tickerOpen, setTickerOpen] = useState(false);
  // Settings modal open/close
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Store range presets per timeframe label
  // Key format: "fx_range_hours_<tfLabel>" e.g. "fx_range_hours_1H"
  const [rangeHours, setRangeHours] = usePersistedState(
    getRangeKey(tfLabel),
    clampRangeForTimeframe(tf, DEFAULT_RANGE_HOURS[tf.interval] ?? 24, activeMarket.id),
    (v) => typeof v === "number" && v > 0 && v <= getMaxWindowHours(tf, activeMarket.id)
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
    if (!market) return;
    const nextSymbol = market.symbols[0].sym;
    setActiveMarketId(marketId);
    setActiveSymSym(nextSymbol);
    setSearchParams({ symbol: nextSymbol }, { replace: true });
  };

  // When TF changes: keep the persisted range for that specific TF.
  // If it's a new TF (never been selected), it will auto-load its default.
  const handleTfChange = (newTf) => {
    const nextRange = clampRangeForTimeframe(newTf, readStoredRange(newTf), activeMarket.id);
    saveStoredRange(newTf, nextRange);
    setTf(newTf);
    setRangeHours(nextRange);
  };

  // When range changes: also clamp to API max
  const handleRangeChange = (hours) => {
    const nextTf = pickTimeframeForRange(tf, hours, activeMarket.id);
    const nextRange = clampRangeForTimeframe(nextTf, hours, activeMarket.id);
    saveStoredRange(nextTf, nextRange);
    if (nextTf.label !== tf.label) setTf(nextTf);
    setRangeHours(nextRange);
  };

  useEffect(() => {
    const max = getMaxWindowHours(tf, activeMarket.id);
    if (rangeHours <= max) return;

    const nextTf = pickTimeframeForRange(tf, rangeHours, activeMarket.id);
    const nextRange = clampRangeForTimeframe(nextTf, rangeHours, activeMarket.id);
    saveStoredRange(nextTf, nextRange);
    if (nextTf.label !== tf.label) {
      setTf(nextTf);
    }
    setRangeHours(nextRange);
  }, [activeMarket.id, tf, rangeHours]);



  /* ── Parse API quotes to chart bar objects ───────────────────────────── */
  // Track which symbol chartData belongs to — used to gate the chart render
  // so we never display data that doesn't match the current symbol prop.
  const [chartDataSymbol, setChartDataSymbol] = useState(null);
  const [chartReady, setChartReady] = useState(false);

  // Wipe stale candles when the chart identity changes so timeframe/range
  // switches show the loader instead of rendering the previous dataset.
  useEffect(() => {
    restAuthoritativeCandlesRef.current = new Set();
    setChartData([]);
    setChartDataSymbol(null);
    setChartWindowStartMs(null);
    setChartReady(false);
    setLoading(true);
    setError(null);
  }, [activeSym.sym, tf.label, rangeHours, anchorEndMs]);

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
        if (!cancelled) {
          const currentBucketStart = candleStartMs(Date.now(), tf);
          restAuthoritativeCandlesRef.current = new Set(
            cached.data
              .filter((bar) => Number.isFinite(bar?.t) && bar.t < currentBucketStart)
              .map((bar) => bar.t)
          );
          setChartReady(false);
          setChartData(cached.data);
          setChartDataSymbol(activeSym.sym);
          setChartWindowStartMs(cached.visibleStartMs ?? cached.data[0]?.t ?? null);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const isIntraday = tf.interval !== "daily";
        const isCrypto   = activeMarket.id === "CRYPTO";
        const now        = new Date();

        const maxH = getMaxWindowHours(tf, activeMarket.id);
        const clampedRange = Math.min(rangeHours, maxH);
        const warmupHours = getIndicatorWarmupHours(tf, clampedRange, activeMarket.id);
        const canBacktrackEmptyWindow = !isCrypto && clampedRange <= FX_INTRADAY_MAX_HOURS;

        const weekendParam = isCrypto ? "&weekend=true" : "";

        const buildUrl = (start, end) => (
          `/api/timeseries` +
          `?currency=${activeSym.sym}` +
          `&start_date=${formatTMDate(start, isIntraday)}` +
          `&end_date=${formatTMDate(end, isIntraday)}` +
          `&interval=${tf.interval}&period=${tf.period}` +
          `&format=records${weekendParam}`
        );

        let end = anchorEnd ? new Date(anchorEnd.getTime()) : new Date(now.getTime());
        if (end > now) end = new Date(now.getTime());
        end = getFetchEnd(end, activeMarket.id);
        const fetchStartOptions = {
          alignOneDayToUtcDay: !anchorEnd && clampedRange <= 24,
        };
        let visibleStart = getFetchStart(end, clampedRange, activeMarket.id, fetchStartOptions);
        let start = getFetchStart(end, clampedRange + warmupHours, activeMarket.id, fetchStartOptions);
        let newData = [];
        let lastEmptyError = "No valid quotes returned from API";

        for (let attempt = 0; attempt <= EMPTY_WINDOW_BACKTRACK_ATTEMPTS; attempt += 1) {
          const json = await fetchJson(buildUrl(start, end));
          newData = parseQuotes(json.quotes, tf);
          if (newData.length > 0) break;

          lastEmptyError = json.quotes.length === 0
            ? "No quotes returned for requested window"
            : "No valid quotes returned from API";

          if (!canBacktrackEmptyWindow || attempt === EMPTY_WINDOW_BACKTRACK_ATTEMPTS) break;

          end = getFetchEnd(new Date(visibleStart.getTime() - 60_000), activeMarket.id);
          visibleStart = getFetchStart(end, clampedRange, activeMarket.id, fetchStartOptions);
          start = getFetchStart(end, clampedRange + warmupHours, activeMarket.id, fetchStartOptions);
        }

        if (newData.length === 0) throw new Error(lastEmptyError);

        if (!cancelled) {
          const currentBucketStart = candleStartMs(Date.now(), tf);
          restAuthoritativeCandlesRef.current = new Set(
            newData
              .filter((bar) => Number.isFinite(bar?.t) && bar.t < currentBucketStart)
              .map((bar) => bar.t)
          );
          setChartReady(false);
          setChartData(newData);
          setChartDataSymbol(activeSym.sym);
          const visibleStartMs = visibleStart.getTime();
          setChartWindowStartMs(visibleStartMs);
          setTimeout(() => {
            if (!cancelled) {
              setCachedTimeseries(activeSym.sym, tf.label, rangeHours, anchorKey, {
                data: newData,
                visibleStartMs,
              });
            }
          }, 0);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to load chart data");
          setChartData([]);
          setChartDataSymbol(null);
          setChartWindowStartMs(null);
          setChartReady(false);
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
    // Only poll in live mode. Historical anchored charts should stay fixed.
    if (anchorEnd) return;

    const isCrypto = activeMarket.id === "CRYPTO";
    const isIntraday = tf.interval !== "daily";
    // TraderMade can publish a closed intraday candle up to ~60s late, so keep
    // re-checking several recent candles and let REST correct their OHLC.
    const lookbackMs = timeframeMs(tf) * (isIntraday ? 8 : 5);
    const weekendParam = isCrypto ? "&weekend=true" : "";
    let cancelled = false;
    const boundaryTimers = [];

    const ensureCurrentBucket = () => {
      const currentBucketStart = candleStartMs(Date.now(), tf);
      setChartData((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        if (!Number.isFinite(last?.t) || currentBucketStart <= last.t) return prev;

        const price = freshTickPriceForBucket(liveTickRef.current, tf, currentBucketStart);
        if (!Number.isFinite(price) || price <= 0) return prev;

        return [
          ...prev,
          { t: currentBucketStart, o: price, h: price, l: price, c: price },
        ];
      });
    };

    const poll = async () => {
      try {
        if (cancelled) return;
        const now   = new Date();
        const start = floorToUtcHour(new Date(now.getTime() - lookbackMs));
        const url =
          `/api/timeseries` +
          `?currency=${activeSym.sym}` +
          `&start_date=${formatTMDate(start, isIntraday)}` +
          `&end_date=${formatTMDate(now, isIntraday)}` +
          `&interval=${tf.interval}&period=${tf.period}` +
          `&format=records${weekendParam}`;

        const res  = await fetch(url, { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        if (!Array.isArray(json.quotes) || json.quotes.length === 0) return;

        const incoming = parseQuotes(json.quotes, tf);
        if (incoming.length === 0) return;

        setChartData((prev) => {
          if (prev.length === 0) return prev;

          const currentBucketStart = candleStartMs(Date.now(), tf);
          let next = [...prev];
          for (const bar of incoming) {
            const idx = next.findIndex((b) => b.t === bar.t);
            // REST may correct the active bucket if WS already created it, but
            // should not create a new active bucket by itself. That keeps the
            // live candle close aligned with timeseries without reintroducing
            // stale REST/snapshot gap candles.
            if (bar.t >= currentBucketStart && idx < 0) continue;
            if (idx >= 0) {
              // Update existing bar (still forming)
              next[idx] = bar;
              if (bar.t < currentBucketStart) {
                restAuthoritativeCandlesRef.current.add(bar.t);
              }
            } else if (bar.t > next[next.length - 1].t) {
              // New minute rolled — append
              next.push(bar);
              if (bar.t < currentBucketStart) {
                restAuthoritativeCandlesRef.current.add(bar.t);
              }
            }
          }

          setTimeout(() => {
            setCachedTimeseries(activeSym.sym, tf.label, rangeHours, "live", {
              data: next,
              visibleStartMs: chartWindowStartMs ?? next[0]?.t ?? null,
            });
          }, 0);

          return next;
        });
      } catch { /* silent - don't disrupt chart on poll failure */ }
    };

    const scheduleBoundaryPoll = () => {
      if (cancelled) return;
      const boundary = nextCandleBoundaryMs(Date.now(), tf);
      const delay = Math.max(
        1000,
        boundary - Date.now() + CANDLE_CLOSE_REST_DELAY_MS,
      );
      const timer = window.setTimeout(async () => {
        ensureCurrentBucket();
        await poll();
        CANDLE_CLOSE_REST_RETRY_DELAYS_MS.forEach((retryDelay) => {
          const retryIn = boundary + retryDelay - Date.now();
          if (retryIn <= 500 || cancelled) return;
          boundaryTimers.push(window.setTimeout(poll, retryIn));
        });
        scheduleBoundaryPoll();
      }, delay);
      boundaryTimers.push(timer);
    };

    scheduleBoundaryPoll();
    const intervalId = isIntraday ? setInterval(poll, CANDLE_CORRECTION_POLL_MS) : 0;
    return () => {
      cancelled = true;
      boundaryTimers.forEach((timer) => clearTimeout(timer));
      if (intervalId) clearInterval(intervalId);
    };
  }, [activeSym.sym, tf, activeMarket, rangeHours, anchorEnd, chartWindowStartMs]);

  useEffect(() => {
    if (anchorEnd) return undefined;

    const ensureCurrentBucket = () => {
      const currentBucketStart = candleStartMs(Date.now(), tf);
      setChartData((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        if (!Number.isFinite(last?.t) || currentBucketStart <= last.t) return prev;

        const price = freshTickPriceForBucket(liveTickRef.current, tf, currentBucketStart);
        if (!Number.isFinite(price) || price <= 0) return prev;

        setChartDataSymbol(activeSym.sym);
        return [
          ...prev,
          { t: currentBucketStart, o: price, h: price, l: price, c: price },
        ];
      });
    };

    ensureCurrentBucket();
    const intervalId = setInterval(ensureCurrentBucket, 1000);
    return () => clearInterval(intervalId);
  }, [activeSym.sym, anchorEnd, tf]);

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
      const maxH = getMaxWindowHours(tf, activeMarket.id);
      // Fetch one full max-window worth of older data per request.
      const end = new Date(beforeTimestampMs - 1000); // 1s before the oldest candle
      const start = ceilToUtcHour(new Date(end.getTime() - maxH * MS_PER_HOUR));

      const weekendParam = isCrypto ? "&weekend=true" : "";
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

      const older = parseQuotes(json.quotes, tf);
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
    if (anchorEnd || !liveTick) return;

    const tickCandle = candleFromTick(liveTick, tf);
    if (!tickCandle) return;

    setError(null);
    setLoading(false);
    setChartDataSymbol(activeSym.sym);

    setChartData((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      const currentBucketStart = candleStartMs(Date.now(), tf);

      // Tick belongs to an already-closed bar (older bucket) → ignore.
      if (tickCandle.t < currentBucketStart && restAuthoritativeCandlesRef.current.has(tickCandle.t)) return prev;
      if (tickCandle.t < last.t && currentBucketStart <= last.t) return prev;

      const next = [...prev];
      if (tickCandle.t === last.t) {
        // Same forming bucket → always emit a new object so the chart re-renders
        // even when only the close moves by a single pip (tick crawl on illiquid pairs).
        const updated = {
          ...last,
          h: Math.max(last.h, tickCandle.c),
          l: Math.min(last.l, tickCandle.c),
          c: tickCandle.c,
        };
        next[next.length - 1] = updated;
        return next;
      }

      // New bucket has started — push a fresh candle.
      if (tickCandle.t > last.t) {
        next.push(tickCandle);
      } else if (currentBucketStart > last.t) {
        next.push({ ...tickCandle, t: currentBucketStart });
      }
      return next;
    });
  }, [activeSym.sym, anchorEnd, liveTick, tf]);

  const visibleChartData = useMemo(() => {
    if (!chartWindowStartMs) return chartData;
    const visible = chartData.filter((bar) => Number.isFinite(bar?.t) && bar.t >= chartWindowStartMs);
    return visible.length ? visible : chartData;
  }, [chartData, chartWindowStartMs]);

  const last = visibleChartData[visibleChartData.length - 1] ?? null;
  const chartMounted = !error && visibleChartData.length > 0 && chartDataSymbol === activeSym.sym;
  const chartRenderPending = chartMounted && !chartReady;
  const blockingLoad = (loading && visibleChartData.length === 0) || chartRenderPending;
  const backgroundLoad = loading && visibleChartData.length > 0 && !chartRenderPending;
  const chartIdentity = `${activeMarket.id}-${activeSym.sym}-${tf.label}-${rangeHours}-${anchorEndMs ?? "live"}`;

  return (
    <>
      <GlobalStyles />

      <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--bg-base)]">

        {/* NavBar */}
        <NavBar activeMarket={activeMarket.id} onMarketChange={handleMarketChange} />

        {/* TopBar */}
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
          displayWindowStart={visibleChartData[0] ? new Date(visibleChartData[0].t) : chartWindowStartMs ? new Date(chartWindowStartMs) : null}
          maxRangeHours={getMaxWindowHours(tf, activeMarket.id)}
          onOpenSettings={() => setSettingsOpen(true)}
        />

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
                    {activeSym.sym} - {tf.label}
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

              {chartMounted && (
                <div className="absolute inset-0">
                  <CandleChart
                    key={chartIdentity}
                    ref={chartRef}
                    data={visibleChartData}
                    chartKey={chartIdentity}
                    symbol={activeSym.sym}
                    decimals={activeSym.decimals ?? 5}
                    visibleStartMs={chartWindowStartMs}
                    // Only STOCKS and CRYPTO carry volume in the TraderMade feed.
                    // FX / METALS / ENERGIES / INDICES are price-only, so we
                    // hide volume-based indicators from the popup for those.
                    marketHasVolume={activeMarket.id === "STOCKS" || activeMarket.id === "CRYPTO"}
                    onReady={() => setChartReady(true)}
                    onLoadMoreHistory={loadMoreHistory}
                  />
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
                activeMarketId={activeMarket.id}
                selectedSymbol={activeSym.sym}
                onSymbolSelect={(symStr) => {
                  // Watchlist row clicked. Mutate state directly instead of
                  // routing through the URL — TradingPortal reads the URL only
                  // on mount (didInitFromUrlRef), so a navigate() call here
                  // would update the URL but leave the chart on the old symbol.
                  const resolved = findMarketSymbol(symStr);
                  if (resolved) setActiveSym(resolved.symbol);
                }}
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
