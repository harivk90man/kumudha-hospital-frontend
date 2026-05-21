# radiology — Bounded Context

## Schema modules
[13 · Radiology](../../../../../../../../../../docs/03-schema/v3/modules/13-radiology.html)

## Owns
`radiology_procedures`, `radiology_orders`,
`radiology_attachments`, `radiology_reports`

## Depends on
- `platform` — UserQueryService (ordered_by, reported_by, created_by)
- `patient` — PatientQueryService
- `opd` — OpVisitQueryService (link order to visit)
- `clinical` — ConsultationQueryService (link order to consultation)

## Exposes to other packages
- `RadiologyOrderQueryService` — get radiology orders for a given op_visit or consultation; used by billing to create invoice lines

## MS split boundary
Extract as a **radiology service** independently — clean boundary, same shape as lab. If a PACS or external radiology system integration is added, this is the natural seam.

## Features
- [catalogue](catalogue/FEATURE.md) — radiology_procedures catalogue management
- [order](order/FEATURE.md) — radiology_orders, radiology_attachments, radiology_reports, report workflow
