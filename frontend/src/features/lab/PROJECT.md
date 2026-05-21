# Lab feature

Maps to schema v2 module **12-lab**.

## Purpose
Lab test catalog + lab order placement. Used by `consultation` (doctor places orders) and will be used by the future `apps/labTech` (sample collection, result entry).

## How to run
- `fetchLabCatalog()` → list of orderable tests.
- `placeLabOrder(encounterNo, testIds)` → create lab orders against an encounter.
- `OrderStatus` is shared with radiology — both modules use the same lifecycle (`ORDERED → SAMPLE_COLLECTED → IN_PROGRESS → REPORTED | CANCELLED`).

## DB tables / entities (schema v2)
- `lab_test_catalog`, `lab_order`, `lab_order_item`, `lab_sample`, `lab_result`, `lab_result_value`

## Known issues / limitations
- Catalog is a small hard-coded mock; real catalog will be department-scoped and tariff-aware.
- No result-entry UI — that's `apps/labTech` work.

## Planned improvements
- [ ] Lab tech workspace (`apps/labTech`).
- [ ] Result entry forms with reference ranges.
- [ ] Critical-value escalation flow.
