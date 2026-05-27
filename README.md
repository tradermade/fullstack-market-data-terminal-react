# TraderMade FX Dashboard

A React + Vite foreign exchange dashboard with live price updates, candlestick charts, and a Node.js proxy for TraderMade REST and WebSocket APIs.

## Tech Stack

- React 19
- Vite 7
- Tailwind CSS 4
- Highcharts
- Express
- ws
- TraderMade REST and WebSocket APIs

## Features

- Live FX tick updates through a backend WebSocket proxy
- Historical and timeseries data through backend REST proxy routes
- Candlestick charting with Highcharts stock tools
- Multiple FX pairs and timeframes
- Responsive dashboard layout
- Runtime symbol persistence in `data/active-symbols.json`

## Project Structure

```txt
tradermade-fx-dashboard/
  public/                 Static assets
  src/                    React application source
    components/           Dashboard UI components
    constants/            App constants and theme tokens
    context/              Market data context
    hooks/                React hooks
    pages/                Page-level views
    styles/               Global styling
  data/                   Runtime data written by the server
  dist/                   Production build output
  index.html              Vite HTML entry
  server.js               Express + WebSocket proxy server
  vite.config.js          Vite configuration
```

## Requirements

- Node.js 20 or newer
- npm
- TraderMade API keys

## Environment Variables

Create a `.env` file in the project root:

```env
VITE_TRADERMADE_API_KEY=your_rest_api_key
VITE_TRADERMADE_WS_API_KEY=your_websocket_api_key
```

The backend reads these values through `dotenv`.

Do not commit `.env`. It is ignored by `.gitignore`.

## Install

```bash
npm install
```

## Run the Full App Locally

Build the frontend first:

```bash
npm run build
```

Start the backend server:

```bash
node server.js
```

Open:

```txt
http://localhost:3001
```

In this mode, `server.js` serves the built frontend from `dist/` and also handles the REST and WebSocket proxy traffic.

## Frontend Development

You can start the Vite dev server with:

```bash
npm run dev
```

This runs the frontend dev server, usually at:

```txt
http://localhost:5173
```

For full live market functionality, the backend must also be running:

```bash
node server.js
```

Note: API calls in the app use relative `/api/...` paths. The production-style flow through `http://localhost:3001` is the most reliable way to test the full app unless a Vite dev proxy is added.

## Available Scripts

```bash
npm run dev      # Start Vite development server
npm start        # Start the production Express/WebSocket server
npm run build    # Build frontend into dist/
npm run lint     # Run ESLint
npm run preview  # Preview the Vite production build
```

## Backend

`server.js` provides:

- Static serving for `dist/`
- REST proxy routes under `/api/...`
- WebSocket proxy on port `3001`
- SPA fallback routing for client-side routes
- Runtime persistence for active symbols in `data/active-symbols.json`

The server listens on:

```txt
http://localhost:3001
```

## Production Build

```bash
npm ci
npm run build
node server.js
```

The `dist/` directory is generated during the build and should not be committed.

## Docker

Build and run with Docker Compose:

```bash
docker compose up --build
```

Open:

```txt
http://localhost:3001
```

The compose setup:

- builds the Vite frontend inside the image
- runs `server.js` in production mode
- exposes port `3001`
- loads secrets from `.env`
- stores runtime data in a Docker volume mounted at `/app/data`

You can also build and run manually:

```bash
docker build -t tradermade-fx-dashboard .
docker run --env-file .env -p 3001:3001 -v tradermade-fx-data:/app/data tradermade-fx-dashboard
```

The `.env` file is required at runtime and should contain:

```env
VITE_TRADERMADE_API_KEY=your_rest_api_key
VITE_TRADERMADE_WS_API_KEY=your_websocket_api_key
```

The frontend connects back to the same host for WebSocket traffic. For Vite development only, it falls back to `ws://localhost:3001` when the page is served from port `5173`.

## Git Ignore Policy

The repository should not commit:

- `node_modules/`
- `dist/`
- `.env` files
- local logs
- runtime state such as `data/active-symbols.json`
- local editor and OS files

## Notes

- Highcharts stock tools are loaded through CDN scripts in `index.html`.
- Stock tool icons are served from `public/gfx/stock-icons/`.
- The frontend connects to the backend WebSocket proxy on the current host in production.
