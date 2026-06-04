import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MARKETS } from "../constants/constants";
import { brandBadge, brandLogoUrl, brandName } from "../config/branding";

function getInitialColorMode() {
  try {
    return localStorage.getItem("colorMode") === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export default function NavBar({ activeMarket, onMarketChange }) {
  const navigate = useNavigate();
  const [time, setTime] = useState(new Date());
  const [colorMode, setColorMode] = useState(getInitialColorMode);

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const isDark = colorMode === "dark";
    document.documentElement.classList.toggle("dark", isDark);
    try {
      localStorage.setItem("colorMode", colorMode);
    } catch {
      // Storage can be unavailable in private browsing.
    }
    // Notify SettingsModal first so it can strip stale inline overrides for the
    // *previous* mode (e.g. a dark `--chart-bg` pinned via inline style) before
    // the chart picks up the new theme tokens. Order matters: re-evaluating
    // overrides BEFORE the chart's own theme-change handler ensures the chart
    // reads the now-correct CSS variables when it rebuilds.
    window.dispatchEvent(new CustomEvent("tm-colormode-change", { detail: { colorMode } }));
    window.dispatchEvent(new CustomEvent("tm-theme-change", { detail: { colorMode } }));
  }, [colorMode]);

  const hh = String(time.getUTCHours()).padStart(2, "0");
  const mm = String(time.getUTCMinutes()).padStart(2, "0");
  const ss = String(time.getUTCSeconds()).padStart(2, "0");

  const currentMarket = MARKETS.find(m => m.id === activeMarket);
  const marketStatus = currentMarket?.getStatus() ?? { open: true, label: "Live" };

  return (
    <nav className="flex h-11 shrink-0 items-center justify-between
                    border-b border-[var(--border)] bg-[var(--bg-panel)] px-4">

      {/* Logo — URL is read from VITE_LOGO_URL in your .env (Vite inlines
          import.meta.env at build time, so you need to rebuild after changing it). */}
      <div className="flex items-center gap-2.5 shrink-0 mr-6">
        <div className="h-6 w-7 overflow-hidden shrink-0">
          <img
            src={brandLogoUrl}
            alt=""
            className="h-6 max-w-none object-left object-contain"
          />
        </div>
        <span className="text-[18px] font-semibold leading-none text-[var(--text-primary)] tracking-normal">
          {brandName}
        </span>
        <span className="rounded bg-[var(--blue)]/15 px-1.5 py-0.5 text-[9px]
                         font-bold tracking-widest text-[var(--blue)] uppercase">
          {brandBadge}
        </span>
      </div>

      {/* Market tabs */}
      <div className="flex items-stretch h-full gap-1">
        {MARKETS.map((m) => {
          const st = m.getStatus();
          const isActive = m.id === activeMarket;
          const showDivider = false;
          return (
            <div key={m.id} className="flex items-stretch">
              {showDivider && (
                <div className="flex items-center px-2">
                  <div className="h-4 w-px bg-[var(--border-bright)]" />
                </div>
              )}
              <button
                onClick={() => onMarketChange(m.id)}
                className={`relative flex items-center gap-1.5 px-4 text-[11px] font-semibold
                           uppercase tracking-wider transition-colors duration-150 whitespace-nowrap
                           [font-family:var(--font-display)] border-b-2
                           ${isActive
                             ? "border-b-[var(--blue)] text-[var(--text-primary)]"
                             : "border-b-transparent text-[var(--text-dim)] hover:text-[var(--text-secondary)]"
                           }`}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full shrink-0"
                  style={st.open
                    ? { background: "var(--green)", animation: "pulse-dot 2s ease infinite" }
                    : { background: "var(--text-dim)" }}
                />
                {m.label}
              </button>
            </div>
          );
        })}
      </div>

      {/* Right */}
      <div className="flex items-center gap-4 ml-auto shrink-0">
        <ThemeToggle
          colorMode={colorMode}
          onToggle={() => setColorMode((mode) => mode === "dark" ? "light" : "dark")}
        />

        {/* Market status pill */}
        <div className={`hidden sm:flex items-center gap-1.5 rounded px-2 py-1
                         border text-[10px] font-mono font-semibold uppercase tracking-wider
                         ${marketStatus.open
                           ? "border-[var(--green)]/30 bg-[var(--green)]/5 text-[var(--green)]"
                           : "border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-dim)]"
                         }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${marketStatus.open ? "bg-[var(--green)]" : "bg-[var(--text-dim)]"}`}
                style={marketStatus.open ? { animation: "pulse-dot 2s ease infinite" } : {}} />
          {marketStatus.label}
        </div>

        <div className="h-4 w-px bg-[var(--border)] hidden sm:block" />

        {/* UTC clock */}
        <div className="hidden sm:flex items-center gap-1.5">
          <span className="font-mono text-[9px] text-[var(--text-dim)] uppercase tracking-wider">UTC</span>
          <span className="font-mono text-[12px] font-semibold text-[var(--text-secondary)] tabular-nums">
            {hh}:{mm}:{ss}
          </span>
        </div>

        <div className="h-4 w-px bg-[var(--border)] hidden sm:block" />

        {/* Live Rates link */}
        <button
          onClick={() => navigate("/")}
          className="hidden sm:flex items-center gap-1.5 rounded border border-[var(--border-bright)]
                     bg-[var(--bg-card)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide
                     text-[var(--text-secondary)] hover:text-[var(--text-primary)]
                     hover:border-[var(--blue)] transition-colors duration-150
                     [font-family:var(--font-display)]"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--green)]"
                style={{ animation: "pulse-dot 2s ease infinite" }} />
          Live Rates
        </button>

      </div>
    </nav>
  );
}

function ThemeToggle({ colorMode, onToggle }) {
  const isDark = colorMode === "dark";
  return (
    <button
      type="button"
      onClick={onToggle}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="hidden sm:flex h-7 w-7 items-center justify-center rounded border border-[var(--border-bright)]
                 bg-[var(--bg-card)] text-[var(--text-secondary)] transition-colors duration-150
                 hover:border-[var(--blue)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1.5v1.4M8 13.1v1.4M3.4 3.4l1 1M11.6 11.6l1 1M1.5 8h1.4M13.1 8h1.4M3.4 12.6l1-1M11.6 4.4l1-1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M12.8 10.6A5.5 5.5 0 0 1 5.4 3.2 5.8 5.8 0 1 0 12.8 10.6Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
