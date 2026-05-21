# pharmacy — Bounded Context

## Schema modules
[15 · Pharmacy](../../../../../../../../../../docs/03-schema/v3/modules/15-pharmacy.html)

## Depends on
- `platform` — UserQueryService (created_by)
- `patient` — PatientQueryService
- `inventory` — DrugStockQueryService (FEFO batch selection, stock deduction), DrugCatalogueQueryService
- `clinical` — PrescriptionQueryService (verify prescription items before dispensing)

## Owns
`pharmacy_sales`, `pharmacy_sale_items`,
`pharmacy_returns`, `pharmacy_return_items`

## Exposes to other packages
- `PharmacySaleQueryService` — get sale items for a given patient or prescription; used by billing to verify drug invoice lines

## MS split boundary
Extract after inventory. Pharmacy depends on inventory's DrugStockQueryService — that call is already an interface, so the swap to HTTP is mechanical. Keep pharmacy and inventory co-deployed until stock deduction latency under HTTP becomes an issue.

## Features
- [dispensing](dispensing/FEATURE.md) — pharmacy_sales, pharmacy_sale_items, FEFO dispensing, OTC vs prescription sale
- [returns](returns/FEATURE.md) — pharmacy_returns, pharmacy_return_items, refund payout via payments
