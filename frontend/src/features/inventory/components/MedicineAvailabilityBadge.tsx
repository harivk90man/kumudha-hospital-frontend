import { cn } from '@/utils/cn';
import { AlertTriangle, Ban, CheckCircle2, Clock } from 'lucide-react';
import type { StockSeverity } from '../inventoryTypes';

interface MedicineAvailabilityBadgeProps {
  severity: StockSeverity;
  className?: string;
  compact?: boolean;
}

const config: Record<
  StockSeverity,
  { label: string; tone: string; Icon: typeof CheckCircle2 }
> = {
  ok: { label: 'In stock', tone: 'bg-success/10 text-success border-success/30', Icon: CheckCircle2 },
  low: { label: 'Low stock', tone: 'bg-warning/10 text-warning border-warning/30', Icon: AlertTriangle },
  near_expiry: { label: 'Near expiry', tone: 'bg-warning/10 text-warning border-warning/30', Icon: Clock },
  out_of_stock: { label: 'Out of stock', tone: 'bg-danger/10 text-danger border-danger/30', Icon: Ban },
  expired: { label: 'Expired', tone: 'bg-danger/10 text-danger border-danger/30', Icon: Ban },
};

export function MedicineAvailabilityBadge({
  severity,
  className,
  compact = false,
}: MedicineAvailabilityBadgeProps): JSX.Element {
  const { label, tone, Icon } = config[severity];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border text-xs font-medium',
        compact ? 'px-1.5 py-0.5' : 'px-2 py-0.5',
        tone,
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {!compact && label}
    </span>
  );
}
