# drug — Feature

## Package
[inventory](../MODULE.md)

## Tables
`drug_catalogue`

## Schema reference
[14 · Inventory](../../../../../../../../../../../docs/03-schema/v3/modules/14-inventory.html#drug_catalogue)

## Business rules
- `drug_catalogue` is the master list of drugs — one row per generic drug formulation
- `drug_code` is the hospital's internal code — unique, used on prescription and dispensing forms
- `is_narcotic` flag links to mandatory `narcotic_register` entries on dispensing
- `low_stock_threshold` and `max_stock_threshold` are catalogue-level defaults; actual stock is in `drug_stock`
- Soft-deleting a drug from catalogue does not affect existing batches or prescriptions — only blocks new purchase orders

## API endpoints
_To be defined during implementation._

## Known constraints
- `DrugCatalogueQueryService` exposes read-only access — other packages (pharmacy, billing) never write to this table
- `generic_name` + `strength` + `form` combination is effectively unique — partial unique index enforces (WHERE deleted_at IS NULL)
