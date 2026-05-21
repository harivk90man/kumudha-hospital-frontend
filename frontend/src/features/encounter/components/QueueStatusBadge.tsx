import { cn } from '@/utils/cn';
import type {
  EmergencyTriage,
  EncounterStatus,
  EncounterStatusName,
} from '../encounterTypes';

interface QueueStatusBadgeProps {
  status?: EncounterStatus;
  triage?: EmergencyTriage;
  className?: string;
}

const statusClass: Record<EncounterStatusName, string> = {
  walk_in_arrived:   'bg-info/15 text-info',
  registered:        'bg-muted text-muted-foreground',
  awaiting_vitals:   'bg-warning/15 text-warning',
  vitals_done:       'bg-success/15 text-success',
  awaiting_doctor:   'bg-warning/15 text-warning',
  in_consultation:   'bg-success/15 text-success',
  consultation_done: 'bg-muted text-muted-foreground',
  awaiting_billing:  'bg-warning/15 text-warning',
  paid:              'bg-info/15 text-info',
  lab_pending:       'bg-brandAccent/15 text-brandAccent',
  imaging_pending:   'bg-brandAccent/15 text-brandAccent',
  pharmacy_pending:  'bg-warning/15 text-warning',
  closed:            'bg-muted text-muted-foreground',
  booked:            'bg-info/15 text-info',
};

const statusLabel: Record<EncounterStatusName, string> = {
  walk_in_arrived:   'Arrived',
  registered:        'Registered',
  awaiting_vitals:   'Awaiting vitals',
  vitals_done:       'Vitals done',
  awaiting_doctor:   'Awaiting doctor',
  in_consultation:   'In consultation',
  consultation_done: 'Consultation done',
  awaiting_billing:  'Awaiting billing',
  paid:              'Paid',
  lab_pending:       'Lab pending',
  imaging_pending:   'Imaging pending',
  pharmacy_pending:  'Pharmacy pending',
  closed:            'Closed',
  booked:            'Booked',
};

const triageClass: Record<EmergencyTriage, string> = {
  green: 'bg-success/10 text-success border-success/30',
  yellow: 'bg-warning/10 text-warning border-warning/30',
  red: 'bg-danger/10 text-danger border-danger/50',
};

const triageLabel: Record<EmergencyTriage, string> = {
  green: 'Triage · Green',
  yellow: 'Triage · Yellow',
  red: 'Triage · Red',
};

/**
 * Statuses that mean "work happening right now" — get a breathing dot.
 * Terminal/neutral states stay static so the badge wall doesn’t shimmer.
 */
const breathingStatuses = new Set<EncounterStatusName>([
  'in_consultation',
  'awaiting_doctor',
  'awaiting_vitals',
  'awaiting_billing',
  'pharmacy_pending',
]);

const triageDotTone: Record<EmergencyTriage, string> = {
  red: 'bg-danger',
  yellow: 'bg-warning',
  green: 'bg-success',
};

const statusDotTone: Partial<Record<EncounterStatusName, string>> = {
  in_consultation:  'bg-success',
  awaiting_doctor:  'bg-warning',
  awaiting_vitals:  'bg-warning',
  awaiting_billing: 'bg-warning',
  pharmacy_pending: 'bg-warning',
};

export function QueueStatusBadge({
  status,
  triage,
  className,
}: QueueStatusBadgeProps): JSX.Element {
  if (triage) {
    // Red triage rings; yellow breathes; green stays calm.
    const showDot = triage !== 'green';
    const isAlert = triage === 'red';
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
          triageClass[triage],
          className,
        )}
      >
        {showDot && (
          <span className="relative inline-flex h-1.5 w-1.5 items-center justify-center">
            {isAlert && (
              <span
                aria-hidden="true"
                className={cn('absolute inline-flex h-1.5 w-1.5 rounded-full opacity-60 animate-breathe-ring', triageDotTone[triage])}
              />
            )}
            <span
              aria-hidden="true"
              className={cn('inline-flex h-1.5 w-1.5 rounded-full animate-breathe', triageDotTone[triage])}
            />
          </span>
        )}
        {triageLabel[triage]}
      </span>
    );
  }
  if (status) {
    const isLive = breathingStatuses.has(status.name);
    const dot = statusDotTone[status.name];
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
          statusClass[status.name],
          className,
        )}
        title={`State code ${status.code}`}
      >
        {isLive && dot && (
          <span aria-hidden="true" className={cn('inline-flex h-1.5 w-1.5 rounded-full animate-breathe', dot)} />
        )}
        {statusLabel[status.name]}
      </span>
    );
  }
  return <span className={className} />;
}
