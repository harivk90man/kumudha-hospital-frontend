# Platform admin app

Platform-admin shell (BRD §13). Manages tenants, users, lookup tables,
and surfaces the audit log.

## Routes

| Path | Page | Notes |
|------|------|-------|
| `/admin/login` | LoginPage | Mock login on `admin.*` prefix. |
| `/admin/tenants` | TenantsPage | Tenant cards with UHID prefix + length, city, user count, active toggle. |
| `/admin/users` | UsersPage | Filterable table of every staff account by role + tenant + status. |
| `/admin/lookups` | LookupsPage | Tabbed view of departments / allergies / services / states. |
| `/admin/audit` | AuditPage | Append-only ledger with severity filter (info / warn / critical) + search. |

## Features consumed
- `auth` — `platform_admin` guard.
- `platform` — every read (`fetchTenants`, `fetchUsers`, `fetchLookup`, `fetchAuditLog`).

## Components consumed
- `<Card>`, `<CardHeader/Title/Label>` (layout)
- `<Breadcrumb>`, `<StatusPill>` (data-display)
- `<Spinner>` (feedback)
- `<SettingsSheet>` (overlay)

## Known issues / limitations
- All reads only — admin write actions (create user, edit lookup, disable
  tenant) are read-only in mocks.
- No tenant-onboarding wizard yet.
- No RBAC matrix editor (which roles see which screens).

## Planned improvements
- [ ] Create / edit / disable for users and lookups.
- [ ] Tenant onboarding wizard.
- [ ] Audit drill-down with before/after JSON diff.
- [ ] RBAC matrix editor.
