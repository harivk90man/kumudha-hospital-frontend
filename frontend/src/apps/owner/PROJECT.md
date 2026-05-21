# Owner app

Hospital owner dashboards (BRD §12). Read-only views composed from the
features other actors generate during the day.

## Routes

| Path | Page | Notes |
|------|------|-------|
| `/owner/login` | LoginPage | Mock login on `owner.*` prefix. |
| `/owner/dashboard` | DashboardPage | Net revenue, outstanding, patients-in-flow, refunds — all live from billing + encounter. |
| `/owner/revenue` | RevenuePage | Today: billed vs collected vs refunded; by service category; by payment method; open invoices. |
| `/owner/operations` | OperationsPage | Patient flow by state; appointments by status; diagnostics worklist size; rough doctor load. |

## Features consumed (read-only)
- `auth` — `owner` role guard.
- `billing` — invoices + payments for revenue views.
- `encounter` — queue snapshot for flow / doctor load.
- `appointments` — today's bookings status breakdown.
- `lab` + `radiology` — open worklist size.

## Components consumed
- `<Card>`, `<CardHeader/Title/Label>` (layout)
- `<Breadcrumb>`, `<DashboardStatCard>`, `<StatusPill>` (data-display)
- `<Spinner>` (feedback)
- `<SettingsSheet>` (overlay)

Plus `formatCurrency` from `@/utils/formatCurrency`.

## Known issues / limitations
- All numbers are today-only; multi-day trend lines + downloadable
  Z-reports are a follow-up.
- Doctor load grouping is by chief-complaint prefix (placeholder) until
  `QueueEntry` carries doctor identity.
- No charts yet (sparkline, donut, line) — text + tables only.
- No drill-down (click a category/method to see its underlying invoices).

## Planned improvements
- [ ] Multi-day reporting with date-range picker.
- [ ] Sparklines / donut charts.
- [ ] Click-through from category → invoice list filtered to that category.
- [ ] Owner can drill into individual doctor / department performance.
- [ ] Z-report download (end-of-day printable summary).
