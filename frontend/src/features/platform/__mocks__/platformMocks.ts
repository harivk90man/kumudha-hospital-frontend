import type {
  AuditEntry,
  LookupRow,
  PlatformUser,
  Tenant,
} from '../platformTypes';

const minutesAgo = (m: number): string =>
  new Date(Date.now() - m * 60 * 1000).toISOString();

export const mockTenants: Tenant[] = [
  {
    id: 'ten-001',
    slug: 'kumudha',
    displayName: 'Kumudha Hospital',
    uhidPrefix: 'KH',
    uhidNumberLength: 8,
    city: 'Bangalore',
    state: 'Karnataka',
    isActive: true,
    userCount: 14,
    createdAt: '2024-08-12T09:00:00Z',
  },
  {
    id: 'ten-002',
    slug: 'sankara',
    displayName: 'Sankara Speciality',
    uhidPrefix: 'SS',
    uhidNumberLength: 7,
    city: 'Coimbatore',
    state: 'Tamil Nadu',
    isActive: true,
    userCount: 23,
    createdAt: '2024-11-04T09:00:00Z',
  },
  {
    id: 'ten-003',
    slug: 'cityclinic',
    displayName: 'City Clinic (pilot)',
    uhidPrefix: 'CC',
    uhidNumberLength: 6,
    city: 'Mysuru',
    state: 'Karnataka',
    isActive: false,
    userCount: 4,
    createdAt: '2025-02-19T09:00:00Z',
  },
];

export const mockPlatformUsers: PlatformUser[] = [
  { id: 'usr-doc-001', fullName: 'Dr. Naveen Kumar', email: 'naveen@kumudha.in',  role: 'doctor',          tenantId: 'ten-001', tenantName: 'Kumudha Hospital', isActive: true, lastLoginAt: minutesAgo(30),  createdAt: '2024-09-01T09:00:00Z' },
  { id: 'usr-doc-002', fullName: 'Dr. Anand',  email: 'anand@kumudha.in',   role: 'doctor',          tenantId: 'ten-001', tenantName: 'Kumudha Hospital', isActive: true, lastLoginAt: minutesAgo(120), createdAt: '2024-09-05T09:00:00Z' },
  { id: 'usr-doc-003', fullName: 'Dr. Meera',    email: 'meera@kumudha.in',   role: 'doctor',          tenantId: 'ten-001', tenantName: 'Kumudha Hospital', isActive: true, lastLoginAt: minutesAgo(45),  createdAt: '2024-09-07T09:00:00Z' },
  { id: 'usr-fro-001', fullName: 'Priya Subramanian',   email: 'priya@kumudha.in',   role: 'frontdesk', tenantId: 'ten-001', tenantName: 'Kumudha Hospital', isActive: true, lastLoginAt: minutesAgo(8),    createdAt: '2024-09-10T09:00:00Z' },
  { id: 'usr-pha-001', fullName: 'Amudha Joseph',       email: 'amudha@kumudha.in',  role: 'pharma',    tenantId: 'ten-001', tenantName: 'Kumudha Hospital', isActive: true, lastLoginAt: minutesAgo(50),   createdAt: '2024-10-04T09:00:00Z' },
  { id: 'usr-inv-001', fullName: 'Suresh Kumar',         email: 'suresh@kumudha.in',  role: 'inventory', tenantId: 'ten-001', tenantName: 'Kumudha Hospital', isActive: true, lastLoginAt: minutesAgo(180),  createdAt: '2024-10-04T09:00:00Z' },
  { id: 'usr-lab-001', fullName: 'Gopi Selvam',            email: 'gopi@kumudha.in',    role: 'lab_radio', tenantId: 'ten-001', tenantName: 'Kumudha Hospital', isActive: true, lastLoginAt: minutesAgo(40),   createdAt: '2024-10-04T09:00:00Z' },
  { id: 'usr-own-001', fullName: 'Kuppan',               email: 'kuppan@kumudha.in',  role: 'owner',     tenantId: 'ten-001', tenantName: 'Kumudha Hospital', isActive: true, lastLoginAt: minutesAgo(1440), createdAt: '2024-08-12T09:00:00Z' },
  { id: 'usr-doc-003b', fullName: 'Dr. Meera',   email: 'meera@sankara.in',   role: 'doctor',    tenantId: 'ten-002', tenantName: 'Sankara Speciality', isActive: true, lastLoginAt: minutesAgo(60),  createdAt: '2024-11-08T09:00:00Z' },
];

export const mockLookups: Record<string, LookupRow[]> = {
  departments: [
    { id: 'lkp-d1', code: 'orthopaedics',      label: 'Orthopaedics',      isActive: true },
    { id: 'lkp-d2', code: 'general_medicine',  label: 'General Medicine',  isActive: true },
    { id: 'lkp-d3', code: 'pediatrics',        label: 'Pediatrics',        isActive: true },
    { id: 'lkp-d4', code: 'dermatology',       label: 'Dermatology',       isActive: true },
    { id: 'lkp-d5', code: 'ent',               label: 'ENT',               isActive: true },
    { id: 'lkp-d6', code: 'gynaecology',       label: 'Gynaecology',       isActive: true },
    { id: 'lkp-d7', code: 'cardiology',        label: 'Cardiology',        isActive: false, notes: 'Coming Phase-2 with cath lab.' },
  ],
  allergies: [
    { id: 'lkp-a1', code: 'penicillin', label: 'Penicillin',          notes: 'Drug class â€” antibiotic.', isActive: true },
    { id: 'lkp-a2', code: 'sulfa',      label: 'Sulfa',               notes: 'Drug class â€” antibiotic.', isActive: true },
    { id: 'lkp-a3', code: 'nsaid',      label: 'NSAID',               notes: 'Drug class â€” analgesic.',  isActive: true },
    { id: 'lkp-a4', code: 'iodine',     label: 'Iodinated contrast',  notes: 'Imaging contrast.',        isActive: true },
    { id: 'lkp-a5', code: 'latex',      label: 'Latex',               isActive: true },
    { id: 'lkp-a6', code: 'peanut',     label: 'Peanut',              isActive: true },
  ],
  services: [
    { id: 'lkp-s1', code: 'CONS-OPD',   label: 'OPD consultation',          isActive: true },
    { id: 'lkp-s2', code: 'CONS-FU',    label: 'Follow-up consultation',    isActive: true },
    { id: 'lkp-s3', code: 'LAB-CBC',    label: 'Complete Blood Count',      isActive: true },
    { id: 'lkp-s4', code: 'RAD-XR-CHT', label: 'X-Ray Chest PA',            isActive: true },
  ],
  states: [
    { id: 'lkp-st1', code: '110',  label: 'Registered',          isActive: true },
    { id: 'lkp-st2', code: '120',  label: 'Awaiting vitals',     isActive: true },
    { id: 'lkp-st3', code: '140',  label: 'Awaiting doctor',     isActive: true },
    { id: 'lkp-st4', code: '150',  label: 'In consultation',     isActive: true },
    { id: 'lkp-st5', code: '500',  label: 'Rx pending',          isActive: true },
    { id: 'lkp-st6', code: '600',  label: 'Completed',           isActive: true },
  ],
};

export const mockAudit: AuditEntry[] = [
  { id: 'aud-001', occurredAt: minutesAgo(2),    actorName: 'Kuppan',             actorRole: 'owner',     action: 'user.created',        resourceType: 'user',         resourceId: 'usr-pha-001',     severity: 'info',     notes: 'Created Pharma user Amudha' },
  { id: 'aud-002', occurredAt: minutesAgo(15),   actorName: 'Priya Subramanian',  actorRole: 'frontdesk', action: 'patient.created',     resourceType: 'patient',      resourceId: 'pat-2002',        severity: 'info' },
  { id: 'aud-003', occurredAt: minutesAgo(20),   actorName: 'Priya Subramanian',  actorRole: 'frontdesk', action: 'invoice.refunded',    resourceType: 'invoice',      resourceId: 'inv-001',         severity: 'warn',     notes: 'Patient declined service' },
  { id: 'aud-004', occurredAt: minutesAgo(35),   actorName: 'Dr. Naveen Kumar', actorRole: 'doctor',    action: 'consultation.locked', resourceType: 'consultation', resourceId: 'OP-2026-00121',   severity: 'info' },
  { id: 'aud-005', occurredAt: minutesAgo(40),   actorName: 'Gopi Selvam',           actorRole: 'lab_radio', action: 'lab_result.released', resourceType: 'lab_order',    resourceId: 'lord-005',        severity: 'info' },
  { id: 'aud-006', occurredAt: minutesAgo(60),   actorName: 'Gopi Selvam',           actorRole: 'lab_radio', action: 'lab_result.critical', resourceType: 'lab_order',    resourceId: 'lord-002',        severity: 'critical', notes: 'K+ 6.4 mmol/L (critical hyperkalaemia)' },
  { id: 'aud-007', occurredAt: minutesAgo(180),  actorName: 'Suresh Kumar',        actorRole: 'inventory', action: 'grn.created',         resourceType: 'grn',          resourceId: 'GRN-2026-000119', severity: 'info' },
];
