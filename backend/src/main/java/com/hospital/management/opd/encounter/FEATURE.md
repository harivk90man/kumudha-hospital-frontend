# encounter — Feature

## Package
[opd](../MODULE.md)

## Tables
`op_visits`, `patient_queue`

## Schema reference
[10 · Encounter](../../../../../../../../../../../docs/03-schema/v3/modules/10-encounter.html)

## Business rules
- One `op_visits` row per patient visit per doctor per day — the anchor for all clinical activity in that visit
- `op_visits.status` lifecycle: `waiting` → `in_progress` → `completed` | `no_show` | `cancelled`
- `patient_queue` is the live queue view — one row per active op_visit per doctor; position derived from `token_number`
- An op_visit cannot be marked `completed` if the patient has an unpaid invoice — billing clears the block via `InvoiceQueryService`
- `op_visits` links to an optional `appointment_id` — walk-ins have NULL appointment_id

## API endpoints
_To be defined during implementation._

## Known constraints
- `op_visits` is the FK target for `consultations`, `lab_orders`, `radiology_orders`, `invoices` — do not hard-delete an op_visit without cascading all downstream records
- `patient_queue` is a derived table; kept in sync by triggers on `op_visits` status changes
