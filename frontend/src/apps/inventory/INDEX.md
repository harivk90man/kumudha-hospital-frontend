# Inventory app — map

Inventory clerk (back-office stock-room) shell. Mounted at `/inventory/*`
via [`inventoryRoutes.tsx`](inventoryRoutes.tsx). Long-form: [PROJECT.md](PROJECT.md).

## Pages

| Path | File |
|------|------|
| `/inventory/login` | [pages/LoginPage.tsx](pages/LoginPage.tsx) |
| `/inventory/dashboard` | [pages/DashboardPage.tsx](pages/DashboardPage.tsx) |
| `/inventory/medicines` | [pages/MedicinesPage.tsx](pages/MedicinesPage.tsx) |
| `/inventory/batches` | [pages/BatchesPage.tsx](pages/BatchesPage.tsx) |
| `/inventory/suppliers` | [pages/SuppliersPage.tsx](pages/SuppliersPage.tsx) |
| `/inventory/grn` | [pages/GrnPage.tsx](pages/GrnPage.tsx) |
| `/inventory/grn/new` | [pages/GrnNewPage.tsx](pages/GrnNewPage.tsx) |

## Components
[components/](components/) — shell only:
- `InventoryLayout`, `InventorySidebar`, `InventoryBottomNav`

## Features used
- [inventory](../../features/inventory/) — back-office writes (`createGrn`) + reads (`fetchMedicines`, `fetchMedicineBatches`, `fetchSuppliers`, `fetchGrns`).
- [auth](../../features/auth/) — `inventory_clerk` role guard.
