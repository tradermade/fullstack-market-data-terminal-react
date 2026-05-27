import { useEffect, useState } from "react";

const STORAGE_KEY = "fx_settings_v1";

// Reasonable defaults matching the existing theme.
const DEFAULTS = {
  bullColor: "#22c55e",   // up candle  (--green)
  bearColor: "#ef4444",   // down candle (--red)
  accentColor: "#3b82f6", // line/labels (--blue)
  background: "#0a0e17",  // chart bg    (--bg-base)
  gridColor: "#1f2937",   // grid lines  (--bg-card)
};

// Map setting key → CSS variable name on :root
const CSS_VAR_MAP = {
  bullColor:   "--green",
  bearColor:   "--red",
  accentColor: "--blue",
  background:  "--bg-base",
  gridColor:   "--bg-card",
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch { return { ...DEFAULTS }; }
}

function saveSettings(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

/**
 * Apply settings as CSS variables on the document root.
 * Called on app boot AND whenever the user tweaks a value.
 */
export function applySettingsToDOM(settings) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(settings)) {
    const cssVar = CSS_VAR_MAP[key];
    if (cssVar && typeof value === "string") {
      root.style.setProperty(cssVar, value);
    }
  }
  // Tell the chart to rebuild its theme tokens
  window.dispatchEvent(new CustomEvent("tm-theme-change"));
}

// Boot-time apply — call once when the app starts so persisted settings stick.
export function bootApplySettings() {
  applySettingsToDOM(loadSettings());
}

function ColorRow({ label, value, onChange, hint }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] py-2.5">
      <div className="flex flex-col">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--text-primary)]">
          {label}
        </span>
        {hint && (
          <span className="font-mono text-[9px] text-[var(--text-dim)]">{hint}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck="false"
          className="w-20 rounded border border-[var(--border-bright)] bg-[var(--bg-card)] px-1.5 py-0.5
                     font-mono text-[10px] text-[var(--text-primary)] outline-none focus:border-[var(--blue)]"
        />
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-6 w-8 cursor-pointer rounded border border-[var(--border-bright)] bg-transparent"
        />
      </div>
    </div>
  );
}

export default function SettingsModal({ open, onClose }) {
  const [draft, setDraft] = useState(loadSettings);

  // Reload from storage every time the modal opens
  useEffect(() => {
    if (open) setDraft(loadSettings());
  }, [open]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Live-preview: apply each change immediately so the user sees it on the chart
  const updateField = (key, value) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    applySettingsToDOM(next);
  };

  const handleSave = () => {
    saveSettings(draft);
    applySettingsToDOM(draft);
    onClose();
  };

  const handleReset = () => {
    setDraft({ ...DEFAULTS });
    applySettingsToDOM({ ...DEFAULTS });
  };

  const handleCancel = () => {
    // Restore what was previously saved (discard live previews)
    const saved = loadSettings();
    applySettingsToDOM(saved);
    setDraft(saved);
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[420px] max-w-[92vw] rounded-md border border-[var(--border-bright)] bg-[var(--bg-panel)] shadow-2xl shadow-black/50"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <span className="font-mono text-[12px] font-bold uppercase tracking-wider text-[var(--text-primary)]">
            Chart Settings
          </span>
          <button
            onClick={handleCancel}
            className="font-mono text-[16px] text-[var(--text-dim)] hover:text-[var(--text-primary)]"
          >
            ×
          </button>
        </div>

        {/* Section: Candles */}
        <div className="px-4 py-2">
          <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--blue)]">
            Candles
          </span>
          <ColorRow
            label="Bullish (Up)"
            value={draft.bullColor}
            onChange={(v) => updateField("bullColor", v)}
            hint="Color for rising candles"
          />
          <ColorRow
            label="Bearish (Down)"
            value={draft.bearColor}
            onChange={(v) => updateField("bearColor", v)}
            hint="Color for falling candles"
          />
        </div>

        {/* Section: Theme */}
        <div className="px-4 py-2">
          <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--blue)]">
            Theme
          </span>
          <ColorRow
            label="Accent"
            value={draft.accentColor}
            onChange={(v) => updateField("accentColor", v)}
            hint="Last-price line, active buttons"
          />
          <ColorRow
            label="Background"
            value={draft.background}
            onChange={(v) => updateField("background", v)}
            hint="Chart background"
          />
          <ColorRow
            label="Grid"
            value={draft.gridColor}
            onChange={(v) => updateField("gridColor", v)}
            hint="Gridlines color"
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] px-4 py-3">
          <button
            onClick={handleReset}
            className="rounded border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5
                       font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)]
                       hover:text-[var(--text-primary)]"
          >
            Reset to defaults
          </button>
          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              className="rounded border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5
                         font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]
                         hover:text-[var(--text-primary)]"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="rounded border border-[var(--blue)] bg-[var(--blue)] px-3 py-1.5
                         font-mono text-[10px] font-semibold uppercase tracking-wider text-white
                         hover:bg-[var(--blue)]/90"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
