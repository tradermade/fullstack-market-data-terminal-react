export const LIVE_RATES_STORAGE_KEY = "lr_tickers_v2";
export const LIVE_RATES_MAX_SYMBOLS = 110;

export const LIVE_RATES_DEFAULT_TICKERS = [
  "GBPUSD", "EURUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "BTCUSD", "ETHUSD", "XRPUSD",
];

export function clampLiveRateTickers(tickers) {
  if (!Array.isArray(tickers)) return [...LIVE_RATES_DEFAULT_TICKERS];

  const seen = new Set();
  const cleaned = [];

  for (const sym of tickers) {
    if (typeof sym !== "string") continue;
    const trimmed = sym.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    cleaned.push(trimmed);
    if (cleaned.length >= LIVE_RATES_MAX_SYMBOLS) break;
  }

  return cleaned.length > 0 ? cleaned : [...LIVE_RATES_DEFAULT_TICKERS];
}

export function loadLiveRateTickers() {
  try {
    const raw = localStorage.getItem(LIVE_RATES_STORAGE_KEY);
    if (raw) return clampLiveRateTickers(JSON.parse(raw));
  } catch {}
  return [...LIVE_RATES_DEFAULT_TICKERS];
}

export function saveLiveRateTickers(tickers) {
  const clamped = clampLiveRateTickers(tickers);
  try {
    localStorage.setItem(LIVE_RATES_STORAGE_KEY, JSON.stringify(clamped));
  } catch {}
  return clamped;
}
