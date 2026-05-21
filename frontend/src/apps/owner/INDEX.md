# Owner app — map

Owner dashboards. Mounted at `/owner/*` via [`ownerRoutes.tsx`](ownerRoutes.tsx). Long-form: [PROJECT.md](PROJECT.md).

## Pages

| Path | File |
|------|------|
| `/owner/login` | [pages/LoginPage.tsx](pages/LoginPage.tsx) |
| `/owner/dashboard` | [pages/DashboardPage.tsx](pages/DashboardPage.tsx) |
| `/owner/revenue` | [pages/RevenuePage.tsx](pages/RevenuePage.tsx) |
| `/owner/operations` | [pages/OperationsPage.tsx](pages/OperationsPage.tsx) |

## Components
[components/](components/) — shell only: `OwnerLayout`, `OwnerSidebar`, `OwnerBottomNav`.

## Features used (read-only)
- [billing](../../features/billing/), [encounter](../../features/encounter/),
  [appointments](../../features/appointments/), [lab](../../features/lab/),
  [radiology](../../features/radiology/), [auth](../../features/auth/).
