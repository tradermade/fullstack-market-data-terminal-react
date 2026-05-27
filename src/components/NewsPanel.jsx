import { useCallback, useEffect, useState } from "react";

const REFRESH_MS = 5 * 60_000;

function timeAgo(ms) {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export default function NewsPanel() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | error
  const [lastFetched, setLastFetched] = useState(null);
  const [tick, setTick] = useState(0); // tick to refresh time-ago labels

  const fetchNews = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await fetch("/api/news", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (Array.isArray(json.items)) {
        setItems(json.items);
        setLastFetched(json.fetchedAt ?? Date.now());
        setStatus("idle");
      } else {
        throw new Error("Malformed response");
      }
    } catch (err) {
      console.warn("News fetch failed:", err);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    fetchNews();
    const id = setInterval(fetchNews, REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchNews]);

  // Re-render every 30s so "5m / 1h" timestamps stay current without re-fetching
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-[var(--blue)]"
               style={{ animation: status === "loading" ? "pulse-dot 1s ease infinite" : "pulse-dot 1.6s ease infinite" }} />
          <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--blue)]">
            News
          </span>
        </div>
        <button
          onClick={fetchNews}
          title="Refresh"
          className="font-mono text-[8px] uppercase tracking-wider text-[var(--text-dim)] hover:text-[var(--blue)]"
        >
          {status === "loading" ? "…" : lastFetched ? `${timeAgo(lastFetched)} ago` : "—"}
        </button>
      </div>

      {/* Items */}
      {status === "error" && items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-3 text-center">
          <span className="font-mono text-[9px] text-[var(--red)]">Failed to load news</span>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-3 text-center">
          <span className="font-mono text-[9px] text-[var(--text-dim)]">Loading news…</span>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto" key={tick /* re-render to refresh timestamps */}>
          {items.map((item, i) => (
            <a
              key={`${item.link || item.title}-${i}`}
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="block border-b border-[var(--border)] px-3 py-2 hover:bg-[var(--bg-hover)]"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-mono text-[8px] uppercase tracking-wider text-[var(--blue)] shrink-0">
                  {item.source}
                </span>
                <span className="font-mono text-[8px] text-[var(--text-dim)]">
                  {timeAgo(item.publishedAt)}
                </span>
              </div>
              <div className="font-mono text-[10px] leading-snug text-[var(--text-primary)] line-clamp-3">
                {item.title}
              </div>
              {item.summary ? (
                <div className="mt-1 font-mono text-[9px] leading-snug text-[var(--text-dim)] line-clamp-2">
                  {item.summary}
                </div>
              ) : null}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
