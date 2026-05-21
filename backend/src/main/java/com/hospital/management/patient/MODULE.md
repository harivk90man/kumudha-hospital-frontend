# patient — Bounded Context

## Schema modules
[07 · Patient](../../../../../../../../../../docs/03-schema/v3/modules/07-patient.html)

## Owns
`patients`, `patient_govt_ids`, `patient_merges`,
`patient_allergies`, `patient_chronic_conditions`

## Depends on
- `platform` — UserQueryService (created_by resolution), LookupQueryService (allergy / condition codes)

## Exposes to other packages
- `PatientQueryService` — look up patient by ID or UHID, verify active (not merged), return PatientSummary DTO
- `PatientMergeQueryService` — check if a patient ID is a secondary (merged-away) record

All other packages hold only `patient_id` (UUID). They never import `Patient.java` directly.

## MS split boundary
Extract as a **patient master service** second (after platform). Patient identity is referenced everywhere but this package has minimal upstream deps. Extraction exposes a `/patients/{id}` REST endpoint; downstream packages switch PatientQueryService to an HTTP client.

## Features
- [registration](registration/FEATURE.md) — patients, patient_govt_ids, UHID generation
- [merge](merge/FEATURE.md) — patient_merges, merge + unmerge workflow
- [records](records/FEATURE.md) — patient_allergies, patient_chronic_conditions
