# Pharmacy app — map

Pharmacist (front-of-house dispense) shell. Mounted at `/pharmacy/*` via [`pharmacyRoutes.tsx`](pharmacyRoutes.tsx). Long-form: [PROJECT.md](PROJECT.md).

## Pages

| Path | File |
|------|------|
| `/pharmacy/login` | [pages/LoginPage.tsx](pages/LoginPage.tsx) |
| `/pharmacy/dashboard` | [pages/DashboardPage.tsx](pages/DashboardPage.tsx) |
| `/pharmacy/queue` | [pages/RxQueuePage.tsx](pages/RxQueuePage.tsx) |
| `/pharmacy/alerts` | [pages/StockAlertsPage.tsx](pages/StockAlertsPage.tsx) |

## Components
[components/](components/) — shell + the central dispense sheet:
- `PharmacyLayout`, `PharmacySidebar`, `PharmacyBottomNav`
- `DispenseSheet` — per-line decision + payment in one sheet.

## Features used
- [pharmacy](../../features/pharmacy/) — Rx queue + pickup + dispense.
- [inventory](../../features/inventory/) — stock alerts (dashboard + alerts page).
- [billing](../../features/billing/) — invoice + payment chained off dispense.
- [auth](../../features/auth/) — `pharmacist` role guard.
