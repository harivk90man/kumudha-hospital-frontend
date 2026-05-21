# Radiology feature

Maps to schema v2 module **13-radiology**.

## Purpose
Radiology test catalog + order placement. Mirrors `lab/` shape — same `OrderStatus` lifecycle (re-exported from `@/features/lab`).

## How to run
- `fetchRadiologyCatalog()` → orderable studies.
- `placeRadiologyOrder(encounterNo, testIds)` → place radiology orders.

## DB tables / entities (schema v2)
- `radiology_test_catalog`, `radiology_order`, `radiology_order_item`, `radiology_report`

## Known issues / limitations
- Catalog is a hard-coded mock.
- No PACS / image viewer hookup yet.

## Planned improvements
- [ ] Radio-tech workspace (`apps/radiologyTech`).
- [ ] Report entry with template support.
- [ ] DICOM viewer link from results.
