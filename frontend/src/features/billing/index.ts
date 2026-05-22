/**
 * Public surface of the billing feature.
 * Maps to schema v2 modules `services_catalog` (TSD-11), `invoices` /
 * `invoice_lines` (TSD-12), `payments` (TSD-13), and `counters` /
 * `shift_sessions` (TSD-13.b). FE-ahead today — the migration set lands
 * when backend catches up.
 */
export {
  fetchServices,
  fetchInvoices,
  fetchInvoicesPaged,
  fetchInvoice,
  fetchInvoiceByOpNumber,
  createInvoice,
  updateInvoice,
  recordPayment,
  refundPayment,
  fetchPayments,
  fetchPaymentsPaged,
  fetchCounters,
  resolveLineDiscount,
  recordShiftOpenInDb,
  recordShiftCloseInDb,
  fetchActiveCashSession,
} from './billingApi';
export type { ActiveCashSession } from './billingApi';
export { InvoicePaymentPanel } from './components/InvoicePaymentPanel';
export { PaymentPage } from './PaymentPage';
export {
  useShiftCloseStore,
  resolveActiveShift,
  resolveShift,
  isShiftLocked,
  nextShiftAfter,
  blankCategoryTotals,
  SHIFT_WINDOWS,
  DEFAULT_COUNTER_ID,
  ANALYTICS_CATEGORIES,
} from './shiftCloseStore';
export type {
  ResolvedShift,
  ShiftCloseRecord,
  ShiftLockReason,
  ShiftLockState,
  ShiftMethodTotal,
  ShiftOpenRecord,
  ShiftType,
  AnalyticsCategory,
} from './shiftCloseStore';
export { useCurrentCounterStore } from './currentCounterStore';
export {
  ANALYTICS_CATEGORY_LABEL,
  bucketOf,
  emptyCategoryTotals,
} from './categoryBuckets';
export {
  allocatePaymentToCategories,
  sumCategoryAllocations,
} from './paymentAllocation';
export { ShiftLockedBanner } from './components/ShiftLockedBanner';
export { useShiftLock } from './hooks/useShiftLock';
export type {
  Service,
  ServiceCategory,
  Counter,
  Invoice,
  InvoiceStatus,
  InvoiceLine,
  Payment,
  PaymentMethod,
  PaymentStatus,
  CreateInvoiceInput,
  CreateInvoiceLineInput,
  LineDiscount,
  RecordPaymentInput,
  RefundPaymentInput,
  UpdateInvoiceInput,
  UpdateInvoiceLineInput,
  InvoicesListParams,
  PaymentsListParams,
} from './billingTypes';
