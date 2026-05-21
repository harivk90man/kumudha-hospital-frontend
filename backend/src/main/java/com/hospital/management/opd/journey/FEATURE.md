# journey — Feature

## Package
[opd](../MODULE.md)

## Tables
`stations`, `patient_journey_events`

## Schema reference
[08 · Journey](../../../../../../../../../../../docs/03-schema/v3/modules/08-journey.html)

## Business rules
- `stations` are the physical / logical checkpoints: `reception`, `triage`, `waiting`, `with_doctor`, `lab`, `pharmacy`, `billing`, `exit`
- Each patient visit generates `patient_journey_events` rows as the patient moves through stations
- Events are append-only — never updated or deleted; the current station is the latest event's `station_id`
- Journey events are excluded from Layer 3 audit (high volume, low forensic value) — listed in `audit_excluded_tables`
- Station transitions are validated: only allowed transitions are permitted (e.g. cannot jump from `reception` to `exit` without billing)

## API endpoints
_To be defined during implementation._

## Known constraints
- `patient_journey_events` is the only table in the schema intentionally excluded from audit logging
- Live queue display reads the latest event per active op_visit — index on `(op_visit_id, occurred_at DESC)` is critical
