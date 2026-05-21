/**
 * Date-range presets used by every analytics surface (owner dashboards,
 * cashier daily-collection reports, admin audit views). Each preset
 * resolves to:
 *   - the current period [from, to] (inclusive, ISO `yyyy-mm-dd`)
 *   - the matching previous period for Δ-vs-prior comparisons
 *
 * Pure functions, no React. Callers (URL state, selectors, mock APIs)
 * import directly. Real backend will compute the same windows
 * server-side from a single `?range=this-month` query param.
 */

export type DateRangePreset =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'ytd'
  | 'custom';

export interface DateRange {
  /** Inclusive start, ISO yyyy-mm-dd. */
  from: string;
  /** Inclusive end, ISO yyyy-mm-dd. */
  to: string;
}

export interface ResolvedRange extends DateRange {
  preset: DateRangePreset;
  label: string;
  /** Same-shape window immediately before `from`, for Δ comparisons. */
  previous: DateRange & { label: string };
}

/* ---------- ISO helpers ---------- */

/** Day-precision ISO without timezone offset (good for date grouping). */
export const isoDate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const startOfDay = (d: Date): Date => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const addDays = (d: Date, n: number): Date => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

/** Mon-anchored. JS getDay(): Sun=0..Sat=6 — bias to Mon=0..Sun=6. */
const startOfWeekMon = (d: Date): Date => {
  const x = startOfDay(d);
  const dow = (x.getDay() + 6) % 7;
  return addDays(x, -dow);
};

const startOfMonth = (d: Date): Date =>
  startOfDay(new Date(d.getFullYear(), d.getMonth(), 1));

const startOfQuarter = (d: Date): Date => {
  const q = Math.floor(d.getMonth() / 3);
  return startOfDay(new Date(d.getFullYear(), q * 3, 1));
};

const startOfYear = (d: Date): Date => startOfDay(new Date(d.getFullYear(), 0, 1));

/** Number of days between two dates, inclusive. */
const inclusiveDays = (from: Date, to: Date): number =>
  Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000) + 1;

/* ---------- Range resolution ---------- */

const labels: Record<Exclude<DateRangePreset, 'custom'>, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  this_week: 'This week',
  this_month: 'This month',
  last_month: 'Last month',
  this_quarter: 'This quarter',
  ytd: 'YTD',
};

/**
 * Resolve a preset (or a custom from/to pair) to absolute dates plus
 * the matching prior-period window for Δ comparisons.
 *
 * Prior-period rules:
 *   today/yesterday    → previous day
 *   this_week          → previous Mon-Sun week
 *   this_month         → previous calendar month
 *   last_month         → month before that
 *   this_quarter       → previous calendar quarter
 *   ytd                → same window last year (Jan 1 → same day-of-year)
 *   custom             → same-length window immediately before `from`
 */
export const resolveDateRange = (
  preset: DateRangePreset,
  custom?: DateRange,
  now: Date = new Date(),
): ResolvedRange => {
  const today = startOfDay(now);

  const span = (
    p: DateRangePreset,
    label: string,
    from: Date,
    to: Date,
    prevFrom: Date,
    prevTo: Date,
    prevLabel: string,
  ): ResolvedRange => ({
    preset: p,
    label,
    from: isoDate(from),
    to: isoDate(to),
    previous: { from: isoDate(prevFrom), to: isoDate(prevTo), label: prevLabel },
  });

  switch (preset) {
    case 'today':
      return span('today', labels.today, today, today,
        addDays(today, -1), addDays(today, -1), 'Yesterday');
    case 'yesterday': {
      const y = addDays(today, -1);
      return span('yesterday', labels.yesterday, y, y,
        addDays(y, -1), addDays(y, -1), 'Day before');
    }
    case 'this_week': {
      const start = startOfWeekMon(today);
      const prevStart = addDays(start, -7);
      const prevEnd = addDays(start, -1);
      return span('this_week', labels.this_week, start, today, prevStart, prevEnd, 'Last week');
    }
    case 'this_month': {
      const start = startOfMonth(today);
      const prevEnd = addDays(start, -1);
      const prevStart = startOfMonth(prevEnd);
      return span('this_month', labels.this_month, start, today, prevStart, prevEnd, 'Last month');
    }
    case 'last_month': {
      const thisStart = startOfMonth(today);
      const end = addDays(thisStart, -1);
      const start = startOfMonth(end);
      const prevEnd = addDays(start, -1);
      const prevStart = startOfMonth(prevEnd);
      return span('last_month', labels.last_month, start, end, prevStart, prevEnd, 'Month before');
    }
    case 'this_quarter': {
      const start = startOfQuarter(today);
      const prevEnd = addDays(start, -1);
      const prevStart = startOfQuarter(prevEnd);
      return span('this_quarter', labels.this_quarter, start, today, prevStart, prevEnd, 'Last quarter');
    }
    case 'ytd': {
      const start = startOfYear(today);
      const prevStart = startOfYear(new Date(today.getFullYear() - 1, 0, 1));
      const prevEnd = new Date(prevStart);
      prevEnd.setMonth(today.getMonth(), today.getDate());
      return span('ytd', labels.ytd, start, today, prevStart, prevEnd, 'Same period last year');
    }
    case 'custom':
    default: {
      if (!custom) {
        // Fallback to today if custom requested but no range supplied.
        return resolveDateRange('today', undefined, now);
      }
      const from = new Date(custom.from);
      const to = new Date(custom.to);
      const days = inclusiveDays(from, to);
      const prevTo = addDays(from, -1);
      const prevFrom = addDays(prevTo, -(days - 1));
      return span('custom', `${custom.from} → ${custom.to}`, from, to, prevFrom, prevTo,
        'Previous period');
    }
  }
};

/** True when an ISO yyyy-mm-dd falls inside [from, to] inclusive. */
export const inRange = (iso: string, range: DateRange): boolean =>
  iso >= range.from && iso <= range.to;

/** Δ helper. Returns null when prior is 0 (avoid divide-by-zero). */
export const pctChange = (current: number, previous: number): number | null => {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
};
