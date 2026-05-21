# Patient feature

Maps to schema v2 module **07-patient**.

## Purpose
Patient identity types and shared presentation. Owned by every screen that shows a patient header / summary.

## How to run
- `<PatientSummaryCard patient={...} />` — card with demographics, allergies, chronic conditions.
- `import type { PatientSummary } from '@/features/patient'` — the canonical patient shape.

## DB tables / entities (schema v2)
- `patient`, `patient_identifier`, `patient_address`, `patient_kin`, `patient_consent`, `patient_consent_event`

## Known issues / limitations
- Search/registration UI not yet built (see appointments + journey features when scaffolded).
- `Iso8601` and `Uuid` aliases re-exported here for convenience; if a third feature needs them outside auth/patient, hoist to `src/types/`.

## Planned improvements
- [ ] Patient search component.
- [ ] Patient registration form.
- [ ] Allergy / chronic condition editors.
