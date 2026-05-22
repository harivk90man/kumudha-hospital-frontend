import { supabase, DEMO_USER_ID } from '@/lib/supabase/supabaseClient';
import type {
  Appointment,
  AppointmentSlot,
  AppointmentSource,
  AppointmentStatus,
  AppointmentsListParams,
  BookAppointmentInput,
  SlotsListParams,
  VisitType,
} from './appointmentsTypes';
import type { Gender, PatientAddress, PatientSummary } from '@/features/patient';
import { mockSlotsForDoctor, markSlotBooked } from './__mocks__/appointmentsMocks';
import type { PageResult } from '@/utils/listQuery';

/**
 * Appointments API — DEMO-mode against Supabase.
 *
 * Tables touched:
 *   - appointments         (booking + lifecycle)
 *   - users + departments  (bookable-doctor lookup)
 *   - patients             (joined into appointment list rows)
 *   - op_visits + tokens   (pay flow — creates the consultation visit)
 *
 * Still mocked (out of demo scope):
 *   - fetchSlots         — no appointment_slots seed data yet
 *   - markNoShow / markLateArrival
 */

/* ---------- Row mapping helpers ---------- */

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

const mapRowToPatientSummary = (r: Record<string, unknown>): PatientSummary => {
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

/* ---------- Joined appointment row → camelCase ---------- */

interface AppointmentRowJoined {
  id: string;
  appointment_no: string;
  patient_id: string;
  doctor_id: string;
  slot_id: string | null;
  scheduled_at: string;
  visit_type: string;
  status: string;
  source: string;
  reason: string | null;
  cancelled_at: string | null;
  created_at: string;
  patient: Record<string, unknown> | null;
  doctor: {
    id: string;
    full_name: string;
    department_id: string | null;
    departments: { dept_name: string } | null;
  } | null;
}

const splitScheduledAt = (iso: string): { slotDate: string; slotTime: string } => {
  // scheduled_at is timestamptz — slot date+time are derived from it for
  // display. We use the wall-clock parts of the JS Date so they line up
  // with the user's local view.
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return { slotDate: `${yyyy}-${mm}-${dd}`, slotTime: `${hh}:${mi}` };
};

const mapRowToAppointment = (row: AppointmentRowJoined): Appointment => {
  const { slotDate, slotTime } = splitScheduledAt(row.scheduled_at);
  const patient = row.patient
    ? mapRowToPatientSummary(row.patient)
    // Defensive shell — should not happen because the join is inner.
    : ({
        id: row.patient_id,
        uhid: '',
        firstName: '',
        lastName: '',
        fullName: '',
        gender: 'o' as Gender,
        ageYears: 0,
      } satisfies PatientSummary);
  return {
    id:             row.id,
    appointmentNo:  row.appointment_no,
    patient,
    doctorId:       row.doctor_id,
    doctorName:     row.doctor?.full_name ?? '',
    department:     row.doctor?.departments?.dept_name ?? '',
    slotId:         row.slot_id ?? undefined,
    slotDate,
    slotTime,
    source:         row.source as AppointmentSource,
    status:         row.status as AppointmentStatus,
    visitType:      row.visit_type as VisitType,
    chiefComplaint: row.reason ?? undefined,
    bookedAt:       row.created_at,
    cancelledAt:    row.cancelled_at ?? undefined,
  };
};

/* ---------- Bookable doctors ---------- */

interface DoctorRow {
  id: string;
  full_name: string;
  departments: { dept_name: string } | null;
}

/**
 * Returns the staff list filtered to active users holding the `doctor`
 * role. Department label is the dept_name (or empty if unassigned).
 *
 * Done as three sequential queries because PostgREST can't auto-disambiguate
 * the embed between `users` and `user_roles` (the FK from user_roles.user_id
 * back to users collides with the audit FKs created_by/updated_by/deleted_by).
 */
export const fetchBookableDoctors = async (): Promise<
  { id: string; name: string; department: string }[]
> => {
  const { data: roleRow, error: roleErr } = await supabase
    .from('roles')
    .select('id')
    .eq('role_code', 'doctor')
    .is('deleted_at', null)
    .maybeSingle();
  if (roleErr) throw new Error(roleErr.message);
  if (!roleRow) return [];

  const { data: links, error: linkErr } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role_id', roleRow.id)
    .is('deleted_at', null);
  if (linkErr) throw new Error(linkErr.message);

  const userIds = (links ?? []).map((l) => l.user_id);
  if (userIds.length === 0) return [];

  // `users` has FOUR FK paths to `departments` (department_id +
  // three audit FKs created_by/updated_by/deleted_by). Without the
  // explicit FK hint PostgREST returns PGRST201 and the dropdown
  // silently stays empty.
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, departments!fk_users_department ( dept_name )')
    .in('id', userIds)
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('full_name', { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as DoctorRow[];
  return rows.map((r) => ({
    id: r.id,
    name: r.full_name,
    department: r.departments?.dept_name ?? '',
  }));
};

/* ---------- Slots — still mocked (no seed data) ---------- */

export const fetchSlots = async (params: SlotsListParams): Promise<AppointmentSlot[]> => {
  return new Promise((resolve) =>
    setTimeout(() => resolve(mockSlotsForDoctor(params.doctorId, params.slotDate)), 200),
  );
};

/* ---------- Book + lifecycle ---------- */

// `appointments` has 5 FKs to `users` (doctor + created/updated/deleted/cancelled)
// and `users` has 4 FKs to `departments` (department_id + audit triple).
// Both embeds must be pinned to their real path or PostgREST returns PGRST201.
const APPOINTMENT_SELECT =
  '*, patient:patients!inner(*), doctor:users!appointments_doctor_id_fkey!inner(id, full_name, department_id, departments!fk_users_department(dept_name))';

/**
 * Build appointment_no in the form `APT-YYYY-NNNNN` using the appointment
 * id suffix. We do a simple "count today + 1" rather than a sequence
 * table — close-enough for the demo, real backend uses an atomic seq.
 */
async function nextAppointmentNo(): Promise<string> {
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1).toISOString();
  const { count, error } = await supabase
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', yearStart);
  if (error) throw new Error(error.message);
  const next = (count ?? 0) + 1;
  return `APT-${year}-${String(next).padStart(5, '0')}`;
}

export const bookAppointment = async (input: BookAppointmentInput): Promise<Appointment> => {
  const scheduledAt = input.scheduledAt ?? new Date().toISOString();
  const appointmentNo = await nextAppointmentNo();

  const insertRow = {
    appointment_no: appointmentNo,
    patient_id:    input.patientId,
    doctor_id:     input.doctorId,
    slot_id:       input.slotId ?? null,
    scheduled_at:  scheduledAt,
    visit_type:    input.visitType,
    status:        'booked' as AppointmentStatus,
    source:        input.source,
    reason:        input.chiefComplaint ?? null,
    created_by:    DEMO_USER_ID,
    updated_by:    DEMO_USER_ID,
    version:       0,
  };

  const { data, error } = await supabase
    .from('appointments')
    .insert(insertRow)
    .select(APPOINTMENT_SELECT)
    .single();

  if (error) throw new Error(error.message);

  // Keep the mock slot grid in sync so the slot picker reflects it.
  if (input.slotId) markSlotBooked(input.slotId);

  return mapRowToAppointment(data as unknown as AppointmentRowJoined);
};

/**
 * Server-side paginated appointment list. Filters by slotDate (local
 * day), status, doctor, and a free-text search against the patient name
 * or appointment number. Sort is a wire-format string like `-scheduledAt`.
 */
export const fetchAppointmentsPaged = async (
  params: AppointmentsListParams = {},
): Promise<PageResult<Appointment>> => {
  const limit = params.limit ?? 20;
  const page  = params.page  ?? 1;
  const slotDate = params.slotDate ?? new Date().toISOString().slice(0, 10);

  // Treat slotDate as a local-day window — start-of-day to start-of-next.
  const dayStart = new Date(`${slotDate}T00:00:00`).toISOString();
  const dayEnd   = new Date(new Date(`${slotDate}T00:00:00`).getTime() + 24 * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from('appointments')
    .select(APPOINTMENT_SELECT, { count: 'exact' })
    .gte('scheduled_at', dayStart)
    .lt('scheduled_at', dayEnd)
    .is('deleted_at', null);

  if (params.status && params.status !== 'all') query = query.eq('status', params.status);
  if (params.doctorId && params.doctorId !== 'all') query = query.eq('doctor_id', params.doctorId);
  if (params.q) {
    // Free-text — appointment_no prefix OR patient name fragment.
    // Supabase doesn't support joined-column filter via or() easily,
    // so we match appointment_no here and let the UI narrow further.
    query = query.ilike('appointment_no', `%${params.q}%`);
  }

  // Sort parsing — `field` ascending, `-field` descending. Whitelist
  // fields that map to real columns; everything else falls back to
  // scheduled_at ascending.
  const sortMap: Record<string, string> = {
    scheduledAt:   'scheduled_at',
    appointmentNo: 'appointment_no',
    status:        'status',
  };
  const rawSort = params.sort;
  if (rawSort) {
    const desc = rawSort.startsWith('-');
    const field = desc ? rawSort.slice(1) : rawSort;
    const column = sortMap[field];
    if (column) query = query.order(column, { ascending: !desc });
    else query = query.order('scheduled_at', { ascending: true });
  } else {
    query = query.order('scheduled_at', { ascending: true });
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const rows = ((data ?? []) as unknown as AppointmentRowJoined[]).map(mapRowToAppointment);
  return { rows, total: count ?? rows.length, page, limit };
};

/**
 * Front-desk check-in: marks the appointment as 'arrived'. NO op_visit
 * and NO patient_states row at this stage — both are created only on
 * successful payment (BRD §1: the op number + token issue against the
 * paid receipt, not against the unpaid arrival). The patient is "in
 * the building" but not yet on any live clinical queue.
 */
export const checkInAppointment = async (id: string): Promise<Appointment> => {
  const { data, error } = await supabase
    .from('appointments')
    .update({ status: 'arrived', updated_by: DEMO_USER_ID })
    .eq('id', id)
    .select(APPOINTMENT_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return mapRowToAppointment(data as unknown as AppointmentRowJoined);
};

/** Cancel a booked appointment. Reason is optional but recommended. */
export const cancelAppointment = async (
  id: string,
  reason?: string,
): Promise<Appointment> => {
  const { data, error } = await supabase
    .from('appointments')
    .update({
      status:        'cancelled',
      cancelled_at:  new Date().toISOString(),
      cancelled_by:  DEMO_USER_ID,
      cancel_reason: reason ?? null,
      updated_by:    DEMO_USER_ID,
    })
    .eq('id', id)
    .select(APPOINTMENT_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return mapRowToAppointment(data as unknown as AppointmentRowJoined);
};

/* ---------- Pay (create op_visit + token, mark completed) ---------- */

export interface PayAppointmentResult {
  opNumber: string;
  tokenNumber: string;
}

/** `OP-YYYY-NNNNN`, padded counter from today's op_visit rows. */
async function nextOpNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1).toISOString();
  const { count, error } = await supabase
    .from('op_visits')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', yearStart);
  if (error) throw new Error(error.message);
  const next = (count ?? 0) + 1;
  return `OP-${year}-${String(next).padStart(5, '0')}`;
}

/**
 * Counts consultation tokens issued today for the given doctor and
 * returns the next sequence + display string (`D-04` style).
 */
async function nextDoctorToken(doctorId: string): Promise<{ sequence: number; number: string }> {
  const today = new Date().toISOString().slice(0, 10);
  const { count, error } = await supabase
    .from('tokens')
    .select('id', { count: 'exact', head: true })
    .eq('service_type', 'consultation')
    .eq('provider_id', doctorId)
    .eq('issue_date', today);
  if (error) throw new Error(error.message);
  const sequence = (count ?? 0) + 1;
  return { sequence, number: `D-${String(sequence).padStart(2, '0')}` };
}

/**
 * Demo pay-flow: creates the op_visit, issues a consultation token, and
 * flips the appointment to completed. Real backend wraps these in a
 * transaction + emits a queue event; here we just do them in order.
 */
export const payAppointment = async (
  id: string,
  chiefComplaint?: string,
): Promise<PayAppointmentResult> => {
  // Pull the appointment so we know patient_id, doctor_id, scheduled_at.
  const { data: apptData, error: apptError } = await supabase
    .from('appointments')
    .select('id, patient_id, doctor_id, scheduled_at, reason')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (apptError) throw new Error(apptError.message);
  if (!apptData) throw new Error('Appointment not found.');

  const opNumber = await nextOpNumber();
  const visitDate = (apptData.scheduled_at as string).slice(0, 10);
  const complaint = chiefComplaint ?? (apptData.reason as string | null) ?? null;

  const { data: opVisit, error: opError } = await supabase
    .from('op_visits')
    .insert({
      op_number:        opNumber,
      patient_id:       apptData.patient_id,
      appointment_id:   apptData.id,
      doctor_id:        apptData.doctor_id,
      visit_date:       visitDate,
      chief_complaint:  complaint,
      created_by:       DEMO_USER_ID,
      updated_by:       DEMO_USER_ID,
      version:          0,
    })
    .select('id, op_number')
    .single();
  if (opError) throw new Error(opError.message);

  const tk = await nextDoctorToken(apptData.doctor_id as string);
  const { error: tokenError } = await supabase
    .from('tokens')
    .insert({
      token_number:   tk.number,
      token_sequence: tk.sequence,
      service_type:   'consultation',
      provider_id:    apptData.doctor_id,
      issue_date:     new Date().toISOString().slice(0, 10),
      op_visit_id:    opVisit.id,
      status:         'active',
      issued_by:      DEMO_USER_ID,
      created_by:     DEMO_USER_ID,
      updated_by:     DEMO_USER_ID,
      version:        0,
    });
  if (tokenError) throw new Error(tokenError.message);

  // Drop the patient onto the nurse's vitals queue. Op_visit + token are
  // already paid for at this point — skip the billing station and start
  // them at vitals so the nurse picks them up immediately. The live
  // queue (`fetchQueue`) joins op_visits to the active patient_states
  // row; without this insert the visit would exist in DB but be invisible.
  const { data: vitalsStation } = await supabase
    .from('stations')
    .select('id')
    .eq('station_type', 'vitals')
    .is('deleted_at', null)
    .maybeSingle();
  const vitalsStationId = (vitalsStation as { id: string } | null)?.id;
  if (vitalsStationId) {
    await supabase.from('patient_states').insert({
      patient_id:  apptData.patient_id,
      op_visit_id: opVisit.id,
      station_id:  vitalsStationId,
      metadata:    {},
      created_by:  DEMO_USER_ID,
    });
  }

  const { error: updError } = await supabase
    .from('appointments')
    .update({ status: 'completed', updated_by: DEMO_USER_ID })
    .eq('id', id);
  if (updError) throw new Error(updError.message);

  return { opNumber: opVisit.op_number as string, tokenNumber: tk.number };
};

/** Mark no-show — flips appointments.status to 'no_show' on Supabase. */
export const markNoShow = async (id: string): Promise<Appointment> => {
  const { data, error } = await supabase
    .from('appointments')
    .update({ status: 'no_show', updated_by: DEMO_USER_ID })
    .eq('id', id)
    .select(APPOINTMENT_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return mapRowToAppointment(data as unknown as AppointmentRowJoined);
};

/* ---------- Out-of-scope endpoints — kept as stubs ---------- */

/** Late arrival — no DB column; UI affordance only for the demo. */
export const markLateArrival = async (_id: string): Promise<Appointment> => {
  throw new Error('Late-arrival endpoint not yet implemented on the server.');
};
