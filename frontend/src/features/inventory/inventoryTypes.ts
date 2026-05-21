/**
 * Medicine + stock types. Maps to schema v2 module 14-inventory and TSD-10.
 *
 * Wire enum values are lowercase_snake per project convention.
 */
import type { Iso8601, Uuid } from '@/features/patient';

export type StockSeverity =
  | 'ok'
  | 'low'
  | 'out_of_stock'
  | 'near_expiry'
  | 'expired';

export type MedicineForm = 'tab' | 'cap' | 'syrup' | 'inj' | 'oint' | 'drops';

export interface Medicine {
  id: Uuid;
  name: string;
  genericName: string;
  strength: string;
  form: MedicineForm;
  availableQty: number;
  thresholdQty: number;
  earliestExpiry?: Iso8601;
  severity: StockSeverity;
  /** TSD-10 §4.2 — controls dispensing rules + override semantics. */
  requiresPrescription?: boolean;
  isNarcotic?: boolean;
  /**
   * TSD-10 §4.2 medicines.drug_class — matched against
   * `allergies_lookup.drug_class_code` for the prescribing-time allergy
   * alert (TSD-03 §4.6 / TSD-10 §4.2 cross-ref). Examples: `penicillin`,
   * `nsaid`, `beta_blocker`, `sulfa`.
   */
  drugClass?: string;
}

export interface PharmacyAlert {
  medicineId: Uuid;
  medicineName: string;
  strength: string;
  availableQty: number;
  thresholdQty: number;
  expiry?: Iso8601;
  severity: StockSeverity;
}

/** Severities that block prescribing without doctor override. */
export const isStockBlocked = (s: StockSeverity): boolean =>
  s === 'expired' || s === 'out_of_stock';

/* ---------- Back-office (TSD-10 §4.3 batches, suppliers, GRN) ---------- */

/**
 * One physical batch of a medicine. FEFO (first-expiry-first-out) is
 * server-side; this is the read shape the inventory clerk sees.
 */
export interface MedicineBatch {
  id: Uuid;
  medicineId: Uuid;
  medicineName: string;
  strength: string;
  batchNumber: string;
  /** Date of manufacture. */
  mfgDate?: Iso8601;
  expiryDate: Iso8601;
  /** Quantity remaining in this batch. */
  quantityOnHand: number;
  /** What the supplier charged per unit (cost price). */
  unitCost: number;
  /** What the patient pays per unit (snapshotted onto invoice lines). */
  unitPrice: number;
  supplierId: Uuid;
  supplierName: string;
  receivedAt: Iso8601;
  /** TSD-10 §4.3 batch-level status. */
  isActive: boolean;
}

export interface Supplier {
  id: Uuid;
  name: string;
  /** GST registration number — required for B2B GRN. */
  gstin?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  /** Outstanding payable to this supplier (negative = credit). */
  outstandingBalance?: number;
  isActive: boolean;
}

/** Create payload — Supplier minus the server-assigned `id`. */
export type CreateSupplierInput = Omit<Supplier, 'id'>;

/** Patch payload — every field optional, `id` carried separately by the API call. */
export type UpdateSupplierInput = Partial<Omit<Supplier, 'id'>>;

/* ---------- Goods Receive Note (GRN) ---------- */

export interface GrnLineInput {
  medicineId: Uuid;
  batchNumber: string;
  expiryDate: Iso8601;
  mfgDate?: Iso8601;
  quantity: number;
  unitCost: number;
  unitPrice: number;
}

export interface CreateGrnInput {
  supplierId: Uuid;
  /** Supplier’s invoice / DC number on the carton. */
  supplierInvoiceNo: string;
  receivedAt?: Iso8601;
  notes?: string;
  lines: GrnLineInput[];
}

export interface Grn {
  id: Uuid;
  grnNumber: string;          // GRN-2026-000123
  supplierId: Uuid;
  supplierName: string;
  supplierInvoiceNo: string;
  receivedAt: Iso8601;
  receivedBy: Uuid;
  notes?: string;
  lineCount: number;
  totalQuantity: number;
  totalCost: number;
}

/**
 * Edit payload for an existing GRN. Lines are intentionally optional
 * and treated as a no-op in the mock: rewriting per-line batches after
 * a GRN is saved would also have to retire the original batches and
 * stamp new ones (TSD-10 §4.3) which is out of scope for this pass.
 * `updateGrn` only mutates the top-level metadata (supplier, supplier
 * invoice no., received date, notes) — see TSDoc on the API fn.
 */
export interface UpdateGrnInput {
  supplierId?: Uuid;
  supplierInvoiceNo?: string;
  receivedAt?: Iso8601;
  notes?: string;
  lines?: GrnLineInput[];
}

/* ---------- List params ---------- */

export interface MedicinesListParams {
  page?: number;
  limit?: number;
  sort?: string;
  q?: string;
  severity?: StockSeverity | 'all';
  /**
   * Multi-severity filter — drives the worklist `<MetricStrip>` chips. If
   * present and non-empty, wins over `severity` on the wire.
   */
  severities?: StockSeverity[];
}

export interface BatchesListParams {
  page?: number;
  limit?: number;
  sort?: string;
  q?: string;
  /** Show only batches expiring on/before this date. */
  expiringBefore?: Iso8601;
}
