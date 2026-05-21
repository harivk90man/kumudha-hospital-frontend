# Inventory app

Back-office stock-room shell for the Inventory clerk role. Distinct from
the front-of-house **Pharmacy** app (which dispenses to patients).

## Routes

| Path | Page | Notes |
|------|------|-------|
| `/inventory/login` | LoginPage | Mock login on `inv.*` prefix. |
| `/inventory/dashboard` | DashboardPage | KPI tiles + recent GRNs + top expiring batches. |
| `/inventory/medicines` | MedicinesPage | Medicine catalog table with severity filter. |
| `/inventory/batches` | BatchesPage | Batch-level view with expiring filter (30/60/90/past) + totals strip. |
| `/inventory/suppliers` | SuppliersPage | Supplier cards with GSTIN, contact, outstanding balance. |
| `/inventory/grn` | GrnPage | GRN list + multi-line "Receive goods" sheet. |

## Spec mapping (TSD-10)
- `medicines` (catalog)
- `medicine_batches` (FEFO source — server enforces at dispense)
- `suppliers`
- `goods_receive_notes` + `grn_lines` (created together via `createGrn`)

## Workflow
1. Goods arrive → clerk opens **Receive goods** sheet.
2. Pick supplier + supplier-invoice no.
3. Add one line per batch: medicine, batch no., MFG/EXP date, quantity, unit cost, sell price.
4. Submit → server inserts GRN header + one batch row per line + bumps
   `medicines.available_qty`. FEFO consumption happens later at dispense.

## Features consumed
- `auth` — `inventory_clerk` guard.
- `inventory` — full back-office surface (`fetchMedicines`, `fetchMedicineBatches`, `fetchSuppliers`, `fetchGrns`, `createGrn`).

## Components consumed
- `<Card>`, `<CardHeader/Title/Label>` (layout)
- `<Breadcrumb>`, `<DashboardStatCard>`, `<StatusPill>` (data-display)
- `<FormInput>`, `<FormSelect>` (form)
- `<Spinner>`, `<EmptyState>` (feedback)
- `<TablePagination>` (data-display)
- `<SettingsSheet>` (overlay)

## Known issues / limitations
- All writes are mocks — refresh resets state.
- No medicine catalog editing (add / discontinue) — Platform-admin job.
- No purchase-order (PO) workflow yet — clerk records GRN against any
  supplier-invoice number; PO matching is a follow-up.
- No supplier-payment ledger UX — outstanding balance is read-only.
- No batch hold / quarantine / recall flow.

## Planned improvements
- [ ] PO → GRN matching workflow.
- [ ] Supplier payment recording + ledger.
- [ ] Batch quarantine / recall + audit reason.
- [ ] Stock-adjustment workflow (write-off, damage, theft).
- [ ] Print barcode labels for new batches.
