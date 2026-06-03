import { useEffect, useState } from "react";

const STORAGE_KEY = "fx_chart_settings_v2";
const LEGACY_STORAGE_KEY = "fx_settings_v1";

// Reasonable defaults matching the existing theme.
const DEFAULTS = {
  bullColor: "#059669",
  bearColor: "#dc2626",
  accentColor: "#2563eb",
  background: "#f4f7fb",
  gridColor: "#d9e2ee",
};

// Map setting key → CSS variable name on :root
const CSS_VAR_MAP = {
  bullColor:   "--chart-green",
  bearColor:   "--chart-red",
  accentColor: "--chart-blue",
  background:  "--chart-bg",
  gridColor:   "--chart-grid",
};

const FALLBACK_VAR_MAP = {
  bullColor:   "--green",
  bearColor:   "--red",
  accentColor: "--blue",
  background:  "--bg-base",
  gridColor:   "--border",
};

// Theme-agnostic settings: bull/bear/accent colors look the same in both light
// and dark modes (most users want them consistent), so we always apply them.
// Theme-bound settings: background/grid HAVE to match the active theme — we
// only apply them inline if the saved theme equals the active theme; otherwise
// we strip those two inline vars and let the .dark/.light class take over.
const THEME_AGNOSTIC_KEYS = ["bullColor", "bearColor", "accentColor"];
const THEME_BOUND_KEYS    = ["background", "gridColor"];

const LEGACY_GLOBAL_VARS = ["--green", "--red", "--blue", "--bg-base", "--bg-card"];

function getActiveColorMode() {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function readCssValue(styles, primary, fallback, defaultValue) {
  return styles.getPropertyValue(primary).trim()
    || styles.getPropertyValue(fallback).trim()
    || defaultValue;
}

// Returns the user's saved overrides, or `null` if they've never customized.
// Critical: returning null lets the theme class on <html> control colors normally.
function loadSavedSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch { return null; }
}

// Returns "currently visible" colors by reading the actual CSS variables
// from :root — this naturally reflects light or dark mode without our overrides.
function readCurrentCSSValues() {
  if (typeof document === "undefined") return { ...DEFAULTS };
  const styles = getComputedStyle(document.documentElement);
  const out = {};
  for (const [key, cssVar] of Object.entries(CSS_VAR_MAP)) {
    out[key] = readCssValue(styles, cssVar, FALLBACK_VAR_MAP[key], DEFAULTS[key]);
  }
  return out;
}

// Determines if a hex color (e.g. #ffffff) is dark based on relative luminance.
function isHexColorDark(hex) {
  if (typeof hex !== "string") return true;
  const clean = hex.replace("#", "").trim();
  if (clean.length !== 3 && clean.length !== 6) return true;
  let r, g, b;
  if (clean.length === 3) {
    r = parseInt(clean[0] + clean[0], 16);
    g = parseInt(clean[1] + clean[1], 16);
    b = parseInt(clean[2] + clean[2], 16);
  } else {
    r = parseInt(clean.slice(0, 2), 16);
    g = parseInt(clean.slice(2, 4), 16);
    b = parseInt(clean.slice(4, 6), 16);
  }
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return true;
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness < 128;
}

function loadSanitizedSettings() {
  const saved = loadSavedSettings();
  const currentCSS = readCurrentCSSValues();
  if (!saved) return currentCSS;

  const activeMode = getActiveColorMode();
  const savedMode = saved.colorMode;
  const themeMatches = savedMode != null && savedMode === activeMode;

  if (themeMatches) {
    return { ...currentCSS, ...saved };
  } else {
    const sanitized = { ...saved };
    for (const key of THEME_BOUND_KEYS) {
      sanitized[key] = currentCSS[key];
    }
    return sanitized;
  }
}

function saveSettings(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

function clearSavedSettings() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

function clearLegacySettings() {
  try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* ignore */ }
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const cssVar of LEGACY_GLOBAL_VARS) {
    root.style.removeProperty(cssVar);
  }
}

/**
 * Apply settings as inline CSS variables on :root.
 *
 * Background/grid are only applied inline when the saved colorMode matches
 * the currently active mode — otherwise we'd freeze the chart in the old
 * mode's palette even after the user toggles light/dark (the inline style
 * beats the class-selector CSS).
 */
export function applySettingsToDOM(settings) {
  if (typeof document === "undefined" || !settings) return;
  const root = document.documentElement;
  const activeMode = getActiveColorMode();
  const savedMode = settings.colorMode;
  // Legacy saves (pre-fix) have no colorMode field. We refuse to apply their
  // background/grid because we have no way to know which mode they came from —
  // assuming the wrong mode is exactly how the original "chart-stays-dark-in-
  // light-mode" bug happened. Theme-agnostic keys are still applied.
  const themeMatches = savedMode != null && savedMode === activeMode;

  // Self-healing: even if colorMode matches, check that the saved background
  // color matches the active theme's brightness, preventing corrupted dark
  // values from persisting in light mode.
  const isCurrentlyDark = activeMode === "dark";
  const savedBg = settings.background;
  const bgMatchesTheme = savedBg == null || isHexColorDark(savedBg) === isCurrentlyDark;
  const shouldApplyThemeBound = themeMatches && bgMatchesTheme;

  // Theme-agnostic: always apply.
  for (const key of THEME_AGNOSTIC_KEYS) {
    const value = settings[key];
    const cssVar = CSS_VAR_MAP[key];
    if (cssVar && typeof value === "string") {
      root.style.setProperty(cssVar, value);
    }
  }

  // Theme-bound: only apply if the saved mode matches and background brightness aligns;
  // otherwise strip any stale inline override so the .dark/.light class controls the var.
  for (const key of THEME_BOUND_KEYS) {
    const value = settings[key];
    const cssVar = CSS_VAR_MAP[key];
    if (!cssVar) continue;
    if (shouldApplyThemeBound && typeof value === "string") {
      root.style.setProperty(cssVar, value);
    } else {
      root.style.removeProperty(cssVar);
    }
  }

  window.dispatchEvent(new CustomEvent("tm-theme-change"));
}

/**
 * Strip all inline overrides we set, returning theme control to the
 * `dark`/`light` class on <html>. Used by Reset.
 */
export function clearSettingsFromDOM() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const cssVar of Object.values(CSS_VAR_MAP)) {
    root.style.removeProperty(cssVar);
  }
  window.dispatchEvent(new CustomEvent("tm-theme-change"));
}

// Boot-time:
//  1. Strip any stale inline overrides we (or a previous version of us) wrote.
//     This is critical: a leftover `style="--chart-bg: #0b111c"` from a previous
//     session would pin the chart canvas to dark forever — inline style beats
//     the .dark/.light class selector in CSS specificity.
//  2. Re-apply the user's saved settings cleanly. applySettingsToDOM now only
//     writes background/grid when the saved colorMode matches the active mode,
//     so the chart canvas correctly follows the theme either way.
//  3. Bind a listener so future theme toggles re-evaluate the same way.
export function bootApplySettings() {
  clearLegacySettings();
  // ALWAYS strip first — guarantees a clean slate even when no saved settings
  // exist (e.g. user reset, or stale state from before this fix landed).
  clearSettingsFromDOM();
  const saved = loadSavedSettings();
  if (saved) applySettingsToDOM(saved);

  // Re-evaluate inline overrides whenever the user toggles light/dark mode.
  if (typeof window !== "undefined" && !window.__tmThemeSyncBound) {
    window.__tmThemeSyncBound = true;
    window.addEventListener("tm-colormode-change", () => {
      // Strip first so we never carry over the previous mode's values.
      clearSettingsFromDOM();
      const current = loadSavedSettings();
      if (current) applySettingsToDOM(current);
    });
  }
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
  // Initial draft: load sanitized settings where theme-bound keys align with the active mode.
  const [draft, setDraft] = useState(() => loadSanitizedSettings());

  // Reload from storage every time the modal opens — pick up theme-mode changes too
  useEffect(() => {
    if (open) {
      setDraft(loadSanitizedSettings());
    }
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
    // Tag the saved blob with the current colorMode so that on a later theme
    // toggle we know whether the background/grid values are safe to apply.
    const stamped = { ...draft, colorMode: getActiveColorMode() };
    saveSettings(stamped);
    applySettingsToDOM(stamped);
    onClose();
  };

  // Reset: remove saved customizations AND remove inline CSS overrides so the
  // active theme class (.dark/.light) takes over again. The chart immediately
  // reflects light or dark mode based on whichever theme is currently active.
  const handleReset = () => {
    clearSavedSettings();
    clearSettingsFromDOM();
    setDraft(readCurrentCSSValues());
  };

  const handleCancel = () => {
    // Restore what was previously saved — or strip overrides if nothing was saved.
    const saved = loadSavedSettings();
    if (saved) {
      applySettingsToDOM(saved);
      setDraft(saved);
    } else {
      clearSettingsFromDOM();
      setDraft(readCurrentCSSValues());
    }
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
