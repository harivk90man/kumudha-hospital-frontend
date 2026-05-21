import { AlertTriangle, ArrowDown, ArrowUp, CircleCheck, MinusCircle } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { LabResultFlag } from '../labTypes';

interface ResultFlagChipProps {
  flag: LabResultFlag;
  className?: string;
}

const flagConfig: Record<
  LabResultFlag,
  { tone: string; label: string; Icon: typeof CircleCheck }
> = {
  normal:        { tone: 'bg-success/10 text-success',  label: 'Normal',        Icon: CircleCheck },
  low:           { tone: 'bg-warning/15 text-warning',  label: 'Low',           Icon: ArrowDown },
  high:          { tone: 'bg-warning/15 text-warning',  label: 'High',          Icon: ArrowUp },
  critical_low:  { tone: 'bg-danger/15 text-danger',    label: 'Critical Low',  Icon: AlertTriangle },
  critical_high: { tone: 'bg-danger/15 text-danger',    label: 'Critical High', Icon: AlertTriangle },
};

const fallback = { tone: 'bg-muted text-muted-foreground', label: 'Pending', Icon: MinusCircle };

/**
 * Chip rendering for `LabResultFlag` (TSD-08 §4.6). Use anywhere a result’s
 * flag axis needs to read at-a-glance — Reports panel, history panel, etc.
 */
export function ResultFlagChip({ flag, className }: ResultFlagChipProps): JSX.Element {
  const cfg = flagConfig[flag] ?? fallback;
  const { tone, label, Icon } = cfg;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        tone,
        className,
      )}
      aria-label={`Result: ${label}`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
