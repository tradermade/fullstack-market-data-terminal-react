import { useState, useEffect, useRef, useCallback } from "react";
import { WS_SYMBOL_MAP } from "../constants/constants.jsx";

const WS_URL = "ws://localhost:3001";
const RECONNECT_DELAY = 3000;

export function useMarketData(symbols) {
  const [ticks, setTicks] = useState({});
  const [status, setStatus] = useState("Connecting...");
  const [log, setLog] = useState("");
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const subscribedSymbolsRef = useRef([]);
  const latestSymbolsRef = useRef([]);
  const hasConnectedRef = useRef(false);
  const connectRef = useRef(null);

  const symbolsKey = (symbols ?? []).join(",");

  useEffect(() => {
    latestSymbolsRef.current = symbolsKey ? symbolsKey.split(",") : [];
  }, [symbolsKey]);

  const sendMessage = useCallback((ws, action, syms) => {
    if (ws?.readyState === WebSocket.OPEN && syms?.length > 0) {
      ws.send(JSON.stringify({ action, symbols: syms }));
    }
  }, []);

  const syncSubscriptions = useCallback((ws, nextSymbols) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const prevSymbols = subscribedSymbolsRef.current;
    const toAdd = nextSymbols.filter((sym) => !prevSymbols.includes(sym));
    const toRemove = prevSymbols.filter((sym) => !nextSymbols.includes(sym));

    if (toRemove.length > 0) sendMessage(ws, "unsubscribe", toRemove);
    if (toAdd.length > 0) sendMessage(ws, "subscribe", toAdd);

    subscribedSymbolsRef.current = [...nextSymbols];
  }, [sendMessage]);

  const connect = useCallback(() => {
    const apiKey = import.meta.env.VITE_TRADERMADE_WS_API_KEY;
    if (!apiKey) {
      setStatus("No API Key configured");
      return;
    }

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("Live");
      subscribedSymbolsRef.current = [];
      hasConnectedRef.current = true;
      syncSubscriptions(ws, latestSymbolsRef.current);
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

        if (parsed.symbol && (parsed.mid !== undefined || parsed.bid !== undefined)) {
          setStatus("Live");
          setTicks((prev) => {
            const symbol = WS_SYMBOL_MAP[parsed.symbol] ?? parsed.symbol;
            const bid = parsed.bid != null ? Number(parsed.bid) : undefined;
            const ask = parsed.ask != null ? Number(parsed.ask) : undefined;
            const mid = parsed.mid != null
              ? Number(parsed.mid)
              : (bid != null && ask != null ? (bid + ask) / 2 : undefined);

            if (mid == null) return prev;

            const prevTick = prev[symbol];
            let trend = "neutral";
            if (prevTick) {
              if (mid > prevTick.mid) trend = "up";
              else if (mid < prevTick.mid) trend = "down";
              else trend = prevTick.trend;
            }

            return { ...prev, [symbol]: { ...parsed, symbol, bid, ask, mid, trend } };
          });
        }
      } catch (err) {
        if (typeof data === "string" && !data.includes("Connected") && !data.includes("User Key")) {
          console.error("WebSocket message parsing error:", err);
        }
      }
    };

    ws.onerror = () => setStatus("Connection Error");

    ws.onclose = ({ code }) => {
      wsRef.current = null;
      subscribedSymbolsRef.current = [];
      if (!hasConnectedRef.current) return;
      setStatus(`Disconnected (${code}). Reconnecting...`);
      reconnectTimeoutRef.current = setTimeout(() => {
        if (connectRef.current) connectRef.current();
      }, RECONNECT_DELAY);
    };
  }, [syncSubscriptions]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    connect();
    return () => {
      hasConnectedRef.current = false;
      clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        sendMessage(wsRef.current, "unsubscribe", subscribedSymbolsRef.current);
      }
      subscribedSymbolsRef.current = [];
      if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
      wsRef.current = null;
    };
  }, []);

  useEffect(() => {
    syncSubscriptions(wsRef.current, latestSymbolsRef.current);
  }, [symbolsKey, syncSubscriptions]);

  return { ticks, status, log };
}
