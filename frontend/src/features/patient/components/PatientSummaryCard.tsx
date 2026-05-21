import { cn } from '@/utils/cn';
import { Phone, Cake, Droplet, ShieldAlert, HeartPulse } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/layout';
import { StatusPill } from '@/components/data-display';
import type { PatientSummary } from '../patientTypes';

interface PatientSummaryCardProps {
  patient: PatientSummary;
  className?: string;
}

const labelClass = 'text-[10px] font-medium uppercase tracking-wider text-muted-foreground';

export function PatientSummaryCard({
  patient,
  className,
}: PatientSummaryCardProps): JSX.Element {
  return (
    <Card className={className} aria-label="Patient summary">
      <CardHeader className="mb-0">
        <CardTitle>Patient summary</CardTitle>
        <span className="font-mono text-xs text-muted-foreground">{patient.uhid}</span>
      </CardHeader>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className={labelClass}>Name</div>
          <div className="font-medium">{patient.fullName}</div>
        </div>
        <div>
          <div className={labelClass}>Sex / Age</div>
          <div className="inline-flex items-center gap-1.5 font-medium">
            <Cake className="h-3.5 w-3.5 text-muted-foreground" />
            {patient.gender.toUpperCase()} · {patient.ageYears}y
          </div>
        </div>
        <div>
          <div className={labelClass}>Phone</div>
          <div className="inline-flex items-center gap-1.5 font-medium">
            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
            {patient.mobile}
          </div>
        </div>
        <div>
          <div className={labelClass}>Blood group</div>
          <div className="inline-flex items-center gap-1.5 font-medium">
            <Droplet className="h-3.5 w-3.5 text-muted-foreground" />
            {patient.bloodGroup ?? '—'}
          </div>
        </div>
      </div>

      <div className="space-y-3 border-t border-hairline pt-3 text-sm">
        <div>
          <div className={cn(labelClass, 'mb-1.5 flex items-center gap-1.5')}>
            <ShieldAlert className="h-3 w-3" /> Allergies
          </div>
          {(patient.allergies?.length ?? 0) === 0 ? (
            <span className="text-muted-foreground">No known allergies</span>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {patient.allergies?.map((a) => (
                <StatusPill key={a.allergen} tone="danger" title={a.allergen}>
                  {a.allergen}
                </StatusPill>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className={cn(labelClass, 'mb-1.5 flex items-center gap-1.5')}>
            <HeartPulse className="h-3 w-3" /> Chronic conditions
          </div>
          {(patient.chronicConditions?.length ?? 0) === 0 ? (
            <span className="text-muted-foreground">None reported</span>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {patient.chronicConditions?.map((c) => (
                <StatusPill key={c} tone="warning">
                  {c}
                </StatusPill>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
