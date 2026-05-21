import { Slot } from '@radix-ui/react-slot';
import { forwardRef, type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/utils/cn';

/**
 * Card primitive — single source for the "surface that floats on the page"
 * pattern (CLAUDE.md §3.3). Replaces ad-hoc `rounded-xl border bg-card p-4`
 * blocks scattered across features.
 *
 * `asChild` (Radix Slot) lets a `<form>` or `<section>` adopt the card style
 * without losing its semantics — same trick as the Button primitive.
 *
 * Variants tune elevation and padding. Hairline ring is on the base so
 * every card reads as a separate surface even on the pure-white page bg
 * (where shadow alone wasn’t enough). Elevated/hover keep the ring AND
 * the shadow so they still lift visibly above neighbouring cards.
 */
const cardVariants = cva(
  'flex flex-col gap-3 rounded-xl bg-card text-card-foreground ring-1 ring-hairline transition-shadow duration-200 ease-premium',
  {
    variants: {
      elevation: {
        flat:     'shadow-none',
        card:     'shadow-card',
        elevated: 'shadow-elevated',
        hover:    'shadow-card hover:shadow-card-hover',
      },
      padding: {
        none: 'p-0',
        sm:   'p-3',
        md:   'p-5',
        lg:   'p-6',
      },
    },
    defaultVariants: {
      elevation: 'card',
      padding: 'md',
    },
  },
);

export interface CardProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  /** Render as the only child element instead of a `<div>` (Radix Slot). */
  asChild?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, elevation, padding, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'div';
    return (
      <Comp
        ref={ref}
        className={cn(cardVariants({ elevation, padding }), className)}
        {...props}
      />
    );
  },
);
Card.displayName = 'Card';

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex items-start justify-between gap-3', className)}
      {...props}
    />
  ),
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('text-base font-semibold leading-tight tracking-tight', className)}
      {...props}
    />
  ),
);
CardTitle.displayName = 'CardTitle';

export const CardLabel = forwardRef<HTMLSpanElement, HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'text-[11px] font-medium uppercase tracking-wider text-muted-foreground',
        className,
      )}
      {...props}
    />
  ),
);
CardLabel.displayName = 'CardLabel';

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-3', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex items-center justify-between gap-2', className)}
      {...props}
    />
  ),
);
CardFooter.displayName = 'CardFooter';
