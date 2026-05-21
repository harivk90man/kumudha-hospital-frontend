# returns — Feature

## Package
[pharmacy](../MODULE.md)

## Tables
`pharmacy_returns`, `pharmacy_return_items`

## Schema reference
[15 · Pharmacy](../../../../../../../../../../../docs/03-schema/v3/modules/15-pharmacy.html#pharmacy_returns)

## Business rules
- `pharmacy_returns` links back to the original `pharmacy_sales` row — full traceability to the original sale
- `return_reason` values: `patient_request`, `wrong_drug`, `wrong_quantity`, `adverse_reaction`, `admitted_patient`
- Returned stock is added back to `drug_stock` via a `drug_stock_ledger` entry of type `return` — same batch, not a new batch
- Refund is processed as a `payments` row with `payment_direction = 'out'` and `pharmacy_return_id` FK — not a credit note
- A return cannot exceed the original sale quantity — enforced by CHECK on `pharmacy_return_items.returned_quantity`
- Partial returns are allowed — return only some items from the original sale

## API endpoints
_To be defined during implementation._

## Known constraints
- Stock reversal and refund payment are one transaction — both succeed or both roll back
- Returned narcotics write a `narcotic_register` entry of type `return` — same as dispensing enforcement
