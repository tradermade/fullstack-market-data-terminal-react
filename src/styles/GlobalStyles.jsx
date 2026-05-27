export default function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700;800&display=swap');

      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

      :root {
        color-scheme: light;
        --bg-base:        #f4f7fb;
        --bg-panel:       #ffffff;
        --bg-card:        #eef3f8;
        --bg-hover:       #e3ebf5;
        --border:         #d9e2ee;
        --border-bright:  #b8c7d8;
        --text-primary:   #111827;
        --text-secondary: #496178;
        --text-dim:       #7a8ca3;
        --green:          #059669;
        --red:            #dc2626;
        --blue:           #2563eb;
        --gold:           #d97706;
        --purple:         #7c3aed;
        --cyan:           #0891b2;
        --overlay:        rgba(244, 247, 251, 0.86);
        --chart-tool-icon-filter: none;
        --font-mono:      'IBM Plex Mono', monospace;
        --font-display:   'DM Sans', sans-serif;
      }

      :root.dark {
        color-scheme: dark;
        --bg-base:        #0a0e17;
        --bg-panel:       #0f1423;
        --bg-card:        #141b2d;
        --bg-hover:       #1a2540;
        --border:         #1e2d42;
        --border-bright:  #2d4058;
        --text-primary:   #f0f4f9;
        --text-secondary: #8a96a8;
        --text-dim:       #4a5a72;
        --green:          #10b981;
        --red:            #ef4444;
        --blue:           #3b82f6;
        --gold:           #f59e0b;
        --purple:         #8b5cf6;
        --cyan:           #06b6d4;
        --overlay:        rgba(10, 14, 23, 0.85);
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
      canvas { display: block; }
      input { color-scheme: light; }
      .dark input { color-scheme: dark; }

      ::-webkit-scrollbar { width: 6px; height: 6px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb {
        background: var(--border-bright);
        border-radius: 3px;
        border: 1px solid var(--border);
      }
      ::-webkit-scrollbar-thumb:hover { background: var(--text-dim); }

      .highcharts-background  { fill: var(--bg-base) !important; }
      .highcharts-plot-background { fill: var(--bg-base) !important; }
      .highcharts-grid-line   { stroke: var(--border) !important; }
      .highcharts-axis-line   { stroke: var(--border) !important; }
      .highcharts-tick        { stroke: var(--border) !important; }
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

      button, input, select, textarea { transition: all 0.2s cubic-bezier(0.23, 1, 0.320, 1); }
    `}</style>
  );
}
