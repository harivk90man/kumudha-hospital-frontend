# Appointments feature

Maps to schema v2 module `appointments` and **TSD-05 §4** (`appointments`,
`appointment_slots`, `doctor_schedules`).

> **Status:** FE-ahead. The backend migration for `appointments` /
> `appointment_slots` is **not** yet in `backend/db/migrations/` — the
> doctor-flow migration set (`030_encounter.sql`) explicitly leaves
> `op_visits.appointment_id` as a nullable uuid with no FK so this
> feature can land later. Today the API is mock-only.

## Purpose
Slot-based booking for OPD consultations across three channels (BRD §4):
walk-in counter, phone, app. Plus the lifecycle sub-flows the BRD calls
out: cancellation, no-show, late-arrival, check-in.

## How to consume
- `fetchBookableDoctors()` — list of doctors patients can book against.
- `fetchSlots({ doctorId, slotDate? })` — calendar grid for that doctor.
- `fetchAppointments({...})` — list of appointments (today's by default);
  honours `?page=&limit=&sort=` per CLAUDE.md §3.4.
- `bookAppointment(input)` — atomic slot-claim + appointment insert.
- `checkInAppointment(id)` — receptionist marks `arrived` on the day.
- `cancelAppointment(id, cancelledBy)` — `'patient' | 'reception'`.
- `markNoShow(id)` — auto-flagged after 15 min past slot.
- `markLateArrival(id)` — patient came in after their slot time.

## DB tables / entities (TSD-05)
- `appointments` (booking record + status lifecycle)
- `appointment_slots` (per-doctor per-date generated grid)
- `doctor_schedules` (the OPD schedule slot generation reads from)

## Known issues / limitations
- No backend migration yet → all writes in-memory; refresh resets state.
- No reminder pipeline (one-day-before / N-hours-before SMS) — TSD-02
  `notifications` covers it but not wired.
- `doctor_schedules` editing surface (admin / doctor settings) does not
  exist — slot grid in mock is hard-coded.

## Planned improvements
- [ ] Land the `appointments` migration + RLS policies.
- [ ] Wire `notifications` for reminders + cancellation confirmations.
- [ ] Block-out support (vacation, conference) in slot generation.
- [ ] Multi-day calendar view for the receptionist.
- [ ] Patient-app booking path (separate `apps/patient` shell).
