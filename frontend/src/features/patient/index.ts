/**
 * Public surface of the patient feature.
 * Maps to schema v2 module 07-patient.
 */
export { PatientSummaryCard } from './components/PatientSummaryCard';
export { LinkedPatientsButton } from './components/LinkedPatientsButton';
export { QuickRegisterForm } from './components/QuickRegisterForm';
export { PatientProfilePage } from './PatientProfilePage';
export { PatientEditPage } from './PatientEditPage';
export { useRecentPatientsStore, type RecentPatient } from './recentsStore';
export {
  findLinkedPatients,
  fetchPatient,
  searchPatientsByMobile,
  createPatient,
  updatePatient,
} from './patientApi';
export type {
  PatientSummary,
  PatientAllergy,
  PatientAddress,
  CreatePatientInput,
  UpdatePatientInput,
  Gender,
  Iso8601,
  Uuid,
  LinkedPatient,
  KinRelationship,
} from './patientTypes';
