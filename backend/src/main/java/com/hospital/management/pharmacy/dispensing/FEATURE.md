# dispensing — Feature

## Package
[pharmacy](../MODULE.md)

## Tables
`pharmacy_sales`, `pharmacy_sale_items`

## Schema reference
[15 · Pharmacy](../../../../../../../../../../../docs/03-schema/v3/modules/15-pharmacy.html#pharmacy_sales)

## Business rules
- `sale_type` values: `prescription` (against a doctor's prescription), `otc` (over the counter, no prescription)
- FEFO batch selection is mandatory — `DrugStockQueryService.deductStock()` enforces it; pharmacy never picks batches manually
- `pharmacy_sale_items.prescription_item_id` links OTC-impossible items back to the prescription — required for Schedule H drugs
- `bill_discount_pct` and `bill_discount_amount` follow the same dual-column pattern as invoices — percentage or flat, not both
- A sale is finalized when `finalized_at` is set — no further items can be added; stock deduction happens at finalization
- Narcotic dispensing: if any `sale_item.drug_id` has `is_narcotic = true`, a `narcotic_register` entry is written in the same transaction

## API endpoints
_To be defined during implementation._

## Known constraints
- Stock deduction and sale finalization are a single DB transaction — partial failure rolls back both
- `pharmacy_sale_items.batch_id` (drug_stock row) must be the FEFO-selected batch — validated before commit
