# Cashier app — map

Centralised billing-counter shell. Mounted at `/cashier/*` via [`cashierRoutes.tsx`](cashierRoutes.tsx).
Long-form: [PROJECT.md](PROJECT.md).

## Pages

| Path | File |
|------|------|
| `/cashier/login` | [pages/LoginPage.tsx](pages/LoginPage.tsx) |
| `/cashier/dashboard` | [pages/DashboardPage.tsx](pages/DashboardPage.tsx) |
| `/cashier/invoices` | [pages/InvoicesPage.tsx](pages/InvoicesPage.tsx) |
| `/cashier/invoices/:id` | [pages/InvoiceDetailPage.tsx](pages/InvoiceDetailPage.tsx) |
| `/cashier/payments` | [pages/PaymentsPage.tsx](pages/PaymentsPage.tsx) |

## Components
[components/](components/) — `CashierLayout`, `CashierSidebar`, `CashierBottomNav` (shell-only).

Cross-role primitives consumed: `<Breadcrumb>`, `<DashboardStatCard>`, `<StatusPill>`, `<Card>`, `<FormInput>`, `<FormSelect>`, `<FormTextarea>`, `<SettingsSheet>`, `<Spinner>`.

## Features used
- [billing](../../features/billing/) — invoices + payments + refunds.
- [auth](../../features/auth/) — role guard.
