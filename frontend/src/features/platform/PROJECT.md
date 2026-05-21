# Platform feature

Maps to TSD-01 (tenants / users / RBAC) and TSD-02 (audit + notifications),
plus the lookup tables hospital admins maintain (departments, allergies,
services, states).

> **Status:** FE-ahead. Admin endpoints are not yet shipped; mock data is
> shaped to match the planned wire contracts.

## Purpose
Read + manage administrative reference data and view the audit log:

- `tenants` — multi-tenant directory.
- `users` — every actor across roles (filterable by role / tenant / active).
- `lookups` — closed-domain reference rows (departments, allergies, services, states).
- `audit` — append-only ledger of every notable action with severity tone.

## How to consume
- `fetchTenants()`
- `fetchUsers({ role?, tenantId?, active?, q? })`
- `fetchLookup(kind)` where `kind ∈ 'departments' | 'allergies' | 'services' | 'states'`
- `fetchAuditLog({ severity?, actorRole?, q? })`

## Known issues / limitations
- All reads only (no create/update/delete in mocks; admin write flows
  ship with the real backend).
- Lookups are flat; tree-style hierarchy (e.g., service category →
  service) is a follow-up.
- No diff/timeline view in audit — single line per entry.

## Planned improvements
- [ ] Create / edit / disable for users, tenants, lookups.
- [ ] Tenant onboarding wizard (UHID prefix + length, departments, etc.).
- [ ] Audit drill-down with before/after JSON diff.
- [ ] RBAC matrix editor (which roles see which screens).
