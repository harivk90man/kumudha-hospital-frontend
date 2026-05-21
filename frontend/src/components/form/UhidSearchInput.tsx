import { useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/utils/cn';

interface UhidSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Fired on auto-search (debounced), blur, and Enter. */
  onSearch: () => void;
  placeholder?: string;
  /** Minimum characters before auto-search fires. Default: 4. */
  minChars?: number;
  /** Debounce delay in ms for auto-search. Default: 300. */
  debounceMs?: number;
  /**
   * 'flat'  — underline border only; for toolbars and inline headers.
   * 'box'   — rounded border box; for standalone search bars.
   * Default: 'flat'.
   */
  variant?: 'flat' | 'box';
  className?: string;
}

/**
 * Reusable UHID / phone search input with built-in debounced auto-search.
 * Fires onSearch after the debounce delay once minChars is reached,
 * and also fires on blur and Enter.
 */
export function UhidSearchInput({
  value,
  onChange,
  onSearch,
  placeholder = 'UHID or phone number',
  minChars = 4,
  debounceMs = 300,
  variant = 'flat',
  className,
}: UhidSearchInputProps): JSX.Element {
  const onSearchRef = useRef(onSearch);
  useEffect(() => { onSearchRef.current = onSearch; });

  useEffect(() => {
    if (value.length < minChars) return;
    const timer = setTimeout(() => onSearchRef.current(), debounceMs);
    return () => clearTimeout(timer);
  }, [value, minChars, debounceMs]);

  const isFlat = variant === 'flat';

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSearch(); }}
      className={cn('flex', className)}
    >
      <label className="relative flex items-end">
        <Search
          className={cn(
            'pointer-events-none absolute h-4 w-4 text-muted-foreground',
            isFlat ? 'bottom-2.5 left-0' : 'left-3 top-1/2 -translate-y-1/2',
          )}
        />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => onSearch()}
          placeholder={placeholder}
          className={cn(
            'bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none',
            isFlat
              ? 'w-52 rounded-none border-x-0 border-t-0 border-b border-hairline py-2 pl-6 pr-3 shadow-none focus:border-primary'
              : 'w-64 rounded-md border border-input py-2 pl-9 pr-3 shadow-sm focus:ring-2 focus:ring-ring',
          )}
        />
      </label>
    </form>
  );
}
