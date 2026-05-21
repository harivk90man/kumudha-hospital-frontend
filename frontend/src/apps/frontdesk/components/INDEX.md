# Front-desk app shell — components

These are **shell** components (layout, navigation, front-desk-specific
chrome). They are NOT domain components — anything reusable across roles
or tied to a clinical concept lives in `src/components/` or
`src/features/<feature>/components/`.

| Component | Purpose |
|-----------|---------|
| [FrontdeskLayout.tsx](FrontdeskLayout.tsx) | Auth-guarded shell. Sidebar (md+) + bottom nav (mobile) + `<Outlet />`. Bounces wrong-role users to /doctor. |
| [FrontdeskSidebar.tsx](FrontdeskSidebar.tsx) | Desktop left rail: brand, nav links, staff profile chip, Settings + Sign-out. Hosts `<SettingsSheet>`. |
| [FrontdeskBottomNav.tsx](FrontdeskBottomNav.tsx) | Mobile bottom nav: Station / Appointments icons + active state. |

Cross-role primitives the front-desk app consumes (from `src/components/`):

- `<Breadcrumb>` from `@/components/data-display` — every page passes `homeTo="/frontdesk/station"` (the nurse station is the sidebar landing; legacy `/frontdesk/dashboard`, `/vitals`, `/queue`, `/register` routes stay mounted for back-compat but are off the sidebar).
- `<DashboardStatCard>` from `@/components/data-display` — KPI tiles.
- `<SettingsSheet>` from `@/components/overlay` — theme/accent/font sheet.
- `<FormInput>` / `<FormSelect>` / `<FormTextarea>` from `@/components/form` — registration + vitals forms.
