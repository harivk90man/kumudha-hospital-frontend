/**
 * Platform-admin types. Maps to TSD-01 (tenants, users, RBAC) and the
 * lookup tables hospital admins manage (departments, allergies,
 * services, etc.).
 *
 * **FE-ahead today** — admin endpoints are not yet shipped. Wire
 * shapes match the planned schema so backend swap-in is mechanical.
 */
import type { Iso8601, UserRole, Uuid } from '@/features/auth';

/* ---------- Tenants (TSD-01 §4.1) ---------- */

export interface Tenant {
  id: Uuid;
  /** TSD-01 tenants.slug — short stable handle. */
  slug: string;
  /** Display name on the patient card / receipts. */
  displayName: string;
  /** UHID prefix configured at onboarding (BRD Patient Identity Model). */
  uhidPrefix: string;
  /** UHID number padding length (e.g., 6 → KH-000001). */
  uhidNumberLength: number;
  city: string;
  state?: string;
  /** Whether the tenant is currently licensed / active. */
  isActive: boolean;
  /** Total active users across all roles. */
  userCount: number;
  createdAt: Iso8601;
}

/* ---------- Users + roles (TSD-01 §4.4 / §4.5) ---------- */

export interface PlatformUser {
  id: Uuid;
  fullName: string;
  email?: string;
  phone?: string;
  role: UserRole;
  tenantId: Uuid;
  tenantName: string;
  isActive: boolean;
  /** When the user was last seen / signed in. */
  lastLoginAt?: Iso8601;
  createdAt: Iso8601;
}

/* ---------- Lookup tables (admin maintains these) ---------- */

export type LookupKind = 'departments' | 'allergies' | 'services' | 'states';

export interface LookupRow {
  id: Uuid;
  /** Stable code/slug (machine-friendly). */
  code: string;
  /** Display label. */
  label: string;
  /** Free notes describing the row. */
  notes?: string;
  isActive: boolean;
}

/* ---------- Audit (TSD-02 §4.1) ---------- */

export type AuditSeverity = 'info' | 'warn' | 'critical';

export interface AuditEntry {
  id: Uuid;
  occurredAt: Iso8601;
  actorName: string;
  actorRole: UserRole;
  /** Short verb: 'patient.created', 'invoice.refunded', 'consultation.locked', … */
  action: string;
  resourceType: string;
  resourceId?: string;
  severity: AuditSeverity;
  notes?: string;
}

/* ---------- List params ---------- */

export interface ListParams {
  page?: number;
  limit?: number;
  sort?: string;
  q?: string;
}

export interface UsersListParams extends ListParams {
  role?: UserRole | 'all';
  tenantId?: Uuid;
  active?: boolean;
}

export interface AuditListParams extends ListParams {
  severity?: AuditSeverity | 'all';
  actorRole?: UserRole | 'all';
}
