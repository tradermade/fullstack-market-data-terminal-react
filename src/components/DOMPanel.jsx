import { useMemo } from "react";
import { useSharedMarketData } from "../context/MarketDataContext.jsx";

function formatVolume(v) {
  if (!Number.isFinite(v)) return "";
  if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(2) + "B";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(0) + "K";
  return String(Math.round(v));
}

function formatPrice(p, decimals) {
  if (!Number.isFinite(p)) return "";
  return Number(p).toFixed(decimals ?? 5);
}

export default function DOMPanel({ symbol, decimals = 5, maxLevels = 8 }) {
  const liveSymbols = useMemo(() => (symbol ? [symbol] : []), [symbol]);
  const { ladders, hasLadder } = useSharedMarketData(liveSymbols);
  const ladder = ladders?.[symbol];

  // Find the largest volume across both sides so heat bars share a scale
  const maxVol = useMemo(() => {
    if (!ladder) return 0;
    let m = 0;
    for (const lvl of ladder.asks || []) if (lvl.volume > m) m = lvl.volume;
    for (const lvl of ladder.bids || []) if (lvl.volume > m) m = lvl.volume;
    return m;
  }, [ladder]);

  if (!hasLadder) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-3 text-center">
        <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-dim)]">
          Depth data
        </span>
        <span className="mt-1 font-mono text-[9px] text-[var(--text-dim)]">
          Not enabled on this account
        </span>
      </div>
    );
  }

  const asks = (ladder?.asks ?? []).slice(0, maxLevels).reverse(); // worst → best
  const bids = (ladder?.bids ?? []).slice(0, maxLevels);           // best → worst
  const spread = ladder?.bestBid != null && ladder?.bestAsk != null
    ? ladder.bestAsk - ladder.bestBid
    : null;
  const spreadPips = spread != null
    ? (decimals >= 4 ? spread * 10_000 : spread * 100)
    : null;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-[var(--blue)]" style={{ animation: "pulse-dot 1.6s ease infinite" }} />
          <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--blue)]">
            Depth
          </span>
        </div>
        <span className="font-mono text-[9px] text-[var(--text-dim)]">{symbol}</span>
      </div>

      {/* Ladder rows */}
      {!ladder ? (
        <div className="flex flex-1 items-center justify-center px-3 text-center">
          <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-dim)]">
            Waiting for depth…
          </span>
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-y-auto">
          {/* Column header */}
          <div className="sticky top-0 z-10 grid shrink-0 grid-cols-3 border-b border-[var(--border)] bg-[var(--bg-panel)] px-2 py-1">
            <span className="font-mono text-[8px] uppercase tracking-wider text-[var(--text-dim)]">Bid</span>
            <span className="text-center font-mono text-[8px] uppercase tracking-wider text-[var(--text-dim)]">Price</span>
            <span className="text-right font-mono text-[8px] uppercase tracking-wider text-[var(--text-dim)]">Ask</span>
          </div>

          {/* Ask levels (top, descending so best ask is right above the spread bar) */}
          {asks.map((lvl, i) => {
            const pct = maxVol > 0 ? Math.min(100, (lvl.volume / maxVol) * 100) : 0;
            return (
              <div key={`a-${i}`} className="relative grid grid-cols-3 items-center px-2 py-0.5 hover:bg-[var(--bg-hover)]">
                {/* Heat bar fills from the RIGHT for ask side */}
                <div
                  className="pointer-events-none absolute inset-y-0 right-0"
                  style={{ width: `${pct}%`, background: "rgba(239,68,68,0.10)" }}
                />
                <span className="relative font-mono text-[9px] text-[var(--text-dim)]">—</span>
                <span className="relative text-center font-mono text-[10px] font-semibold text-[var(--red)]">
                  {formatPrice(lvl.price, decimals)}
                </span>
                <span className="relative text-right font-mono text-[9px] font-semibold text-[var(--text-secondary)]">
                  {formatVolume(lvl.volume)}
                </span>
              </div>
            );
          })}

          {/* Spread divider */}
          <div className="flex shrink-0 items-center justify-center gap-2 border-y border-[var(--border-bright)] bg-[var(--bg-card)] px-2 py-1">
            <span className="font-mono text-[8px] uppercase tracking-widest text-[var(--text-dim)]">Spread</span>
            <span className="font-mono text-[9px] font-bold text-[var(--blue)]">
              {spreadPips != null ? spreadPips.toFixed(1) + " pip" : "—"}
            </span>
          </div>

          {/* Bid levels */}
          {bids.map((lvl, i) => {
            const pct = maxVol > 0 ? Math.min(100, (lvl.volume / maxVol) * 100) : 0;
            return (
              <div key={`b-${i}`} className="relative grid grid-cols-3 items-center px-2 py-0.5 hover:bg-[var(--bg-hover)]">
                {/* Heat bar fills from the LEFT for bid side */}
                <div
                  className="pointer-events-none absolute inset-y-0 left-0"
                  style={{ width: `${pct}%`, background: "rgba(34,197,94,0.10)" }}
                />
                <span className="relative font-mono text-[9px] font-semibold text-[var(--text-secondary)]">
                  {formatVolume(lvl.volume)}
                </span>
                <span className="relative text-center font-mono text-[10px] font-semibold text-[var(--green)]">
                  {formatPrice(lvl.price, decimals)}
                </span>
                <span className="relative text-right font-mono text-[9px] text-[var(--text-dim)]">—</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
