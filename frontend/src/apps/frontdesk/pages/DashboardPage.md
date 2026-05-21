# DashboardPage (front-desk)

**File:** [DashboardPage.tsx](DashboardPage.tsx) · **Route:** `/frontdesk/dashboard` · **Auth:** required

## Purpose
Front-desk day-one view. Shows today's KPIs (registrations, walk-ins
waiting, vitals queue length, doctor queue depth per doctor, today's
appointments, no-shows) and quick-action shortcuts (Register patient /
Capture vitals / View appointments).

## Sections
| Section | Notes |
|---------|-------|
| Greeting + quick actions | "Good day, &lt;name&gt;" + Register patient + Appointments shortcut buttons |
| KPI grid (6 tiles) | Booked today / Arrived / Awaiting vitals / Awaiting doctor / No-shows / Total today |
| Vitals queue preview | Top 5 patients in `awaiting_vitals` with token + wait minutes; "Open vitals queue →" link |
| Upcoming appointments preview | Next 5 by slot time with status pill (booked / arrived); "Open appointments →" link |
| Awaiting doctor snapshot | First 6 of `awaiting_doctor` queue with red-border highlight for `emergencyTriage='red'` |

## Data
- `fetchQueue({ status: 'awaiting_vitals' })` — vitals queue.
- `fetchQueue({ status: 'awaiting_doctor' })` — doctor queue depth.
- `fetchAppointments({ slotDate: today })` — today's appointments.
- A composite `fetchFrontdeskDashboard()` will replace the multiple calls in v2.
