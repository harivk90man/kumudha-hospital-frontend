# inventory — Bounded Context

## Schema modules
[14 · Inventory](../../../../../../../../../../docs/03-schema/v3/modules/14-inventory.html)

## Owns
`vendors`, `vendor_contacts`,
`drug_catalogue`, `drug_stock`, `drug_stock_ledger`,
`purchase_orders`, `purchase_order_items`,
`narcotic_register`

## Depends on
- `platform` — UserQueryService (created_by, approved_by), ConfigService (low_stock_threshold behaviour)

## Exposes to other packages
- `DrugStockQueryService` — look up available stock for a drug (FEFO order); deduct stock atomically when pharmacy dispenses; return DrugStockSummary (drug_id, batch_id, quantity_available, selling_price, expiry_date)
- `DrugCatalogueQueryService` — look up drug by ID or code; used by pharmacy and billing for name snapshots

## MS split boundary
Extract as an **inventory / supply chain service** independently — no patient or clinical data. Pharmacy switches DrugStockQueryService to an HTTP client. Narcotics register access becomes a secured endpoint.

## Features
- [vendor](vendor/FEATURE.md) — vendors, vendor_contacts
- [drug](drug/FEATURE.md) — drug_catalogue, master drug data management
- [stock](stock/FEATURE.md) — drug_stock (batches), drug_stock_ledger, FEFO deduction
- [purchase](purchase/FEATURE.md) — purchase_orders, purchase_order_items, L2 approval workflow
- [narcotic](narcotic/FEATURE.md) — narcotic_register, schedule H/H1 drug tracking
