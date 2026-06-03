import { useEffect, useState } from "react";
import { useSharedMarketData } from "../context/MarketDataContext.jsx";
import TickRow from "./TickRow";
import { MARKETS } from "../constants/constants";
import { loadLiveRateTickers } from "../constants/liveRates";

export default function TickerPanel({ activeMarketId, selectedSymbol, onSymbolSelect }) {
  const [watchlist, setWatchlist] = useState(loadLiveRateTickers);
  const { ticks, status } = useSharedMarketData(watchlist);

  useEffect(() => {
    const sync = () => setWatchlist(loadLiveRateTickers());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  const isLive       = status === "Live";
  const isConnecting = status === "Authenticating..." || status === "Connecting...";
  const isError      = !isLive && !isConnecting;

  return (
    <div className="flex flex-col h-full">

      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2.5 shrink-0">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-dim)]
                         [font-family:var(--font-display)]">
          Live Rates
        </span>
        <div className="flex items-center gap-1.5">
          <div
            className="h-1.5 w-1.5 rounded-full shrink-0"
            style={isLive
              ? { background: "var(--green)", animation: "pulse-dot 1.6s ease infinite" }
              : isError
              ? { background: "var(--red)" }
              : { background: "#f59e0b", animation: "pulse-dot 1.2s ease infinite" }}
          />
          <span className={`font-mono text-[9px] font-semibold uppercase tracking-wider
                            ${isLive ? "text-[var(--green)]" : isError ? "text-[var(--red)]" : "text-[#f59e0b]"}`}>
            {isLive ? "WS Live" : isConnecting ? "Connecting" : "Offline"}
          </span>
        </div>
      </div>

      {/* States */}
      {isConnecting && Object.keys(ticks).length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-8 px-4">
          <div className="h-5 w-5 rounded-full border-2 border-[var(--bg-card)] border-t-[var(--blue)]"
               style={{ animation: "spin 0.7s linear infinite" }} />
          <span className="font-mono text-[10px] text-[var(--text-dim)] text-center">Connecting…</span>
        </div>
      )}

      {isError && (
        <div className="py-6 px-3 font-mono text-[10px] text-[var(--red)]">
          <p className="font-semibold">Feed offline</p>
          <p className="mt-1 text-[var(--text-dim)]">Start server.js to enable live rates</p>
        </div>
      )}

      {/* Shared watchlist */}
      <div className="flex-1 overflow-y-auto">
        {(() => {
          const market = MARKETS.find((m) => m.id === activeMarketId) ?? MARKETS[0];
          const st = market.getStatus();
          const allSymbols = MARKETS.flatMap((m) => m.symbols);

          return (
            <div>
              <div className="flex items-center justify-between px-3 py-1.5 sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--blue)]/10">
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={st.open
                      ? { background: "var(--green)", animation: "pulse-dot 2s ease infinite" }
                      : { background: "var(--text-dim)" }}
                  />
                  <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--blue)]">
                    Watchlist
                  </span>
                </div>
                <span className={`font-mono text-[8px] uppercase tracking-wider ${st.open ? "text-[var(--green)]" : "text-[var(--text-dim)]"}`}>
                  {watchlist.length} symbols
                </span>
              </div>

              {watchlist.length === 0 ? (
                <div className="px-3 py-2 font-mono text-[9px] text-[var(--text-dim)]">
                  No live-rate symbols selected
                </div>
              ) : (
                watchlist.map((sym) => {
                  const tick = ticks[sym];
                  const symDef = market.symbols.find((s) => s.sym === sym)
                    ?? allSymbols.find((s) => s.sym === sym);

                  // Build a click handler that mutates parent state directly
                  // (used when the watchlist is rendered inside TradingPortal).
                  // When `onSymbolSelect` isn't supplied (e.g. on the Live Rates
                  // landing page), TickRow falls back to its default `navigate`
                  // behavior — fresh mount of TradingPortal reads the URL on
                  // mount, so that path works fine.
                  const rowOnClick = onSymbolSelect
                    ? () => onSymbolSelect(sym)
                    : undefined;

                  if (!tick) {
                    return (
                      <div
                        key={sym}
                        onClick={rowOnClick}
                        className={`px-3 py-2 border-b border-[var(--border)] font-mono text-[9px] text-[var(--text-dim)]
                                    ${rowOnClick ? "cursor-pointer hover:bg-[var(--bg-hover)]" : ""}`}
                      >
                        <span className="text-[var(--blue)] font-bold tracking-wider">{sym}</span>
                        <span className="ml-2">{isLive ? "Waiting for tick…" : "—"}</span>
                      </div>
                    );
                  }

                  return (
                    <TickRow
                      key={tick.symbol}
                      tick={tick}
                      decimals={symDef?.decimals ?? 5}
                      onClick={rowOnClick}
                    />
                  );
                })
              )}
            </div>
          );
        })()}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-[var(--border)] px-3 py-1.5">
        <p className="font-mono text-[9px] text-[var(--text-dim)] text-center uppercase tracking-wider">
          TraderMade WebSocket · Shared Live Rates Watchlist
        </p>
      </div>
    </div>
  );
}
