/**
 * Patient identity types. Maps to schema v3 module 07-patient.
 *
 * Naming rule: every field name here matches the camelCase form of the
 * corresponding DB column so AI can trace DB → entity → DTO → UI without
 * a mapping table.
 *   DB: first_name     → entity: firstName     → wire: firstName
 *   DB: date_of_birth  → entity: dateOfBirth   → wire: dateOfBirth
 *   DB: mobile         → entity: mobile        → wire: mobile
 */

export type Iso8601 = string;
export type Uuid = string;

/** m | f | o — matches DB CHECK (gender IN ('m','f','o')) */
export type Gender = 'm' | 'f' | 'o';

/**
 * One patient allergy. Linked to allergies_lookup catalogue (Module 06).
 * drugClassCode — from allergies_lookup.drug_class_code, used for
 * prescribe-time allergy alerts (TSD-10 §4.2).
 */
export interface PatientAllergy {
  allergen: string;
  drugClassCode?: string;
}

/** Structured address — maps to patients.address jsonb column. */
export interface PatientAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  landmark?: string;
}

/** Response shape returned by every patient endpoint. */
export interface PatientSummary {
  id: Uuid;
  uhid: string;
  firstName: string;
  lastName: string;
  /** Convenience display field — firstName + ' ' + lastName. */
  fullName: string;
  gender: Gender;
  ageYears: number;
  dateOfBirth?: Iso8601;
  mobile?: string;
  altMobile?: string;
  email?: string;
  bloodGroup?: string;
  address?: PatientAddress;
  /** Only present on full profile — undefined on search results. */
  allergies?: PatientAllergy[];
  chronicConditions?: string[];
}

export type KinRelationship =
  | 'father'
  | 'mother'
  | 'sibling'
  | 'child'
  | 'grandparent'
  | 'other';

export interface LinkedPatient {
  patient: PatientSummary;
  relationship: KinRelationship;
  relationshipSpecific?: string;
  sharedMobile: boolean;
}

/* ---------- Create patient (POST /api/patients) ---------- */

/**
 * Wire shape for POST /api/patients.
 * All field names match DB columns (camelCase of snake_case).
 * uhid is server-issued — never sent by client.
 */
export interface CreatePatientInput {
  firstName: string;
  lastName: string;
  gender: Gender;
  dateOfBirth: Iso8601;
  mobile: string;
  altMobile?: string;
  email?: string;
  bloodGroup?: string;
  address?: PatientAddress;
  aadhaar?: string;
  pan?: string;
  /** Allergen label strings — resolved to allergies_lookup UUIDs on backend. */
  allergies?: string[];
  chronicConditions?: string[];
}

/* ---------- Update patient (PATCH /api/patients/:uhid) ---------- */

export interface UpdatePatientInput {
  firstName: string;
  lastName: string;
  gender: Gender;
  dateOfBirth?: Iso8601;
  mobile?: string;
  altMobile?: string;
  email?: string;
  bloodGroup?: string;
  address?: PatientAddress;
  allergies?: string[];
  chronicConditions?: string[];
}
