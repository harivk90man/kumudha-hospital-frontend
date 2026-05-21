import { forwardRef, type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/utils/cn';

/**
 * StatusPill — single tone-tinted chip pattern. Replaces the
 * `bg-{tone}/15 text-{tone}` ad-hoc spans scattered across features.
 *
 * One style only: tinted background + tone text. No icon, no border —
 * stack a `<StatusDot>` separately if you need a leading dot. Premium-feel
 * design language uses ONE pill style so the eye learns it.
 *
 * Set `pulse` to add a leading breathing/rippling dot inside the pill —
 * use sparingly for in-flight ('breathe') or critical ('ripple') states.
 */
const pillVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium leading-none',
  {
    variants: {
      tone: {
        neutral: 'bg-muted text-muted-foreground',
        info:    'bg-info/10 text-info',
        success: 'bg-success/10 text-success',
        warning: 'bg-warning/10 text-warning',
        danger:  'bg-danger/10 text-danger',
        brand:   'bg-primary/10 text-primary',
        accent:  'bg-brandAccent/10 text-brandAccent',
      },
      size: {
        sm: 'h-5 px-2 text-[10px]',
        md: 'h-6 px-2.5 text-xs',
      },
    },
    defaultVariants: {
      tone: 'neutral',
      size: 'md',
    },
  },
);

const dotToneClass: Record<NonNullable<StatusPillProps['tone']>, string> = {
  neutral: 'bg-muted-foreground/40',
  info:    'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  danger:  'bg-danger',
  brand:   'bg-primary',
  accent:  'bg-brandAccent',
};

export interface StatusPillProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'>,
    VariantProps<typeof pillVariants> {
  /** Leading animated dot. `breathe` for in-flight, `ripple` for alerts. */
  pulse?: 'none' | 'breathe' | 'ripple';
  children?: React.ReactNode;
}

export const StatusPill = forwardRef<HTMLSpanElement, StatusPillProps>(
  ({ className, tone, size, pulse = 'none', children, ...props }, ref) => {
    const dotColor = dotToneClass[tone ?? 'neutral'];
    return (
      <span ref={ref} className={cn(pillVariants({ tone, size }), className)} {...props}>
        {pulse !== 'none' && (
          <span className="relative inline-flex h-1.5 w-1.5 items-center justify-center">
            {pulse === 'ripple' && (
              <span
                aria-hidden="true"
                className={cn('absolute inline-flex h-1.5 w-1.5 rounded-full opacity-60 animate-breathe-ring', dotColor)}
              />
            )}
            <span
              aria-hidden="true"
              className={cn('inline-flex h-1.5 w-1.5 rounded-full animate-breathe', dotColor)}
            />
          </span>
        )}
        {children}
      </span>
    );
  },
);
StatusPill.displayName = 'StatusPill';
