/**
 * Lab order + catalog types. Maps to schema v2 module 12-lab and TSD-08.
 *
 * Catalogue alignment: docs/02-catalogues/blood-test-catalogues.md is
 * the source of truth for which tests exist, their components, units,
 * and reference ranges.
 *
 * Wire enum values are lowercase_snake.
 */
import type { Iso8601, PatientSummary, Uuid } from '@/features/patient';

export type ClinicalPriority = 'routine' | 'urgent' | 'stat';

/** TSD-08 §4.6 lab_orders.status — 10-value union. */
export type OrderStatus =
  | 'ordered'
  | 'awaiting_payment'
  | 'paid'
  | 'sample_collection'
  | 'sample_collected'
  | 'in_progress'
  | 'partially_reported'
  | 'reported'
  | 'released'
  | 'cancelled';

/** TSD-08 §4.6 lab_results.flag — numeric-result flag axis. */
export type LabResultFlag =
  | 'normal'
  | 'low'
  | 'high'
  | 'critical_low'
  | 'critical_high';

/**
 * TSD-08 §4.1 lab_tests.result_type — the schema’s 6-value enum +
 * one FE-only addition (`calculated`) for derived fields like
 * Indirect Bilirubin / BUN / Globulin / A-G Ratio that the spec
 * (catalogues §1.2 / §1.3) computes from sibling components.
 *
 *   numeric              → number input + ref range
 *   positive_negative    → segmented Pos / Neg
 *   reactive_nonreactive → segmented Reactive / Non-Reactive (HIV/HCV/HBsAg)
 *   grade                → segmented Negative / + / ++ / +++ / ++++
 *   free_text            → textarea (Urine descriptive fields)
 *   image                → file upload (radiology)
 *   calculated           → read-only derived value (FE-only)
 */
export type LabResultType =
  | 'numeric'
  | 'positive_negative'
  | 'reactive_nonreactive'
  | 'grade'
  | 'free_text'
  | 'image'
  | 'calculated';

/**
 * One lab_tests row. Catalogues §1-§3 lists every test we support
 * in Phase 1; each panel component (e.g. Hb inside CBC) is its own
 * lab_tests row with its own ref ranges + unit.
 */
export interface LabTestCatalogItem {
  id: Uuid;
  /** lab_tests.test_code — short identifier (e.g. 'HB', 'CRP'). */
  code: string;
  name: string;
  /** Long-form name shown in result tables (e.g. 'Haemoglobin'). */
  fullName?: string;
  /** lab_tests.category — hematology / biochemistry / serology / microbiology / endocrinology. */
  category: string;
  /** lab_tests.sample_type — EDTA Blood / Serum / Fluoride Blood / Urine / Capillary. */
  specimen: string;
  /** Total expected turn-around time, hours. */
  tatHours: number;
  /** lab_tests.result_type — drives the entry widget the tech sees. */
  resultType: LabResultType;
  /** lab_tests.unit — display unit. */
  unit?: string;
  /** Gender-split ref ranges. Catalogue marks these "M:" / "F:". */
  refMinMale?: number;
  refMaxMale?: number;
  refMinFemale?: number;
  refMaxFemale?: number;
  criticalLow?: number;
  criticalHigh?: number;
  /** lab_tests.default_price (₹). */
  defaultPrice: number;
  requiresFasting?: boolean;
  sampleVolumeMl?: number;
  /** For result_type='grade' — the ordered options (e.g. ['Negative','+','++','+++','++++']). */
  gradeOptions?: string[];
  /** For result_type='positive_negative' / 'reactive_nonreactive' — the two labels. */
  qualitativeOptions?: [string, string];
  /**
   * For result_type='calculated' — codes of the sibling tests this
   * is derived from. The FE entry form looks them up in the same
   * order’s results, applies the formula, and renders the value
   * read-only.
   */
  calculatedFrom?: string[];
  /**
   * Free-text formula description for the tech / doctor to read
   * (e.g. 'Total Bilirubin − Direct Bilirubin'). Display only.
   */
  formulaHint?: string;
  /**
   * Optional sub-type qualifier the doctor must pick at order time
   * (e.g. Glucose: 'fasting' / 'random' / 'pp'). Mock-side only;
   * real backend may put this on lab_orders.metadata.
   */
  orderSubtypes?: { code: string; label: string }[];
}

/**
 * lab_test_panels row — a bundle of individual `lab_tests` priced as
 * a package. Doctor orders the panel; backend resolves to N
 * lab_order_items, one per `testCodes[]` member.
 *
 * Catalogues §1: CBC, LFT, RFT, Urine Routine are panels.
 */
export interface LabTestPanel {
  id: Uuid;
  panelCode: string;
  panelName: string;
  category: string;
  specimen: string;
  /** Codes (not ids) of the constituent lab_tests rows. */
  testCodes: string[];
  packagePrice: number;
  description?: string;
  requiresFasting?: boolean;
  tatHours?: number;
}

export interface LabOrder {
  id: Uuid;
  orderedAt: Iso8601;
  status: OrderStatus;
  testCode: string;
  testName: string;
  /**
   * If the order was placed via a panel, the panel code is preserved
   * here so the doctor’s report viewer can group component results
   * back under their panel.
   */
  panelCode?: string;
  panelName?: string;
  clinicalPriority?: ClinicalPriority;
  /** Glucose order subtype if `testCode === 'GLU'`. */
  orderSubtype?: string;
  resultSummary?: string;
  resultValue?: string;
  resultUnit?: string;
  flag?: LabResultFlag;
  reportPdfUrl?: string;
  /**
   * Set when a panel order’s results have come back from the lab.
   * Each entry represents one constituent component (Hb, WBC, …)
   * with its own value, unit, and per-component flag.
   */
  componentResults?: LabComponentResult[];
}

/**
 * Notification row from TSD-02 `notifications` table — surfaces critical
 * lab-result alerts that need doctor acknowledgement (30-min SLA per
 * lab-radiology-rules.md). The `lab_results` row stays the source of truth
 * for the medical fact; ack lives on the notification.
 *
 * The composite endpoint joins `notifications` + `lab_results` + `lab_orders`
 * so the FE has everything needed to render the banner without a chase.
 */
export interface LabResultNotification {
  /** notifications.id */
  id: Uuid;
  /** notifications.related_lab_order_id (or equivalent FK). */
  labOrderId: Uuid;
  testCode: string;
  testName: string;
  flag: LabResultFlag;
  resultSummary?: string;
  /** When the critical result was released by the lab. */
  occurredAt: Iso8601;
  /** notifications.ack_required — always true for criticals. */
  ackRequired: boolean;
  /** notifications.acked_at — set after doctor ACK. */
  ackedAt?: Iso8601;
  /** notifications.acked_by — FK users.id. */
  ackedBy?: Uuid;
}

/** True when a notification still needs doctor acknowledgement. */
export const needsAck = (n: LabResultNotification): boolean =>
  n.ackRequired && !n.ackedAt;

/* ---------- Lab-tech actor view (TSD-08 §4.6 + joins) ---------- */

/**
 * The row a lab technician sees in their queue. Joins `lab_orders` ↔
 * `op_visits` ↔ `patients` ↔ `lab_tests` so the tech can act without
 * chasing further fetches.
 *
 * Same physical `lab_orders.id` as the doctor-side `LabOrder`, plus the
 * patient + visit context the tech needs.
 */
export interface LabOrderQueueEntry {
  id: Uuid;
  opNumber: string;
  patient: PatientSummary;
  testCode: string;
  testName: string;
  /** Set when the order was placed via a panel (CBC / LFT / etc.). */
  panelCode?: string;
  panelName?: string;
  specimen: string;
  /** TSD-08 §4.1 lab_tests.requires_fasting — important for the tech. */
  requiresFasting?: boolean;
  sampleVolumeMl?: number;
  clinicalPriority?: ClinicalPriority;
  status: OrderStatus;
  orderedAt: Iso8601;
  /** Set when sample is collected. */
  sampleCollectedAt?: Iso8601;
  /** Set when result is recorded. */
  reportedAt?: Iso8601;
  /** Set when report is released to the doctor. */
  releasedAt?: Iso8601;
  /** Result line — populated once the tech enters the result. */
  resultSummary?: string;
  resultNumeric?: number;
  resultUnit?: string;
  resultText?: string;
  flag?: LabResultFlag;
  notes?: string;
  /**
   * Reactive-confirmation guard for HIV/HCV/HBsAg per
   * blood-test-catalogues.md §3.1: a "Reactive" first read can’t be
   * released until a second confirmatory result is recorded.
   */
  awaitingConfirmation?: boolean;
  confirmationValue?: string;
  /** Set on panel orders — one entry per resolved component test. */
  componentResults?: LabComponentResult[];
}

/**
 * One component’s result inside a panel order. Real backend stores
 * each as its own `lab_results` row keyed by `lab_order_item_id`;
 * the mock keeps them inline on the parent order for simplicity.
 */
export interface LabComponentResult {
  /** matches LabTestCatalogItem.code (HB / WBC / SGOT / …) */
  componentCode: string;
  componentName: string;
  /** Display value — the actual string the tech wrote / picked. */
  value: string;
  /** Parsed numeric, when result_type='numeric'/'calculated'. */
  valueNumeric?: number;
  unit?: string;
  flag?: LabResultFlag;
}

export interface RecordLabResultInput {
  orderId: Uuid;
  resultSummary: string;
  resultNumeric?: number;
  resultText?: string;
  resultUnit?: string;
  flag?: LabResultFlag;
  notes?: string;
  /** Set when the order is a panel — one entry per resolved component. */
  componentResults?: LabComponentResult[];
}

export interface LabOrdersListParams {
  page?: number;
  limit?: number;
  sort?: string;
  status?: OrderStatus | 'all';
  /**
   * Multi-status filter — drives the worklist `<MetricStrip>` chips. If
   * present and non-empty, wins over `status` on the wire.
   */
  statuses?: OrderStatus[];
  priority?: ClinicalPriority | 'all';
  q?: string;
}
