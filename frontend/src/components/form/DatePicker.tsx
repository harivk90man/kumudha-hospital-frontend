import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';

interface DatePickerProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  requiredMark?: boolean;
  error?: string;
  placeholder?: string;
  hint?: string;
  minYear?: number;
  maxYear?: number;
  /** ISO yyyy-mm-dd — days before this are disabled. */
  min?: string;
  /** ISO yyyy-mm-dd — days after this are disabled. */
  max?: string;
  hideLabel?: boolean;
  flat?: boolean;
}

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const pad = (n: number): string => String(n).padStart(2, '0');

const formatDisplay = (iso: string): string => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${pad(d)} ${MONTHS_LONG[m - 1]?.slice(0, 3) ?? ''} ${y}`;
};

type View = 'day' | 'year';

export function DatePicker({
  label,
  value,
  onChange,
  requiredMark,
  error,
  placeholder = 'Select date',
  hint,
  minYear,
  maxYear,
  min,
  max,
  hideLabel = false,
  flat = false,
}: DatePickerProps): JSX.Element {
  const [open, setOpen] = useState<boolean>(false);
  const [view, setView] = useState<View>('day');
  const wrapperRef = useRef<HTMLDivElement>(null);

  const today = new Date();
  const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const parsed = useMemo<Date | null>(() => {
    if (!value) return null;
    const [y, m, d] = value.split('-').map(Number);
    if (!y || !m || !d) return null;
    const dt = new Date(y, m - 1, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }, [value]);

  const lo = minYear ?? (min ? Number(min.slice(0, 4)) : today.getFullYear() - 120);
  const hi = maxYear ?? (max ? Number(max.slice(0, 4)) : today.getFullYear());

  const isDayDisabled = (y: number, m: number, d: number): boolean => {
    const iso = `${y}-${pad(m + 1)}-${pad(d)}`;
    if (min && iso < min) return true;
    if (max && iso > max) return true;
    return false;
  };

  const [viewYear, setViewYear] = useState<number>(
    parsed?.getFullYear() ?? today.getFullYear(),
  );
  const [viewMonth, setViewMonth] = useState<number>(
    parsed?.getMonth() ?? today.getMonth(),
  );

  // Decade start: floor to nearest 12-year block so the grid is always full.
  const decadeStart = Math.floor(viewYear / 12) * 12;

  useEffect(() => {
    if (parsed) {
      setViewYear(parsed.getFullYear());
      setViewMonth(parsed.getMonth());
    }
  }, [parsed]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent): void => {
      if (!wrapperRef.current) return;
      if (e.target instanceof Node && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
        setView('day');
      }
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { setOpen(false); setView('day'); }
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (d: number): void => {
    onChange(`${viewYear}-${pad(viewMonth + 1)}-${pad(d)}`);
    setOpen(false);
    setView('day');
  };

  const pickYear = (y: number): void => {
    setViewYear(y);
    setView('day');
  };

  const goPrev = (): void => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => Math.max(lo, y - 1)); }
    else setViewMonth((m) => m - 1);
  };
  const goNext = (): void => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => Math.min(hi, y + 1)); }
    else setViewMonth((m) => m + 1);
  };

  const grid = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const leading = (firstOfMonth.getDay() + 6) % 7;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < leading; i += 1) cells.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewYear, viewMonth]);

  const isSelected = (d: number): boolean =>
    !!parsed &&
    parsed.getFullYear() === viewYear &&
    parsed.getMonth() === viewMonth &&
    parsed.getDate() === d;

  const isToday = (d: number): boolean =>
    today.getFullYear() === viewYear &&
    today.getMonth() === viewMonth &&
    today.getDate() === d;

  return (
    <div ref={wrapperRef} className="relative flex flex-col gap-1">
      {!hideLabel && (
        <span className="text-xs font-medium text-foreground">
          {label}
          {requiredMark && <span className="ml-0.5 text-danger">*</span>}
        </span>
      )}
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setView('day'); }}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          flat
            ? cn(
                'inline-flex w-full items-center justify-between gap-2 border-b bg-transparent px-0 py-1.5 text-left text-sm transition focus:outline-none focus:border-primary',
                error ? 'border-danger/50' : 'border-hairline',
              )
            : cn(
                'inline-flex h-9 items-center justify-between gap-2 rounded-md border bg-background px-3 text-left text-sm shadow-sm transition focus:outline-none focus:ring-2 focus:ring-ring',
                error && 'border-danger/50',
              ),
          value ? 'text-foreground' : 'text-muted-foreground/60',
        )}
      >
        <span className="truncate font-mono tabular-nums">
          {value ? formatDisplay(value) : placeholder}
        </span>
        <Calendar className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={`${label} calendar`}
          className="absolute left-0 top-full z-30 mt-1 w-[18rem] rounded-md border bg-card p-2 shadow-md"
        >
          {view === 'year' ? (
            <>
              {/* Year-grid header */}
              <div className="mb-2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setViewYear((y) => Math.max(lo, y - 12))}
                  aria-label="Previous years"
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="flex-1 text-center text-xs font-semibold tabular-nums">
                  {decadeStart} – {decadeStart + 11}
                </span>
                <button
                  type="button"
                  onClick={() => setViewYear((y) => Math.min(hi, y + 12))}
                  aria-label="Next years"
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* 4×3 year grid */}
              <div className="grid grid-cols-4 gap-1">
                {Array.from({ length: 12 }, (_, i) => decadeStart + i).map((y) => {
                  const outOfRange = y < lo || y > hi;
                  const isCurrentYear = y === today.getFullYear();
                  const isPickedYear = parsed?.getFullYear() === y;
                  return (
                    <button
                      key={y}
                      type="button"
                      disabled={outOfRange}
                      onClick={() => pickYear(y)}
                      className={cn(
                        'rounded py-1.5 text-xs font-medium tabular-nums transition',
                        outOfRange
                          ? 'cursor-not-allowed text-muted-foreground/30'
                          : isPickedYear
                            ? 'bg-primary text-primary-foreground'
                            : isCurrentYear
                              ? 'bg-primary/[0.08] text-primary'
                              : 'text-foreground hover:bg-muted/60',
                      )}
                    >
                      {y}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              {/* Day-view header */}
              <div className="mb-2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={goPrev}
                  aria-label="Previous month"
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <select
                  aria-label="Month"
                  value={viewMonth}
                  onChange={(e) => setViewMonth(Number(e.target.value))}
                  className="h-7 flex-1 rounded-md border bg-background px-2 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {MONTHS_LONG.map((mo, i) => (
                    <option key={mo} value={i}>{mo}</option>
                  ))}
                </select>
                {/* Year label — click to open year grid */}
                <button
                  type="button"
                  onClick={() => setView('year')}
                  aria-label="Pick year"
                  className="h-7 w-16 rounded-md border bg-background px-2 text-xs font-mono font-semibold tabular-nums shadow-sm hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {viewYear}
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  aria-label="Next month"
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Day-of-week strip */}
              <div className="mb-1 grid grid-cols-7 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {DAY_LABELS.map((d) => <span key={d}>{d}</span>)}
              </div>

              {/* Day grid */}
              <div className="grid grid-cols-7 gap-0.5">
                {grid.map((cell, i) => {
                  if (cell === null) return <span key={`blank-${i}`} className="h-7" />;
                  const disabled = isDayDisabled(viewYear, viewMonth, cell);
                  const selected = isSelected(cell);
                  const todayCell = isToday(cell);
                  return (
                    <button
                      key={`day-${cell}`}
                      type="button"
                      disabled={disabled}
                      onClick={() => pick(cell)}
                      className={cn(
                        'h-7 rounded text-xs font-medium tabular-nums transition',
                        disabled
                          ? 'cursor-not-allowed text-muted-foreground/30'
                          : selected
                            ? 'bg-primary text-primary-foreground'
                            : todayCell
                              ? 'bg-primary/[0.08] text-primary'
                              : 'text-foreground hover:bg-muted/60',
                      )}
                      aria-pressed={selected}
                    >
                      {cell}
                    </button>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="mt-2 flex items-center justify-between border-t pt-2 text-xxs text-muted-foreground">
                <button
                  type="button"
                  disabled={isDayDisabled(today.getFullYear(), today.getMonth(), today.getDate())}
                  onClick={() => {
                    onChange(todayIso);
                    setOpen(false);
                    setView('day');
                  }}
                  className="font-medium underline-offset-2 hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-30"
                >
                  Today
                </button>
                {value && (
                  <button
                    type="button"
                    onClick={() => { onChange(''); setOpen(false); }}
                    className="font-medium underline-offset-2 hover:text-foreground hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {hint && !error && <span className="text-xxs text-muted-foreground">{hint}</span>}
      {error && <span className="text-xxs text-danger" role="alert">{error}</span>}
    </div>
  );
}
