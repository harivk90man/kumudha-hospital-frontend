import { supabase, DEMO_USER_ID } from '@/lib/supabase/supabaseClient';
import type {
  CreatePatientInput,
  Gender,
  KinRelationship,
  LinkedPatient,
  PatientAddress,
  PatientSummary,
  UpdatePatientInput,
} from './patientTypes';
import { mockPatientsByUhid as seedPatientsByUhid } from './__mocks__/patientMocks';

/**
 * Patient API surface. DEMO-mode — queries Supabase directly until the
 * Spring backend is built. Schema source of truth:
 *   backend/db/v3-migrations/030_07_patient.sql
 *
 * Tables touched here:
 *   - patients                       (core entity, snake_case columns)
 *   - uhid_sequences                 (per-year atomic counter)
 *   - hospital_profile               (UHID prefix / separator / padding)
 *
 * Allergies + chronic conditions live in child tables
 * (`patient_allergies`, `patient_chronic_conditions`) joined to lookups —
 * not wired here because the demo only needs the parent row to flow
 * through the UI. Allergy / chronic write paths are planned (see PROJECT.md).
 */

/* ---------- Row mapping (snake_case ↔ camelCase boundary) ---------- */

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

const mapRowToPatient = (r: Record<string, unknown>): PatientSummary => {
  const firstName = (r.first_name as string) ?? '';
  const lastName  = (r.last_name  as string) ?? '';
  const dob       = r.date_of_birth as string | undefined;
  return {
    id:           r.id as string,
    uhid:         r.uhid as string,
    firstName,
    lastName,
    fullName:     `${firstName} ${lastName}`.trim(),
    gender:       r.gender as Gender,
    ageYears:     dob ? ageFromDob(dob) : 0,
    dateOfBirth:  dob,
    mobile:       (r.mobile     as string | null) ?? undefined,
    altMobile:    (r.alt_mobile as string | null) ?? undefined,
    email:        (r.email      as string | null) ?? undefined,
    bloodGroup:   (r.blood_group as string | null) ?? undefined,
    address:      (r.address as PatientAddress | null) ?? undefined,
  };
};

/* ---------- UHID generation ---------- */

interface HospitalProfileRow {
  uhid_prefix: string;
  uhid_separator: string;
  uhid_sequence_padding: number;
  uhid_include_year: boolean;
}

/**
 * Generates the next UHID by reading the singleton hospital_profile row
 * for formatting and atomically bumping uhid_sequences for the current
 * year. Real backend does this in a single transaction with row-level
 * locking — for the demo we accept a small race window.
 */
async function generateNextUhid(): Promise<string> {
  const { data: profile, error: profileError } = await supabase
    .from('hospital_profile')
    .select('uhid_prefix, uhid_separator, uhid_sequence_padding, uhid_include_year')
    .limit(1)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  if (!profile) throw new Error('Hospital profile not configured.');

  const p = profile as HospitalProfileRow;
  const year = new Date().getFullYear();

  // Read current counter (if any) then increment.
  const { data: seqRow, error: readError } = await supabase
    .from('uhid_sequences')
    .select('last_seq')
    .eq('year', year)
    .maybeSingle();
  if (readError) throw new Error(readError.message);

  const next = ((seqRow?.last_seq as number | undefined) ?? 0) + 1;

  const { error: upsertError } = await supabase
    .from('uhid_sequences')
    .upsert({ year, last_seq: next }, { onConflict: 'year' });
  if (upsertError) throw new Error(upsertError.message);

  const padded = String(next).padStart(p.uhid_sequence_padding, '0');
  const parts = p.uhid_include_year
    ? [p.uhid_prefix, String(year), padded]
    : [p.uhid_prefix, padded];
  return parts.join(p.uhid_separator);
}

/* ---------- Fallback mock registry (read-only safety net) ----------
 *
 * Patient profile pages may be reached via deep-links into encounter /
 * appointment snapshots whose patient rows pre-date the Supabase DB
 * (legacy seed data only). For these we fall back to the existing
 * mock catalogue so the UI doesn't 404. Real backend doesn't need this.
 */
const mockPatientsByUhid: Record<string, PatientSummary> = { ...seedPatientsByUhid };

/* ---------- API functions ---------- */

/**
 * Exact lookup by UHID. Returns null when no row exists (and no mock
 * fallback matches) — caller decides whether that's a 404.
 */
export const fetchPatient = async (uhid: string): Promise<PatientSummary | null> => {
  const normalized = uhid.toUpperCase();
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('uhid', normalized)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return mapRowToPatient(data);
  // Fall back to mock data for encounter/appointment snapshots not in DB.
  return mockPatientsByUhid[uhid] ?? mockPatientsByUhid[normalized] ?? null;
};

/**
 * Search patients by mobile number (or partial mobile). The frontend
 * registration flow calls this as a pre-flight to surface possible
 * duplicates before creating a new patient.
 */
export const searchPatientsByMobile = async (q: string): Promise<PatientSummary[]> => {
  const trimmed = q.trim();
  if (!trimmed) return [];
  // Treat as a prefix search; ilike makes it case-insensitive (mobiles
  // are digits but UHIDs may also be passed in by the same input).
  const pattern = `%${trimmed}%`;
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .or(`mobile.ilike.${pattern},uhid.ilike.${pattern}`)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(mapRowToPatient);
};

/**
 * Insert a new patient row and return the persisted shape. UHID is
 * generated server-side from `hospital_profile` + `uhid_sequences`.
 * Allergies + chronic conditions are accepted on the input but NOT
 * persisted yet (lookup-table resolution not wired for the demo).
 */
export const createPatient = async (input: CreatePatientInput): Promise<PatientSummary> => {
  const uhid = await generateNextUhid();

  const insertRow = {
    uhid,
    first_name:    input.firstName,
    last_name:     input.lastName,
    date_of_birth: input.dateOfBirth,
    gender:        input.gender,
    blood_group:   input.bloodGroup ?? null,
    mobile:        input.mobile,
    alt_mobile:    input.altMobile ?? null,
    email:         input.email ?? null,
    address:       input.address ?? null,
    created_by:    DEMO_USER_ID,
    updated_by:    DEMO_USER_ID,
    version:       0,
  };

  const { data, error } = await supabase
    .from('patients')
    .insert(insertRow)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return mapRowToPatient(data as Record<string, unknown>);
};

/**
 * Patch an existing patient by UHID. UHID itself is immutable
 * (TSD-03 §4.1) so it's the lookup key, not a payload field.
 */
export const updatePatient = async (
  uhid: string,
  input: UpdatePatientInput,
): Promise<PatientSummary> => {
  const updateRow: Record<string, unknown> = {
    first_name:  input.firstName,
    last_name:   input.lastName,
    gender:      input.gender,
    blood_group: input.bloodGroup ?? null,
    mobile:      input.mobile ?? null,
    alt_mobile:  input.altMobile ?? null,
    email:       input.email ?? null,
    address:     input.address ?? null,
    updated_by:  DEMO_USER_ID,
  };
  if (input.dateOfBirth) updateRow.date_of_birth = input.dateOfBirth;

  const { data, error } = await supabase
    .from('patients')
    .update(updateRow)
    .eq('uhid', uhid.toUpperCase())
    .is('deleted_at', null)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return mapRowToPatient(data as Record<string, unknown>);
};

/* ---------- Linked patients (same-mobile family lookup) ---------- */

/**
 * Mock-only declared-kin map. Mirrors the `patient_kin` table TSD-03 §4.5
 * which does NOT exist in v3 yet. Kept here so the linked-patients popover
 * still surfaces a known cross-mobile relationship for the demo anchor.
 */
const declaredKinByUhid: Record<
  string,
  Array<{ uhid: string; relationship: KinRelationship; relationshipSpecific?: string }>
> = {
  'KH-2026-00045': [{ uhid: 'KH-2018-00094', relationship: 'father' }],
};

/**
 * Returns every patient who shares this patient's mobile (real DB lookup)
 * plus any declared cross-mobile kin (mock fallback — patient_kin table
 * is not in v3). Empty list when the patient isn't found or has no kin.
 */
export const findLinkedPatients = async (uhid: string): Promise<LinkedPatient[]> => {
  const me = await fetchPatient(uhid);
  if (!me) return [];

  const links: LinkedPatient[] = [];
  const seen = new Set<string>([uhid]);

  // Same-mobile family — straight DB lookup.
  if (me.mobile) {
    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .eq('mobile', me.mobile)
      .neq('id', me.id)
      .is('deleted_at', null);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const other = mapRowToPatient(row);
      if (seen.has(other.uhid)) continue;
      links.push({
        patient: other,
        relationship: 'other',
        relationshipSpecific: 'family',
        sharedMobile: true,
      });
      seen.add(other.uhid);
    }
  }

  // Declared kin with a different mobile — mock until patient_kin lands.
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

  return links;
};
