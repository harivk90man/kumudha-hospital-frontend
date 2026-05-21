# catalogue — Feature

## Package
[radiology](../MODULE.md)

## Tables
`radiology_procedures`

## Schema reference
[13 · Radiology](../../../../../../../../../../../docs/03-schema/v3/modules/13-radiology.html#radiology_procedures)

## Business rules
- `radiology_procedures` is the catalogue of available imaging procedures (X-Ray, CT, MRI, USG, etc.)
- Each procedure is linked to a `services` row in billing for pricing — `service_id` FK is required (RESTRICT)
- Soft-deleting a procedure does not affect existing orders — RESTRICT FK prevents hard delete if orders exist
- `modality` values: `xray`, `ct`, `mri`, `usg`, `echo`, `mammography`, `fluoroscopy`, `other`
- `body_part` is free text — standardised values seeded by Flyway but not enforced by CHECK (evolves over time)

## API endpoints
_To be defined during implementation._

## Known constraints
- Procedure catalogue is seeded by Flyway; additions via data-entry UI
- `preparation_instructions` (text) is printed on the patient instruction slip at order time
