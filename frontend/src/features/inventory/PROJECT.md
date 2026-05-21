# Inventory feature

Maps to schema v2 module **14-inventory**.

## Purpose
Medicine catalog, stock levels, severity classification, and stock-alert presentation. Read by `consultation` (prescription builder honours `severity`) and the doctor dashboard. Will be written-to by the future `apps/pharmacist` shell (GRN, dispensing, transfers).

## How to run
- `searchMedicines(query)` → autocomplete-style medicine search.
- `fetchPharmacyAlerts()` → list of stock issues for dashboard banners.
- `<MedicineAvailabilityBadge severity={...} />`, `<StockWarningBanner ... />`, `<PharmacyStockAlertCard alerts={...} />`.

## DB tables / entities (schema v2)
- `medicine_master`, `medicine_form`, `inventory_batch`, `inventory_stock`, `inventory_movement`, `inventory_alert`

## Known issues / limitations
- Severity is server-precomputed in mock data; production should expose a single endpoint that returns the latest severity per medicine.
- Stock-blocking rule is currently "warn for low/near-expiry, block for expired/out-of-stock" — wired in `consultation/PrescriptionBuilder`.

## Planned improvements
- [ ] GRN / dispensing flows in `apps/pharmacist`.
- [ ] Batch / FEFO logic in catalog responses.
- [ ] Real-time stock subscriptions via `lib/ws/`.
