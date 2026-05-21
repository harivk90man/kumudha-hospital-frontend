import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, FlaskConical } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/feedback/Spinner';
import {
  acknowledgeNotification,
  needsAck,
  type LabResultNotification,
} from '@/features/lab';

interface CriticalResultBannerProps {
  notifications: LabResultNotification[];
  doctorId: string;
  onAcknowledged: (notificationId: string, ackedAt: string, ackedBy: string) => void;
  /** Start expanded (e.g. when shown inline after the doctor opens the badge). */
  initialExpanded?: boolean;
  className?: string;
}

const SLA_MINUTES = 30;

const minutesSince = (iso: string): number =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));

/**
 * Per TSD-08 §4.6: unacknowledged critical-flag results surface here.
 * Collapsed by default so the doctor's workspace is not blocked —
 * the compact chip communicates urgency without eating screen real estate.
 * Expand to read details and ACK each result inline.
 */
export function CriticalResultBanner({
  notifications,
  doctorId,
  onAcknowledged,
  initialExpanded = false,
  className,
}: CriticalResultBannerProps): JSX.Element | null {
  const pending = notifications.filter(needsAck);
  const [expanded, setExpanded] = useState(initialExpanded);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (pending.length === 0) return null;

  const handleAck = async (n: LabResultNotification): Promise<void> => {
    setBusyId(n.id);
    try {
      const res = await acknowledgeNotification(n.id, doctorId);
      onAcknowledged(res.id, res.ackedAt, res.ackedBy);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      role="alert"
      aria-label="Critical results pending acknowledgement"
      className={cn('rounded-lg border border-danger/40 bg-danger/5', className)}
    >
      {/* Compact header — always visible, click to expand */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        aria-expanded={expanded}
      >
        <AlertTriangle className="h-3.5 w-3.5 flex-none text-danger" />
        <span className="text-xs font-semibold text-danger">
          {pending.length} critical result{pending.length === 1 ? '' : 's'} pending
        </span>
        <span className="rounded-full bg-danger/15 px-1.5 py-0.5 text-[10px] font-medium text-danger">
          SLA {SLA_MINUTES} min
        </span>
        <span className="ml-auto text-muted-foreground">
          {expanded
            ? <ChevronUp className="h-3.5 w-3.5" />
            : <ChevronDown className="h-3.5 w-3.5" />}
        </span>
      </button>

      {/* Expanded detail rows */}
      {expanded && (
        <ul className="flex flex-col gap-1 border-t border-danger/20 px-3 pb-3 pt-2">
          {pending.map((n) => {
            const ageMin = minutesSince(n.occurredAt);
            const breached = ageMin > SLA_MINUTES;
            return (
              <li
                key={n.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-card px-3 py-2 text-sm"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">{n.testName}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{n.testCode}</span>
                    <span className="text-xs font-semibold text-danger">
                      {n.flag === 'critical_high' ? 'CRITICAL HIGH' : 'CRITICAL LOW'}
                    </span>
                    {breached && (
                      <span className="rounded-full bg-danger/15 px-1.5 py-0.5 text-[10px] font-medium text-danger">
                        SLA breached · {ageMin}m
                      </span>
                    )}
                  </div>
                  {n.resultSummary && (
                    <p className="text-xs text-muted-foreground">{n.resultSummary}</p>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void handleAck(n)}
                  disabled={busyId === n.id}
                >
                  {busyId === n.id ? <Spinner size="sm" label="Acknowledging" /> : <CheckCircle2 />}
                  Acknowledge
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
