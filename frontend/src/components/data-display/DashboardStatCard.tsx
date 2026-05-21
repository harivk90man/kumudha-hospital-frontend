import { cn } from '@/utils/cn';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface DashboardStatCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  /**
   * Severity hint. Renders ONLY as a small dot next to the value when not
   * `default`. The card body and icon stay neutral so the KPI grid reads
   * as a uniform surface — colour is reserved for true severity signal.
   */
  tone?: 'default' | 'primary' | 'warning' | 'success' | 'danger';
  trailing?: ReactNode;
  onClick?: () => void;
}

const dotClass: Record<NonNullable<DashboardStatCardProps['tone']>, string> = {
  default: '',
  primary: 'bg-primary',
  warning: 'bg-warning',
  success: 'bg-success',
  danger: 'bg-danger',
};

const dotLabel: Record<NonNullable<DashboardStatCardProps['tone']>, string> = {
  default: '',
  primary: 'Active',
  warning: 'Warning',
  success: 'OK',
  danger: 'Needs attention',
};

export function DashboardStatCard({
  label,
  value,
  icon: Icon,
  tone = 'default',
  trailing,
  onClick,
}: DashboardStatCardProps): JSX.Element {
  const Comp = onClick ? 'button' : 'div';
  // Severity tones (warning / danger) get a breathing dot so the card
  // itself signals "needs attention" — at-a-glance from across the
  // dashboard. Danger adds a soft outer ring for extra urgency.
  const breathe = tone === 'warning' || tone === 'danger';
  const ripple = tone === 'danger';
  return (
    <Comp
      onClick={onClick}
      className={cn(
        // Hairline ring matches the shared Card primitive — without it
        // the card reads as "orphan" on the pure-white page bg where
        // the soft shadow alone isn't enough to demarcate a surface.
        'flex items-start justify-between gap-3 rounded-xl bg-card p-5 text-left ring-1 ring-hairline shadow-card transition-shadow duration-200 ease-premium',
        onClick && 'cursor-pointer hover:shadow-card-hover',
      )}
    >
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="inline-flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold tabular-nums">{value}</span>
          {tone !== 'default' && (
            <span
              className="relative inline-flex h-2 w-2 self-center items-center justify-center"
              role="img"
              aria-label={dotLabel[tone]}
            >
              {ripple && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute inline-flex h-2 w-2 rounded-full opacity-60 animate-breathe-ring',
                    dotClass[tone],
                  )}
                />
              )}
              <span
                aria-hidden="true"
                className={cn(
                  'inline-flex h-2 w-2 rounded-full',
                  dotClass[tone],
                  breathe && 'animate-breathe',
                )}
              />
            </span>
          )}
        </span>
        {trailing}
      </div>
      <span className="rounded-lg bg-muted p-2 text-muted-foreground">
        <Icon className="h-5 w-5" />
      </span>
    </Comp>
  );
}
