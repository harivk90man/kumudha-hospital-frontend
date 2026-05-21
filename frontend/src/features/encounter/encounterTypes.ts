/**
 * Encounter + queue types. Maps to schema v2 module 10-encounter
 * (table `op_visits`) + TSD-04 §4.1 `patient_states` + TSD-06.
 *
 * Wire enum values are lowercase_snake. Status is a hybrid `{ code, name }`
 * pair so the FE has type safety AND the backend can introduce new states
 * without an FE redeploy. Priority is split: `clinicalPriority` lives on
 * orders (lab/radiology); `emergencyTriage` lives on the encounter.
 */
import type { Iso8601, PatientSummary, Uuid } from '@/features/patient';
import type { OrderStatus } from '@/features/lab';

/* ---------- Encounter status (hybrid: server-issued int code + spec slug) ---------- */

/**
 * Slugs taken verbatim from TSD-04 §4.1 `patient_states`. The integer `code`
 * is server-issued — the FE never hardcodes the int↔slug mapping.
 */
export type EncounterStatusName =
  | 'walk_in_arrived'
  | 'registered'
  | 'awaiting_vitals'
  | 'vitals_done'
  | 'awaiting_doctor'
  | 'in_consultation'
  | 'consultation_done'
  | 'awaiting_billing'
  | 'paid'
  | 'lab_pending'
  | 'imaging_pending'
  | 'pharmacy_pending'
  | 'closed'
  /** Future-date appointment not yet arrived — returned by GET /api/queue?date=future. */
  | 'booked';

export interface EncounterStatus {
  /** TSD-04 §4.1 patient_states.code FK — opaque to FE. */
  code: number;
  name: EncounterStatusName;
}

/** True when the encounter is awaiting any kind of report return. */
export const isAwaitingReports = (name: EncounterStatusName): boolean =>
  name === 'lab_pending' || name === 'imaging_pending';

/* ---------- Triage (encounter-level severity, not order priority) ---------- */

/** TSD-06 §4.1 op_visits.emergency_triage. */
export type EmergencyTriage = 'red' | 'yellow' | 'green';

/* ---------- Queue ---------- */

export interface QueueEntry {
  /** TSD-06 op_visits.op_number — e.g. OP-2026-00123. */
  opNumber: string;
  /** TSD-06 op_visits.token_number — varchar (e.g. "OP-T-15"). */
  tokenNumber: string;
  patient: PatientSummary;
  chiefComplaint: string;
  appointmentTime: Iso8601;
  status: EncounterStatus;
  isEmergency: boolean;
  emergencyTriage?: EmergencyTriage;
  waitingForMinutes: number;
  /** True when a prescription has been issued on this encounter.
   *  Backend aggregates from `prescription_items` join. */
  hasPrescription: boolean;
  /** True when any lab order exists for this encounter (ordered, in-progress, or reported). */
  hasLabOrders: boolean;
  /** True when any radiology order exists for this encounter (ordered, in-progress, or reported). */
  hasRadiologyOrders: boolean;
}

/* ---------- Per-doctor queue grouping (nurse "who’s next for Dr. X" view) ---------- */

/**
 * Server-grouped queue: one entry per doctor, with their `awaiting_doctor` +
 * `in_consultation` rows ordered by `appointmentTime` ascending. Drives the
 * nurse-facing live queue (BRD §1 step 8 — front-desk surfaces "X ahead of
 * you" for any walk-up patient).
 *
 * Real backend reads `patient_queue` joined with `op_visits → users` and
 * groups by `op_visits.doctor_id`. FE never composes the grouping itself.
 */
export interface DoctorQueueGroup {
  doctorId: Uuid;
  doctorName: string;
  department: string;
  /** Ordered FIFO by `appointmentTime` ascending (next-up first). */
  entries: QueueEntry[];
  /**
   * Rolling average of completed consults today for this doctor — drives
   * the "estimated wait = position × avgConsultMinutes" calculation in
   * the front-desk Now/Next strip. Backend computes from `op_visits`
   * start/end timestamps; mock returns a per-doctor fixed value so the
   * demo’s wait estimate varies realistically.
   */
  avgConsultMinutes: number;
}

/* ---------- Report-check queue ---------- */

export type ReportKind = 'lab' | 'radiology';

export interface ReportPendingItem {
  kind: ReportKind;
  testCode: string;
  testName: string;
  status: OrderStatus;
  reportedAt?: Iso8601;
}

/**
 * Encounter waiting for the doctor to review reports.
 * Surfaces in the "Reports to check" queue ONLY when at least one
 * ordered report has flipped to `reported`.
 */
export interface ReportPendingEntry {
  opNumber: string;
  consultedAt: Iso8601;
  patient: PatientSummary;
  primaryDiagnosis?: string;
  readyCount: number;
  pendingCount: number;
  reports: ReportPendingItem[];
}

/**
 * Snapshot of a completed encounter for clinical/cohort search — drives
 * the doctor's "Cases" search mode (find past encounters by diagnosis).
 * Backend reads `op_visits` joined to the diagnosis recorded on
 * `consultation_summaries`; the FE never composes the join itself.
 */
export interface CaseSummary {
  opNumber: string;
  consultedAt: Iso8601;
  patient: PatientSummary;
  /** The doctor-recorded primary diagnosis for this encounter. */
  primaryDiagnosis: string;
}

/* ---------- Patient journey events (TSD-04 §4.3) ---------- */

/**
 * TSD-04 §4.2 `service_points.station_type` — closed enum (10 values).
 * `stations.slug` is free per-tenant string and stays typed as `string`.
 */
export type StationType =
  | 'front_desk'
  | 'billing'
  | 'vitals'
  | 'doctor'
  | 'lab_collection'
  | 'lab_processing'
  | 'radiology'
  | 'pharmacy'
  | 'er_triage'
  | 'ip_ward';

/**
 * One row in `patient_journey_events` (TSD-04 §4.3) — append-only ledger
 * of every state transition during a visit. Drives the chronological
 * timeline that BRD hospital-flows §1 step 11 calls out for past visits.
 */
export interface JourneyEvent {
  id: Uuid;
  opVisitId: Uuid;
  occurredAt: Iso8601;
  /** Originating state code — null for the first event. */
  fromStateCode?: number;
  /** Destination state code (FK patient_states.code). */
  toStateCode: number;
  /** Human-readable label for the destination state. */
  toStateName: EncounterStatusName;
  /** Free per-tenant slug from `stations.slug`. */
  station?: string;
  stationType?: StationType;
  /** Display name of the user who triggered the transition. */
  actorName?: string;
  /** TSD-04 §4.3 patient_journey_events.reason — optional annotation. */
  reason?: string;
}

/* ---------- Server-side list params (CLAUDE.md §3.4) ---------- */

export interface QueueListParams {
  page?: number;
  limit?: number;
  sort?: string;
  q?: string;
  status?: EncounterStatusName | 'all';
  triage?: EmergencyTriage | 'all';
  /**
   * Filter the queue to one doctor. Resolved server-side via the
   * `op_visits.doctor_id` FK. Used by the front-desk station table
   * (when a nurse picks a doctor from the dropdown filter).
   */
  doctorId?: Uuid | 'all';
  /**
   * Status set filter — e.g. `['awaiting_vitals', 'awaiting_doctor',
   * 'in_consultation']`. Convenience over `status` when the caller
   * needs multiple states in one query. `status` and `statuses` are
   * mutually exclusive on the wire; `statuses` wins if both are set.
   */
  statuses?: EncounterStatusName[];
}

/* ---------- Op-visit creation (BRD §1 step 3 — receptionist) ---------- */

/**
 * Wire shape for `POST /api/encounters/op-visits` (front-desk walk-in).
 * Maps to schema v2 module 10 `op_visits` insert. The server stamps
 * `op_number`, `token_number`, `visit_date`, and the initial state
 * (`110 registered` then `120 awaiting_vitals` via the journey trigger).
 */
export interface OpVisitCreateInput {
  patientId: Uuid;
  doctorId: Uuid;
  chiefComplaint: string;
  /** Set when the patient checked in against an `appointments` row. */
  appointmentId?: Uuid;
  isEmergency?: boolean;
  emergencyTriage?: EmergencyTriage;
  isMlc?: boolean;
  /**
   * Mock-only: the FE often has the full patient summary already (right
   * after a search-or-register) and passing it through lets the demo
   * mock build a realistic queue row without an extra round-trip. Real
   * backend ignores this — it joins `op_visits → patients` itself.
   */
  patientSnapshot?: PatientSummary;
}

export interface OpVisitCreated {
  opNumber: string;
  tokenNumber: string;
  initialState: EncounterStatus;
}

/* ---------- Live queue — real backend (GET /api/queue) ---------- */

/** queueStatus values returned by GET /api/queue. */
export type LiveQueueStatus = 'pending_payment' | 'awaiting_vitals' | 'awaiting_doctor';

/**
 * One row from GET /api/queue. Replaces the mock QueueEntry for the
 * front-desk station page. queueStatus drives row styling + actions.
 *
 * opNumber and tokenNumber are null when queueStatus = pending_payment.
 * appointmentId is null for walk-in op_visits with no prior appointment.
 */
export interface LiveQueueEntry {
  appointmentId: Uuid | null;
  appointmentNo: string | null;
  opNumber: string | null;
  tokenNumber: string | null;
  patient: {
    id: Uuid;
    uhid: string;
    fullName: string;
    gender: string;
    ageYears: number;
    mobile: string;
    bloodGroup: string | null;
    allergies: Array<{ allergen: string }>;
  };
  doctorId: Uuid;
  doctorName: string;
  department: string | null;
  scheduledAt: Iso8601;
  queueStatus: LiveQueueStatus;
  waitingSince: Iso8601;
}

/* ---------- Vitals capture (BRD §1 step 6 — nurse) ---------- */

/**
 * Wire shape for `POST /api/encounters/:opNumber/vitals`. Maps to schema
 * v2 module 11 `vitals` insert. `bmi` is generated by the DB; `recordedBy`
 * + `recordedAt` are server-stamped from the auth context.
 *
 * Field names align 1:1 with the column names the doctor’s `Vitals`
 * read-shape exposes (see `consultation/consultationTypes.ts`); when this
 * file consolidates with the read shape under `encounter/`, both keep
 * working without a rename.
 */
export interface VitalsCaptureInput {
  bpSystolic?: number;
  bpDiastolic?: number;
  pulseRate?: number;
  /** Fahrenheit. DB column `temperature_f`, decimal(4,1). */
  temperatureF?: number;
  spo2?: number;
  respiratoryRate?: number;
  weightKg?: number;
  heightCm?: number;
  /** mg/dL. DB column `blood_sugar_random`. */
  bloodSugarRandom?: number;
  /** mg/dL. DB column `blood_sugar_fasting`. */
  bloodSugarFasting?: number;
  painScore?: number;
  notes?: string;
  /** Updates op_visits.chief_complaint when provided. */
  chiefComplaint?: string;
}

export interface VitalsRecord extends VitalsCaptureInput {
  id: Uuid;
  patientId: Uuid;
  opVisitId?: Uuid;
  /** Generated column. */
  bmi?: number;
  recordedBy: Uuid;
  recordedAt: Iso8601;
}
