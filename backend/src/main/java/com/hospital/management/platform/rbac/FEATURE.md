# rbac — Feature

## Package
[platform](../MODULE.md)

## Tables
`roles`, `user_roles`, `role_permissions`

## Schema reference
[01C · RBAC](../../../../../../../../../../../docs/03-schema/v3/modules/01c-rbac.html)

## Business rules
- `role_permissions` is keyed `(role_id, table_name, action)` — CRUD per table per role
- A user may hold multiple roles; effective permissions are the union
- `user_roles` has no soft-delete — removing a role is a hard delete (audit trigger captures it)
- Permission check is always: resolve user roles → union permissions → evaluate. Never cache per-user; cache per-role (roles change rarely)

## API endpoints
_To be defined during implementation._

## Known constraints
- Composite PK on `user_roles(user_id, role_id)` and `role_permissions(role_id, table_name, action)` — no surrogate key on bridge tables
- Seeded roles (`admin`, `doctor`, `nurse`, `receptionist`, `lab_technician`, `pharmacist`, `cashier`) loaded by Flyway migration; do not hard-code role names in Java — read from DB
