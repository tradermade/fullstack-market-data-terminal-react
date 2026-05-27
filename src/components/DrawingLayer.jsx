import { useEffect, useRef, useState } from "react";

export default function DrawingLayer({ activeTool, chartRef }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef({ isDrawing: false, start: null, lines: [] });
  const [lineCount, setLineCount] = useState(0);

  const isActive = activeTool && activeTool !== "chart";

  // Resize canvas to match chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = parent.offsetWidth;
      canvas.height = parent.offsetHeight;
      redraw();
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement);
    resize();
    return () => ro.disconnect();
  }, []);

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawingRef.current.lines.forEach((line) => {
      ctx.beginPath();
      ctx.strokeStyle = getColor(line.tool);
      ctx.lineWidth = 2;
      ctx.moveTo(line.x1, line.y1);
      ctx.lineTo(line.x2, line.y2);
      ctx.stroke();
    });
  };

  const getColor = (tool) => {
    const colors = {
      trend: "#3b82f6",
      fib: "#f59e0b",
      rect: "#8b5cf6",
      ruler: "#06b6d4",
      trade: "#10b981",
    };
    return colors[tool] || "#3b82f6";
  };

  // Mouse handlers
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onMouseDown = (e) => {
      if (!isActive) return;
      drawingRef.current.isDrawing = true;
      drawingRef.current.start = { x: e.offsetX, y: e.offsetY };
    };

    const onMouseMove = (e) => {
      if (!drawingRef.current.isDrawing || !drawingRef.current.start) return;
      const ctx = canvas.getContext("2d");

      // Redraw all committed lines
      redraw();

      // Draw preview
      ctx.beginPath();
      ctx.strokeStyle = getColor(activeTool);
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.moveTo(drawingRef.current.start.x, drawingRef.current.start.y);
      ctx.lineTo(e.offsetX, e.offsetY);
      ctx.stroke();
      ctx.setLineDash([]);
    };

    const onMouseUp = (e) => {
      if (!drawingRef.current.isDrawing || !drawingRef.current.start) return;
      const { x: x1, y: y1 } = drawingRef.current.start;
      const x2 = e.offsetX;
      const y2 = e.offsetY;

      if (Math.abs(x2 - x1) > 5 || Math.abs(y2 - y1) > 5) {
        drawingRef.current.lines.push({ x1, y1, x2, y2, tool: activeTool });
        setLineCount(drawingRef.current.lines.length);
      }

      drawingRef.current.isDrawing = false;
      drawingRef.current.start = null;
      redraw();
    };

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mouseleave", onMouseUp);

    return () => {
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mouseleave", onMouseUp);
    };
  }, [activeTool, isActive]);

  const handleClear = () => {
    drawingRef.current.lines = [];
    setLineCount(0);
    redraw();
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{
          pointerEvents: isActive ? "all" : "none",
          cursor: isActive ? "crosshair" : "default",
          zIndex: isActive ? 10 : -1,
        }}
      />
      {lineCount > 0 && isActive && (
        <button
          onClick={handleClear}
          className="absolute bottom-4 right-4 px-3 py-1.5 rounded-lg bg-[var(--red)] text-white
                     text-xs font-semibold hover:shadow-lg transition-all"
          style={{ zIndex: 20 }}
        >
          Clear ({lineCount})
        </button>
      )}
    </>
  );
}
