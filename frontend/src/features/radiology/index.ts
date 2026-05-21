/**
 * Public surface of the radiology feature.
 * Maps to schema v2 module 13-radiology.
 */
export {
  fetchRadiologyCatalog,
  placeRadiologyOrder,
  fetchRadiologyOrder,
  fetchRadiologyOrderQueue,
  fetchRadiologyOrderQueuePaged,
  transitionRadiologyOrder,
  recordRadiologyResult,
  releaseRadiologyOrder,
  updateRadiologyOrderPriority,
} from './radiologyApi';
export type {
  RadiologyOrder,
  RadiologyOrderQueueEntry,
  RadiologyOrdersListParams,
  RadiologyTestCatalogItem,
  RecordRadiologyResultInput,
  Modality,
} from './radiologyTypes';
