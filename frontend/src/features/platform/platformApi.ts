import type {
  AuditEntry,
  AuditListParams,
  LookupKind,
  LookupRow,
  PlatformUser,
  Tenant,
  UsersListParams,
} from './platformTypes';
import {
  mockAudit,
  mockLookups,
  mockPlatformUsers,
  mockTenants,
} from './__mocks__/platformMocks';

const delay = <T>(value: T, ms = 250): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

/**
 * Platform-admin API surface. Mocked today; signatures match the planned
 * backend contract (TSD-01 + TSD-02).
 *
 * Wire points (lists honour ?page=&limit=&sort= per CLAUDE.md §3.4):
 *  GET   /api/platform/tenants              → fetchTenants
 *  GET   /api/platform/users?role=&q=       → fetchUsers
 *  GET   /api/platform/lookups/:kind        → fetchLookup
 *  GET   /api/audit?severity=&actorRole=    → fetchAuditLog
 */

export const fetchTenants = async (): Promise<Tenant[]> => delay(mockTenants);

export const fetchUsers = async (params: UsersListParams = {}): Promise<PlatformUser[]> => {
  void params.page;
  void params.limit;
  void params.sort;
  let rows = mockPlatformUsers;
  if (params.role && params.role !== 'all') {
    rows = rows.filter((u) => u.role === params.role);
  }
  if (params.tenantId) {
    rows = rows.filter((u) => u.tenantId === params.tenantId);
  }
  if (typeof params.active === 'boolean') {
    rows = rows.filter((u) => u.isActive === params.active);
  }
  if (params.q) {
    const q = params.q.toLowerCase();
    rows = rows.filter(
      (u) =>
        u.fullName.toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q),
    );
  }
  return delay(rows);
};

export const fetchLookup = async (kind: LookupKind): Promise<LookupRow[]> =>
  delay(mockLookups[kind] ?? []);

export const fetchAuditLog = async (
  params: AuditListParams = {},
): Promise<AuditEntry[]> => {
  void params.page;
  void params.limit;
  void params.sort;
  let rows = mockAudit;
  if (params.severity && params.severity !== 'all') {
    rows = rows.filter((a) => a.severity === params.severity);
  }
  if (params.actorRole && params.actorRole !== 'all') {
    rows = rows.filter((a) => a.actorRole === params.actorRole);
  }
  if (params.q) {
    const q = params.q.toLowerCase();
    rows = rows.filter(
      (a) =>
        a.action.toLowerCase().includes(q) ||
        a.actorName.toLowerCase().includes(q) ||
        (a.resourceId ?? '').toLowerCase().includes(q) ||
        (a.notes ?? '').toLowerCase().includes(q),
    );
  }
  return delay(rows);
};
