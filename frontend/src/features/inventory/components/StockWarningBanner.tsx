import { AlertTriangle, Ban } from 'lucide-react';
import { cn } from '@/utils/cn';
import { isStockBlocked, type StockSeverity } from '../inventoryTypes';

interface StockWarningBannerProps {
  severity: Exclude<StockSeverity, 'ok'>;
  medicineName: string;
  message?: string;
  className?: string;
}

export function StockWarningBanner({
  severity,
  medicineName,
  message,
  className,
}: StockWarningBannerProps): JSX.Element {
  const critical = isStockBlocked(severity);
  const Icon = critical ? Ban : AlertTriangle;
  return (
    <div
      role={critical ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-md border p-2 text-xs',
        critical
          ? 'border-danger/30 bg-danger/10 text-danger'
          : 'border-warning/30 bg-warning/10 text-warning',
        className,
      )}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
      <span>
        <strong className="font-semibold">{medicineName}</strong>
        {' — '}
        {message ?? (critical ? 'blocked: cannot prescribe without override.' : 'low or near-expiry stock.')}
      </span>
    </div>
  );
}
