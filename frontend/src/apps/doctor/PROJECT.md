# Doctor app shell

## Purpose
Composition layer for the doctor's portal. Owns nothing domain-specific — every domain concept (patient, encounter, consultation, lab, radiology, inventory) lives in its own `features/<module>` slice mapped to schema v2.

## Screens
- `DoctorLoginPage` — sign-in (uses `features/auth`).
- `DoctorDashboardPage` — KPIs + follow-ups + admissions advised + activity feed + pharmacy stock alerts. Composite endpoint: `apps/doctor/doctorApi.fetchDashboard`.
- `DoctorQueuePage` — two tabs: consultation queue (`features/encounter.fetchQueue`) and reports-to-check (`features/encounter.fetchReportPendingQueue`).
- `PatientConsultationPage` — split-pane workspace. Left: patient summary + vitals (from `features/patient` + `features/consultation`). Right: stepper-driven workflow (Notes → Diagnosis → Prescription → Orders → Advice) using `features/consultation` components. History tab opens past visits in a read-only drawer.

## Routes (mounted via `apps/doctor/doctorRoutes`)
- `/doctor/login`
- `/doctor` → redirects to `/doctor/dashboard`
- `/doctor/dashboard`
- `/doctor/queue?view=consultation|reports`
- `/doctor/consultation/:encounterNo?tab=workspace|history|reports&step=notes|diagnosis|prescription|orders|advice&visit=<pastEncounterNo>`

## Local types / mocks
- `doctorTypes.ts` — `DashboardCounters`, `FollowUpReminder`, `AdmissionAdvisedPatient`, `ActivityEvent`. These are dashboard aggregates that don't belong to any single feature.
- `__mocks__/doctorMocks.ts` — mocks for the dashboard composite endpoint only.

## Local components
- `DoctorLayout`, `DoctorSidebar`, `DoctorBottomNav`, `DoctorBreadcrumb` — chrome around the doctor's screens.
- `DashboardStatCard` — KPI card variant used only by the dashboard.

## DB tables / entities (schema v2)
This shell *uses* features mapping to:
- `01-platform-tenancy` (auth) · `07-patient` · `10-encounter` · `11-consultation` · `12-lab` · `13-radiology` · `14-inventory`

## Known issues / limitations
- `fetchDashboard` is a hand-rolled composite that calls `inventory.fetchPharmacyAlerts` plus reads local mocks. Real backend may expose `/api/doctor/dashboard` returning all of this in one shot.
- "Resume current consultation" links to a hard-coded encounter (`OP-2026-00121`) — needs a "current encounter" endpoint when wired.

## Planned improvements
- [ ] Replace hand-rolled loading with TanStack Query.
- [ ] Real-time queue via WebSocket.
- [ ] Move dashboard composite to a single backend endpoint.
- [ ] Sibling shells when added: `apps/pharmacist`, `apps/labTech`, `apps/radiologyTech`, `apps/frontDesk`, `apps/billingClerk`.
