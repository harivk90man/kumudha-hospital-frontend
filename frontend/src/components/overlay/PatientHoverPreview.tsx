import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, AlertCircle, ShieldAlert, User } from 'lucide-react';
import type { PatientSummary } from '@/features/patient';
import { cn } from '@/utils/cn';

/**
 * Patient quick-preview popover. Wraps a patient name (or any inline
 * trigger) so hovering / focusing it surfaces a 280px context tile —
 * allergies, chronic conditions, contact, current queue state if any —
 * without forcing a page navigation.
 *
 * Calm by default: no fetch on render — uses the `patient` snapshot
 * already on the queue row. Fast to open, fast to dismiss, doesn’t
 * compete with the table itself for attention.
 *
 * Anchored below the trigger by default; flips to top-anchored when
 * near the viewport bottom (Radix-style behavior, but DIY since we
 * don’t pull a popover dep for one consumer).
 */

interface PatientHoverPreviewProps {
  patient: PatientSummary;
  /** Navigation target on click — e.g. `/patient/KH-…?op=…`. */
  navigateTo: string;
  /** Visible label/trigger content (typically the patient’s full name). */
  children: ReactNode;
  /** Open delay in ms — defaults to 250 so a mouse passing through
   *  doesn’t accidentally trigger the preview. */
  openDelayMs?: number;
}

export function PatientHoverPreview({
  patient,
  navigateTo,
  children,
  openDelayMs = 250,
}: PatientHoverPreviewProps): JSX.Element {
  const [open, setOpen] = useState<boolean>(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  const cancelTimers = (): void => {
    if (openTimer.current) window.clearTimeout(openTimer.current);
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  };

  const scheduleOpen = (): void => {
    cancelTimers();
    openTimer.current = window.setTimeout(() => setOpen(true), openDelayMs);
  };

  const scheduleClose = (): void => {
    cancelTimers();
    // Short close delay lets the cursor cross from trigger → popover
    // without a flicker (the popover element catches it).
    closeTimer.current = window.setTimeout(() => setOpen(false), 100);
  };

  useEffect(() => () => cancelTimers(), []);

  // Escape closes; outside-click closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent): void => {
      if (!wrapperRef.current) return;
      if (e.target instanceof Node && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <span
      ref={wrapperRef}
      className="relative inline-block"
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
    >
      <Link
        to={navigateTo}
        onFocus={() => setOpen(true)}
        onBlur={scheduleClose}
        className="rounded-sm hover:underline focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {children}
      </Link>
      {open && (
        <div
          role="dialog"
          aria-label={`Quick preview for ${patient.fullName}`}
          // Cursor moving from trigger into the popover should NOT
          // trigger the close timer — keep it open while the cursor
          // is over the popover too.
          onMouseEnter={cancelTimers}
          onMouseLeave={scheduleClose}
          className={cn(
            'absolute left-0 top-full z-40 mt-1 w-[280px] rounded-md border border-hairline bg-card p-3 text-left shadow-md',
          )}
        >
          {/* Header: name + UHID + demographics */}
          <div className="flex items-start gap-2">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <User className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="text-[13px] font-semibold leading-tight text-foreground">
                {patient.fullName}
              </div>
              <div className="font-mono text-xxs text-muted-foreground tabular-nums">
                {patient.uhid}
              </div>
              <div className="text-xxs text-muted-foreground">
                {patient.gender.toUpperCase()} · {patient.ageYears}y
                {patient.bloodGroup && ` · ${patient.bloodGroup}`}
              </div>
            </div>
          </div>

          {/* Allergies — red, scannable */}
          {(patient.allergies?.length ?? 0) > 0 && (
            <div className="mt-3 flex items-start gap-1.5 rounded-md border border-danger/30 bg-danger/5 px-2 py-1.5">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-danger" />
              <div className="min-w-0 flex-1">
                <div className="text-xxs font-semibold uppercase tracking-wider text-danger">
                  Allergies
                </div>
                <div className="text-[12px] text-danger">
                  {patient.allergies?.map((a) => a.allergen).join(', ')}
                </div>
              </div>
            </div>
          )}

          {/* Chronic conditions — neutral; one row each, max 3 visible */}
          {(patient.chronicConditions?.length ?? 0) > 0 && (
            <div className="mt-2">
              <div className="text-xxs font-semibold uppercase tracking-wider text-muted-foreground">
                Chronic
              </div>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {patient.chronicConditions?.slice(0, 3).map((c) => (
                  <span
                    key={c}
                    className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground"
                  >
                    {c}
                  </span>
                ))}
                {(patient.chronicConditions?.length ?? 0) > 3 && (
                  <span className="text-[11px] text-muted-foreground">
                    +{(patient.chronicConditions?.length ?? 0) - 3} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Phone */}
          {patient.mobile && (
            <div className="mt-2 text-[11px] text-muted-foreground">
              {patient.mobile}
            </div>
          )}

          {/* Footer — explicit "open the full page" affordance */}
          <div className="mt-3 flex justify-end border-t border-hairline pt-2">
            <Link
              to={navigateTo}
              className="inline-flex items-center gap-1 text-xxs font-medium text-primary hover:underline"
            >
              Open full profile <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {/* Subtle bottom-right corner cue when no clinical flags exist
              so the empty preview still feels operationally informative. */}
          {(patient.allergies?.length ?? 0) === 0 &&
            (patient.chronicConditions?.length ?? 0) === 0 && (
              <div className="absolute bottom-3 right-3 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <AlertCircle className="h-3 w-3" />
                No flags
              </div>
            )}
        </div>
      )}
    </span>
  );
}
