import { ShieldAlert } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { PatientAllergy } from '@/features/patient';
import type { Medicine } from '../inventoryTypes';

interface AllergyAlertBannerProps {
  match: PatientAllergy;
  medicine: Pick<Medicine, 'name' | 'genericName' | 'drugClass'>;
  className?: string;
}

/**
 * Doctor-facing warning when the chosen medicine’s drug class matches a
 * recorded patient allergy. TSD-03 §4.6 / TSD-10 §4.2 — warn, do not block.
 * The doctor can still proceed; clinical override stays their judgement.
 */
export function AllergyAlertBanner({
  match,
  medicine,
  className,
}: AllergyAlertBannerProps): JSX.Element {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger',
        className,
      )}
    >
      <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <div className="flex flex-col gap-0.5">
        <span className="font-semibold">
          Allergy alert — patient is allergic to {match.allergen}.
        </span>
        <span className="text-xs">
          {medicine.name} ({medicine.genericName}) is in the{' '}
          <strong>{medicine.drugClass}</strong> class. Choose an alternative or proceed
          with clinical justification.
        </span>
      </div>
    </div>
  );
}
