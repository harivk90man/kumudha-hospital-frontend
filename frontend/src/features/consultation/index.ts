/**
 * Public surface of the consultation feature.
 * Maps to schema v2 module 11-consultation.
 */
export {
  fetchConsultation,
  updateConsultation,
  fetchVisitHistory,
  fetchPrescriptionTemplates,
  savePrescriptionTemplate,
  fetchDraft,
  saveDraft,
  restoreDraft,
  clearDraft,
  searchIcd10,
  type Icd10Entry,
} from './consultationApi';
export { useConsultationContext } from './hooks/useConsultationContext';

export { VitalsPanel } from './components/VitalsPanel';
export { VitalsEditSheet } from './components/VitalsEditSheet';
export { ConsultationNotesForm } from './components/ConsultationNotesForm';
export { DiagnosisForm } from './components/DiagnosisForm';
export { FollowUpAdvicePanel } from './components/FollowUpAdvicePanel';
export { AdmissionAdvicePanel } from './components/AdmissionAdvicePanel';
export { AmendWithReasonSheet } from './components/AmendWithReasonSheet';
export { VisitHistoryPanel } from './components/VisitHistoryPanel';
export { CriticalResultBanner } from './components/CriticalResultBanner';
export {
  ConsultationActionBar,
  ConsultationActions,
} from './components/ConsultationActionBar';
export { OrdersPanel } from './components/OrdersPanel';
export { PrescriptionBuilder } from './components/PrescriptionBuilder';
export { PrescriptionTemplateSelector } from './components/PrescriptionTemplateSelector';
export { PrescriptionTemplateManager } from './components/PrescriptionTemplateManager';
export {
  ConsultationStepper,
  consultationSteps,
  type ConsultationStepKey,
} from './components/ConsultationStepper';

export { STANDARD_FREQUENCIES } from './consultationTypes';
export type {
  ConsultationContext,
  ConsultationNote,
  Diagnosis,
  DiagnosisType,
  Vitals,
  VisitHistoryItem,
  VisitReportSummary,
  PrescriptionItem,
  PrescriptionTemplate,
  Frequency,
  FollowUpAdvice,
  FollowUpModality,
  AdmissionAdvice,
  AdmissionUrgency,
  WardType,
  NextAction,
  DoctorRecommendation,
  RecommendationType,
  RecommendationPriority,
  RecommendationStatus,
  ConsultationDraft,
  ConsultationContextBase,
  ConsultationAmendment,
} from './consultationTypes';
