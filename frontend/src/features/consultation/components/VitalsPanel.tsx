import { Activity, Gauge, Heart, Thermometer, Wind } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/layout';
import type { Vitals } from '../consultationTypes';

interface VitalsPanelProps {
  vitals?: Vitals;
  className?: string;
}

const cellClass =
  'flex flex-col items-start gap-0.5 rounded-lg bg-muted/40 p-3 text-sm';
const labelClass = 'text-[10px] font-medium uppercase tracking-wide text-muted-foreground';

const formatTime = (iso?: string): string => {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
  });
};

export function VitalsPanel({ vitals, className }: VitalsPanelProps): JSX.Element {
  if (!vitals) {
    return (
      <Card className={className} aria-label="Vitals">
        <CardTitle>Vitals</CardTitle>
        <p className="text-sm text-muted-foreground">Not recorded yet.</p>
      </Card>
    );
  }
  const bp = vitals.bpSystolic != null && vitals.bpDiastolic != null
    ? `${vitals.bpSystolic}/${vitals.bpDiastolic}`
    : '—';

  return (
    <Card className={className} aria-label="Latest vitals">
      <CardHeader className="mb-0">
        <CardTitle>Latest vitals</CardTitle>
        <span className="text-xs text-muted-foreground">
          {formatTime(vitals.recordedAt)} · {vitals.recordedBy}
        </span>
      </CardHeader>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
        <div className={cellClass}>
          <span className={labelClass}>
            <Gauge className="inline h-3 w-3" /> BP
          </span>
          <span className="font-semibold tabular-nums">{bp}</span>
          <span className="text-[10px] text-muted-foreground">mmHg</span>
        </div>
        <div className={cellClass}>
          <span className={labelClass}>
            <Heart className="inline h-3 w-3" /> Heart rate
          </span>
          <span className="font-semibold tabular-nums">{vitals.pulseRate ?? '—'}</span>
          <span className="text-[10px] text-muted-foreground">bpm</span>
        </div>
        <div className={cellClass}>
          <span className={labelClass}>
            <Thermometer className="inline h-3 w-3" /> Temp
          </span>
          <span className="font-semibold tabular-nums">{vitals.temperatureF ?? '—'}</span>
          <span className="text-[10px] text-muted-foreground">°F</span>
        </div>
        <div className={cellClass}>
          <span className={labelClass}>
            <Wind className="inline h-3 w-3" /> SpO₂
          </span>
          <span className="font-semibold tabular-nums">{vitals.spo2 ?? '—'}%</span>
        </div>
        <div className={cellClass}>
          <span className={labelClass}>Resp rate</span>
          <span className="font-semibold tabular-nums">{vitals.respiratoryRate ?? '—'}</span>
          <span className="text-[10px] text-muted-foreground">/min</span>
        </div>
        <div className={cellClass}>
          <span className={labelClass}>Weight</span>
          <span className="font-semibold tabular-nums">{vitals.weightKg ?? '—'}</span>
          <span className="text-[10px] text-muted-foreground">kg</span>
        </div>
        <div className={cellClass}>
          <span className={labelClass}>Height</span>
          <span className="font-semibold tabular-nums">{vitals.heightCm ?? '—'}</span>
          <span className="text-[10px] text-muted-foreground">cm</span>
        </div>
        <div className={cellClass}>
          <span className={labelClass}>
            <Activity className="inline h-3 w-3" /> BMI
          </span>
          <span className="font-semibold tabular-nums">{vitals.bmi ?? '—'}</span>
        </div>
      </div>

      {vitals.painScore != null && (
        <div className="rounded-md bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
          Pain score:{' '}
          <strong className="font-semibold tabular-nums">{vitals.painScore}/10</strong>
        </div>
      )}
    </Card>
  );
}
