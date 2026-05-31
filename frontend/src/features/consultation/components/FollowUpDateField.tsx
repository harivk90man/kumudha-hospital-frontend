import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * Smart follow-up date input.
 *
 * Three input modes, single field:
 *  - Type a number (1–365)        → interpreted as "today + N days"
 *  - Type a date                  → parsed (`YYYY-MM-DD`, `DD/MM/YYYY`, `DD Mon YYYY`)
 *  - Click the calendar icon      → opens a month picker
 *
 * Storage is always ISO `yyyy-mm-dd` to match schema-11 `consultations.follow_up_date`.
 * A derived hint (`= 7 days from today`) renders below the input.
 */

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_LONG  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_LABELS   = ['Mo','Tu','We','Th','Fr','Sa','Su'];

const pad = (n: number): string => String(n).padStart(2, '0');

const isoFromDate = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const todayIso = (): string => isoFromDate(new Date());

const formatDisplay = (iso: string): string => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${pad(d)} ${MONTHS_SHORT[m - 1] ?? ''} ${y}`;
};

const daysFromToday = (iso: string): number | null => {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  const target = new Date(y, m - 1, d);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
};

/**
 * Parse user input into an ISO date. Order of attempts:
 *  1. Pure number 1–365     → today + N days
 *  2. `YYYY-MM-DD`          → as-is
 *  3. `DD/MM/YYYY` or `DD-MM-YYYY`
 *  4. `DD Mon YYYY` (e.g. `15 Jun 2026`)
 *  5. JS `Date.parse` fallback
 * If nothing matches → returns `fallback`.
 */
const parseInput = (raw: string, fallback: string): string => {
  const t = raw.trim();
  if (!t) return '';

  if (/^\d{1,3}$/.test(t)) {
    const n = parseInt(t, 10);
    if (n >= 1 && n <= 365) {
      const d = new Date(); d.setDate(d.getDate() + n);
      return isoFromDate(d);
    }
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;

  const slash = t.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
  if (slash) {
    const [, dd, mm, yy] = slash;
    return `${yy}-${pad(Number(mm))}-${pad(Number(dd))}`;
  }

  const dmy = t.match(/^(\d{1,2})\s+(\w{3,9})\s+(\d{4})$/i);
  if (dmy) {
    const [, dd, monName, yy] = dmy;
    const mi = MONTHS_LONG.findIndex((m) => m.toLowerCase().startsWith(monName.toLowerCase()));
    if (mi >= 0) return `${yy}-${pad(mi + 1)}-${pad(Number(dd))}`;
  }

  const parsed = new Date(t);
  if (!Number.isNaN(parsed.getTime())) return isoFromDate(parsed);

  return fallback;
};

interface FollowUpDateFieldProps {
  value: string;                          // ISO yyyy-mm-dd, '' = unset
  onChange: (iso: string) => void;
  className?: string;
}

const fieldClass =
  'w-full border-0 border-b border-hairline bg-transparent pt-1.5 pb-0.5 pr-8 text-sm text-foreground ' +
  'placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary transition-colors';

export function FollowUpDateField({ value, onChange, className }: FollowUpDateFieldProps): JSX.Element {
  const [raw,     setRaw]     = useState(formatDisplay(value));
  const [focused, setFocused] = useState(false);
  const [open,    setOpen]    = useState(false);
  const wrapperRef            = useRef<HTMLDivElement>(null);

  // Sync displayed text when value changes externally and field is idle.
  useEffect(() => {
    if (!focused) setRaw(formatDisplay(value));
  }, [value, focused]);

  // Close popup on click-outside or Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent): void => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Month-grid state.
  const today  = new Date();
  const parsed = useMemo<Date | null>(() => {
    if (!value) return null;
    const [y, m, d] = value.split('-').map(Number);
    if (!y || !m || !d) return null;
    const dt = new Date(y, m - 1, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }, [value]);

  const [viewYear,  setViewYear]  = useState(parsed?.getFullYear() ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.getMonth()    ?? today.getMonth());

  useEffect(() => {
    if (parsed) { setViewYear(parsed.getFullYear()); setViewMonth(parsed.getMonth()); }
  }, [parsed]);

  const grid = useMemo<(number | null)[]>(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const leading      = (firstOfMonth.getDay() + 6) % 7;
    const daysInMonth  = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < leading; i += 1) cells.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewYear, viewMonth]);

  const isSelected = (d: number): boolean =>
    !!parsed && parsed.getFullYear() === viewYear && parsed.getMonth() === viewMonth && parsed.getDate() === d;
  const isToday = (d: number): boolean =>
    today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === d;
  const isPast = (d: number): boolean => {
    const cell = new Date(viewYear, viewMonth, d);
    const t = new Date(); t.setHours(0, 0, 0, 0);
    return cell.getTime() < t.getTime();
  };

  const pick = (d: number): void => {
    onChange(`${viewYear}-${pad(viewMonth + 1)}-${pad(d)}`);
    setOpen(false);
  };
  const goPrev = (): void => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const goNext = (): void => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  const commit = (text: string): void => {
    const next = parseInput(text, value);
    if (next !== value) onChange(next);
    setRaw(formatDisplay(next));
  };

  const hint = daysFromToday(value);

  return (
    <div ref={wrapperRef} className={cn('relative flex flex-col gap-0.5', className)}>
      <div className="relative">
        <input
          type="text"
          value={raw}
          placeholder="e.g. 7, 15 Jun 2026, or 2026-06-15"
          onChange={(e) => setRaw(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); commit(raw); }}
          className={fieldClass}
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          title="Pick from calendar"
          aria-label="Pick from calendar"
          className="absolute right-0 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center text-muted-foreground transition-colors hover:text-primary"
        >
          <CalendarIcon className="h-4 w-4" />
        </button>
      </div>

      {hint !== null && (
        <span className="text-xxs text-muted-foreground">
          {hint === 0
            ? '= Today'
            : hint > 0
              ? `= ${hint} day${hint === 1 ? '' : 's'} from today`
              : `= ${Math.abs(hint)} day${Math.abs(hint) === 1 ? '' : 's'} ago`}
        </span>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Follow-up calendar"
          className="absolute left-0 top-full z-30 mt-1 w-[18rem] rounded-md border bg-card p-2 shadow-md"
        >
          <div className="mb-2 flex items-center gap-1">
            <button type="button" onClick={goPrev} aria-label="Previous month"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="flex-1 text-center text-xs font-semibold">
              {MONTHS_LONG[viewMonth]} {viewYear}
            </span>
            <button type="button" onClick={goNext} aria-label="Next month"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {DAY_LABELS.map((d) => <span key={d}>{d}</span>)}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {grid.map((cell, i) => {
              if (cell === null) return <span key={`b-${i}`} className="h-7" />;
              const disabled  = isPast(cell);
              const selected  = isSelected(cell);
              const todayCell = isToday(cell);
              return (
                <button
                  key={`d-${cell}`}
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

          <div className="mt-2 flex items-center justify-between border-t pt-2 text-xxs">
            <button
              type="button"
              onClick={() => { onChange(todayIso()); setOpen(false); }}
              className="font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Today
            </button>
            {value && (
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false); }}
                className="font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
