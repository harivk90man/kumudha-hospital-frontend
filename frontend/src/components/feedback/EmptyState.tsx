import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card } from '@/components/layout';
import { cn } from '@/utils/cn';

/**
 * Operational empty state. One primitive so every "no rows yet" /
 * "no matches" surface across the app reads the same: tone-coded icon
 * inside a muted circle, primary line, secondary actionable line, and
 * an optional CTA slot (button or link).
 *
 * Two surface modes:
 *   - `card` (default) — sits inside an elevated Card, used in place
 *     of a worklist table when there’s nothing to render.
 *   - `inline` — bare layout, used when the empty state lives inside
 *     another Card (filter-no-match strips, picker dropdowns, etc.).
 */

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  /** Secondary line — keep operational ("New invoices land here…"),
   *  not punctuated marketing copy. */
  description?: string;
  /** Optional CTA — usually a `<Button asChild><Link/></Button>`. */
  action?: ReactNode;
  /** Card surface (default) vs. inline bare layout. */
  surface?: 'card' | 'inline';
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  surface = 'card',
  className,
}: EmptyStateProps): JSX.Element {
  const body = (
    <div
      className={cn(
        'mx-auto flex max-w-sm flex-col items-center gap-2 py-6 text-center',
        className,
      )}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="text-xxs text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );

  if (surface === 'inline') return body;

  return (
    <Card elevation="elevated" className="text-center">
      {body}
    </Card>
  );
}
