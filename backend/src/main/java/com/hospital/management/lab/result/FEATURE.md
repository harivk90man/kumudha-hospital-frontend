# result — Feature

## Package
[lab](../MODULE.md)

## Tables
`lab_results`

## Schema reference
[12 · Lab](../../../../../../../../../../../docs/03-schema/v3/modules/12-lab.html#lab_results)

## Business rules
- One `lab_results` row per `lab_order_items` row — result for each individual test
- `is_critical` flag triggers an immediate notification to the ordering doctor — checked at application level on result entry
- An override result (correcting a released result) creates a NEW row with `is_override = true` and links to `original_result_id` — the original row is never modified
- `released_at` and `released_by` are set when status moves to `released`; before release only lab staff can view
- Reference range comparison (`result_value` vs `range_low` / `range_high`) is done at application level — result row stores the computed `flag` (`L`, `H`, `N`, `LL`, `HH`)

## API endpoints
_To be defined during implementation._

## Known constraints
- Doctors can view results only after `released_at` is set — enforced by row-level security in application layer
- Override results emit domain event `LabResultOverrideReleased` in addition to `LabResultReleased`
