import type {
  ChiefDoctorProfile,
  DoctorProfile,
  FrontdeskProfile,
  InventoryProfile,
  LabRadioProfile,
  OwnerProfile,
  PharmaProfile,
  UserProfile,
  UserRole,
} from '../authTypes';

/* ──────────────────────────────────────────────────────────────────────────
 *  Mock user catalogue + credentials
 *  --------------------------------------------------------------------------
 *  10 users covering the 7-role spec:
 *    - Priya  → frontdesk
 *    - 5 doctors (Naveen, Anand, Meera, Lakshmi, Ravi); Naveen also
 *      holds chief_doctor as a secondary role so he sees both the
 *      doctor app AND the owner dashboard.
 *    - Amudha → pharma
 *    - Suresh → inventory
 *    - Gopi   → lab_radio (covers both lab + radiology in one role)
 *    - Kuppan → owner
 *
 *  Password for every user is `123123` (`USER_PASSWORDS` map below) —
 *  the mock login fallback in `authApi.ts` validates against this.
 * ────────────────────────────────────────────────────────────────────────── */

/* ---------- Doctors (5) ---------- */

/**
 * Demo anchor. Holds two roles — primary `doctor` (so the post-login
 * landing is the queue) and secondary `chief_doctor` (so the owner
 * dashboard is also reachable from his account).
 */
export const mockDoctor: DoctorProfile = {
  id: 'usr-doc-001',
  fullName: 'Dr. K Naveen Kumar',
  role: 'doctor',
  allRoles: ['doctor', 'chief_doctor'],
  specialization: 'Orthopaedics',
  registrationNo: 'KMC-67821',
};

export const mockDoctorAnand: DoctorProfile = {
  id: 'usr-doc-002',
  fullName: 'Dr. Anand Krishnan',
  role: 'doctor',
  allRoles: ['doctor'],
  specialization: 'General Medicine',
  registrationNo: 'KMC-58112',
};

export const mockDoctorMeera: DoctorProfile = {
  id: 'usr-doc-003',
  fullName: 'Dr. Meera Suresh',
  role: 'doctor',
  allRoles: ['doctor'],
  specialization: 'Dental',
  registrationNo: 'KMC-71204',
};

export const mockDoctorLakshmi: DoctorProfile = {
  id: 'usr-doc-004',
  fullName: 'Dr. Lakshmi Bharath',
  role: 'doctor',
  allRoles: ['doctor'],
  specialization: 'Obstetrics & Gynaecology',
  registrationNo: 'KMC-69045',
};

export const mockDoctorRavi: DoctorProfile = {
  id: 'usr-doc-005',
  fullName: 'Dr. Ravi Shankar',
  role: 'doctor',
  allRoles: ['doctor'],
  specialization: 'Physiotherapy',
  registrationNo: 'KMC-72319',
};

/* ---------- Non-doctor staff ---------- */

export const mockFrontdesk: FrontdeskProfile = {
  id: 'usr-fro-001',
  fullName: 'Priya Subramanian',
  role: 'frontdesk',
  allRoles: ['frontdesk'],
  stationSlug: 'front_desk',
};

export const mockChiefDoctor: ChiefDoctorProfile = mockDoctor as unknown as ChiefDoctorProfile;

export const mockPharma: PharmaProfile = {
  id: 'usr-pha-001',
  fullName: 'Amudha Joseph',
  role: 'pharma',
  allRoles: ['pharma'],
  stationSlug: 'pharmacy',
};

export const mockInventory: InventoryProfile = {
  id: 'usr-inv-001',
  fullName: 'Suresh Kumar',
  role: 'inventory',
  allRoles: ['inventory'],
};

export const mockLabRadio: LabRadioProfile = {
  id: 'usr-lab-001',
  fullName: 'Gopi Selvam',
  role: 'lab_radio',
  allRoles: ['lab_radio'],
  stationSlug: 'lab_processing',
};

export const mockOwner: OwnerProfile = {
  id: 'usr-own-001',
  fullName: 'Kuppan',
  role: 'owner',
  allRoles: ['owner'],
};

/* ---------- User catalogue (drives the mock-login fallback) ---------- */

/** Master list — login looks up by username (lowercased first name). */
export const mockUsers: UserProfile[] = [
  mockFrontdesk,
  mockDoctor,
  mockDoctorAnand,
  mockDoctorMeera,
  mockDoctorLakshmi,
  mockDoctorRavi,
  mockPharma,
  mockInventory,
  mockLabRadio,
  mockOwner,
];

/**
 * Username key (lowercased first name) → user. The mock login flow
 * accepts the username (e.g., `priya`, `naveen`, `kuppan`) when the
 * password matches `123123`. Real backend would do credentials check.
 */
export const mockUsersByUsername: Record<string, UserProfile> = {
  priya:   mockFrontdesk,
  naveen:  mockDoctor,
  anand:   mockDoctorAnand,
  meera:   mockDoctorMeera,
  lakshmi: mockDoctorLakshmi,
  ravi:    mockDoctorRavi,
  amudha:  mockPharma,
  suresh:  mockInventory,
  gopi:    mockLabRadio,
  kuppan:  mockOwner,
};

/** Shared mock password for every user (real backend hashes per-user). */
export const MOCK_PASSWORD = '123123';

/**
 * Looks up a user by username and verifies the password matches the
 * shared mock password. Returns null on miss so the caller can fall
 * through to "invalid credentials".
 */
export function mockAuthenticate(username: string, password: string): UserProfile | null {
  if (password !== MOCK_PASSWORD) return null;
  const key = username.trim().toLowerCase();
  return mockUsersByUsername[key] ?? null;
}

/**
 * Owner-side helper: replace a user's role set. Used by the (future)
 * `/owner/users` role-assignment page. Mutates the user object in-place
 * so subsequent `useAuth()` reads see the new roles.
 */
export function setUserRoles(userId: string, roles: UserRole[]): UserProfile | null {
  const found = mockUsers.find((u) => u.id === userId);
  if (!found || roles.length === 0) return null;
  // Primary role: prefer doctor / chief_doctor / owner over other roles for landing pages.
  const PRIMARY_PRIORITY: UserRole[] = ['owner', 'chief_doctor', 'doctor', 'frontdesk', 'pharma', 'inventory', 'lab_radio'];
  const primary = PRIMARY_PRIORITY.find((r) => roles.includes(r)) ?? roles[0];
  (found as { role: UserRole }).role = primary;
  found.allRoles = [...roles];
  return found;
}
