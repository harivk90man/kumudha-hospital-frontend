import { httpClient, type BackendPage } from '@/lib/http/httpClient';
import type {
  Appointment,
  AppointmentSlot,
  AppointmentsListParams,
  BookAppointmentInput,
  SlotsListParams,
} from './appointmentsTypes';
import {
  markSlotBooked,
  mockSlotsForDoctor,
} from './__mocks__/appointmentsMocks';
import { type PageResult } from '@/utils/listQuery';

/**
 * Appointments API surface.
 *
 * Real endpoints wired:
 *   POST   /api/appointments               → bookAppointment
 *   GET    /api/appointments               → fetchAppointmentsPaged
 *   PATCH  /api/appointments/{id}/arrive   → checkInAppointment
 *   POST   /api/appointments/{id}/cancel   → cancelAppointment
 *   GET    /api/doctors                    → fetchBookableDoctors
 *
 * Still mocked (backend not yet built):
 *   GET    /api/appointment-slots          → fetchSlots
 *   POST   /api/appointments/{id}/no-show  → markNoShow
 */

export const fetchBookableDoctors = async (): Promise<
  { id: string; name: string; department: string }[]
> => {
  const rows = await httpClient.get<{ id: string; name: string; department: string }[]>('/doctors');
  return rows;
};

export const fetchSlots = async (params: SlotsListParams): Promise<AppointmentSlot[]> => {
  // Slots backend not built yet — stays mocked.
  return new Promise((resolve) =>
    setTimeout(() => resolve(mockSlotsForDoctor(params.doctorId, params.slotDate)), 200),
  );
};

export const bookAppointment = async (input: BookAppointmentInput): Promise<Appointment> => {
  const created = await httpClient.post<Appointment>('/appointments', {
    patientId:      input.patientId,
    doctorId:       input.doctorId,
    source:         input.source,
    visitType:      input.visitType,
    chiefComplaint: input.chiefComplaint ?? null,
    scheduledAt:    input.scheduledAt ?? null,
    slotId:         input.slotId ?? null,
  });

  // Keep the mock slot grid in sync so the UI reflects the booking immediately.
  if (input.slotId) markSlotBooked(input.slotId);

  return created;
};

/** Fetch one page of appointments for a given date. */
export const fetchAppointmentsPaged = async (
  params: AppointmentsListParams = {},
): Promise<PageResult<Appointment>> => {
  const limit = params.limit ?? 20;
  const page  = params.page  ?? 1;
  const query: Record<string, string | number> = {
    slotDate: params.slotDate ?? new Date().toISOString().slice(0, 10),
    page,
    size: limit,
  };
  if (params.sort)     query.sort     = params.sort;
  if (params.doctorId && params.doctorId !== 'all') query.doctorId = params.doctorId;
  if (params.status   && params.status   !== 'all') query.status   = params.status;
  if (params.q)        query.q        = params.q;

  const paged = await httpClient.get<BackendPage<Appointment>>('/appointments', { params: query });
  return { rows: paged.content, total: paged.totalElements, page, limit };
};

/** Mark a pre-booked appointment as arrived at reception. */
export const checkInAppointment = async (id: string): Promise<Appointment> =>
  httpClient.patch<Appointment>(`/appointments/${id}/arrive`);

/**
 * Pay an appointment — creates the op_visit, issues token, adds patient to
 * the vitals queue. chiefComplaint is optional; backend carries forward the
 * appointment's existing reason when null.
 */
export interface PayAppointmentResult {
  opNumber: string;
  tokenNumber: string;
}

export const payAppointment = async (
  id: string,
  chiefComplaint?: string,
): Promise<PayAppointmentResult> =>
  httpClient.post<PayAppointmentResult>(`/appointments/${id}/pay`, {
    chiefComplaint: chiefComplaint ?? null,
  });

/** Cancel a booked appointment. */
export const cancelAppointment = async (
  id: string,
  reason?: string,
): Promise<Appointment> =>
  httpClient.post<Appointment>(`/appointments/${id}/cancel`, { reason: reason ?? null });

/** Mark no-show — backend endpoint not built yet; remains a mock until it is. */
export const markNoShow = async (id: string): Promise<Appointment> => {
  // Optimistic client-side update; real endpoint: POST /api/appointments/{id}/no-show
  return httpClient.post<Appointment>(`/appointments/${id}/no-show`).catch(() => {
    throw new Error('No-show endpoint not yet implemented on the server.');
  });
};

/** Late arrival — backend endpoint not built yet. */
export const markLateArrival = async (_id: string): Promise<Appointment> => {
  throw new Error('Late-arrival endpoint not yet implemented on the server.');
};
