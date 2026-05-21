# AppointmentsPage (front-desk)

**File:** [AppointmentsPage.tsx](AppointmentsPage.tsx) · **Route:** `/frontdesk/appointments` · **Auth:** required

## Purpose
Manage appointments per BRD §4. Two halves:

- **Today's bookings** — list of all `appointments` for today with status pill
  (booked / arrived / no-show / cancelled / late-arrival), patient name + UHID,
  doctor + slot time. Per row actions: **Check in** (sets `arrived`),
  **Cancel** (with `cancelledBy='reception'`), **Mark no-show**
  (auto-flagged after 15-min grace).
- **Book new** — date picker + doctor picker → renders the doctor's slot grid
  (`available` vs `booked` vs `blocked`); receptionist clicks an available slot,
  picks an existing patient (or quickly creates one), submits.

## Sections
| Section | Notes |
|---------|-------|
| Filter row | Status filter tabs (All / Booked / Arrived / No-show / Cancelled / Late) with live counts. |
| Bookings grid | One `<Card>` per appointment with patient identity, slot time, doctor, token, source pill, allergy banner, and per-row actions. |
| Per-row actions (booked, not past) | **Check in** → `checkInAppointment`. |
| Per-row actions (booked, past slot) | **Late arrival** → `markLateArrival`. **No-show** → `markNoShow`. |
| Per-row actions (booked or arrived) | **Cancel** → `cancelAppointment(id, 'reception')`. |

## New-booking sheet
[NewBookingSheet.tsx](../components/NewBookingSheet.tsx) — opens from the "New booking" button. Four steps in one sheet:
1. **Patient** — UHID exact / mobile last-6 search; "Use" button on each result; "no matches → register first" link to `/frontdesk/register`.
2. **Doctor** — `<FormSelect>` from `fetchBookableDoctors`.
3. **Slot** — today's grid grouped Morning / Afternoon-Evening; available = clickable, booked = greyed + struck through; selected = primary tint.
4. **Visit type** — segmented control: New visit / Follow-up.

Submit calls `bookAppointment({ source: 'walk_in_counter' })` and the parent reloads the list.

## Not wired yet (intentional)
- Multi-day calendar / doctor filter.
- Patient-app booking surface — Phase 2.

## Data
- `fetchAppointments({ slotDate, doctorId?, status? })`
- `fetchSlots({ doctorId, slotDate })`
- `fetchBookableDoctors()`
- `bookAppointment(input)`, `checkInAppointment(id)`,
  `cancelAppointment(id, 'reception')`, `markNoShow(id)`,
  `markLateArrival(id)`

## Spec mapping
- TSD-05 `appointments`, `appointment_slots`, `doctor_schedules`.
- BRD §4 sub-flows: walk-in counter / phone (no app surface here yet),
  cancellation, no-show (15-min grace), late-arrival.

## Quirks / TODOs
- No DB migration for `appointments` yet — feature is FE-ahead. See
  [features/appointments/PROJECT.md](../../../features/appointments/PROJECT.md).
- No reminder pipeline (one-day-before / N-hours-before SMS).
- No multi-day calendar view yet — single-day focus.
