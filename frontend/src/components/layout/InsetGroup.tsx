import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

/**
 * Inset-grouped list — the "Settings.app" pattern. A rounded container
 * with hairline dividers between rows; each row has a hover bg lift.
 *
 * Use for prescription items, lab orders, recommendations, kin lists,
 * vitals rows — anywhere a sequence of similar records needs to read
 * as a single grouped surface, not N independent boxes.
 */
export const InsetGroup = forwardRef<HTMLUListElement, HTMLAttributes<HTMLUListElement>>(
  ({ className, ...props }, ref) => (
    <ul
      ref={ref}
      className={cn(
        'flex flex-col overflow-hidden rounded-xl bg-card shadow-inset',
        'divide-y divide-hairline',
        className,
      )}
      {...props}
    />
  ),
);
InsetGroup.displayName = 'InsetGroup';

interface InsetGroupRowProps extends HTMLAttributes<HTMLLIElement> {
  /** When true, the row gets a hover bg + cursor-pointer affordance. */
  interactive?: boolean;
}

export const InsetGroupRow = forwardRef<HTMLLIElement, InsetGroupRowProps>(
  ({ className, interactive = false, ...props }, ref) => (
    <li
      ref={ref}
      className={cn(
        'flex items-center justify-between gap-3 px-4 py-3 transition-colors duration-150 ease-premium',
        interactive && 'cursor-pointer hover:bg-muted/40',
        className,
      )}
      {...props}
    />
  ),
);
InsetGroupRow.displayName = 'InsetGroupRow';
