import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MS_PER_HOUR = 3_600_000;
const MAX_CUSTOM_RANGE_HOURS = 8_760;

export const MAX_WINDOW_HOURS = {
  minute: 48,
  hourly: 720,
  daily: 8_760,
};

export const RANGE_PRESETS = [
  { label: "1D", hours: 24 },
  { label: "2D", hours: 48 },
  { label: "1W", hours: 168 },
  { label: "1M", hours: 720 },
  { label: "3M", hours: 2_160 },
  { label: "6M", hours: 4_380 },
  { label: "1Y", hours: 8_760 },
];

export const DEFAULT_RANGE_HOURS = {
  minute: 24,
  hourly: 4_380,
  daily: 4_380,
};

function toDateInputValue(date) {
  const y = date.getUTCFullYear();
  const mo = String(date.getUTCMonth() + 1).padStart(2, "0");
  const da = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

function toTimeInputValue(date) {
  const h = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  return `${h}:${mi}`;
}

function formatDisplayDate(date) {
  const da = String(date.getUTCDate()).padStart(2, "0");
  const mo = String(date.getUTCMonth() + 1).padStart(2, "0");
  const y = date.getUTCFullYear();
  return `${da}-${mo}-${y}`;
}

function formatMonthTitle(date) {
  return date.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function toUtcDate(value) {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if ([y, m, d].some((part) => Number.isNaN(part))) return null;
  const date = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return date;
}

function getMonthStart(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addMonths(date, amount) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1));
}

function buildMonthCells(monthDate) {
  const year = monthDate.getUTCFullYear();
  const month = monthDate.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const firstDay = new Date(Date.UTC(year, month, 1));
  const leadingBlanks = (firstDay.getUTCDay() + 6) % 7;
  const cells = Array.from({ length: leadingBlanks }, () => null);

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(Date.UTC(year, month, day)));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  while (cells.length < 42) cells.push(null);
  return cells;
}

function getWindowStartDate(anchorEnd, rangeHours) {
  const end = anchorEnd ?? new Date();
  return new Date(end.getTime() - rangeHours * MS_PER_HOUR);
}

function fromDateTimeInputs(dateValue, timeValue) {
  if (!dateValue || !timeValue) return null;
  const [y, m, d] = dateValue.split("-").map(Number);
  const [h, mi] = timeValue.split(":").map(Number);
  if ([y, m, d, h, mi].some((part) => Number.isNaN(part))) return null;
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  const date = new Date(Date.UTC(y, m - 1, d, h, mi, 0, 0));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d ||
    date.getUTCHours() !== h ||
    date.getUTCMinutes() !== mi
  ) {
    return null;
  }
  return date;
}

function getPickerPosition(rect, width = 392, height = 430) {
  const margin = 8;
  const left = Math.min(
    Math.max(rect.left, margin),
    Math.max(window.innerWidth - width - margin, margin)
  );
  const preferredTop = rect.bottom + 6;
  const top = preferredTop + height > window.innerHeight - margin
    ? Math.max(margin, rect.top - height - 6)
    : preferredTop;
  return { top, left };
}

export default function TopBar({
  pairs,
  timeframes,
  activeSym,
  onSymChange,
  tf,
  onTfChange,
  lastCandle,
  decimals = 5,
  chartRef = null,
  rangeHours,
  onRangeChange,
  anchorEnd,
  onAnchorChange,
  displayWindowStart = null,
}) {
  const isLive = anchorEnd === null;
  const maxHours = MAX_WINDOW_HOURS[tf.interval] ?? 48;
  const effectiveRangeHours = Math.min(rangeHours, maxHours);
  const windowStart = displayWindowStart ?? getWindowStartDate(anchorEnd, effectiveRangeHours);
  const maxWindowStart = getWindowStartDate(null, effectiveRangeHours);

  const shift = (dir) => {
    const base = anchorEnd ?? new Date();
    const next = new Date(base.getTime() + dir * effectiveRangeHours * MS_PER_HOUR);
    onAnchorChange(next > new Date() ? null : next);
  };

  const handleSave = (event) => {
    if (chartRef?.current?.saveChart) {
      chartRef.current.saveChart();
      const button = event?.currentTarget;
      if (button) {
        const original = button.textContent;
        button.textContent = "Saved";
        setTimeout(() => { button.textContent = original; }, 1500);
      }
    }
  };

  return (
    <div className="flex h-14 shrink-0 items-center justify-between gap-3 overflow-x-auto overflow-y-hidden
                    border-b border-[var(--border)] bg-[var(--bg-panel)] px-4
                    [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex shrink-0 items-center gap-2">
        <SymbolDropdown pairs={pairs} activeSym={activeSym} onSymChange={onSymChange} />

        <Sep />

        <div className="flex shrink-0 gap-0.5 rounded-md bg-[var(--bg-card)] p-1 border border-[var(--border)]">
          {timeframes.map((t) => {
            const active = tf.label === t.label;
            return (
              <button
                key={t.label}
                onClick={() => onTfChange(t)}
                className={`w-14 rounded-sm py-2 text-xs font-semibold tracking-wide text-center
                           transition-colors duration-150 [font-family:var(--font-display)]
                           ${active
                             ? "bg-[var(--blue)] text-white"
                             : "bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                           }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <Sep />

        <div className="flex shrink-0 gap-1 rounded-md bg-[var(--bg-card)] p-1 border border-[var(--border)]">
          {RANGE_PRESETS.map((r) => {
            const active = rangeHours === r.hours;
            const disabled = r.hours > maxHours;
            return (
              <button
                key={r.label}
                onClick={() => !disabled && onRangeChange(r.hours)}
                title={disabled ? `Max ${maxHours}h for ${tf.label} interval` : r.label}
                className={`w-9 py-2 rounded-sm text-xs font-semibold tracking-wide text-center
                           transition-colors duration-150 [font-family:var(--font-display)]
                           ${disabled
                             ? "opacity-25 cursor-not-allowed text-[var(--text-dim)]"
                             : active
                               ? "bg-[var(--blue)] text-white"
                               : "bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                           }`}
              >
                {r.label}
              </button>
            );
          })}
        </div>

        <Sep />

        <div className="flex shrink-0 items-center gap-1">
          <NavArrow dir={-1} onClick={() => shift(-1)} />

          <DateRangePicker
            windowStart={windowStart}
            windowEnd={anchorEnd ?? new Date()}
            maxWindowStart={maxWindowStart}
            effectiveRangeHours={effectiveRangeHours}
            onRangeChange={onRangeChange}
            onAnchorChange={onAnchorChange}
          />

          <NavArrow dir={1} onClick={() => shift(1)} disabled={isLive} />

          <button
            onClick={() => onAnchorChange(null)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-sm text-[11px] font-semibold
                       border transition-colors duration-150 [font-family:var(--font-display)]
                       ${isLive
                         ? "bg-[var(--green)]/15 border-[var(--green)]/40 text-[var(--green)]"
                         : "bg-[var(--bg-card)] border-[var(--border-bright)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                       }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${isLive ? "bg-[var(--green)]" : "bg-[var(--text-dim)]"}`}
              style={isLive ? { animation: "pulse 2s infinite" } : {}}
            />
            Live
          </button>
        </div>

        <Sep />

        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm text-[11px] font-semibold bg-[var(--bg-card)]
                   border border-[var(--border-bright)] text-[var(--text-secondary)]
                   hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]
                   transition-colors duration-150 [font-family:var(--font-display)]"
        >
          <SaveIcon />
          Save
        </button>
        <button
          onClick={() => chartRef.current?.resetZoom?.()}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm text-[11px] font-semibold bg-[var(--bg-card)]
                   border border-[var(--border-bright)] text-[var(--text-secondary)]
                   hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]
                   transition-colors duration-150 [font-family:var(--font-display)]"
        >
          <SearchIcon />
          Reset
        </button>
      </div>

      {lastCandle && (
        <div className="hidden shrink-0 items-center gap-5 font-mono text-xs sm:flex">
          <OHLCItem label="O" value={lastCandle.o.toFixed(decimals)} color="text-[var(--text-secondary)]" />
          <OHLCItem label="H" value={lastCandle.h.toFixed(decimals)} color="text-[var(--green)]" bold />
          <OHLCItem label="L" value={lastCandle.l.toFixed(decimals)} color="text-[var(--red)]" bold />
          <OHLCItem
            label="C"
            value={lastCandle.c.toFixed(decimals)}
            color={lastCandle.c >= lastCandle.o ? "text-[var(--green)]" : "text-[var(--red)]"}
            bold
          />
        </div>
      )}
    </div>
  );
}

function DateRangePicker({
  windowStart,
  windowEnd,
  maxWindowStart,
  effectiveRangeHours,
  onRangeChange,
  onAnchorChange,
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("date");
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [gotoDate, setGotoDate] = useState(toDateInputValue(windowStart));
  const [gotoTime, setGotoTime] = useState(toTimeInputValue(windowStart));
  const [startDate, setStartDate] = useState(toDateInputValue(windowStart));
  const [startTime, setStartTime] = useState(toTimeInputValue(windowStart));
  const [endDate, setEndDate] = useState(toDateInputValue(windowEnd));
  const [endTime, setEndTime] = useState(toTimeInputValue(windowEnd));
  const [calendarMonth, setCalendarMonth] = useState(getMonthStart(windowStart));
  const [activeRangeField, setActiveRangeField] = useState("start");
  const [error, setError] = useState("");
  const triggerRef = useRef(null);
  const pickerRef = useRef(null);

  const maxDate = toDateInputValue(new Date());
  const maxGotoDate = toDateInputValue(maxWindowStart);
  const activeMaxDate = tab === "date" ? maxGotoDate : maxDate;

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (
        pickerRef.current?.contains(event.target) ||
        triggerRef.current?.contains(event.target)
      ) {
        return;
      }
      setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const toggleOpen = () => {
    if (!open && triggerRef.current) {
      setPos(getPickerPosition(triggerRef.current.getBoundingClientRect()));
      setGotoDate(toDateInputValue(windowStart));
      setGotoTime(toTimeInputValue(windowStart));
      setStartDate(toDateInputValue(windowStart));
      setStartTime(toTimeInputValue(windowStart));
      setEndDate(toDateInputValue(windowEnd));
      setEndTime(toTimeInputValue(windowEnd));
      setCalendarMonth(getMonthStart(windowStart));
      setActiveRangeField("start");
      setError("");
    }
    setOpen((current) => !current);
  };

  const switchTab = (nextTab) => {
    setTab(nextTab);
    setError("");
    if (nextTab === "date") {
      setCalendarMonth(getMonthStart(toUtcDate(gotoDate) ?? windowStart));
    } else {
      setCalendarMonth(getMonthStart(toUtcDate(startDate) ?? windowStart));
    }
  };

  const applyGoToDate = () => {
    const start = fromDateTimeInputs(gotoDate, gotoTime);
    if (!start) {
      setError("Enter a valid date and time.");
      return;
    }
    const nextEnd = new Date(start.getTime() + effectiveRangeHours * MS_PER_HOUR);
    onAnchorChange(nextEnd > new Date() ? null : nextEnd);
    setOpen(false);
  };

  const applyCustomRange = () => {
    const start = fromDateTimeInputs(startDate, startTime);
    const rawEnd = fromDateTimeInputs(endDate, endTime);
    const now = new Date();
    const end = rawEnd && rawEnd > now ? now : rawEnd;

    if (!start || !end) {
      setError("Select both start and end.");
      return;
    }
    if (end <= start) {
      setError("End must be after start.");
      return;
    }

    const hours = Number(((end.getTime() - start.getTime()) / MS_PER_HOUR).toFixed(6));
    if (hours > MAX_CUSTOM_RANGE_HOURS) {
      setError("Maximum supported custom range is 1 year.");
      return;
    }

    onRangeChange(hours);
    onAnchorChange(end >= now ? null : end);
    setOpen(false);
  };

  const selectCalendarDate = (date) => {
    const value = toDateInputValue(date);
    if (tab === "date") {
      setGotoDate(value);
      setError("");
      return;
    }

    if (activeRangeField === "start") {
      setStartDate(value);
      if (value > endDate) setEndDate(value);
      setActiveRangeField("end");
    } else {
      setEndDate(value);
      if (value < startDate) setStartDate(value);
    }
    setError("");
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleOpen}
        className={`flex h-7 min-w-[128px] items-center justify-between gap-2 rounded-sm border px-2
                   bg-[var(--bg-card)] text-[11px] font-semibold text-[var(--text-primary)]
                   transition-colors duration-150 [font-family:var(--font-display)]
                   ${open ? "border-[var(--blue)]" : "border-[var(--border-bright)] hover:border-[var(--blue)] hover:bg-[var(--bg-hover)]"}`}
      >
        <span className="flex items-center gap-1.5">
          <CalendarIcon />
          <span className="tabular-nums">{formatDisplayDate(windowStart)}</span>
        </span>
        <span className="text-[9px] font-bold text-[var(--text-dim)]">UTC</span>
      </button>

      {open && createPortal(
        <div
          ref={pickerRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          role="dialog"
          aria-label="Go to"
          className="w-[392px] select-none overflow-hidden rounded-md border border-[var(--border-bright)]
                     bg-[var(--bg-panel)] shadow-[0_18px_50px_rgba(0,0,0,0.35)]"
        >
          <div className="flex h-11 items-center justify-between border-b border-[var(--border)] px-4">
            <div className="text-[14px] font-semibold text-[var(--text-primary)]">Go to</div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-sm text-[var(--text-secondary)]
                         hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <CloseIcon />
            </button>
          </div>

          <div className="border-b border-[var(--border)] px-4">
            <div className="relative flex h-10 items-end gap-7">
              <CalendarTab active={tab === "date"} onClick={() => switchTab("date")}>
                Date
              </CalendarTab>
              <CalendarTab active={tab === "range"} onClick={() => switchTab("range")}>
                Custom range
              </CalendarTab>
            </div>
          </div>

          <div className="px-4 py-3.5">
            {tab === "date" ? (
              <div className="space-y-3">
                <div className="grid grid-cols-[1fr_96px] gap-2">
                  <InputWithIcon
                    value={gotoDate}
                    maxLength={10}
                    placeholder="YYYY-MM-DD"
                    icon={<CalendarLargeIcon />}
                    onChange={(value) => {
                      setGotoDate(value);
                      const parsed = toUtcDate(value);
                      if (parsed) setCalendarMonth(getMonthStart(parsed));
                    }}
                  />
                  <InputWithIcon
                    value={gotoTime}
                    maxLength={5}
                    placeholder="00:00"
                    icon={<ClockIcon />}
                    onChange={setGotoTime}
                  />
                </div>

                {error && <PickerError>{error}</PickerError>}

                <CalendarMonth
                  month={calendarMonth}
                  maxDate={activeMaxDate}
                  selectedDate={gotoDate}
                  onMonthChange={setCalendarMonth}
                  onSelectDate={selectCalendarDate}
                />
              </div>
            ) : (
              <div className="space-y-3">
                <DateTimeRow
                  label="Start"
                  dateValue={startDate}
                  timeValue={startTime}
                  maxDate={maxDate}
                  active={activeRangeField === "start"}
                  onFocus={() => setActiveRangeField("start")}
                  onDateChange={setStartDate}
                  onTimeChange={setStartTime}
                />
                <DateTimeRow
                  label="End"
                  dateValue={endDate}
                  timeValue={endTime}
                  maxDate={maxDate}
                  active={activeRangeField === "end"}
                  onFocus={() => setActiveRangeField("end")}
                  onDateChange={setEndDate}
                  onTimeChange={setEndTime}
                />

                {error && <PickerError>{error}</PickerError>}

                <CalendarMonth
                  month={calendarMonth}
                  maxDate={activeMaxDate}
                  selectedDate={activeRangeField === "start" ? startDate : endDate}
                  rangeStart={startDate}
                  rangeEnd={endDate}
                  onMonthChange={setCalendarMonth}
                  onSelectDate={selectCalendarDate}
                />
              </div>
            )}
          </div>

          <div className="flex h-14 items-center justify-end gap-2 border-t border-[var(--border)] bg-[var(--bg-panel)] px-4">
            <PickerButton onClick={() => setOpen(false)}>Cancel</PickerButton>
            <PickerButton primary onClick={tab === "date" ? applyGoToDate : applyCustomRange}>
              {tab === "date" ? "Go to" : "Apply"}
            </PickerButton>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function CalendarTab({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative h-10 px-0 pb-2 text-[12px] font-semibold transition-colors duration-150
                 ${active
                   ? "text-[var(--blue)] after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[var(--blue)]"
                   : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                 }`}
    >
      {children}
    </button>
  );
}

function DateTimeRow({
  label,
  dateValue,
  timeValue,
  active,
  onFocus,
  onDateChange,
  onTimeChange,
}) {
  return (
    <div>
      <label className={`mb-1.5 block text-[10px] font-bold uppercase tracking-wider ${active ? "text-[var(--blue)]" : "text-[var(--text-dim)]"}`}>
        {label}
      </label>
      <div className="grid grid-cols-[1fr_88px] gap-2">
        <InputWithIcon
          value={dateValue}
          maxLength={10}
          placeholder="YYYY-MM-DD"
          icon={<CalendarLargeIcon />}
          active={active}
          onFocus={onFocus}
          onChange={onDateChange}
        />
        <InputWithIcon
          value={timeValue}
          maxLength={5}
          placeholder="00:00"
          icon={<ClockIcon />}
          active={active}
          onFocus={onFocus}
          onChange={onTimeChange}
        />
      </div>
    </div>
  );
}

function InputWithIcon({
  value,
  maxLength,
  placeholder,
  icon,
  active = false,
  onFocus,
  onChange,
}) {
  return (
    <label
      className={`flex h-9 items-center rounded-sm border bg-[var(--bg-card)] shadow-[inset_0_0_0_1px_transparent]
                  transition-colors duration-150
                  ${active ? "border-[var(--blue)]" : "border-[var(--border-bright)] focus-within:border-[var(--blue)] hover:border-[var(--text-dim)]"}`}
    >
      <input
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onFocus={onFocus}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 bg-transparent px-2 text-[13px] font-medium tabular-nums
                   text-[var(--text-primary)] outline-none placeholder:text-[var(--text-dim)]"
      />
      <span className="flex h-full w-8 items-center justify-center text-[var(--text-secondary)]">
        {icon}
      </span>
    </label>
  );
}

function CalendarMonth({
  month,
  maxDate,
  selectedDate,
  rangeStart,
  rangeEnd,
  onMonthChange,
  onSelectDate,
}) {
  const today = toDateInputValue(new Date());
  const maxMonth = getMonthStart(toUtcDate(maxDate) ?? new Date());
  const nextMonth = addMonths(month, 1);
  const nextDisabled = nextMonth.getTime() > maxMonth.getTime();
  const cells = buildMonthCells(month);
  const hasRange = rangeStart && rangeEnd && rangeStart <= rangeEnd;

  return (
    <div className="rounded-sm border border-[var(--border)] bg-[var(--bg-panel)] px-1">
      <div className="flex h-10 items-center justify-between px-2">
        <MonthButton onClick={() => onMonthChange(addMonths(month, -1))}>
          <ChevronLeftIcon />
        </MonthButton>
        <button
          type="button"
          className="rounded-sm px-3 py-1 text-[13px] font-semibold text-[var(--text-primary)]
                     hover:bg-[var(--bg-hover)]"
        >
          {formatMonthTitle(month)}
        </button>
        <MonthButton disabled={nextDisabled} onClick={() => onMonthChange(nextMonth)}>
          <ChevronRightIcon />
        </MonthButton>
      </div>

      <div className="grid grid-cols-7 px-2 pb-1 text-center text-[11px] font-semibold text-[var(--text-dim)]">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((day) => (
          <span key={day} className="h-7 leading-7">{day}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1 px-2 pb-3" role="grid">
        {cells.map((date, index) => {
          if (!date) return <span key={`blank-${index}`} className="h-8" />;
          const value = toDateInputValue(date);
          const disabled = value > maxDate;
          const selected = value === selectedDate;
          const current = value === today;
          const inRange = hasRange && value >= rangeStart && value <= rangeEnd;
          const rangeEdge = value === rangeStart || value === rangeEnd;

          return (
            <button
              key={value}
              type="button"
              disabled={disabled}
              onClick={() => onSelectDate(date)}
              className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-medium
                         transition-colors duration-100
                         ${disabled
                           ? "cursor-not-allowed text-[var(--text-dim)] opacity-30"
                           : selected || rangeEdge
                             ? "bg-[var(--blue)] text-white"
                             : inRange
                               ? "bg-[var(--blue)]/12 text-[var(--text-primary)]"
                               : current
                                 ? "border border-[var(--blue)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                                 : "text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                         }`}
            >
              {date.getUTCDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MonthButton({ disabled = false, onClick, children }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-sm
                 ${disabled
                   ? "cursor-not-allowed text-[var(--text-dim)] opacity-35"
                   : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                 }`}
    >
      {children}
    </button>
  );
}

function PickerError({ children }) {
  return (
    <div className="rounded-sm border border-[var(--red)]/30 bg-[var(--red)]/10 px-2 py-1.5 text-[11px] text-[var(--red)]">
      {children}
    </div>
  );
}

function PickerButton({ primary = false, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-8 rounded-sm border px-3.5 text-[12px] font-semibold transition-colors duration-150
                 [font-family:var(--font-display)]
                 ${primary
                   ? "border-[var(--blue)] bg-[var(--blue)] text-white"
                   : "border-[var(--border-bright)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                 }`}
    >
      {children}
    </button>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="m1.5 1.5 15 15m0-15-15 15" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d="m16.47 7.47 1.06 1.06L12.06 14l5.47 5.47-1.06 1.06L9.94 14l6.53-6.53Z" fill="currentColor" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 28 28" fill="none" aria-hidden="true" className="rotate-180">
      <path d="m16.47 7.47 1.06 1.06L12.06 14l5.47 5.47-1.06 1.06L9.94 14l6.53-6.53Z" fill="currentColor" />
    </svg>
  );
}

function CalendarLargeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path fill="currentColor" fillRule="evenodd" clipRule="evenodd" d="M10 4h1v2h6V4h1v2h2.5A2.5 2.5 0 0 1 23 8.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 5 19.5v-11A2.5 2.5 0 0 1 7.5 6H10V4Zm8 3H7.5C6.67 7 6 7.67 6 8.5v11c0 .83.67 1.5 1.5 1.5h13c.83 0 1.5-.67 1.5-1.5v-11c0-.83-.67-1.5-1.5-1.5H18Zm-3 2h-2v2h2V9Zm-7 4h2v2H8v-2Zm12-4h-2v2h2V9Zm-7 4h2v2h-2v-2Zm-3 4H8v2h2v-2Zm3 0h2v2h-2v-2Zm7-4h-2v2h2v-2Z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path fill="currentColor" d="M14 3c6.075 0 11 4.925 11 11s-4.925 11-11 11S3 20.075 3 14 7.925 3 14 3m0 1C8.477 4 4 8.477 4 14s4.477 10 10 10 10-4.477 10-10S19.523 4 14 4m1 12h-5v-1h4V8h1z" />
    </svg>
  );
}

function Sep() {
  return <div className="h-4 w-px shrink-0 bg-[var(--border)]" />;
}

function NavArrow({ dir, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-7 w-7 items-center justify-center rounded-sm border text-[11px]
                 transition-colors duration-150
                 ${disabled
                   ? "opacity-25 cursor-not-allowed border-[var(--border)] text-[var(--text-dim)]"
                   : "bg-[var(--bg-card)] border-[var(--border-bright)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                 }`}
    >
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d={dir < 0 ? "M10 3.5 5.5 8l4.5 4.5" : "M6 3.5 10.5 8 6 12.5"}
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

function OHLCItem({ label, value, color, bold }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[var(--text-dim)] font-semibold">{label}</span>
      <span className={`${color} ${bold ? "font-bold" : "font-normal"}`}>{value}</span>
    </div>
  );
}

function SaveIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 2.5h8.5L13.5 4.5v9H3v-11Z" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5 2.5v4h6v-4M5.5 13.5v-4h5v4" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M7 11.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4.5 2v2M11.5 2v2M3 5.5h10M3.5 3.5h9v10h-9v-10Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function SymbolDropdown({ pairs, activeSym, onSymChange }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [search, setSearch] = useState("");
  const triggerRef = useRef(null);
  const ref = useRef(null);

  const isHugeList = pairs.length > 1000;
  const query = search.trim().toUpperCase();

  // Default list (no search) — show the MOST COMMON pairs first so users
  // see EURUSD/GBPUSD/USDJPY/BTCUSD/etc immediately, then everything else
  // alphabetically. Limit to 300 visible items for render perf; search reveals all.
  const defaultPairs = (() => {
    if (!isHugeList) return pairs;
    const MAJOR_PAIRS = new Set([
      "EURUSD","GBPUSD","USDJPY","USDCHF","USDCAD","AUDUSD","NZDUSD",
      "EURGBP","EURJPY","GBPJPY","EURCHF","AUDJPY","CADJPY","CHFJPY",
      "BTCUSD","ETHUSD","XRPUSD","XAUUSD","XAGUSD","XPTUSD",
    ]);
    const majors = pairs.filter(p => MAJOR_PAIRS.has(p.sym));
    const rest = pairs
      .filter(p => !MAJOR_PAIRS.has(p.sym))
      .sort((a, b) => a.sym.localeCompare(b.sym));
    return [...majors, ...rest].slice(0, 300);
  })();

  const filteredPairs = !query
    ? defaultPairs
    : pairs.filter((pair) => (
        pair.sym.includes(query) || pair.base.includes(query) || pair.quote.includes(query)
      )).slice(0, 500);

  useEffect(() => {
    const handler = (event) => {
      if (
        ref.current &&
        !ref.current.contains(event.target) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleOpen = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen((current) => !current);
  };

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        onClick={handleOpen}
        className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5
                   bg-[var(--bg-card)] transition-all duration-150 [font-family:var(--font-display)]
                   ${open
                     ? "border-[var(--blue)] text-[var(--text-primary)]"
                     : "border-[var(--border-bright)] text-[var(--text-primary)] hover:border-[var(--blue)] hover:bg-[var(--bg-hover)]"
                   }`}
      >
        <span className="flex items-center gap-1">
          <span className="text-[11px] font-bold text-[var(--blue)] tracking-wider">{activeSym.base}</span>
          <span className="text-[var(--text-dim)] text-[11px]">/</span>
          <span className="text-[11px] font-bold text-[var(--text-secondary)] tracking-wider">{activeSym.quote}</span>
        </span>
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none"
          className={`shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}>
          <path d="M2 3.5L5 6.5L8 3.5" stroke="var(--text-dim)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && createPortal(
        <div
          ref={ref}
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="w-56 rounded-md border border-[var(--border-bright)]
                     bg-[var(--bg-panel)] shadow-xl shadow-black/40 overflow-hidden"
        >
          <div className="p-2 border-b border-[var(--border)]">
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search FX pair or code..."
              className="w-full rounded-sm bg-[var(--bg-card)] border border-[var(--border-bright)] px-2.5 py-2 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--blue)]"
            />
          </div>
          <div className="max-h-80 overflow-y-auto">
            {filteredPairs.map((pair) => {
              const isActive = pair.sym === activeSym.sym;
              return (
                <button
                  key={pair.sym}
                  onClick={() => { onSymChange(pair); setOpen(false); setSearch(""); }}
                  className={`flex w-full items-center justify-between px-3.5 py-2.5
                             text-[11px] font-semibold transition-colors duration-100
                             [font-family:var(--font-display)]
                             ${isActive
                               ? "bg-[var(--blue)]/15 text-[var(--blue)]"
                               : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                             }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span className={`font-bold tracking-wider ${isActive ? "text-[var(--blue)]" : "text-[var(--text-primary)]"}`}>
                      {pair.base}
                    </span>
                    <span className="text-[var(--text-dim)]">/</span>
                    <span className="tracking-wider">{pair.quote}</span>
                  </span>
                  {isActive ? (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                      <path d="M2 5.5L4 7.5L8 3" stroke="var(--blue)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <span className="text-[10px] text-[var(--text-dim)] tracking-wider">{pair.sym}</span>
                  )}
                </button>
              );
            })}
            {filteredPairs.length === 0 && (
              <div className="px-3.5 py-3 text-[11px] text-[var(--text-dim)]">
                No matching pairs
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
