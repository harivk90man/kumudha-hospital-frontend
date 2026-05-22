/**
 * Public surface of the encounter feature.
 * Maps to schema v2 module 10-encounter.
 */
export {
  fetchQueue,
  fetchQueuePaged,
  fetchQueueByDoctor,
  fetchLiveQueue,
  LIVE_QUEUE_SORT_WHITELIST,
  liveToQueueEntry,
  fetchReportPendingQueue,
  fetchJourneyEvents,
  searchCasesByDiagnosis,
  startConsultation,
  completeConsultation,
  createOpVisit,
  recordVitals,
  transitionEncounterState,
} from './encounterApi';
export { QueueStatusBadge } from './components/QueueStatusBadge';
export { PatientContextHeader } from './components/PatientContextHeader';
export { isAwaitingReports } from './encounterTypes';
export type {
  JourneyEvent,
  StationType,
  DoctorQueueGroup,
  QueueEntry,
  QueueListParams,
  LiveQueueEntry,
  LiveQueueStatus,
  ReportPendingEntry,
  ReportPendingItem,
  ReportKind,
  CaseSummary,
  EncounterStatus,
  EncounterStatusName,
  EmergencyTriage,
  OpVisitCreateInput,
  OpVisitCreated,
  VitalsCaptureInput,
  VitalsRecord,
} from './encounterTypes';
// Mock-only join used by analytics (owner/cashier reports). Real
// backend joins op_visits → users → doctor_profiles server-side.
export { mockOpVisitDoctor, type OpVisitDoctor } from './__mocks__/encounterMocks';
