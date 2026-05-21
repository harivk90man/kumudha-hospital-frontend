# consultation — Feature

## Package
[clinical](../MODULE.md)

## Tables
`consultations`, `diagnosis_templates`

## Schema reference
[11 · Consultation](../../../../../../../../../../../docs/03-schema/v3/modules/11-consultation.html#consultations)

## Business rules
- One consultation per op_visit per doctor — enforced by unique index on `(op_visit_id, doctor_id)` where `deleted_at IS NULL`
- Consultation lifecycle: `draft` → `locked`; once locked no fields can be updated (trigger enforces)
- `diagnosis_templates` are doctor-owned reusable snippets — scoped to `doctor_id`; shared templates have NULL `doctor_id`
- `locked_at` and `locked_by` are set atomically when status changes to `locked` — two-column invariant enforced by CHECK
- A consultation cannot be locked if the patient has no vitals recorded for this visit

## API endpoints
_To be defined during implementation._

## Known constraints
- `consultations.notes` and `consultations.examination_findings` are plain `text` — no rich-text encoding at DB level
- Locking a consultation triggers an `audit_logs` Layer 3 entry AND a domain event `ConsultationLocked`
