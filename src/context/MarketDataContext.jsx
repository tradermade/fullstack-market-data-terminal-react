import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { WS_SYMBOL_MAP } from "../constants/constants.jsx";

const RECONNECT_DELAY = 3000;

function getProxyWebSocketUrl() {
  const configured = import.meta.env.VITE_PROXY_WS_URL;
  if (configured) return configured;
  if (typeof window === "undefined") return "ws://localhost:3001";

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  if (window.location.port === "5173") {
    return `${protocol}//${window.location.hostname}:3001`;
  }
  return `${protocol}//${window.location.host}`;
}

const MarketDataContext = createContext(null);

function normalizeSymbols(symbols) {
  if (!Array.isArray(symbols)) return [];
  const seen = new Set();
  const cleaned = [];
  for (const sym of symbols) {
    if (typeof sym !== "string") continue;
    const trimmed = sym.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    cleaned.push(trimmed);
  }
  return cleaned;
}

// ─────────────────────────────────────────────────────────────────────────
// Module-level singleton — survives EVERY React mount/unmount/StrictMode cycle.
// Only one WebSocket ever exists per tab.
// ─────────────────────────────────────────────────────────────────────────
const store = {
  ws: null,
  reconnectTimer: null,
  subscribedSymbols: [],
  subscriptionsByConsumer: new Map(),
  refreshTimer: null,
  state: { ticks: {}, ladders: {}, status: "Connecting...", log: "", hasLadder: false },
  listeners: new Set(),
};

function emit() {
  // create a new state reference so React's useSyncExternalStore re-renders
  store.state = { ...store.state };
  for (const l of store.listeners) l();
}

function send(action, syms) {
  if (store.ws?.readyState === WebSocket.OPEN && syms?.length > 0) {
    store.ws.send(JSON.stringify({ action, symbols: syms }));
  }
}

function recomputeDesired() {
  const merged = [];
  const seen = new Set();
  for (const symbols of store.subscriptionsByConsumer.values()) {
    for (const sym of symbols) {
      if (seen.has(sym)) continue;
      seen.add(sym);
      merged.push(sym);
    }
  }
  return merged;
}

function syncSubs(next) {
  const prev = store.subscribedSymbols;
  const toAdd = next.filter(s => !prev.includes(s));
  const toRemove = prev.filter(s => !next.includes(s));
  if (toRemove.length > 0) send("unsubscribe", toRemove);
  if (toAdd.length > 0) send("subscribe", toAdd);
  store.subscribedSymbols = [...next];
}

function scheduleRefresh() {
  if (store.refreshTimer) clearTimeout(store.refreshTimer);
  store.refreshTimer = setTimeout(() => {
    store.refreshTimer = null;
    syncSubs(recomputeDesired());
  }, 50);
}

function registerConsumer(id, symbols) {
  store.subscriptionsByConsumer.set(id, normalizeSymbols(symbols));
  scheduleRefresh();
}

function unregisterConsumer(id) {
  store.subscriptionsByConsumer.delete(id);
  scheduleRefresh();
}

function setStatus(status) {
  if (store.state.status === status) return;
  store.state = { ...store.state, status };
  emit();
}

function setLog(log) {
  store.state = { ...store.state, log };
  emit();
}

function parseLadderSide(side) {
  if (!Array.isArray(side)) return [];
  return side
    .map(([p, v]) => {
      const price = Number(p);
      const volume = Number(v);
      return Number.isFinite(price) && Number.isFinite(volume) && volume > 0
        ? { price, volume }
        : null;
    })
    .filter(Boolean);
}

function applyTick(parsed) {
  const symbol = WS_SYMBOL_MAP[parsed.symbol] ?? parsed.symbol;
  const bid = parsed.bid != null ? Number(parsed.bid) : undefined;
  const ask = parsed.ask != null ? Number(parsed.ask) : undefined;
  const mid = parsed.mid != null
    ? Number(parsed.mid)
    : (bid != null && ask != null ? (bid + ask) / 2 : undefined);
  if (mid == null) return;

  const prevTick = store.state.ticks[symbol];
  let trend = "neutral";
  if (prevTick) {
    if (mid > prevTick.mid) trend = "up";
    else if (mid < prevTick.mid) trend = "down";
    else trend = prevTick.trend;
  }
  const nextState = {
    ...store.state,
    status: "Live",
    ticks: { ...store.state.ticks, [symbol]: { ...parsed, symbol, bid, ask, mid, trend, receivedAt: Date.now() } },
  };
  // Pick out ladder/depth data when present and put it into its own slot,
  // sorted with best price first so the UI can render top-down easily.
  if (parsed.ladder) {
    const asks = parseLadderSide(parsed.ladder.a).sort((a, b) => a.price - b.price);
    const bids = parseLadderSide(parsed.ladder.b).sort((a, b) => b.price - a.price);
    if (asks.length || bids.length) {
      nextState.ladders = {
        ...store.state.ladders,
        [symbol]: { asks, bids, mid, bestBid: bids[0]?.price, bestAsk: asks[0]?.price, timestamp: parsed.timestamp },
      };
    }
  }
  store.state = nextState;
  emit();
}

function applyCapabilities(parsed) {
  const hasLadder = parsed.hasLadder === true;
  if (store.state.hasLadder === hasLadder) return;
  store.state = { ...store.state, hasLadder };
  emit();
}

function connect() {
  if (store.reconnectTimer) {
    clearTimeout(store.reconnectTimer);
    store.reconnectTimer = null;
  }
  // Don't open a second socket if one is already open or connecting
  if (store.ws && (store.ws.readyState === WebSocket.OPEN || store.ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  setStatus("Connecting...");
  const ws = new WebSocket(getProxyWebSocketUrl());
  store.ws = ws;

  ws.onopen = () => {
    if (store.ws !== ws) return; // a newer socket exists
    setStatus("Live");
    store.subscribedSymbols = [];
    syncSubs(recomputeDesired());
  };

  ws.onmessage = ({ data }) => {
    setLog(typeof data === "string" ? data.slice(0, 120) : "(binary)");
    if (typeof data === "string" && !data.trim().startsWith("{")) {
      if (data.includes("Connected")) setStatus("Live");
      return;
    }
    try {
      const parsed = JSON.parse(data);
      if (parsed.error) {
        setStatus(`Error: ${parsed.error}`);
        return;
      }
      if (parsed.type === "capabilities") {
        applyCapabilities(parsed);
        return;
      }
      if (parsed.symbol && (parsed.mid !== undefined || parsed.bid !== undefined)) {
        applyTick(parsed);
      }
    } catch (err) {
      if (typeof data === "string" && !data.includes("Connected") && !data.includes("User Key")) {
        console.error("WS parse error:", err);
      }
    }
  };

  ws.onerror = () => setStatus("Connection Error");

  ws.onclose = ({ code }) => {
    if (store.ws !== ws) return; // we already replaced it
    store.ws = null;
    store.subscribedSymbols = [];
    setStatus(`Disconnected (${code}). Reconnecting...`);
    store.reconnectTimer = setTimeout(connect, RECONNECT_DELAY);
  };
}

// Connect ONCE per tab lifetime
if (typeof window !== "undefined" && !store.ws) {
  connect();
}

function subscribe(listener) {
  store.listeners.add(listener);
  return () => store.listeners.delete(listener);
}
function getSnapshot() { return store.state; }

// ─────────────────────────────────────────────────────────────────────────
// React glue
// ─────────────────────────────────────────────────────────────────────────
export function MarketDataProvider({ children }) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const value = useMemo(() => ({
    ticks: state.ticks,
    ladders: state.ladders,
    status: state.status,
    log: state.log,
    hasLadder: state.hasLadder,
    registerConsumer,
    unregisterConsumer,
  }), [state]);
  return <MarketDataContext.Provider value={value}>{children}</MarketDataContext.Provider>;
}

export function useSharedMarketData(symbols) {
  const context = useContext(MarketDataContext);
  if (!context) throw new Error("useSharedMarketData must be used within a MarketDataProvider");

  const consumerIdRef = useRef(null);
  if (!consumerIdRef.current) {
    consumerIdRef.current = `md-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  }

  const normalized = useMemo(() => normalizeSymbols(symbols), [symbols]);
  const symbolsKey = normalized.join(",");
  const normalizedRef = useRef(normalized);
  normalizedRef.current = normalized;

  useEffect(() => {
    const id = consumerIdRef.current;
    registerConsumer(id, normalizedRef.current);
    return () => unregisterConsumer(id);
  }, [symbolsKey]);

  const filteredTicks = useMemo(() => {
    if (normalized.length === 0) return {};
    const subset = {};
    for (const sym of normalized) {
      if (context.ticks[sym]) subset[sym] = context.ticks[sym];
    }
    return subset;
  }, [context.ticks, normalized]);

  const filteredLadders = useMemo(() => {
    if (normalized.length === 0 || !context.ladders) return {};
    const subset = {};
    for (const sym of normalized) {
      if (context.ladders[sym]) subset[sym] = context.ladders[sym];
    }
    return subset;
  }, [context.ladders, normalized]);

  return {
    ticks: filteredTicks,
    ladders: filteredLadders,
    status: context.status,
    log: context.log,
    hasLadder: !!context.hasLadder,
  };
}
