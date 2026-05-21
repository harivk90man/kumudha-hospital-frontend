/**
 * Cross-check helper for the prescribing-time allergy alert.
 *
 * TSD-03 §4.6 / TSD-10 §4.2 wire it like this:
 *   `patients.allergies` (text[]) — joined to `allergies_lookup` to resolve
 *   each label’s `drug_class_code`. At prescribe time, the doctor’s chosen
 *   medicine carries `medicines.drug_class`. If the codes match, the doctor
 *   is warned (BRD pharmacy-rules — warn-not-block; the override audit
 *   chain stays the stock one).
 */
import type { PatientAllergy } from '@/features/patient';
import type { Medicine } from './inventoryTypes';

/** Returns the matched allergy if the medicine’s drug class is on the patient’s allergy list, else null. */
export function findAllergyMatch(
  allergies: PatientAllergy[],
  medicine: Pick<Medicine, 'drugClass'>,
): PatientAllergy | null {
  if (!medicine.drugClass) return null;
  return allergies.find((a) => a.drugClassCode && a.drugClassCode === medicine.drugClass) ?? null;
}
