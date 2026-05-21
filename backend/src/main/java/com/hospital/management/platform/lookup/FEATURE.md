# lookup — Feature

## Package
[platform](../MODULE.md)

## Tables
`allergies_lookup`, `chronic_conditions_lookup`

## Schema reference
[06 · Platform Lookups](../../../../../../../../../../../docs/03-schema/v3/modules/06-platform-lookups.html)

## Business rules
- Lookup tables are reference data — rows are seeded by Flyway, updated rarely
- Soft-delete only — never hard-delete a lookup row that has child references in `patient_allergies` or `patient_chronic_conditions`
- `LookupQueryService` exposes read-only access; other packages never write to these tables

## API endpoints
_To be defined during implementation._

## Known constraints
- Cache lookup tables in-memory at startup (small tables, rarely change)
- Standardised codes (e.g. ICD-10 for conditions) stored in `standard_code` column — used for future interoperability exports
