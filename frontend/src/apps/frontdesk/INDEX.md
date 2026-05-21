# Front-desk app — map

Receptionist + Nurse shell. Mounted at `/frontdesk/*` via [`frontdeskRoutes.tsx`](frontdeskRoutes.tsx).
Long-form package notes: [PROJECT.md](PROJECT.md).

## Pages
See [pages/INDEX.md](pages/INDEX.md). One per screen, each with its own `.md` doc.

| Path | File |
|------|------|
| `/frontdesk/login` | [pages/LoginPage.tsx](pages/LoginPage.tsx) |
| `/frontdesk/dashboard` | [pages/DashboardPage.tsx](pages/DashboardPage.tsx) |
| `/frontdesk/register` | [pages/RegistrationPage.tsx](pages/RegistrationPage.tsx) |
| `/frontdesk/vitals` | [pages/VitalsPage.tsx](pages/VitalsPage.tsx) |
| `/frontdesk/appointments` | [pages/AppointmentsPage.tsx](pages/AppointmentsPage.tsx) |

## Components
See [components/INDEX.md](components/INDEX.md). Shell-only (Layout / Sidebar / BottomNav).

## Routes
[frontdeskRoutes.tsx](frontdeskRoutes.tsx) — wires all pages under `/frontdesk` behind the auth-guarded `<FrontdeskLayout>`.

## Features used
Pulled from `frontend/src/features/`:
- [auth](../../features/auth/) — login + role-aware session.
- [patient](../../features/patient/) — register / lookup.
- [encounter](../../features/encounter/) — op-visit + vitals capture.
- [appointments](../../features/appointments/) — slot calendar + booking lifecycle.
