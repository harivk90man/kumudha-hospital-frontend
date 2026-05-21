# Doctor app shell — components

These are **shell** components (layout, navigation, doctor-specific
chrome). They are NOT domain components — anything reusable across roles
or tied to a clinical concept lives in `src/components/` or
`src/features/<feature>/components/`.

| Component | Purpose |
|-----------|---------|
| [DoctorLayout.tsx](DoctorLayout.tsx) | Auth-guarded shell. Sidebar (md+) + bottom nav (mobile) + `<Outlet />` for the active page. Wrapped by `DoctorRoutes`. |
| [DoctorSidebar.tsx](DoctorSidebar.tsx) | Desktop left rail: brand, nav links, doctor profile chip, Settings + Sign-out buttons. Hosts the lifted `<SettingsSheet>` from `@/components/overlay`. |
| [DoctorBottomNav.tsx](DoctorBottomNav.tsx) | Mobile bottom nav: Dashboard / Queue / Consultation icons + active state. |

Cross-role primitives the doctor app consumes (lifted to `src/components/`):

- `<Breadcrumb>` from `@/components/data-display` — every page passes `homeTo="/doctor/dashboard"`.
- `<DashboardStatCard>` from `@/components/data-display` — KPI tiles on the dashboard.
- `<SettingsSheet>` from `@/components/overlay` — theme/accent/font sheet, opened from the sidebar.
