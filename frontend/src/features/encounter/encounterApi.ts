import { httpClient } from '@/lib/http/httpClient';
import type { Gender } from '@/features/patient';
import type {
  CaseSummary,
  DoctorQueueGroup,
  EncounterStatus,
  EncounterStatusName,
  JourneyEvent,
  LiveQueueEntry,
  LiveQueueStatus,
  OpVisitCreateInput,
  OpVisitCreated,
  QueueEntry,
  QueueListParams,
  ReportPendingEntry,
  VitalsCaptureInput,
  VitalsRecord,
} from './encounterTypes';

import {
  appendQueueEntry,
  mockJourneyEvents,
  mockOpVisitDoctor,
  mockQueue,
  mockReportPendingQueue,
  setOpVisitDoctor,
  setQueueStatus,
} from './__mocks__/encounterMocks';
import { sharedDoctors } from '@/features/appointments/__mocks__/appointmentsMocks';
import { paginate, parseSort, sortAndPaginate, type PageResult } from '@/utils/listQuery';

/**
 * Server-side sort whitelist for the doctorâ€™s consultation queue.
 * Anything outside this set is silently dropped (so the FE canâ€™t
 * crash the page by passing junk).
 */
export const QUEUE_SORT_WHITELIST = [
  'tokenNumber',
  'patient.fullName',
  'patient.uhid',
  'status.name',
  'waitingForMinutes',
  'appointmentTime',
  // `qPos` is a virtual sort key â€” the per-doctor position in the
  // awaiting_doctor lane (0 = currently in_consultation, 1..N = waiting).
  // Resolved server-side via the `patient_queue` join; mock computes it
  // in `fetchQueuePaged` from the doctor-grouped queue.
  'qPos',
] as const;

const delay = <T>(value: T, ms = 250): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

/**
 * Encounter API surface. Mocked today; signatures match the final backend contract.
 *
 * All list endpoints accept `page`, `limit`, `sort` per CLAUDE.md Â§3.4.
 *
 * Wire points:
 *  GET  /api/doctor/queue                         â†’ fetchQueue
 *  GET  /api/doctor/queue/reports-pending         â†’ fetchReportPendingQueue
 *  POST /api/doctor/queue/:opNumber/start         â†’ startConsultation
 *  POST /api/doctor/encounters/:opNumber/complete â†’ completeConsultation
 */
export const fetchQueue = async (params: QueueListParams = {}): Promise<QueueEntry[]> => {
  // Mock honours `q`, `status`/`statuses`, `triage`, `doctorId` for demo
  // realism. Real backend handles server-side pagination/sorting too â€”
  // `page/limit/sort` are accepted here so callers' wire shape is
  // correct, even though the mock returns everything.
  void params.page;
  void params.limit;
  void params.sort;
  let rows = mockQueue;
  // `statuses` (set filter) wins over `status` (single filter) when both
  // are set â€” matches the documented wire rule on `QueueListParams`.
  if (params.statuses && params.statuses.length > 0) {
    const allow = new Set(params.statuses);
    rows = rows.filter((r) => allow.has(r.status.name));
  } else if (params.status && params.status !== 'all') {
    rows = rows.filter((r) => r.status.name === params.status);
  }
  if (params.triage && params.triage !== 'all') {
    rows = rows.filter((r) => r.emergencyTriage === params.triage);
  }
  if (params.doctorId && params.doctorId !== 'all') {
    rows = rows.filter(
      (r) => mockOpVisitDoctor[r.opNumber]?.doctorId === params.doctorId,
    );
  }
  if (params.q) {
    const q = params.q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.patient.fullName.toLowerCase().includes(q) ||
        r.patient.uhid.toLowerCase().includes(q) ||
        r.patient.mobile?.toLowerCase().includes(q) ||
        r.tokenNumber.toLowerCase().includes(q) ||
        r.opNumber.toLowerCase().includes(q) ||
        r.chiefComplaint.toLowerCase().includes(q),
    );
  }
  return delay(rows);
};

/**
 * Paged sibling of {@link fetchQueue} â€” applies the same filters, then
 * sorts + paginates per the Â§3.4 wire contract. Returns a `PageResult`
 * envelope so the table page can drive `?page=&limit=&sort=` round-trips
 * without re-implementing slicing in the component.
 */
export const fetchQueuePaged = async (
  params: QueueListParams = {},
): Promise<PageResult<QueueEntry>> => {
  const all = await fetchQueue({ ...params, page: undefined, limit: undefined, sort: undefined });

  // Virtual sort key `qPos` (or `-qPos`) â€” sort by per-doctor queue
  // position computed from the doctor-grouped live queue. `0` for
  // in_consultation, `1..N` for awaiting_doctor (matches the displayed
  // Q# convention). Rows with no position (still at billing/vitals etc.)
  // sort to the bottom in ASC, top in DESC via Number.MAX_SAFE_INTEGER.
  const parsed = parseSort(params.sort);
  if (parsed?.field === 'qPos') {
    const groups = await fetchQueueByDoctor();
    const posByOp = new Map<string, number>();
    for (const g of groups) {
      const awaiting = g.entries.filter((e) => e.status.name === 'awaiting_doctor');
      awaiting.forEach((e, idx) => posByOp.set(e.opNumber, idx + 1));
      g.entries
        .filter((e) => e.status.name === 'in_consultation')
        .forEach((e) => posByOp.set(e.opNumber, 0));
    }
    const factor = parsed.direction === 'desc' ? -1 : 1;
    const sorted = all.slice().sort((a, b) => {
      const pa = posByOp.get(a.opNumber) ?? Number.MAX_SAFE_INTEGER;
      const pb = posByOp.get(b.opNumber) ?? Number.MAX_SAFE_INTEGER;
      return (pa - pb) * factor;
    });
    return paginate(sorted, params);
  }

  return sortAndPaginate(all, params, QUEUE_SORT_WHITELIST);
};

/**
 * Live queue grouped per doctor. Returns only encounters in
 * `awaiting_doctor` or `in_consultation` (the doctor-side view of the
 * pipeline) so the front-desk nurse can answer "how many ahead of me
 * for Dr. X". Sorted FIFO within each group.
 *
 * Wire point: GET /api/queue/by-doctor
 */
/**
 * Per-doctor average consult duration. Real backend computes from todayâ€™s
 * completed `op_visits` end-time minus start-time; mock returns a fixed
 * value per doctor so the wait-estimate display in the front-desk strip
 * varies realistically across columns.
 */
const DOCTOR_AVG_CONSULT_MINUTES: Record<string, number> = {
  'usr-doc-001': 4,
  'usr-doc-002': 6,
  'usr-doc-003': 5,
  'usr-doc-004': 7,
  'usr-doc-005': 4,
};
const DEFAULT_AVG_CONSULT_MINUTES = 5;

export const fetchQueueByDoctor = async (): Promise<DoctorQueueGroup[]> => {
  const groupsByDoctor = new Map<string, DoctorQueueGroup>();

  // Seed every bookable doctor so the UI always shows the same column
  // set, even when a doctorâ€™s queue is empty.
  for (const d of sharedDoctors) {
    groupsByDoctor.set(d.id, {
      doctorId: d.id,
      doctorName: d.name,
      department: d.dept,
      entries: [],
      avgConsultMinutes:
        DOCTOR_AVG_CONSULT_MINUTES[d.id] ?? DEFAULT_AVG_CONSULT_MINUTES,
    });
  }

  for (const row of mockQueue) {
    if (row.status.name !== 'awaiting_doctor' && row.status.name !== 'in_consultation') continue;
    const doc = mockOpVisitDoctor[row.opNumber];
    if (!doc) continue;
    const group = groupsByDoctor.get(doc.doctorId) ?? {
      doctorId: doc.doctorId,
      doctorName: doc.doctorName,
      department: doc.department,
      entries: [],
      avgConsultMinutes:
        DOCTOR_AVG_CONSULT_MINUTES[doc.doctorId] ?? DEFAULT_AVG_CONSULT_MINUTES,
    };
    group.entries.push(row);
    groupsByDoctor.set(doc.doctorId, group);
  }

  const groups = Array.from(groupsByDoctor.values()).map((g) => ({
    ...g,
    entries: [...g.entries].sort(
      (a, b) =>
        new Date(a.appointmentTime).getTime() - new Date(b.appointmentTime).getTime(),
    ),
  }));

  return delay(groups, 120);
};

/**
 * Doctor calls the next patient. Per the patient_states catalogue
 * (140 awaiting_doctor â†’ 150 in_consultation), the encounter must
 * leave the queueâ€™s "awaiting" view so two doctors donâ€™t grab the
 * same patient. Mock: flip the queue rowâ€™s status.
 */
export const startConsultation = async (opNumber: string): Promise<{ opNumber: string }> => {
  setQueueStatus(opNumber, 'in_consultation');
  return delay({ opNumber });
};

/**
 * Doctor closes the visit (BRD Â§1 step 21). Per patient_states
 * (150 in_consultation â†’ 160 consultation_done), the encounter
 * leaves the doctorâ€™s active queue. Subsequent transitions
 * (rx_pending / awaiting_billing / completed) are owned by
 * pharmacy + cashier downstream.
 */
export const completeConsultation = async (opNumber: string): Promise<void> => {
  setQueueStatus(opNumber, 'consultation_done');
  await delay(null);
};

/* ---------- Front-desk: register a walk-in encounter (BRD Â§1 step 3) ---------- */

let mockOpSeq = 200;
const todayYearShort = (): string => String(new Date().getFullYear());

/**
 * Create a fresh OP visit for a walk-in or appointment check-in. Server
 * issues `op_number`, `token_number`, and the initial `patient_states`
 * code (110 registered â†’ 120 awaiting_vitals via the journey trigger).
 *
 * Wire point: POST /api/encounters/op-visits
 *
 * Mock side-effect: pushes a row onto `mockQueue` in `awaiting_vitals`
 * status so the same patient appears on the nurseâ€™s vitals queue
 * immediately after registration â€” the demo loop the user expects.
 */
export const createOpVisit = async (input: OpVisitCreateInput): Promise<OpVisitCreated> => {
  mockOpSeq += 1;
  const opNumber = `OP-${todayYearShort()}-${String(mockOpSeq).padStart(5, '0')}`;
  const tokenNumber = `OP-T-${String(mockOpSeq % 99).padStart(2, '0')}`;
  // Per BRD Â§1 step 4 + role-permission split, reception cannot mark
  // the consult fee paid. The encounter starts in `awaiting_billing`;
  // the cashierâ€™s recordPayment transitions it to `awaiting_vitals`.
  const initialState: EncounterStatus = { code: 200, name: 'awaiting_billing' };

  // Mock side-effect: when the caller has already loaded the patient
  // (front-desk RegistrationPage has it from search/create), use that
  // snapshot to add a realistic row to the queue. Real backend joins
  // op_visits â†’ patients itself; the snapshot is mock-only.
  if (input.patientSnapshot) {
    appendQueueEntry({
      opNumber,
      tokenNumber,
      patient: input.patientSnapshot,
      chiefComplaint: input.chiefComplaint,
      appointmentTime: new Date().toISOString(),
      status: initialState,
      isEmergency: input.isEmergency ?? false,
      emergencyTriage: input.emergencyTriage,
      waitingForMinutes: 0,
      // Fresh encounter â€” no orders or prescription yet.
      hasPrescription: false,
      hasLabOrders: false,
      hasRadiologyOrders: false,
    });
  }

  // Populate the op_visit â†’ doctor join map so owner / cashier
  // analytics can pivot revenue by doctor + department. Real backend
  // joins via FK; mock keeps a flat map.
  const doc = sharedDoctors.find((d) => d.id === input.doctorId);
  if (doc) {
    setOpVisitDoctor(opNumber, {
      doctorId: doc.id,
      doctorName: doc.name,
      department: doc.dept,
    });
  }

  return delay({ opNumber, tokenNumber, initialState });
};

/* ---------- Nurse: capture vitals (BRD Â§1 step 6) ---------- */

/**
 * Records vitals and advances the patient from awaiting_vitals â†’
 * awaiting_doctor. The backend completes the vitals patient_queue row,
 * which is what the live-queue query checks.
 *
 * Wire point: POST /api/visits/:opNumber/vitals
 */
export const recordVitals = async (
  opNumber: string,
  payload: VitalsCaptureInput,
): Promise<VitalsRecord> => {
  const body: Record<string, unknown> = {
    bpSystolic:       payload.bpSystolic,
    bpDiastolic:      payload.bpDiastolic,
    pulseRate:        payload.pulseRate,
    spo2:             payload.spo2,
    temperatureF:     payload.temperatureF,
    respiratoryRate:  payload.respiratoryRate,
    weightKg:         payload.weightKg,
    heightCm:         payload.heightCm,
    bloodSugarRandom: payload.bloodSugarRandom,
    painScore:        payload.painScore,
    notes:            payload.notes,
    chiefComplaint:   payload.chiefComplaint,
  };
  const { id } = await httpClient.post<{ id: string }>(
    `/visits/${opNumber}/vitals`, body,
  );
  return {
    ...payload,
    id,
    patientId: opNumber,
    opVisitId: opNumber,
    recordedBy: opNumber,
    recordedAt: new Date().toISOString(),
  };
};

/* ---------- Generic state transition (front-desk + nurse) ---------- */

/**
 * Move an encounter to a new state. The server validates the transition
 * against the `next_possible_codes` array on the source state row in
 * `patient_states` and issues the int code for the requested slug.
 *
 * Wire point: POST /api/encounters/:opNumber/state
 */
export const transitionEncounterState = async (
  opNumber: string,
  toName: EncounterStatusName,
): Promise<EncounterStatus> => {
  // Mock side-effect: keep the queue rowâ€™s status in sync so the demo
  // shows the patient leaving `awaiting_vitals` after vitals capture
  // and appearing on the doctorâ€™s `awaiting_doctor` queue.
  setQueueStatus(opNumber, toName);
  // Mock returns code 0 â€” backend stamps the real int from patient_states.code.
  return delay({ code: 0, name: toName });
};

/**
 * Append-only ledger of state transitions for a visit (TSD-04 Â§4.3
 * `patient_journey_events`). Returned ascending by `occurred_at`.
 *
 * Wire point:
 *  GET /api/encounters/:opNumber/journey-events
 */
export const fetchJourneyEvents = async (opNumber: string): Promise<JourneyEvent[]> => {
  const events = mockJourneyEvents[opNumber] ?? [];
  return delay(events);
};

/**
 * Maps a `LiveQueueEntry` (real backend shape) to the mock-era `QueueEntry`
 * shape so components that accept `QueueEntry` (e.g. VitalsCaptureForm) can
 * consume live-backend data without a prop change.
 *
 * `chiefComplaint` is not returned by the queue endpoint â€” the nurse fills it
 * in during vitals capture, so it defaults to ''.
 * `firstName`/`lastName` are derived by splitting `fullName` on the first
 * space; the display-only fields that need them (`fullName` is preferred
 * everywhere in the vitals UI) are unaffected.
 */
export const liveToQueueEntry = (live: LiveQueueEntry): QueueEntry => {
  const spaceIdx = live.patient.fullName.indexOf(' ');
  return {
    opNumber:     live.opNumber    ?? '',
    tokenNumber:  live.tokenNumber ?? '',
    patient: {
      id:          live.patient.id,
      uhid:        live.patient.uhid,
      firstName:   spaceIdx > -1 ? live.patient.fullName.slice(0, spaceIdx) : live.patient.fullName,
      lastName:    spaceIdx > -1 ? live.patient.fullName.slice(spaceIdx + 1) : '',
      fullName:    live.patient.fullName,
      gender:      live.patient.gender as Gender,
      ageYears:    live.patient.ageYears,
      mobile:      live.patient.mobile,
      bloodGroup:  live.patient.bloodGroup ?? undefined,
      allergies:   live.patient.allergies,
    },
    chiefComplaint:  '',
    appointmentTime: live.scheduledAt,
    status:          { code: 120, name: 'awaiting_vitals' },
    isEmergency:     false,
    waitingForMinutes: Math.max(
      0,
      Math.round((Date.now() - new Date(live.waitingSince).getTime()) / 60_000),
    ),
    // Pre-doctor â€” no orders or prescription can exist yet.
    hasPrescription:    false,
    hasLabOrders:       false,
    hasRadiologyOrders: false,
  };
};

/**
 * Live OPD queue â€” real backend (GET /api/queue).
 * Returns all patients for today across three states, paginated.
 * For future dates returns scheduled appointments (status = 'booked').
 *
 * TODO: remove the future-date mock branch when GET /api/queue?date=<future>
 * returns real appointment rows from the backend.
 */
export const fetchLiveQueue = async (params: {
  date?: string;
  doctorId?: string;
  queueStatus?: LiveQueueStatus;
  q?: string;
  page?: number;
  limit?: number;
} = {}): Promise<PageResult<LiveQueueEntry>> => {
  const today = new Date().toISOString().slice(0, 10);
  const requestedDate = params.date ?? today;

  if (requestedDate > today) {
    return delay(buildFutureAppointmentsMock(params), 150);
  }

  // DEMO MODE: the live OPD queue is fed by op_visits + patient_states
  // (Module 10 in v3 schema). For tomorrow's demo we don't have that data
  // flowing yet, so we return the same mock rows downstream features
  // (vitals page, doctor queue) read from. Skips the httpClient call to
  // localhost:8080 entirely — the global error interceptor used to push
  // four CORS-error toasts every poll.
  return delay(buildLiveQueueMock(params), 80);
};

const LIVE_STATUS_MAP: Partial<Record<EncounterStatusName, LiveQueueStatus>> = {
  registered:        'pending_payment',
  awaiting_billing:  'pending_payment',
  awaiting_vitals:   'awaiting_vitals',
  vitals_done:       'awaiting_doctor',
  awaiting_doctor:   'awaiting_doctor',
};

const buildLiveQueueMock = (params: {
  doctorId?: string;
  queueStatus?: LiveQueueStatus;
  q?: string;
  page?: number;
  limit?: number;
}): PageResult<LiveQueueEntry> => {
  const page  = params.page  ?? 1;
  const limit = params.limit ?? 20;

  const all: LiveQueueEntry[] = mockQueue
    .map((row): LiveQueueEntry | null => {
      const qs = LIVE_STATUS_MAP[row.status.name];
      if (!qs) return null;
      const doctor = mockOpVisitDoctor[row.opNumber];
      if (!doctor) return null;
      return {
        appointmentId: null,
        appointmentNo: null,
        opNumber: row.opNumber,
        tokenNumber: row.tokenNumber,
        patient: {
          id: row.patient.id,
          uhid: row.patient.uhid,
          fullName: row.patient.fullName,
          gender: row.patient.gender,
          ageYears: row.patient.ageYears,
          mobile: row.patient.mobile ?? '',
          bloodGroup: null,
          allergies: (row.patient.allergies ?? []).map((a) => ({
            allergen: typeof a === 'string' ? a : a.allergen,
          })),
        },
        doctorId: doctor.doctorId,
        doctorName: doctor.doctorName,
        department: doctor.department,
        scheduledAt: row.appointmentTime,
        queueStatus: qs,
        waitingSince: row.appointmentTime,
      };
    })
    .filter((r): r is LiveQueueEntry => r !== null);

  let filtered = all;
  if (params.doctorId && params.doctorId !== 'all') {
    filtered = filtered.filter((r) => r.doctorId === params.doctorId);
  }
  if (params.queueStatus) {
    filtered = filtered.filter((r) => r.queueStatus === params.queueStatus);
  }
  if (params.q) {
    const q = params.q.toLowerCase();
    filtered = filtered.filter(
      (r) =>
        r.patient.fullName.toLowerCase().includes(q) ||
        r.patient.uhid.toLowerCase().includes(q) ||
        (r.opNumber ?? '').toLowerCase().includes(q) ||
        (r.tokenNumber ?? '').toLowerCase().includes(q) ||
        r.patient.mobile.includes(q),
    );
  }

  const start = (page - 1) * limit;
  return {
    rows: filtered.slice(start, start + limit),
    total: filtered.length,
    page,
    limit,
  };
};

interface FutureSlot {
  uhid: string; fullName: string; gender: string; ageYears: number; mobile: string;
  doctorId: string; doctorName: string; department: string; slotTime: string;
}

const FUTURE_SLOTS: FutureSlot[] = [
  { uhid: 'KH-2026-00045', fullName: 'Karthik R.',   gender: 'M', ageYears: 42, mobile: '+91 98430 12121', doctorId: 'usr-doc-001', doctorName: 'Dr. Naveen Kumar', department: 'Orthopaedics',             slotTime: '09:00' },
  { uhid: 'KH-2026-00049', fullName: 'Lakshmi N.', gender: 'F', ageYears: 71, mobile: '+91 87654 32114', doctorId: 'usr-doc-001', doctorName: 'Dr. Naveen Kumar', department: 'Orthopaedics',             slotTime: '09:30' },
  { uhid: 'KH-2026-00050', fullName: 'Suresh B.',       gender: 'M', ageYears: 49, mobile: '+91 95000 23456', doctorId: 'usr-doc-001', doctorName: 'Dr. Naveen Kumar', department: 'Orthopaedics',             slotTime: '10:00' },
  { uhid: 'KH-2026-00046', fullName: 'Meera S.',       gender: 'F', ageYears: 58, mobile: '+91 99100 12434', doctorId: 'usr-doc-002', doctorName: 'Dr. Anand', department: 'General Medicine',         slotTime: '09:30' },
  { uhid: 'KH-2026-00047', fullName: 'Ramesh B.',        gender: 'M', ageYears: 67, mobile: '+91 90080 56788', doctorId: 'usr-doc-002', doctorName: 'Dr. Anand', department: 'General Medicine',         slotTime: '10:00' },
  { uhid: 'KH-2026-00048', fullName: 'Aarav K.',       gender: 'M', ageYears:  9, mobile: '+91 88997 65302', doctorId: 'usr-doc-002', doctorName: 'Dr. Anand', department: 'General Medicine',         slotTime: '10:30' },
  { uhid: 'KH-2026-00051', fullName: 'Sunita V.',       gender: 'F', ageYears: 34, mobile: '+91 90909 80155', doctorId: 'usr-doc-003', doctorName: 'Dr. Meera',   department: 'Dental',                   slotTime: '10:00' },
  { uhid: 'KH-2026-00052', fullName: 'Vikram B.',       gender: 'M', ageYears: 51, mobile: '+91 88112 34512', doctorId: 'usr-doc-003', doctorName: 'Dr. Meera',   department: 'Dental',                   slotTime: '11:00' },
  { uhid: 'KH-2026-00053', fullName: 'Aisha S.',       gender: 'F', ageYears: 28, mobile: '+91 77665 54381', doctorId: 'usr-doc-004', doctorName: 'Dr. Lakshmi',   department: 'Obstetrics & Gynaecology', slotTime: '10:00' },
  { uhid: 'KH-2026-00054', fullName: 'Ravi A.',          gender: 'M', ageYears: 45, mobile: '+91 91234 50012', doctorId: 'usr-doc-004', doctorName: 'Dr. Lakshmi',   department: 'Obstetrics & Gynaecology', slotTime: '11:00' },
  { uhid: 'KH-2026-00055', fullName: 'Divya M.',        gender: 'F', ageYears: 32, mobile: '+91 91234 50013', doctorId: 'usr-doc-005', doctorName: 'Dr. Ravi',   department: 'Physiotherapy',            slotTime: '09:00' },
  { uhid: 'KH-2026-00056', fullName: 'Arun K.',      gender: 'M', ageYears: 28, mobile: '+91 91234 50014', doctorId: 'usr-doc-005', doctorName: 'Dr. Ravi',   department: 'Physiotherapy',            slotTime: '09:30' },
];

const buildFutureAppointmentsMock = (params: {
  date?: string; doctorId?: string; q?: string; page?: number; limit?: number;
}): PageResult<LiveQueueEntry> => {
  const date = params.date ?? new Date().toISOString().slice(0, 10);
  let slots = FUTURE_SLOTS;
  if (params.doctorId && params.doctorId !== 'all') slots = slots.filter((s) => s.doctorId === params.doctorId);
  if (params.q) {
    const q = params.q.toLowerCase();
    slots = slots.filter((s) => s.fullName.toLowerCase().includes(q) || s.uhid.toLowerCase().includes(q));
  }
  const rows: LiveQueueEntry[] = slots.map((s) => ({
    appointmentId: `mock-appt-${s.uhid}`,
    appointmentNo: null,
    opNumber: null,
    tokenNumber: null,
    patient: { id: s.uhid, uhid: s.uhid, fullName: s.fullName, gender: s.gender, ageYears: s.ageYears, mobile: s.mobile, bloodGroup: null, allergies: [] },
    doctorId: s.doctorId,
    doctorName: s.doctorName,
    department: s.department,
    scheduledAt: `${date}T${s.slotTime}:00`,
    queueStatus: 'booked' as unknown as LiveQueueStatus,
    waitingSince: `${date}T${s.slotTime}:00`,
  }));
  const page  = params.page  ?? 1;
  const limit = params.limit ?? 20;
  const start = (page - 1) * limit;
  return { rows: rows.slice(start, start + limit), total: rows.length, page, limit };
};

/**
 * Encounters where the doctor previously consulted, ordered reports, and at
 * least one report has come back. Drives the "Reports to check" tab.
 * Backend composite endpoint per audit decision.
 */
/**
 * Search completed encounters whose primary diagnosis matches a free-text
 * substring â€” drives the doctor's "Cases" top-bar search mode.
 *
 * Wire point: `GET /api/doctor/cases?q=<text>&size=<n>`.
 *
 * Mock note: today's `mockQueue` carries `chiefComplaint` but not a
 * separate `primaryDiagnosis` column, so the mock substring-matches on
 * `chiefComplaint` for `consultation_done` rows. When the backend lands
 * with a real diagnosis field, only the mock body changes â€” callers and
 * the `CaseSummary` shape stay the same.
 */
export const searchCasesByDiagnosis = async (
  q: string,
  limit: number = 10,
): Promise<CaseSummary[]> => {
  const trimmed = q.trim().toLowerCase();
  if (!trimmed) return delay([]);
  const matches: CaseSummary[] = mockQueue
    .filter(
      (row) =>
        row.status.name === 'consultation_done' &&
        row.chiefComplaint.toLowerCase().includes(trimmed),
    )
    .slice(0, limit)
    .map((row) => ({
      opNumber: row.opNumber,
      consultedAt: row.appointmentTime,
      patient: row.patient,
      primaryDiagnosis: row.chiefComplaint,
    }));
  return delay(matches, 150);
};

export const fetchReportPendingQueue = async (
  params: { page?: number; limit?: number; sort?: string; q?: string; doctorId?: string } = {},
): Promise<ReportPendingEntry[]> => {
  void params.page;
  void params.limit;
  void params.sort;
  let rows = mockReportPendingQueue.filter((e) => e.readyCount > 0);
  if (params.doctorId && params.doctorId !== 'all') {
    rows = rows.filter(
      (r) => mockOpVisitDoctor[r.opNumber]?.doctorId === params.doctorId,
    );
  }
  if (params.q) {
    const q = params.q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.patient.fullName.toLowerCase().includes(q) ||
        r.patient.uhid.toLowerCase().includes(q) ||
        r.opNumber.toLowerCase().includes(q) ||
        (r.primaryDiagnosis ?? '').toLowerCase().includes(q),
    );
  }
  return delay(rows);
};
