import type {
  Appointment,
  AppointmentSlot,
  AppointmentSource,
  AppointmentStatus,
  VisitType,
} from '../appointmentsTypes';
import { mockPatientsByUhid } from '@/features/patient/__mocks__/patientMocks';
import { isoDate } from '@/utils/dateRange';

// Local calendar date (matches the user's perception of "today").
const today = isoDate(new Date());

/* ---------- Doctor roster (5) ---------- */

const sharedDoctors = [
  { id: 'usr-doc-001', name: 'Dr. K Naveen Kumar', dept: 'Orthopaedics' },
  { id: 'usr-doc-002', name: 'Dr. Anand Krishnan', dept: 'General Medicine' },
  { id: 'usr-doc-003', name: 'Dr. Meera Suresh',   dept: 'Dental' },
  { id: 'usr-doc-004', name: 'Dr. Lakshmi Bharath',   dept: 'Obstetrics & Gynaecology' },
  { id: 'usr-doc-005', name: 'Dr. Ravi Shankar',   dept: 'Physiotherapy' },
];

/* ---------- Slot grid ---------- */

const slotGridCache: Map<string, AppointmentSlot[]> = new Map();

// Produces a deterministic UUID-format string from slot components so the
// backend's UUID deserializer accepts it. Format: 8-4-4-4-12 hex chars.
const makeSlotUuid = (doctorId: string, slotDate: string, slotTime: string): string => {
  const d = doctorId.replace(/-/g, '').padEnd(20, '0');
  const date = slotDate.replace(/-/g, '');          // e.g. 20260517
  const time = slotTime.replace(':', '').padEnd(4, '0'); // e.g. 0930
  return `${date}-${time}-${d.slice(0, 4)}-${d.slice(4, 8)}-${d.slice(8, 20)}`;
};

const generateSlots = (
  doctorId: string,
  slotDate: string,
): AppointmentSlot[] => {
  const doc = sharedDoctors.find((d) => d.id === doctorId);
  const slots: AppointmentSlot[] = [];
  // 9:00 → 12:30 morning, 16:00 → 18:00 evening, 30-min slots.
  const blocks: { startHour: number; endHour: number }[] = [
    { startHour: 9,  endHour: 12 },
    { startHour: 16, endHour: 18 },
  ];
  let idx = 0;
  for (const { startHour, endHour } of blocks) {
    for (let h = startHour; h < endHour; h += 1) {
      for (const m of [0, 30]) {
        idx += 1;
        const slotTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        // On the user's "today" the first and fourth morning slots come
        // pre-booked so the calendar doesn't look pristine. Future dates
        // start fully open.
        const presetBooked = slotDate === today && (idx === 1 || idx === 4);
        slots.push({
          id: makeSlotUuid(doctorId, slotDate, slotTime),
          doctorId,
          doctorName: doc?.name ?? '',
          department: doc?.dept ?? '',
          slotDate,
          slotTime,
          durationMinutes: 30,
          status: presetBooked ? 'booked' : 'available',
        });
      }
    }
  }
  return slots;
};

export const mockSlotsForDoctor = (
  doctorId: string,
  slotDate: string = today,
): AppointmentSlot[] => {
  const key = `${doctorId}|${slotDate}`;
  let grid = slotGridCache.get(key);
  if (!grid) {
    grid = generateSlots(doctorId, slotDate);
    slotGridCache.set(key, grid);
  }
  return grid;
};

export const findSlotById = (slotId: string): AppointmentSlot | null => {
  for (const grid of slotGridCache.values()) {
    const hit = grid.find((s) => s.id === slotId);
    if (hit) return hit;
  }
  return null;
};

export const markSlotBooked = (slotId: string): AppointmentSlot | null => {
  for (const grid of slotGridCache.values()) {
    const hit = grid.find((s) => s.id === slotId);
    if (hit) {
      hit.status = 'booked';
      return hit;
    }
  }
  return null;
};

/* ---------- Appointment seed (today + 7 future days) ---------- */
//
// Each appointment row references a real patient via UHID and a real
// doctor via the sharedDoctors roster. `bookedAt` is a literal ISO
// date a few days back so the demo state reproduces across reloads.

interface SeedRow {
  uhid: string;
  doctorIdx: number;       // index into sharedDoctors
  slotTime: string;        // 'HH:mm'
  source: AppointmentSource;
  visitType: VisitType;
  status?: AppointmentStatus;
  arrived?: boolean;
}

/**
 * Compose an `Appointment` from a seed row + a calendar date, looking
 * the patient up in the master registry.
 */
const buildAppointment = (
  id: string,
  date: string,
  bookedAtIso: string,
  row: SeedRow,
): Appointment => {
  const doc = sharedDoctors[row.doctorIdx];
  const patient = mockPatientsByUhid[row.uhid];
  if (!patient) throw new Error(`appointmentsMocks: missing patient ${row.uhid}`);
  const status: AppointmentStatus = row.status ?? 'booked';
  return {
    id,
    appointmentNo: `APT-MOCK-${id.slice(-5).toUpperCase()}`,
    patient,
    doctorId: doc.id,
    doctorName: doc.name,
    department: doc.dept,
    slotId: makeSlotUuid(doc.id, date, row.slotTime),
    slotDate: date,
    slotTime: row.slotTime,
    source: row.source,
    status,
    visitType: row.visitType,
    tokenNumber: `T-${id.slice(-3)}`,
    bookedAt: bookedAtIso,
  };
};

/* ---------- Today (2026-05-17) — handful of arrived/booked rows that
   match the front-desk live queue. (The bulk of today's "live" patients
   are in the encounter queue, not here — this list is only the ones the
   receptionist would still see scheduled in the calendar.) ---------- */

const todayRows: SeedRow[] = [
  // Already arrived (paired with encounter queue rows downstream).
  { uhid: 'KH-2026-00045', doctorIdx: 0, slotTime: '09:00', source: 'phone',   visitType: 'follow_up', status: 'arrived', arrived: true },
  { uhid: 'KH-2024-08812', doctorIdx: 1, slotTime: '10:30', source: 'online',  visitType: 'new',       status: 'arrived', arrived: true },
  { uhid: 'KH-2018-00094', doctorIdx: 0, slotTime: '11:30', source: 'walk_in', visitType: 'follow_up', status: 'booked' },
  { uhid: 'KH-2026-00046', doctorIdx: 0, slotTime: '11:00', source: 'phone',   visitType: 'follow_up', status: 'arrived', arrived: true },
  { uhid: 'KH-2026-00047', doctorIdx: 0, slotTime: '11:30', source: 'walk_in', visitType: 'new',       status: 'arrived', arrived: true },
  // Still scheduled, not yet checked in.
  { uhid: 'KH-2026-00050', doctorIdx: 1, slotTime: '12:00', source: 'phone',   visitType: 'new',       status: 'booked' },
  { uhid: 'KH-2025-08801', doctorIdx: 2, slotTime: '16:00', source: 'online',  visitType: 'follow_up', status: 'booked' },
  { uhid: 'KH-2025-08802', doctorIdx: 3, slotTime: '16:30', source: 'phone',   visitType: 'new',       status: 'booked' },
  { uhid: 'KH-2024-04401', doctorIdx: 1, slotTime: '17:00', source: 'phone',   visitType: 'follow_up', status: 'booked' },
  { uhid: 'KH-2024-04420', doctorIdx: 1, slotTime: '17:30', source: 'phone',   visitType: 'follow_up', status: 'booked' },
];

/* ---------- Future days (2026-05-18 … 2026-05-24) — ~30-45/day. ----------
   Per-doctor counts vary day-to-day so charts don't look like a square wave. */

const futureDates = [
  '2026-05-18', // Day 1: Naveen 15, Anand 10, Meera 5, Lakshmi 5, Ravi 5 = 40
  '2026-05-19', // Day 2: Naveen 8,  Anand 12, Meera 6, Lakshmi 8, Ravi 4 = 38
  '2026-05-20', // Day 3: Naveen 12, Anand 9,  Meera 7, Lakshmi 6, Ravi 6 = 40
  '2026-05-21', // Day 4: Naveen 10, Anand 11, Meera 5, Lakshmi 7, Ravi 5 = 38
  '2026-05-22', // Day 5: Naveen 14, Anand 13, Meera 6, Lakshmi 5, Ravi 4 = 42
  '2026-05-23', // Day 6: Naveen 9,  Anand 7,  Meera 4, Lakshmi 6, Ravi 4 = 30
  '2026-05-24', // Day 7: Naveen 11, Anand 10, Meera 5, Lakshmi 8, Ravi 6 = 40
];

const perDoctorCountsByDay: number[][] = [
  [15, 10, 5, 5, 5],
  [ 8, 12, 6, 8, 4],
  [12,  9, 7, 6, 6],
  [10, 11, 5, 7, 5],
  [14, 13, 6, 5, 4],
  [ 9,  7, 4, 6, 4],
  [11, 10, 5, 8, 6],
];

// Slot times — we cycle through them per doctor per day (slot uniqueness
// not strictly enforced in the mock; the front-desk grid generator
// re-issues slot rows on demand from `mockSlotsForDoctor`).
const SLOT_TIMES = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '16:00', '16:30', '17:00', '17:30',
];

// All UHIDs (97). Mod into this list to pick patient owners.
const ALL_UHIDS = Object.keys(mockPatientsByUhid);

const SOURCES: AppointmentSource[] = ['phone', 'online', 'walk_in', 'referral'];
const VISIT_TYPES: VisitType[] = ['new', 'follow_up'];

const futureAppointments: Appointment[] = [];
let appointmentSeq = 1100;
let patientCursor = 0;
for (let dayIdx = 0; dayIdx < futureDates.length; dayIdx += 1) {
  const date = futureDates[dayIdx];
  const counts = perDoctorCountsByDay[dayIdx];
  // Booked window: 1-7 days before the slot date.
  const bookedAtIso = `2026-05-${String(15 + (dayIdx % 3)).padStart(2, '0')}T10:00:00+05:30`;
  for (let docIdx = 0; docIdx < counts.length; docIdx += 1) {
    const n = counts[docIdx];
    for (let i = 0; i < n; i += 1) {
      const uhid = ALL_UHIDS[patientCursor % ALL_UHIDS.length];
      patientCursor += 1;
      const slotTime = SLOT_TIMES[i % SLOT_TIMES.length];
      const source = SOURCES[(docIdx + i) % SOURCES.length];
      const visitType = VISIT_TYPES[(i + dayIdx) % VISIT_TYPES.length];
      appointmentSeq += 1;
      futureAppointments.push(
        buildAppointment(
          `app-${appointmentSeq}`,
          date,
          bookedAtIso,
          { uhid, doctorIdx: docIdx, slotTime, source, visitType, status: 'booked' },
        ),
      );
    }
  }
}

const todayAppointments: Appointment[] = todayRows.map((r, i) =>
  buildAppointment(
    `app-1${String(i + 1).padStart(3, '0')}`,
    today,
    `2026-05-16T${String(8 + (i % 8)).padStart(2, '0')}:30:00+05:30`,
    r,
  ),
);

export const mockAppointments: Appointment[] = [
  ...todayAppointments,
  ...futureAppointments,
];

export { sharedDoctors };
