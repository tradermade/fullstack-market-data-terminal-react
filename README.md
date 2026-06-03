# TraderMade FX Terminal

A self-hosted, production-ready trading terminal built on top of the [TraderMade](https://tradermade.com) market data APIs. Live FX, crypto, metals, energies, indices, and US-equity streaming charts with depth-of-market, news, and per-symbol persistence — all running from a single `node server.js` command.

![Build](https://img.shields.io/badge/build-passing-brightgreen)
![Node](https://img.shields.io/badge/node-%E2%89%A520-blue)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## Table of contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Requirements](#requirements)
4. [Quick start](#quick-start)
5. [Environment variables](#environment-variables)
6. [Available scripts](#available-scripts)
7. [Docker](#docker)
8. [Project structure](#project-structure)
9. [How the data layer works](#how-the-data-layer-works)
10. [Customisation](#customisation)
11. [Troubleshooting](#troubleshooting)
12. [Contributing](#contributing)
13. [Licence](#licence)

---

## Features

### Real-time market data
- Live streaming ticks via TraderMade WebSocket (FX, crypto, metals, energies, indices, US equities)
- Single shared upstream connection on the server — every browser tab uses one pipe
- Automatic reconnect with exponential back-off and idle disconnect to save bandwidth
- REST snapshot fallback so illiquid pairs never show empty values

### Charting (Highcharts Stock)
- Candlestick, Heikin Ashi, and hollow candle modes
- 7 timeframes: 1 Min, 5 Min, 15 Min, 30 Min, 1H, 4H, 1D
- 7 range presets plus a fully custom date-time picker
- Historical anchor — view any past date as the “live” point
- Infinite-scroll back history — drag the chart left to auto-fetch older candles
- ~35 built-in indicators (SMA, EMA, RSI, MACD, Bollinger, ATR, Ichimoku, VWAP, etc.) via Highcharts stock-tools
- Drawing tools (trend lines, fib retracement, rectangles, annotations)
- Per-symbol persistence — drawings and indicators saved per pair
- Save / Reset / chart screenshot
- Light & dark theme

### Depth-of-Market (DOM)
- Vertical bid/ask ladder panel with heat-bars scaled by resting volume
- Real-time spread display in pips
- Cleanly hides on accounts without ladder access (`trader_ladder: true` required)

### News feed
- Aggregated FX news from ForexLive, FXStreet, and Investing.com RSS feeds
- Server-cached for 5 min, refreshed every 5 min in the UI
- No API key required for news

### Live Rates page
- Watchlist with bid / ask / spread / net change / % change / OHLC
- Gainers & losers panel (1D / 1W / 1M)
- Add / remove symbols, persisted across sessions

### Customisation
- Settings modal — bullish / bearish candle colour, accent, background, grid colour
- All preferences persisted in `localStorage`
- TraderMade branding swappable with one image URL

### Symbol coverage
- 2,800+ FX pairs (all combinations of 75 currencies)
- Metals (XAU, XAG, XPT, XPD vs USD/EUR)
- Energies (WTI, Brent, Natural Gas)
- Major global indices (SPX500, NAS100, USA30, GER30, FTSE, Nikkei, DAX, etc.)
- 22 US equities (AAPL, MSFT, NVDA, GOOGL, AMZN, TSLA, etc.)
- 50+ major cryptocurrencies (BTC, ETH, SOL, etc.)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          Browser (React)                        │
│   TopBar · Chart · DOM Panel · News · Watchlist · Settings      │
└────────────┬───────────────────────────────────────┬────────────┘
             │ WebSocket                             │ REST /api/*
             │                                       │
┌────────────▼───────────────────────────────────────▼────────────┐
│              Node.js + Express + ws (server.js)                 │
│   ┌─────────────────────────┐    ┌────────────────────────────┐ │
│   │  WS proxy (shared       │    │  REST proxy (pass-through  │ │
│   │  upstream TraderMade WS)│    │  to TraderMade REST)       │ │
│   └─────────────────────────┘    └────────────────────────────┘ │
│                                                                 │
│   Stateless — no on-disk cache. The browser keeps an in-memory  │
│   dedupe cache per tab (lost on refresh).                       │
└────────────┬─────────────────────────────────────┬──────────────┘
             │ wss://stream.tradermade.com         │ https://marketdata.tradermade.com
             │                                     │
             ▼                                     ▼
                              TraderMade
```

The Node server is the single integration point with TraderMade. The browser never holds the API key. Multiple browser sessions share one upstream WebSocket connection.

---

## Requirements

- **Node.js ≥ 20** (LTS recommended)
- **npm** (bundled with Node)
- **TraderMade account** with at minimum:
  - REST API key (historical / timeseries)
  - WebSocket API key (live ticks)
- *Optional:* a key with `trader_ladder: true` enabled for the Depth-of-Market panel

You can sign up at [tradermade.com](https://tradermade.com) — they offer a free tier sufficient for testing.

---

## Quick start

### 1. Clone & install

```bash
git clone https://github.com/<your-org>/tradermade-fx-dashboard.git
cd tradermade-fx-dashboard
npm install
```

### 2. Configure your API keys

Create a `.env` file in the project root:

```env
TRADERMADE_API_KEY=your_rest_api_key
TRADERMADE_WS_API_KEY=your_websocket_api_key

# Optional: your own logo for the top-left of the terminal
# VITE_LOGO_URL=https://your-domain.com/logo.png
```

> The API keys are read server-side via `dotenv` and never reach the browser, so they don't need the `VITE_` prefix. The `VITE_LOGO_URL` does need the prefix because it's inlined into the browser bundle by Vite at build time. Existing `.env` files using `VITE_TRADERMADE_*` keep working — `server.js` reads both names.

### 3. Build & run

```bash
npm run build
node server.js
```

### 4. Open

[http://localhost:3001](http://localhost:3001)

You should see live tick streaming on the watchlist and a populated EUR/USD chart within a second.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `TRADERMADE_API_KEY` | yes | REST API key — historical, timeseries, live snapshot. Read by `server.js`. Old name `VITE_TRADERMADE_API_KEY` still works as a fallback. |
| `TRADERMADE_WS_API_KEY` | yes | WebSocket API key — streaming ticks. Read by `server.js`. Old name `VITE_TRADERMADE_WS_API_KEY` still works as a fallback. |
| `VITE_LOGO_URL` | no | Logo image URL or `/public`-relative path shown in the top-left of the terminal. Must keep the `VITE_` prefix because the browser bundle reads it. Falls back to the default TraderMade logo when unset. |
| `PORT` | no | Override the server port (default `3001`) |
| `NODE_ENV` | no | Set to `production` in Docker / production deployments |
| `VITE_PROXY_WS_URL` | no | Override the WebSocket proxy URL from the browser side (rarely needed) |

> `.env` is git-ignored. Never commit it.

---

## Available scripts

```bash
npm run dev       # Vite dev server on port 5173 (frontend only; needs server.js running too)
npm run build     # Build production bundle into dist/
npm start         # Alias for: node server.js
npm run lint      # ESLint
npm run preview   # Vite static preview (without the proxy server)
```

### Recommended workflow

- **Production-style local testing** (single server, identical to deploy):
  ```bash
  npm run build && node server.js
  ```
  Open `http://localhost:3001`. This is the most reliable mode.

- **Frontend hot-reload during UI work:**
  ```bash
  # terminal 1
  node server.js
  # terminal 2
  npm run dev
  ```
  Open `http://localhost:5173`. The dev frontend talks to the proxy on `3001`.

---

## Docker

A `Dockerfile` and `docker-compose.yml` are included. The image is multi-stage (build → runtime) and uses `node:22-alpine`.

### One-command run (recommended)

```bash
docker compose up --build
```

Open [http://localhost:3001](http://localhost:3001).

What this does:
- Builds the Vite frontend inside the image
- Runs `server.js` in production mode
- Reads secrets from `.env`
- Stateless — no volume to mount

### Manual Docker

```bash
docker build -t tradermade-fx-dashboard .
docker run \
  --env-file .env \
  -p 3001:3001 \
  tradermade-fx-dashboard
```

### Stopping

```bash
docker compose down
```

---

## Project structure

```
tradermade-fx-dashboard/
├── public/                   Static assets (Highcharts modules, fonts, icons)
├── src/
│   ├── components/
│   │   ├── TradingPortal.jsx   Main chart page composition
│   │   ├── CandleChart.jsx     Highcharts wrapper + theming
│   │   ├── DOMPanel.jsx        Bid/ask ladder
│   │   ├── NewsPanel.jsx       FX news feed
│   │   ├── RightSidebar.jsx    Tabs + draggable DOM/Watchlist split
│   │   ├── TickerPanel.jsx     Watchlist
│   │   ├── TickRow.jsx         Single watchlist row
│   │   ├── TopBar.jsx          Symbol/timeframe/range toolbar
│   │   ├── NavBar.jsx          Market tabs (Global / Metals / Crypto / …)
│   │   ├── SettingsModal.jsx   Colour customisation
│   │   ├── StatusBar.jsx       Footer status
│   │   └── GainersLosers.jsx   Live rates ranking panel
│   ├── context/
│   │   └── MarketDataContext.jsx   Module-level WebSocket singleton + store
│   ├── hooks/
│   │   └── usePersistedState.js    Reusable localStorage-backed state hook
│   ├── pages/
│   │   └── LiveRates.jsx       Live rates landing page
│   ├── constants/              Markets, timeframes, currency lists
│   └── styles/                 Global CSS variables + GlobalStyles component
├── server.js                   Express + ws proxy + REST pass-through
├── Dockerfile                  Multi-stage image
├── docker-compose.yml          Compose service definition
├── vite.config.js              Vite config (React + Tailwind)
└── package.json
```

---

## How the data layer works

### WebSocket pipeline

1. Browser opens a WebSocket to `ws://localhost:3001`
2. The Node server maintains **one** upstream connection to `wss://stream.tradermade.com/feedAdv`
3. The server multiplexes subscriptions across all browser clients
4. Forming-bar ticks are pushed to each client immediately for live chart updates

### REST pipeline

When the browser fetches historical data:

```
Browser → /api/timeseries
            ↓
   server.js proxies straight to TraderMade
            ↓
   normalize + sort + return
```

The server is stateless — no on-disk cache. Each request hits TraderMade fresh. The browser keeps a small in-memory dedupe cache per tab (`src/utils/timeseriesCache.js`) so repeating the same query inside one tab session is instant, but a hard refresh clears it.

If you're on a low TraderMade plan with tight rate limits and want a persistent cache back, the previous SQLite implementation is in git history — restore it by reverting the relevant commit.

### Forming bar handling

The "current" (still-updating) candle is updated tick-by-tick from the WebSocket. The 30-second REST poll in `TradingPortal.jsx` re-fetches the last 2 periods as a safety net for any ticks the WS may have dropped.

---

## Customisation

### Change branding

Edit `src/components/NavBar.jsx` — the logo `<img src="...">` URL and any text near it. The accent colour cascades from `--blue` CSS variable.

### Add/remove symbols

Edit `src/constants/constants.jsx`. Each market (`GLOBAL_PAIRS`, `METALS_CFD`, `ENERGIES_CFD`, `INDICES_CFD`, `US_STOCKS`, `CRYPTO_PAIRS`) is a simple array. Add an entry, restart, the symbol appears in the dropdown.

### Customise colours at runtime

End-users can change candle colours, accent, background, and grid via the Settings modal (gear icon in the toolbar). Persisted to `localStorage` per browser.

### Theme

Light/dark toggle is available in the NavBar. All colours flow through CSS variables defined in `src/styles/GlobalStyles.jsx`.

---

## Troubleshooting

### "No quotes returned" / empty chart

- Verify both `TRADERMADE_API_KEY` and `TRADERMADE_WS_API_KEY` (or their legacy `VITE_` names) are set in `.env`
- Check the server console for `📤 TraderMade Market Data REST` lines — they show what's being requested
- If your system clock is significantly ahead of UTC, the server's clock-skew detection will compensate automatically, but extreme drift can cause failures
- Illiquid pairs (e.g. `AED/ALL`) genuinely don't have minute/hourly data on lower TraderMade plans — try 1 D timeframe

### Live ticks stop updating

- The WebSocket reconnects automatically — check the server log for `🔗 Connecting to TraderMade production` messages
- Hard refresh the browser (Ctrl + Shift + R) to drop any cached frontend bundle

### DOM panel doesn't appear

The DOM panel only shows when your TraderMade API key has the `trader_ladder` capability enabled. Check the server log on startup for:

```
📊 Ladder/depth data: ENABLED
```

If you see `not on this plan`, contact TraderMade support to enable ladder access.

### News panel stuck on "Loading..."

The news source RSS feeds (ForexLive / FXStreet / Investing.com) can occasionally rate-limit or be unreachable. The server retries every 5 min. If all three fail you'll see a permanent loading state — verify outbound HTTPS works from your server.

### Clearing browser-side state

In DevTools Console:
```js
localStorage.clear(); sessionStorage.clear(); location.reload();
```

---

## Contributing

PRs welcome. Before submitting:

1. `npm run lint`
2. `npm run build` (must succeed)
3. Test the production flow: `node server.js`, then load `http://localhost:3001` and verify charts + live ticks work for at least one symbol

For larger refactors, please open an issue first so we can discuss direction.

---

## Licence

MIT — see `LICENSE`.

This project is independent of TraderMade Ltd. and is built on top of their public REST and WebSocket APIs. "TraderMade" is a trademark of TraderMade Ltd.
