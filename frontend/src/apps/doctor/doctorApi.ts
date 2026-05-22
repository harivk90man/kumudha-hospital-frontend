import { fetchPharmacyAlerts, type PharmacyAlert } from '@/features/inventory';
import { mockQueue } from '@/features/encounter/__mocks__/encounterMocks';
import { supabase } from '@/lib/supabase/supabaseClient';
import { todayLocalIso } from '@/utils/dateRange';
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
 * Compute live counters from Supabase. Today-bounded windows; the
 * doctor home page shows what's happening right now, not historical
 * totals. Falls back to mock if any query fails so the demo never
 * goes blank.
 */
const fetchLiveCounters = async (): Promise<DashboardCounters | null> => {
  try {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayIso = todayLocalIso();

    const [
      apptsRes, openVisitsRes, closedTodayRes,
      pendingLabRes, pendingRadRes, followupsRes,
    ] = await Promise.all([
      supabase.from('appointments').select('id', { count: 'exact', head: true })
        .gte('scheduled_at', todayStart.toISOString())
        .is('deleted_at', null),
      supabase.from('op_visits').select('id, patient_states!inner(station_id, stations(station_type), left_at)', { count: 'exact', head: false })
        .eq('visit_date', todayIso)
        .is('closed_at', null)
        .is('deleted_at', null)
        .is('patient_states.left_at', null),
      supabase.from('op_visits').select('id', { count: 'exact', head: true })
        .eq('visit_date', todayIso)
        .not('closed_at', 'is', null)
        .is('deleted_at', null),
      supabase.from('lab_orders').select('id', { count: 'exact', head: true })
        .in('status', ['reported', 'released']).is('deleted_at', null),
      supabase.from('radiology_orders').select('id', { count: 'exact', head: true })
        .in('status', ['reported', 'released']).is('deleted_at', null),
      supabase.from('consultations').select('id', { count: 'exact', head: true })
        .eq('follow_up_required', true)
        .eq('follow_up_date', todayIso)
        .is('deleted_at', null),
    ]);

    // Bucket open visits by station to distinguish waiting vs in_consultation.
    let waiting = 0;
    let inConsultation = 0;
    const openRows = openVisitsRes.data as unknown as Array<{
      patient_states: Array<{ stations: { station_type: string } | null }>;
    }> | null;
    if (openRows) {
      for (const r of openRows) {
        const st = r.patient_states[0]?.stations?.station_type;
        if (st === 'doctor') inConsultation += 1;
        else if (st === 'vitals' || st === 'billing' || st === 'front_desk') waiting += 1;
      }
    }

    return {
      todayAppointments:    apptsRes.count ?? 0,
      waiting,
      inConsultation,
      completedToday:       closedTodayRes.count ?? 0,
      pendingReports:       (pendingLabRes.count ?? 0) + (pendingRadRes.count ?? 0),
      followUpsToday:       followupsRes.count ?? 0,
      admissionsAdvised:    0,  // ward module not yet seeded
    };
  } catch {
    return null;
  }
};

/**
 * Active in-flight op_number for the current doctor from Supabase.
 * Identified by the patient_states active row whose station is 'doctor'.
 */
const fetchActiveOpNumber = async (): Promise<string | null> => {
  try {
    const { data } = await supabase
      .from('op_visits')
      .select(`
        op_number,
        patient_states!inner(left_at, stations!inner(station_type))
      `)
      .is('closed_at', null)
      .is('deleted_at', null)
      .is('patient_states.left_at', null)
      .eq('patient_states.stations.station_type', 'doctor')
      .order('created_at', { ascending: true })
      .limit(1);
    const rows = (data ?? []) as unknown as Array<{ op_number: string }>;
    return rows[0]?.op_number ?? null;
  } catch {
    return null;
  }
};

/**
 * Today's follow-up reminders for the doctor. Reads from consultations
 * joined with patients; only rows with follow_up_required = true and
 * follow_up_date <= today (overdue + due-today) surface here.
 */
const fetchLiveFollowUps = async (): Promise<FollowUpReminder[] | null> => {
  try {
    const todayIso = todayLocalIso();
    const { data, error } = await supabase
      .from('consultations')
      .select(`
        follow_up_date, advice, chief_complaint,
        patients ( uhid, first_name, last_name )
      `)
      .eq('follow_up_required', true)
      .lte('follow_up_date', todayIso)
      .is('deleted_at', null)
      .order('follow_up_date', { ascending: true })
      .limit(20);
    if (error || !data) return null;
    interface Row {
      follow_up_date: string | null; advice: string | null; chief_complaint: string | null;
      patients: { uhid: string; first_name: string; last_name: string } | null;
    }
    return (data as unknown as Row[])
      .filter((r) => r.patients && r.follow_up_date)
      .map((r): FollowUpReminder => ({
        patientName: `${r.patients!.first_name} ${r.patients!.last_name}`.trim(),
        uhid:        r.patients!.uhid,
        dueOn:       r.follow_up_date as string,
        reason:      r.advice ?? r.chief_complaint ?? 'Follow-up review',
      }));
  } catch {
    return null;
  }
};

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
  const [pharmacyAlerts, liveCounters, liveActiveOp, liveFollowUps] = await Promise.all([
    fetchPharmacyAlerts(),
    fetchLiveCounters(),
    fetchActiveOpNumber(),
    fetchLiveFollowUps(),
  ]);
  const fallbackActiveOp =
    mockQueue.find((q) => q.status.name === 'in_consultation')?.opNumber ?? null;
  return delay({
    counters: liveCounters ?? mockCounters,
    pharmacyAlerts,
    // admissionsAdvised / recentActivity stay on mocks — no ward module
    // yet and no central activity feed table.
    followUps: liveFollowUps ?? mockFollowUps,
    admissionsAdvised: mockAdmissionAdvised,
    recentActivity: mockActivity,
    activeOpNumber: liveActiveOp ?? fallbackActiveOp,
  });
};
