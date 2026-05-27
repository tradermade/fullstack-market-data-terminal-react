export default function Badge({ label, value, color }) {
  return (
    <span
      className="mr-2 inline-flex items-center gap-2 rounded-lg px-3 py-1.5
                 font-mono text-xs tracking-[0.01em] bg-[var(--bg-card)]
                 border border-[var(--border)] transition-all duration-200
                 hover:border-current hover:shadow-lg"
      style={{ borderColor: `${color}44`, color }}
    >
      <span className="font-semibold">{label}</span>
      <span className="text-[var(--text-dim)]">•</span>
      <span className="font-bold">{value}</span>
    </span>
  );
}
