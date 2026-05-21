/**
 * Auth identity contracts.
 *
 * Roles collapsed to 7 (2026-05 refresh): frontdesk merges the old
 * receptionist + nurse + cashier roles; pharma replaces pharmacist;
 * inventory replaces inventory_clerk; lab_radio replaces the split
 * lab_technician + radiology_technician roles; chief_doctor is a new
 * role that grants both doctor-app and owner-app access; admin folds
 * into owner. `UserProfile` is a discriminated union by `role`, with
 * `allRoles` carrying every role the user holds (for multi-role).
 */

export type Iso8601 = string;
export type Uuid = string;

export type UserRole =
  | 'frontdesk'
  | 'doctor'
  | 'chief_doctor'
  | 'pharma'
  | 'inventory'
  | 'lab_radio'
  | 'owner';

interface UserProfileBase {
  id: Uuid;
  fullName: string;
  avatarUrl?: string;
  stationSlug?: string;
  /**
   * Every role the user holds. Includes `role` (primary) as one entry.
   * Layout guards check this set so a multi-role user can reach every
   * app they're entitled to.
   */
  allRoles: UserRole[];
}

export interface DoctorProfile extends UserProfileBase {
  role: 'doctor';
  specialization: string;
  registrationNo: string;
}

export interface ChiefDoctorProfile extends UserProfileBase {
  role: 'chief_doctor';
  specialization: string;
  registrationNo: string;
}

export interface FrontdeskProfile extends UserProfileBase {
  role: 'frontdesk';
}

export interface PharmaProfile extends UserProfileBase {
  role: 'pharma';
}

export interface InventoryProfile extends UserProfileBase {
  role: 'inventory';
}

export interface LabRadioProfile extends UserProfileBase {
  role: 'lab_radio';
}

export interface OwnerProfile extends UserProfileBase {
  role: 'owner';
}

export type UserProfile =
  | DoctorProfile
  | ChiefDoctorProfile
  | FrontdeskProfile
  | PharmaProfile
  | InventoryProfile
  | LabRadioProfile
  | OwnerProfile;

export interface AuthSession {
  accessToken: string;
  expiresAt: Iso8601;
  user: UserProfile;
}

/**
 * Helper — true when the user holds the given role (primary or secondary).
 * Replaces the old `user.role === X` check throughout the app.
 */
export function hasRole(user: { role: UserRole; allRoles: UserRole[] } | null | undefined, role: UserRole): boolean {
  if (!user) return false;
  return user.role === role || user.allRoles.includes(role);
}

export function hasAnyRole(user: { role: UserRole; allRoles: UserRole[] } | null | undefined, roles: UserRole[]): boolean {
  if (!user) return false;
  return roles.some((r) => user.role === r || user.allRoles.includes(r));
}

/**
 * Owner bypasses every per-app role gate — they get read access to
 * every operational surface so they can drill into any worklist without
 * being bounced to a login screen.
 */
export function isSuperRole(role: UserRole): boolean {
  return role === 'owner';
}

/**
 * Single source of truth for "where does role X land after login?".
 */
export function homeForRole(role: UserRole): string {
  switch (role) {
    case 'frontdesk':    return '/frontdesk/station';
    case 'doctor':
    case 'chief_doctor': return '/doctor/queue';
    case 'pharma':       return '/pharmacy/queue';
    case 'inventory':    return '/inventory/medicines';
    case 'lab_radio':    return '/diagnostics/lab';
    case 'owner':        return '/owner/dashboard';
  }
}

/* ---------- Capability gates ---------- */

/**
 * Capabilities are orthogonal to roles — a single physical user can wear
 * multiple hats (multi-role), and each role contributes a set of
 * capabilities. Layout guards check the capability, not the role string.
 *
 * - `take_payment` — can record a tender on an invoice.
 * - `open_shift`   — can declare an opening float and unlock the till.
 * - `close_shift`  — can reconcile method tallies + variance and lock the
 *                    till at end of shift.
 */
export type Capability = 'take_payment' | 'open_shift' | 'close_shift';

const ROLE_CAPABILITIES: Record<UserRole, Capability[]> = {
  // Frontdesk physically operates the till: takes payments and runs the
  // close at end of shift. They cannot open the day's shift — that's
  // the owner's / chief doctor's responsibility (cash float oversight).
  frontdesk:    ['take_payment', 'close_shift'],
  doctor:       [],
  // Chief doctor co-runs the practice with the owner — same till
  // oversight rights, no payment-taking (they're not on the desk).
  chief_doctor: ['open_shift', 'close_shift'],
  pharma:       [],
  inventory:    [],
  lab_radio:    [],
  // Owner has full till oversight (open + close); the take-payment seat
  // belongs to whoever is physically at the desk.
  owner:        ['open_shift', 'close_shift'],
};

export function roleHas(role: UserRole, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

/**
 * Multi-role aware capability check — returns true when ANY of the
 * user's roles carries the capability. Use this instead of `roleHas`
 * whenever the user could legitimately hold a secondary role that
 * grants the capability (e.g. doctor + chief_doctor).
 */
export function userHas(
  user: { role: UserRole; allRoles: UserRole[] } | null | undefined,
  capability: Capability,
): boolean {
  if (!user) return false;
  if (roleHas(user.role, capability)) return true;
  return user.allRoles.some((r) => roleHas(r, capability));
}
