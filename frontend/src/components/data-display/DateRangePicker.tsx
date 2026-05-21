import { useState } from 'react';
import { CalendarRange, ChevronDown } from 'lucide-react';
import { cn } from '@/utils/cn';
import {
  resolveDateRange,
  type DateRange,
  type DateRangePreset,
  type ResolvedRange,
} from '@/utils/dateRange';

interface DateRangePickerProps {
  /** Current preset; controlled. */
  value: DateRangePreset;
  /** When `value === 'custom'`, the from/to dates. */
  custom?: DateRange;
  /** Fires when user picks a preset OR commits a custom range. */
  onChange: (next: { preset: DateRangePreset; custom?: DateRange }) => void;
  /** Visible Δ-vs-prior label hint. Pure display — derived from value. */
  className?: string;
}

const presets: { key: Exclude<DateRangePreset, 'custom'>; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'this_week', label: 'This week' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'this_quarter', label: 'This quarter' },
  { key: 'ytd', label: 'YTD' },
];

/**
 * Reusable date-range filter for any analytics surface (owner
 * dashboards, cashier reports, admin audit views). Stays purely
 * controlled — caller owns `?range=` URL state. Emits both the
 * preset key and an optional custom {from,to}; consumer resolves to
 * absolute dates via `resolveDateRange()` for the API call.
 */
export function DateRangePicker({
  value,
  custom,
  onChange,
  className,
}: DateRangePickerProps): JSX.Element {
  const resolved: ResolvedRange = resolveDateRange(value, custom);
  const [open, setOpen] = useState<boolean>(value === 'custom');
  const [draftFrom, setDraftFrom] = useState<string>(custom?.from ?? resolved.from);
  const [draftTo, setDraftTo] = useState<string>(custom?.to ?? resolved.to);

  const pick = (key: Exclude<DateRangePreset, 'custom'>): void => {
    setOpen(false);
    onChange({ preset: key });
  };

  const submitCustom = (): void => {
    if (draftFrom && draftTo && draftFrom <= draftTo) {
      onChange({ preset: 'custom', custom: { from: draftFrom, to: draftTo } });
    }
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <CalendarRange className="h-4 w-4 text-muted-foreground" />
        <div className="inline-flex flex-wrap rounded-lg bg-muted p-1">
          {presets.map((p) => {
            const active = value === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => pick(p.key)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition',
                  active
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                aria-pressed={active}
              >
                {p.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition',
              value === 'custom'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
            aria-expanded={open}
          >
            Custom
            <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
          </button>
        </div>
      </div>

      {open && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">From</span>
            <input
              type="date"
              value={draftFrom}
              max={draftTo || undefined}
              onChange={(e) => setDraftFrom(e.target.value)}
              className="rounded-md border bg-background px-2 py-1 text-sm shadow-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">To</span>
            <input
              type="date"
              value={draftTo}
              min={draftFrom || undefined}
              onChange={(e) => setDraftTo(e.target.value)}
              className="rounded-md border bg-background px-2 py-1 text-sm shadow-sm"
            />
          </label>
          <button
            type="button"
            onClick={submitCustom}
            disabled={!draftFrom || !draftTo || draftFrom > draftTo}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Apply
          </button>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{resolved.label}</span>{' '}
        ({resolved.from} → {resolved.to}) · vs{' '}
        <span className="text-foreground">{resolved.previous.label}</span>{' '}
        ({resolved.previous.from} → {resolved.previous.to})
      </p>
    </div>
  );
}
