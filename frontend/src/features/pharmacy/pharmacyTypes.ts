/**
 * Pharmacy (dispensing) feature types. Maps to TSD-10 §4.4
 * `prescription_items` + `prescription_dispenses` and consumes
 * `inventory.medicines` for stock visibility.
 *
 * Distinct from `features/inventory` which is the back-office stock
 * surface (catalog, suppliers, batches, expiry). This feature owns the
 * front-of-house pharmacist workflow: see Rx queue → check stock per
 * item → dispense → take payment.
 */
import type { Iso8601, PatientSummary, Uuid } from '@/features/patient';
import type { StockSeverity } from '@/features/inventory';

/** Where the Rx is in its pharmacy lifecycle. */
export type RxQueueStatus =
  | 'rx_pending'        // waiting for pharmacist to pick up
  | 'rx_in_progress'    // pharmacist has the Rx open, checking stock
  | 'rx_dispensed'      // all items dispensed (or marked declined)
  | 'rx_partially_dispensed' // patient bought some, declined others
  | 'rx_cancelled';

/** Per-line dispense decision the pharmacist makes (BRD §1 step 23). */
export type LineDecision = 'dispense' | 'decline' | 'out_of_stock';

export interface RxItem {
  /** prescription_items.id */
  id: Uuid;
  medicineId: Uuid;
  medicineName: string;
  strength: string;
  dosage: string;
  frequency: string;
  route: string;
  durationDays: number;
  /** What the doctor wrote. */
  quantityPrescribed: number;
  /** Live snapshot from inventory at queue-load time. Sum of
   *  `shelfQty + storageQty` — total units the pharmacy holds. */
  availableQty: number;
  /**
   * Units currently on the dispensing shelf (immediately reachable
   * from the counter). When `shelfQty < quantityPrescribed` but
   * `availableQty >= quantityPrescribed`, the pharmacist can tell the
   * patient "we'll fetch it from storage — give us a few minutes"
   * rather than declining the line. Defaults to `availableQty` when
   * the inventory backend doesn't split the two yet.
   */
  shelfQty?: number;
  stockSeverity: StockSeverity;
  /** Generic-name hint surfaces if the brand is out of stock — pharmacist
   *  can offer a generic equivalent (BRD §1 step 23 sub-flow). */
  genericName?: string;
  /** Per-unit price snapshot (ex GST). Server snapshots from medicines. */
  unitPrice: number;
  gstPct: number;
  notes?: string;
}

export interface RxQueueEntry {
  id: Uuid;
  prescriptionNumber: string;   // e.g. RX-2026-001045
  opNumber: string;
  patient: PatientSummary;
  doctorName: string;
  status: RxQueueStatus;
  prescribedAt: Iso8601;
  /** Set when pharmacist starts handling. */
  pickedUpAt?: Iso8601;
  /** Set when status flips to dispensed / partially_dispensed. */
  dispensedAt?: Iso8601;
  items: RxItem[];
}

/* ---------- Inputs ---------- */

/**
 * Discount applied to a single dispense line (pre-tax) or to the whole
 * bill (post-tax). `pct` is 0–100; `amt` is the rupee value. The pharmacist
 * picks one mode per discount; the engine clamps overshoots to the
 * applicable base so the total never goes negative.
 */
export type DiscountKind = 'pct' | 'amt';

export interface DiscountInput {
  kind: DiscountKind;
  /** 0–100 when kind === 'pct'; rupees when kind === 'amt'. Negative not allowed. */
  value: number;
  reason?: string;
}

export interface DispenseLineInput {
  rxItemId: Uuid;
  decision: LineDecision;
  /** How much was actually given (≤ availableQty, ≤ quantityPrescribed).
   *  Required when decision === 'dispense'. */
  quantityDispensed?: number;
  /** Per-line concession (loyalty, damaged strip, partial pack). Pre-tax. */
  lineDiscount?: DiscountInput;
  notes?: string;
}

export interface DispenseRxInput {
  rxId: Uuid;
  lines: DispenseLineInput[];
  /** Whole-bill concession (counter discount, scheme override). Post-tax. */
  billDiscount?: DiscountInput;
}

export interface DispenseRxResult {
  rx: RxQueueEntry;
  /** ID of the invoice the dispense created (open if there’s any line
   *  to charge for; null if the patient declined everything). */
  invoiceId?: Uuid;
  /** Total chargeable for the dispensed items. */
  invoiceTotal: number;
}

/* ---------- List params ---------- */

export interface RxQueueListParams {
  page?: number;
  limit?: number;
  sort?: string;
  status?: RxQueueStatus | 'all';
  /**
   * Multi-status filter — drives the worklist `<MetricStrip>` chips. If
   * present and non-empty, wins over `status` on the wire.
   */
  statuses?: RxQueueStatus[];
  q?: string;
}

/* ---------- Pharmacy walk-in (counter sale + refill lookup) ---------- */

/**
 * One line on an OTC counter sale (no prescription). Pharmacist picks
 * medicines from the catalog, sets the quantity, prices come from the
 * FEFO batch. GST defaults to a per-tenant rate when not specified.
 */
export interface OtcSaleLineInput {
  medicineId: Uuid;
  quantity: number;
  /** Per-unit price snapshot the cashier sees on the invoice (ex GST). */
  unitPrice: number;
  gstPct: number;
}

/**
 * Anonymous OTC counter sale. Optional `customerName` / `customerPhone`
 * captured for the receipt without registering a patient (the typical
 * "cough syrup at the counter" flow).
 *
 * `paymentMethod` is captured at the same time as the sale — OTC is
 * always paid up-front at the counter, so the dispense action and the
 * payment record happen as one unit. Defaults to `cash` server-side
 * when omitted.
 */
export type OtcPaymentMethod = 'cash' | 'upi' | 'card' | 'netbanking';

export interface OtcSaleInput {
  lines: OtcSaleLineInput[];
  customerName?: string;
  customerPhone?: string;
  paymentMethod?: OtcPaymentMethod;
  /** External reference number — UPI txn id, card RRN, etc. */
  paymentRef?: string;
  notes?: string;
}

export interface OtcSaleResult {
  saleNumber: string;
  invoiceId: Uuid;
  invoiceTotal: number;
  /** Lines that couldn’t be fulfilled in full because stock fell short. */
  shortfalls?: { medicineId: Uuid; requested: number; fulfilled: number }[];
}
