import React from "react";
import { useNavigate } from "react-router-dom";

const TickRow = React.memo(({ tick, decimals = 5, onClick }) => {
  const navigate = useNavigate();
  const handleClick = onClick ?? (() => navigate(`/forex-charts?symbol=${tick.symbol}`));
  const ts = parseInt(tick.ts, 10);
  const timestamp = new Date(isNaN(ts) ? Date.now() : ts).toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });

  const isUp   = tick.trend === "up";
  const isDown = tick.trend === "down";

  // For 2-decimal (stocks/crypto), show last 2 digits large; for 5-decimal FX show last 2 pips large
  const formatPrice = (val) => {
    if (val == null) return { body: "—", pips: "" };
    const s = val.toFixed(decimals);
    if (decimals <= 2) {
      // e.g. 182.45 → body="182.", pips="45"
      const dot = s.indexOf(".");
      return { body: s.slice(0, dot + 1), pips: s.slice(dot + 1) };
    }
    // FX 5dp → body = first 3 digits, pips = last 2
    return { body: s.slice(0, -2), pips: s.slice(-2) };
  };

  const bid = formatPrice(tick.bid);
  const ask = formatPrice(tick.ask);

  // Calculate spread in pips based on price magnitude
  let spread = null;
  if (tick.bid != null && tick.ask != null) {
    const mid = (tick.bid + tick.ask) / 2;
    let pipValue;
    if (mid < 10) {
      pipValue = 0.0001;
    } else if (mid < 100) {
      pipValue = 0.001;
    } else if (mid < 1000) {
      pipValue = 0.01;
    } else if (mid < 10000) {
      pipValue = 0.1;
    } else {
      pipValue = 1;
    }
    const spreadPips = ((tick.ask - tick.bid) / pipValue).toFixed(1);
    spread = spreadPips + " pip";
  }

  return (
    <div onClick={handleClick}
         className={`border-b border-[var(--border)] px-3 py-2
                    transition-colors duration-100 cursor-pointer hover:bg-[var(--bg-hover)]
                    ${isUp ? "bg-emerald-500/[0.04]" : isDown ? "bg-red-500/[0.04]" : ""}`}>

      {/* Row 1: symbol + arrow + time */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-[var(--text-primary)] [font-family:var(--font-display)] tracking-wide">
            {tick.symbol}
          </span>
          {isUp && (
            <svg width="7" height="7" viewBox="0 0 7 7" fill="none">
              <path d="M3.5 1L6.5 6H0.5L3.5 1Z" fill="var(--green)" />
            </svg>
          )}
          {isDown && (
            <svg width="7" height="7" viewBox="0 0 7 7" fill="none">
              <path d="M3.5 6L0.5 1H6.5L3.5 6Z" fill="var(--red)" />
            </svg>
          )}
          {!isUp && !isDown && (
            <svg width="7" height="7" viewBox="0 0 7 7" fill="none">
              <path d="M1 3.5L6 3.5M5 2.5L6 3.5L5 4.5" stroke="white" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
        <span className="font-mono text-[9px] text-[var(--text-dim)] tabular-nums">{timestamp}</span>
      </div>

      {/* Row 2: Bid / Ask */}
      <div className="grid grid-cols-2 gap-1">
        <div className="flex flex-col">
          <span className="font-mono text-[8px] uppercase tracking-widest text-[var(--text-dim)] mb-0.5">Bid</span>
          <div className="flex items-baseline">
            <span className={`font-mono text-[11px] font-medium tabular-nums leading-none
                              ${isDown ? "text-[var(--red)]" : "text-[var(--text-secondary)]"}`}>
              {bid.body}
            </span>
            <span className={`font-mono text-[13px] font-bold tabular-nums leading-none
                              ${isDown ? "text-[var(--red)]" : "text-[var(--text-primary)]"}`}>
              {bid.pips}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end">
          <span className="font-mono text-[8px] uppercase tracking-widest text-[var(--text-dim)] mb-0.5">Ask</span>
          <div className="flex items-baseline">
            <span className={`font-mono text-[11px] font-medium tabular-nums leading-none
                              ${isUp ? "text-[var(--green)]" : "text-[var(--text-secondary)]"}`}>
              {ask.body}
            </span>
            <span className={`font-mono text-[13px] font-bold tabular-nums leading-none
                              ${isUp ? "text-[var(--green)]" : "text-[var(--text-primary)]"}`}>
              {ask.pips}
            </span>
          </div>
        </div>
      </div>

      {/* Row 3: spread + mid */}
      {spread != null && (
        <div className="flex items-center justify-between mt-1">
          <span className="font-mono text-[9px] text-[var(--text-dim)]">
            Spd <span className="text-[var(--text-secondary)]">{spread}</span>
          </span>
          <span className="font-mono text-[9px] text-[var(--text-dim)]">
            Mid <span className="text-[var(--text-secondary)]">{tick.mid?.toFixed(decimals)}</span>
          </span>
        </div>
      )}
    </div>
  );
});

TickRow.displayName = "TickRow";
export default TickRow;
