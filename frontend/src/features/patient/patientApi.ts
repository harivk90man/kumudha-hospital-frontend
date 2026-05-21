import { httpClient } from '@/lib/http/httpClient';
import type {
  CreatePatientInput,
  KinRelationship,
  LinkedPatient,
  PatientSummary,
  UpdatePatientInput,
} from './patientTypes';
// Cross-feature mock fallbacks for fetchPatient — see its TSDoc. Real
// backend doesn't need these (one patients table, FK joins). Imports
// are deep-pathed to the mock files (NOT the feature barrels) to avoid
// any risk of pulling the runtime feature index into a cycle.
import { mockQueue } from '@/features/encounter/__mocks__/encounterMocks';
import { mockAppointments } from '@/features/appointments/__mocks__/appointmentsMocks';
import { mockPatientsByUhid as seedPatientsByUhid } from './__mocks__/patientMocks';

const delay = <T>(value: T, ms = 250): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

/**
 * Patient API surface. Mocked today; signatures match the final backend contract.
 *
 * Wire points:
 *  GET  /api/patients/:uhid                       → fetchPatient
 *  GET  /api/patients?mobile=...                  → searchPatientsByMobile
 *  POST /api/patients                             → createPatient
 *  GET  /api/patients/:uhid/linked                → findLinkedPatients
 *      Backend joins patient_kin (TSD-03) + patients sharing the same
 *      mobile_e164 (BRD §5 same-mobile family lookup) and returns the
 *      relationship label ('mother' | 'father' | 'spouse' | ...).
 */

/**
 * Mock-only declared-kin map. Mirrors the `patient_kin` table TSD-03
 * §4.5 — a hand-curated list of declared family relationships across
 * different mobiles (so they wouldn't be picked up by the
 * shared-mobile join). Empty for any UHID not listed.
 */
const declaredKinByUhid: Record<
  string,
  Array<{ uhid: string; relationship: KinRelationship; relationshipSpecific?: string }>
> = {
  // Karthik's father — different mobile from the rest of his family.
  'KH-2026-00045': [
    { uhid: 'KH-2018-00094', relationship: 'father' },
  ],
};

export const findLinkedPatients = async (uhid: string): Promise<LinkedPatient[]> => {
  const me = mockPatientsByUhid[uhid];
  if (!me) return delay([]);

  const seen = new Set<string>([uhid]);
  const links: LinkedPatient[] = [];

  // Same-mobile family (BRD §5: one mobile shared across kin).
  for (const other of Object.values(mockPatientsByUhid)) {
    if (seen.has(other.uhid)) continue;
    if (other.mobile === me.mobile) {
      links.push({
        patient: other,
        relationship: 'other',
        relationshipSpecific: 'family',
        sharedMobile: true,
      });
      seen.add(other.uhid);
    }
  }

  // Declared kin with a different mobile (real backend reads patient_kin).
  for (const k of declaredKinByUhid[uhid] ?? []) {
    if (seen.has(k.uhid)) continue;
    const other = mockPatientsByUhid[k.uhid];
    if (!other) continue;
    links.push({
      patient: other,
      relationship: k.relationship,
      relationshipSpecific: k.relationshipSpecific,
      sharedMobile: false,
    });
    seen.add(k.uhid);
  }

  return delay(links);
};

/* ---------- Front-desk: lookup + register (BRD §1 step 2) ---------- */

/**
 * In-memory patient registry — seeded from the master `mockPatients`
 * catalogue in `__mocks__/patientMocks.ts` (single source of truth) so
 * encounter / appointment / billing / lab / radiology / pharmacy mocks
 * all reference the same identities. Kept module-mutable so
 * `createPatient` can append new walk-ins.
 *
 * Real backend has the same single `patients` table indexed by UHID;
 * this just mirrors that registry for the demo.
 */
const mockPatientsByUhid: Record<string, PatientSummary> = { ...seedPatientsByUhid };

/**
 * Exact lookup by UHID — used by the patient profile page.
 * Falls back to mock data for encounter/appointment records not yet in DB.
 */
export const fetchPatient = async (uhid: string): Promise<PatientSummary | null> => {
  try {
    return await httpClient.get<PatientSummary>(`/patients/${uhid.toUpperCase()}`);
  } catch {
    // Fall back to mock for encounter/appointment snapshots not in DB yet
    let found: PatientSummary | null = mockPatientsByUhid[uhid] ?? null;
    if (!found) found = mockQueue.find((q) => q.patient.uhid === uhid)?.patient ?? null;
    if (!found) found = mockAppointments.find((a) => a.patient.uhid === uhid)?.patient ?? null;
    return found;
  }
};

/**
 * Search patients by UHID prefix or mobile — real API, paginated.
 * Returns the content array from the paginated response.
 */
export const searchPatientsByMobile = async (q: string): Promise<PatientSummary[]> => {
  const trimmed = q.trim();
  if (!trimmed) return [];
  try {
    const result = await httpClient.get<{ content: PatientSummary[] }>(
      '/patients',
      { params: { q: trimmed, size: 10 } },
    );
    return result.content;
  } catch {
    return [];
  }
};

/**
 * Server issues `uhid` from `uhid_sequences` (per-tenant, per-year). Mock
 * stores the freshly-created patient so subsequent lookups find them.
 */
export const createPatient = async (input: CreatePatientInput): Promise<PatientSummary> => {
  const created = await httpClient.post<PatientSummary>('/patients', input);
  mockPatientsByUhid[created.uhid] = created;
  return created;
};

const ageFromDob = (dateOfBirth: string): number => {
  const d = new Date(dateOfBirth);
  const now = new Date();
  return Math.max(
    0,
    now.getFullYear() -
      d.getFullYear() -
      (now < new Date(now.getFullYear(), d.getMonth(), d.getDate()) ? 1 : 0),
  );
};

/**
 * Update an existing patient. UHID is immutable per TSD-03 §4.1 (and is
 * therefore a path param, not a field). Real backend wire point:
 *   PATCH /api/patients/:uhid
 */
export const updatePatient = async (
  uhid: string,
  input: UpdatePatientInput,
): Promise<PatientSummary> => {
  // Same fallback chain as fetchPatient — find the patient via queue
  // or appointment snapshots when they're not in the patients registry
  // yet. The first edit "promotes" the snapshot to the registry so
  // subsequent reads + writes are consistent. Real backend doesn't
  // need this — the patients table is the single source.
  let existing: PatientSummary | undefined = mockPatientsByUhid[uhid];
  if (!existing) {
    existing = mockQueue.find((q) => q.patient.uhid === uhid)?.patient;
  }
  if (!existing) {
    existing = mockAppointments.find((a) => a.patient.uhid === uhid)?.patient;
  }
  if (!existing) throw new Error(`Patient ${uhid} not found`);
  const next: PatientSummary = {
    ...existing,
    firstName: input.firstName,
    lastName: input.lastName,
    fullName: `${input.firstName} ${input.lastName}`.trim(),
    gender: input.gender,
    dateOfBirth: input.dateOfBirth ?? existing.dateOfBirth,
    ageYears: input.dateOfBirth ? ageFromDob(input.dateOfBirth) : existing.ageYears,
    mobile: input.mobile,
    altMobile: input.altMobile,
    email: input.email,
    bloodGroup: input.bloodGroup,
    address: input.address ?? existing.address,
    allergies: (input.allergies ?? []).map((a) => ({ allergen: a })),
    chronicConditions: input.chronicConditions ?? [],
  };
  mockPatientsByUhid[uhid] = next;
  return delay(next, 200);
};
