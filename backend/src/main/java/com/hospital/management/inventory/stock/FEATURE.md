# stock — Feature

## Package
[inventory](../MODULE.md)

## Tables
`drug_stock`, `drug_stock_ledger`

## Schema reference
[14 · Inventory](../../../../../../../../../../../docs/03-schema/v3/modules/14-inventory.html#drug_stock)

## Business rules
- `drug_stock` is one row per physical batch (GRN + expiry date combination) — not one row per drug
- `quantity_available` is the live count — updated by `drug_stock_ledger` entries via trigger; never set directly
- FEFO dispensing: always pick the batch with the earliest `expiry_date` that has `quantity_available > 0`
- `drug_stock_ledger` is append-only — records every stock movement (receipt, dispensing, return, adjustment, expiry write-off)
- `movement_type` values: `receipt`, `dispensing`, `return`, `adjustment`, `expiry_writeoff`, `transfer`
- `quantity_before` + `quantity_delta` = `quantity_after` — enforced by CHECK; `quantity_after >= 0` enforced by CHECK

## API endpoints
_To be defined during implementation._

## Known constraints
- `DrugStockQueryService.deductStock(drugId, quantity, actorId)` acquires a row-level lock on the batch row before deducting — prevents overselling under concurrent dispensing
- `drug_stock_ledger` is written via JdbcTemplate only — never Hibernate (append-only, no lifecycle management)
