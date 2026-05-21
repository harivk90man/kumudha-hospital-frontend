# merge — Feature

## Package
[patient](../MODULE.md)

## Tables
`patient_merges`

## Schema reference
[07 · Patient](../../../../../../../../../../../docs/03-schema/v3/modules/07-patient.html#patient_merges)

## Business rules
- Merge makes a secondary patient's `status = 'merged'` and points all clinical/billing records to the primary patient
- `patient_merges.before_state` (jsonb) snapshots the secondary patient row before merge — required for unmerge
- Unmerge requires L2 founder approval; executed via `sp_unmerge_patient(merge_id)` stored procedure
- After merge, any lookup of the secondary UHID must redirect to the primary — `PatientQueryService` checks `patient_merges` before returning
- Only one active merge allowed per patient — a merged patient cannot be merged again

## API endpoints
_To be defined during implementation._

## Known constraints
- Merge is implemented as a DB transaction in a stored procedure — not in application code — to ensure atomicity across all affected tables
- `patient_mergeable_tables` registry (maintained in DB) lists all tables where `patient_id` must be rewritten on merge
