import { useEffect, useRef, useImperativeHandle, forwardRef, useState } from "react";
import { T as DEFAULT_T } from "../constants/constants.jsx";

function getThemeTokens() {
  if (typeof window === "undefined") return DEFAULT_T;
  const styles = getComputedStyle(document.documentElement);
  const read = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
  const bg = read("--bg-base", DEFAULT_T.bg);
  const bgCard = read("--bg-card", DEFAULT_T.bgCard);
  const green = read("--green", DEFAULT_T.green);
  const red = read("--red", DEFAULT_T.red);
  const blue = read("--blue", DEFAULT_T.blue);

  return {
    bg: read("--chart-bg", bg),
    bgPanel: read("--bg-panel", DEFAULT_T.bgPanel),
    bgCard: read("--chart-grid", bgCard),
    bgHover: read("--bg-hover", DEFAULT_T.bgHover),
    border: read("--border", DEFAULT_T.border),
    borderBright: read("--border-bright", DEFAULT_T.borderBright),
    textPrimary: read("--text-primary", DEFAULT_T.textPrimary),
    textSecondary: read("--text-secondary", DEFAULT_T.textSecondary),
    textDim: read("--text-dim", DEFAULT_T.textDim),
    green: read("--chart-green", green),
    red: read("--chart-red", red),
    blue: read("--chart-blue", blue),
    gold: read("--gold", DEFAULT_T.gold),
    purple: read("--purple", DEFAULT_T.purple),
    cyan: read("--cyan", DEFAULT_T.cyan),
    mono: read("--font-mono", DEFAULT_T.mono),
  };
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}


function applyThemeToOptions(options, theme, decimals) {
  if (!options.chart) options.chart = {};
  options.chart.backgroundColor = theme.bg;
  options.chart.style = { ...(options.chart.style || {}), fontFamily: theme.mono };

  options.navigator = {
    ...(options.navigator || {}),
    maskFill: "rgba(59,130,246,0.1)",
    outlineColor: theme.border,
    handles: { ...(options.navigator?.handles || {}), backgroundColor: theme.bgCard, borderColor: theme.border },
    series: { ...(options.navigator?.series || {}), color: theme.blue, lineWidth: 1 },
    xAxis: {
      ...(options.navigator?.xAxis || {}),
      gridLineColor: theme.bgCard,
      labels: { style: { color: theme.textDim, fontSize: "9px", fontFamily: theme.mono } },
    },
  };

  options.scrollbar = {
    ...(options.scrollbar || {}),
    barBackgroundColor: theme.bgCard,
    barBorderColor: theme.border,
    buttonBackgroundColor: theme.bgCard,
    buttonBorderColor: theme.border,
    rifleColor: theme.textDim,
    trackBackgroundColor: theme.bg,
    trackBorderColor: theme.border,
  };

  const xAxes = asArray(options.xAxis);
  xAxes.forEach((axis) => {
    axis.lineColor = theme.border;
    axis.gridLineColor = theme.bgCard;
    axis.tickColor = theme.border;
    axis.labels = { ...(axis.labels || {}), style: { color: theme.textDim, fontSize: "10px", fontFamily: theme.mono } };
    axis.crosshair = { ...(axis.crosshair || {}), color: theme.borderBright };
  });
  if (xAxes.length) options.xAxis = Array.isArray(options.xAxis) ? xAxes : xAxes[0];

  const yAxes = asArray(options.yAxis);
  yAxes.forEach((axis) => {
    axis.gridLineColor = theme.bgCard;
    axis.lineColor = theme.border;
    axis.tickColor = theme.border;
    axis.labels = {
      ...(axis.labels || {}),
      style: { color: theme.textDim, fontSize: "10px", fontFamily: theme.mono },
      formatter() {
              // Return empty string when value isn't a finite number so we
              // don't render a phantom "0.000" label during transient states.
              return Number.isFinite(this.value) ? this.value.toFixed(decimals) : "";
            },
    };
    axis.crosshair = {
      ...(axis.crosshair || {}),
      color: theme.borderBright,
      label: {
        ...(axis.crosshair?.label || {}),
        backgroundColor: theme.blue,
        style: { color: "#fff", fontSize: "10px", fontFamily: theme.mono },
      },
    };
    // Force-disable axis-level price indicators — we use series.lastPrice
    // (configured below) as the single source of truth. Multiple overlapping
    // indicators were causing the "0.000" ghost label when one defaulted
    // to value=0 before data loaded.
    axis.lastPrice = { enabled: false };
    axis.currentPriceIndicator = { enabled: false };
  });
  if (yAxes.length) options.yAxis = Array.isArray(options.yAxis) ? yAxes : yAxes[0];

  options.tooltip = {
    ...(options.tooltip || {}),
    backgroundColor: theme.bgPanel,
    borderColor: theme.border,
    style: {
      ...(options.tooltip?.style || {}),
      color: theme.textPrimary,
      fontSize: "11px",
      fontFamily: theme.mono,
    },
  };

  options.plotOptions = {
    ...(options.plotOptions || {}),
    candlestick: {
      ...(options.plotOptions?.candlestick || {}),
      color: theme.red,
      upColor: theme.green,
      lineColor: theme.red,
      upLineColor: theme.green,
    },
  };

  if (Array.isArray(options.series)) {
    options.series.forEach((series) => {
      // Main price series — colour depends on chart type. OHLC-shaped types
      // need bullish/bearish split; line/area types use a single accent colour.
      if (series.id === "main") {
        const seriesType = series.type || "candlestick";
        if (seriesType === "candlestick" || seriesType === "ohlc") {
          series.color = theme.red;
          series.upColor = theme.green;
          series.lineColor = theme.red;
          series.upLineColor = theme.green;
        } else {
          series.color = theme.blue;
          // Strip candlestick-only options so they don't bleed in if the user
          // later switches back: Highcharts ignores them for non-OHLC types.
          delete series.upColor;
          delete series.upLineColor;
          delete series.lineColor;
        }
      } else if (series.type === "candlestick") {
        // Defensive: an extra non-main candlestick series shouldn't really
        // happen, but if it does, give it the same OHLC colour treatment.
        series.color = theme.red;
        series.upColor = theme.green;
        series.lineColor = theme.red;
        series.upLineColor = theme.green;
      }
      if (series.lastPrice) {
        const lastPrice = typeof series.lastPrice === "object" ? series.lastPrice : {};
        const labelBase = { ...(lastPrice.label || {}) };
        delete labelBase.formatter; // strip stale formatter that overrides `format`
        delete labelBase.format;
        series.lastPrice = {
          ...lastPrice,
          color: theme.blue,
          label: {
            ...labelBase,
            backgroundColor: theme.blue,
            style: { color: "#fff", fontSize: "10px", fontFamily: theme.mono },
            format: `{value:.${decimals}f}`,
          },
        };
      }
      // Force-disable any persisted lastVisiblePrice (we don't use it; it was
      // a source of the duplicate "0.000" label).
      if (series.lastVisiblePrice) {
        series.lastVisiblePrice = { enabled: false };
      }
    });
  }
}

function getOptions(elements) {
  const options = [];
  (elements || []).forEach(element => {
    const userOptions = element.userOptions;
    if (userOptions && !userOptions.isInternal) {
      options.push(userOptions);
      if (userOptions.draggable && userOptions.labels) {
        userOptions.labels.forEach(label => {
          label.controlPoints = null;
        });
      }
    }
  });
  return options;
}

// ─── Global chart type (candlestick / line / ohlc / area / ...) ────────────
// Persisted across symbols WITHOUT a Save click — so switching pairs keeps
// whatever type the user picked from the stock-tools toolbar.
const CHART_TYPE_KEY = "fx_chart_type";
const DEFAULT_CHART_TYPE = "candlestick";
// Types we accept from the stock-tools toolbar. Anything else falls back to
// candlestick so we don't trust garbage that landed in localStorage.
const ALLOWED_CHART_TYPES = new Set([
  "candlestick", "ohlc", "line", "area", "spline", "areaspline", "column",
]);

const INDICATOR_STORAGE_KEY = "fx_indicators";

function isMainPriceSeries(series, index = -1) {
  const opts = series?.options || series || {};
  const user = series?.userOptions || {};
  const id = opts.id ?? user.id;
  return (
    id === "main" ||
    index === 0
  );
}

function cleanAxisOptions(axisOptions) {
  const clean = { ...(axisOptions || {}) };
  delete clean.min;
  delete clean.max;
  delete clean.dataMin;
  delete clean.dataMax;
  return clean;
}

function stripRuntimePosition(cfg) {
  if (!cfg || typeof cfg !== "object") return cfg;
  const rest = { ...cfg };
  delete rest.value;
  delete rest.from;
  delete rest.to;
  delete rest.x;
  delete rest.y;
  return rest;
}

function buildGlobalIndicatorOptions(chart) {
  if (!chart || !chart.renderer) return null;
  const mainSeries = chart.get?.("main") ?? chart.series?.[0];
  if (!mainSeries) return null;

  const globalInds = { series: [], yAxis: [] };

  if (chart.series?.length) {
    globalInds.series = chart.series
      .map((series, index) => {
        const opts = { ...(series.userOptions || series.options || {}) };
        if (
          isMainPriceSeries(series, index) ||
          opts.id === "navigator-series" ||
          opts.isInternal ||
          series.options?.isInternal
        ) {
          return null;
        }

        delete opts.data;
        delete opts.isInternal;
        if (!opts.linkedTo && series.linkedParent === mainSeries) {
          opts.linkedTo = "main";
        }
        return opts;
      })
      .filter(Boolean);
  }

  if (chart.yAxis?.length) {
    const allY = getOptions(chart.yAxis).map(cleanAxisOptions);
    globalInds.yAxis = allY.length > 1 ? allY.slice(1) : [];

    const mainY = allY[0];
    if (mainY) {
      const mainLayout = {};
      if (mainY.top != null) mainLayout.top = mainY.top;
      if (mainY.height != null) mainLayout.height = mainY.height;
      if (mainY.resize) mainLayout.resize = mainY.resize;
      if (Object.keys(mainLayout).length > 0) {
        globalInds.mainYAxisLayout = mainLayout;
      }
    }
  }

  if (chart.yAxis?.[0]) {
    const mainY = chart.yAxis[0];
    const cpi = mainY.options?.currentPriceIndicator;
    if (cpi) {
      globalInds.currentPriceIndicator = stripRuntimePosition(cpi);
    }
    if (mainSeries?.options?.lastPrice) {
      globalInds.lastPrice = stripRuntimePosition(mainSeries.options.lastPrice);
    }
    if (mainSeries?.options?.lastVisiblePrice) {
      globalInds.lastVisiblePrice = stripRuntimePosition(mainSeries.options.lastVisiblePrice);
    }
  }

  if (globalInds.series.length === 0) {
    globalInds.yAxis = [];
    delete globalInds.mainYAxisLayout;
  }

  return globalInds;
}

function getIndicatorSignature(chart) {
  const globalInds = buildGlobalIndicatorOptions(chart);
  if (!globalInds) return null;
  return JSON.stringify({
    series: globalInds.series,
    yAxis: globalInds.yAxis,
    mainYAxisLayout: globalInds.mainYAxisLayout ?? null,
  });
}

function loadGlobalChartType() {
  try {
    const raw = localStorage.getItem(CHART_TYPE_KEY);
    return ALLOWED_CHART_TYPES.has(raw) ? raw : DEFAULT_CHART_TYPE;
  } catch {
    return DEFAULT_CHART_TYPE;
  }
}

function saveGlobalChartType(type) {
  if (!ALLOWED_CHART_TYPES.has(type)) return;
  try { localStorage.setItem(CHART_TYPE_KEY, type); } catch { /* ignore */ }
}

// Toggle-style bindings for the stock-tools type-change buttons.
// Default Highcharts behavior: clicking a type button sets that type, even
// if it's already active (no-op). With these overrides, clicking the type
// that's currently active REVERTS to the default (candlestick) — giving
// users a one-click escape from any non-default mode without needing to
// dig through localStorage or a menu.
function makeTypeToggleBindings() {
  const makeToggle = (typeName) => ({
    init: function () {
      const series = this.chart?.series?.[0];
      if (!series) return;
      const currentType = series.options?.type;
      // If the clicked type matches what's already active → fall back to
      // candlestick. Otherwise switch to the clicked type. (Clicking the
      // candlestick button while already on candlestick is a no-op.)
      const nextType = currentType === typeName && typeName !== DEFAULT_CHART_TYPE
        ? DEFAULT_CHART_TYPE
        : typeName;
      try {
        series.update({ type: nextType }, true);
        // Persist immediately. The render-event auto-save would also catch
        // this 1s later, but explicitly saving here means a fast symbol
        // switch right after the click still sees the new type.
        saveGlobalChartType(nextType);
      } catch (e) {
        console.warn("type-toggle update failed:", e);
      }
    },
  });
  return {
    seriesTypeCandlestick: {
      className: "highcharts-series-type-candlestick",
      ...makeToggle("candlestick"),
    },
    seriesTypeOhlc: {
      className: "highcharts-series-type-ohlc",
      ...makeToggle("ohlc"),
    },
    seriesTypeLine: {
      className: "highcharts-series-type-line",
      ...makeToggle("line"),
    },
  };
}

function saveGlobalIndicators(chart, options = {}) {
  try {
    if (options.guarded) return savePersistedIndicators(chart, options);
    if (!chart) return;
    // Bail-out 1: chart has been destroyed. After Highcharts.destroy() the
    // chart object reference still exists (a stale setTimeout closure can
    // hold it), but `chart.renderer` is nulled out. Saving here would
    // serialise an empty series array and clobber real indicators that the
    // user just added on a different symbol.
    if (!chart.renderer) return;
    // Bail-out 2: chart is alive but the main price series isn't there yet
    // (Highcharts mid-construction, or some edge case). Saving an "empty"
    // result here would also clobber the real saved indicators.
    const hasMain = chart.series?.some?.((s) => s?.options?.id === "main");
    if (!hasMain) return;

    const globalInds = { series: [], yAxis: [] };

    if (chart.series?.length) {
      const allSeries = getOptions(chart.series).map(s => {
        const cloned = Object.assign({}, s);
        delete cloned.data;
        return cloned;
      });
      globalInds.series = allSeries.filter(s => !(s.id === "main" || s.id === "navigator-series" || s.isInternal || s.type === "candlestick"));
    }

    if (chart.yAxis?.length) {
      const allY = getOptions(chart.yAxis);
      globalInds.yAxis = allY.length > 1 ? allY.slice(1) : [];

      // Also persist the MAIN price yAxis layout (top/height/resize). When an
      // indicator is added via stock-tools, Highcharts shrinks yAxis[0] (e.g.
      // to height 60%) and adds a drag-resize handle. Without saving this,
      // the next chart restores indicators at top:60% but yAxis[0] is back
      // at full height, so they overlap with no visible separator.
      const mainY = allY[0];
      if (mainY) {
        const mainLayout = {};
        if (mainY.top != null) mainLayout.top = mainY.top;
        if (mainY.height != null) mainLayout.height = mainY.height;
        if (mainY.resize) mainLayout.resize = mainY.resize;
        if (Object.keys(mainLayout).length > 0) {
          globalInds.mainYAxisLayout = mainLayout;
        }
      }
    }

    // Persist currentPriceIndicator / lastPrice STYLES only — strip any
    // chart-specific numeric position (`value`/`from`/`to`/`x`/`y`) so
    // switching symbols doesn't carry the previous chart's price into the new one.
    const stripValues = (cfg) => {
      if (!cfg || typeof cfg !== "object") return cfg;
      const rest = { ...cfg };
      delete rest.value;
      delete rest.from;
      delete rest.to;
      delete rest.x;
      delete rest.y;
      return rest;
    };

    if (chart.yAxis?.[0]) {
      const mainY = chart.yAxis[0];
      const cpi = mainY.options?.currentPriceIndicator;
      if (cpi) {
        globalInds.currentPriceIndicator = stripValues(cpi);
      }
      const mainSeries = chart.series?.[0];
      if (mainSeries?.options?.lastPrice) {
        globalInds.lastPrice = stripValues(mainSeries.options.lastPrice);
      }
      if (mainSeries?.options?.lastVisiblePrice) {
        globalInds.lastVisiblePrice = stripValues(mainSeries.options.lastVisiblePrice);
      }
    }

    // Consistency check: if we ended up with NO indicator series, drop the
    // indicator yAxis panes and main-pane-shrink layout too. Otherwise we'd
    // persist an "orphan pane" — a yAxis with no series in it — which on
    // every new chart squashes the price pane to make room for empty space.
    // This happens when Highcharts removes a series via the Edit popup but
    // doesn't immediately clean up the associated yAxis.
    if (globalInds.series.length === 0) {
      globalInds.yAxis = [];
      delete globalInds.mainYAxisLayout;
    }

    localStorage.setItem("fx_indicators", JSON.stringify(globalInds));
  } catch (e) {
    console.warn("saveGlobalIndicators failed:", e);
  }
}

function savePersistedIndicators(chart, { allowEmpty = false } = {}) {
  try {
    const globalInds = buildGlobalIndicatorOptions(chart);
    if (!globalInds) return false;

    if (!allowEmpty && globalInds.series.length === 0) {
      const previous = loadGlobalIndicators();
      if (previous?.series?.length) return false;
    }

    localStorage.setItem(INDICATOR_STORAGE_KEY, JSON.stringify(globalInds));
    return true;
  } catch (e) {
    console.warn("savePersistedIndicators failed:", e);
    return false;
  }
}

function saveChartOptions(symbol, chart) {
  try {
    if (!chart || !symbol) return;

    const userOptions = Object.assign({}, chart.userOptions);
    // Never persist the visible x-axis/navigator range. Saved chart layouts
    // should restore drawings/style only; every fresh chart load should open
    // at the full loaded data range.
    delete userOptions.xAxis;
    delete userOptions.navigator;
    if (userOptions.rangeSelector) {
      userOptions.rangeSelector = { ...userOptions.rangeSelector };
      delete userOptions.rangeSelector.selected;
    }

    userOptions.annotations = chart.annotations?.length ? getOptions(chart.annotations) : [];

    if (chart.series?.length) {
      const allSeries = getOptions(chart.series).map(s => {
        const cloned = Object.assign({}, s);
        delete cloned.data;
        return cloned;
      });
      userOptions.series = allSeries.filter(s => s.id === "main" || s.type === "candlestick");
    }

    if (chart.yAxis?.length) {
      const allY = getOptions(chart.yAxis).map(y => {
        const clean = { ...y };
        delete clean.min;
        delete clean.max;
        delete clean.userMin;
        delete clean.userMax;
        delete clean.dataMin;
        delete clean.dataMax;
        delete clean.oldMin;
        delete clean.oldMax;
        return clean;
      });
      // Main chart configuration exclusively saves its own central price axis pane
      userOptions.yAxis = allY.length ? [allY[0]] : [];
    }

    localStorage.setItem(symbol + "lschartoptions", JSON.stringify(userOptions));
  } catch (e) {
    console.warn("saveChartOptions failed:", e);
  }
}

function loadGlobalIndicators() {
  try {
    const raw = localStorage.getItem(INDICATOR_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function loadChartOptions(symbol) {
  try {
    const raw = localStorage.getItem(symbol + "lschartoptions");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed) {
      delete parsed.xAxis;
      delete parsed.navigator;
      if (parsed.rangeSelector) {
        parsed.rangeSelector = { ...parsed.rangeSelector };
        delete parsed.rangeSelector.selected;
      }
      if (Array.isArray(parsed.series)) {
        parsed.series = parsed.series.filter((s, index) => index === 0 || s?.id === "main");
      }
      if (Array.isArray(parsed.yAxis)) {
        parsed.yAxis = parsed.yAxis.map(y => {
          const clean = { ...y };
          delete clean.min;
          delete clean.max;
          delete clean.userMin;
          delete clean.userMax;
          delete clean.dataMin;
          delete clean.dataMax;
          delete clean.oldMin;
          delete clean.oldMax;
          return clean;
        });
      } else if (parsed.yAxis) {
        delete parsed.yAxis.min;
        delete parsed.yAxis.max;
        delete parsed.yAxis.userMin;
        delete parsed.yAxis.userMax;
        delete parsed.yAxis.dataMin;
        delete parsed.yAxis.dataMax;
        delete parsed.yAxis.oldMin;
        delete parsed.yAxis.oldMax;
      }
    }
    return parsed;
  } catch { return null; }
}

function mapCandles(data) {
  return data.map((d) => [d.t, d.o, d.h, d.l, d.c]);
}

function mapNavigatorCandles(data) {
  return data.map((d) => [d.t, d.c]);
}

function visibleCandles(data, visibleStartMs = null, visibleEndMs = null) {
  const start = Number.isFinite(visibleStartMs) ? visibleStartMs : null;
  const end = Number.isFinite(visibleEndMs) ? visibleEndMs : null;
  const visible = (data || []).filter((bar) => (
    Number.isFinite(bar?.t) &&
    (start == null || bar.t >= start) &&
    (end == null || bar.t <= end)
  ));
  return visible.length ? visible : data;
}

function resetXAxisToVisibleRange(chart, data, visibleStartMs = null, visibleEndMs = null) {
  const series = chart?.get?.("main") ?? chart?.series?.[0];
  const seriesX = series?.xData || series?.processedXData || [];
  const firstFromSeries = Number.isFinite(seriesX[0]) ? seriesX[0] : data?.[0]?.t;
  const lastFromSeries = seriesX.length ? seriesX[seriesX.length - 1] : undefined;
  const lastFromData = Number.isFinite(lastFromSeries) ? lastFromSeries : data?.[data.length - 1]?.t;
  const first = Number.isFinite(visibleStartMs) && Number.isFinite(firstFromSeries)
    ? Math.max(visibleStartMs, firstFromSeries)
    : firstFromSeries;
  const last = Number.isFinite(visibleEndMs) && Number.isFinite(lastFromData)
    ? Math.min(visibleEndMs, lastFromData)
    : lastFromData;
  const xAxis = chart?.xAxis?.[0];
  if (!Number.isFinite(first) || !Number.isFinite(last) || !xAxis) return;

  try {
    if (xAxis.options) {
      delete xAxis.options.min;
      delete xAxis.options.max;
    }
    xAxis.setExtremes(first, last, false, false);
    const navigatorAxes = [
      chart?.navigator?.xAxis,
      chart?.xAxis?.[1],
    ].filter((axis) => axis && axis !== xAxis);
    navigatorAxes.forEach((axis) => {
      if (axis.options) {
        delete axis.options.min;
        delete axis.options.max;
      }
      axis.setExtremes(first, last, false, false);
    });
    const navigatorSeries = chart?.navigator?.series?.[0];
    if (navigatorSeries?.xAxis) {
      const navAxis = navigatorSeries.xAxis;
      if (navAxis.options) {
        delete navAxis.options.min;
        delete navAxis.options.max;
      }
      navAxis.setExtremes(first, last, false, false);
    }
  } catch { /* ignore range reset failures */ }
}

function updateNavigatorVisibleData(chart, data, visibleStartMs = null, visibleEndMs = null) {
  const navigatorSeries = chart?.navigator?.series?.[0];
  if (!navigatorSeries?.setData) return;
  try {
    navigatorSeries.setData(
      mapNavigatorCandles(visibleCandles(data, visibleStartMs, visibleEndMs)),
      false,
      false,
      false,
    );
  } catch { /* ignore navigator update failures */ }
}

function formatFinitePrice(value, decimals) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(decimals) : "";
}

function makeCrosshairLabelFormatter(decimals) {
  return function crosshairLabelFormatter(value) {
    const hoverPoint = this?.axis?.chart?.hoverPoint;
    const candidates = [value, this?.value, hoverPoint?.close, hoverPoint?.y];
    const price = candidates.find((candidate) => Number.isFinite(Number(candidate)));
    return formatFinitePrice(price, decimals);
  };
}

/* ── Component ───────────────────────────────────────────────────────────── */
// Indicators that require a volume column. TraderMade FX / metals / energies /
// indices feeds carry no volume, so these can't compute and they leave behind
// an empty pane the user can't remove via the Edit popup. We hide them from
// the indicator-picker popup when the active market doesn't carry volume.
const VOLUME_INDICATOR_NAME_KEYWORDS = [
  "volume",       // OBV, VBP, VWAP, VW-MACD
  "money flow",   // MFI, Chaikin Money Flow
  "chaikin",      // Chaikin Oscillator (also covers Chaikin Money Flow)
  "klinger",      // Klinger Oscillator
  "accumulation", // Accumulation / Distribution
];

function isVolumeIndicatorLabel(text) {
  if (!text) return false;
  const lower = String(text).toLowerCase().trim();
  return VOLUME_INDICATOR_NAME_KEYWORDS.some((kw) => lower.includes(kw));
}

const CandleChart = forwardRef(function CandleChart({
  data,
  symbol,
  decimals = 5,
  onReady,
  marketHasVolume = true,
  visibleStartMs = null,
  visibleEndMs = null,
}, ref) {
  const containerRef = useRef(null);
  const chartRef     = useRef(null);
  const symbolRef    = useRef(symbol);
  const dataRef      = useRef(data);
  const prevDataRef  = useRef(null);
  const onReadyRef   = useRef(onReady);
  const visibleStartRef = useRef(visibleStartMs);
  const visibleEndRef = useRef(visibleEndMs);
  const [themeVersion, setThemeVersion] = useState(0);
  const dataReady = Boolean(data?.length);

  useEffect(() => { symbolRef.current = symbol; }, [symbol]);
  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);
  useEffect(() => { visibleStartRef.current = visibleStartMs; }, [visibleStartMs]);
  useEffect(() => { visibleEndRef.current = visibleEndMs; }, [visibleEndMs]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !data?.length) return;
    updateNavigatorVisibleData(chart, data, visibleStartMs, visibleEndMs);
    resetXAxisToVisibleRange(chart, data, visibleStartMs, visibleEndMs);
    chart.redraw(false);
  }, [data, visibleStartMs, visibleEndMs]);



  useEffect(() => {
    const handleThemeChange = () => setThemeVersion((version) => version + 1);
    window.addEventListener("tm-theme-change", handleThemeChange);
    return () => window.removeEventListener("tm-theme-change", handleThemeChange);
  }, []);

  useImperativeHandle(ref, () => ({
    saveChart: () => {
      saveChartOptions(symbolRef.current, chartRef.current);
      return true;
    },
    resetZoom: () => {
      if (chartRef.current) {
        resetXAxisToVisibleRange(
          chartRef.current,
          dataRef.current,
          visibleStartRef.current,
          visibleEndRef.current,
        );
        chartRef.current.redraw(false);
      }
    }
  }));

  /* ── Unified Build/Rebuild Cycle ────────────────────────────────────────── */
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !dataReady || !dataRef.current?.length) return;

    const Highcharts = window.Highcharts;
    if (!Highcharts) return;

    // Cleanly destroy previous chart perfectly matching Vanilla JS
    if (chartRef.current) {
      try { chartRef.current.destroy(); } catch { /* ignore destroy failures */ }
      chartRef.current = null;
    }

    const mappedData = mapCandles(dataRef.current);
    const navigatorData = mapNavigatorCandles(visibleCandles(
      dataRef.current,
      visibleStartMs,
      visibleEndMs,
    ));
    const T = getThemeTokens();
    const crosshairLabelFormatter = makeCrosshairLabelFormatter(decimals);

    // Check if we have saved userOptions for this symbol
    const saved = loadChartOptions(symbol);
    let options;

    if (saved) {
      // Safely inject new OHLC data into the restored series array logic
      options = saved;
      if (!options.series) options.series = [];
      if (!options.series[0]) {
        options.series[0] = { type: "candlestick", id: "main", name: symbol };
      }
      options.series[0].data = mappedData;
      options.series[0].showInNavigator = false;
      // Highcharts natively re-attaches the axes and overlays from `options` smoothly
    } else {
      // Fallback native fresh configuration
      options = {
        chart: {
          backgroundColor: T.bg,
          style: { fontFamily: T.mono },
          animation: false,
          margin: [14, 88, 34, 0],
          zooming: {
            type: "none",
            mouseWheel: { enabled: false },
          },
          panning: { enabled: true, type: "x" },
          panKey: null,
        },
        credits: { enabled: false },
        navigator: {
          enabled: true,
          maskFill: "rgba(59,130,246,0.1)",
          outlineColor: T.border,
          handles: { backgroundColor: T.bgCard, borderColor: T.border },
          series: { color: T.blue, lineWidth: 1, data: navigatorData },
          xAxis: {
            gridLineColor: T.bgCard,
            labels: { style: { color: T.textDim, fontSize: "9px", fontFamily: T.mono } },
          },
        },
        scrollbar: {
          enabled: true,
          barBackgroundColor: T.bgCard,
          barBorderColor: T.border,
          buttonBackgroundColor: T.bgCard,
          buttonBorderColor: T.border,
          rifleColor: T.textDim,
          trackBackgroundColor: T.bg,
          trackBorderColor: T.border,
          height: 8,
        },
        rangeSelector: { enabled: false },
        xAxis: {
          lineColor: T.border,
          gridLineColor: T.bgCard,
          gridLineWidth: 1,
          tickColor: T.border,
          labels: { style: { color: T.textDim, fontSize: "10px", fontFamily: T.mono } },
          crosshair: { color: T.borderBright, dashStyle: "ShortDash", width: 1 },
        },
        yAxis: {
          opposite: true,
          gridLineColor: T.bgCard,
          gridLineWidth: 1,
          lineColor: T.border,
          tickColor: T.border,
          labels: {
            align: "left", x: 6,
            style: { color: T.textDim, fontSize: "10px", fontFamily: T.mono },
            formatter() {
              // Return empty string when value isn't a finite number so we
              // don't render a phantom "0.000" label during transient states.
              return Number.isFinite(this.value) ? this.value.toFixed(decimals) : "";
            },
          },
          crosshair: {
            color: T.borderBright,
            dashStyle: "ShortDash",
            snap: false,
            label: {
              enabled: true,
              backgroundColor: T.blue,
              borderRadius: 3,
              style: { color: "#fff", fontSize: "10px", fontFamily: T.mono },
              formatter: crosshairLabelFormatter,
            },
          },
          // Disabled — we use series.lastPrice (configured on the series itself)
          // as the single price-line indicator. Multiple overlapping indicators
          // caused the stray "0.000" label.
          lastPrice: { enabled: false },
          currentPriceIndicator: { enabled: false },
          plotLines: [],
        },
        tooltip: {
          useHTML: true,
          backgroundColor: T.bgPanel,
          borderColor: T.border,
          borderRadius: 8,
          borderWidth: 1,
          shadow: { color: "rgba(0,0,0,.7)", blur: 24 },
          style: {
            color: T.textPrimary,
            fontSize: "11px",
            fontFamily: T.mono,
            lineHeight: "1.8",
          },
          formatter() {
            const p = this.point;
            const col = p.close >= p.open ? T.green : T.red;
            const date = new Date(this.x).toLocaleString();
            return (
              `<span style="color:${T.textDim};font-size:10px">${date}</span><br/>` +
              `<span style="color:#3a4f68">O </span><span style="color:${T.textSecondary}">${p.open?.toFixed(decimals)}</span><br/>` +
              `<span style="color:#3a4f68">H </span><span style="color:${T.green}">${p.high?.toFixed(decimals)}</span><br/>` +
              `<span style="color:#3a4f68">L </span><span style="color:${T.red}">${p.low?.toFixed(decimals)}</span><br/>` +
              `<span style="color:#3a4f68">C </span><span style="color:${col};font-weight:700">${p.close?.toFixed(decimals)}</span>`
            );
          },
        },
        plotOptions: {
          candlestick: {
            color: T.red, upColor: T.green,
            lineColor: T.red, upLineColor: T.green,
            lineWidth: 1, animation: false,
            dataGrouping: { enabled: false },
            states: { hover: { brightness: 0.12 } },
          },
        },
        series: [{
          type: "candlestick",
          name: "Price",
          id: "main",
          data: mappedData,
          showInNavigator: false,
          dataGrouping: { enabled: false },
          lastPrice: {
            enabled: true,
            color: T.blue,
            dashStyle: "Dash",
            width: 1,
            label: {
              enabled: true,
              backgroundColor: T.blue,
              borderRadius: 3,
              style: { color: "#fff", fontSize: "10px", fontFamily: T.mono },
              format: `{value:.${decimals}f}`,
            },
          },
          // Disabled — redundant with lastPrice and was a source of the
          // duplicate label issue.
          lastVisiblePrice: { enabled: false },
        }],
      };
    }

    options.navigator = {
      ...(options.navigator || {}),
      adaptToUpdatedData: false,
      baseSeries: null,
      series: {
        ...(options.navigator?.series || {}),
        type: "line",
        data: navigatorData,
      },
    };

    // Blend in the global indicators perfectly over any setup
    // Strip stale per-chart numeric positions from persisted price-line configs.
    // Without this, switching symbols can carry the previous symbol's last-price
    // value (e.g. GBPUSD's 1.35060) into the new chart's axes, expanding the
    // y-axis range to include both numbers and squashing the actual candles.
    const stripStaleValues = (cfg) => {
      if (!cfg || typeof cfg !== "object") return cfg;
      const clean = { ...cfg };
      delete clean.value;
      delete clean.from;
      delete clean.to;
      delete clean.x;
      delete clean.y;
      return clean;
    };

    const globalInds = loadGlobalIndicators();
    if (globalInds) {
      // Sanitise orphan-pane state. If a previous (buggy) save persisted a
      // yAxis or main-shrink without any indicator series, ignore those
      // layout pieces so the price pane uses the full height instead of
      // being squashed for an indicator that no longer exists.
      if (!globalInds.series?.length) {
        globalInds.yAxis = [];
        delete globalInds.mainYAxisLayout;
      }

      // Normalise options.yAxis into an array we can mutate in place.
      if (!Array.isArray(options.yAxis)) {
        options.yAxis = options.yAxis ? [options.yAxis] : [];
      }

      // Apply the saved MAIN price yAxis layout (top/height/resize) BEFORE
      // appending indicator panes. This is what restores the drag-handle
      // separator between price and indicator panes — without it the main
      // pane defaults to full height and visually overlaps the indicators.
      if (globalInds.mainYAxisLayout && options.yAxis[0]) {
        Object.assign(options.yAxis[0], globalInds.mainYAxisLayout);
      } else if (globalInds.yAxis?.length && options.yAxis[0]) {
        // Backwards-compat: if we have indicator panes but no saved main
        // layout (older fx_indicators blob), apply a sane default based on
        // how many indicator panes there are so they don't overlap.
        const indicatorCount = globalInds.yAxis.length;
        const mainHeightPercent = Math.max(40, 100 - indicatorCount * 25);
        options.yAxis[0].height = `${mainHeightPercent}%`;
        options.yAxis[0].resize = { enabled: true };
      }

      if (globalInds.yAxis?.length) {
        options.yAxis = [...options.yAxis, ...globalInds.yAxis];
      }
      if (globalInds.series?.length) {
        options.series = [...(options.series || []), ...globalInds.series];
      }

      // Restore currentPriceIndicator STYLE only — never the cached value/position
      if (globalInds.currentPriceIndicator) {
        const cpi = stripStaleValues(globalInds.currentPriceIndicator);
        if (Array.isArray(options.yAxis)) {
          if (options.yAxis[0]) options.yAxis[0].currentPriceIndicator = cpi;
        } else if (options.yAxis) {
          options.yAxis.currentPriceIndicator = cpi;
        }
      }

      // Restore lastPrice / lastVisiblePrice STYLE only — strip stale `value`
      if (options.series?.[0]) {
        if (globalInds.lastPrice) {
          options.series[0].lastPrice = stripStaleValues(globalInds.lastPrice);
        }
        if (globalInds.lastVisiblePrice) {
          options.series[0].lastVisiblePrice = stripStaleValues(globalInds.lastVisiblePrice);
        }
      }
    }

    // ─── Apply the global chart type ─────────────────────────────────────
    // This overrides any type baked into the per-symbol saved layout, so
    // changing type on one symbol propagates to every other symbol. Keep
    // this AFTER the saved-layout / globalInds merge but BEFORE theme
    // application, since applyThemeToOptions branches on series.type.
    const globalType = loadGlobalChartType();
    if (Array.isArray(options.series) && options.series[0] && globalType) {
      options.series[0].type = globalType;
      // Force id="main" on the price series. Saved per-symbol layouts from
      // earlier versions sometimes didn't preserve this id, which broke our
      // saveGlobalIndicators hasMain guard and silently disabled the entire
      // indicator-persist mechanism.
      options.series[0].id = "main";
    }

    // Override the stock-tools type-change bindings so clicking an active
    // type reverts to the default candlestick (see makeTypeToggleBindings).
    options.navigation = {
      ...(options.navigation || {}),
      bindings: {
        ...(options.navigation?.bindings || {}),
        ...makeTypeToggleBindings(),
      },
    };

    applyThemeToOptions(options, T, decimals);

    const forceCrosshairFormatter = (axis) => {
      if (!axis) return;
      axis.crosshair = {
        ...(axis.crosshair || {}),
        label: {
          ...(axis.crosshair?.label || {}),
          formatter: crosshairLabelFormatter,
        },
      };
    };
    if (Array.isArray(options.yAxis)) {
      options.yAxis.forEach(forceCrosshairFormatter);
    } else {
      forceCrosshairFormatter(options.yAxis);
    }

    // Attach the passive auto-saving mechanism.
    //   - Indicators: persisted across symbols via `fx_indicators` (no Save click)
    //   - Chart type: persisted across symbols via `fx_chart_type` (no Save click)
    //   - Drawings / annotations: ONLY saved on explicit Save button click
    if (!options.chart) options.chart = {};
    if (!options.chart.events) options.chart.events = {};

    // Helper used by every auto-save trigger below.
    const flushAutoSave = (c, { allowEmpty = false } = {}) => {
      try {
        const saved = saveGlobalIndicators(c, { allowEmpty, guarded: true });
        if (saved) {
          c._tmLastIndicatorSignature = getIndicatorSignature(c);
        }
        const mainType = c.series?.[0]?.options?.type;
        if (mainType) saveGlobalChartType(mainType);
      } catch (e) {
        console.warn("auto-save failed:", e);
      }
    };

    const persistAnnotationsAfterMutation = (c) => {
      if (!c) return;
      clearTimeout(c._tmAnnotationPersistTimer);
      c._tmAnnotationPersistTimer = setTimeout(() => {
        saveChartOptions(symbolRef.current, c);
      }, 0);
    };

    const bindAnnotationRemovePersistence = (c) => {
      if (!c?.annotations?.length || !Highcharts.addEvent) return;
      c.annotations.forEach((annotation) => {
        if (!annotation || annotation._tmRemovePersistenceBound) return;
        annotation._tmRemovePersistenceBound = true;
        Highcharts.addEvent(annotation, "remove", () => {
          persistAnnotationsAfterMutation(c);
        });
      });
    };

    // Trigger 1: chart render. Debounced because renders fire constantly on
    // live charts (every tick → redraw → render). The debounce is short
    // enough that quiet periods between ticks let it fire, but if ticks are
    // continuous (e.g. BTCUSD live), this may NEVER fire — see trigger 2
    // and the cleanup flush, which are the real safety net.
    options.chart.events.render = function () {
      const c = this;
      bindAnnotationRemovePersistence(c);
      if (!c._tmIndicatorPersistenceReady) return;
      const signature = getIndicatorSignature(c);
      if (signature == null || signature === c._tmLastIndicatorSignature) return;
      c._tmIndicatorsTouched = true;
      c._tmLastIndicatorSignature = signature;
      clearTimeout(c._indTimer);
      c._indTimer = setTimeout(() => flushAutoSave(c, { allowEmpty: true }), 100);
    };

    // Trigger 2: a series was added (almost always means the user just
    // added an indicator via the stock-tools popup). Save immediately —
    // don't depend on the render debounce, which can be starved by ticks.
    options.chart.events.addSeries = function () {
      const c = this;
      if (!c._tmIndicatorPersistenceReady) return;
      c._tmIndicatorsTouched = true;
      // Defer one tick so Highcharts finishes wiring up the new series
      // (yAxis linkage, computed data, etc.) before we serialise.
      setTimeout(() => flushAutoSave(c, { allowEmpty: true }), 50);
    };

    options.chart.events.afterAddSeries = function () {
      const c = this;
      if (!c._tmIndicatorPersistenceReady) return;
      c._tmIndicatorsTouched = true;
      setTimeout(() => flushAutoSave(c, { allowEmpty: true }), 50);
    };

    let disposed = false;
    let readyFrame = 0;
    let volumeIndicatorObserver = null;

    try {
      chartRef.current = Highcharts.stockChart(el, options);
      const initialIndicatorSignature = getIndicatorSignature(chartRef.current);
      chartRef.current._tmInitialIndicatorSignature = initialIndicatorSignature;
      chartRef.current._tmLastIndicatorSignature = initialIndicatorSignature;
      chartRef.current._tmIndicatorsTouched = false;
      chartRef.current._tmIndicatorPersistenceReady = true;
      bindAnnotationRemovePersistence(chartRef.current);

      // Hide volume-based indicators from the picker popup when the active
      // market has no volume data (FX / metals / energies / indices). A
      // MutationObserver is used because the popup is added / removed from
      // the DOM each time it's shown, and the indicator list inside it is
      // re-rendered when the user toggles between Add and Edit tabs.
      if (!marketHasVolume && typeof MutationObserver !== "undefined") {
        const applyFilter = () => {
          const items = document.querySelectorAll(
            ".highcharts-popup .highcharts-indicator-list-item, .highcharts-popup ul li",
          );
          items.forEach((item) => {
            if (item.dataset.tmVolFiltered === "1") return;
            const text = (item.textContent || "").trim();
            if (isVolumeIndicatorLabel(text)) {
              item.style.display = "none";
              item.dataset.tmVolFiltered = "1";
            }
          });
        };
        volumeIndicatorObserver = new MutationObserver(applyFilter);
        volumeIndicatorObserver.observe(document.body, {
          childList: true,
          subtree: true,
        });
        // Catch any popup that's already open at chart creation time.
        applyFilter();
      }
      resetXAxisToVisibleRange(
        chartRef.current,
        dataRef.current,
        visibleStartRef.current,
        visibleEndRef.current,
      );
      updateNavigatorVisibleData(
        chartRef.current,
        dataRef.current,
        visibleStartRef.current,
        visibleEndRef.current,
      );
      chartRef.current.redraw(false);
      prevDataRef.current = dataRef.current;
      readyFrame = requestAnimationFrame(() => {
        if (!disposed && chartRef.current) {
          updateNavigatorVisibleData(
            chartRef.current,
            dataRef.current,
            visibleStartRef.current,
            visibleEndRef.current,
          );
          resetXAxisToVisibleRange(
            chartRef.current,
            dataRef.current,
            visibleStartRef.current,
            visibleEndRef.current,
          );
          chartRef.current.redraw(false);
          requestAnimationFrame(() => {
            if (!disposed && chartRef.current) {
              updateNavigatorVisibleData(
                chartRef.current,
                dataRef.current,
                visibleStartRef.current,
                visibleEndRef.current,
              );
              resetXAxisToVisibleRange(
                chartRef.current,
                dataRef.current,
                visibleStartRef.current,
                visibleEndRef.current,
              );
              chartRef.current.redraw(false);
              onReadyRef.current?.();
            }
          });
        }
      });
    } catch (e) {
      console.warn("Highcharts failed to init chart, possibly corrupted options", e);
      // Fallback completely
      localStorage.removeItem(symbol + "lschartoptions");
    }

    return () => {
      disposed = true;
      if (readyFrame) cancelAnimationFrame(readyFrame);
      if (volumeIndicatorObserver) {
        try { volumeIndicatorObserver.disconnect(); } catch { /* ignore */ }
        volumeIndicatorObserver = null;
      }
      if (chartRef.current) {
        // FLUSH first, THEN cancel, THEN destroy. The order matters:
        //
        //  1. If the user added an indicator and switched symbols within
        //     1 second, the 1s render-debounced auto-save hasn't fired yet.
        //     A synchronous save here captures it before we tear the chart
        //     down — without this, fast symbol switches lose indicators.
        //
        //  2. Then cancel the pending timer so it doesn't fire later
        //     against a destroyed chart and overwrite our flush with empty
        //     (see saveGlobalIndicators' destroy-guards as a backstop).
        //
        //  3. Then destroy.
        try {
          const signature = getIndicatorSignature(chartRef.current);
          const changed =
            signature != null &&
            signature !== chartRef.current._tmInitialIndicatorSignature;
          if (changed || chartRef.current._tmIndicatorsTouched) {
            saveGlobalIndicators(chartRef.current, { allowEmpty: true, guarded: true });
          }
          const mainType = chartRef.current.series?.[0]?.options?.type;
          if (mainType) saveGlobalChartType(mainType);
        } catch { /* ignore — destroy is more important */ }
        if (chartRef.current._indTimer) {
          clearTimeout(chartRef.current._indTimer);
          chartRef.current._indTimer = null;
        }
        if (chartRef.current._tmAnnotationPersistTimer) {
          clearTimeout(chartRef.current._tmAnnotationPersistTimer);
          chartRef.current._tmAnnotationPersistTimer = null;
        }
        try { chartRef.current.destroy(); } catch { /* ignore destroy failures */ }
        chartRef.current = null;
      }
    };
  }, [dataReady, symbol, decimals, themeVersion]);

  // Track previous data so we can detect "only the last candle changed" (live tick)
  // vs. "full dataset reloaded" (REST refresh / timeframe change).
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !data?.length) return;
    const mainSeries = chart.get?.("main") ?? chart.series?.find((series) => series.options?.id === "main");
    if (!mainSeries) return;

    const prev = prevDataRef.current;
    const sameLength = prev && prev.length === data.length;
    const sameSecondLast = sameLength && data.length >= 2 && prev[prev.length - 2]?.t === data[data.length - 2]?.t;
    const lastBucketSame = sameLength && prev[prev.length - 1]?.t === data[data.length - 1]?.t;

    // Viewport preservation rule (per user request — keep it simple):
    //   • prev === null  → first frame after (re)mount: snap to full range.
    //     Covers initial load, timeframe change, symbol change, range change
    //     (all of which remount the CandleChart via React key).
    //   • prev !== null  → in-place update (live tick, REST poll, history
    //     prepend on left-scroll). Preserve whatever the user is currently
    //     looking at so the chart doesn't jump under them.
    //
    // Reading `userMin`/`userMax` isn't reliable here because Highcharts can
    // have a meaningful "current view" without the user ever interacting
    // (e.g. after addPoint extends the data range, or after a programmatic
    // setExtremes from a previous tick). What matters is just "do we have a
    // viewport worth keeping?" — and we do iff we've already rendered once.
    // Fast path: same array shape AND same final bucket → update ONLY the last candle.
    if (sameLength && sameSecondLast && lastBucketSame && mainSeries.data?.length === data.length) {
      const lastNew = data[data.length - 1];
      const lastPoint = mainSeries.data[mainSeries.data.length - 1];
      if (lastPoint?.update) {
        lastPoint.update(
          { x: lastNew.t, open: lastNew.o, high: lastNew.h, low: lastNew.l, close: lastNew.c },
          false,
          false,
        );
        updateNavigatorVisibleData(chart, data, visibleStartRef.current, visibleEndRef.current);
        resetXAxisToVisibleRange(chart, data, visibleStartRef.current, visibleEndRef.current);
        chart.redraw(false);
        prevDataRef.current = data;
        return;
      }
    }

    // Fast path 2: one new candle bucket appended (previous bar may have also
    // finalized into its closing values). Append + update in place so the user's
    // zoom/pan is preserved — calling setData would force a full extremes reset.
    const isAppendOne =
      prev &&
      data.length === prev.length + 1 &&
      prev.length >= 1 &&
      prev[prev.length - 1]?.t === data[data.length - 2]?.t &&
      mainSeries.data?.length === prev.length;
    if (isAppendOne) {
      try {
        // Finalize the previous in-progress bar with its closing OHLC values.
        const prevFinal = data[data.length - 2];
        const prevPoint = mainSeries.data[mainSeries.data.length - 1];
        if (prevPoint?.update) {
          prevPoint.update(
            { x: prevFinal.t, open: prevFinal.o, high: prevFinal.h, low: prevFinal.l, close: prevFinal.c },
            false,
            false,
          );
        }
        // Append the freshly-opened bucket. shift=false so we do not drop the
        // oldest bar.
        const lastNew = data[data.length - 1];
        mainSeries.addPoint(
          [lastNew.t, lastNew.o, lastNew.h, lastNew.l, lastNew.c],
          false,
          false,
          false,
        );
        updateNavigatorVisibleData(chart, data, visibleStartRef.current, visibleEndRef.current);
        resetXAxisToVisibleRange(chart, data, visibleStartRef.current, visibleEndRef.current);
        chart.redraw(false);
        prevDataRef.current = data;
        return;
      } catch (e) {
        console.warn("addPoint fast path failed, falling back to setData", e);
        // fall through to the slow path
      }
    }

    // Slow path: full data swap. Two scenarios:
    //   A. First frame after (re)mount (prev === null): always snap to full
    //      range. This is what gives the user a consistent "fresh chart, fresh
    //      view" after switching symbol, timeframe, or range.
    //   B. We already have a prev frame (history-prepend on left-scroll, or a
    //      large REST refresh that didn't match the fast paths): preserve the
    //      user's current viewport, clamped to the new data range.
    mainSeries.setData(mapCandles(data), false, false, false);
    updateNavigatorVisibleData(chart, data, visibleStartRef.current, visibleEndRef.current);
    const dataFirst = data[0]?.t;
    const dataLast = data[data.length - 1]?.t;
    const visibleFirst = Number.isFinite(visibleStartRef.current) && Number.isFinite(dataFirst)
      ? Math.max(visibleStartRef.current, dataFirst)
      : dataFirst;
    const visibleLast = Number.isFinite(visibleEndRef.current) && Number.isFinite(dataLast)
      ? Math.min(visibleEndRef.current, dataLast)
      : dataLast;
    if (Number.isFinite(dataFirst) && Number.isFinite(dataLast)) {
      try {
        resetXAxisToVisibleRange(chart, data, visibleFirst, visibleLast);
      } catch { /* ignore axis reset failures */ }
    }
    chart.redraw(false);
    prevDataRef.current = data;
  }, [data]);

  /* ── Resize ──────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const chart = chartRef.current;
      if (!chart) return;
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) chart.setSize(width, height, false);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return <div ref={containerRef} className="block h-full w-full" />;
});

CandleChart.displayName = "CandleChart";
export default CandleChart;
