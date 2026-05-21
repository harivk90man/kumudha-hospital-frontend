# opd — Bounded Context

## Schema modules
[08 · Journey](../../../../../../../../../../docs/03-schema/v3/modules/08-journey.html) ·
[09 · Appointments](../../../../../../../../../../docs/03-schema/v3/modules/09-appointments.html) ·
[10 · Encounter](../../../../../../../../../../docs/03-schema/v3/modules/10-encounter.html)

## Owns
`appointments`, `appointment_slots`, `tokens`,
`stations`, `patient_journey_events`,
`op_visits`, `patient_queue`

## Depends on
- `platform` — UserQueryService (doctor_id, created_by), DepartmentQueryService
- `patient` — PatientQueryService (verify patient exists and is not merged)

## Exposes to other packages
- `OpVisitQueryService` — look up op_visit by ID, return OpVisitSummary (patient_id, doctor_id, visit date, status)
- `AppointmentQueryService` — check appointment status for a patient on a given date

## MS split boundary
Extract as an **OPD / scheduling service** once appointment booking or queue management needs independent scaling (e.g. high walk-in volume, SMS booking integrations). Tight internal coupling between appointment → token → journey → op_visit makes them stay together in one service.

## Features
- [appointment](appointment/FEATURE.md) — appointments, appointment_slots, tokens
- [journey](journey/FEATURE.md) — stations, patient_journey_events, patient flow tracking
- [encounter](encounter/FEATURE.md) — op_visits, patient_queue, consultation dispatch
