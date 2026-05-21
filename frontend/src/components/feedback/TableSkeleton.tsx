import { Card } from '@/components/layout';
import { cn } from '@/utils/cn';

/**
 * Skeleton placeholder for a worklist table during first load. Replaces
 * the generic `<Spinner /> Loading…` pattern with a row-shaped skeleton
 * so the page lands at the same dimensions it’ll eventually settle into
 * — operational software, not a transactional spinner.
 *
 * Renders inside the same `<Card padding="none" elevation="elevated">`
 * shell every worklist table uses, so the layout doesn’t shift when the
 * real data resolves.
 */

interface TableSkeletonProps {
  /** Number of skeleton rows to render. Default 5 — enough to fill the
   *  fold without inflating the placeholder. */
  rows?: number;
  /** Number of columns. Default 6 — matches the median worklist shape. */
  cols?: number;
  className?: string;
}

export function TableSkeleton({
  rows = 5,
  cols = 6,
  className,
}: TableSkeletonProps): JSX.Element {
  return (
    <Card
      padding="none"
      elevation="elevated"
      className={cn('overflow-hidden', className)}
      aria-hidden="true"
      role="presentation"
    >
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <tbody>
            {Array.from({ length: rows }).map((_, r) => (
              <tr key={r} className="border-b last:border-b-0">
                {Array.from({ length: cols }).map((_, c) => (
                  <td key={c} className="px-3 py-3">
                    {/* Vary widths by column index so the skeleton looks
                        like a populated table, not a uniform grey block. */}
                    <div
                      className={cn(
                        'h-3 animate-pulse rounded bg-muted',
                        c === 0 && 'w-8',
                        c === 1 && 'w-14',
                        c === 2 && 'w-3/4',
                        c === 3 && 'w-1/2',
                        c >= 4 && 'w-2/3',
                      )}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
