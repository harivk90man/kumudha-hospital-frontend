import type { LinkedPatient, PatientSummary } from '../patientTypes';

/**
 * Master patient catalogue â€” the single source of truth every other
 * mock file (encounter, appointments, billing, lab, radiology, pharmacy,
 * consultation) reads from to keep referential integrity. Real backend
 * has the same single `patients` table; this just mirrors that.
 *
 * 30 patients (refreshed 2026-05): 5 family clusters (14 members) plus
 * 16 singletons, mixed Tamil / Hindi / Malayalam / Telugu / Muslim
 * Chennai-area names. Demographics tuned for a believable demo cohort:
 *   - paediatric:   4   (1y, 5y, 9y, 11y)
 *   - young adult:  6   (26-35)
 *   - middle-aged:  7   (38-51)
 *   - older:        6   (58-67)
 *   - elderly:      7   (71-88)
 * ~15 patients carry chronic conditions, ~7 carry drug/food allergies.
 */

const CHENNAI = (line1: string, pincode: string) =>
  ({ line1, city: 'Chennai', pincode, state: 'Tamil Nadu' });

const sum = (
  id: string,
  uhid: string,
  fullName: string,
  gender: 'm' | 'f' | 'o',
  ageYears: number,
  mobile: string,
  bloodGroup: string | undefined,
  address: ReturnType<typeof CHENNAI>,
  allergens: string[],
  chronics: string[],
): PatientSummary => {
  const spaceIdx = fullName.lastIndexOf(' ');
  const firstName = spaceIdx > 0 ? fullName.slice(0, spaceIdx) : fullName;
  const lastName  = spaceIdx > 0 ? fullName.slice(spaceIdx + 1) : '';
  return {
    id,
    uhid,
    firstName,
    lastName,
    fullName,
    gender,
    ageYears,
    mobile,
    bloodGroup,
    address,
    allergies: allergens.map((a) => ({
      allergen: a,
      drugClassCode: a.toLowerCase().includes('penicillin')
        ? 'penicillin'
        : a.toLowerCase().includes('sulfa')
          ? 'sulfa'
          : a.toLowerCase().includes('nsaid')
            ? 'nsaid'
            : a.toLowerCase().includes('iodinated')
              ? 'iodine'
              : undefined,
    })),
    chronicConditions: chronics,
  };
};

export const mockPatients: PatientSummary[] = [
  /* Family 1 â€” Raghavan (Anna Nagar) â€” 4 members.
   * Karthik (KH-2026-00045) is the demo anchor used by the consultation
   * seed and the LinkedPatientsButton popover. */
  sum('pat-001', 'KH-2026-00045', 'Karthik R.',     'm', 42, '+91 98430 12121', 'B+', CHENNAI('12 Anna Nagar 3rd Cross', '600040'), ['Penicillin'], ['Hypertension']),
  sum('pat-002', 'KH-2024-08812', 'Geetha R.',      'f', 39, '+91 98430 12121', 'A+', CHENNAI('12 Anna Nagar 3rd Cross', '600040'), [], ['Hypothyroidism']),
  sum('pat-003', 'KH-2025-11203', 'Aarav R.',       'm', 11, '+91 98430 12121', undefined, CHENNAI('12 Anna Nagar 3rd Cross', '600040'), [], []),
  sum('pat-004', 'KH-2018-00094', 'Sundar R.', 'm', 71, '+91 96754 23867', 'B+', CHENNAI('7 Velachery Main Road', '600042'), [], ['Type 2 Diabetes', 'Hypertension', 'CAD']),

  /* Family 2 â€” Selvam (Mylapore) â€” 3 members. */
  sum('pat-005', 'KH-2026-00046', 'Meera S.',         'f', 58, '+91 99100 12434', 'O+', CHENNAI('45 Luz Church Road', '600004'), [], ['Type 2 Diabetes', 'Osteoarthritis']),
  sum('pat-006', 'KH-2023-04501', 'Rajan S.',         'm', 62, '+91 99100 12434', 'O+', CHENNAI('45 Luz Church Road', '600004'), ['NSAID'], ['Hypertension', 'CKD']),
  sum('pat-007', 'KH-2025-09812', 'Anjali S.',        'f', 26, '+91 99100 12434', 'A-', CHENNAI('45 Luz Church Road', '600004'), [], []),

  /* Family 3 â€” Babu (Adyar) â€” 2 members. */
  sum('pat-008', 'KH-2026-00047', 'Ramesh B.',          'm', 67, '+91 90080 56788', 'A+', CHENNAI('22 Indira Nagar 2nd Avenue', '600020'), ['Sulfa'], ['CAD', 'Hypertension']),
  sum('pat-009', 'KH-2024-06210', 'Sundari B.',         'f', 64, '+91 90080 56788', 'A+', CHENNAI('22 Indira Nagar 2nd Avenue', '600020'), [], ['Type 2 Diabetes']),

  /* Family 4 â€” Sharma (Velachery) â€” 3 members. */
  sum('pat-010', 'KH-2026-00048', 'Aarav K.',         'm', 9,  '+91 88997 65302', 'AB+', CHENNAI('14 Phoenix Apartments, Velachery', '600042'), [], []),
  sum('pat-011', 'KH-2024-03301', 'Vivek K.',         'm', 41, '+91 88997 65302', 'B+', CHENNAI('14 Phoenix Apartments, Velachery', '600042'), [], []),
  sum('pat-012', 'KH-2024-03302', 'Priya K.',         'f', 38, '+91 88997 65302', 'O+', CHENNAI('14 Phoenix Apartments, Velachery', '600042'), [], ['Asthma']),

  /* Family 5 â€” Khan (Saidapet) â€” 2 members. */
  sum('pat-013', 'KH-2025-08801', 'Imran Khan',           'm', 35, '+91 89393 11220', 'B+', CHENNAI('18 Mount Road, Saidapet', '600015'), [], []),
  sum('pat-014', 'KH-2025-08802', 'Sameera Khan',         'f', 30, '+91 89393 11220', 'B+', CHENNAI('18 Mount Road, Saidapet', '600015'), [], []),

  /* ---------- Singletons (16) ---------- */
  sum('pat-015', 'KH-2026-00049', 'Lakshmi N.',   'f', 71, '+91 87654 32114', 'B-', CHENNAI('9 Pondy Bazaar, T. Nagar', '600017'), [], ['Osteoporosis', 'Hypertension']),
  sum('pat-016', 'KH-2020-00721', 'Naren K.',  'm', 76, '+91 87654 32115', 'B-', CHENNAI('14 Triplicane', '600005'), [], ['CAD', 'Hypertension', 'Type 2 Diabetes']),
  sum('pat-017', 'KH-2026-00050', 'Suresh B.',          'm', 49, '+91 95000 23456', 'A+', CHENNAI('33 GST Road, Tambaram', '600045'), [], ['Hypertension']),
  sum('pat-018', 'KH-2026-00051', 'Sunita V.',         'f', 34, '+91 90909 80155', 'O+', CHENNAI('21 Velachery 1st Cross', '600042'), [], []),
  sum('pat-019', 'KH-2026-00052', 'Vikram B.',         'm', 51, '+91 88112 34512', 'A+', CHENNAI('77 OMR, Sholinganallur', '600119'), [], ['Hypertension', 'Hyperlipidemia']),
  sum('pat-020', 'KH-2026-00053', 'Aisha S.',         'f', 28, '+91 77665 54381', 'O-', CHENNAI('30 Royapettah High Road', '600014'), ['Penicillin'], []),
  sum('pat-021', 'KH-2026-00054', 'Ravi A.',          'm', 45, '+91 91234 50012', 'AB+', CHENNAI('66 Anna Nagar West', '600040'), [], ['Type 2 Diabetes']),
  sum('pat-022', 'KH-2026-00055', 'Divya M.',         'f', 32, '+91 91234 50013', 'A+', CHENNAI('11 Adyar Bridge Road', '600020'), [], []),
  sum('pat-023', 'KH-2026-00058', 'Sanjay Murthy',        'm', 60, '+91 91234 50016', 'A-', CHENNAI('41 T. Nagar', '600017'), [], ['Hypertension', 'COPD']),
  sum('pat-024', 'KH-2026-00061', 'Latha Devi',           'f', 67, '+91 91234 50019', 'A+', CHENNAI('27 Anna Nagar East', '600102'), [], ['Type 2 Diabetes', 'Hypertension', 'Osteoarthritis']),
  sum('pat-025', 'KH-2026-00064', 'Manjunath Daniel',     'm', 71, '+91 91234 50022', 'B+', CHENNAI('5 Mylapore Mada Street', '600004'), [], ['CAD', 'CKD', 'Type 2 Diabetes']),
  sum('pat-026', 'KH-2026-00068', 'Kishore B.',     'm', 78, '+91 91234 50026', 'A+', CHENNAI('60 Triplicane', '600005'), ['Sulfa'], ['CAD', 'Hypertension', 'Type 2 Diabetes']),
  sum('pat-027', 'KH-2024-04401', 'Anand M.',         'm', 88, '+91 91234 50057', 'A+', CHENNAI('19 Mylapore Kapaleeshwar Lane', '600004'), [], ['CAD', 'CKD', 'Hypertension', 'Type 2 Diabetes']),
  sum('pat-028', 'KH-2024-04420', 'Tamilarasan M',        'm', 80, '+91 91234 50076', 'A+', CHENNAI('22 Porur Lake View', '600116'), [], ['CAD', 'CKD', 'Hypertension']),
  sum('pat-029', 'KH-2024-04424', 'Yogesh Sivan',         'm', 5,  '+91 91234 50080', undefined, CHENNAI('22 Adyar 4th Cross', '600020'), [], []),
  sum('pat-030', 'KH-2024-04425', 'Zara Khan',            'f', 1,  '+91 91234 50081', undefined, CHENNAI('11 Saidapet East', '600015'), [], []),
];

/* ---------- Indices for downstream mocks ---------- */

/** UHID â†’ patient lookup. Single source for every other mock file. */
export const mockPatientsByUhid: Record<string, PatientSummary> =
  Object.fromEntries(mockPatients.map((p) => [p.uhid, p]));

/**
 * Lookup-by-uhid with a deterministic legacy fallback.
 *
 * Real backend would 404 a non-existent UHID; here, legacy billing /
 * pharmacy / lab / radiology seeds may still reference UHIDs that were
 * pruned during the 2026-05 patient-cohort refresh. To keep those mocks
 * loading cleanly, we hash unknown UHIDs onto a real patient instead of
 * throwing â€” the seed entry just shows up against the hashed patient.
 * Genuine integrity violations should still be caught by feature
 * authors when they wire NEW data; the fallback is intentionally
 * deterministic (same input â†’ same patient) so demos stay stable.
 */
export const findPatient = (uhid: string): PatientSummary => {
  const found = mockPatientsByUhid[uhid];
  if (found) return found;
  const pool = Object.values(mockPatientsByUhid);
  const hash = [...uhid].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return pool[hash % pool.length];
};

/* ---------- Linked-patients seed (back-compat export) ---------- */

/**
 * Karthik R.'s family â€” 2 same-mobile members + father on a
 * different mobile (declared kin). Drives the LinkedPatientsButton
 * popover for the demo anchor patient.
 */
export const mockLinkedPatients: LinkedPatient[] = [
  {
    relationship: 'other',
    relationshipSpecific: 'spouse',
    sharedMobile: true,
    patient: findPatient('KH-2024-08812'),
  },
  {
    relationship: 'child',
    relationshipSpecific: 'son',
    sharedMobile: true,
    patient: findPatient('KH-2025-11203'),
  },
  {
    relationship: 'father',
    sharedMobile: false,
    patient: findPatient('KH-2018-00094'),
  },
];
