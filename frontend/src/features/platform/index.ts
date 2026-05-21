/**
 * Public surface of the platform-admin feature.
 * Maps to TSD-01 (tenants/users/RBAC) + TSD-02 (audit + notifications)
 * + the lookup tables hospital admins maintain. FE-ahead today.
 */
export {
  fetchTenants,
  fetchUsers,
  fetchLookup,
  fetchAuditLog,
} from './platformApi';
export type {
  Tenant,
  PlatformUser,
  LookupRow,
  LookupKind,
  AuditEntry,
  AuditSeverity,
  ListParams,
  UsersListParams,
  AuditListParams,
} from './platformTypes';
