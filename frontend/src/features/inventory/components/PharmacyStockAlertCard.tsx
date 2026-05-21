import { AlertCircle, AlertTriangle, Ban } from 'lucide-react';
import { cn } from '@/utils/cn';
import { StatusPill } from '@/components/data-display';
import { isStockBlocked, type PharmacyAlert } from '../inventoryTypes';
import { severityLabel, severityPulse, severityTone } from '../severityVisuals';

interface PharmacyStockAlertCardProps {
  alerts: PharmacyAlert[];
  className?: string;
}

const formatDate = (iso?: string): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};

export function PharmacyStockAlertCard({
  alerts,
  className,
}: PharmacyStockAlertCardProps): JSX.Element {
  const critical = alerts.filter((a) => isStockBlocked(a.severity));
  const warning = alerts.filter((a) => !isStockBlocked(a.severity) && a.severity !== 'ok');
  const tone: 'critical' | 'warning' | 'ok' =
    critical.length > 0 ? 'critical' : warning.length > 0 ? 'warning' : 'ok';

  const cardToneClass =
    tone === 'critical'
      ? 'border-danger/40 bg-danger/5'
      : tone === 'warning'
        ? 'border-warning/40 bg-warning/5'
        : 'border-border bg-card';

  const titleToneClass =
    tone === 'critical' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-foreground';

  const HeadIcon = tone === 'critical' ? Ban : tone === 'warning' ? AlertTriangle : AlertCircle;

  return (
    <section
      className={cn(
        'flex flex-col gap-3 rounded-xl border p-4',
        cardToneClass,
        className,
      )}
      aria-label="Pharmacy stock alerts"
    >
      <header className="flex items-center justify-between">
        <div>
          <h3 className={cn('inline-flex items-center gap-1.5 text-sm font-semibold', titleToneClass)}>
            <HeadIcon className="h-4 w-4" />
            Pharmacy stock alerts
          </h3>
          <p className="text-xs text-muted-foreground">View only — managed by pharmacy team</p>
        </div>
        <span
          className={cn(
            'rounded-md px-2 py-0.5 text-xs font-medium',
            tone === 'critical'
              ? 'bg-danger/15 text-danger'
              : tone === 'warning'
                ? 'bg-warning/15 text-warning'
                : 'bg-muted text-muted-foreground',
          )}
        >
          {alerts.length} items
        </span>
      </header>

      {critical.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-danger">
            <Ban className="h-3.5 w-3.5" /> Critical
          </div>
          <ul className="flex flex-col divide-y rounded-lg border border-danger/30 bg-danger/5">
            {critical.map((a) => (
              <li key={a.medicineId} className="flex items-center justify-between px-3 py-2 text-sm">
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-danger">
                    {a.medicineName} <span className="text-danger/80">· {a.strength}</span>
                  </span>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-danger/80">
                    <StatusPill
                      tone={severityTone[a.severity]}
                      size="sm"
                      pulse={severityPulse[a.severity]}
                    >
                      {severityLabel[a.severity]}
                    </StatusPill>
                    {a.expiry && <span>expiry {formatDate(a.expiry)}</span>}
                  </div>
                </div>
                <div className="text-right text-xs tabular-nums text-danger">
                  <div>
                    <span className="font-medium">{a.availableQty}</span>{' '}
                    <span className="text-danger/70">/ {a.thresholdQty}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {warning.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-warning">
            <AlertTriangle className="h-3.5 w-3.5" /> Warning
          </div>
          <ul className="flex flex-col divide-y rounded-lg border border-warning/30 bg-warning/5">
            {warning.map((a) => (
              <li key={a.medicineId} className="flex items-center justify-between px-3 py-2 text-sm">
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-warning">
                    {a.medicineName} <span className="text-warning/80">· {a.strength}</span>
                  </span>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-warning/80">
                    <StatusPill
                      tone={severityTone[a.severity]}
                      size="sm"
                      pulse={severityPulse[a.severity]}
                    >
                      {severityLabel[a.severity]}
                    </StatusPill>
                    {a.expiry && <span>expiry {formatDate(a.expiry)}</span>}
                  </div>
                </div>
                <div className="text-right text-xs tabular-nums text-warning">
                  <div>
                    <span className="font-medium">{a.availableQty}</span>{' '}
                    <span className="text-warning/70">/ {a.thresholdQty}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {alerts.length === 0 && (
        <p className="text-sm text-muted-foreground">No stock issues right now.</p>
      )}
    </section>
  );
}
