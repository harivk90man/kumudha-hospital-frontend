/**
 * Appointments + slots types. Aligned with DB schema (appointments, tokens tables)
 * and AppointmentResponse / AppointmentRequest DTOs.
 *
 * source / status enums match the DB CHECK constraints exactly.
 * tokenNumber is optional — only populated after POST …/pay.
 */

import type { Iso8601, PatientSummary, Uuid } from '@/features/patient';

/* ---------- Slots ---------- */

export type SlotStatus = 'available' | 'booked' | 'blocked';

export interface AppointmentSlot {
  id: Uuid;
  doctorId: Uuid;
  doctorName: string;
  department: string;
  /** ISO date — `YYYY-MM-DD`. */
  slotDate: string;
  /** ISO time — `HH:mm` (24-h). */
  slotTime: string;
  durationMinutes: number;
  status: SlotStatus;
}

/* ---------- Appointment record ---------- */

/** Matches DB CHECK: walk_in | phone | online | referral */
export type AppointmentSource = 'walk_in' | 'phone' | 'online' | 'referral';

/** Matches DB CHECK: booked | confirmed | arrived | in_consultation | completed | cancelled | no_show */
export type AppointmentStatus =
  | 'booked'
  | 'confirmed'
  | 'arrived'
  | 'in_consultation'
  | 'completed'
  | 'cancelled'
  | 'no_show';

/** Matches DB CHECK: new | follow_up | emergency | procedure */
export type VisitType = 'new' | 'follow_up' | 'emergency' | 'procedure';

export interface Appointment {
  id: Uuid;
  appointmentNo: string;
  patient: PatientSummary;
  doctorId: Uuid;
  doctorName: string;
  department: string;
  slotId?: string;
  slotDate: string;
  slotTime: string;
  source: AppointmentSource;
  status: AppointmentStatus;
  visitType: VisitType;
  chiefComplaint?: string;
  /** Null until POST …/pay is called — issued at payment time. */
  tokenNumber?: string;
  bookedAt: Iso8601;
  cancelledAt?: Iso8601;
}

/* ---------- Booking + lifecycle inputs ---------- */

export interface BookAppointmentInput {
  patientId: Uuid;
  doctorId: Uuid;
  source: AppointmentSource;
  visitType: VisitType;
  chiefComplaint?: string;
  /** ISO datetime — from the selected slot's slotDate + slotTime. */
  scheduledAt?: string;
  /** Optional — null for walk-in / phone bookings. */
  slotId?: Uuid;
}

export interface SlotsListParams {
  doctorId: Uuid;
  slotDate?: string;
}

export interface AppointmentsListParams {
  page?: number;
  /** Page size — aliased as `limit` to match the existing frontend convention. */
  limit?: number;
  sort?: string;
  slotDate?: string;
  status?: AppointmentStatus | 'all';
  doctorId?: Uuid | 'all';
  q?: string;
}
