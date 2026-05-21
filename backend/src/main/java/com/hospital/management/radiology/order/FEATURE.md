# order — Feature

## Package
[radiology](../MODULE.md)

## Tables
`radiology_orders`, `radiology_attachments`, `radiology_reports`

## Schema reference
[13 · Radiology](../../../../../../../../../../../docs/03-schema/v3/modules/13-radiology.html#radiology_orders)

## Business rules
- One `radiology_orders` row per procedure per ordering event — a doctor ordering CT + X-Ray creates two rows
- Order status lifecycle: `pending` → `scheduled` → `acquired` → `reported` | `cancelled`
- `radiology_attachments` stores the actual image/PDF files as `bytea` — one or more attachments per order
- `radiology_reports` is the radiologist's written report — linked to the order; one active report per order (soft-delete old if corrected)
- A report cannot be released until at least one attachment exists for that order
- Self-approval (radiologist reports their own images) controlled by `system_config` flag `radiology.allow_self_approval`

## API endpoints
_To be defined during implementation._

## Known constraints
- `file_data bytea` in `radiology_attachments` — for Phase 1 volume this is acceptable; migrate to object storage at scale
- `RadiologyOrderQueryService.getOrdersForVisit(opVisitId)` is the cross-package interface used by billing
