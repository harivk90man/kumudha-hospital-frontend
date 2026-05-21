import { fetchPharmacyAlerts, type PharmacyAlert } from '@/features/inventory';
import { mockQueue } from '@/features/encounter/__mocks__/encounterMocks';
import type {
  ActivityEvent,
  AdmissionAdvisedPatient,
  DashboardCounters,
  FollowUpReminder,
} from './doctorTypes';
import {
  mockActivity,
  mockAdmissionAdvised,
  mockCounters,
  mockFollowUps,
} from './__mocks__/doctorMocks';

const delay = <T>(value: T, ms = 250): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

/**
 * Doctor-app composite endpoint — returns everything the dashboard renders.
 * Keep this in the role shell, not in any single feature, because it’s the
 * doctor’s home-screen aggregation.
 *
 * Wire point:
 *  GET /api/doctor/dashboard            → fetchDashboard
 */
export interface DashboardPayload {
  counters: DashboardCounters;
  pharmacyAlerts: PharmacyAlert[];
  followUps: FollowUpReminder[];
  admissionsAdvised: AdmissionAdvisedPatient[];
  recentActivity: ActivityEvent[];
  /**
   * `op_number` of the doctor’s currently-active consultation (state
   * `in_consultation`), or `null` if they have none in flight. Drives
   * "Resume / Continue" quick-action targets. Real backend computes from
   * `op_visits` joined on auth context (doctor_id); mock walks the
   * encounter queue.
   */
  activeOpNumber: string | null;
}

export const fetchDashboard = async (): Promise<DashboardPayload> => {
  const pharmacyAlerts = await fetchPharmacyAlerts();
  const activeOpNumber =
    mockQueue.find((q) => q.status.name === 'in_consultation')?.opNumber ?? null;
  return delay({
    counters: mockCounters,
    pharmacyAlerts,
    followUps: mockFollowUps,
    admissionsAdvised: mockAdmissionAdvised,
    recentActivity: mockActivity,
    activeOpNumber,
  });
};
