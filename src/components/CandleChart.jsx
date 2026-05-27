import { useEffect, useRef, useImperativeHandle, forwardRef, useState } from "react";
import { T as DEFAULT_T } from "../constants/constants.jsx";

function getThemeTokens() {
  if (typeof window === "undefined") return DEFAULT_T;
  const styles = getComputedStyle(document.documentElement);
  const read = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;

  return {
    bg: read("--bg-base", DEFAULT_T.bg),
    bgPanel: read("--bg-panel", DEFAULT_T.bgPanel),
    bgCard: read("--bg-card", DEFAULT_T.bgCard),
    bgHover: read("--bg-hover", DEFAULT_T.bgHover),
    border: read("--border", DEFAULT_T.border),
    borderBright: read("--border-bright", DEFAULT_T.borderBright),
    textPrimary: read("--text-primary", DEFAULT_T.textPrimary),
    textSecondary: read("--text-secondary", DEFAULT_T.textSecondary),
    textDim: read("--text-dim", DEFAULT_T.textDim),
    green: read("--green", DEFAULT_T.green),
    red: read("--red", DEFAULT_T.red),
    blue: read("--blue", DEFAULT_T.blue),
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

// Convert a hex/rgb/rgba color into an rgba() string with custom alpha.
// Used by the liquidity heatmap to apply volume-based opacity.
function hexToRgba(color, alpha = 1) {
  if (!color) return `rgba(59,130,246,${alpha})`;
  const c = String(color).trim();
  if (c.startsWith("rgba")) return c.replace(/rgba\(([^)]+)\)/, (_, parts) => {
    const [r, g, b] = parts.split(",").map(s => s.trim());
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  });
  if (c.startsWith("rgb(")) {
    const [r, g, b] = c.replace(/rgb\(|\)/g, "").split(",").map(s => Number(s.trim()));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const hex = c.replace("#", "");
  const norm = hex.length === 3 ? hex.split("").map(ch => ch + ch).join("") : hex;
  if (norm.length !== 6) return `rgba(59,130,246,${alpha})`;
  const r = parseInt(norm.slice(0, 2), 16);
  const g = parseInt(norm.slice(2, 4), 16);
  const b = parseInt(norm.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
      formatter() { return (this.value ?? 0).toFixed(decimals); },
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
    axis.lastPrice = {
      ...(axis.lastPrice || {}),
      color: theme.blue,
      label: {
        ...(axis.lastPrice?.label || {}),
        backgroundColor: theme.blue,
        style: { color: "#fff", fontSize: "10px", fontFamily: theme.mono },
      },
    };
    axis.currentPriceIndicator = {
      ...(axis.currentPriceIndicator || {}),
      lineColor: theme.blue,
      label: {
        ...(axis.currentPriceIndicator?.label || {}),
        backgroundColor: theme.blue,
        style: { color: "#fff", fontSize: "10px", fontFamily: theme.mono },
      },
    };
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
      if (series.type === "candlestick" || series.id === "main") {
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
      if (series.lastVisiblePrice) {
        const lastVisiblePrice = typeof series.lastVisiblePrice === "object" ? series.lastVisiblePrice : {};
        const labelBase = { ...(lastVisiblePrice.label || {}) };
        delete labelBase.formatter;
        delete labelBase.format;
        series.lastVisiblePrice = {
          ...lastVisiblePrice,
          label: {
            ...labelBase,
            backgroundColor: theme.blue,
            style: { color: "#fff", fontSize: "10px", fontFamily: theme.mono },
            format: `{value:.${decimals}f}`,
          },
        };
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

function saveGlobalIndicators(chart) {
  try {
    if (!chart) return;
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
    }

    // Persist currentPriceIndicator state from main yAxis
    if (chart.yAxis?.[0]) {
      const mainY = chart.yAxis[0];
      const cpi = mainY.options?.currentPriceIndicator;
      if (cpi) {
        globalInds.currentPriceIndicator = cpi;
      }
      // Also check lastPrice on the main series
      const mainSeries = chart.series?.[0];
      if (mainSeries?.options?.lastPrice) {
        globalInds.lastPrice = mainSeries.options.lastPrice;
      }
      if (mainSeries?.options?.lastVisiblePrice) {
        globalInds.lastVisiblePrice = mainSeries.options.lastVisiblePrice;
      }
    }

    localStorage.setItem("fx_indicators", JSON.stringify(globalInds));
  } catch (e) {
    console.warn("saveGlobalIndicators failed:", e);
  }
}

function saveChartOptions(symbol, chart) {
  try {
    if (!chart || !symbol) return;

    const userOptions = Object.assign({}, chart.userOptions);

    if (chart.annotations?.length) {
      userOptions.annotations = getOptions(chart.annotations);
    }

    if (chart.series?.length) {
      const allSeries = getOptions(chart.series).map(s => {
        const cloned = Object.assign({}, s);
        delete cloned.data;
        return cloned;
      });
      userOptions.series = allSeries.filter(s => s.id === "main" || s.id === "navigator-series" || s.isInternal || s.type === "candlestick");
    }

    if (chart.xAxis?.length) {
      userOptions.xAxis = getOptions(chart.xAxis);
    }

    if (chart.yAxis?.length) {
      const allY = getOptions(chart.yAxis);
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
    const raw = localStorage.getItem("fx_indicators");
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function loadChartOptions(symbol) {
  try {
    const raw = localStorage.getItem(symbol + "lschartoptions");
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function mapCandles(data) {
  return data.map((d) => [d.t, d.o, d.h, d.l, d.c]);
}

/* ── Component ───────────────────────────────────────────────────────────── */
const CandleChart = forwardRef(function CandleChart({ data, symbol, decimals = 5, ladder = null }, ref) {
  const containerRef = useRef(null);
  const chartRef     = useRef(null);
  const symbolRef    = useRef(symbol);
  const dataRef      = useRef(data);
  const prevDataRef  = useRef(null);
  const [themeVersion, setThemeVersion] = useState(0);
  const dataReady = Boolean(data?.length);

  useEffect(() => { symbolRef.current = symbol; }, [symbol]);
  useEffect(() => { dataRef.current = data; }, [data]);

  /* ── Liquidity heatmap overlay (Option 3) ─────────────────────────────
   * For each ladder level, draw a horizontal line on the yAxis whose
   * opacity & width scale with the level's volume. All heatmap lines are
   * tagged with id="heat-…" so they don't collide with user-drawn lines.
   */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chart.yAxis?.[0]) return;
    const yAxis = chart.yAxis[0];

    // Always remove our previous heat lines first.
    const previousIds = (yAxis.plotLinesAndBands || [])
      .map(pl => pl.id)
      .filter(id => typeof id === "string" && id.startsWith("heat-"));
    previousIds.forEach(id => yAxis.removePlotLine(id));

    if (!ladder) return; // toggled off OR no ladder data for this symbol

    const T = getThemeTokens();
    const allLevels = [
      ...(ladder.asks || []).map(l => ({ ...l, side: "ask" })),
      ...(ladder.bids || []).map(l => ({ ...l, side: "bid" })),
    ];
    if (allLevels.length === 0) return;
    const maxVol = allLevels.reduce((m, l) => Math.max(m, l.volume), 0);
    if (maxVol <= 0) return;

    allLevels.forEach((level, idx) => {
      const ratio = Math.min(1, level.volume / maxVol);     // 0..1
      const opacity = 0.10 + ratio * 0.55;                  // 0.10..0.65
      const width = Math.max(1, Math.round(ratio * 6));     // 1..6 px
      const baseColor = level.side === "ask" ? T.red : T.green;
      yAxis.addPlotLine({
        id: `heat-${level.side}-${idx}`,
        value: level.price,
        color: hexToRgba(baseColor, opacity),
        width,
        zIndex: 1,
        // dashStyle: "Solid" by default
      });
    });
  }, [ladder]);


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
        chartRef.current.xAxis[0].setExtremes(null, null);
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
    const T = getThemeTokens();

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
          series: { color: T.blue, lineWidth: 1 },
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
            formatter() { return (this.value ?? 0).toFixed(decimals); },
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
              formatter() { return (this.value ?? 0).toFixed(decimals); },
            },
          },
          lastPrice: {
            enabled: true,
            color: T.blue,
            label: {
              enabled: true,
              backgroundColor: T.blue,
              style: { color: "#fff", fontSize: "10px", fontFamily: T.mono },
              formatter() { return (this.value ?? 0).toFixed(decimals); },
            },
          },
          currentPriceIndicator: {
            enabled: true,
            lineColor: T.blue,
            lineDashStyle: "Dash",
            lineWidth: 1,
            label: {
              enabled: true,
              backgroundColor: T.blue,
              borderRadius: 3,
              style: { color: "#fff", fontSize: "10px", fontFamily: T.mono },
              format: undefined,
            },
          },
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
          lastVisiblePrice: {
            enabled: true,
            label: {
              enabled: true,
              backgroundColor: T.blue,
              borderRadius: 3,
              style: { color: "#fff", fontSize: "10px", fontFamily: T.mono },
              format: `{value:.${decimals}f}`,
            },
          },
        }],
      };
    }

    // Blend in the global indicators perfectly over any setup
    const globalInds = loadGlobalIndicators();
    if (globalInds) {
      if (globalInds.yAxis?.length) {
        if (!Array.isArray(options.yAxis)) options.yAxis = options.yAxis ? [options.yAxis] : [];
        options.yAxis = [...options.yAxis, ...globalInds.yAxis];
      }
      if (globalInds.series?.length) {
        options.series = [...(options.series || []), ...globalInds.series];
      }

      // Restore currentPriceIndicator state to main yAxis
      if (globalInds.currentPriceIndicator) {
        if (Array.isArray(options.yAxis)) {
          if (options.yAxis[0]) options.yAxis[0].currentPriceIndicator = globalInds.currentPriceIndicator;
        } else if (options.yAxis) {
          options.yAxis.currentPriceIndicator = globalInds.currentPriceIndicator;
        }
      }

      // Restore lastPrice / lastVisiblePrice to main series
      if (options.series?.[0]) {
        if (globalInds.lastPrice) {
          options.series[0].lastPrice = globalInds.lastPrice;
        }
        if (globalInds.lastVisiblePrice) {
          options.series[0].lastVisiblePrice = globalInds.lastVisiblePrice;
        }
      }
    }

    applyThemeToOptions(options, T, decimals);

    // Attach the passive auto-saving mechanism cleanly for indicators
    if (!options.chart) options.chart = {};
    if (!options.chart.events) options.chart.events = {};
    options.chart.events.render = function () {
      const c = this;
      clearTimeout(c._indTimer);
      c._indTimer = setTimeout(() => saveGlobalIndicators(c), 1000);
    };

    try {
      chartRef.current = Highcharts.stockChart(el, options);
      const first = dataRef.current[0]?.t;
      const last = dataRef.current[dataRef.current.length - 1]?.t;
      if (first != null && last != null && chartRef.current?.xAxis?.[0]) {
        chartRef.current.xAxis[0].setExtremes(first, last, false, false);
        chartRef.current.redraw(false);
      }
      prevDataRef.current = dataRef.current;
    } catch (e) {
      console.warn("Highcharts failed to init chart, possibly corrupted options", e);
      // Fallback completely
      localStorage.removeItem(symbol + "lschartoptions");
    }

    return () => {
      if (chartRef.current) {
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

    // Fast path: same array shape AND same final bucket → update ONLY the last candle.
    if (sameLength && sameSecondLast && lastBucketSame && mainSeries.data?.length === data.length) {
      const lastNew = data[data.length - 1];
      const lastPoint = mainSeries.data[mainSeries.data.length - 1];
      if (lastPoint?.update) {
        lastPoint.update(
          { x: lastNew.t, open: lastNew.o, high: lastNew.h, low: lastNew.l, close: lastNew.c },
          true,   // redraw immediately so the wick/body grow live
          false,  // no animation — keeps it crisp like real trading platforms
        );
        prevDataRef.current = data;
        return;
      }
    }

    // Slow path: full data swap (initial load, timeframe/range change, new candle bucket).
    mainSeries.setData(mapCandles(data), false, false, false);
    const first = data[0]?.t;
    const last = data[data.length - 1]?.t;
    if (first != null && last != null) {
      try { chart.xAxis[0].setExtremes(first, last, false, false); } catch { /* ignore axis reset failures */ }
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
