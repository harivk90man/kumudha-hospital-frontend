# prescription — Feature

## Package
[clinical](../MODULE.md)

## Tables
`prescriptions`, `prescription_items`

## Schema reference
[11 · Consultation](../../../../../../../../../../../docs/03-schema/v3/modules/11-consultation.html#prescriptions)

## Business rules
- One prescription per consultation — linked via `consultation_id` (unique)
- `prescription_items` cascade-delete when the parent `prescriptions` row is hard-deleted — but only if no `pharmacy_sale_items` reference those items (RESTRICT blocks the delete)
- `dispensed_quantity` is updated by pharmacy on each dispensing event — never set by clinical code
- A prescription item is fully dispensed when `dispensed_quantity >= quantity`; partially dispensed otherwise
- Prescription is locked when the parent consultation is locked — no new items can be added after lock

## API endpoints
_To be defined during implementation._

## Known constraints
- `PrescriptionQueryService.getDispensableItems(consultationId)` is the sole cross-package entry point — pharmacy calls this to validate items before dispensing
- `drug_id` on prescription items references `drug_catalogue` — resolved at prescription time; name snapshot stored in `drug_name` column
