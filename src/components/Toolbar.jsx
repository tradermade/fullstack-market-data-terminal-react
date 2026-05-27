import { TOOLS } from "../constants/constants.jsx";

export default function Toolbar({ activeTool, onToolChange, onZoomAction }) {
  return (
    <div
      className="flex w-16 shrink-0 flex-col items-center gap-2 overflow-y-auto
                 border-r border-[var(--border)] bg-[var(--bg-panel)] p-3
                 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {TOOLS.map((tool) => {
        const isActive = activeTool === tool.id;
        const Icon = TOOL_ICONS[tool.id];

        return (
          <button
            key={tool.id}
            title={tool.label}
            onClick={() => onToolChange(tool.id)}
            className={`flex h-10 w-10 items-center justify-center rounded-lg
                       border transition-all duration-200
                       ${
                         isActive
                           ? "border-[var(--blue)] bg-[var(--blue)]/10 shadow-lg shadow-blue-500/20"
                           : "border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--blue)]/50 hover:bg-[var(--bg-hover)]"
                       }`}
            style={{
              "--icon-primary":    isActive ? "rgb(59, 130, 246)" : "rgb(148, 163, 184)",
              "--icon-secondary":  isActive ? "rgb(100, 150, 200)" : "rgb(120, 135, 155)",
              "--icon-muted":      isActive ? "rgb(80, 120, 180)" : "rgb(96, 112, 134)",
            }}
          >
            {Icon ? <Icon /> : null}
          </button>
        );
      })}
    </div>
  );
}

/* ─── SVG base props ────────────────────────────────────────────────────────── */
const BASE = {
  width: 22,
  height: 22,
  viewBox: "0 0 18 18",
  fill: "none",
};

const TOOL_ICONS = {
  chart:   ChartPatternIcon,
  text:    TextIcon,
  trend:   TrendLineIcon,
  fib:     FibIcon,
  rect:    RectIcon,
  ruler:   RulerIcon,
  eye:     EyeOffIcon,
  trade:   TradeIcon,
  magnet:  MagnetIcon,
  zoom:    ZoomIcon,
  compare: CompareIcon,
  hidden:  HiddenIcon,
};

function ChartPatternIcon() {
  return (
    <svg {...BASE}>
      <path d="M2 12l4-4 3 2 5-6" stroke="var(--icon-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 4h1.8v1.8" stroke="var(--icon-secondary)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function TextIcon() {
  return (
    <svg {...BASE}>
      <rect x="2.5" y="3" width="13" height="11" rx="1" stroke="var(--icon-secondary)" strokeWidth="1.2" />
      <path d="M5 6h6M8 6v5M6 11h4" stroke="var(--icon-primary)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrendLineIcon() {
  return (
    <svg {...BASE}>
      <path d="M3 13L13 4" stroke="var(--icon-primary)" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="3.5" cy="13.5" r="1.25" fill="var(--icon-secondary)" />
      <circle cx="13.5" cy="4.5" r="1.25" fill="var(--icon-primary)" />
    </svg>
  );
}

function FibIcon() {
  return (
    <svg {...BASE}>
      <path d="M3 14h12M4 11h10M5 8h8M6 5h6" stroke="var(--icon-secondary)" strokeWidth="1.15" strokeLinecap="round" />
      <text x="2.3" y="16.1" fontSize="4" fill="var(--icon-secondary)">0</text>
      <text x="12.2" y="16.1" fontSize="4" fill="var(--icon-secondary)">B</text>
      <text x="8.2" y="4.2" fontSize="4" fill="var(--icon-primary)">A</text>
    </svg>
  );
}

function RectIcon() {
  return (
    <svg {...BASE}>
      <rect x="4" y="4" width="10" height="10" stroke="var(--icon-primary)" strokeWidth="1.15" strokeDasharray="2 2" />
      <circle cx="4" cy="4" r="1" fill="var(--icon-secondary)" />
      <circle cx="14" cy="4" r="1" fill="var(--icon-secondary)" />
      <circle cx="4" cy="14" r="1" fill="var(--icon-secondary)" />
      <circle cx="14" cy="14" r="1" fill="var(--icon-secondary)" />
    </svg>
  );
}

function RulerIcon() {
  return (
    <svg {...BASE}>
      <path d="M3 6h12M3 9h12M3 12h12" stroke="var(--icon-primary)" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M5 5v2M7 8v2M9 11v2M11 5v2M13 8v2" stroke="var(--icon-secondary)" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg {...BASE}>
      <path d="M2.5 9s2.3-3.5 6.5-3.5S15.5 9 15.5 9s-2.3 3.5-6.5 3.5S2.5 9 2.5 9Z" stroke="var(--icon-secondary)" strokeWidth="1.2" />
      <circle cx="9" cy="9" r="1.8" stroke="var(--icon-primary)" strokeWidth="1.2" />
      <path d="M3 15L15 3" stroke="var(--icon-muted)" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function TradeIcon() {
  return (
    <svg {...BASE}>
      <path d="M5 15V3M13 15V3" stroke="var(--icon-secondary)" strokeWidth="1.15" strokeLinecap="round" />
      <path d="M7 5c2.8 0 2.8 2.6 0 2.6S4.2 10.2 7 10.2" stroke="var(--icon-primary)" strokeWidth="1.15" strokeLinecap="round" />
      <path d="M11 5c-2.8 0-2.8 2.6 0 2.6s2.8 2.6 0 2.6" stroke="var(--icon-primary)" strokeWidth="1.15" strokeLinecap="round" />
    </svg>
  );
}

function MagnetIcon() {
  return (
    <svg {...BASE}>
      <path d="M5 5v4a4 4 0 0 0 8 0V5" stroke="var(--icon-primary)" strokeWidth="1.35" strokeLinecap="round" />
      <path d="M5 5h2M11 5h2" stroke="var(--icon-secondary)" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  );
}

function ZoomIcon() {
  return (
    <svg {...BASE}>
      <path d="M6 6h6M9 3v6" stroke="var(--icon-primary)" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M6 12l-2 2M12 12l2 2M6 6L4 4M12 6l2-2" stroke="var(--icon-secondary)" strokeWidth="1.15" strokeLinecap="round" />
    </svg>
  );
}

function CompareIcon() {
  return (
    <svg {...BASE}>
      <path d="M4 14V4M7 11V7M11 15V3M14 10V8" stroke="var(--icon-primary)" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M3 9h2M6 9h2M10 9h2M13 9h2" stroke="var(--icon-secondary)" strokeWidth="1" opacity="0.8" />
    </svg>
  );
}

function HiddenIcon() {
  return (
    <svg {...BASE}>
      <path d="M2.5 9s2.3-3.5 6.5-3.5S15.5 9 15.5 9s-2.3 3.5-6.5 3.5S2.5 9 2.5 9Z" stroke="var(--icon-secondary)" strokeWidth="1.2" />
      <path d="M3 15L15 3" stroke="var(--icon-primary)" strokeWidth="1.2" strokeLinecap="round" />
      <text x="4.1" y="16.1" fontSize="3.8" fill="var(--icon-secondary)">1.6.2</text>
    </svg>
  );
}
