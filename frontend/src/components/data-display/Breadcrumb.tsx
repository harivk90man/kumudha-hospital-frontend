import { ChevronRight, Home } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/utils/cn';

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  /** Where the home icon links to — every role app passes its own dashboard. */
  homeTo: string;
  /** Accessible name for the home link (e.g., "Doctor home", "Front-desk home"). */
  homeLabel?: string;
  className?: string;
}

/**
 * Generic breadcrumb. Renders a home icon + a chevron-separated trail.
 * The last item is rendered as the current page (no link, bold). Earlier
 * items become links if `to` is set.
 */
export function Breadcrumb({
  items,
  homeTo,
  homeLabel = 'Home',
  className,
}: BreadcrumbProps): JSX.Element {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        // Hairline separator under the breadcrumb so it reads as page
        // chrome distinct from the content below — works on the pure-
        // white page bg where nothing else demarcates the trail.
        'flex items-center gap-1 overflow-x-auto whitespace-nowrap border-b border-hairline pb-3 text-sm text-muted-foreground',
        className,
      )}
    >
      <Link
        to={homeTo}
        className="flex items-center gap-1 rounded-md p-1 hover:bg-muted hover:text-foreground"
        aria-label={homeLabel}
      >
        <Home className="h-3.5 w-3.5" />
      </Link>
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <span key={`${item.label}-${idx}`} className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
            {item.to && !isLast ? (
              <Link
                to={item.to}
                className="rounded-md px-1.5 py-0.5 hover:bg-muted hover:text-foreground"
              >
                {item.label}
              </Link>
            ) : (
              <span
                className={cn('px-1.5 py-0.5', isLast && 'font-medium text-foreground')}
                aria-current={isLast ? 'page' : undefined}
              >
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
