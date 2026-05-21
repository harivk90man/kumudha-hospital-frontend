import { cn } from '@/utils/cn';

interface LiveIndicatorProps {
  /** Optional override label. Defaults to 'Live'. */
  label?: string;
  className?: string;
}

/**
 * Small breathing dot + text — render next to a page title to signal
 * "this view auto-refreshes / reflects live state". Tone is success
 * (green) so it reads as healthy/active without competing with status
 * pills inside the table rows.
 */
export function LiveIndicator({ label = 'Live', className }: LiveIndicatorProps): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success',
        className,
      )}
      aria-live="polite"
    >
      <span className="relative inline-flex h-1.5 w-1.5">
        <span
          aria-hidden="true"
          className="absolute inline-flex h-1.5 w-1.5 rounded-full bg-success opacity-60 animate-breathe-ring"
        />
        <span
          aria-hidden="true"
          className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success animate-breathe"
        />
      </span>
      {label}
    </span>
  );
}
