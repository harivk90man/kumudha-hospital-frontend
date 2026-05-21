# Platform admin app — map

Mounted at `/admin/*` via [`adminRoutes.tsx`](adminRoutes.tsx). Long-form: [PROJECT.md](PROJECT.md).

## Pages

| Path | File |
|------|------|
| `/admin/login` | [pages/LoginPage.tsx](pages/LoginPage.tsx) |
| `/admin/tenants` | [pages/TenantsPage.tsx](pages/TenantsPage.tsx) |
| `/admin/users` | [pages/UsersPage.tsx](pages/UsersPage.tsx) |
| `/admin/lookups` | [pages/LookupsPage.tsx](pages/LookupsPage.tsx) |
| `/admin/audit` | [pages/AuditPage.tsx](pages/AuditPage.tsx) |

## Components
[components/](components/) — shell only: `AdminLayout`, `AdminSidebar`, `AdminBottomNav`.

## Features used
- [platform](../../features/platform/) — tenants, users, lookups, audit.
- [auth](../../features/auth/) — `platform_admin` role guard.
