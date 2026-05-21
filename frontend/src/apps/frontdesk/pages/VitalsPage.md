# VitalsPage (front-desk · nurse)

**File:** [VitalsPage.tsx](VitalsPage.tsx) · **Route:** `/frontdesk/vitals` · **Auth:** required

## Purpose
Nurse vitals capture per BRD §1 steps 6-7. Two-pane layout:

- **Left:** queue of patients in state `120 awaiting_vitals` (sorted by arrived-at).
- **Right:** vitals form for the selected patient — BP, pulse, temperature, SpO₂,
  RR, weight, height (BMI auto), blood-sugar (random / fasting), pain score, notes,
  plus a chief-complaint field that updates `op_visits.chief_complaint`.

On submit:
1. `recordVitals(opNumber, payload)` → inserts into `vitals`.
2. `transitionEncounterState(opNumber, 'awaiting_doctor')` (server applies the
   real journey: 120 → 130 vitals_done → 140 awaiting_doctor).
3. Toast confirmation; patient drops out of the vitals queue and appears on the
   doctor's queue.

## Sections
| Section | Notes |
|---------|-------|
| Vitals queue (left) | Patients in `awaiting_vitals` (state 120). Click selects; selected gets a primary-tinted border. Allergy pill flags on relevant rows. |
| Capture form (right) | All `vitals` columns from schema 050 in a 3-column grid (BP, pulse, temp, SpO₂, RR, weight, height, BMI auto, blood sugar random/fasting, pain). Chief complaint + notes underneath. |
| BMI display | Read-only, derived in real time via `useWatch` from weight + height. Server still computes the stored column. |
| Allergy banner | Red banner above the form when `patient.allergies.length > 0` — same component pattern as the doctor's `PatientContextHeader`. |
| Submit | `recordVitals` → `transitionEncounterState(opNumber, 'awaiting_doctor')` → reload queue → form clears. |

## Schemas
- [vitalsSchema.ts](../schemas/vitalsSchema.ts) — zod with `optionalNumber` coercion + bounds check on `spo2` and `painScore`.

## Data
- `fetchQueue({ status: 'awaiting_vitals' })` from `@/features/encounter`.
- `recordVitals(opNumber, VitalsCaptureInput)` from `@/features/encounter`.
- `transitionEncounterState(opNumber, 'awaiting_doctor')` from `@/features/encounter`.

## Spec mapping
- Schema 050 `vitals` table; column names match the `VitalsCaptureInput` shape 1:1.
- TSD-04 patient_states 120 → 130 → 140 transition.
- Schema 030 `op_visits.chief_complaint` updated alongside vitals (BRD §1 step 7).
