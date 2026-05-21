/**
 * Public surface of the lab feature.
 * Maps to schema v2 module 12-lab.
 */
export {
  fetchLabCatalog,
  fetchLabPanels,
  fetchLabComponents,
  fetchPanelComponents,
  placeLabOrder,
  acknowledgeNotification,
  fetchLabOrder,
  fetchLabOrderQueue,
  fetchLabOrderQueuePaged,
  transitionLabOrder,
  recordLabResult,
  releaseLabOrder,
} from './labApi';
export { ResultFlagChip } from './components/ResultFlagChip';
export { LabResultReadOnlyView } from './components/LabResultReadOnlyView';
export { LabResultEntryPanel } from './components/LabResultEntryPanel';
export { needsAck } from './labTypes';
export type {
  LabOrder,
  LabOrderQueueEntry,
  LabOrdersListParams,
  LabTestCatalogItem,
  LabTestPanel,
  LabResultNotification,
  LabResultType,
  LabComponentResult,
  RecordLabResultInput,
  OrderStatus,
  LabResultFlag,
  ClinicalPriority,
} from './labTypes';
