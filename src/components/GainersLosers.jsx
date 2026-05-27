import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { CURRENCY_PAIRS, CRYPTO_PAIRS, US_STOCKS } from "../constants/constants";

const ALL_SYMBOLS = [
  ...CURRENCY_PAIRS.map(p => ({ ...p, market: "FX" })),
  ...CRYPTO_PAIRS.map(p => ({ ...p, market: "Crypto" })),
  ...US_STOCKS.map(p => ({ ...p, market: "Equities" })),
];
const SYMBOL_META = Object.fromEntries(ALL_SYMBOLS.map(p => [p.sym, p]));

const PERIODS = [
  { label: "1D", days: 1 },
  { label: "1W", days: 7 },
  { label: "1M", days: 30 },
];

const C = {
  panel: "var(--bg-panel)",
  card: "var(--bg-card)",
  border: "var(--border)",
  txt: "var(--text-primary)",
  dim: "var(--text-dim)",
  green: "var(--green)",
  red: "var(--red)",
};

const REFRESH_MS = 5 * 60 * 1000;
const TODAY = new Date().toISOString().split("T")[0];
const LS_KEY = `gl_opens_${TODAY}`;

function loadCache() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
  catch { return {}; }
}

function saveCache(data) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch { /* quota */ }
}

function normalizeSymbols(symbols) {
  if (!Array.isArray(symbols)) return [];
  const seen = new Set();
  const cleaned = [];
  for (const sym of symbols) {
    if (typeof sym !== "string") continue;
    const normalized = sym.trim().toUpperCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    cleaned.push(normalized);
  }
  return cleaned;
}

function hasItems(snapshot) {
  return snapshot.gainers.length > 0 || snapshot.losers.length > 0;
}

function GainersLosers({ ticks = {}, symbols = [] }) {
  const [period, setPeriod] = useState("1D");
  const [gainers, setGainers] = useState([]);
  const [losers, setLosers] = useState([]);
  const [loading, setLoading] = useState(true);

  const watchedSymbols = useMemo(() => {
    const explicit = normalizeSymbols(symbols);
    return explicit.length > 0 ? explicit : normalizeSymbols(Object.keys(ticks));
  }, [symbols, ticks]);
  const watchedSymbolsKey = watchedSymbols.join(",");

  const opensCache = useRef(loadCache());
  const ticksRef = useRef({});
  const watchedSymbolsRef = useRef([]);
  const snapshotsRef = useRef({});

  const buildSnapshot = useCallback((lbl) => {
    const opens = opensCache.current[lbl];
    const t = ticksRef.current;
    const universe = watchedSymbolsRef.current.length > 0
      ? watchedSymbolsRef.current
      : Object.keys(t);

    if (!opens || !Object.keys(opens).length || !universe.length || !Object.keys(t).length) {
      return { gainers: [], losers: [] };
    }

    const results = [];
    for (const sym of universe) {
      const tick = t[sym];
      const open = opens[sym];
      if (!tick?.bid || open == null || isNaN(open) || !SYMBOL_META[sym]) continue;
      const pctChange = ((tick.bid - open) / open) * 100;
      results.push({ symbol: sym, pctChange, open, close: tick.bid });
    }

    results.sort((a, b) => b.pctChange - a.pctChange);
    return {
      gainers: results.slice(0, 5),
      losers: results.slice(-5).reverse(),
    };
  }, []);

  const applySnapshot = useCallback((lbl, snapshot = snapshotsRef.current[lbl]) => {
    const snap = snapshot || { gainers: [], losers: [] };
    setGainers(snap.gainers);
    setLosers(snap.losers);
  }, []);

  const rebuildSnapshots = useCallback(() => {
    for (const p of PERIODS) {
      snapshotsRef.current[p.label] = buildSnapshot(p.label);
    }
    const current = snapshotsRef.current[period] || { gainers: [], losers: [] };
    applySnapshot(period, current);
    return current;
  }, [applySnapshot, buildSnapshot, period]);

  const fetchPeriod = useCallback(async (label, days, syms) => {
    const currentSyms = normalizeSymbols(syms).filter(sym => SYMBOL_META[sym]);
    if (!currentSyms.length) return;

    const cached = opensCache.current[label] || {};
    const missingSyms = currentSyms.filter(sym => !(sym in cached));
    if (!missingSyms.length) return;

    const date = new Date();
    date.setDate(date.getDate() - days);
    const dateStr = date.toISOString().split("T")[0];
    const batches = [];
    for (let i = 0; i < missingSyms.length; i += 10) batches.push(missingSyms.slice(i, i + 10));

    const results = await Promise.all(batches.map(async (batch) => {
      try {
        const params = new URLSearchParams({ currency: batch.join(","), date: dateStr });
        const res = await fetch(`/api/v1/historical?${params}`);
        if (!res.ok) return { rows: [], batch };
        const data = await res.json();
        return { rows: Array.isArray(data) ? data : data.quotes ?? data.data ?? [], batch };
      } catch { return { rows: [], batch }; }
    }));

    const openMap = { ...cached };
    for (const { rows, batch } of results) {
      // Mark every requested symbol as seen (null = no data) to prevent re-fetching
      for (const sym of batch) {
        if (!(sym in openMap)) openMap[sym] = null;
      }
      for (const row of rows) {
        if (row.error) continue;
        const sym = row.symbol ?? (row.base_currency && row.quote_currency
          ? row.base_currency + row.quote_currency : null);
        if (sym && row.open) openMap[sym] = parseFloat(row.open);
      }
    }
    opensCache.current[label] = openMap;
    saveCache(opensCache.current);
  }, []);

  useEffect(() => {
    ticksRef.current = ticks;
    watchedSymbolsRef.current = watchedSymbols;
    const current = rebuildSnapshots();
    if (hasItems(current)) setLoading(false);
  }, [ticks, watchedSymbols, rebuildSnapshots]);

  useEffect(() => {
    const run = async (showSpinner = false) => {
      const syms = watchedSymbolsRef.current;
      if (!syms.length) {
        setLoading(false);
        return;
      }

      if (showSpinner && !hasItems(snapshotsRef.current[period] || { gainers: [], losers: [] })) {
        setLoading(true);
      }

      await Promise.all(PERIODS.map(async (p) => {
        await fetchPeriod(p.label, p.days, syms);
      }));

      rebuildSnapshots();
      if (showSpinner) setLoading(false);
    };

    run(true);
    const interval = setInterval(() => run(false), REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchPeriod, rebuildSnapshots, period, watchedSymbolsKey]);

  useEffect(() => {
    const current = snapshotsRef.current[period] || buildSnapshot(period);
    snapshotsRef.current[period] = current;
    applySnapshot(period, current);
    if (hasItems(current)) setLoading(false);
  }, [period, applySnapshot, buildSnapshot]);

  const renderList = (items, title) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: C.dim, marginBottom: 8, letterSpacing: "0.1em" }}>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.length === 0 ? (
          <div style={{ fontSize: 9, color: C.dim, padding: "8px 0" }}>—</div>
        ) : (
          items.map((item, i) => (
            <div key={i} style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "6px 8px",
              background: C.card,
              borderRadius: 2,
              fontSize: 9,
              fontFamily: "var(--font-mono)",
            }}>
              <span style={{ color: C.txt, fontWeight: 600 }}>{item.symbol}</span>
              <span style={{ color: item.pctChange >= 0 ? C.green : C.red, fontWeight: 600 }}>
                {item.pctChange >= 0 ? "+" : ""}{item.pctChange.toFixed(2)}%
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div style={{
      width: 180,
      height: "100%",
      background: C.panel,
      borderRight: `1px solid ${C.border}`,
      padding: 12,
      overflowY: "auto",
      display: "flex",
      flexDirection: "column",
    }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: C.txt, letterSpacing: "0.06em", marginBottom: 8 }}>
          GAINERS & LOSERS
        </div>
        <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
          {PERIODS.map(p => (
            <button
              key={p.label}
              onClick={() => setPeriod(p.label)}
              style={{
                flex: 1,
                padding: "4px 0",
                fontSize: 8,
                fontWeight: 700,
                border: `1px solid ${period === p.label ? "var(--blue)" : C.border}`,
                background: period === p.label ? "rgba(59, 130, 246, 0.1)" : "transparent",
                color: period === p.label ? "var(--blue)" : C.dim,
                borderRadius: 2,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        {loading && gainers.length === 0 && losers.length === 0 && (
          <div style={{ fontSize: 8, color: C.dim, textAlign: "center" }}>Loading...</div>
        )}
      </div>

      {(!loading || gainers.length > 0 || losers.length > 0) && (
        <>
          {renderList(gainers, "🔝 TOP GAINERS")}
          {renderList(losers, "📉 TOP LOSERS")}
        </>
      )}
    </div>
  );
}

export default memo(GainersLosers);
