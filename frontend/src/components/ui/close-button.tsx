import { X } from 'lucide-react';
import { cn } from '@/utils/cn';

interface CloseButtonProps {
  onClick: () => void;
  className?: string;
  'aria-label'?: string;
}

export function CloseButton({
  onClick,
  className,
  'aria-label': ariaLabel = 'Close',
}: CloseButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        'rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring',
        className,
      )}
    >
      <X className="h-4 w-4" />
    </button>
  );
}
