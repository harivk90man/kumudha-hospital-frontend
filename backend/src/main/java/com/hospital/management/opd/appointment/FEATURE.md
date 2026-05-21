# appointment — Feature

## Package
[opd](../MODULE.md)

## Tables
`appointments`, `appointment_slots`, `tokens`

## Schema reference
[09 · Appointments](../../../../../../../../../../../docs/03-schema/v3/modules/09-appointments.html)

## Business rules
- `appointment_slots` are pre-generated per doctor per day based on `doctor_profiles.available_days` and `holidays`
- A slot can hold at most `max_tokens` appointments — enforced by a CHECK on token count vs slot capacity
- Token number is sequential per slot, assigned at booking — `tokens.token_number` is gapless within a slot
- Walk-in patients get a token without a prior appointment (`appointments` row optional for walk-ins)
- Appointment cancellation frees the slot for rebooking; token is soft-deleted

## API endpoints
_To be defined during implementation._

## Known constraints
- Slot generation is a scheduled job (run nightly for the next N days) — not on-demand per request
- Concurrent booking race condition prevented by a DB-level advisory lock on `(slot_id)` during token assignment
