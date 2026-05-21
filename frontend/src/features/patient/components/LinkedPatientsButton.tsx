import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/feedback/Spinner';
import { cn } from '@/utils/cn';
import { findLinkedPatients } from '../patientApi';
import type { LinkedPatient } from '../patientTypes';

interface LinkedPatientsButtonProps {
  /** UHID of the active patient. */
  uhid: string;
  /** Called when the doctor picks a linked patient. Typically navigates to that patient’s last encounter. */
  onSelect?: (linked: LinkedPatient) => void;
  className?: string;
}

const relationshipLabel: Record<LinkedPatient['relationship'], string> = {
  father: 'Father',
  mother: 'Mother',
  sibling: 'Sibling',
  child: 'Child',
  grandparent: 'Grandparent',
  other: 'Other',
};

/** Capitalise the free-text qualifier ("son" → "Son"). */
const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Display label combining the CHECK enum with the free-text qualifier. */
const relationshipDisplay = (lp: LinkedPatient): string =>
  lp.relationshipSpecific
    ? capitalise(lp.relationshipSpecific)
    : relationshipLabel[lp.relationship];

/**
 * Small popover button to reveal patients linked to the active patient
 * via patient_kin (TSD-03) or shared mobile (BRD §5 family lookup).
 *
 * Lists are read-only here; selecting one is the consumer’s call.
 */
export function LinkedPatientsButton({
  uhid,
  onSelect,
  className,
}: LinkedPatientsButtonProps): JSX.Element {
  const [open, setOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [patients, setPatients] = useState<LinkedPatient[] | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    const onClick = (e: MouseEvent): void => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // Lazy-load on first open. Re-fetch if patient changes between opens.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    findLinkedPatients(uhid)
      .then((res) => {
        if (alive) setPatients(res);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, uhid]);

  const count = patients?.length ?? 0;

  return (
    <div ref={popoverRef} className={cn('relative inline-block', className)}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Linked patients"
      >
        <Users className="h-3.5 w-3.5" /> Linked
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-80 overflow-hidden rounded-lg border bg-popover shadow-md">
          <header className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Linked patients {!loading && count > 0 ? `(${count})` : ''}
          </header>
          {loading && (
            <div className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted-foreground">
              <Spinner size="sm" label="Searching" /> Searching family + mobile…
            </div>
          )}
          {!loading && patients && patients.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
              No linked patients.
            </div>
          )}
          {!loading && patients && patients.length > 0 && (
            <ul className="max-h-72 overflow-auto divide-y">
              {patients.map((lp) => (
                <li key={lp.patient.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect?.(lp);
                      setOpen(false);
                    }}
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-muted"
                  >
                    <div className="flex w-full items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">{lp.patient.fullName}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {lp.patient.uhid}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {relationshipDisplay(lp)} · {lp.patient.gender.toUpperCase()} ·{' '}
                      {lp.patient.ageYears}y
                      {lp.sharedMobile ? ' · same mobile' : ''}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
