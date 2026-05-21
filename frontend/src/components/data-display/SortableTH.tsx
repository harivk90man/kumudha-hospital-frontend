import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { parseSort } from '@/utils/listQuery';

interface SortableTHProps {
  field: string;
  sort: string | undefined;
  onSort: (next: string | undefined) => void;
  align?: 'left' | 'right';
  className?: string;
  children: ReactNode;
}

export function SortableTH({
  field,
  sort,
  onSort,
  align = 'left',
  className,
  children,
}: SortableTHProps): JSX.Element {
  const parsed = parseSort(sort);
  const isActive = parsed?.field === field;
  const direction = isActive ? parsed?.direction : undefined;

  const next = (): string | undefined => {
    if (!isActive) return field;
    if (direction === 'asc') return `-${field}`;
    return undefined;
  };

  return (
    <th
      onClick={() => onSort(next())}
      aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'}
      className={cn(
        'cursor-pointer select-none px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground',
        isActive && 'text-foreground',
        align === 'right' ? 'text-right' : 'text-left',
        className,
      )}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {direction === 'asc' ? (
          <ArrowUp className="h-3 w-3" />
        ) : direction === 'desc' ? (
          <ArrowDown className="h-3 w-3" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-40" />
        )}
      </span>
    </th>
  );
}
