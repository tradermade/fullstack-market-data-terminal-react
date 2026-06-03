
const FX_CODES = [
  "AED","ALL","AMD","AOA","ARS","AUD","BAM","BDT","BGN","BHD","BIF","BRL","BYN",
  "CAD","CHF","CLP","CNH","CNY","COP","CZK","DKK","EGP","EUR","GBP","GHS","HKD",
  "HRK","HUF","IDR","ILS","INR","ISK","JOD","JPY","KES","KRW","KWD","KZT","LBP",
  "LKR","MAD","MUR","MXN","MYR","NGN","NOK","NZD","OMR","PEN","PHP","PKR","PLN",
  "QAR","RON","RUB","SAR","SEK","SGD","THB","TND","TRY","TWD","TZS","UAH","UGX",
  "USD","VND","XAF","XOF","ZAR","ZWL"
];

const fxDecimals = (base, quote) => {
  if (["JPY", "XAG"].includes(quote)) return 3;
  if (["XAU", "XPT", "XPD"].includes(base) || ["XAU", "XPT", "XPD"].includes(quote)) return 2;
  return 5;
};

export const GLOBAL_PAIRS = FX_CODES.flatMap((base) =>
  FX_CODES
    .filter((quote) => quote !== base)
    .map((quote) => ({
      sym: `${base}${quote}`,
      base,
      quote,
      decimals: fxDecimals(base, quote),
    }))
);

export const CURRENCY_PAIRS = [...GLOBAL_PAIRS];

export const METALS_CFD = [
  { sym: "XAUUSD", base: "XAU", quote: "USD", name: "Gold / US Dollar", decimals: 2 },
  { sym: "XAGUSD", base: "XAG", quote: "USD", name: "Silver / US Dollar", decimals: 3 },
  { sym: "XAUEUR", base: "XAU", quote: "EUR", name: "Gold / Euro", decimals: 2 },
  { sym: "XAGEUR", base: "XAG", quote: "EUR", name: "Silver / Euro", decimals: 3 },
  { sym: "XPTUSD", base: "XPT", quote: "USD", name: "Platinum / US Dollar", decimals: 2 },
  { sym: "XPDUSD", base: "XPD", quote: "USD", name: "Palladium / US Dollar", decimals: 2 },
  { sym: "COPPER", base: "COPPER", quote: "CFD", name: "Copper", decimals: 3 },
];

export const ENERGIES_CFD = [
  { sym: "UKOIL", base: "UK", quote: "OIL", name: "UK Oil", decimals: 2 },
  { sym: "OIL", base: "US", quote: "OIL", name: "US Oil", decimals: 2 },
  { sym: "NATGAS", base: "NAT", quote: "GAS", name: "Natural Gas", decimals: 3 },
];

export const INDICES_CFD = [
  { sym: "UK100", base: "UK", quote: "100", name: "UK100 / FTSE 100", decimals: 1 },
  { sym: "GER30", base: "GER", quote: "30", name: "DAX 30", decimals: 1 },
  { sym: "SPX500", base: "SPX", quote: "500", name: "S&P 500", decimals: 1 },
  { sym: "FRA40", base: "FRA", quote: "40", name: "CAC 40", decimals: 1 },
  { sym: "ESP35", base: "ESP", quote: "35", name: "IBEX 35", decimals: 1 },
  { sym: "JPN225", base: "JPN", quote: "225", name: "Nikkei 225", decimals: 1 },
  { sym: "NAS100", base: "NAS", quote: "100", name: "Nasdaq 100", decimals: 1 },
  { sym: "USA30", base: "USA", quote: "30", name: "Dow Jones 30", decimals: 1 },
  { sym: "HKG33", base: "HKG", quote: "33", name: "Hang Seng", decimals: 1 },
  { sym: "AUS200", base: "AUS", quote: "200", name: "ASX 200", decimals: 1 },
];

export const US_STOCKS = [
  { sym: "AAPL", wsSym: "AAPLUSD", base: "AAPL", quote: "USD", name: "Apple Inc.",  decimals: 2 },
  { sym: "AMZN", wsSym: "AMZNUSD", base: "AMZN", quote: "USD", name: "Amazon.com",  decimals: 2 },
  { sym: "TSLA", wsSym: "TSLAUSD", base: "TSLA", quote: "USD", name: "Tesla Inc.",  decimals: 2 },
  { sym: "NFLX", wsSym: "NFLXUSD", base: "NFLX", quote: "USD", name: "Netflix", decimals: 2 },
  { sym: "GOOGL", wsSym: "GOOGLUSD", base: "GOOGL", quote: "USD", name: "Alphabet", decimals: 2 },
  { sym: "BABA", wsSym: "BABAUSD", base: "BABA", quote: "USD", name: "Alibaba", decimals: 2 },
  { sym: "BAC", wsSym: "BACUSD", base: "BAC", quote: "USD", name: "Bank of America", decimals: 2 },
  { sym: "BIDU", wsSym: "BIDUUSD", base: "BIDU", quote: "USD", name: "Baidu", decimals: 2 },
  { sym: "BA", wsSym: "BAUSD", base: "BA", quote: "USD", name: "Boeing", decimals: 2 },
  { sym: "GE", wsSym: "GEUSD", base: "GE", quote: "USD", name: "General Electric", decimals: 2 },
  { sym: "LMT", wsSym: "LMTUSD", base: "LMT", quote: "USD", name: "Lockheed Martin", decimals: 2 },
  { sym: "V", wsSym: "VUSD", base: "V", quote: "USD", name: "Visa", decimals: 2 },
  { sym: "MA", wsSym: "MAUSD", base: "MA", quote: "USD", name: "Mastercard", decimals: 2 },
  { sym: "GS", wsSym: "GSUSD", base: "GS", quote: "USD", name: "Goldman Sachs", decimals: 2 },
  { sym: "GLW", wsSym: "GLWUSD", base: "GLW", quote: "USD", name: "Corning", decimals: 2 },
  { sym: "PFE", wsSym: "PFEUSD", base: "PFE", quote: "USD", name: "Pfizer", decimals: 2 },
  { sym: "MRK", wsSym: "MRKUSD", base: "MRK", quote: "USD", name: "Merck and Co", decimals: 2 },
  { sym: "JNJ", wsSym: "JNJUSD", base: "JNJ", quote: "USD", name: "Johnson and Johnson", decimals: 2 },
  { sym: "AZN", wsSym: "AZNUSD", base: "AZN", quote: "USD", name: "Astrazeneca", decimals: 2 },
  { sym: "META", wsSym: "METAUSD", base: "META", quote: "USD", name: "Meta Platforms", decimals: 2 },
  { sym: "FB", wsSym: "FBUSD", base: "FB", quote: "USD", name: "Facebook", decimals: 2 },
  { sym: "TWTR", wsSym: "TWTRUSD", base: "TWTR", quote: "USD", name: "Twitter", decimals: 2 },
];

export const CRYPTO_PAIRS = [
  { sym: "AVAXUSD", base: "AVAX", quote: "USD", name: "Avalanche", decimals: 4 },
  { sym: "LRCUSD",  base: "LRC",  quote: "USD", name: "Loopring", decimals: 4 },
  { sym: "NEOUSD",  base: "NEO",  quote: "USD", name: "Neo", decimals: 4 },
  { sym: "VETUSD",  base: "VET",  quote: "USD", name: "VeChain", decimals: 5 },
  { sym: "XLMUSD",  base: "XLM",  quote: "USD", name: "Stellar", decimals: 5 },
  { sym: "ETHUSD",  base: "ETH",  quote: "USD", name: "Ethereum", decimals: 2 },
  { sym: "ETCUSD",  base: "ETC",  quote: "USD", name: "Ethereum Classic", decimals: 4 },
  { sym: "GALAUSD", base: "GALA", quote: "USD", name: "Gala", decimals: 5 },
  { sym: "EOSUSD",  base: "EOS",  quote: "USD", name: "EOS", decimals: 4 },
  { sym: "FLOWUSD", base: "FLOW", quote: "USD", name: "Flow", decimals: 4 },
  { sym: "ROSEUSD", base: "ROSE", quote: "USD", name: "Oasis", decimals: 5 },
  { sym: "DOTUSD",  base: "DOT",  quote: "USD", name: "Polkadot", decimals: 4 },
  { sym: "SOLUSD",  base: "SOL",  quote: "USD", name: "Solana", decimals: 3 },
  { sym: "DASHUSD", base: "DASH", quote: "USD", name: "Dash", decimals: 3 },
  { sym: "LTCUSD",  base: "LTC",  quote: "USD", name: "Litecoin", decimals: 2 },
  { sym: "THETAUSD", base: "THETA", quote: "USD", name: "Theta", decimals: 4 },
  { sym: "EGLDUSD", base: "EGLD", quote: "USD", name: "MultiversX", decimals: 3 },
  { sym: "ENJUSD",  base: "ENJ",  quote: "USD", name: "Enjin", decimals: 5 },
  { sym: "ADAUSD",  base: "ADA",  quote: "USD", name: "Cardano", decimals: 4 },
  { sym: "AXSUSD",  base: "AXS",  quote: "USD", name: "Axie Infinity", decimals: 4 },
  { sym: "DAIUSD",  base: "DAI",  quote: "USD", name: "Dai", decimals: 5 },
  { sym: "HBARUSD", base: "HBAR", quote: "USD", name: "Hedera", decimals: 5 },
  { sym: "SHIBUSD", base: "SHIB", quote: "USD", name: "Shiba Inu", decimals: 8 },
  { sym: "BNBUSD",  base: "BNB",  quote: "USD", name: "BNB", decimals: 3 },
  { sym: "XTZUSD",  base: "XTZ",  quote: "USD", name: "Tezos", decimals: 4 },
  { sym: "BTCUSD",  base: "BTC",  quote: "USD", name: "Bitcoin", decimals: 2 },
  { sym: "NEARUSD", base: "NEAR", quote: "USD", name: "Near", decimals: 4 },
  { sym: "SANDUSD", base: "SAND", quote: "USD", name: "The Sandbox", decimals: 5 },
  { sym: "MANAUSD", base: "MANA", quote: "USD", name: "Decentraland", decimals: 5 },
  { sym: "XRPUSD",  base: "XRP",  quote: "USD", name: "Ripple", decimals: 4 },
  { sym: "USDTUSD", base: "USDT", quote: "USD", name: "Tether", decimals: 5 },
  { sym: "LINKUSD", base: "LINK", quote: "USD", name: "Chainlink", decimals: 4 },
  { sym: "ICPUSD",  base: "ICP",  quote: "USD", name: "Internet Computer", decimals: 4 },
  { sym: "BCHUSD",  base: "BCH",  quote: "USD", name: "Bitcoin Cash", decimals: 2 },
  { sym: "TRXUSD",  base: "TRX",  quote: "USD", name: "TRON", decimals: 5 },
  { sym: "DOGEUSD", base: "DOGE", quote: "USD", name: "Dogecoin", decimals: 4 },
  { sym: "FILUSD",  base: "FIL",  quote: "USD", name: "Filecoin", decimals: 4 },
  { sym: "UNIUSD",  base: "UNI",  quote: "USD", name: "Uniswap", decimals: 4 },
  { sym: "ATOMUSD", base: "ATOM", quote: "USD", name: "Cosmos", decimals: 4 },
  { sym: "BCHBTC",  base: "BCH",  quote: "BTC", name: "Bitcoin Cash / Bitcoin", decimals: 6 },
  { sym: "ETHBTC",  base: "ETH",  quote: "BTC", name: "Ethereum / Bitcoin", decimals: 6 },
  { sym: "LTCBTC",  base: "LTC",  quote: "BTC", name: "Litecoin / Bitcoin", decimals: 6 },
  { sym: "ETCBTC",  base: "ETC",  quote: "BTC", name: "Ethereum Classic / Bitcoin", decimals: 6 },
  { sym: "LINKBTC", base: "LINK", quote: "BTC", name: "Chainlink / Bitcoin", decimals: 6 },
  { sym: "BNBBTC",  base: "BNB",  quote: "BTC", name: "BNB / Bitcoin", decimals: 6 },
  { sym: "BTCTUSD", base: "BTC",  quote: "TUSD", name: "Bitcoin / TrueUSD", decimals: 2 },
  { sym: "WBTCBTC", base: "WBTC", quote: "BTC", name: "Wrapped Bitcoin / Bitcoin", decimals: 6 },
  { sym: "ALGOUSD", base: "ALGO", quote: "USD", name: "Algorand", decimals: 5 },
  { sym: "USDCUSD", base: "USDC", quote: "USD", name: "USD Coin", decimals: 5 },
  { sym: "BTGUSD",  base: "BTG",  quote: "USD", name: "Bitcoin Gold", decimals: 3 },
  { sym: "BUSDUSD", base: "BUSD", quote: "USD", name: "Binance USD", decimals: 5 },
  { sym: "FTMUSD",  base: "FTM",  quote: "USD", name: "Fantom", decimals: 5 },
  { sym: "FTTUSD",  base: "FTT",  quote: "USD", name: "FTX Token", decimals: 4 },
  { sym: "HNTUSD",  base: "HNT",  quote: "USD", name: "Helium", decimals: 4 },
  { sym: "LUNAUSD", base: "LUNA", quote: "USD", name: "Luna", decimals: 4 },
  { sym: "POLUSD",  base: "POL",  quote: "USD", name: "Polygon", decimals: 5 },
  { sym: "XMRUSD",  base: "XMR",  quote: "USD", name: "Monero", decimals: 2 },
];

export const MARKETS = [
  {
    id: "GLOBAL",
    label: "Global Currencies",
    symbols: GLOBAL_PAIRS,
    weekend: false,
    alwaysOpen: false,
    getStatus() {
      const d = new Date(), day = d.getUTCDay();
      if (day === 0 || day === 6) return { open: false, label: "Weekend" };
      return { open: true, label: "FX Open · 24/5" };
    },
  },
  {
    id: "METALS",
    label: "Metals",
    symbols: METALS_CFD,
    weekend: false,
    alwaysOpen: false,
    getStatus() {
      const d = new Date(), day = d.getUTCDay();
      if (day === 0 || day === 6) return { open: false, label: "Weekend" };
      return { open: true, label: "Metals CFD · Live" };
    },
  },
  {
    id: "ENERGIES",
    label: "Energies",
    symbols: ENERGIES_CFD,
    weekend: false,
    alwaysOpen: false,
    getStatus() {
      const d = new Date(), day = d.getUTCDay();
      if (day === 0 || day === 6) return { open: false, label: "Weekend" };
      return { open: true, label: "Energy CFD · Live" };
    },
  },
  {
    id: "INDICES",
    label: "Indices",
    symbols: INDICES_CFD,
    weekend: false,
    alwaysOpen: false,
    getStatus() {
      const d = new Date(), day = d.getUTCDay();
      if (day === 0 || day === 6) return { open: false, label: "Weekend" };
      return { open: true, label: "Index CFD · Live" };
    },
  },
  {
    id: "STOCKS",
    label: "Stocks",
    symbols: US_STOCKS,
    weekend: false,
    alwaysOpen: false,
    getStatus() {
      const d = new Date(), day = d.getUTCDay();
      if (day === 0 || day === 6) return { open: false, label: "Weekend" };
      const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
      const open = 14 * 60 + 30, close = 21 * 60;
      if (mins >= open && mins < close) return { open: true, label: "NYSE Open" };
      if (mins < open) {
        const rem = open - mins;
        return { open: false, label: `NYSE opens in ${Math.floor(rem / 60)}h ${rem % 60}m` };
      }
      return { open: false, label: "NYSE Closed" };
    },
  },
  {
    id: "CRYPTO",
    label: "Crypto",
    symbols: CRYPTO_PAIRS,
    weekend: true,
    alwaysOpen: true,
    getStatus() { return { open: true, label: "Crypto · 24/7" }; },
  },
];

export const TIMEFRAMES = [
  { label: "1 Min",  interval: "minute", period: 1,  daysBack: 1   },
  { label: "5 Min",  interval: "minute", period: 5,  daysBack: 1   },
  { label: "15 Min", interval: "minute", period: 15, daysBack: 2   },
  { label: "30 Min", interval: "minute", period: 30, daysBack: 3   },
  { label: "1H",     interval: "hourly", period: 1,  daysBack: 14  }, // User requested exactly 14 days for hourly
  { label: "4H",     interval: "hourly", period: 4,  daysBack: 30  }, // User requested exactly 30 days for 4-hourly
  { label: "1D",     interval: "daily",  period: 1,  daysBack: 365 }, // Capped at 1 year
];

// Symbols for REST timeseries API
export const DEFAULT_SYMBOLS = [
  ...CURRENCY_PAIRS.map(p => p.sym),
  ...METALS_CFD.map(p => p.sym),
  ...ENERGIES_CFD.map(p => p.sym),
  ...INDICES_CFD.map(p => p.sym),
  ...US_STOCKS.map(p => p.sym),
  ...CRYPTO_PAIRS.map(p => p.sym),
];

// WS symbols (stocks use AAPLUSD format), mapped back to REST sym
export const WS_SYMBOL_MAP = Object.fromEntries([
  ...CURRENCY_PAIRS.map(p => [p.sym, p.sym]),
  ...METALS_CFD.map(p => [p.sym, p.sym]),
  ...ENERGIES_CFD.map(p => [p.sym, p.sym]),
  ...INDICES_CFD.map(p => [p.sym, p.sym]),
  ...US_STOCKS.map(p => [p.wsSym, p.sym]),
  ...CRYPTO_PAIRS.map(p => [p.sym, p.sym]),
]);

export const WS_SYMBOLS = [
  ...CURRENCY_PAIRS.map(p => p.sym),
  ...METALS_CFD.map(p => p.sym),
  ...ENERGIES_CFD.map(p => p.sym),
  ...INDICES_CFD.map(p => p.sym),
  ...US_STOCKS.map(p => p.wsSym),
  ...CRYPTO_PAIRS.map(p => p.sym),
];

export const T = {
  bg:           "#0a0e17",
  bgPanel:      "#0f1423",
  bgCard:       "#141b2d",
  bgHover:      "#1a2540",
  border:       "#1e2d42",
  borderBright: "#2d4058",
  textPrimary:  "#f0f4f9",
  textSecondary:"#8a96a8",
  textDim:      "#4a5a72",
  green:        "#10b981",
  red:          "#ef4444",
  blue:         "#3b82f6",
  gold:         "#f59e0b",
  purple:       "#8b5cf6",
  cyan:         "#06b6d4",
  mono:         "'IBM Plex Mono', monospace",
};

export const NAV_LINKS = ["Markets", "Screener", "News", "Portfolio"];

export const TOOLS = [
  { id: "chart", label: "Chart Pattern" },
  { id: "text", label: "Text Annotation" },
  { id: "trend", label: "Trend Line" },
  { id: "fib", label: "Fibonacci" },
  { id: "rect", label: "Rectangle" },
  { id: "ruler", label: "Measure Tool" },
  { id: "eye", label: "Hide/Show" },
  { id: "trade", label: "Trade Tool" },
  { id: "magnet", label: "Magnet" },
  { id: "zoom", label: "Zoom" },
  { id: "compare", label: "Compare" },
  { id: "hidden", label: "Hide Indicators" },
];
