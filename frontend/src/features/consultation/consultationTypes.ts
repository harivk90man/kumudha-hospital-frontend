/**
 * Consultation types. Maps to schema v2 module 11-consultation and TSD-07.
 *
 * Owns: clinical notes, diagnoses, vitals, prescription items, advice,
 * visit history, and the aggregate `ConsultationContext` that the workspace
 * screen renders. References patient/lab/radiology types from those modules.
 *
 * Wire enum values are lowercase_snake.
 */
import type { Iso8601, Uuid, PatientSummary } from '@/features/patient';
import type { LabOrder, LabResultFlag, LabResultNotification } from '@/features/lab';
import type { RadiologyOrder } from '@/features/radiology';
import type { StockSeverity } from '@/features/inventory';
import type { EncounterStatus } from '@/features/encounter';

/* ---------- Vitals + Visit history ---------- */

export interface Vitals {
  recordedAt: Iso8601;
  recordedBy: string;
  /** TSD-07 §4.1 vitals.bp_systolic — mmHg. */
  bpSystolic?: number;
  /** TSD-07 §4.1 vitals.bp_diastolic — mmHg. */
  bpDiastolic?: number;
  /** TSD-07 §4.1 vitals.pulse_rate — bpm. */
  pulseRate?: number;
  /** TSD-07 §4.1 vitals.temperature_f — Fahrenheit. Schema is decimal(4,1). */
  temperatureF?: number;
  spo2?: number;            // %
  respiratoryRate?: number;
  weightKg?: number;
  heightCm?: number;
  bmi?: number;
  painScore?: number;       // 0-10
}

/**
 * One-line report summary shown inline on a visit timeline card.
 *
 * Backed by:
 *  - lab:        lab_results.{value_numeric|value_text} + unit + flag       (schema 12-lab)
 *  - radiology:  radiology_reports.impression  (first line)                 (schema 13-radiology)
 *
 * `flag` re-uses the lab flag enum (`LabResultFlag` — TSD-08 §4.6 + 'abnormal'
 * for non-numeric reactives). Radiology has no flag axis; field is left null.
 */
export interface VisitReportSummary {
  kind: 'lab' | 'radiology';
  testCode: string;
  testName: string;
  resultLine: string;
  flag?: LabResultFlag;
  reportPdfUrl?: string;
}

export interface VisitHistoryItem {
  opNumber: string;
  visitDate: Iso8601;
  doctorName: string;
  department: string;
  chiefComplaint: string;
  primaryDiagnosis?: string;
  prescriptionCount: number;
  hasLabReports: boolean;
  hasRadiologyReports: boolean;
  reports?: VisitReportSummary[];
  /**
   * Full LabOrder rows for this visit when fetched (Supabase path).
   * Powers the "View report" action on the Patient profile expand —
   * the same `ReportViewerDialog` consumes these shapes directly so
   * the doctor can inspect the saved blood/scan report on a past
   * visit without any of the consultation inputs becoming editable.
   */
  labOrders?: LabOrder[];
  radiologyOrders?: RadiologyOrder[];
}

/* ---------- Clinical capture ---------- */

export interface ConsultationNote {
  chiefComplaint: string;
  historyOfPresentIllness: string;
  examinationFindings: string;
  clinicalImpression: string;
  advice: string;
}

/**
 * Diagnosis classification per TSD-07 §4.2.
 * Single `type` field combining positional + certainty.
 */
export type DiagnosisType = 'primary' | 'secondary' | 'provisional' | 'rule_out';

export interface Diagnosis {
  id: Uuid;
  /** ICD-10 code. */
  icd10?: string;
  description: string;
  type: DiagnosisType;
}

/* ---------- Prescription ---------- */

/**
 * Free varchar per TSD-07 §4.5 / schema-11. Accepts clinician shorthand
 * (e.g. "1-0-1", "BD AC", "0-1-0 HS"). FE provides STANDARD_FREQUENCIES
 * as autocomplete suggestions but does not constrain.
 */
export type Frequency = string;

export const STANDARD_FREQUENCIES = [
  'OD', 'BD', 'TDS', 'QID', 'HS', 'SOS', 'STAT',
  '1-0-0', '0-0-1', '1-0-1', '1-1-1', '1-1-1-1',
] as const;

export interface PrescriptionItem {
  id: Uuid;
  medicineId: Uuid;
  /** TSD-07 §4.5 — captured at prescribe time so the line survives medicine renames. */
  medicineNameSnapshot: string;
  strength: string;
  dosage: string;            // "1 tab"
  frequency: Frequency;
  route: string;             // "PO"
  durationDays: number;
  /** TSD-07 §4.5 — display order within the Rx. */
  sequenceNo?: number;
  /** TSD-07 §4.5 — total qty doctor wrote. Pharmacy fills `dispensedQty`. */
  quantityPrescribed?: number;
  /** Updated by pharmacy at dispense. Read-only on the doctor side. */
  dispensedQty?: number;
  instructions?: string;
  severity: StockSeverity;
  /* ---- Stock-block override audit (per BRD/TSD-10 §6 decision) ---- */
  overrideReason?: string;
  overriddenBy?: Uuid;
  overriddenAt?: Iso8601;
}

export interface PrescriptionTemplate {
  id: Uuid;
  name: string;
  specialty: string;
  itemCount: number;
  updatedAt: Iso8601;
  items: PrescriptionItem[];
}

/* ---------- Doctor recommendations (TSD-07 §4.6) ---------- */

/**
 * Non-Rx outputs the doctor produces that need follow-up by other staff.
 * Maps to schema 11-consultation `doctor_recommendations`.
 */
export type RecommendationType =
  | 'physio'
  | 'surgery'
  | 'admission'
  | 'follow_up'
  | 'lab'
  | 'radiology'
  | 'specialist_referral';

export type RecommendationPriority = 'routine' | 'urgent' | 'stat';

export type RecommendationStatus =
  | 'open'
  | 'scheduled'
  | 'completed'
  | 'cancelled'
  | 'declined';

export interface DoctorRecommendation {
  id: Uuid;
  recommendationType: RecommendationType;
  priority: RecommendationPriority;
  status: RecommendationStatus;
  notes?: string;
  /* ---- Per-type FKs (at-most-one per TSD-07 §4.6 CHECK) ---- */
  physioSessionId?: Uuid;
  surgeryScheduleId?: Uuid;
  ipAdmissionId?: Uuid;
  followUpAppointmentId?: Uuid;
  labOrderId?: Uuid;
  radiologyOrderId?: Uuid;
  /** Free-text reference id when recommendationType === 'specialist_referral'. */
  referralId?: string;
  createdAt: Iso8601;
}

/* ---------- Advice ---------- */

export type FollowUpModality = 'in_person' | 'tele';

export interface FollowUpAdvice {
  afterDays: number;
  notes?: string;
  modality: FollowUpModality;
}

export type WardType = 'general' | 'semi_private' | 'private' | 'icu';
export type AdmissionUrgency = 'routine' | 'urgent' | 'emergency';

export interface AdmissionAdvice {
  reason: string;
  wardType: WardType;
  urgency: AdmissionUrgency;
  notes?: string;
}

/* ---------- Discharge decision (TSD-07 §4.2 next_action) ---------- */

/**
 * The doctor’s discharge decision captured at consultation Complete.
 * TSD-07 notes (§6 open question) that this could split into booleans —
 * for v1 we keep the spec’s single-enum shape and let the user revisit.
 */
export type NextAction =
  | 'prescription_only'
  | 'lab_ordered'
  | 'radiology_ordered'
  | 'admit_ip'
  | 'surgery_referral'
  | 'follow_up'
  | 'referred_external'
  | 'no_action';

/* ---------- Draft (TSD-07 §4.7 consultation_drafts) ---------- */

/**
 * In-progress consultation snapshot. 7-day TTL on the server.
 * Restored when the doctor reopens an unfinished consultation.
 *
 * Per TSD-07 §6: autosaves do NOT emit audit rows (would explode audit_logs);
 * only restore events are audited.
 */
export interface ConsultationDraft {
  opNumber: string;
  doctorId: Uuid;
  draftData: Partial<ConsultationContextBase>;
  lastSavedAt: Iso8601;
  expiresAt: Iso8601;
  autosaveCount: number;
  restoredAt?: Iso8601;
  version: number;
}

// Forward-declared: ConsultationContext minus draft-specific fields.
// Helps the draft jsonb type without circular reference.
export interface ConsultationContextBase {
  notes?: ConsultationNote;
  diagnoses?: Diagnosis[];
  prescriptionItems?: PrescriptionItem[];
  followUp?: FollowUpAdvice;
  admission?: AdmissionAdvice;
  recommendations?: DoctorRecommendation[];
  nextAction?: NextAction;
}

/* ---------- Aggregate consultation context ---------- */

export interface ConsultationContext {
  opNumber: string;
  status: EncounterStatus;
  startedAt?: Iso8601;
  patient: PatientSummary;
  latestVitals?: Vitals;
  notes: ConsultationNote;
  diagnoses: Diagnosis[];
  prescriptionItems: PrescriptionItem[];
  labOrders: LabOrder[];
  radiologyOrders: RadiologyOrder[];
  followUp?: FollowUpAdvice;
  admission?: AdmissionAdvice;
  /**
   * Non-Rx outputs that need follow-up by other staff (physio, surgery,
   * specialist referral, etc.). FollowUp + Admission ALSO surface here as
   * recommendation_type entries when persisted server-side; FE keeps them
   * in their dedicated panels for UX continuity.
   */
  recommendations: DoctorRecommendation[];
  /**
   * Free-text referrals + recommendations the doctor jots during the
   * visit. Renders as a single textarea under "Advice Given" — replaces
   * the structured recommendations panel for the simple-write flow.
   */
  recommendationsNotes?: string;
  /**
   * Pending critical-result notifications for this encounter (joined from
   * `notifications` + `lab_results` + `lab_orders` per TSD-02 + TSD-08).
   * Drives the in-consultation critical-result ACK banner.
   */
  criticalNotifications: LabResultNotification[];
  /** Set at Complete; captures discharge decision per TSD-07 §4.2. */
  nextAction?: NextAction;
  /**
   * TSD-07 §4.2 — set when the doctor clicks Complete. Once set, the
   * consultation is read-only; further changes require an amendment with
   * reason that creates an audit-logged amendment row.
   */
  lockedAt?: Iso8601;
  /** Audit trail of amendments after lock (TSD-07 §4.2 / TSD-02 audit). */
  amendments?: ConsultationAmendment[];
}

/* ---------- Amendment audit (TSD-07 §4.2) ---------- */

export interface ConsultationAmendment {
  id: Uuid;
  amendedBy: Uuid;
  amendedAt: Iso8601;
  reason: string;
  /** Optional summary of what changed (free text the doctor types or system-generated). */
  summary?: string;
}
