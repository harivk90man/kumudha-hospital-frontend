/**
 * Billing types — invoices, line items, payments. Aligned with
 * TSD-11 `services_catalog`, TSD-12 `invoices` + `invoice_lines`, and
 * TSD-13 `payments`.
 *
 * **FE-ahead today:** the billing migration set is not yet in
 * `backend/db/migrations/`. Wire shapes match the planned schema so the
 * Cashier app and the inline payment widgets in front-desk / lab /
 * pharmacy work end-to-end against mocks today.
 */

import type { Iso8601, PatientSummary, Uuid } from '@/features/patient';

/* ---------- Counter (billing till) ---------- */

/**
 * Physical billing counter / till. A tenant can run 1..N counters; today
 * we seed a single "Front desk" counter and pin the active counter to
 * it (see `currentCounterStore`). The dimension lives on shift records
 * AND payments so multi-counter reporting is just a `group by counterId`
 * away — no schema migration when we wire counter switching later.
 */
export interface Counter {
  id: Uuid;
  code: string;
  name: string;
  isActive: boolean;
}

/* ---------- Service catalogue (TSD-11) ---------- */

/**
 * Service buckets. `radiology` stays separate from `lab` at the line
 * level (the radiology team still needs its own worklist), but the
 * collections analytics roll radiology up into the "Lab" bucket — see
 * `categoryBuckets.ts`.
 *
 * `room` was renamed to `admission` in the 2026-05 refresh — `room`
 * carried an IPD-specific connotation that didn't fit OPD admissions.
 * `registration` was added to surface the one-time new-patient
 * registration fee that previously fell through to `other`.
 */
export type ServiceCategory =
  | 'consultation'
  | 'lab'
  | 'radiology'
  | 'pharmacy'
  | 'procedure'
  | 'admission'
  | 'registration'
  | 'other';

export interface Service {
  id: Uuid;
  code: string;            // human-readable SKU e.g. CONS-OPD, LAB-CBC
  name: string;
  category: ServiceCategory;
  /** Catalogue list price. The line item snapshots this at invoice time. */
  unitPrice: number;
  /** GST percent — e.g., 5, 12, 18, 0. */
  gstPct: number;
  isActive: boolean;
}

/* ---------- Invoice ---------- */

/** TSD-12 `invoices.status`. */
export type InvoiceStatus =
  | 'draft'
  | 'billed'
  | 'paid'
  | 'partially_paid'
  | 'cancelled';

/**
 * Per-line concession applied at billing time. Mirrors the pharmacy
 * RxDispense `LineDecision` discount shape so the same `%`/`₹` widget
 * is reused across both surfaces.
 *  - `kind: 'pct'`  → value is a percent (0–100) of the gross
 *  - `kind: 'amt'`  → value is a rupee amount, capped at the gross
 */
export interface LineDiscount {
  kind: 'pct' | 'amt';
  value: number;
}

export interface InvoiceLine {
  id: Uuid;
  serviceId: Uuid;
  /** Snapshot at invoice time (catalogue prices may change later). */
  serviceCode: string;
  serviceName: string;
  category: ServiceCategory;
  unitPrice: number;
  quantity: number;
  /** Snapshot of service.gst_pct. */
  gstPct: number;
  /**
   * Optional concession applied at billing time (cashier's editable cell).
   * When set, `lineTotal` is `(unitPrice × quantity) - discountAmount`.
   * Backend reconciles the discount amount server-side; this field is
   * what the cashier UI persists.
   */
  lineDiscount?: LineDiscount;
  /** Net per-line amount (pre-tax) — `(unitPrice × quantity) - discount`. */
  lineTotal: number;
  /** Free annotation — e.g., "Dr. Naveen — consult", "Order placed at 10:42". */
  notes?: string;
}

export interface Invoice {
  id: Uuid;
  invoiceNumber: string;   // INV-2026-001234
  patient: PatientSummary;
  /** Nullable for OP-only billing not tied to a single visit (refund, advance). */
  opNumber?: string;
  /** Which counter / station owns this invoice for the day’s collection report. */
  station: 'front_desk' | 'billing' | 'lab' | 'radiology' | 'pharmacy';
  status: InvoiceStatus;
  lines: InvoiceLine[];
  /** Sum of lineTotal — pre-tax. */
  subtotal: number;
  /** Sum of (lineTotal × gstPct/100). */
  tax: number;
  /** subtotal + tax. */
  total: number;
  /** total - sum(payments.amount where status='succeeded'). */
  balance: number;
  createdBy: Uuid;
  createdAt: Iso8601;
  /** Set when status flips to `paid` or `partially_paid`. */
  lastPaidAt?: Iso8601;
}

/* ---------- Payment (TSD-13) ---------- */

export type PaymentMethod = 'cash' | 'upi' | 'card' | 'netbanking' | 'insurance';

export type PaymentStatus = 'succeeded' | 'refunded';

export interface Payment {
  id: Uuid;
  invoiceId: Uuid;
  invoiceNumber: string;
  patient: PatientSummary;
  amount: number;
  method: PaymentMethod;
  /** External reference (UPI txn id, card RRN, insurance pre-auth no.). */
  referenceNo?: string;
  status: PaymentStatus;
  /** When this payment is itself a refund of a prior payment. */
  refundOf?: Uuid;
  receivedBy: Uuid;
  receivedAt: Iso8601;
  notes?: string;
  /**
   * Physical till that took this payment. Stamped server-side from the
   * active counter at record-time. Drives multi-counter shift close +
   * per-counter collection analytics.
   */
  counterId: Uuid;
}

/* ---------- Inputs ---------- */

/**
 * One invoice line in the create-invoice payload. Two modes:
 *   - `serviceId` — preferred path; backend joins services_catalog and
 *     snapshots name/code/price/gst onto the line.
 *   - `adhoc` — walk-in flows where the order originated outside
 *     services_catalog (e.g. lab/rad walk-in tests where the catalog
 *     mapping doesn’t always exist). Caller provides explicit pricing.
 *
 * Exactly one of the two must be set; the mock + real backend will
 * reject lines with both / neither.
 */
export interface CreateInvoiceLineInput {
  serviceId?: Uuid;
  adhoc?: {
    code: string;
    name: string;
    unitPrice: number;
    gstPct: number;
    category: ServiceCategory;
  };
  quantity: number;
  notes?: string;
}

export interface CreateInvoiceInput {
  patientId: Uuid;
  /** Mock-only convenience; real backend joins patients itself. */
  patientSnapshot?: PatientSummary;
  opNumber?: string;
  station: Invoice['station'];
  lines: CreateInvoiceLineInput[];
}

/**
 * One line edit in the update-invoice payload. `id` is required so the
 * server can match the existing line. Any field omitted is left
 * untouched — partial updates are valid (e.g. only changing the
 * discount without retyping the quantity).
 */
export interface UpdateInvoiceLineInput {
  id: Uuid;
  quantity?: number;
  lineDiscount?: LineDiscount | null;
  notes?: string;
}

export interface UpdateInvoiceInput {
  lines: UpdateInvoiceLineInput[];
}

export interface RecordPaymentInput {
  invoiceId: Uuid;
  amount: number;
  method: PaymentMethod;
  referenceNo?: string;
  notes?: string;
  /**
   * Active counter the cashier is logged into. Optional on the wire —
   * the API falls back to the session's current counter when omitted,
   * which is how every UI surface calls it today. Explicit override is
   * reserved for back-office corrections.
   */
  counterId?: Uuid;
}

export interface RefundPaymentInput {
  paymentId: Uuid;
  reason: string;
}

/* ---------- List params (CLAUDE.md §3.4) ---------- */

export interface InvoicesListParams {
  page?: number;
  limit?: number;
  sort?: string;
  status?: InvoiceStatus | 'all';
  /**
   * Multi-status filter — drives the worklist `<MetricStrip>` chips. If
   * present and non-empty, wins over `status` on the wire.
   */
  statuses?: InvoiceStatus[];
  station?: Invoice['station'] | 'all';
  /** ISO date — single-day filter. Defaults to today when set in
   *  isolation; if `dateFrom`/`dateTo` are present, they win. */
  date?: string;
  /** ISO date — inclusive lower bound for a range query. */
  dateFrom?: string;
  /** ISO date — inclusive upper bound for a range query. */
  dateTo?: string;
  q?: string;
}

export interface PaymentsListParams {
  page?: number;
  limit?: number;
  sort?: string;
  /** ISO date — single-day filter. */
  date?: string;
  /** ISO date — inclusive lower bound for a range query. */
  dateFrom?: string;
  /** ISO date — inclusive upper bound for a range query. */
  dateTo?: string;
  method?: PaymentMethod | 'all';
  q?: string;
}
