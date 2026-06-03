import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useSharedMarketData } from "../context/MarketDataContext.jsx";
import GainersLosers from "../components/GainersLosers";
import { CURRENCY_PAIRS, CRYPTO_PAIRS, US_STOCKS } from "../constants/constants";
import { LIVE_RATES_MAX_SYMBOLS, loadLiveRateTickers, saveLiveRateTickers } from "../constants/liveRates";

/* ── Static data ────────────────────────────────────────────────────────── */
const ALL_PAIRS = [
  ...CURRENCY_PAIRS.map(p => ({ ...p, market: "FX" })),
  ...CRYPTO_PAIRS.map(p => ({ ...p, market: "Crypto" })),
  ...US_STOCKS.map(p => ({ ...p, market: "Equities" })),
];
const symMap = Object.fromEntries(ALL_PAIRS.map(p => [p.sym, p]));

function getInitialColorMode() {
  try {
    return localStorage.getItem("colorMode") === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function applyColorMode(colorMode) {
  const isDark = colorMode === "dark";
  document.documentElement.classList.toggle("dark", isDark);
  try {
    localStorage.setItem("colorMode", colorMode);
  } catch {
    // Storage can be unavailable in private browsing.
  }
  window.dispatchEvent(new CustomEvent("tm-colormode-change", { detail: { colorMode } }));
  window.dispatchEvent(new CustomEvent("tm-theme-change", { detail: { colorMode } }));
}

const SESSIONS = [
  { name: "SYDNEY",   open: 21, close: 6,  clr: "#818cf8" },
  { name: "TOKYO",    open: 0,  close: 9,  clr: "#38bdf8" },
  { name: "LONDON",   open: 7,  close: 16, clr: "#fbbf24" },
  { name: "NEW YORK", open: 12, close: 21, clr: "#34d399" },
];

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function sessionOpen({ open, close }, h) {
  return open < close ? (h >= open && h < close) : (h >= open || h < close);
}

function pipFmt(val, dec) {
  if (val == null || isNaN(val)) return { body: "——", pips: "" };
  const s = Number(val).toFixed(dec);
  if (dec <= 2) {
    const d = s.indexOf(".");
    return { body: d >= 0 ? s.slice(0, d + 1) : s + ".", pips: d >= 0 ? s.slice(d + 1) : "00" };
  }
  return { body: s.slice(0, -2), pips: s.slice(-2) };
}

function fmtPlain(val, dec) {
  if (val == null || isNaN(val)) return "——";
  return Number(val).toFixed(dec ?? 5);
}

function fmtChg(val, dec) {
  if (val == null || isNaN(val)) return { text: "——", pos: null };
  const t = (val >= 0 ? "+" : "") + Number(val).toFixed(dec ?? 5);
  return { text: t, pos: val > 0 ? true : val < 0 ? false : null };
}

function fmtPct(val) {
  if (val == null || !isFinite(val)) return { text: "——", pos: null };
  const t = (val >= 0 ? "+" : "") + val.toFixed(2) + "%";
  return { text: t, pos: val > 0 ? true : val < 0 ? false : null };
}

function calcSpreadPips(bid, ask) {
  if (bid == null || ask == null) return null;
  const mid = (bid + ask) / 2;
  const pip = mid < 5 ? 0.0001 : mid < 50 ? 0.001 : mid < 500 ? 0.01 : mid < 5000 ? 0.1 : 1;
  return ((ask - bid) / pip).toFixed(1);
}

/* ── Main ────────────────────────────────────────────────────────────────── */
export default function LiveRates() {
  const navigate = useNavigate();
  const [tickers, setTickers]       = useState(loadLiveRateTickers);
  const [showAdd, setShowAdd]       = useState(false);
  const [search, setSearch]         = useState("");
  const [time, setTime]             = useState(new Date());
  const [colorMode, setColorMode]   = useState(getInitialColorMode);
  const [session, setSession]       = useState({});   // OHLC per sym (high/low)
  // Daily opens from historical API (same cache as GainersLosers)
  const [dailyOpens, setDailyOpens] = useState(() => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const cached = JSON.parse(localStorage.getItem(`gl_opens_${today}`));
      return cached?.["1D"] || {};
    } catch { return {}; }
  });
  // Daily high/low from historical API
  const [dailyHighLow, setDailyHighLow] = useState(() => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const cached = JSON.parse(localStorage.getItem(`lr_highlow_${today}`));
      return cached || {};
    } catch { return {}; }
  });
  const [flash, setFlash]           = useState({});   // { sym: { bid: "up"|"dn", ask: ... } }
  const [hoveredSym, setHoveredSym] = useState(null);
  const prevTicksRef = useRef({});
  const addRef = useRef(null);

  const { ticks, status } = useSharedMarketData(tickers);
  const isLive       = status === "Live";
  const isConnecting = status.includes("Connecting") || status.includes("Reconnecting");

  /* UTC clock */
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    applyColorMode(colorMode);
  }, [colorMode]);

  /* Fetch daily opens + high/low if not already cached */
  useEffect(() => {
    const needsOpens = Object.keys(dailyOpens).length === 0;
    const needsHL    = Object.keys(dailyHighLow).length === 0;
    if (!needsOpens && !needsHL) return;

    const today = new Date().toISOString().split("T")[0];
    // Use today's date for OHLC — API returns daily bars including current day
    const dateStr = today;
    const syms = tickers;
    const batches = [];
    for (let i = 0; i < syms.length; i += 10) batches.push(syms.slice(i, i + 10));

    Promise.all(batches.map(async (batch) => {
      try {
        const params = new URLSearchParams({ currency: batch.join(","), date: dateStr });
        const res = await fetch(`/api/v1/historical?${params}`);
        if (!res.ok) return { opens: {}, highlow: {} };
        const data = await res.json();
        const rows = Array.isArray(data) ? data : data.quotes ?? data.data ?? [];
        const opens = {}, highlow = {};
        for (const row of rows) {
          if (row.error) continue;
          const sym = row.symbol ?? (row.base_currency && row.quote_currency
            ? row.base_currency + row.quote_currency : null);
          if (!sym) continue;
          if (row.open)  opens[sym]           = parseFloat(row.open);
          if (row.high || row.low) highlow[sym] = {
            high: row.high != null ? parseFloat(row.high) : null,
            low:  row.low  != null ? parseFloat(row.low)  : null,
          };
        }
        return { opens, highlow };
      } catch { return { opens: {}, highlow: {} }; }
    })).then(results => {
      const mergedOpens  = Object.assign({}, ...results.map(r => r.opens));
      const mergedHL     = Object.assign({}, ...results.map(r => r.highlow));

      if (needsOpens && Object.keys(mergedOpens).length > 0) {
        setDailyOpens(mergedOpens);
        try {
          const lsKey = `gl_opens_${today}`;
          const existing = JSON.parse(localStorage.getItem(lsKey)) || {};
          existing["1D"] = { ...(existing["1D"] || {}), ...mergedOpens };
          localStorage.setItem(lsKey, JSON.stringify(existing));
        } catch { /* quota */ }
      }

      if (needsHL && Object.keys(mergedHL).length > 0) {
        setDailyHighLow(mergedHL);
        try {
          localStorage.setItem(`lr_highlow_${today}`, JSON.stringify(mergedHL));
        } catch { /* quota */ }
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    saveLiveRateTickers(tickers);
  }, [tickers]);

  /* Session OHLC + flash detection */
  useEffect(() => {
    const newFlash = {};

    setSession(prev => {
      const next = { ...prev };
      for (const tick of Object.values(ticks)) {
        const price = tick.bid ?? tick.mid;
        if (price == null) continue;
        const s = next[tick.symbol];
        if (!s) next[tick.symbol] = { open: price, high: price, low: price };
        else next[tick.symbol] = { open: s.open, high: Math.max(s.high, price), low: Math.min(s.low, price) };

        const prev2 = prevTicksRef.current[tick.symbol];
        if (prev2) {
          const bidDir = tick.bid != null && prev2.bid != null && tick.bid !== prev2.bid
            ? tick.bid > prev2.bid ? "up" : "dn" : null;
          const askDir = tick.ask != null && prev2.ask != null && tick.ask !== prev2.ask
            ? tick.ask > prev2.ask ? "up" : "dn" : null;
          if (bidDir || askDir) newFlash[tick.symbol] = { bid: bidDir, ask: askDir };
        }
        prevTicksRef.current[tick.symbol] = tick;
      }
      return next;
    });

    if (Object.keys(newFlash).length > 0) {
      setFlash(p => ({ ...p, ...newFlash }));
      const syms = Object.keys(newFlash);
      const t = setTimeout(() => setFlash(p => { const n={...p}; syms.forEach(s=>delete n[s]); return n; }), 550);
      return () => clearTimeout(t);
    }
  }, [ticks]);

  /* Close dropdown on outside click */
  useEffect(() => {
    const h = e => { if (addRef.current && !addRef.current.contains(e.target)) setShowAdd(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const addTicker = sym => {
    if (!tickers.includes(sym)) {
      setTickers((prev) => saveLiveRateTickers([...prev, sym]));
    }
  };
  const removeTicker = sym => setTickers((prev) => saveLiveRateTickers(prev.filter(s => s !== sym)));

  /* Build row data */
  const rows = tickers.map(sym => {
    const def    = symMap[sym];
    const tick   = ticks[sym];
    const sess   = session[sym];
    const bid    = tick?.bid ?? tick?.mid;
    const ask    = tick?.ask;
    const open   = dailyOpens[sym] ?? sess?.open;
    const dec    = def?.decimals ?? 5;
    const net    = bid != null && open != null ? bid - open : null;
    const pct    = net != null && open > 0 ? (net / open) * 100 : null;
    const spread = calcSpreadPips(bid, ask);

    // High/Low: historical daily baseline updated by live session ticks
    const hlBase = dailyHighLow[sym];
    const high = hlBase?.high != null && sess?.high != null
      ? Math.max(hlBase.high, sess.high)
      : hlBase?.high ?? sess?.high ?? null;
    const low = hlBase?.low != null && sess?.low != null
      ? Math.min(hlBase.low, sess.low)
      : hlBase?.low ?? sess?.low ?? null;

    return { sym, def, tick, sess, bid, ask, open, high, low, net, pct, dec, spread };
  });

  /* Filtered + grouped for Add dropdown */
  const filtered = ALL_PAIRS.filter(p =>
    !search ||
    p.sym.toLowerCase().includes(search.toLowerCase()) ||
    (p.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
    p.quote.toLowerCase().includes(search.toLowerCase())
  );
  const grouped = ["FX","Crypto","Equities"]
    .map(m => ({ market: m, pairs: filtered.filter(p => p.market === m) }))
    .filter(g => g.pairs.length > 0);

  const utcH  = time.getUTCHours();
  const clock = [utcH, time.getUTCMinutes(), time.getUTCSeconds()]
    .map(n => String(n).padStart(2,"0")).join(":");

  const liveCount = Object.keys(ticks).length;

  /* ── Colour tokens ───────────────────────────────────────────────────── */
  const C = colorMode === "dark" ? {
    bg:       "#07090f",
    panel:    "#0b0f1c",
    row:      "#0e1220",
    border:   "#141c2e",
    borderBr: "#1e2d4a",
    txt:      "#dde3ee",
    sec:      "#8fa3c0",
    dim:      "#5a7090",
    green:    "#00d68f",
    red:      "#ff4d6a",
    blue:     "#2979ff",
    amber:    "#fbbf24",
    softBlue: "rgba(41,121,255,0.12)",
    hoverBlue:"rgba(41,121,255,0.08)",
    groupBg:  "rgba(0,0,0,0.3)",
    rowHover: "rgba(255,255,255,0.03)",
    shadow:   "0 24px 48px rgba(0,0,0,0.8)",
    btnHover: "#afc4ff",
  } : {
    bg:       "#f4f7fb",
    panel:    "#ffffff",
    row:      "#edf3fa",
    border:   "#d9e2ee",
    borderBr: "#b8c7d8",
    txt:      "#111827",
    sec:      "#496178",
    dim:      "#7a8ca3",
    green:    "#059669",
    red:      "#dc2626",
    blue:     "#2563eb",
    amber:    "#d97706",
    softBlue: "rgba(37,99,235,0.1)",
    hoverBlue:"rgba(37,99,235,0.08)",
    groupBg:  "rgba(37,99,235,0.05)",
    rowHover: "rgba(37,99,235,0.06)",
    shadow:   "0 24px 48px rgba(15,23,42,0.16)",
    btnHover: "#1d4ed8",
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", width:"100vw",
                  overflow:"hidden", background: C.bg,
                  fontFamily:"'JetBrains Mono','Fira Code','Cascadia Code','Consolas',monospace",
                  color: C.txt }}>

      {/* ── Injected keyframes ─────────────────────────────────────────── */}
      <style>{`
        @keyframes flash-up {
          0%   { background: rgba(0,214,143,0.28); }
          100% { background: transparent; }
        }
        @keyframes flash-dn {
          0%   { background: rgba(255,77,106,0.28); }
          100% { background: transparent; }
        }
        .fl-up { animation: flash-up 0.55s ease-out forwards; }
        .fl-dn { animation: flash-dn 0.55s ease-out forwards; }
        @keyframes ticker-scroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .ticker { animation: ticker-scroll 60s linear infinite; }
        .ticker:hover { animation-play-state: paused; }
        @keyframes blink-dot { 0%,100%{opacity:1} 50%{opacity:0.25} }
        .blink { animation: blink-dot 1.4s ease infinite; }
        tr.rate-row:hover td { background: ${C.row}; }
        tr.rate-row td { transition: background 0.08s; }
      `}</style>

      {/* ══════════════════════════════════════════════════════════════════
          HEADER
      ══════════════════════════════════════════════════════════════════ */}
      <div style={{ height:42, flexShrink:0, display:"flex", alignItems:"center",
                    justifyContent:"space-between", padding:"0 16px",
                    borderBottom:`1px solid ${C.border}`, background: C.panel }}>

        {/* Logo */}
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:24, height:24, borderRadius:4, background: C.blue,
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize:9, fontWeight:900, color:"#fff", letterSpacing:"-0.5px" }}>FX</div>
          <span style={{ fontSize:13, fontWeight:800, letterSpacing:"0.14em", color: C.txt }}>TERMINAL</span>
          <span style={{ fontSize:8, fontWeight:800, letterSpacing:"0.18em", padding:"2px 6px",
                         borderRadius:3, background:C.softBlue, color: C.blue }}>PRO</span>
        </div>

        {/* WS status + title */}
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div className={isLive ? "blink" : ""} style={{
            width:6, height:6, borderRadius:"50%",
            background: isLive ? C.green : isConnecting ? C.amber : C.red,
            boxShadow: isLive ? `0 0 7px ${C.green}` : "none",
          }} />
          <span style={{ fontSize:11, fontWeight:700, letterSpacing:"0.12em", color: C.sec }}>LIVE RATES</span>
          <span style={{ fontSize:10, fontWeight:600,
                         color: isLive ? C.green : isConnecting ? C.amber : C.red }}>
            {isLive ? "· WS LIVE" : isConnecting ? "· CONNECTING" : "· OFFLINE"}
          </span>
        </div>

        {/* Right: sessions + clock */}
        <div style={{ display:"flex", alignItems:"center", gap:16 }}>

          {/* FX Sessions */}
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            {SESSIONS.map(s => {
              const open = sessionOpen(s, utcH);
              return (
                <div key={s.name} style={{ display:"flex", alignItems:"center", gap:5 }}>
                  <div style={{
                    width:5, height:5, borderRadius:"50%",
                    background: open ? s.clr : C.dim,
                    boxShadow: open ? `0 0 6px ${s.clr}88` : "none",
                    transition:"all 0.3s",
                  }} />
                  <span style={{ fontSize:8, fontWeight: open ? 700 : 500,
                                 letterSpacing:"0.1em",
                                 color: open ? s.clr : C.dim }}>
                    {s.name}
                  </span>
                </div>
              );
            })}
          </div>

          <div style={{ width:1, height:14, background: C.border }} />

          <ThemeToggleButton
            C={C}
            colorMode={colorMode}
            onToggle={() => setColorMode(mode => mode === "dark" ? "light" : "dark")}
          />

          <div style={{ width:1, height:14, background: C.border }} />

          {/* UTC clock */}
          <div style={{ display:"flex", alignItems:"center", gap:5 }}>
            <span style={{ fontSize:8, color: C.dim, letterSpacing:"0.1em" }}>UTC</span>
            <span style={{ fontSize:13, fontWeight:700, color: C.sec,
                           fontVariantNumeric:"tabular-nums", letterSpacing:"0.04em" }}>
              {clock}
            </span>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          TOOLBAR
      ══════════════════════════════════════════════════════════════════ */}
      <div style={{ height:36, flexShrink:0, display:"flex", alignItems:"center",
                    justifyContent:"space-between", padding:"0 16px",
                    borderBottom:`1px solid ${C.border}`, background: C.panel }}>

        {/* Stats */}
        <div style={{ display:"flex", alignItems:"center", gap:16 }}>
          <Stat label="WATCHING" value={`${tickers.length}/${LIVE_RATES_MAX_SYMBOLS} pairs`} color={C.sec} />
          <div style={{ width:1, height:10, background: C.border }} />
          <Stat label="LIVE" value={liveCount} color={liveCount > 0 ? C.green : C.dim} />
          <div style={{ width:1, height:10, background: C.border }} />
          <Stat label="DATE" value={time.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"})} color={C.sec} />
        </div>

        {/* Controls */}
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          {/* Add Pair */}
          <div style={{ position:"relative" }} ref={addRef}>
            <Btn onClick={() => { setShowAdd(o=>!o); setSearch(""); }} C={C} icon="+" label="ADD PAIR" />

            {showAdd && (
              <div style={{
                position:"absolute", right:0, top:"calc(100% + 4px)", zIndex:100,
                width:290, borderRadius:6, border:`1px solid ${C.borderBr}`,
                background: C.panel, boxShadow:C.shadow,
                overflow:"hidden",
              }}>
                <div style={{ padding:8, borderBottom:`1px solid ${C.border}` }}>
                  <input autoFocus value={search} onChange={e=>setSearch(e.target.value)}
                    placeholder="Search instrument…"
                    style={{
                      width:"100%", background: C.bg, border:`1px solid ${C.border}`,
                      color: C.txt, fontSize:11, padding:"6px 10px", borderRadius:4,
                      outline:"none", fontFamily:"inherit", boxSizing:"border-box",
                    }}
                    onFocus={e=>e.target.style.borderColor=C.blue}
                    onBlur={e=>e.target.style.borderColor=C.border}
                  />
                </div>
                <div style={{ maxHeight:300, overflowY:"auto" }}>
                  {grouped.length === 0 && (
                    <div style={{ padding:20, textAlign:"center", fontSize:10, color: C.dim }}>
                      No instruments found
                    </div>
                  )}
                  {grouped.map(g => (
                    <div key={g.market}>
                      <div style={{ padding:"5px 10px 4px", fontSize:8, fontWeight:800,
                                    letterSpacing:"0.14em", color: C.dim,
                                    borderBottom:`1px solid ${C.border}`, borderTop:`1px solid ${C.border}`,
                                    background:C.groupBg }}>
                        {g.market.toUpperCase()}
                      </div>
                      {g.pairs.map(p => {
                        const added = tickers.includes(p.sym);
                        return (
                          <button key={p.sym}
                            onClick={() => { addTicker(p.sym); if (!search) setShowAdd(false); }}
                            disabled={added}
                            style={{
                              display:"flex", width:"100%", alignItems:"center",
                              justifyContent:"space-between", padding:"7px 12px",
                              background:"none", border:"none", fontFamily:"inherit",
                              cursor: added ? "default" : "pointer",
                              opacity: added ? 0.35 : 1, transition:"background 0.1s",
                            }}
                            onMouseEnter={e=>{ if(!added) e.currentTarget.style.background=C.rowHover;}}
                            onMouseLeave={e=>{ e.currentTarget.style.background="none"; }}
                          >
                            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                              <span style={{ fontSize:12, fontWeight:700, color: C.txt, letterSpacing:"0.06em" }}>
                                {p.base}
                              </span>
                              <span style={{ fontSize:10, color: C.dim }}>/</span>
                              <span style={{ fontSize:11, color: C.sec, letterSpacing:"0.04em" }}>
                                {p.quote}
                              </span>
                            </div>
                            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                              <span style={{ fontSize:8, color: C.dim, letterSpacing:"0.1em" }}>
                                {p.market}
                              </span>
                              {added && (
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                  <path d="M2 5.5L4 7.5L8 3" stroke={C.green} strokeWidth="1.5"
                                        strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ width:1, height:14, background: C.border }} />

          <Btn onClick={() => navigate("/forex-charts")} C={C} icon="↗" label="CHARTS" />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          CONTENT: Gainers/Losers + Table
      ══════════════════════════════════════════════════════════════════ */}
      <div style={{ flex:1, display:"flex", overflow:"hidden" }}>
        {/* Left panel: Gainers/Losers */}
        <GainersLosers ticks={ticks} symbols={tickers} />

        {/* Main table */}
        <div style={{ flex:1, overflowY:"auto", overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead>
            <tr style={{ position:"sticky", top:0, zIndex:10, background: C.panel,
                         borderBottom:`1px solid ${C.border}` }}>
              {[
                { h:"INSTRUMENT",  a:"left",   w:140 },
                { h:"BID",         a:"right",  w:130 },
                { h:"ASK",         a:"right",  w:130 },
                { h:"SPREAD",      a:"right",  w:80  },
                { h:"NET CHG",     a:"right",  w:110 },
                { h:"% CHG",       a:"right",  w:90  },
                { h:"OPEN",        a:"right",  w:110 },
                { h:"HIGH",        a:"right",  w:110 },
                { h:"LOW",         a:"right",  w:110 },
                { h:"",            a:"center", w:36  },
              ].map(({ h, a, w }, i) => (
                <th key={i} style={{
                  padding:"8px 14px", textAlign: a, minWidth: w,
                  fontSize:8, fontWeight:800, letterSpacing:"0.14em",
                  color: C.sec, fontFamily:"inherit", whiteSpace:"nowrap",
                  borderBottom:`2px solid ${C.borderBr}`,
                  borderRight: i < 9 ? `1px solid ${C.border}` : "none",
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ padding:60, textAlign:"center",
                                          color: C.dim, fontSize:12 }}>
                  No instruments selected — click ADD PAIR to begin
                </td>
              </tr>
            ) : rows.map(({ sym, def, tick, bid, ask, open, high, low, net, pct, dec, spread }) => {
              const bidF   = pipFmt(bid, dec);
              const askF   = pipFmt(ask, dec);
              const netF   = fmtChg(net, dec);
              const pctF   = fmtPct(pct);
              const fl     = flash[sym] ?? {};
              const isUp   = tick?.trend === "up";
              const isDown = tick?.trend === "down";
              const hovered = hoveredSym === sym;

              const cellStyle = (extra = {}) => ({
                padding:"9px 14px",
                borderBottom:`1px solid ${C.border}`,
                borderRight:`1px solid ${C.border}`,
                fontVariantNumeric:"tabular-nums",
                background: "transparent",
                ...extra,
              });

              const netColor = netF.pos === true ? C.green : netF.pos === false ? C.red : C.dim;

              return (
                <tr key={sym}
                    className="rate-row"
                    onClick={() => navigate(`/forex-charts?symbol=${sym}`)}
                    onMouseEnter={() => setHoveredSym(sym)}
                    onMouseLeave={() => setHoveredSym(null)}
                    style={{ cursor:"pointer" }}
                >
                  {/* ── Instrument ─────────────────────────────────── */}
                  <td style={cellStyle()}>
                    <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                      {/* Direction arrow */}
                      <div style={{ width:10, flexShrink:0, display:"flex", justifyContent:"center" }}>
                        {isUp && (
                          <svg width="7" height="8" viewBox="0 0 7 8" fill="none">
                            <path d="M3.5 1L6.5 7H0.5L3.5 1Z" fill={C.green}/>
                          </svg>
                        )}
                        {isDown && (
                          <svg width="7" height="8" viewBox="0 0 7 8" fill="none">
                            <path d="M3.5 7L0.5 1H6.5L3.5 7Z" fill={C.red}/>
                          </svg>
                        )}
                        {!isUp && !isDown && (
                          <svg width="7" height="8" viewBox="0 0 7 8" fill="none">
                            <path d="M1 4L6 4M5 3L6 4L5 5" stroke="white" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <div>
                        <div style={{ fontSize:12, fontWeight:800, letterSpacing:"0.06em",
                                      color: isUp ? C.green : isDown ? C.red : C.txt }}>
                          {sym}
                        </div>
                        {def?.name && (
                          <div style={{ fontSize:8, color: C.dim, letterSpacing:"0.06em", marginTop:1 }}>
                            {def.name}
                          </div>
                        )}
                      </div>
                      <div style={{ marginLeft:"auto" }}>
                        <span style={{ fontSize:7, fontWeight:800, letterSpacing:"0.12em",
                                       padding:"2px 4px", borderRadius:2,
                                       background: def?.market === "Crypto" ? "rgba(41,121,255,0.15)"
                                                 : def?.market === "Equities" ? "rgba(251,191,36,0.12)"
                                                 : "rgba(90,106,136,0.12)",
                                       color: def?.market === "Crypto" ? C.blue
                                            : def?.market === "Equities" ? C.amber
                                            : C.sec }}>
                          {def?.market ?? "FX"}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* ── Bid ────────────────────────────────────────── */}
                  <td className={fl.bid === "up" ? "fl-up" : fl.bid === "dn" ? "fl-dn" : ""}
                      style={cellStyle({ textAlign:"right" })}>
                    <span style={{ fontSize:11, color: isDown ? C.red : C.sec,
                                   fontVariantNumeric:"tabular-nums" }}>{bidF.body}</span>
                    <span style={{ fontSize:15, fontWeight:800, color: isDown ? C.red : C.txt,
                                   fontVariantNumeric:"tabular-nums" }}>{bidF.pips}</span>
                  </td>

                  {/* ── Ask ────────────────────────────────────────── */}
                  <td className={fl.ask === "up" ? "fl-up" : fl.ask === "dn" ? "fl-dn" : ""}
                      style={cellStyle({ textAlign:"right" })}>
                    <span style={{ fontSize:11, color: isUp ? C.green : C.sec,
                                   fontVariantNumeric:"tabular-nums" }}>{askF.body}</span>
                    <span style={{ fontSize:15, fontWeight:800, color: isUp ? C.green : C.txt,
                                   fontVariantNumeric:"tabular-nums" }}>{askF.pips}</span>
                  </td>

                  {/* ── Spread ─────────────────────────────────────── */}
                  <td style={cellStyle({ textAlign:"right", fontSize:11, color: C.dim })}>
                    {spread != null
                      ? <><span style={{ color: C.sec }}>{spread}</span><span style={{ fontSize:9, marginLeft:3 }}>pip</span></>
                      : "——"}
                  </td>

                  {/* ── Net change ─────────────────────────────────── */}
                  <td style={cellStyle({ textAlign:"right", fontSize:11, fontWeight:700, color: netColor })}>
                    {netF.text}
                  </td>

                  {/* ── % change ───────────────────────────────────── */}
                  <td style={cellStyle({ textAlign:"right" })}>
                    <span style={{
                      fontSize:11, fontWeight:800, color: pctF.pos === true ? "#fff" : pctF.pos === false ? "#fff" : C.dim,
                      background: pctF.pos === true ? "rgba(0,214,143,0.18)"
                                : pctF.pos === false ? "rgba(255,77,106,0.18)" : "transparent",
                      padding: pctF.pos !== null ? "2px 6px" : "2px 0",
                      borderRadius:3, fontVariantNumeric:"tabular-nums",
                    }}>
                      {pctF.text}
                    </span>
                  </td>

                  {/* ── Open ───────────────────────────────────────── */}
                  <td style={cellStyle({ textAlign:"right", fontSize:11, color: C.dim })}>
                    {fmtPlain(open, dec)}
                  </td>

                  {/* ── High ───────────────────────────────────────── */}
                  <td style={cellStyle({ textAlign:"right", fontSize:11,
                                         color:"rgba(0,214,143,0.7)" })}>
                    {fmtPlain(high, dec)}
                  </td>

                  {/* ── Low ────────────────────────────────────────── */}
                  <td style={cellStyle({ textAlign:"right", fontSize:11,
                                         color:"rgba(255,77,106,0.7)" })}>
                    {fmtPlain(low, dec)}
                  </td>

                  {/* ── Remove ─────────────────────────────────────── */}
                  <td style={{ padding:"9px 8px", textAlign:"center",
                               borderBottom:`1px solid ${C.border}`,
                               background:"transparent" }}>
                    <button
                      onClick={e => { e.stopPropagation(); removeTicker(sym); }}
                      style={{
                        width:18, height:18, borderRadius:3, fontFamily:"inherit",
                        border:`1px solid ${hovered ? C.borderBr : "transparent"}`,
                        background:"none", cursor:"pointer", fontSize:14,
                        display:"flex", alignItems:"center", justifyContent:"center",
                        opacity: hovered ? 1 : 0, transition:"all 0.15s",
                        color: C.dim,
                      }}
                      onMouseEnter={e=>{e.currentTarget.style.color=C.red;e.currentTarget.style.borderColor=C.red;}}
                      onMouseLeave={e=>{e.currentTarget.style.color=C.dim;e.currentTarget.style.borderColor=C.borderBr;}}
                      title={`Remove ${sym}`}
                    >×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          TICKER TAPE
      ══════════════════════════════════════════════════════════════════ */}
      <div style={{ height:26, flexShrink:0, overflow:"hidden",
                    borderTop:`1px solid ${C.border}`, background: C.panel,
                    display:"flex", alignItems:"center" }}>
        <div style={{ overflow:"hidden", flex:1 }}>
          <div className="ticker" style={{ display:"inline-flex", whiteSpace:"nowrap" }}>
            {[...rows, ...rows].map(({ sym, bid, pct, dec }, i) => {
              const pf = fmtPct(pct);
              return (
                <span key={`${sym}-${i}`} style={{
                  display:"inline-flex", alignItems:"center", gap:8,
                  padding:"0 18px", borderRight:`1px solid ${C.border}`,
                }}>
                  <span style={{ fontSize:9, fontWeight:800, color: C.sec, letterSpacing:"0.08em" }}>
                    {sym}
                  </span>
                  <span style={{ fontSize:10, color: C.txt, fontVariantNumeric:"tabular-nums" }}>
                    {bid != null ? Number(bid).toFixed(dec) : "——"}
                  </span>
                  <span style={{ fontSize:9, fontWeight:700, fontVariantNumeric:"tabular-nums",
                                 color: pf.pos === true ? C.green : pf.pos === false ? C.red : C.dim }}>
                    {pf.text}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────────────────── */
function Stat({ label, value, color }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:5 }}>
      <span style={{ fontSize:8, fontWeight:800, letterSpacing:"0.14em", color:"var(--text-dim)" }}>{label}</span>
      <span style={{ fontSize:11, fontWeight:700, color }}>{value}</span>
    </div>
  );
}

function ThemeToggleButton({ C, colorMode, onToggle }) {
  const [hov, setHov] = useState(false);
  const isDark = colorMode === "dark";
  return (
    <button
      type="button"
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={onToggle}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width:24, height:24, display:"flex", alignItems:"center", justifyContent:"center",
        borderRadius:4, cursor:"pointer",
        border:`1px solid ${hov ? C.blue : C.borderBr}`,
        background: hov ? C.hoverBlue : C.row,
        color: hov ? C.btnHover : C.sec,
        transition:"all 0.15s",
      }}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1.5v1.4M8 13.1v1.4M3.4 3.4l1 1M11.6 11.6l1 1M1.5 8h1.4M13.1 8h1.4M3.4 12.6l1-1M11.6 4.4l1-1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M12.8 10.6A5.5 5.5 0 0 1 5.4 3.2 5.8 5.8 0 1 0 12.8 10.6Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function Btn({ onClick, C, icon, label }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{
        display:"flex", alignItems:"center", gap:6,
        padding:"4px 10px", borderRadius:4, cursor:"pointer",
        border:`1px solid ${hov ? C.blue : C.borderBr}`,
        background: hov ? C.hoverBlue : C.bg,
        color: hov ? C.btnHover : C.sec,
        fontSize:9, fontWeight:800, letterSpacing:"0.12em",
        fontFamily:"'JetBrains Mono','Fira Code','Cascadia Code','Consolas',monospace",
        transition:"all 0.15s",
      }}>
      <span style={{ fontSize:11, lineHeight:1 }}>{icon}</span>
      {label}
    </button>
  );
}
