# Front-desk app

Combined shell for the Receptionist + Nurse roles (BRD §1 OPD steps 1-7
and §4 Appointment Booking — Phase 1).

## Purpose
Funnels patients to the doctor's queue:
- **Reception** registers new patients (or looks them up by UHID / mobile),
  selects the doctor, marks the consultation fee paid, issues a token,
  and routes the patient to vitals.
- **Nurse** captures vitals (BP, pulse, temp, weight, blood sugar) and
  the chief complaint; submission transitions the encounter from
  `awaiting_vitals` (state code 120) → `vitals_done` (130) →
  `awaiting_doctor` (140) so the patient appears on the doctor's queue.
- **Appointments** lists today's pre-booked visits, supports check-in,
  cancellation, no-show, and late-arrival sub-flows + new bookings.

Both roles share one shell because they sit at adjacent counters and
operate on the same handful of tables; ACL refinement (which sub-screens
each role can write to) is a follow-up.

## Routes
| Path | Page | Notes |
|------|------|-------|
| `/frontdesk/login` | LoginPage | Public; mock login routes by username prefix (`rec.*`, `nurse.*`). |
| `/frontdesk/dashboard` | DashboardPage | KPI grid: today's bookings / waiting / vitals queue / queue depth. |
| `/frontdesk/register` | RegistrationPage | UHID / mobile lookup → register-or-existing → doctor pick → token. |
| `/frontdesk/vitals` | VitalsPage | Vitals queue → form (BP, pulse, temp, weight, blood sugar, chief complaint). |
| `/frontdesk/queue` | QueuePage | Live per-doctor queue board (polls every 5 s) — answers "how many ahead of me for Dr. X". |
| `/frontdesk/appointments` | AppointmentsPage | Bookings list (date-stepper, today by default; +14 days ahead via `?date=`) + book new + lifecycle (check-in / cancel / no-show / late-arrival). |

## Features consumed
- `auth` — `useAuth()` returns `UserProfile` discriminated union; the layout
  bounces non-receptionist/nurse roles back to /doctor.
- `patient` — `fetchPatient`, `searchPatientsByMobile`, `createPatient`.
- `encounter` — `createOpVisit`, `recordVitals`, `transitionEncounterState`,
  `fetchQueue`, `fetchQueueByDoctor`.
- `appointments` — `fetchSlots`, `fetchAppointments`, `bookAppointment`,
  `checkInAppointment`, `cancelAppointment`, `markNoShow`, `markLateArrival`.

## Components consumed (from `frontend/src/components/`)
- `<Card>`, `<InsetGroup>` (layout)
- `<Breadcrumb>`, `<DashboardStatCard>`, `<StatusPill>`, `<StatusDot>` (data-display)
- `<Spinner>` (feedback)
- `<FormInput>`, `<FormSelect>`, `<FormTextarea>` (form)
- `<SettingsSheet>` (overlay)

## Known issues / limitations
- All writes are mocks (no backend wired yet) — refresh resets state.
- Appointment table not in DB migrations yet (`features/appointments` is
  FE-ahead; see [`features/appointments/PROJECT.md`](../../features/appointments/PROJECT.md)).
- ACL is binary today (you can do everything once signed in as
  receptionist or nurse). Real role split is a follow-up.

## Planned improvements
- [ ] Real backend wiring once Spring controllers exist.
- [ ] Per-screen role gating (nurse can't book appointments, etc.).
- [ ] Family-link picker during registration (BRD §1 step 2 sub-flow).
- [ ] Phone + app booking surfaces (Phase 2 patient app).
- [ ] Reminder pipeline wiring (`notifications`).
