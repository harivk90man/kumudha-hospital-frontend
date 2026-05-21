# platform — Bounded Context

## Schema modules
[01A · Identity & Auth](../../../../../../../../../../docs/03-schema/v3/modules/01a-identity-and-auth.html) ·
[01B · Organisation](../../../../../../../../../../docs/03-schema/v3/modules/01b-organisation.html) ·
[01C · RBAC](../../../../../../../../../../docs/03-schema/v3/modules/01c-rbac.html) ·
[01D · Operational Config](../../../../../../../../../../docs/03-schema/v3/modules/01d-operational-config.html) ·
[02 · Platform Audit](../../../../../../../../../../docs/03-schema/v3/modules/02-platform-audit.html) ·
[05 · Document Templates](../../../../../../../../../../docs/03-schema/v3/modules/05-document-templates.html) ·
[06 · Platform Lookups](../../../../../../../../../../docs/03-schema/v3/modules/06-platform-lookups.html)

## Owns
`hospital_profile`, `users`, `user_sessions`, `departments`, `doctor_profiles`,
`roles`, `user_roles`, `role_permissions`,
`system_config`, `user_preferences`, `holidays`,
`audit_logs`, `audit_excluded_tables`,
`document_templates`, `allergies_lookup`, `chronic_conditions_lookup`

## Depends on
_Nothing._ Platform is the root — no other package is imported here.

## Exposes to other packages
- `UserQueryService` — look up a user by ID, verify active status, resolve display name
- `DepartmentQueryService` — look up department by ID
- `AuditService` — write a manual audit entry (used by packages that do soft-deletes outside triggers)
- `ConfigService` — read a typed `system_config` value by key
- `LookupQueryService` — resolve allergy / chronic condition codes to display names

All exposed services are interfaces. When platform is extracted to a microservice, implementations swap to HTTP clients with no call-site changes.

## MS split boundary
Extract as an **auth / identity service** first — it has no upstream dependencies, and every other package depends on it for JWT validation and user resolution. Extraction adds an API gateway + JWT verification filter; everything else is unchanged.

## Features
- [identity](identity/FEATURE.md) — users, user_sessions, login/JWT, hospital_profile, departments, doctor_profiles
- [rbac](rbac/FEATURE.md) — roles, user_roles, role_permissions, permission checks
- [config](config/FEATURE.md) — system_config, user_preferences, holidays
- [audit](audit/FEATURE.md) — audit_logs, audit_excluded_tables, 3-layer audit wiring
- [lookup](lookup/FEATURE.md) — allergies_lookup, chronic_conditions_lookup
- [template](template/FEATURE.md) — document_templates, PDF generation
