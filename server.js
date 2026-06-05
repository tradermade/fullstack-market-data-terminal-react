import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());

// Startup timestamp
const startupTime = new Date().toISOString();
console.log(`\n⏰ Server started: ${startupTime}\n`);

// Serve frontend static files from dist/
app.use(express.static(path.join(__dirname, 'dist')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Read the new (unprefixed) env var names, falling back to the old VITE_*
// names so existing .env files keep working. Server-only vars don't need
// the VITE_ prefix — that prefix is only required for variables the browser
// bundle reads via import.meta.env.
const REST_API_KEY = process.env.TRADERMADE_API_KEY    
const API_KEY      = process.env.TRADERMADE_WS_API_KEY 

if (!API_KEY) {
  console.error("❌ FATAL: TRADERMADE_WS_API_KEY is missing in your .env file!");
} else {
  console.log("🔑 WS API Key found, starting proxy...");
}

if (!REST_API_KEY) {
  console.error("❌ FATAL: TRADERMADE_API_KEY is missing in your .env file!");
} else {
  console.log("🔑 REST API Key found, adding proxy routes...");
}

// ── REST API Proxy for timeseries data ────────────────────────────────────
// TraderMade limits: minute = max 2 days, hourly = max 1 month, daily = max 1 year
const MAX_SPAN_MS = {
  minute: 2 * 24 * 60 * 60 * 1000,    // 2 days
  hourly: 30 * 24 * 60 * 60 * 1000,   // 30 days
  daily:  365 * 24 * 60 * 60 * 1000,  // 1 year
};

const FX_MARKET_STEP_MS = 15 * 60 * 1000;

function isFxMarketOpenAt(timestampMs) {
  const date = new Date(timestampMs);
  const day = date.getUTCDay();
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes();

  if (day === 6) return false;
  if (day === 0) return minutes >= 21 * 60;
  if (day === 5) return minutes < 22 * 60;
  return true;
}

function estimateFxMarketOpenMs(startMs, endMs) {
  let cursor = startMs;
  let openMs = 0;

  while (cursor < endMs) {
    const next = Math.min(cursor + FX_MARKET_STEP_MS, endMs);
    const midpoint = cursor + Math.floor((next - cursor) / 2);
    if (isFxMarketOpenAt(midpoint)) {
      openMs += next - cursor;
    }
    cursor = next;
  }

  return openMs;
}

function getMaxSpanMs(interval, period) {
  // TraderMade rejects 1m/5m ranges that cross more than 2 working days.
  // Calendar 48h chunks can still touch 3 working dates, so use 1-day chunks
  // for those granularities and dedupe the overlapped chunk boundary later.
  if (interval === "minute" && Number(period) <= 5) {
    return 24 * 60 * 60 * 1000;
  }
  return MAX_SPAN_MS[interval] || MAX_SPAN_MS.daily;
}

function clampRequestWindow(start, end, interval, period) {
  if (!start || !end) return { start, end };

  // Use TraderMade's perceived "now" (learned from response Date headers) so
  // we don't send end_date past their clock. Fall back to local clock if we
  // haven't yet seen a response.
  const tmNowMs = tmNow();
  // Keep only a small safety buffer. Subtracting a whole candle bucket makes
  // 15m/30m/1h/4h charts miss the latest already-closed candle.
  const safetyMs = 60_000;
  const safeNow = new Date(tmNowMs - safetyMs);
  let safeEnd = end > safeNow ? safeNow : end;
  let safeStart = start;

  if (safeStart >= safeEnd) {
    const bucket = bucketDurationMs(interval, period);
    safeStart = new Date(safeEnd.getTime() - bucket);
  }

  return { start: safeStart, end: safeEnd };
}

function parseFlexDate(s) {
  if (!s) return null;
  // Handle "YYYY-MM-DD HH:MM" or "YYYY-MM-DD"
  const clean = s.replace(/-(\d{2}:\d{2})$/, ' $1'); // fix "YYYY-MM-DD-HH:MM" format
  return new Date(clean.includes(':') ? clean + ' UTC' : clean + 'T00:00:00Z');
}

function fmtDate(d, intraday) {
  const y  = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  if (!intraday) return `${y}-${mo}-${da}`;
  const h  = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  return `${y}-${mo}-${da} ${h}:${mi}`;
}

function safeQueryObject(params) {
  const safe = Object.fromEntries(params.entries());
  if (safe.api_key) safe.api_key = "****";
  return safe;
}

function maskApiKeyInUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has("api_key")) {
      parsed.searchParams.set("api_key", "****");
    }
    return parsed.toString();
  } catch (_) {
    return String(url).replace(/([?&]api_key=)[^&]+/i, "$1****");
  }
}

function logIncomingRestQuery(route, query) {
  console.log(`📥 Market data server REST query ${route}: ${JSON.stringify(query)}`);
}

function logTraderMadeRestRequest(route, url, params) {
  console.log(`📤 TraderMade Market Data REST ${route}: ${maskApiKeyInUrl(url)}`);
  console.log(`   Query: ${JSON.stringify(safeQueryObject(params))}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// TraderMade's perceived "now" minus our local "now", in ms. Negative = TM
// thinks it's earlier than we do (their clock is behind ours). We learn this
// from the HTTP `Date` header on every successful response.
let tmClockOffsetMs = 0;

function updateTmClockOffset(response) {
  try {
    const dateHeader = response.headers?.get?.("date");
    if (!dateHeader) return;
    const tmTime = Date.parse(dateHeader);
    if (!Number.isFinite(tmTime)) return;
    const newOffset = tmTime - Date.now();
    // Smooth: if we already have an offset, take a weighted average so a
    // single rogue header doesn't yank us around.
    tmClockOffsetMs = tmClockOffsetMs
      ? Math.round(tmClockOffsetMs * 0.7 + newOffset * 0.3)
      : newOffset;
  } catch { /* ignore */ }
}

function tmNow() { return Date.now() + tmClockOffsetMs; }

async function fetchTraderMadeJson(url, attempts = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      updateTmClockOffset(response);
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        const message = body
          ? `TraderMade API returned ${response.status}: ${body.slice(0, 240)}`
          : `TraderMade API returned ${response.status}`;
        const error = new Error(message);
        error.status = response.status;
        throw error;
      }
      return response.json();
    } catch (error) {
      lastError = error;
      const retryable = !error.status || error.status === 429 || error.status >= 500;
      if (!retryable || attempt === attempts) break;
      console.warn(`TraderMade REST fetch failed (${error.message}); retrying ${attempt}/${attempts - 1}`);
      await sleep(250 * attempt);
    }
  }

  throw lastError;
}

async function fetchChunk(currency, start, end, interval, period, format, weekend, intraday) {
  const buildRequest = (weekendValue, customEnd) => {
    const finalEnd = customEnd || end;
    const params = new URLSearchParams({
      currency,
      api_key: REST_API_KEY,
      format: format || 'records',
      start_date: fmtDate(start, intraday),
      end_date: fmtDate(finalEnd, intraday),
    });
    if (interval) params.append('interval', interval);
    if (period) params.append('period', period);
    if (weekendValue) params.append('weekend', weekendValue);

    return {
      params,
      url: `https://marketdata.tradermade.com/api/v1/timeseries?${params.toString()}`,
    };
  };

  const fetchRequest = async (weekendValue, customEnd) => {
    const { params, url } = buildRequest(weekendValue, customEnd);
    logTraderMadeRestRequest("/api/v1/timeseries", url, params);
    try {
      return await fetchTraderMadeJson(url);
    } catch (error) {
      // Auto-recover from "end_date in the future" — happens on cold start
      // before we've learned TM's clock offset, or if user's clock is way ahead.
      // Retry with end_date clamped to TM's now (now learned from the failed
      // response's Date header) minus a safety bucket.
      const msg = String(error?.message || "");
      if (error?.status === 400 && /end_date.*future/i.test(msg) && !customEnd) {
        const safeEnd = new Date(tmNow() - 60_000);
        console.warn(`📅 TM rejected end_date as future; retrying with clamped end_date=${fmtDate(safeEnd, intraday)} (TM clock offset: ${tmClockOffsetMs}ms)`);
        return fetchRequest(weekendValue, safeEnd);
      }
      throw error;
    }
  };

  try {
    return await fetchRequest(weekend);
  } catch (error) {
    if (weekend === "true") {
      console.warn(`TraderMade REST failed with weekend=true (${error.message}); retrying without weekend flag`);
      return fetchRequest(undefined);
    }
    throw error;
  }
}

// ── REST API Proxy for historical price data ────────────────────────────────
app.get('/api/v1/historical', async (req, res) => {
  try {
    logIncomingRestQuery("/api/v1/historical", req.query);
    const { currency, date } = req.query;
    
    if (!currency || !date) {
      return res.status(400).json({ error: "Missing currency or date parameter" });
    }

    const params = new URLSearchParams({
      currency,
      date,
      api_key: REST_API_KEY,
      format: "records",
    });
    const url = `https://marketdata.tradermade.com/api/v1/historical?${params.toString()}`;
    logTraderMadeRestRequest("/api/v1/historical", url, params);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`TraderMade API returned ${response.status}`);
    }
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Historical proxy error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/timeseries', async (req, res) => {
  try {
    logIncomingRestQuery("/api/timeseries", req.query);
    const { currency, start_date, end_date, interval, period, format, weekend } = req.query;

    if (!currency) {
      return res.status(400).json({ error: "Missing currency parameter" });
    }

    const intraday = interval && interval !== "daily";
    const periodNum = period ? Number(period) : 1;
    let startD = parseFlexDate(start_date);
    let endD = parseFlexDate(end_date);
    ({ start: startD, end: endD } = clampRequestWindow(startD, endD, interval, periodNum));
    const startMs = startD?.getTime();
    const endMs = endD?.getTime();
    const maxSpan = getMaxSpanMs(interval, periodNum);

    if (
      weekend === "false" &&
      interval === "minute" &&
      periodNum <= 5 &&
      Number.isFinite(startMs) &&
      Number.isFinite(endMs) &&
      estimateFxMarketOpenMs(startMs, endMs) > MAX_SPAN_MS.minute + FX_MARKET_STEP_MS
    ) {
      return res.status(400).json({
        error: "FX minute history is limited to 48 market-open hours per request; use 15M, 1H or 1D for longer ranges.",
      });
    }

    // Helper: fetch fresh from TraderMade (with chunking for big ranges)
    const fetchFreshFromTM = async (s, e) => {
      if ((e - s) <= maxSpan) {
        const d = await fetchChunk(currency, s, e, interval, periodNum, format, weekend, intraday);
        return { meta: d, quotes: Array.isArray(d.quotes) ? d.quotes : [] };
      }
      let all = [], meta = null, cs = new Date(s.getTime());
      while (cs < e) {
        let ce = new Date(cs.getTime() + maxSpan);
        if (ce > e) ce = e;
        const d = await fetchChunk(currency, cs, ce, interval, periodNum, format, weekend, intraday);
        if (!meta) meta = d;
        if (Array.isArray(d.quotes)) all = all.concat(d.quotes);
        cs = new Date(ce.getTime());
      }
      const seen = new Set();
      const deduped = all.filter(q => seen.has(q.date) ? false : (seen.add(q.date), true));
      return { meta, quotes: deduped };
    };

    // Fetch fresh from TraderMade on every request. No server-side cache —
    // the browser keeps an in-memory dedupe cache per tab (timeseriesCache.js),
    // which is enough to keep things snappy while the tab is open.
    const { meta, quotes } = await fetchFreshFromTM(
      startD || new Date(),
      endD || new Date(),
    );

    // Normalize, drop garbage rows, sort by timestamp, and re-emit in TM's
    // exact response shape so the frontend's existing parser keeps working.
    const merged = (quotes || [])
      .map(q => ({
        ts: tmDateToMs(q.date),
        date: q.date,
        open: Number(q.open),
        high: Number(q.high),
        low:  Number(q.low),
        close: Number(q.close),
      }))
      .filter(x => Number.isFinite(x.ts) && Number.isFinite(x.close))
      .sort((a, b) => a.ts - b.ts)
      .map(c => ({
        date: c.date || msToTMDate(c.ts, intraday),
        open: c.open, high: c.high, low: c.low, close: c.close,
      }));

    res.json({ ...(meta || {}), quotes: merged, endpoint: "timeseries" });
  } catch (error) {
    console.error("REST proxy error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// ─── Date / bucket helpers ──────────────────────────────────────────────
// Used by the timeseries handler and the request-window clamp. (We removed
// the SQLite candle cache — server is now a pure pass-through proxy to
// TraderMade. The browser keeps its own in-memory dedupe cache per tab.)

// Convert TraderMade's "YYYY-MM-DD", "YYYY-MM-DD HH:MM", or "YYYY-MM-DD HH:MM:SS" into UTC ms.
function tmDateToMs(dateStr) {
  if (!dateStr) return null;
  // Normalise "YYYY-MM-DD-HH:MM" → "YYYY-MM-DD HH:MM"
  const clean = String(dateStr).replace(/-(\d{2}:\d{2})$/, " $1");
  let iso;
  if (clean.includes(":")) {
    const parts = clean.split(":");
    if (parts.length === 2) {
      iso = clean.replace(" ", "T") + ":00Z";
    } else {
      iso = clean.replace(" ", "T") + "Z";
    }
  } else {
    iso = clean + "T00:00:00Z";
  }
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

// Format ms back into TraderMade's expected response date string.
function msToTMDate(ms, intraday) {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  if (!intraday) return `${y}-${mo}-${da}`;
  const h = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${y}-${mo}-${da} ${h}:${mi}`;
}

// How long one bucket lasts, in ms.
function bucketDurationMs(interval, period) {
  if (interval === "daily")  return period * 86_400_000;
  if (interval === "hourly") return period * 3_600_000;
  return period * 60_000;
}

// ─── News feed (RSS proxy + parse + cache) ───────────────────────────────
// Pulls FX news from public RSS feeds. No API key required. Cached server-side
// so the browser hits a fast JSON endpoint instead of multiple slow RSS fetches.
const NEWS_FEEDS = [
  { name: "ForexLive",     url: "https://www.forexlive.com/feed/" },
  { name: "FXStreet",      url: "https://www.fxstreet.com/rss/news" },
  { name: "Investing.com", url: "https://www.investing.com/rss/news_25.rss" },
];
const NEWS_CACHE_TTL_MS = 5 * 60_000; // 5 minutes
let newsCache = { ts: 0, items: [] };

// Minimal RSS XML → JS extractor (no external dep). Pulls <item> blocks and
// the inner <title>, <link>, <pubDate>, <description> tags. Resilient to CDATA.
function parseRssItems(xml, sourceName) {
  if (typeof xml !== "string") return [];
  const items = [];
  const itemRe = /<item[\s\S]*?<\/item>/g;
  const blocks = xml.match(itemRe) || [];
  for (const block of blocks) {
    const pick = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
      if (!m) return "";
      let raw = m[1].trim();
      raw = raw.replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, "$1").trim();
      // Strip any inner HTML so titles/descriptions render as plain text
      return raw.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, "\"")
                .replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
    };
    const title = pick("title");
    const link  = pick("link");
    const date  = pick("pubDate") || pick("dc:date");
    const desc  = pick("description");
    if (!title) continue;
    const tsMs = date ? Date.parse(date) : Date.now();
    items.push({
      title,
      link,
      source: sourceName,
      publishedAt: Number.isFinite(tsMs) ? tsMs : Date.now(),
      summary: desc.length > 240 ? desc.slice(0, 240) + "…" : desc,
    });
  }
  return items;
}

async function refreshNewsCache() {
  const now = Date.now();
  if (newsCache.items.length > 0 && (now - newsCache.ts) < NEWS_CACHE_TTL_MS) return newsCache.items;

  // Some sites (FXStreet, Investing.com) reject the default Node user agent. Pretend to be a browser.
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    "Accept": "application/rss+xml, application/xml, text/xml, */*",
    "Accept-Language": "en-US,en;q=0.9",
  };

  const all = await Promise.all(NEWS_FEEDS.map(async (feed) => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(feed.url, { headers, signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) {
        console.warn(`📰 ${feed.name} → HTTP ${res.status}`);
        return [];
      }
      const xml = await res.text();
      const items = parseRssItems(xml, feed.name);
      console.log(`📰 ${feed.name} → ${items.length} items`);
      return items;
    } catch (err) {
      console.warn(`📰 ${feed.name} → failed:`, err.message);
      return [];
    }
  }));

  const merged = all.flat().sort((a, b) => b.publishedAt - a.publishedAt).slice(0, 80);
  newsCache = { ts: now, items: merged };
  console.log(`📰 News cache refreshed: ${merged.length} total items`);
  return merged;
}

app.get("/api/news", async (req, res) => {
  try {
    const items = await refreshNewsCache();
    res.json({ items, fetchedAt: newsCache.ts, sources: NEWS_FEEDS.map(f => f.name) });
  } catch (err) {
    console.error("/api/news error:", err.message);
    // 200 with empty array — UI will show a friendly empty state instead of "Failed to load"
    res.json({ items: [], fetchedAt: Date.now(), error: err.message });
  }
});

const DEFAULT_BOOT_SYMBOLS = [
  "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "USDCAD",
  "AUDUSD", "NZDUSD", "USDNOK", "USDSEK",
];
const DEFAULT_BOOT_SYMBOLS_SET = new Set(DEFAULT_BOOT_SYMBOLS);
const PERSIST_PATH = path.join(__dirname, "data", "active-symbols.json");

function loadPersistedSymbols() {
  try {
    const raw = fs.readFileSync(PERSIST_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.symbols) && parsed.symbols.length > 0) {
      return new Set(parsed.symbols.map(String));
    }
  } catch (_) {}
  return new Set(DEFAULT_BOOT_SYMBOLS);
}

function savePersistedSymbols(symbolsSet) {
  try {
    fs.mkdirSync(path.dirname(PERSIST_PATH), { recursive: true });
    fs.writeFileSync(
      PERSIST_PATH,
      JSON.stringify({ symbols: Array.from(symbolsSet), savedAt: new Date().toISOString() }, null, 2)
    );
  } catch (err) {
    console.error("Failed to persist active symbols:", err.message);
  }
}

// allSymbols = actual active upstream subscriptions.
// desiredSymbols = merged browser demand waiting to be applied upstream.
let allSymbols = new Set();
let desiredSymbols = new Set();

// ── Single shared upstream TraderMade connection ─────────────────────────
let tmWs = null;
let tmReady = false;
let tmLoggedIn = false;  // Track login status separately
let tmHasLadder = false; // True if the account has trader_ladder enabled
let tmReconnectTimer = null;
let tmConnecting = false;
const SEND_LAST_FALLBACK_DELAY_MS = 2500;
const clients = new Set();
const clientSubs = new Map(); // clientWs → Set<symbol>
const priceCache = new Map(); // symbol → last known transformed JSON string
const sendLastFallbackTimers = new Map(); // symbol → timeout
const sendLastFallbackIssued = new Set();

// feedAdv — plain symbol names, no suffix
function toSpot(symbols) {
  return symbols.map(normalizeSymbol).filter(Boolean);
}

function normalizeSymbol(symbol) {
  if (typeof symbol !== "string") return null;
  const trimmed = symbol.trim();
  return trimmed ? trimmed.split(":")[0].toUpperCase() : null;
}

function numberOrUndefined(value) {
  if (value == null || value === "") return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function getLiveQuoteSymbol(row) {
  const explicit = normalizeSymbol(row.instrument ?? row.symbol ?? row.s ?? row.currency);
  if (explicit) return explicit;

  const base = normalizeSymbol(row.base_currency ?? row.baseCurrency ?? row.base);
  const quote = normalizeSymbol(row.quote_currency ?? row.quoteCurrency ?? row.quote);
  return base && quote ? `${base}${quote}` : null;
}

function hasDemandForSymbol(symbol) {
  for (const subs of clientSubs.values()) {
    if (subs && subs.has(symbol)) return true;
  }
  return false;
}

function cancelSendLastFallback(symbol) {
  const timer = sendLastFallbackTimers.get(symbol);
  if (!timer) return;
  clearTimeout(timer);
  sendLastFallbackTimers.delete(symbol);
}

function rememberPrice(symbol, msg) {
  priceCache.set(symbol, msg);
  cancelSendLastFallback(symbol);
}

function sendLastFallback(symbols) {
  const missing = symbols
    .map(normalizeSymbol)
    .filter(Boolean)
    .filter(symbol => !priceCache.has(symbol) && hasDemandForSymbol(symbol));

  if (missing.length === 0) return;

  if (!tmWs || !tmLoggedIn || tmWs.readyState !== WebSocket.OPEN) {
    console.log(`⏸️ send_last fallback skipped; upstream not ready (${missing.join(",")})`);
    return;
  }

  for (const symbol of missing) sendLastFallbackIssued.add(symbol);

  const subscribeMsg = { action: "subscribe", send_last: true, symbols: toSpot(missing) };
  console.log(`📤 send_last fallback for ${missing.length} missing symbols: ${missing.slice(0, 25).join(",")}${missing.length > 25 ? " ..." : ""}`);
  console.log(`   📤 WS SEND: ${JSON.stringify(subscribeMsg)}`);
  tmWs.send(JSON.stringify(subscribeMsg));
}

function scheduleSendLastFallback(symbols) {
  for (const rawSymbol of symbols) {
    const symbol = normalizeSymbol(rawSymbol);
    if (!symbol) continue;
    if (priceCache.has(symbol) || sendLastFallbackIssued.has(symbol) || sendLastFallbackTimers.has(symbol)) continue;

    const timer = setTimeout(() => {
      sendLastFallbackTimers.delete(symbol);
      sendLastFallback([symbol]);
    }, SEND_LAST_FALLBACK_DELAY_MS);
    sendLastFallbackTimers.set(symbol, timer);
  }
}

async function fetchAndPushLiveRates(symbols) {
  if (!REST_API_KEY || symbols.length === 0 || clients.size === 0) return;
  try {
    const params = new URLSearchParams({
      currency: toSpot(symbols).join(","),
      api_key: REST_API_KEY,
    });
    const url = `https://marketdata.tradermade.com/api/v1/live?${params.toString()}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`REST live fetch returned ${response.status}`);
      return;
    }
    const data = await response.json();
    const rows = Array.isArray(data)
      ? data
      : Array.isArray(data.quotes)
        ? data.quotes
        : Array.isArray(data.data)
          ? data.data
          : [];
    if (rows.length === 0) return;

    for (const quote of rows) {
      const symbol = getLiveQuoteSymbol(quote);
      if (!symbol) continue;
      const bid = numberOrUndefined(quote.bid ?? quote.b);
      const ask = numberOrUndefined(quote.ask ?? quote.a);
      const mid = numberOrUndefined(quote.mid ?? quote.m)
        ?? (bid != null && ask != null ? (bid + ask) / 2 : undefined);
      if (mid == null) continue;

      const msg = JSON.stringify({
        symbol,
        bid,
        ask,
        mid,
        source: "rest_live",
        timestamp: quote.timestamp ?? quote.ts ?? data.requested_time,
      });
      rememberPrice(symbol, msg);
      for (const client of clients) {
        if (client.readyState !== WebSocket.OPEN) continue;
        const subs = clientSubs.get(client);
        if (!subs || subs.has(symbol)) client.send(msg);
      }
      console.log(`📡 REST snapshot cached+pushed: ${symbol} mid=${mid}`);
    }
  } catch (err) {
    console.error("REST live fetch error:", err.message);
  }
}

function subscribeUpstream(symbols) {
  if (symbols.length === 0) return;
  if (!tmWs || !tmLoggedIn || tmWs.readyState !== WebSocket.OPEN) {
    console.log(`⏸️ Skipping upstream subscribe; socket not ready/logged in yet (${symbols.length} pending symbols)`);
    return;
  }
  const subscribeMsg = { action: "subscribe", send_last: true, symbols: toSpot(symbols) };
  console.log(`📤 Adding ${symbols.length} upstream symbols...`);
  console.log(`   📤 WS SEND: ${JSON.stringify(subscribeMsg)}`);
  tmWs.send(JSON.stringify(subscribeMsg));
  scheduleSendLastFallback(symbols);
}

function unsubscribeUpstream(symbols) {
  if (symbols.length === 0) return;
  if (!tmWs || !tmLoggedIn || tmWs.readyState !== WebSocket.OPEN) {
    console.log(`⏸️ Skipping upstream unsubscribe; socket not ready/logged in yet (${symbols.length} pending symbols)`);
    return;
  }
  const unsubscribeMsg = { action: "unsubscribe", symbols: toSpot(symbols) };
  console.log(`📤 Removing ${symbols.length} upstream symbols...`);
  console.log(`   📤 WS SEND: ${JSON.stringify(unsubscribeMsg)}`);
  tmWs.send(JSON.stringify(unsubscribeMsg));
}

function collectDesiredSymbols() {
  const wanted = new Set();
  for (const subs of clientSubs.values()) {
    if (!subs) continue;
    for (const sym of subs) wanted.add(sym);
  }
  return wanted;
}

function hasActiveClientDemand() {
  for (const subs of clientSubs.values()) {
    if (subs && subs.size > 0) return true;
  }
  return false;
}

function reconcileUpstreamSubscriptions() {
  desiredSymbols = collectDesiredSymbols();
  const hasDemand = desiredSymbols.size > 0;

  if (!hasDemand) {
    console.log(`⏸️ No active browser demand; keeping upstream subscriptions alive (${allSymbols.size} symbols)`);
    return;
  }

  if ((!tmWs || (tmWs.readyState !== WebSocket.OPEN && tmWs.readyState !== WebSocket.CONNECTING)) && !tmConnecting) {
    savePersistedSymbols(desiredSymbols);
    connectUpstream();
    return;
  }

  const toAdd = Array.from(desiredSymbols).filter(s => !allSymbols.has(s));
  const toRemove = Array.from(allSymbols).filter(s => !desiredSymbols.has(s));

  if (toAdd.length > 0) subscribeUpstream(toAdd);
  if (toRemove.length > 0) unsubscribeUpstream(toRemove);

  if (toAdd.length === 0 && toRemove.length === 0) {
    console.log(`📭 No upstream subscription changes needed (${desiredSymbols.size} symbols unchanged)`);
  }

  allSymbols = new Set(desiredSymbols);
  savePersistedSymbols(desiredSymbols);
}

function scheduleReconnect(delayMs = 3000) {
  if (tmReconnectTimer) return;
  tmReconnectTimer = setTimeout(() => {
    tmReconnectTimer = null;
    connectUpstream();
  }, delayMs);
}

function connectUpstream() {
  if (tmConnecting || (tmWs && (tmWs.readyState === WebSocket.CONNECTING || tmWs.readyState === WebSocket.OPEN))) {
    return;
  }

  const upstreamUrl = "wss://stream.tradermade.com/feedAdv";
  tmConnecting = true;
  console.log(`🔗 Connecting to TraderMade production: ${upstreamUrl}`);
  const ws = new WebSocket(upstreamUrl);
  tmWs = ws;

  ws.on("open", () => {
    if (tmWs !== ws) return;
    tmConnecting = false;
    console.log(`✅ WebSocket connected to ${upstreamUrl}`);
    console.log(`📤 Sending login...`);
    // Request ladder/depth data — ignored by accounts without trader_ladder access
    const loginMsg = { action: "login", key: API_KEY, fmt: "JSON", send_ladder: true };
    console.log(`   📤 WS SEND:`, JSON.stringify(loginMsg, null, 2));
    ws.send(JSON.stringify(loginMsg));
  });

  ws.on("message", (data) => {
    const msg = data.toString();
    let parsed;
    try { parsed = JSON.parse(msg); } catch { /* non-JSON */ }
    
    // Log all non-tick messages (sub acks, errors, control)
    if (!parsed || !parsed.s) {
      console.log(`📥 UPSTREAM:`, msg.substring(0, 500));
    } else {
      // Log first 3 ticks, then silence
      if (!global.tickCount) global.tickCount = 0;
      if (global.tickCount < 3) {
        console.log(`📥 TICK [${global.tickCount + 1}]:`, msg.substring(0, 200));
        global.tickCount++;
      } else if (global.tickCount === 3) {
        console.log(`📥 ... (ticks flowing, suppressing logs)`);
        global.tickCount = 4;
      }
    }

    // Handle login response
    if (parsed && (parsed.type === "login_ok" || parsed.key || parsed.account || parsed.type === "hello")) {
      if (!tmLoggedIn) {
        console.log(`✅ Login successful`);
        // Remember whether this account has ladder/depth data enabled
        tmHasLadder = parsed.trader_ladder === true;
        console.log(`📊 Ladder/depth data: ${tmHasLadder ? "ENABLED" : "not on this plan"}`);
        // Broadcast capability to any already-connected browser clients
        const capMsg = JSON.stringify({ type: "capabilities", hasLadder: tmHasLadder });
        for (const client of clients) {
          if (client.readyState === WebSocket.OPEN) client.send(capMsg);
        }
        tmLoggedIn = true;
        tmReady = true;
        desiredSymbols = collectDesiredSymbols();
        if (desiredSymbols.size === 0 && allSymbols.size > 0) {
          desiredSymbols = new Set(allSymbols);
        }
        allSymbols = new Set();
        console.log(`🔄 Post-login demand snapshot: ${desiredSymbols.size} symbols`);
        if (desiredSymbols.size > 0) {
          const initialSymbols = Array.from(desiredSymbols);
          console.log(`📤 Initial upstream subscribe after login (${initialSymbols.length} symbols)`);
          subscribeUpstream(initialSymbols);
          allSymbols = new Set(desiredSymbols);
          savePersistedSymbols(desiredSymbols);
        } else {
          console.log(`📭 No client demand present after login`);
        }
      }
      return;
    }

    // Handle tick data (has "s" field for symbol)
    if (parsed && parsed.s) {
      // Transform TraderMade format to frontend format
      // Input:  { s, b, a, bv, av, t, ts }
      // Output: { symbol, bid, ask, mid, bidVolume, askVolume, type, timestamp }
      // feedAdv may return "EURUSD:QUOTE" — strip the suffix
      const cleanSymbol = normalizeSymbol(parsed.s);
      if (!cleanSymbol) return;
      const bid = numberOrUndefined(parsed.b);
      const ask = numberOrUndefined(parsed.a);
      const transformed = {
        symbol: cleanSymbol,
        bid,
        ask,
        bidVolume: parsed.bv,
        askVolume: parsed.av,
        type: parsed.t,
        source: "ws",
        timestamp: parsed.ts,
      };
      // Use TraderMade's mid when present (ladder ticks include it); otherwise fall back.
      transformed.mid = numberOrUndefined(parsed.m)
        ?? (bid != null && ask != null ? (bid + ask) / 2 : undefined);
      // Forward ladder/depth if the upstream included it (only for trader_ladder accounts).
      if (parsed.ladder && (Array.isArray(parsed.ladder.a) || Array.isArray(parsed.ladder.b))) {
        transformed.ladder = parsed.ladder;
      }
      if (transformed.mid == null) return;
      
      const transformedMsg = JSON.stringify(transformed);
      rememberPrice(cleanSymbol, transformedMsg);

      // Forward to clients that subscribed to this symbol
      const symbol = cleanSymbol;
      let forwarded = 0;
      for (const client of clients) {
        if (client.readyState !== WebSocket.OPEN) continue;
        const subs = clientSubs.get(client);
        // Send if client has no subscription yet (fallback) or symbol matches
        if (!subs || subs.size === 0 || subs.has(symbol)) {
          client.send(transformedMsg);
          forwarded++;
        }
      }
      
      // Log forwarding on first few ticks
      if (!global.fwdCount) global.fwdCount = 0;
      if (global.fwdCount < 5) {
        console.log(`✅ FORWARDED ${cleanSymbol} to ${forwarded} clients (${forwarded > 0 ? 'OK' : 'NO CLIENTS'})`);
        global.fwdCount++;
      }

      return;
    }
  });

  ws.on("error", (err) => {
    if (tmWs === ws) tmConnecting = false;
    console.error("🔴 TraderMade upstream error:", err.message);
  });

  ws.on("close", (code) => {
    if (tmWs !== ws) return;
    tmConnecting = false;
    tmReady = false;
    tmLoggedIn = false;
    tmWs = null;

    if (!hasActiveClientDemand() && allSymbols.size === 0) {
      console.warn(`⚠️  TraderMade upstream closed (${code}) with no remembered symbols — not reconnecting.`);
      return;
    }

    console.warn(`⚠️  TraderMade upstream closed (${code}) — reconnecting in 3s...`);
    scheduleReconnect(3000);
  });
}

// Upstream is demand-driven: connect when a browser client actually subscribes.

// ── React client connections ──────────────────────────────────────────────
wss.on("connection", (clientWs) => {
  clients.add(clientWs);
  console.log(`🟢 Browser client connected (${clients.size} total)`);

  // Let the client know the current upstream status + capabilities
  clientWs.send(JSON.stringify({
    type: "status",
    ready: tmReady,
    symbolCount: allSymbols.size,
  }));
  clientWs.send(JSON.stringify({ type: "capabilities", hasLadder: tmHasLadder }));

  clientWs.on("message", (data) => {
    try {
      const raw = data.toString();
      console.log(`📥 CLIENT→PROXY RAW: ${raw}`);
      const msg = JSON.parse(raw);

      
      // Handle both "symbols" (plural) and "symbol" (singular) for flexibility
      const requestedSymbols = Array.isArray(msg.symbols)
        ? msg.symbols
        : msg.symbols
          ? [msg.symbols]
          : msg.symbol
            ? (Array.isArray(msg.symbol) ? msg.symbol : [msg.symbol])
            : [];
      const symbols = requestedSymbols.map(normalizeSymbol).filter(Boolean);
      
      if (msg.action === "subscribe" && symbols.length > 0) {
        if (symbols.length > 100) {
          console.warn(`🚫 Rejecting oversized client subscribe request (${symbols.length} symbols)`);
          console.warn(`   First symbols: ${symbols.slice(0, 25).join(",")}${symbols.length > 25 ? " ..." : ""}`);
          clientWs.send(JSON.stringify({
            type: "error",
            error: `Too many symbols requested (${symbols.length}). Request rejected.`,
          }));
          try { clientWs.close(1008, "Too many symbols requested"); } catch (_) {}
          return;
        }

        const subs = clientSubs.get(clientWs) ?? new Set();
        const newlyRequested = [];
        for (const symbol of symbols) {
          if (!subs.has(symbol)) newlyRequested.push(symbol);
          subs.add(symbol);
        }
        clientSubs.set(clientWs, subs);

        console.log(`📡 Client subscribe request: +${newlyRequested.length} symbols (${subs.size} total for client)`);
        if (newlyRequested.length > 0) {
          console.log(`   Added: ${newlyRequested.slice(0, 25).join(",")}${newlyRequested.length > 25 ? " ..." : ""}`);
          fetchAndPushLiveRates(newlyRequested);
        }

        // Push any cached prices immediately so client isn't stuck on ---
        for (const sym of symbols) {
          const cached = priceCache.get(sym);
          if (cached && clientWs.readyState === WebSocket.OPEN) clientWs.send(cached);
        }

        if (!tmWs || (tmWs.readyState !== WebSocket.OPEN && tmWs.readyState !== WebSocket.CONNECTING)) {
          desiredSymbols = collectDesiredSymbols();
          savePersistedSymbols(desiredSymbols);
          console.log(`🔌 No active upstream socket; opening TraderMade connection for ${desiredSymbols.size} demanded symbols...`);
          connectUpstream();
        } else {
          reconcileUpstreamSubscriptions();
        }
      } else if (msg.action === "unsubscribe" && symbols.length > 0) {
        const subs = clientSubs.get(clientWs) ?? new Set();
        const removed = [];
        for (const symbol of symbols) {
          if (subs.delete(symbol)) removed.push(symbol);
        }
        clientSubs.set(clientWs, subs);
        console.log(`📡 Client unsubscribe request: -${removed.length} symbols (${subs.size} remaining for client)`);
        if (removed.length > 0) {
          console.log(`   Removed: ${removed.slice(0, 25).join(",")}${removed.length > 25 ? " ..." : ""}`);
        }
        reconcileUpstreamSubscriptions();
      }
    } catch (e) { /* ignore */ }
  });

  clientWs.on("close", () => {
    clients.delete(clientWs);
    clientSubs.delete(clientWs);
    reconcileUpstreamSubscriptions();
    console.log(`🔴 Browser client disconnected (${clients.size} remaining)`);
  });

  clientWs.on("error", (err) => {
    console.error("Client WS error:", err.message);
    clients.delete(clientWs);
    clientSubs.delete(clientWs);
    reconcileUpstreamSubscriptions();
  });
});

// Explicit SPA entry routes
app.get('/forex-charts', (req, res) => {
  return res.sendFile('index.html', { root: path.join(__dirname, 'dist') });
});

// SPA fallback: serve index.html for all other routes (must come last)
app.use((req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/assets')) {
    return res.sendFile('index.html', { root: path.join(__dirname, 'dist') });
  }
  res.status(404).json({ error: 'Not found' });
});

const PORT = Number(process.env.PORT) || 3001;
server.listen(PORT, () => {
  console.log(`🚀 WebSocket proxy + Frontend running on port ${PORT}`);
});
