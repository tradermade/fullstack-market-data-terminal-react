# TraderMade Market Terminal

A self-hosted TraderMade market-data terminal built with React, Vite, Highcharts Stock, Express, and WebSockets.

The repository name still says `tradermade-fx-dashboard`, but the app is broader than FX. It supports global currency pairs, metals, energies, indices, selected US stocks, and crypto symbols from TraderMade REST and WebSocket feeds.

## What It Includes

- Live watchlist and chart updates through a shared TraderMade WebSocket proxy
- REST-backed historical candles through TraderMade `/timeseries`
- Highcharts Stock candlestick charts with navigator, crosshair, UTC tooltips, stock tools, drawings, and indicators
- Timeframes: `1 Min`, `5 Min`, `15 Min`, `30 Min`, `1H`, `4H`, `1D`
- Ranges: `1D`, `2D`, `1W`, `1M`, `3M`, `6M`, `1Y`, with invalid ranges disabled per timeframe
- Real-time forming candle updates from WS ticks, then REST correction after candle close
- Live Rates page with bid, ask, spread, OHLC, watchlist persistence, and gainers/losers
- Market tabs for Global Currencies, Metals, Energies, Indices, Stocks, and Crypto
- Dark and light mode
- Configurable top-left brand text, badge, and logo through `.env`
- Docker support

## Tech Stack

- React 19
- Vite 7
- Highcharts / Highcharts Stock 12
- `highcharts-react-official`
- Tailwind CSS 4
- Express 5
- `ws`
- TraderMade REST API
- TraderMade WebSocket API

Highcharts is a core dependency of this project. The chart UI, stock navigator, indicators, annotations, drawing tools, and OHLC rendering are all built around Highcharts Stock.

> ⚠️ **Commercial License Note:** Highcharts Stock is free for personal, non-commercial testing. However, because this terminal explicitly targets production environments, corporate trading desks, and fintech MVPs, a commercial Highcharts license is required for production enterprise business applications.

## Architecture

```text
Browser
  React app
  Highcharts Stock chart
  Live Rates / Watchlist / News
        |
        | WebSocket + REST calls to local server
        v
server.js
  Express static server
  /api/timeseries REST proxy
  /api/news RSS proxy/cache
  shared TraderMade WebSocket proxy
        |
        | API keys stay server-side
        v
TraderMade REST + WebSocket APIs

```

The browser does not call TraderMade directly. It calls the local Node server, and `server.js` forwards requests with the server-side API keys.

## Requirements

* Node.js 20 or newer
* npm
* TraderMade REST API key
* TraderMade WebSocket API key

## Quick Start

Install dependencies:

```bash
npm install

```

Create `.env` in the project root:

```env
TRADERMADE_API_KEY=your_rest_api_key
TRADERMADE_WS_API_KEY=your_websocket_api_key

# Optional browser-bundled branding values
VITE_BRAND_NAME=TraderMade
VITE_BRAND_BADGE=Terminal
VITE_LOGO_URL=

```

Build and run the production server:

```bash
npm run build
npm start

```

Open:

```text
http://localhost:3001

```

## Development

Run the backend proxy:

```bash
npm start

```

Run the Vite dev server in another terminal:

```bash
npm run dev

```

Open:

```text
http://localhost:5173

```

The Vite app connects back to the local proxy server on port `3001`.

## Environment Variables

| Variable | Required | Used by | Description |
| --- | --- | --- | --- |
| `TRADERMADE_API_KEY` | yes | `server.js` | TraderMade REST key for `/timeseries` and REST snapshot calls |
| `TRADERMADE_WS_API_KEY` | yes | `server.js` | TraderMade WebSocket key for live ticks |
| `PORT` | no | `server.js` | Server port. Defaults to `3001` |
| `VITE_BRAND_NAME` | no | browser bundle | Text shown beside the logo. Defaults to `TraderMade` |
| `VITE_BRAND_BADGE` | no | browser bundle | Small badge text. Defaults to `Terminal` |
| `VITE_LOGO_URL` | no | browser bundle | Logo URL or `/public` path. Defaults to TraderMade logo |
| `VITE_PROXY_WS_URL` | no | browser bundle | Override WebSocket proxy URL for nonstandard deployments |

`VITE_*` values are bundled at build time. Rebuild the frontend after changing them.

## Docker

The repo includes a multi-stage `Dockerfile` and `docker-compose.yml`.

Create `.env`, then run:

```bash
docker compose up --build

```

Open:

```text
http://localhost:3001

```

Manual Docker:

```bash
docker build -t tradermade-market-terminal .
docker run --env-file .env -p 3001:3001 tradermade-market-terminal

```

Stop Compose:

```bash
docker compose down

```

## Available Scripts

```bash
npm run dev      # Vite dev server
npm run build    # Build frontend into dist/
npm start        # Run server.js
npm run lint     # ESLint
npm run preview  # Vite preview only

```

For realistic local testing, use:

```bash
npm run build
npm start

```

That serves the built frontend and proxy from the same Express server on port `3001`.

## Project Structure

```text
.
|-- public/
|   |-- indicators-all.js
|   |-- stock-tools.js
|   |-- annotations-advanced.js
|   `-- popup.css
|-- src/
|   |-- components/
|   |   |-- CandleChart.jsx
|   |   |-- TradingPortal.jsx
|   |   |-- TopBar.jsx
|   |   |-- NavBar.jsx
|   |   |-- TickerPanel.jsx
|   |   |-- RightSidebar.jsx
|   |   |-- NewsPanel.jsx
|   |   `-- SettingsModal.jsx
|   |-- constants/
|   |-- context/
|   |   `-- MarketDataContext.jsx
|   |-- pages/
|   |   `-- LiveRates.jsx
|   `-- styles/
|-- server.js
|-- Dockerfile
|-- docker-compose.yml
|-- vite.config.js
`-- package.json

```

## Data Flow

### Charts

1. The chart requests candle history from `/api/timeseries`.
2. `server.js` proxies the request to TraderMade REST.
3. The current forming candle is updated from WebSocket ticks.
4. After a candle closes, the app rechecks recent candles through REST so the final OHLC matches TraderMade.

TraderMade intraday candle timestamps are treated as candle close times. The chart displays candles at their start time, which is the normal charting convention.

### Live Rates

1. Browser subscribes to symbols through the local WebSocket.
2. `server.js` keeps one shared upstream TraderMade WS connection.
3. Active symbols update from WS ticks.
4. For quiet symbols, the server can request `send_last` / REST snapshots so the UI does not sit on empty placeholders while waiting for the next tick.

## Persistence

* Watchlist: `localStorage`
* Theme and chart settings: `localStorage`
* Indicators: global `localStorage` state, restored across symbols
* Drawings/annotations: saved per symbol when the user clicks Save
* Timeseries cache: browser-side in-memory/session cache only

API keys are never stored in the browser.

## Notes On Repo Naming

The package and folder name are still `tradermade-fx-dashboard`, but the app should be described publicly as a TraderMade market terminal or multi-asset market dashboard. That is more accurate because the current symbol set includes FX, CFDs, stocks, and crypto.

## Troubleshooting

### Port 3001 Already In Use

Another server is already running. Stop it or run this app on a different port:

```bash
PORT=3002 npm start

```

On Windows PowerShell:

```powershell
$env:PORT=3002
npm start

```

### Empty Chart Or "No Quotes Returned"

* Confirm `TRADERMADE_API_KEY` is set in `.env`
* Confirm the selected symbol/timeframe is available on your TraderMade plan
* **Weekend Liquidity Window Caveat:** TraderMade clamps high-resolution intraday (1-minute and 5-minute) FX requests to a strict **48 market-open hours** window. If you are configuring this terminal over a weekend, historical FX charts might display as empty due to the market closure. Switch your visual tools to **1D (Daily)** or look at active **Crypto** pairs to check data connectivity.
* Check the server logs for the exact `/api/timeseries` request

### Live Rates Not Moving

* Confirm `TRADERMADE_WS_API_KEY` is set
* Check server logs for upstream WS connection messages
* Hard refresh the browser after rebuilding

### Brand Text Did Not Change

`VITE_BRAND_NAME`, `VITE_BRAND_BADGE`, and `VITE_LOGO_URL` are build-time values. Run:

```bash
npm run build
npm start

```

For Docker:

```bash
docker compose up --build

```
