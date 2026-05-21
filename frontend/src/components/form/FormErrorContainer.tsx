import { AlertCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';

/**
 * Tone-coded error container that lives near a form / page header.
 * Replaces the scattered `<p role="alert" className="text-sm text-danger">`
 * pattern so backend / load / save failures read consistently across
 * the app: container, icon, title, body, optional Retry action.
 *
 * Two tones:
 *  - `danger`  → load failure, save failure, "could not reach the
 *                 server" — the operation cannot continue.
 *  - `warning` → partial success, stale state, soft-degrade conditions
 *                 — the user can proceed but should be aware.
 *
 * Healthcare-software requirement: every error needs a path forward.
 * The `onRetry` slot is a primary affordance for the recoverable cases;
 * the body copy should be actionable even when retry isn’t available.
 */
interface FormErrorContainerProps {
  /** Short title — what failed, in one phrase. */
  title: string;
  /** Optional longer line below the title. */
  description?: string;
  /** When provided, renders a Retry button on the right. */
  onRetry?: () => void | Promise<void>;
  /** Default `danger`. */
  tone?: 'danger' | 'warning';
  className?: string;
}

const toneStyles: Record<
  NonNullable<FormErrorContainerProps['tone']>,
  { wrapper: string; icon: typeof AlertCircle; iconClass: string; titleClass: string }
> = {
  danger: {
    wrapper: 'border-danger/30 bg-danger/5',
    icon: AlertCircle,
    iconClass: 'text-danger',
    titleClass: 'text-danger',
  },
  warning: {
    wrapper: 'border-warning/30 bg-warning/5',
    icon: AlertTriangle,
    iconClass: 'text-warning',
    titleClass: 'text-warning',
  },
};

export function FormErrorContainer({
  title,
  description,
  onRetry,
  tone = 'danger',
  className,
}: FormErrorContainerProps): JSX.Element {
  const s = toneStyles[tone];
  const Icon = s.icon;
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-wrap items-start gap-3 rounded-md border px-3 py-2.5',
        s.wrapper,
        className,
      )}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 flex-shrink-0', s.iconClass)} />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className={cn('text-sm font-semibold leading-tight', s.titleClass)}>
          {title}
        </p>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {onRetry && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void onRetry()}
          className="flex-shrink-0"
        >
          <RefreshCw />
          Retry
        </Button>
      )}
    </div>
  );
}
