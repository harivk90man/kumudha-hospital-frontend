import type {
  ActivityEvent,
  AdmissionAdvisedPatient,
  DashboardCounters,
  FollowUpReminder,
} from '../doctorTypes';

export const mockCounters: DashboardCounters = {
  todayAppointments: 24,
  waiting: 6,
  inConsultation: 1,
  completedToday: 11,
  pendingReports: 4,
  followUpsToday: 3,
  admissionsAdvised: 2,
};

export const mockFollowUps: FollowUpReminder[] = [
  {
    patientName: 'Anita Kumar',
    uhid: 'KH-2026-00012',
    dueOn: new Date().toISOString(),
    reason: 'Post-op review — Knee arthroscopy',
  },
  {
    patientName: 'Suresh Kumar',
    uhid: 'KH-2026-00031',
    dueOn: new Date().toISOString(),
    reason: 'Physiotherapy progress',
  },
  {
    patientName: 'Lakshmi N.',
    uhid: 'KH-2025-04412',
    dueOn: new Date().toISOString(),
    reason: 'HbA1c review',
  },
];

export const mockAdmissionAdvised: AdmissionAdvisedPatient[] = [
  {
    patientName: 'Ramesh Babu',
    uhid: 'KH-2026-00044',
    advisedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    reason: 'Severe lumbar disc prolapse — for surgery workup',
    wardType: 'private',
  },
  {
    patientName: 'Geetha S.',
    uhid: 'KH-2026-00047',
    advisedAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    reason: 'Septic arthritis — IV antibiotics',
    wardType: 'general',
  },
];

export const mockActivity: ActivityEvent[] = [
  {
    id: 'evt-1',
    at: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
    kind: 'consultation_completed',
    message: 'Completed consultation for Meera P. (OP-2026-00118)',
  },
  {
    id: 'evt-2',
    at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    kind: 'prescription_issued',
    message: 'Issued prescription with 4 items to Karthik R.',
  },
  {
    id: 'evt-3',
    at: new Date(Date.now() - 1000 * 60 * 27).toISOString(),
    kind: 'lab_ordered',
    message: 'Ordered CBC + CRP + ESR for Priya M.',
  },
  {
    id: 'evt-4',
    at: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
    kind: 'report_received',
    message: 'X-Ray knee AP/Lat report received for Anita Kumar',
  },
];
