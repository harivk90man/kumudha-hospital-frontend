# audit — Feature

## Package
[platform](../MODULE.md)

## Java classes
- `AuditableEntity` — `@MappedSuperclass` carrying the 7-column audit + soft-delete block; every entity across all packages extends this

## Tables
`audit_logs`, `audit_excluded_tables`

## Schema reference
[02 · Platform Audit](../../../../../../../../../../../docs/03-schema/v3/modules/02-platform-audit.html)

## Business rules
- Layer 3 audit is trigger-driven (`fn_audit_row`) — app code never writes to `audit_logs` directly except for manual audit entries via `AuditService`
- `audit_logs` is append-only — no UPDATE or DELETE allowed (trigger enforces)
- Partitioned monthly by `occurred_at` — queries must include a date range or Postgres will scan all partitions
- `audit_excluded_tables` lists tables exempt from Layer 3 (e.g. `patient_journey_events` — high volume, low forensic value)
- `changed_fields text[]` lists which columns changed on UPDATE — populated by the trigger

## API endpoints
_To be defined during implementation._

## Known constraints
- Read audit logs via JdbcTemplate only — never Hibernate entity (append-only, no lifecycle)
- CI job runs nightly orphan check: every `entity_id` in `audit_logs` must exist in `entity_table` OR be accounted for as a known hard-delete
