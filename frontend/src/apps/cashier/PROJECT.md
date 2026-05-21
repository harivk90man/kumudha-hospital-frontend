# Cashier app

The dedicated billing-counter shell. Per BRD §1 most fees are collected
inline at the originating counter (consult at front-desk, tests at lab,
medicines at pharmacy); this app exists for the centralised cashier role
who handles **refunds, daily collection report, and walk-in payment of
any open invoice**.

## Routes

| Path | Page | Notes |
|------|------|-------|
| `/cashier/login` | LoginPage | Public; mock login routes by username prefix (`cash.*` / `cashier*`). |
| `/cashier/dashboard` | DashboardPage | Today's collection KPIs, by-counter breakdown, partial-payment follow-ups, recent payments stream. |
| `/cashier/invoices` | InvoicesPage | All invoices today with status / counter / search filters. |
| `/cashier/invoices/:id` | InvoiceDetailPage | Line items, take-payment form (cash/UPI/card/netbanking/insurance), refund per-payment. |
| `/cashier/payments` | PaymentsPage | Daily collection ledger with gross/refunds/net totals strip. |

## Features consumed
- `auth` — `useAuth().user.role === 'cashier'` guard in the layout.
- `billing` — `fetchInvoices`, `fetchInvoice`, `fetchPayments`, `recordPayment`, `refundPayment`. Same feature every other actor app calls into.

## Components consumed (from `frontend/src/components/`)
- `<Card>`, `<CardHeader/Title/Label>` (layout)
- `<Breadcrumb>`, `<DashboardStatCard>`, `<StatusPill>` (data-display)
- `<FormInput>`, `<FormSelect>`, `<FormTextarea>` (form)
- `<Spinner>` (feedback)
- `<SettingsSheet>` (overlay)

Plus the lifted `formatCurrency()` helper from `@/utils/formatCurrency`
— the single source of truth for INR formatting across every app that
displays money.

## Known issues / limitations
- All writes are mocks (no backend wired) — refresh resets state.
- No discount / promo support yet (line or invoice).
- Refund reason is captured via `window.prompt` for now — should move to a `<Sheet>` when designs land.
- No PDF receipt — Print is browser-print-window.
- No end-of-shift "Z report" close-out.

## Planned improvements
- [ ] PDF/HTML receipt template + print stylesheet.
- [ ] Refund modal replacing `window.prompt`.
- [ ] End-of-shift close-out + handover summary.
- [ ] Insurance / TPA pre-auth screen (Phase 2).
