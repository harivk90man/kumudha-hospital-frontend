# lab — Bounded Context

## Schema modules
[12 · Lab](../../../../../../../../../../docs/03-schema/v3/modules/12-lab.html)

## Owns
`lab_tests`, `lab_test_groups`, `lab_test_group_items`,
`lab_orders`, `lab_order_items`, `lab_samples`, `lab_results`

## Depends on
- `platform` — UserQueryService (ordered_by, performed_by, created_by)
- `patient` — PatientQueryService
- `opd` — OpVisitQueryService (link order to visit)
- `clinical` — ConsultationQueryService (link order to consultation)

## Exposes to other packages
- `LabOrderQueryService` — get lab order items for a given op_visit or consultation; used by billing to create invoice lines

## MS split boundary
Extract as a **lab / diagnostics service** independently — it has a clean boundary (orders in, results out). Billing switches LabOrderQueryService to an HTTP client. Good candidate for early extraction if an external LIS integration is needed.

## Features
- [catalogue](catalogue/FEATURE.md) — lab_tests, lab_test_groups, lab_test_group_items, reference ranges
- [order](order/FEATURE.md) — lab_orders, lab_order_items, ordering workflow
- [sample](sample/FEATURE.md) — lab_samples, sample collection and tracking
- [result](result/FEATURE.md) — lab_results, result entry, critical flag, override workflow
