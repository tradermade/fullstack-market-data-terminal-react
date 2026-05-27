export default function StatusBar({ symbol, tf, market }) {
  const st = market?.getStatus();

  return (
    <div className="flex h-7 shrink-0 items-center justify-between
                    border-t border-[var(--border)] bg-[var(--bg-panel)] px-4">

      <div className="flex items-center gap-3">
        <StatusItem label="SYM" value={symbol} highlight />
        <Divider />
        <StatusItem label="MKT" value={market?.label ?? "—"} />
        <Divider />
        <StatusItem label="TF" value={tf?.label ?? "—"} />
        <Divider />
        <StatusItem label="SRC" value="TraderMade" />
        {st && (
          <>
            <Divider />
            <span className={`font-mono text-[10px] font-semibold
                              ${st.open ? "text-[var(--green)]" : "text-[var(--text-dim)]"}`}>
              {st.label}
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        <StatusItem label="" value="Scroll zoom" />
        <Divider />
        <StatusItem label="" value="Drag pan" />
      </div>
    </div>
  );
}

function Divider() {
  return <div className="h-3 w-px bg-[var(--border)]" />;
}

function StatusItem({ label, value, highlight }) {
  return (
    <span className="font-mono text-[10px] flex items-center gap-1">
      {label && <span className="text-[var(--text-dim)] uppercase tracking-wider">{label}</span>}
      <span className={highlight ? "text-[var(--blue)] font-bold" : "text-[var(--text-secondary)]"}>
        {value}
      </span>
    </span>
  );
}
