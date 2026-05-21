# DashboardPage

**File:** [DashboardPage.tsx](DashboardPage.tsx) · **Route:** `/doctor/dashboard` · **Auth:** required (DoctorLayout guard)

## Purpose

Doctor's day-one view. Greeting, KPI grid, today's follow-ups, admissions
advised, recent activity, pharmacy stock alerts, and quick-action shortcuts.

## Data

- Composite endpoint: `fetchDashboard()` from [doctorApi.ts](../doctorApi.ts) → `DashboardPayload`
- Today: returns mock data (no debounce, ~250ms latency simulated). Wire to real Supabase/Spring later.

## Sections

| Section | Location | Notes |
|---------|----------|-------|
| Greeting + page actions | inline ~L63-84 | "Good day, Dr. ..." + "Open queue" + "Resume current consultation" buttons. **Resume button OP number is hardcoded** to `OP-2026-00121` — TODO when real "current encounter" tracking lands. |
| KPI grid (8 tiles) | inline ~L100-146 → 8× [DashboardStatCard](../components/DashboardStatCard.tsx) | Today's appointments, waiting, in_consultation, completed, pending reports, follow-ups, admissions advised, stock alerts. `tone='danger'` only for admissions > 0 and stock alerts > 0. |
| Today's follow-ups | inline ~L150-182 | List of `data.followUps` with patient name + UHID + reason + due time. Empty state inline. |
| Admissions advised | inline ~L184-216 | List of `data.admissionsAdvised` with patient + ward type + reason + advised time. Empty state inline. |
| Recent activity | inline ~L218-244 | Vertical timeline of `data.recentActivity` events with relative time stamps. |
| Pharmacy stock alerts | inline ~L247 | Renders [`PharmacyStockAlertCard`](../../../features/inventory/components/PharmacyStockAlertCard.tsx). Critical (out of stock / expired) vs warning (low / near-expiry) tones. |
| Quick actions | inline ~L249-275 | Three shortcut buttons: open queue, view pending reports, continue consultation. Hardcoded links — to wire when navigation flow is real. |

## Common edit hotspots

| User says | Open this |
|-----------|-----------|
| "Severity dot on KPI tile" | [DashboardStatCard.tsx](../components/DashboardStatCard.tsx) (the dot logic + `dotLabel` map) |
| "Header greeting copy" | DashboardPage.tsx:67 |
| "Stock alert tones" | [PharmacyStockAlertCard.tsx](../../../features/inventory/components/PharmacyStockAlertCard.tsx) |
| "Quick-action targets" | DashboardPage.tsx ~L256-271 (the three `<Link to="...">` blocks) |
| "Add a new KPI tile" | DashboardPage.tsx KPI section (~L100-146) AND `DashboardCounters` shape in [doctorTypes.ts](../doctorTypes.ts) AND mock in [doctorMocks.ts](../__mocks__/doctorMocks.ts) |

## Related

- Type: `DashboardPayload`, `DashboardCounters`, `FollowUpItem`, `AdmissionAdvisedItem`, `ActivityEvent` in [doctorTypes.ts](../doctorTypes.ts)
- API: `fetchDashboard` in [doctorApi.ts](../doctorApi.ts)
- Sub-components: [DashboardStatCard](../components/DashboardStatCard.tsx), [DoctorBreadcrumb](../components/DoctorBreadcrumb.tsx), [PharmacyStockAlertCard](../../../features/inventory/components/PharmacyStockAlertCard.tsx)

## Quirks / TODOs

- Resume-current-consultation hardcoded OP — see hotspot above.
- KPI tiles still use ad-hoc styling (not the new `<Card>` primitive). Migrate when premium-feel propagation reaches Dashboard.
- "Today's follow-ups" / "Admissions" / "Recent activity" sections are inline grids — extract into `dashboard.sections/` sub-components when they grow.
