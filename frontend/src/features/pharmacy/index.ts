/**
 * Public surface of the pharmacy (dispensing) feature.
 * Maps to TSD-10 §4.4 prescription_dispenses + cross-feature billing call.
 */
export {
  fetchRxQueue,
  fetchRx,
  pickupRx,
  dispenseRx,
  resolveDiscount,
  fetchPatientPrescriptionHistory,
  getOtcUnitPrice,
  dispenseOtcSale,
} from './pharmacyApi';
export type {
  RxQueueEntry,
  RxItem,
  RxQueueStatus,
  RxQueueListParams,
  DispenseRxInput,
  DispenseLineInput,
  DispenseRxResult,
  DiscountInput,
  DiscountKind,
  LineDecision,
  OtcSaleInput,
  OtcSaleLineInput,
  OtcSaleResult,
  OtcPaymentMethod,
} from './pharmacyTypes';
export { useOtcSalesStore } from './otcSalesStore';
export type { OtcSaleRecord, OtcSaleLineRecord } from './otcSalesStore';
