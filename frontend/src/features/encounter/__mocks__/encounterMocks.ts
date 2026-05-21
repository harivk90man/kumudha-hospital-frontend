import type {
  EncounterStatus,
  EncounterStatusName,
  JourneyEvent,
  QueueEntry,
  ReportPendingEntry,
  ReportPendingItem,
  StationType,
} from '../encounterTypes';
import type { PatientSummary } from '@/features/patient';
import { findPatient } from '@/features/patient/__mocks__/patientMocks';
import { mockPastEncounterMeta } from '@/features/consultation/__mocks__/consultationMocks';

/**
 * Mock-only helper. Real backend issues `code` from `patient_states`.
 * FE never hardcodes the int↔slug mapping — placeholder `0` is fine.
 */
const mockStatus = (name: EncounterStatusName): EncounterStatus => ({ code: 0, name });

const minutesAgoIso = (mins: number): string =>
  new Date(Date.now() - mins * 60 * 1000).toISOString();

/* ---------- Live demo store (today only) ----------
   30 rows representing 2026-05-17. Every UHID is drawn from the refreshed
   30-patient master cohort in `patientMocks.ts`. Status mix:
     6 awaiting_billing / registered
     5 awaiting_vitals
     5 awaiting_doctor / vitals_done (incl. 2 emergencies)
     3 in_consultation (incl. Karthik OP-2026-00121 — the demo anchor)
     11 consultation_done
*/

interface QueueSeed {
  opNumber: string;
  uhid: string;
  doctorId: string;
  status: EncounterStatusName;
  chiefComplaint: string;
  /** Minutes ago. Negative = future-scheduled. */
  appointmentMinsAgo: number;
  waitingForMinutes: number;
  isEmergency?: boolean;
  emergencyTriage?: 'red' | 'yellow' | 'green';
}

const TODAY_QUEUE: QueueSeed[] = [
  /* awaiting_billing / registered (6) — just walked in */
  { opNumber: 'OP-2026-00141', uhid: 'KH-2026-00050', doctorId: 'usr-doc-002', status: 'awaiting_billing', chiefComplaint: 'BP review + Rx refill',                appointmentMinsAgo:  3, waitingForMinutes:  3 },
  { opNumber: 'OP-2026-00142', uhid: 'KH-2026-00051', doctorId: 'usr-doc-002', status: 'awaiting_billing', chiefComplaint: 'Persistent headache × 5 days',         appointmentMinsAgo:  6, waitingForMinutes:  6 },
  { opNumber: 'OP-2026-00143', uhid: 'KH-2025-08801', doctorId: 'usr-doc-002', status: 'registered',       chiefComplaint: 'Sore throat × 3 days',                  appointmentMinsAgo:  9, waitingForMinutes:  9 },
  { opNumber: 'OP-2026-00144', uhid: 'KH-2026-00053', doctorId: 'usr-doc-002', status: 'awaiting_billing', chiefComplaint: 'Cough × 4 days',                        appointmentMinsAgo: 11, waitingForMinutes: 11 },
  { opNumber: 'OP-2026-00145', uhid: 'KH-2025-11203', doctorId: 'usr-doc-002', status: 'awaiting_billing', chiefComplaint: 'Ear pain × 1 day, low-grade fever',     appointmentMinsAgo: 14, waitingForMinutes: 14 },
  { opNumber: 'OP-2026-00146', uhid: 'KH-2025-08802', doctorId: 'usr-doc-004', status: 'registered',       chiefComplaint: 'Antenatal check (24 weeks)',            appointmentMinsAgo: 16, waitingForMinutes: 16 },

  /* awaiting_vitals (5) — paid, waiting for nurse */
  { opNumber: 'OP-2026-00147', uhid: 'KH-2026-00055', doctorId: 'usr-doc-002', status: 'awaiting_vitals',  chiefComplaint: 'Cycle review',                          appointmentMinsAgo:  8, waitingForMinutes:  8 },
  { opNumber: 'OP-2026-00148', uhid: 'KH-2025-09812', doctorId: 'usr-doc-002', status: 'awaiting_vitals',  chiefComplaint: 'Annual health check',                   appointmentMinsAgo:  4, waitingForMinutes:  4 },
  { opNumber: 'OP-2026-00149', uhid: 'KH-2024-03301', doctorId: 'usr-doc-002', status: 'awaiting_vitals',  chiefComplaint: 'Annual review',                         appointmentMinsAgo: 17, waitingForMinutes: 17 },
  { opNumber: 'OP-2026-00150', uhid: 'KH-2024-04424', doctorId: 'usr-doc-002', status: 'awaiting_vitals',  chiefComplaint: 'Fever × 2 days',                        appointmentMinsAgo: 22, waitingForMinutes: 22 },
  { opNumber: 'OP-2026-00151', uhid: 'KH-2026-00048', doctorId: 'usr-doc-002', status: 'awaiting_vitals',  chiefComplaint: 'Throat pain, low-grade fever',          appointmentMinsAgo:  6, waitingForMinutes:  6 },

  /* vitals_done / awaiting_doctor (5) — in queue for the doctor */
  { opNumber: 'OP-2026-00122', uhid: 'KH-2026-00046', doctorId: 'usr-doc-001', status: 'awaiting_doctor',  chiefComplaint: 'Bilateral knee pain, swelling',          appointmentMinsAgo: 15, waitingForMinutes: 18 },
  { opNumber: 'OP-2026-00123', uhid: 'KH-2024-03302', doctorId: 'usr-doc-002', status: 'awaiting_doctor',  chiefComplaint: 'Asthma — moderate flare',                appointmentMinsAgo:  5, waitingForMinutes:  8, isEmergency: true, emergencyTriage: 'yellow' },
  { opNumber: 'OP-2026-00124', uhid: 'KH-2024-04425', doctorId: 'usr-doc-002', status: 'awaiting_doctor',  chiefComplaint: 'Fall from cot — head bump',              appointmentMinsAgo: -5, waitingForMinutes:  2, isEmergency: true, emergencyTriage: 'red' },
  { opNumber: 'OP-2026-00152', uhid: 'KH-2026-00061', doctorId: 'usr-doc-002', status: 'vitals_done',      chiefComplaint: 'DM review + Rx refill',                  appointmentMinsAgo: 36, waitingForMinutes: 14 },
  { opNumber: 'OP-2026-00153', uhid: 'KH-2026-00054', doctorId: 'usr-doc-002', status: 'awaiting_doctor',  chiefComplaint: 'HbA1c follow-up',                        appointmentMinsAgo: 28, waitingForMinutes: 19 },

  /* in_consultation (2) — one per doctor max. Karthik is Naveen's demo
     anchor; Sundari is Anand's. A doctor can only see one patient at
     a time so we never seed >1 `in_consultation` row per doctorId. */
  { opNumber: 'OP-2026-00121', uhid: 'KH-2026-00045', doctorId: 'usr-doc-001', status: 'in_consultation',  chiefComplaint: 'Lower back pain × 3 weeks',              appointmentMinsAgo: 20, waitingForMinutes:  0 },
  { opNumber: 'OP-2026-00154', uhid: 'KH-2024-06210', doctorId: 'usr-doc-002', status: 'in_consultation',  chiefComplaint: 'Diabetes follow-up',                     appointmentMinsAgo: 35, waitingForMinutes:  0 },
  // Lakshmi N. moved from in_consultation → awaiting_doctor so
  // Naveen has exactly one active consult. She's still next in line.
  { opNumber: 'OP-2026-00155', uhid: 'KH-2026-00049', doctorId: 'usr-doc-001', status: 'awaiting_doctor',  chiefComplaint: 'Hip pain — follow-up',                   appointmentMinsAgo: 50, waitingForMinutes: 12 },

  /* consultation_done (11) — the morning's already-finished visits */
  { opNumber: 'OP-2026-00156', uhid: 'KH-2026-00058', doctorId: 'usr-doc-002', status: 'consultation_done',chiefComplaint: 'COPD follow-up',                         appointmentMinsAgo: 90, waitingForMinutes:  0 },
  { opNumber: 'OP-2026-00157', uhid: 'KH-2026-00052', doctorId: 'usr-doc-002', status: 'consultation_done',chiefComplaint: 'BP + lipid review',                      appointmentMinsAgo: 95, waitingForMinutes:  0 },
  { opNumber: 'OP-2026-00158', uhid: 'KH-2018-00094', doctorId: 'usr-doc-002', status: 'consultation_done',chiefComplaint: 'DM follow-up + HbA1c',                   appointmentMinsAgo:100, waitingForMinutes:  0 },
  { opNumber: 'OP-2026-00159', uhid: 'KH-2023-04501', doctorId: 'usr-doc-002', status: 'consultation_done',chiefComplaint: 'KFT review',                             appointmentMinsAgo:110, waitingForMinutes:  0 },
  { opNumber: 'OP-2026-00160', uhid: 'KH-2024-08812', doctorId: 'usr-doc-004', status: 'consultation_done',chiefComplaint: 'Cycle review',                           appointmentMinsAgo:120, waitingForMinutes:  0 },
  { opNumber: 'OP-2026-00161', uhid: 'KH-2024-04401', doctorId: 'usr-doc-002', status: 'consultation_done',chiefComplaint: 'Cardio review + ECG',                    appointmentMinsAgo:130, waitingForMinutes:  0 },
  { opNumber: 'OP-2026-00162', uhid: 'KH-2024-04420', doctorId: 'usr-doc-002', status: 'consultation_done',chiefComplaint: 'Cardio + KFT review',                    appointmentMinsAgo:140, waitingForMinutes:  0 },
  { opNumber: 'OP-2026-00163', uhid: 'KH-2026-00064', doctorId: 'usr-doc-002', status: 'consultation_done',chiefComplaint: 'CKD review',                             appointmentMinsAgo: 92, waitingForMinutes:  0 },
  { opNumber: 'OP-2026-00164', uhid: 'KH-2026-00068', doctorId: 'usr-doc-002', status: 'consultation_done',chiefComplaint: 'Routine cardiac review',                 appointmentMinsAgo:105, waitingForMinutes:  0 },
  { opNumber: 'OP-2026-00165', uhid: 'KH-2026-00047', doctorId: 'usr-doc-002', status: 'consultation_done',chiefComplaint: 'CAD review',                             appointmentMinsAgo:115, waitingForMinutes:  0 },
  { opNumber: 'OP-2026-00166', uhid: 'KH-2020-00721', doctorId: 'usr-doc-002', status: 'consultation_done',chiefComplaint: 'Annual review',                          appointmentMinsAgo:125, waitingForMinutes:  0 },
];

/**
 * Items (Rx, lab orders, radiology orders) are a post-consultation
 * summary, not a live mid-flow tally. `in_consultation` rows are still
 * being typed by the doctor right now, so we treat them like
 * pre-doctor states — the column shows nothing until the consult
 * actually finishes.
 */
const POST_CONSULTATION_STATUSES = new Set<EncounterStatusName>([
  'consultation_done',
  'lab_pending',
  'imaging_pending',
  'pharmacy_pending',
  'closed',
]);

/**
 * Deterministic per-row mock for Rx / lab / radiology presence.
 * Uses the OP-number's trailing digits as a stable pseudo-random key so
 * the same row keeps the same flags across reloads. Real backend
 * aggregates from `prescription_items`, `lab_orders`, `radiology_orders`.
 */
const deriveItemFlags = (
  statusName: EncounterStatusName,
  opNumber: string,
): { hasPrescription: boolean; hasLabOrders: boolean; hasRadiologyOrders: boolean } => {
  if (!POST_CONSULTATION_STATUSES.has(statusName)) {
    return { hasPrescription: false, hasLabOrders: false, hasRadiologyOrders: false };
  }
  const seq = Number(opNumber.slice(-3)) || 0;
  return {
    hasPrescription:    seq % 5 !== 0,   // ~80% of post-consult rows have an Rx
    hasLabOrders:       seq % 3 === 0,   // ~33%
    hasRadiologyOrders: seq % 7 === 0,   // ~14%
  };
};

const queueEntryFromSeed = (s: QueueSeed): QueueEntry => {
  const patient = findPatient(s.uhid);
  const flags = deriveItemFlags(s.status, s.opNumber);
  return {
    opNumber: s.opNumber,
    tokenNumber: `OP-T-${s.opNumber.slice(-2)}`,
    patient,
    chiefComplaint: s.chiefComplaint,
    appointmentTime: minutesAgoIso(s.appointmentMinsAgo),
    status: mockStatus(s.status),
    isEmergency: s.isEmergency ?? false,
    emergencyTriage: s.emergencyTriage,
    waitingForMinutes: s.waitingForMinutes,
    hasPrescription: flags.hasPrescription,
    hasLabOrders: flags.hasLabOrders,
    hasRadiologyOrders: flags.hasRadiologyOrders,
  };
};

export const mockQueue: QueueEntry[] = TODAY_QUEUE.map(queueEntryFromSeed);

/* ---------- Mutators (used by encounterApi to keep the demo flow live) ---------- */

export const appendQueueEntry = (entry: QueueEntry): void => {
  mockQueue.unshift(entry);
};

export interface OpVisitDoctor {
  doctorId: string;
  doctorName: string;
  department: string;
}

const DOC_BY_ID: Record<string, OpVisitDoctor> = {
  'usr-doc-001': { doctorId: 'usr-doc-001', doctorName: 'Dr. Naveen Kumar', department: 'Orthopaedics' },
  'usr-doc-002': { doctorId: 'usr-doc-002', doctorName: 'Dr. Anand', department: 'General Medicine' },
  'usr-doc-003': { doctorId: 'usr-doc-003', doctorName: 'Dr. Meera',   department: 'Dental' },
  'usr-doc-004': { doctorId: 'usr-doc-004', doctorName: 'Dr. Lakshmi',   department: 'Obstetrics & Gynaecology' },
  'usr-doc-005': { doctorId: 'usr-doc-005', doctorName: 'Dr. Ravi',   department: 'Physiotherapy' },
};

/* ---------- Past-day completed OP visits ----------
   Derived from the consultation-side `mockPastEncounterMeta`. The
   consultation feature owns the rich past-encounter data (notes, Rx,
   labs, radiology); we just project the thin metadata (op_number,
   doctorId, uhid, visitDate) used by billing / owner / lab / radiology
   joins. */

export interface PastOpVisit {
  opNumber: string;
  doctorId: string;
  uhid: string;
  visitDate: string;
}

export const mockPastOpVisits: PastOpVisit[] = mockPastEncounterMeta.map((m) => ({
  opNumber: m.opNumber,
  doctorId: m.doctorId,
  uhid: m.uhid,
  visitDate: m.visitDate,
}));

/* ---------- mockOpVisitDoctor — covers today + every past-day OP ---------- */

const todayDoctorMap: Record<string, OpVisitDoctor> = Object.fromEntries(
  TODAY_QUEUE.map((r) => [r.opNumber, DOC_BY_ID[r.doctorId]]),
);

const pastDoctorMap: Record<string, OpVisitDoctor> = Object.fromEntries(
  mockPastOpVisits.map((v) => [v.opNumber, DOC_BY_ID[v.doctorId]]),
);

export const mockOpVisitDoctor: Record<string, OpVisitDoctor> = {
  ...pastDoctorMap,
  ...todayDoctorMap,
};

export const setOpVisitDoctor = (opNumber: string, info: OpVisitDoctor): void => {
  mockOpVisitDoctor[opNumber] = info;
};

export const setQueueStatus = (
  opNumber: string,
  toName: EncounterStatusName,
): QueueEntry | null => {
  const row = mockQueue.find((q) => q.opNumber === opNumber);
  if (!row) return null;
  row.status = mockStatus(toName);
  return row;
};

export const appendReportPending = (entry: {
  opNumber: string;
  patient: PatientSummary;
  consultedAt?: string;
  primaryDiagnosis?: string;
  report: ReportPendingItem;
}): void => {
  const existing = mockReportPendingQueue.find((r) => r.opNumber === entry.opNumber);
  if (existing) {
    existing.reports = [...existing.reports, entry.report];
    existing.readyCount += 1;
    if (existing.pendingCount > 0) existing.pendingCount -= 1;
    return;
  }
  mockReportPendingQueue.unshift({
    opNumber: entry.opNumber,
    consultedAt: entry.consultedAt ?? new Date().toISOString(),
    patient: entry.patient,
    primaryDiagnosis: entry.primaryDiagnosis,
    readyCount: 1,
    pendingCount: 0,
    reports: [entry.report],
  });
};

/* ---------- Reports-pending queue (doctor's "reports to check" tab) ---------- */

export const mockReportPendingQueue: ReportPendingEntry[] = [
  {
    opNumber: 'OP-2026-00118',
    consultedAt: minutesAgoIso(90),
    patient: findPatient('KH-2026-00047'),
    primaryDiagnosis: 'CAD — fresh ischaemic workup',
    readyCount: 1,
    pendingCount: 1,
    reports: [
      { kind: 'radiology', testCode: 'XR-CHE',  testName: 'X-Ray Chest PA',              status: 'reported', reportedAt: minutesAgoIso(30) },
      { kind: 'lab',       testCode: 'CRP',     testName: 'C-Reactive Protein',          status: 'in_progress' },
    ],
  },
  {
    opNumber: 'OP-2026-00112',
    consultedAt: minutesAgoIso(60 * 6),
    patient: findPatient('KH-2024-06210'),
    primaryDiagnosis: 'Diabetes — uncontrolled, workup',
    readyCount: 2,
    pendingCount: 0,
    reports: [
      { kind: 'lab', testCode: 'HBA1C', testName: 'HbA1c',                        status: 'reported', reportedAt: minutesAgoIso(55) },
      { kind: 'lab', testCode: 'CBC',   testName: 'Complete Blood Count',         status: 'reported', reportedAt: minutesAgoIso(60 * 2) },
    ],
  },
  {
    opNumber: 'OP-2026-00099',
    consultedAt: minutesAgoIso(60 * 24),
    patient: findPatient('KH-2026-00049'),
    primaryDiagnosis: 'Osteoporosis review',
    readyCount: 1,
    pendingCount: 2,
    reports: [
      { kind: 'lab', testCode: 'CA',    testName: 'Serum Calcium',                status: 'reported', reportedAt: minutesAgoIso(60 * 8) },
      { kind: 'lab', testCode: 'VITD',  testName: 'Vitamin D',                    status: 'in_progress' },
      { kind: 'lab', testCode: 'PTH',   testName: 'Parathyroid Hormone',          status: 'sample_collected' },
    ],
  },
];

/* ---------- Patient journey events ---------- */

const minutesAfter = (base: string, mins: number): string =>
  new Date(new Date(base).getTime() + mins * 60 * 1000).toISOString();

interface JourneyStep {
  toStateName: EncounterStatusName;
  station?: string;
  stationType?: StationType;
  actorName?: string;
  reason?: string;
  offsetMinutes: number;
}

const steps: JourneyStep[] = [
  { toStateName: 'walk_in_arrived',    station: 'front_desk',      stationType: 'front_desk',      actorName: 'Front desk — Latha',                                       offsetMinutes: 0 },
  { toStateName: 'awaiting_vitals',    station: 'vitals',          stationType: 'vitals',          actorName: 'Nurse Saritha',     reason: 'Vitals captured.',           offsetMinutes: 8 },
  { toStateName: 'in_consultation',    station: 'doctor:naveen',   stationType: 'doctor',          actorName: 'Dr. Naveen Kumar',                                       offsetMinutes: 22 },
  { toStateName: 'lab_pending',        station: 'lab_collection',  stationType: 'lab_collection',  actorName: 'Dr. Naveen Kumar', reason: 'Lab order placed (CBC, LFT).', offsetMinutes: 38 },
  { toStateName: 'in_consultation',    station: 'doctor:naveen',   stationType: 'doctor',          actorName: 'Dr. Naveen Kumar', reason: 'Reports back, patient re-called.', offsetMinutes: 95 },
  { toStateName: 'consultation_done',  station: 'doctor:naveen',   stationType: 'doctor',          actorName: 'Dr. Naveen Kumar', reason: 'Rx finalised; pharmacy hand-off.', offsetMinutes: 110 },
];

const journeyForVisit = (visitId: string, startedAt: string): JourneyEvent[] =>
  steps.map((s, i) => ({
    id: `je-${visitId}-${i + 1}`,
    opVisitId: visitId,
    occurredAt: minutesAfter(startedAt, s.offsetMinutes),
    fromStateCode: i === 0 ? undefined : 0,
    toStateCode: 0,
    toStateName: s.toStateName,
    station: s.station,
    stationType: s.stationType,
    actorName: s.actorName,
    reason: s.reason,
  }));

/** Sample journey events for the first 3 past encounters (demo only). */
export const mockJourneyEvents: Record<string, JourneyEvent[]> = Object.fromEntries(
  mockPastEncounterMeta.slice(0, 3).map((m) => [
    m.opNumber,
    journeyForVisit(m.opNumber, `${m.visitDate}T10:00:00Z`),
  ]),
);
