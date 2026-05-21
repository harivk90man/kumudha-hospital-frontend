# records — Feature

## Package
[patient](../MODULE.md)

## Tables
`patient_allergies`, `patient_chronic_conditions`

## Schema reference
[07 · Patient](../../../../../../../../../../../docs/03-schema/v3/modules/07-patient.html#patient_allergies)

## Business rules
- `patient_allergies.allergy_id` references `allergies_lookup` — free-text allergies not allowed; must be a catalogue entry
- `patient_chronic_conditions.condition_id` references `chronic_conditions_lookup` — same constraint
- Both tables use soft-delete; a resolved condition uses `is_resolved = true` + `resolved_date`, not deletion
- Only one active (non-deleted) row per `(patient_id, allergy_id)` — partial unique index enforces this
- Severity values for allergies: `mild`, `moderate`, `severe`, `life_threatening`

## API endpoints
_To be defined during implementation._

## Known constraints
- Both tables cascade-delete when the parent `patients` row is hard-deleted (rare admin operation)
- `recorded_by` references `users(id)` SET NULL — allergy records survive user deactivation
