# vitals — Feature

## Package
[clinical](../MODULE.md)

## Tables
`vitals`

## Schema reference
[11 · Consultation](../../../../../../../../../../../docs/03-schema/v3/modules/11-consultation.html#vitals)

## Business rules
- Multiple vitals rows are allowed per op_visit (re-check after treatment); display the latest
- Vitals are recorded by nursing staff before the doctor sees the patient — `recorded_by` is typically a nurse role
- All vitals columns are nullable — only the fields actually measured are populated; no zeroes for unmeasured values
- BMI is a generated column (`weight_kg / (height_cm/100)^2`) — never set directly
- Critical thresholds (e.g. SpO2 < 90) are checked at application level and flagged in the response — not enforced by DB constraints

## API endpoints
_To be defined during implementation._

## Known constraints
- Vitals are read via JdbcTemplate for the consultation summary view (JOIN with op_visit, patient)
- No soft-delete on vitals — incorrect entry is corrected by recording a new row, not editing the old one
