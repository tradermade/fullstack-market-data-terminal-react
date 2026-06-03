export default function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700;800&display=swap');

      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

      :root {
        color-scheme: light;
        --bg-base:        #f6f8fb;
        --bg-panel:       #ffffff;
        --bg-card:        #f0f4f8;
        --bg-hover:       #e7eef7;
        --border:         #dce6f0;
        --border-bright:  #bdccdc;
        --text-primary:   #0f172a;
        --text-secondary: #52667c;
        --text-dim:       #8290a3;
        --green:          #059669;
        --red:            #dc2626;
        --blue:           #2563eb;
        --gold:           #d97706;
        --purple:         #7c3aed;
        --cyan:           #0891b2;
        --chart-bg:       #f8fafc;
        --chart-grid:     #cfd9e6;
        --chart-green:    var(--green);
        --chart-red:      var(--red);
        --chart-blue:     var(--blue);
        --overlay:        rgba(244, 247, 251, 0.86);
        --shadow-soft:    0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px rgba(15, 23, 42, 0.06);
        --shadow-pop:     0 12px 34px rgba(15, 23, 42, 0.16);
        --focus-ring:     0 0 0 3px rgba(37, 99, 235, 0.18);
        --chart-tool-icon-filter: none;
        --font-mono:      'IBM Plex Mono', monospace;
        --font-display:   'DM Sans', sans-serif;
      }

      :root.dark {
        color-scheme: dark;
        --bg-base:        #090e17;
        --bg-panel:       #101724;
        --bg-card:        #172033;
        --bg-hover:       #202c42;
        --border:         #223149;
        --border-bright:  #344860;
        --text-primary:   #f3f7fb;
        --text-secondary: #99a7b8;
        --text-dim:       #5c6d83;
        --green:          #10b981;
        --red:            #ef4444;
        --blue:           #3b82f6;
        --gold:           #f59e0b;
        --purple:         #8b5cf6;
        --cyan:           #06b6d4;
        --chart-bg:       #0b111c;
        --chart-grid:     #2a3a52;
        --chart-green:    var(--green);
        --chart-red:      var(--red);
        --chart-blue:     var(--blue);
        --overlay:        rgba(10, 14, 23, 0.85);
        --shadow-soft:    0 1px 2px rgba(0, 0, 0, 0.22), 0 10px 30px rgba(0, 0, 0, 0.28);
        --shadow-pop:     0 16px 44px rgba(0, 0, 0, 0.42);
        --focus-ring:     0 0 0 3px rgba(59, 130, 246, 0.22);
        --chart-tool-icon-filter: invert(1) brightness(1.5);
      }

      html, body, #root { width: 100%; height: 100%; overflow: hidden; overscroll-behavior: none; }
      body {
        background: var(--bg-base);
        color: var(--text-primary);
        font-family: var(--font-display);
        -webkit-font-smoothing: antialiased;
        text-rendering: optimizeLegibility;
      }
      button, input, select, textarea {
        font: inherit;
      }
      button {
        -webkit-tap-highlight-color: transparent;
      }
      button:focus-visible,
      input:focus-visible,
      select:focus-visible,
      textarea:focus-visible {
        outline: none;
        box-shadow: var(--focus-ring);
      }
      canvas { display: block; }
      input { color-scheme: light; }
      .dark input { color-scheme: dark; }

      ::-webkit-scrollbar { width: 7px; height: 7px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb {
        background: color-mix(in srgb, var(--border-bright) 82%, transparent);
        border-radius: 999px;
        border: 2px solid transparent;
        background-clip: padding-box;
      }
      ::-webkit-scrollbar-thumb:hover { background: var(--text-dim); }

      .highcharts-background  { fill: var(--chart-bg, var(--bg-base)) !important; }
      .highcharts-plot-background { fill: var(--chart-bg, var(--bg-base)) !important; }
      .highcharts-grid-line   { stroke: var(--chart-grid, var(--border)) !important; stroke-opacity: 0.72; }
      .highcharts-axis-line   { stroke: var(--border) !important; stroke-opacity: 0.85; }
      .highcharts-tick        { stroke: var(--border) !important; stroke-opacity: 0.85; }
      .highcharts-label { text-rendering: geometricPrecision; }

      .nav-active { border-bottom: 2px solid var(--blue); }

      @keyframes pulse-dot {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.4; transform: scale(1.5); }
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      @keyframes slide-in {
        from { opacity: 0; transform: translateY(4px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes glow-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4); }
        50% { box-shadow: 0 0 0 6px rgba(59, 130, 246, 0); }
      }
      .slide-in { animation: slide-in 0.2s cubic-bezier(0.23, 1, 0.320, 1); }
      .fade-in { animation: fade-in 0.3s ease-out; }

      button, input, select, textarea {
        transition:
          background-color 0.18s ease,
          border-color 0.18s ease,
          color 0.18s ease,
          box-shadow 0.18s ease,
          transform 0.18s ease,
          opacity 0.18s ease;
      }
      button:active:not(:disabled) { transform: translateY(0.5px); }
    `}</style>
  );
}
