import { httpClient } from '@/lib/http/httpClient';
import type { Gender } from '@/features/patient';
import { supabase } from '@/lib/supabase/supabaseClient';
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

export const LIVE_QUEUE_SORT_WHITELIST = [
  'tokenNumber',
  'patient.fullName',
  'queueStatus',
  'waitingSince',
  // queuePos is virtual — handled separately in the component
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
/* Station → encounter-status mapping for Supabase-backed queue */
const STATION_TO_STATUS: Record<string, EncounterStatusName> = {
  front_desk:      'registered',
  vitals:          'awaiting_vitals',
  doctor:          'awaiting_doctor',
  billing:         'awaiting_billing',
  lab_collection:  'lab_pending',
  lab_processing:  'lab_pending',
  radiology:       'imaging_pending',
  pharmacy:        'pharmacy_pending',
};

const STATUS_CODE: Record<EncounterStatusName, number> = {
  walk_in_arrived: 105, registered: 110, awaiting_vitals: 120, vitals_done: 130,
  awaiting_doctor: 140, in_consultation: 150, consultation_done: 160,
  awaiting_billing: 200, paid: 210, lab_pending: 300, imaging_pending: 310,
  pharmacy_pending: 320, closed: 400, booked: 100,
};

/**
 * Reverse of STATION_TO_STATUS — which DB `station_type` does the
 * patient_states row need to land on when the FE asks for a given
 * encounter status? Used by `transitionEncounterState` to drive the
 * Supabase write. Statuses with no clean station mapping (e.g.
 * `consultation_done`, `closed`) intentionally don't appear — the
 * caller should close the visit (`closed_at`) instead of moving state.
 */
type TargetStation =
  | 'front_desk' | 'vitals' | 'doctor' | 'billing'
  | 'lab_collection' | 'lab_processing' | 'radiology' | 'pharmacy';

const STATUS_TO_STATION: Partial<Record<EncounterStatusName, TargetStation>> = {
  registered:       'front_desk',
  awaiting_billing: 'billing',
  awaiting_vitals:  'vitals',
  awaiting_doctor:  'doctor',
  in_consultation:  'doctor',
  lab_pending:      'lab_collection',
  imaging_pending:  'radiology',
  pharmacy_pending: 'pharmacy',
};

const ageFromDobIso = (dob: string | null | undefined): number => {
  if (!dob) return 0;
  const d = new Date(dob); const n = new Date();
  return Math.max(0, n.getFullYear() - d.getFullYear() -
    (n < new Date(n.getFullYear(), d.getMonth(), d.getDate()) ? 1 : 0));
};

interface SbQueueRow {
  id: string; op_number: string; chief_complaint: string | null;
  doctor_id: string; created_at: string;
  patients: { id: string; uhid: string; first_name: string; last_name: string;
    gender: string; date_of_birth: string | null; mobile: string | null;
    blood_group: string | null } | null;
  users: { id: string; full_name: string;
    departments: { dept_name: string } | null } | null;
  patient_states: { entered_at: string;
    stations: { station_type: string } | null }[];
  // Embedded after the retrofit so the queue shows the real D-NN
  // token (issued at payment time) instead of the old OP-T-<last2digits>
  // synthetic. Optional — the synthetic is still emitted as a fallback
  // for any row that somehow doesn't have a token row yet.
  tokens: { token_number: string }[];
}

const supabaseRowToQueueEntry = (r: SbQueueRow): QueueEntry => {
  const ps = r.patient_states[0];
  const stationType = ps?.stations?.station_type ?? 'doctor';
  const statusName = STATION_TO_STATUS[stationType] ?? 'awaiting_doctor';
  const enteredAt = ps?.entered_at ?? r.created_at;
  const minutes = Math.max(0, Math.round((Date.now() - new Date(enteredAt).getTime()) / 60_000));
  const p = r.patients;
  const realToken = r.tokens?.[0]?.token_number;
  return {
    opNumber: r.op_number,
    tokenNumber: realToken ?? `OP-T-${r.op_number.slice(-2)}`,
    patient: {
      id: p?.id ?? '',
      uhid: p?.uhid ?? '',
      firstName: p?.first_name ?? '',
      lastName: p?.last_name ?? '',
      fullName: p ? `${p.first_name} ${p.last_name}`.trim() : '(unknown)',
      gender: (p?.gender ?? 'o') as Gender,
      ageYears: ageFromDobIso(p?.date_of_birth ?? null),
      mobile: p?.mobile ?? undefined,
      bloodGroup: p?.blood_group ?? undefined,
      allergies: [],
      chronicConditions: [],
    },
    chiefComplaint: r.chief_complaint ?? '',
    appointmentTime: r.created_at,
    status: { code: STATUS_CODE[statusName] ?? 0, name: statusName },
    isEmergency: false,
    waitingForMinutes: minutes,
    hasPrescription: false,
    hasLabOrders: false,
    hasRadiologyOrders: false,
  };
};

/**
 * Fetch visits the doctor has already finished today. Used by the
 * "Consultation done" tab — these are visits where lockConsultation
 * has run (consultations.locked_at is set), so they no longer belong
 * in the live "Consultation queue".
 */
const fetchDoneCases = async (doctorId?: string): Promise<QueueEntry[]> => {
  // Use last 24h of visit_date so a doctor running late doesn't lose visits.
  const todayIso = new Date().toISOString().slice(0, 10);
  const yesterdayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  let q = supabase
    .from('op_visits')
    .select(`
      id, op_number, chief_complaint, doctor_id, created_at, closed_at,
      patients!op_visits_patient_id_fkey ( id, uhid, first_name, last_name, gender, date_of_birth, mobile, blood_group ),
      users:users!op_visits_doctor_id_fkey ( id, full_name, departments!fk_users_department ( dept_name ) ),
      consultations!inner ( locked_at ),
      tokens ( token_number )
    `)
    .gte('visit_date', yesterdayIso)
    .lte('visit_date', todayIso)
    .not('consultations.locked_at', 'is', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(100);
  if (doctorId && doctorId !== 'all') q = q.eq('doctor_id', doctorId);
  const { data, error } = await q;
  if (error || !data) return [];

  interface SbDoneRow {
    id: string; op_number: string; chief_complaint: string | null;
    doctor_id: string; created_at: string; closed_at: string | null;
    patients: { id: string; uhid: string; first_name: string; last_name: string;
      gender: string; date_of_birth: string | null; mobile: string | null;
      blood_group: string | null } | null;
    users: { id: string; full_name: string;
      departments: { dept_name: string } | null } | null;
    consultations: Array<{ locked_at: string | null }>;
    tokens: Array<{ token_number: string }>;
  }
  return (data as unknown as SbDoneRow[]).map((r): QueueEntry => {
    const p = r.patients;
    const realToken = r.tokens?.[0]?.token_number;
    return {
      opNumber: r.op_number,
      tokenNumber: realToken ?? `OP-T-${r.op_number.slice(-2)}`,
      patient: {
        id: p?.id ?? '', uhid: p?.uhid ?? '',
        firstName: p?.first_name ?? '', lastName: p?.last_name ?? '',
        fullName: p ? `${p.first_name} ${p.last_name}`.trim() : '(unknown)',
        gender: (p?.gender ?? 'o') as Gender,
        ageYears: ageFromDobIso(p?.date_of_birth ?? null),
        mobile: p?.mobile ?? undefined,
        bloodGroup: p?.blood_group ?? undefined,
        allergies: [], chronicConditions: [],
      },
      chiefComplaint: r.chief_complaint ?? '',
      appointmentTime: r.created_at,
      status: { code: 160, name: 'consultation_done' },
      isEmergency: false,
      waitingForMinutes: 0,
      hasPrescription: false,
      hasLabOrders: false,
      hasRadiologyOrders: false,
    };
  });
};

export const fetchQueue = async (params: QueueListParams = {}): Promise<QueueEntry[]> => {
  void params.page;
  void params.limit;
  void params.sort;

  // Branch to the "done" pull when the caller is asking for finished visits.
  // The live-queue join below would exclude closed encounters by design.
  const wantsDone =
    params.status === 'consultation_done' ||
    (params.statuses?.length === 1 && params.statuses[0] === 'consultation_done');
  if (wantsDone) {
    let rows = await fetchDoneCases(params.doctorId);
    if (params.q) {
      const q = params.q.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.patient.fullName.toLowerCase().includes(q) ||
          r.patient.uhid.toLowerCase().includes(q) ||
          r.opNumber.toLowerCase().includes(q),
      );
    }
    return rows;
  }

  // Live queue. Scope to the logged-in doctor when doctorId is passed
  // (QueuePage sends user.id for doctor / chief_doctor roles) so each
  // doctor sees only their own patients. 'all' or undefined falls
  // through unfiltered for owner / chief_doctor overview surfaces.
  let opQ = supabase
    .from('op_visits')
    .select(`
      id, op_number, chief_complaint, doctor_id, created_at,
      patients!op_visits_patient_id_fkey ( id, uhid, first_name, last_name, gender, date_of_birth, mobile, blood_group ),
      users:users!op_visits_doctor_id_fkey ( id, full_name, departments!fk_users_department ( dept_name ) ),
      patient_states!inner ( entered_at, stations ( station_type ) ),
      tokens ( token_number )
    `)
    .is('closed_at', null)
    .is('deleted_at', null)
    .is('patient_states.left_at', null)
    .order('created_at', { ascending: true })
    .limit(100);
  if (params.doctorId && params.doctorId !== 'all') {
    opQ = opQ.eq('doctor_id', params.doctorId);
  }
  const { data, error } = await opQ;

  if (error) return delay(mockQueue.slice(0, 8));
  let rows = ((data ?? []) as unknown as SbQueueRow[]).map(supabaseRowToQueueEntry);

  if (params.statuses && params.statuses.length > 0) {
    const allow = new Set(params.statuses);
    rows = rows.filter((r) => allow.has(r.status.name));
  } else if (params.status && params.status !== 'all') {
    rows = rows.filter((r) => r.status.name === params.status);
  }
  if (params.q) {
    const q = params.q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.patient.fullName.toLowerCase().includes(q) ||
        r.patient.uhid.toLowerCase().includes(q) ||
        r.tokenNumber.toLowerCase().includes(q) ||
        r.opNumber.toLowerCase().includes(q) ||
        r.chiefComplaint.toLowerCase().includes(q),
    );
  }
  return rows;
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

  // Resolve the actual doctor roster from Supabase so the column set
  // mirrors the live cohort, not the mock seed.
  let roster: Array<{ id: string; name: string; dept: string }> = sharedDoctors as Array<{ id: string; name: string; dept: string }>;
  try {
    const { fetchBookableDoctors } = await import('@/features/appointments/appointmentsApi');
    const docs = await fetchBookableDoctors();
    if (docs.length > 0) {
      roster = docs.map((d) => ({ id: d.id, name: d.name, dept: d.department }));
    }
  } catch {
    // keep sharedDoctors fallback
  }
  for (const d of roster) {
    groupsByDoctor.set(d.id, {
      doctorId: d.id,
      doctorName: d.name,
      department: d.dept,
      entries: [],
      avgConsultMinutes:
        DOCTOR_AVG_CONSULT_MINUTES[d.id] ?? DEFAULT_AVG_CONSULT_MINUTES,
    });
  }

  // One Supabase round-trip: every open op_visit at the doctor station,
  // joined with the patient + the live patient_states row.
  try {
    const { data } = await supabase
      .from('op_visits')
      .select(`
        id, op_number, chief_complaint, doctor_id, created_at,
        patients!op_visits_patient_id_fkey ( id, uhid, first_name, last_name, gender, date_of_birth, mobile, blood_group ),
        users:users!op_visits_doctor_id_fkey ( id, full_name, departments!fk_users_department ( dept_name ) ),
        patient_states!inner ( entered_at, stations ( station_type ) )
      `)
      .is('closed_at', null)
      .is('deleted_at', null)
      .is('patient_states.left_at', null)
      .order('created_at', { ascending: true })
      .limit(200);
    const rows = ((data ?? []) as unknown as Array<SbQueueRow & { doctor_id: string }>);
    for (const r of rows) {
      const entry = supabaseRowToQueueEntry(r);
      if (entry.status.name !== 'awaiting_doctor' && entry.status.name !== 'in_consultation') continue;
      const group = groupsByDoctor.get(r.doctor_id);
      if (!group) continue;
      group.entries.push(entry);
    }
  } catch {
    // Fall through to the mock-only bucketing below.
  }

  // Mock fallback for rows still seeded locally (Karthik etc.).
  for (const row of mockQueue) {
    if (row.status.name !== 'awaiting_doctor' && row.status.name !== 'in_consultation') continue;
    const doc = mockOpVisitDoctor[row.opNumber];
    if (!doc) continue;
    const group = groupsByDoctor.get(doc.doctorId);
    if (!group) continue;
    if (group.entries.some((e) => e.opNumber === row.opNumber)) continue;
    group.entries.push(row);
  }

  return Array.from(groupsByDoctor.values()).map((g) => ({
    ...g,
    entries: [...g.entries].sort(
      (a, b) =>
        new Date(a.appointmentTime).getTime() - new Date(b.appointmentTime).getTime(),
    ),
  }));
};

/**
 * Resolve op_visit by op_number, returning {id, patient_id} or null.
 * Shared helper for state-transition writes below.
 */
const lookupOpVisit = async (
  opNumber: string,
): Promise<{ id: string; patientId: string } | null> => {
  try {
    const { data } = await supabase
      .from('op_visits')
      .select('id, patient_id')
      .eq('op_number', opNumber)
      .is('deleted_at', null)
      .maybeSingle();
    if (!data) return null;
    const r = data as { id: string; patient_id: string };
    return { id: r.id, patientId: r.patient_id };
  } catch {
    return null;
  }
};

/**
 * Move the active patient_states row to a new station. Idempotent:
 * if the current active state is already at the target station, no-op.
 * Returns false on any DB failure so callers can decide whether to
 * surface the error to the user.
 */
const moveToStation = async (
  opVisitId: string,
  patientId: string,
  stationType: 'front_desk' | 'vitals' | 'doctor' | 'billing' | 'pharmacy' |
               'lab_collection' | 'lab_processing' | 'radiology',
): Promise<boolean> => {
  try {
    const bs = '00000000-0000-0000-0000-000000000001';
    const { data: stRow } = await supabase
      .from('stations').select('id, station_type')
      .eq('station_type', stationType).is('deleted_at', null).maybeSingle();
    const target = stRow as { id: string; station_type: string } | null;
    if (!target) return false;

    const { data: active } = await supabase
      .from('patient_states')
      .select('id, station_id')
      .eq('op_visit_id', opVisitId)
      .is('left_at', null)
      .is('deleted_at', null)
      .maybeSingle();
    const cur = active as { id: string; station_id: string } | null;

    if (cur && cur.station_id === target.id) return true; // already there

    if (cur) {
      const { error: closeErr } = await supabase
        .from('patient_states').update({ left_at: new Date().toISOString() })
        .eq('id', cur.id);
      if (closeErr) return false;
    }

    const { error: insErr } = await supabase
      .from('patient_states').insert({
        patient_id: patientId,
        op_visit_id: opVisitId,
        station_id: target.id,
        metadata: {},
        created_by: bs,
      });
    if (insErr) return false;
    return true;
  } catch {
    return false;
  }
};

/**
 * Close the active patient_states row WITHOUT inserting a successor
 * (used when the visit is being completed entirely — no next station).
 */
const closeActiveState = async (opVisitId: string): Promise<boolean> => {
  try {
    const { data: active } = await supabase
      .from('patient_states')
      .select('id')
      .eq('op_visit_id', opVisitId)
      .is('left_at', null)
      .is('deleted_at', null)
      .maybeSingle();
    const cur = active as { id: string } | null;
    if (!cur) return true;
    const { error } = await supabase
      .from('patient_states').update({ left_at: new Date().toISOString() })
      .eq('id', cur.id);
    return !error;
  } catch {
    return false;
  }
};

/**
 * Doctor calls the next patient. Per the patient_states catalogue
 * (140 awaiting_doctor â†’ 150 in_consultation), the encounter must
 * leave the queueâ€™s "awaiting" view so two doctors donâ€™t grab the
 * same patient. Persists to Supabase: ensures the active state is
 * at the doctor station (idempotent if patient already there).
 */
export const startConsultation = async (opNumber: string): Promise<{ opNumber: string }> => {
  setQueueStatus(opNumber, 'in_consultation');
  const opv = await lookupOpVisit(opNumber);
  if (opv) {
    await moveToStation(opv.id, opv.patientId, 'doctor');
  }
  return { opNumber };
};

/**
 * Doctor closes the visit (BRD Â§1 step 21). Per patient_states
 * (150 in_consultation â†’ 160 consultation_done), the encounter
 * leaves the doctorâ€™s active queue. Subsequent transitions
 * (rx_pending / awaiting_billing / completed) are owned by
 * pharmacy + cashier downstream.
 *
 * Persists to Supabase:
 *  - If the visit has an active (locked) prescription, transition
 *    the active patient_states row to the pharmacy station.
 *  - Otherwise close the active state and stamp op_visits.closed_at.
 */
export const completeConsultation = async (opNumber: string): Promise<void> => {
  setQueueStatus(opNumber, 'consultation_done');
  const opv = await lookupOpVisit(opNumber);
  if (!opv) return;
  try {
    // Is there an active prescription for this visit?
    const { data: cons } = await supabase
      .from('consultations').select('id').eq('op_visit_id', opv.id).maybeSingle();
    const consId = (cons as { id: string } | null)?.id;
    let hasRx = false;
    if (consId) {
      const { data: rx } = await supabase
        .from('prescriptions').select('id, status')
        .eq('consultation_id', consId).maybeSingle();
      const rxRow = rx as { id: string; status: string } | null;
      hasRx = !!rxRow && rxRow.status === 'active';
    }
    if (hasRx) {
      await moveToStation(opv.id, opv.patientId, 'pharmacy');
    } else {
      await closeActiveState(opv.id);
      await supabase.from('op_visits')
        .update({ closed_at: new Date().toISOString() })
        .eq('id', opv.id);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[completeConsultation] Supabase persistence failed:', e);
  }
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
  // Resolve op_visit + patient by op_number.
  const { data: opv, error: opvErr } = await supabase
    .from('op_visits')
    .select('id, patient_id')
    .eq('op_number', opNumber)
    .is('deleted_at', null)
    .maybeSingle();
  if (opvErr || !opv) {
    // Mock fallback so the demo never blocks if the op_number is unknown.
    return {
      ...payload,
      id: `vit-${Date.now()}`,
      patientId: opNumber,
      opVisitId: opNumber,
      recordedBy: '00000000-0000-0000-0000-000000000001',
      recordedAt: new Date().toISOString(),
    } satisfies VitalsRecord;
  }
  const { data: ins, error: insErr } = await supabase
    .from('vitals')
    .insert({
      patient_id:        opv.patient_id,
      op_visit_id:       opv.id,
      bp_systolic:       payload.bpSystolic ?? null,
      bp_diastolic:      payload.bpDiastolic ?? null,
      pulse_rate:        payload.pulseRate ?? null,
      spo2:              payload.spo2 ?? null,
      temperature_f:     payload.temperatureF ?? null,
      respiratory_rate:  payload.respiratoryRate ?? null,
      weight_kg:         payload.weightKg ?? null,
      height_cm:         payload.heightCm ?? null,
      blood_sugar_mg_dl: payload.bloodSugarRandom ?? null,
      pain_score:        payload.painScore ?? null,
      notes:             payload.notes ?? null,
      created_by:        '00000000-0000-0000-0000-000000000001',
    })
    .select('id, created_at, bmi')
    .single();
  if (insErr || !ins) {
    throw new Error(insErr?.message ?? 'Failed to save vitals');
  }

  // Vitals captured â†’ move the patient_states row to the doctor station
  // so the live queue picks them up on the doctorâ€™s side without
  // waiting for the doctor's startConsultation auto-correct. Vitals data
  // is the audit-bearing write; if the state move fails (transient DB
  // error) we still return success since startConsultation will
  // re-converge the state later.
  try {
    await moveToStation(opv.id, opv.patient_id, 'doctor');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[recordVitals] post-insert state move failed:', e);
  }

  return {
    ...payload,
    id: (ins as { id: string }).id,
    patientId: opv.patient_id,
    opVisitId: opv.id,
    bmi: (ins as { bmi: number | null }).bmi ?? undefined,
    recordedBy: '00000000-0000-0000-0000-000000000001',
    recordedAt: (ins as { created_at: string }).created_at,
  } satisfies VitalsRecord;

  // dead-code retained for FE compat
  void httpClient;
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
  // Mock side-effect first â€” keeps the local queue rowâ€™s status in sync
  // so the same-browser UI flips instantly without waiting for the DB
  // round-trip.
  setQueueStatus(opNumber, toName);

  // Supabase-backed transition: close the active patient_states row and
  // open a new one at the target station. moveToStation is idempotent
  // (no-op when the active state is already at the target), so this is
  // safe to call repeatedly.
  const targetStation = STATUS_TO_STATION[toName];
  if (targetStation) {
    try {
      const opv = await lookupOpVisit(opNumber);
      if (opv) {
        await moveToStation(opv.id, opv.patientId, targetStation);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[transitionEncounterState] DB move failed:', e);
    }
  }

  return { code: STATUS_CODE[toName] ?? 0, name: toName };
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
/**
 * Map a DB station_type to the FE LiveQueueStatus value.
 * The 'doctor' station maps to awaiting_doctor; 'vitals' maps to
 * awaiting_vitals; 'billing' / 'front_desk' map to pending_payment
 * (front-desk-station rows live in that band so the cashier sees
 * them). Anything downstream of the doctor station is dropped from
 * this view — the live queue surface is the front-desk / nurse
 * workspace, not the pharmacy / lab queues.
 */
const STATION_TO_LIVE_STATUS: Partial<Record<string, LiveQueueStatus>> = {
  front_desk:      'pending_payment',
  billing:         'pending_payment',
  vitals:          'awaiting_vitals',
  doctor:          'awaiting_doctor',
};

interface SbLiveOpVisitRow {
  id: string; op_number: string; doctor_id: string; created_at: string;
  appointment_id: string | null;
  patients: {
    id: string; uhid: string; first_name: string; last_name: string;
    gender: string; date_of_birth: string | null; mobile: string | null;
    blood_group: string | null;
  } | null;
  users: { id: string; full_name: string;
    departments: { dept_name: string } | null } | null;
  patient_states: Array<{ entered_at: string; stations: { station_type: string } | null }>;
  tokens: Array<{ token_number: string }>;
  appointments: { id: string; appointment_no: string; scheduled_at: string } | null;
}

interface SbLiveAppointmentRow {
  id: string; appointment_no: string; scheduled_at: string; status: string;
  reason: string | null;
  patients: {
    id: string; uhid: string; first_name: string; last_name: string;
    gender: string; date_of_birth: string | null; mobile: string | null;
    blood_group: string | null;
  } | null;
  users: { id: string; full_name: string;
    departments: { dept_name: string } | null } | null;
}

const mapPatientShape = (
  p: SbLiveOpVisitRow['patients'] | SbLiveAppointmentRow['patients'],
): LiveQueueEntry['patient'] => p ? {
  id:         p.id,
  uhid:       p.uhid,
  fullName:   `${p.first_name} ${p.last_name}`.trim(),
  gender:     (p.gender ?? 'o').toUpperCase(),
  ageYears:   ageFromDobIso(p.date_of_birth ?? null),
  mobile:     p.mobile ?? '',
  bloodGroup: p.blood_group,
  allergies:  [],
} : {
  id: '', uhid: '', fullName: '—', gender: 'o', ageYears: 0, mobile: '',
  bloodGroup: null, allergies: [],
};

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
  const isToday = requestedDate === today;
  const isPast  = requestedDate < today;

  try {
    const rows: LiveQueueEntry[] = [];

    // ── A) Live op_visit rows (today only — past closed visits + future
    //       not-yet-paid appointments don't have op_visits we care about).
    if (isToday) {
      let opQuery = supabase
        .from('op_visits')
        .select(`
          id, op_number, doctor_id, created_at, appointment_id,
          patients!op_visits_patient_id_fkey ( id, uhid, first_name, last_name, gender, date_of_birth, mobile, blood_group ),
          users:users!op_visits_doctor_id_fkey ( id, full_name, departments!fk_users_department ( dept_name ) ),
          patient_states!inner ( entered_at, stations ( station_type ) ),
          tokens ( token_number ),
          appointments ( id, appointment_no, scheduled_at )
        `)
        .is('closed_at', null)
        .is('deleted_at', null)
        .is('patient_states.left_at', null)
        .order('created_at', { ascending: true })
        .limit(200);
      if (params.doctorId && params.doctorId !== 'all') {
        opQuery = opQuery.eq('doctor_id', params.doctorId);
      }
      const { data: opData, error: opErr } = await opQuery;
      if (opErr) throw new Error(opErr.message);

      for (const r of (opData ?? []) as unknown as SbLiveOpVisitRow[]) {
        const stationType = r.patient_states[0]?.stations?.station_type ?? 'doctor';
        const queueStatus = STATION_TO_LIVE_STATUS[stationType];
        if (!queueStatus) continue; // skip rows beyond the front-desk surface
        const scheduledAt = r.appointments?.scheduled_at ?? r.created_at;
        rows.push({
          appointmentId: r.appointment_id,
          appointmentNo: r.appointments?.appointment_no ?? null,
          opNumber:      r.op_number,
          tokenNumber:   r.tokens[0]?.token_number ?? null,
          patient:       mapPatientShape(r.patients),
          doctorId:      r.doctor_id,
          doctorName:    r.users?.full_name ?? '',
          department:    r.users?.departments?.dept_name ?? null,
          scheduledAt,
          queueStatus,
          waitingSince:  r.patient_states[0]?.entered_at ?? r.created_at,
        });
      }
    }

    // ── B) Appointment rows — today's booked/arrived (not yet paid)
    //       AND every future-date appointment. Past dates show all
    //       statuses so the front desk can audit the day.
    let apptQuery = supabase
      .from('appointments')
      .select(`
        id, appointment_no, scheduled_at, status, reason,
        patients!inner ( id, uhid, first_name, last_name, gender, date_of_birth, mobile, blood_group ),
        users:users!appointments_doctor_id_fkey!inner ( id, full_name, departments!fk_users_department ( dept_name ) )
      `)
      .gte('scheduled_at', `${requestedDate}T00:00:00`)
      .lte('scheduled_at', `${requestedDate}T23:59:59`)
      .is('deleted_at', null)
      .order('scheduled_at', { ascending: true })
      .limit(200);
    if (params.doctorId && params.doctorId !== 'all') {
      apptQuery = apptQuery.eq('doctor_id', params.doctorId);
    }
    if (isToday) {
      // Today: only show appointments that haven't been paid yet
      // (booked or arrived). Completed appointments already have an
      // op_visit row above, which is the authoritative live state.
      apptQuery = apptQuery.in('status', ['booked', 'arrived']);
    }
    const { data: apptData, error: apptErr } = await apptQuery;
    if (apptErr) throw new Error(apptErr.message);

    // De-dup: skip appointments that already have a live op_visit row
    // (today only — for future / past, no op_visit dedupe is needed).
    const opVisitAppointmentIds = new Set(
      rows.map((r) => r.appointmentId).filter((id): id is string => Boolean(id)),
    );

    for (const a of (apptData ?? []) as unknown as SbLiveAppointmentRow[]) {
      if (opVisitAppointmentIds.has(a.id)) continue;
      const queueStatus: LiveQueueStatus =
        a.status === 'arrived' ? 'pending_payment' : 'booked';
      rows.push({
        appointmentId: a.id,
        appointmentNo: a.appointment_no,
        opNumber:      null,
        tokenNumber:   null,
        patient:       mapPatientShape(a.patients),
        doctorId:      a.users?.id ?? '',
        doctorName:    a.users?.full_name ?? '',
        department:    a.users?.departments?.dept_name ?? null,
        scheduledAt:   a.scheduled_at,
        queueStatus,
        waitingSince:  a.scheduled_at,
      });
    }

    // Filters / search
    let filtered = rows;
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
          (r.appointmentNo ?? '').toLowerCase().includes(q) ||
          r.patient.mobile.toLowerCase().includes(q),
      );
    }

    // Sort by status priority so page 1 always surfaces the most urgent
    // patients first: awaiting_doctor → awaiting_vitals → pending_payment
    // → booked. Secondary key is waitingSince (FIFO) within each group.
    const STATUS_ORDER: Record<string, number> = {
      awaiting_doctor: 1,
      awaiting_vitals: 2,
      pending_payment: 3,
      booked:          4,
    };
    filtered.sort((a, b) => {
      const pa = STATUS_ORDER[a.queueStatus] ?? 5;
      const pb = STATUS_ORDER[b.queueStatus] ?? 5;
      if (pa !== pb) return pa - pb;
      return new Date(a.waitingSince).getTime() - new Date(b.waitingSince).getTime();
    });

    const page  = params.page  ?? 1;
    const limit = params.limit ?? 20;
    const start = (page - 1) * limit;
    void isPast; // reserved for future "show completed too" pass
    return {
      rows: filtered.slice(start, start + limit),
      total: filtered.length,
      page,
      limit,
    };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[fetchLiveQueue] DB fetch failed; falling back to mock:', e);
    if (requestedDate > today) return buildFutureAppointmentsMock(params);
    return buildLiveQueueMock(params);
  }
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

interface SbReportPendingRow {
  id: string; op_number: string; chief_complaint: string | null;
  created_at: string; doctor_id: string;
  patients: { id: string; uhid: string; first_name: string; last_name: string;
    gender: string; date_of_birth: string | null; mobile: string | null;
    blood_group: string | null } | null;
  consultations: Array<{ diagnoses: Array<{ icd10?: string; desc?: string; type?: string }> | null }>;
  lab_orders: Array<{
    id: string; status: string; completed_at: string | null;
    lab_order_items: Array<{
      lab_tests: { test_code: string; test_name: string } | null;
    }>;
  }>;
  radiology_orders: Array<{
    id: string; status: string; released_at: string | null; imaging_completed_at: string | null;
    radiology_procedures: { procedure_code: string; procedure_name: string } | null;
  }>;
}

/**
 * Wire-mapped: surface op_visits that have at least one released lab
 * or radiology report waiting for the doctor to review. Groups all
 * released reports per encounter so the "Reports to check" tab shows
 * one row per patient with a stacked list of ready items.
 */
export const fetchReportPendingQueue = async (
  params: { page?: number; limit?: number; sort?: string; q?: string; doctorId?: string } = {},
): Promise<ReportPendingEntry[]> => {
  void params.page;
  void params.limit;
  void params.sort;

  try {
    let query = supabase
      .from('op_visits')
      .select(`
        id, op_number, chief_complaint, created_at, doctor_id,
        patients!op_visits_patient_id_fkey ( id, uhid, first_name, last_name, gender, date_of_birth, mobile, blood_group ),
        consultations ( diagnoses ),
        lab_orders ( id, status, completed_at, lab_order_items ( lab_tests ( test_code, test_name ) ) ),
        radiology_orders ( id, status, released_at, imaging_completed_at, radiology_procedures ( procedure_code, procedure_name ) )
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200);
    if (params.doctorId && params.doctorId !== 'all') {
      query = query.eq('doctor_id', params.doctorId);
    }
    const { data, error } = await query;
    if (error || !data) {
      return mockReportPendingQueue.filter((e) => e.readyCount > 0);
    }

    const rows: ReportPendingEntry[] = [];
    for (const r of data as unknown as SbReportPendingRow[]) {
      const labReady = r.lab_orders.filter((o) => o.status === 'released' || o.status === 'reported');
      const radReady = r.radiology_orders.filter((o) => o.status === 'released' || o.status === 'reported');
      if (labReady.length === 0 && radReady.length === 0) continue;

      const cons = r.consultations[0];
      const primary = cons?.diagnoses?.find((d) => d.type === 'primary') ?? cons?.diagnoses?.[0];
      const p = r.patients;

      const reports = [
        ...labReady.map((o) => {
          const t = o.lab_order_items[0]?.lab_tests;
          return {
            kind: 'lab' as const,
            testCode: t?.test_code ?? 'LAB',
            testName: t?.test_name ?? 'Lab test',
            status: 'reported' as const,
            reportedAt: o.completed_at ?? undefined,
          };
        }),
        ...radReady.map((o) => ({
          kind: 'radiology' as const,
          testCode: o.radiology_procedures?.procedure_code ?? 'RAD',
          testName: o.radiology_procedures?.procedure_name ?? 'Radiology',
          status: 'reported' as const,
          reportedAt: o.released_at ?? o.imaging_completed_at ?? undefined,
        })),
      ];

      rows.push({
        opNumber:           r.op_number,
        consultedAt:        r.created_at,
        patient: p ? {
          id: p.id, uhid: p.uhid,
          firstName: p.first_name, lastName: p.last_name,
          fullName: `${p.first_name} ${p.last_name}`.trim(),
          gender: (p.gender as 'm' | 'f' | 'o'),
          ageYears: ageFromDobIso(p.date_of_birth),
          mobile: p.mobile ?? undefined,
          bloodGroup: p.blood_group ?? undefined,
          allergies: [], chronicConditions: [],
        } : { id: '', uhid: '', firstName: '', lastName: '', fullName: '—',
              gender: 'o' as const, ageYears: 0, allergies: [], chronicConditions: [] },
        primaryDiagnosis:   primary?.desc,
        readyCount:         labReady.length + radReady.length,
        pendingCount:       0,
        reports,
      });
    }

    let filtered = rows;
    if (params.q) {
      const q = params.q.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.patient.fullName.toLowerCase().includes(q) ||
          r.patient.uhid.toLowerCase().includes(q) ||
          r.opNumber.toLowerCase().includes(q) ||
          (r.primaryDiagnosis ?? '').toLowerCase().includes(q),
      );
    }
    return filtered;
  } catch {
    return mockReportPendingQueue.filter((e) => e.readyCount > 0);
  }
};
