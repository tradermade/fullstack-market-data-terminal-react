import { useState } from "react";

const TOOL_CONFIGS = {
  chart: {
    label: "Chart Pattern",
    description: "Identify chart patterns",
    options: [
      { id: "head-shoulders", label: "Head & Shoulders" },
      { id: "double-top", label: "Double Top" },
      { id: "double-bottom", label: "Double Bottom" },
      { id: "triangle", label: "Triangle" },
      { id: "flag", label: "Flag" },
    ],
  },
  text: {
    label: "Text Annotation",
    description: "Add text labels to chart",
    options: [
      { id: "bold", label: "Bold" },
      { id: "italic", label: "Italic" },
      { id: "size-small", label: "Small" },
      { id: "size-large", label: "Large" },
      { id: "color", label: "Color" },
    ],
  },
  trend: {
    label: "Trend Line",
    description: "Draw trend lines",
    options: [
      { id: "uptrend", label: "Uptrend" },
      { id: "downtrend", label: "Downtrend" },
      { id: "support", label: "Support" },
      { id: "resistance", label: "Resistance" },
      { id: "channel", label: "Channel" },
    ],
  },
  fib: {
    label: "Fibonacci",
    description: "Fibonacci retracement levels",
    options: [
      { id: "retracement", label: "Retracement" },
      { id: "extension", label: "Extension" },
      { id: "fan", label: "Fan" },
      { id: "arcs", label: "Arcs" },
    ],
  },
  rect: {
    label: "Rectangle",
    description: "Draw rectangles",
    options: [
      { id: "filled", label: "Filled" },
      { id: "outline", label: "Outline" },
      { id: "dashed", label: "Dashed" },
      { id: "transparent", label: "Transparent" },
    ],
  },
  ruler: {
    label: "Measure Tool",
    description: "Measure distances",
    options: [
      { id: "pips", label: "Pips" },
      { id: "points", label: "Points" },
      { id: "percent", label: "Percent" },
    ],
  },
  eye: {
    label: "Hide/Show",
    description: "Toggle layers visibility",
    options: [
      { id: "grid", label: "Grid" },
      { id: "cross", label: "Crosshair" },
      { id: "indicators", label: "Indicators" },
      { id: "annotations", label: "Annotations" },
    ],
  },
  trade: {
    label: "Trade Tool",
    description: "Mark trade entries/exits",
    options: [
      { id: "long", label: "Long Entry" },
      { id: "short", label: "Short Entry" },
      { id: "tp", label: "Take Profit" },
      { id: "sl", label: "Stop Loss" },
    ],
  },
  magnet: {
    label: "Magnet",
    description: "Snap to price levels",
    options: [
      { id: "on", label: "Enable" },
      { id: "grid", label: "Grid Snap" },
      { id: "price", label: "Price Snap" },
    ],
  },
  zoom: {
    label: "Zoom",
    description: "Zoom controls",
    options: [
      { id: "in", label: "Zoom In" },
      { id: "out", label: "Zoom Out" },
      { id: "reset", label: "Reset" },
      { id: "fit", label: "Fit" },
    ],
  },
  compare: {
    label: "Compare",
    description: "Compare pairs",
    options: [
      { id: "overlay", label: "Overlay" },
      { id: "side-by-side", label: "Side by Side" },
      { id: "correlation", label: "Correlation" },
    ],
  },
  hidden: {
    label: "Hide Indicators",
    description: "Manage indicators",
    options: [
      { id: "all", label: "Hide All" },
      { id: "show-all", label: "Show All" },
      { id: "reset", label: "Reset to Default" },
    ],
  },
};

export default function ToolPanel({ activeTool, onZoomAction }) {
  const config = TOOL_CONFIGS[activeTool];
  const [selectedOption, setSelectedOption] = useState(config?.options[0]?.id || null);

  if (!config) return null;

  const handleApply = () => {
    // For zoom tool, trigger the zoom action immediately
    if (activeTool === "zoom" && selectedOption && onZoomAction) {
      onZoomAction(selectedOption);
    }
  };

  return (
    <div className="w-64 bg-[var(--bg-panel)] border-r border-[var(--border)] flex flex-col">
      {/* Header */}
      <div className="border-b border-[var(--border)] p-4">
        <h3 className="text-sm font-bold text-[var(--text-primary)] mb-1">
          {config.label}
        </h3>
        <p className="text-xs text-[var(--text-dim)]">{config.description}</p>
      </div>

      {/* Options */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {config.options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => {
              setSelectedOption(opt.id);
              // For zoom, apply immediately on click
              if (activeTool === "zoom" && onZoomAction) {
                onZoomAction(opt.id);
              }
            }}
            className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200
              ${
                selectedOption === opt.id
                  ? "bg-[var(--blue)] text-white shadow-lg shadow-blue-500/20"
                  : "bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              }`}
            style={{
              // For zoom tool, highlight the button with click feedback
              transform: selectedOption === opt.id && activeTool === "zoom" ? "scale(0.98)" : "scale(1)",
              transition: "transform 0.2s ease",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Action Button - only show for non-zoom tools */}
      {activeTool !== "zoom" && (
        <div className="border-t border-[var(--border)] p-4">
          <button 
            onClick={handleApply}
            className="w-full px-4 py-2 bg-[var(--blue)] text-white rounded-lg font-semibold
                       hover:shadow-lg hover:shadow-blue-500/30 transition-all duration-200">
            Apply Tool
          </button>
        </div>
      )}
    </div>
  );
}
