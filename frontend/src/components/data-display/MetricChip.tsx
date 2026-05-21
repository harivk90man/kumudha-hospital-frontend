import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/utils/cn';

/**
 * MetricChip — dual-purpose count + filter pill.
 *
 * Replaces the "stat cards on top of a tab strip" pattern: each chip is
 * BOTH an at-a-glance KPI (the count) AND a filter toggle (active state).
 * Used in the worklist `<MetricStrip>` so the strip across the top of a
 * worklist communicates the day’s shape and lets staff slice the table
 * by clicking.
 *
 * Tone vocabulary mirrors `<StatusPill>` so a worklist row’s status pill
 * and its corresponding strip chip read as the same colour.
 */

const chipBase =
  'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

const chipVariants = cva(chipBase, {
  variants: {
    tone: {
      neutral: '',
      info:    '',
      success: '',
      warning: '',
      danger:  '',
      brand:   '',
    },
    active: { true: '', false: '' },
  },
  compoundVariants: [
    // Inactive — neutral surface, tone reserved for the leading dot.
    { tone: 'neutral', active: false, className: 'border-hairline bg-card text-muted-foreground hover:bg-muted/40' },
    { tone: 'info',    active: false, className: 'border-hairline bg-card text-muted-foreground hover:bg-info/5' },
    { tone: 'success', active: false, className: 'border-hairline bg-card text-muted-foreground hover:bg-success/5' },
    { tone: 'warning', active: false, className: 'border-hairline bg-card text-muted-foreground hover:bg-warning/5' },
    { tone: 'danger',  active: false, className: 'border-hairline bg-card text-muted-foreground hover:bg-danger/5' },
    { tone: 'brand',   active: false, className: 'border-hairline bg-card text-muted-foreground hover:bg-primary/5' },
    // Active — tone-tinted surface + tone text + tone ring.
    { tone: 'neutral', active: true, className: 'border-foreground/20 bg-muted text-foreground' },
    { tone: 'info',    active: true, className: 'border-info/30 bg-info/10 text-info' },
    { tone: 'success', active: true, className: 'border-success/30 bg-success/10 text-success' },
    { tone: 'warning', active: true, className: 'border-warning/30 bg-warning/10 text-warning' },
    { tone: 'danger',  active: true, className: 'border-danger/30 bg-danger/10 text-danger' },
    { tone: 'brand',   active: true, className: 'border-primary/30 bg-primary/10 text-primary' },
  ],
  defaultVariants: { tone: 'neutral', active: false },
});

const dotToneClass: Record<NonNullable<MetricChipProps['tone']>, string> = {
  neutral: 'bg-muted-foreground/40',
  info:    'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  danger:  'bg-danger',
  brand:   'bg-primary',
};

export interface MetricChipProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>,
    VariantProps<typeof chipVariants> {
  /** Numeric count rendered prominently. */
  count: number | string;
  /** Short label (1–2 words) describing the bucket. */
  label: string;
  /**
   * Add a breathing animation to the leading dot. Use only for buckets
   * that warrant attention when non-empty (e.g. Late, Critical, Expired).
   */
  pulse?: boolean;
}

export const MetricChip = forwardRef<HTMLButtonElement, MetricChipProps>(
  (
    { tone = 'neutral', active = false, count, label, pulse = false, className, ...props },
    ref,
  ) => {
    const isZero = Number(count) === 0;
    const dotColor = dotToneClass[tone ?? 'neutral'];
    return (
      <button
        ref={ref}
        type="button"
        aria-pressed={active === true}
        className={cn(
          chipVariants({ tone, active }),
          isZero && !active && 'opacity-60',
          className,
        )}
        {...props}
      >
        <span
          aria-hidden="true"
          className={cn(
            'inline-block h-1.5 w-1.5 shrink-0 rounded-full',
            dotColor,
            pulse && !isZero && 'animate-breathe',
          )}
        />
        <span className="font-semibold tabular-nums">{count}</span>
        <span className="text-xs font-medium uppercase tracking-wide opacity-80">
          {label}
        </span>
      </button>
    );
  },
);
MetricChip.displayName = 'MetricChip';
