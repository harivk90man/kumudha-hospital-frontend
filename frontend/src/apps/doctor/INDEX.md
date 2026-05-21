# Doctor app shell

Composes `features/*` into the doctor's screens. No domain logic owned here.

## Map

| Concern | Location |
|---------|----------|
| Routable pages (the four screens a doctor uses) | [pages/INDEX.md](pages/INDEX.md) |
| Layout shell (sidebar, breadcrumb, bottom nav, settings sheet, stat card) | [components/INDEX.md](components/INDEX.md) |
| Routes (mounted by `src/routes.tsx`) | [doctorRoutes.tsx](doctorRoutes.tsx) |
| API wrapper (dashboard composite endpoint) | [doctorApi.ts](doctorApi.ts) |
| Types specific to the doctor app shell (`DashboardPayload`, `FollowUpItem`, etc.) | [doctorTypes.ts](doctorTypes.ts) |
| Public surface | [index.ts](index.ts) |
| Mocks (today, until Supabase is wired) | [__mocks__/doctorMocks.ts](__mocks__/doctorMocks.ts) |
| Long-form package notes | [PROJECT.md](PROJECT.md) |
