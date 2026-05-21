import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '@/utils/cn';
import { PAGE_SIZE_OPTIONS } from '@/utils/listQuery';

interface TablePaginationProps {
  /** Total rows across all pages (from the API’s PageResult). */
  total: number;
  /** Current 1-based page. */
  page: number;
  /** Rows per page. */
  limit: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  className?: string;
}

/**
 * Pagination footer for any list page. Shows "X – Y of Z" plus
 * first/prev/next/last + a page-size picker. Caller owns the
 * URL-state round-trip; this component is purely controlled.
 */
export function TablePagination({
  total,
  page,
  limit,
  onPageChange,
  onLimitChange,
  className,
}: TablePaginationProps): JSX.Element {
  const lastPage = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page), lastPage);
  const start = total === 0 ? 0 : (safePage - 1) * limit + 1;
  const end = Math.min(safePage * limit, total);
  const atFirst = safePage <= 1;
  const atLast = safePage >= lastPage;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 bg-card px-3 py-2 text-xs text-muted-foreground',
        className,
      )}
    >
      <span className="tabular-nums">
        {total === 0 ? '0' : `${start}–${end}`} of {total}
      </span>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5">
          <span>Rows</span>
          <select
            value={limit}
            onChange={(e) => onLimitChange(Number(e.target.value))}
            className="rounded-none border-x-0 border-t-0 border-b border-hairline bg-transparent px-0 py-0.5 text-xs focus:outline-none focus:border-primary"
            aria-label="Rows per page"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <div className="inline-flex items-center gap-0.5">
          <PagerButton onClick={() => onPageChange(1)} disabled={atFirst} label="First page">
            <ChevronsLeft className="h-3.5 w-3.5" />
          </PagerButton>
          <PagerButton
            onClick={() => onPageChange(safePage - 1)}
            disabled={atFirst}
            label="Previous page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </PagerButton>
          <span className="px-2 tabular-nums text-foreground">
            {safePage} / {lastPage}
          </span>
          <PagerButton
            onClick={() => onPageChange(safePage + 1)}
            disabled={atLast}
            label="Next page"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </PagerButton>
          <PagerButton
            onClick={() => onPageChange(lastPage)}
            disabled={atLast}
            label="Last page"
          >
            <ChevronsRight className="h-3.5 w-3.5" />
          </PagerButton>
        </div>
      </div>
    </div>
  );
}

interface PagerButtonProps {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}

function PagerButton({ onClick, disabled, label, children }: PagerButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
