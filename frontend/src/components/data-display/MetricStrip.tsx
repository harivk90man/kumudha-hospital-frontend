import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

/**
 * Horizontal container for `<MetricChip>` filters above a worklist.
 *
 * Replaces the per-status tab strip in worklist views — the chips read
 * as KPIs at-a-glance AND act as multi-select filters when clicked.
 * Scrolls horizontally on narrow screens so a long chip list doesn’t
 * wrap or push the table down.
 */

interface MetricStripProps {
  children: ReactNode;
  ariaLabel?: string;
  className?: string;
}

export function MetricStrip({
  children,
  ariaLabel = 'Filters',
  className,
}: MetricStripProps): JSX.Element {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'flex flex-wrap items-center gap-2 overflow-x-auto pb-1',
        className,
      )}
    >
      {children}
    </div>
  );
}
