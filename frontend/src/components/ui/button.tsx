import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-all duration-150 ease-premium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // Filled primary CTA — the one bold spot on the screen.
        default:     'bg-primary text-primary-foreground shadow-card hover:bg-primary/90',
        destructive: 'bg-danger text-danger-foreground shadow-card hover:bg-danger/90',
        // Status-toned solid CTAs — for status-driven primary actions
        // where the action color carries the urgency, not just an
        // adjacent pill (Take vitals, Mark released, etc.). Use sparingly:
        // never more than one solid status-toned button per row.
        warning:     'bg-warning text-warning-foreground shadow-card hover:bg-warning/90',
        success:     'bg-success text-success-foreground shadow-card hover:bg-success/90',
        // Tinted — accent-tone bg + accent-tone text. The "secondary action".
        tinted:      'bg-primary/10 text-primary hover:bg-primary/15',
        // Outline — for actions that need to read as separate-but-secondary.
        outline:     'bg-card text-foreground ring-1 ring-hairline hover:bg-muted/50',
        secondary:   'bg-muted text-foreground hover:bg-muted/70',
        // Plain — text-only with subtle hover. The "tertiary action".
        ghost:       'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
        link:        'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4',
        sm:      'h-8 rounded-md px-3 text-[13px]',
        lg:      'h-11 rounded-lg px-6',
        icon:    'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
