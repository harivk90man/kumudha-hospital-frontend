import { forwardRef, type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/utils/cn';

/**
 * StatusDot — small color dot for inline status next to neutral text.
 * Use when you want the row to read primarily as text but signal status
 * subtly (the Linear/Stripe pattern). For a louder signal use StatusPill.
 *
 * Set `pulse="breathe"` for an in-flight state (gentle scale/opacity
 * loop), or `pulse="ripple"` for a high-attention alert (adds an outer
 * ring that radiates outward). Default `pulse="none"` is static — use
 * for terminal / neutral statuses to avoid animation fatigue.
 */
const dotVariants = cva('inline-block flex-shrink-0 rounded-full', {
  variants: {
    tone: {
      neutral: 'bg-muted-foreground/40',
      info:    'bg-info',
      success: 'bg-success',
      warning: 'bg-warning',
      danger:  'bg-danger',
      brand:   'bg-primary',
      accent:  'bg-brandAccent',
    },
    size: {
      sm: 'h-1.5 w-1.5',
      md: 'h-2 w-2',
      lg: 'h-2.5 w-2.5',
    },
    pulse: {
      none: '',
      breathe: 'animate-breathe',
      ripple: 'animate-breathe',
    },
  },
  defaultVariants: { tone: 'neutral', size: 'md', pulse: 'none' },
});

const ringTone: Record<NonNullable<StatusDotProps['tone']>, string> = {
  neutral: 'bg-muted-foreground/40',
  info:    'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  danger:  'bg-danger',
  brand:   'bg-primary',
  accent:  'bg-brandAccent',
};

export interface StatusDotProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof dotVariants> {}

export const StatusDot = forwardRef<HTMLSpanElement, StatusDotProps>(
  ({ className, tone, size, pulse, ...props }, ref) => {
    const dot = (
      <span
        ref={ref}
        className={cn(dotVariants({ tone, size, pulse }), className)}
        aria-hidden="true"
        {...props}
      />
    );
    if (pulse !== 'ripple') return dot;
    // For ripple we wrap the dot in a positioned container and stack a
    // pinging ring underneath it. Wrapper inherits no layout from the
    // dot’s classes — keep it minimal.
    return (
      <span className="relative inline-flex items-center justify-center">
        <span
          aria-hidden="true"
          className={cn(
            'absolute inline-flex rounded-full opacity-60 animate-breathe-ring',
            dotVariants({ size, pulse: 'none' }),
            ringTone[tone ?? 'neutral'],
          )}
        />
        {dot}
      </span>
    );
  },
);
StatusDot.displayName = 'StatusDot';
