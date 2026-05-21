import React from 'react';
import { ArrowLeft, CalendarClock, Phone, ShieldAlert, User2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';
import { LinkedPatientsButton, type PatientSummary, type LinkedPatient } from '@/features/patient';

interface PatientContextHeaderProps {
  patient: PatientSummary;
  opNumber: string;
  backTo?: string;
  /**
   * Optional label rendered next to the back-arrow chevron. Without it the
   * back button is icon-only — fine for "go up one level," but for "return
   * to your live consultation" the user needs words.
   */
  backLabel?: string;
  /** Click handler when the doctor picks a linked patient from the popover. */
  onSelectLinkedPatient?: (linked: LinkedPatient) => void;
  /**
   * When set, the header renders a prominent "Past visit · <date>" strip
   * above the patient row so the doctor can never confuse a historical
   * encounter with the current one.
   */
  pastVisitDate?: string | null;
  /**
   * When set on a past visit, the strip surfaces a "Return to current
   * consultation OP-XXX" CTA on its right side so the doctor doesn't have
   * to find the bottom footer.
   */
  returnToCurrent?: { opNumber: string; to: string };
  /**
   * Optional rendered vitals row shown as a compact accent band at the
   * bottom of the header. Pass a pre-rendered <VitalsStrip> from the
   * consultation layer — keeps type boundaries clean.
   */
  vitalsSlot?: React.ReactNode;
  className?: string;
}

const formatLongDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

/**
 * Sticky header for any per-encounter screen (consultation, dispensing,
 * report review, billing). Shows patient identity + the active op_number.
 */
export function PatientContextHeader({
  patient,
  opNumber,
  backTo,
  backLabel,
  onSelectLinkedPatient,
  pastVisitDate,
  returnToCurrent,
  vitalsSlot,
  className,
}: PatientContextHeaderProps): JSX.Element {
  return (
    <header
      className={cn(
        'sticky top-0 z-20 flex flex-col border-b bg-card/95 backdrop-blur',
        className,
      )}
    >
      {pastVisitDate && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-amber-900 dark:text-amber-200 md:px-6">
          <span className="inline-flex items-center gap-2">
            <CalendarClock className="h-4 w-4 flex-shrink-0" />
            <span className="text-sm font-semibold tracking-tight">
              Past visit · {formatLongDate(pastVisitDate)}
            </span>
          </span>
          {returnToCurrent && (
            <Button
              asChild
              size="sm"
              variant="outline"
              className="border-amber-500/40 bg-card/60 text-amber-900 hover:bg-card/90 dark:text-amber-200"
            >
              <Link to={returnToCurrent.to}>
                <ArrowLeft className="h-3.5 w-3.5" />
                Return to current consultation {returnToCurrent.opNumber}
              </Link>
            </Button>
          )}
        </div>
      )}
      <div className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        {backTo && (
          <Button
            asChild
            variant="ghost"
            size={backLabel ? 'sm' : 'icon'}
            aria-label={backLabel ?? 'Back'}
          >
            <Link to={backTo}>
              <ArrowLeft className="h-4 w-4" />
              {backLabel && <span>{backLabel}</span>}
            </Link>
          </Button>
        )}
        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <User2 className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="truncate text-base font-semibold leading-tight md:text-lg">
              {patient.fullName}
            </h2>
            <span className="text-xs text-muted-foreground">
              {patient.gender.toUpperCase()} · {patient.ageYears}y
            </span>
            {patient.bloodGroup && (
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground">
                {patient.bloodGroup}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="font-mono">{patient.uhid}</span>
            <span className="hidden md:inline">·</span>
            <span>OP {opNumber}</span>
            <span className="hidden md:inline">·</span>
            <span className="inline-flex items-center gap-1">
              <Phone className="h-3 w-3" /> {patient.mobile}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <LinkedPatientsButton uhid={patient.uhid} onSelect={onSelectLinkedPatient} />

        {(patient.allergies?.length ?? 0) > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-danger/30 bg-danger/10 px-2.5 py-1.5 text-xs text-danger">
            <ShieldAlert className="h-3.5 w-3.5 flex-shrink-0" />
            <span>
              <strong className="font-semibold">Allergies:</strong>{' '}
              {patient.allergies?.map((a) => a.allergen).join(', ')}
            </span>
          </div>
        )}
      </div>
      </div>

      {/* Vitals accent band — always visible as header is sticky */}
      {vitalsSlot && (
        <div className="flex items-center gap-4 border-t border-hairline bg-primary/[0.04] px-4 py-1.5 md:px-6">
          {vitalsSlot}
        </div>
      )}
    </header>
  );
}
