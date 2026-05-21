# catalogue — Feature

## Package
[lab](../MODULE.md)

## Tables
`lab_tests`, `lab_test_groups`, `lab_test_group_items`

## Schema reference
[12 · Lab](../../../../../../../../../../../docs/03-schema/v3/modules/12-lab.html#lab_tests)

## Business rules
- `lab_tests` are the atomic billable units; `lab_test_groups` (panels) bundle multiple tests billed as one line
- A test can belong to multiple groups — `lab_test_group_items` is the M:N bridge
- `lab_tests.reference_range` is stored in a child table `lab_test_reference_ranges` — supports age/gender/demographic splits
- Soft-deleting a `lab_test` does not remove existing `lab_order_items` referencing it — RESTRICT FK prevents hard delete if orders exist
- `turnaround_hours` on `lab_tests` drives TAT SLA alerts (future alert_rules feature)

## API endpoints
_To be defined during implementation._

## Known constraints
- Lab catalogue is seeded by Flyway migration for common tests; additions go through a data-entry UI (not code changes)
- `lab_test_groups` linked to a `services` row in billing for panel pricing
