/**
 * Doctor-app-shell types — KPIs and feed items shown on the doctor’s dashboard.
 * These are aggregates over many domain features (consultation, encounter,
 * inventory, follow-up, admission). They don’t belong to any single feature
 * module so they live with the role shell that consumes them.
 *
 * Wire enum values are lowercase_snake.
 */
import type { Iso8601 } from '@/features/patient';
import type { AdmissionAdvice } from '@/features/consultation';

export interface DashboardCounters {
  todayAppointments: number;
  waiting: number;
  inConsultation: number;
  completedToday: number;
  pendingReports: number;
  followUpsToday: number;
  admissionsAdvised: number;
}

export interface FollowUpReminder {
  patientName: string;
  uhid: string;
  dueOn: Iso8601;
  reason: string;
}

export interface AdmissionAdvisedPatient {
  patientName: string;
  uhid: string;
  advisedAt: Iso8601;
  reason: string;
  wardType: AdmissionAdvice['wardType'];
}

export type ActivityKind =
  | 'consultation_completed'
  | 'prescription_issued'
  | 'lab_ordered'
  | 'report_received';

export interface ActivityEvent {
  id: string;
  at: Iso8601;
  kind: ActivityKind;
  message: string;
}
