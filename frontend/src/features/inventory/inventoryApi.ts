import type {
  BatchesListParams,
  CreateGrnInput,
  CreateSupplierInput,
  Grn,
  Medicine,
  MedicineBatch,
  MedicinesListParams,
  PharmacyAlert,
  Supplier,
  UpdateGrnInput,
  UpdateSupplierInput,
} from './inventoryTypes';
import {
  mockGrns,
  mockMedicineBatches,
  mockMedicines,
  mockPharmacyAlerts,
  mockSuppliers,
} from './__mocks__/inventoryMocks';

const delay = <T>(value: T, ms = 250): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

/**
 * Inventory API surface. Mocked today; signatures match the planned
 * backend contract (TSD-10).
 *
 * Wire points (lists honour ?page=&limit=&sort= per CLAUDE.md §3.4):
 *  GET   /api/medicines?search=&severity=     → searchMedicines / fetchMedicines
 *  GET   /api/inventory/alerts                → fetchPharmacyAlerts
 *  GET   /api/inventory/batches?expiring=     → fetchMedicineBatches
 *  GET   /api/inventory/suppliers             → fetchSuppliers
 *  GET   /api/inventory/grns                  → fetchGrns
 *  POST  /api/inventory/grns                  → createGrn (writes batches + GRN row)
 */

export const searchMedicines = async (query: string): Promise<Medicine[]> => {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? mockMedicines.filter(
        (m) => m.name.toLowerCase().includes(q) || m.genericName.toLowerCase().includes(q),
      )
    : mockMedicines;
  return delay(filtered.slice(0, 20));
};

export const fetchPharmacyAlerts = async (): Promise<PharmacyAlert[]> =>
  delay(mockPharmacyAlerts);

/* ---------- Back-office: catalog / batches / suppliers / GRN ---------- */

let mockBatchesState: MedicineBatch[] = [...mockMedicineBatches];
let mockGrnsState: Grn[] = [...mockGrns];
let mockSuppliersState: Supplier[] = [...mockSuppliers];
let grnSeq = 200;
let supplierSeq = 100;

export const fetchMedicines = async (
  params: MedicinesListParams = {},
): Promise<Medicine[]> => {
  void params.page;
  void params.limit;
  void params.sort;
  let rows = mockMedicines;
  if (params.severities && params.severities.length > 0) {
    const set = new Set(params.severities);
    rows = rows.filter((m) => set.has(m.severity));
  } else if (params.severity && params.severity !== 'all') {
    rows = rows.filter((m) => m.severity === params.severity);
  }
  if (params.q) {
    const q = params.q.toLowerCase();
    rows = rows.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.genericName.toLowerCase().includes(q) ||
        (m.drugClass ?? '').toLowerCase().includes(q),
    );
  }
  return delay(rows);
};

export const fetchMedicineBatches = async (
  params: BatchesListParams = {},
): Promise<MedicineBatch[]> => {
  void params.page;
  void params.limit;
  void params.sort;
  let rows = mockBatchesState;
  if (params.expiringBefore) {
    const cutoff = new Date(params.expiringBefore).getTime();
    rows = rows.filter((b) => new Date(b.expiryDate).getTime() <= cutoff);
  }
  if (params.q) {
    const q = params.q.toLowerCase();
    rows = rows.filter(
      (b) =>
        b.medicineName.toLowerCase().includes(q) ||
        b.batchNumber.toLowerCase().includes(q) ||
        b.supplierName.toLowerCase().includes(q),
    );
  }
  return delay(rows);
};

export const fetchSuppliers = async (): Promise<Supplier[]> =>
  delay(mockSuppliersState);

/** Single-supplier lookup — returns `null` when the id doesn't resolve. */
export const fetchSupplier = async (id: string): Promise<Supplier | null> => {
  const found = mockSuppliersState.find((s) => s.id === id) ?? null;
  return delay(found);
};

/** Insert a new supplier; mock generates a stable id and returns the row. */
export const createSupplier = async (
  input: CreateSupplierInput,
): Promise<Supplier> => {
  supplierSeq += 1;
  const created: Supplier = { id: `sup-${supplierSeq}`, ...input };
  mockSuppliersState = [created, ...mockSuppliersState];
  return delay(created, 200);
};

/** Patch supplier — throws when the id doesn't resolve so the caller surfaces it. */
export const updateSupplier = async (
  id: string,
  input: UpdateSupplierInput,
): Promise<Supplier> => {
  const idx = mockSuppliersState.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error('Unknown supplier');
  const merged: Supplier = { ...mockSuppliersState[idx], ...input, id };
  mockSuppliersState = [
    ...mockSuppliersState.slice(0, idx),
    merged,
    ...mockSuppliersState.slice(idx + 1),
  ];
  return delay(merged, 200);
};

export const fetchGrns = async (): Promise<Grn[]> => delay(mockGrnsState);

/** Single-GRN lookup — returns `null` when the id doesn't resolve. */
export const fetchGrn = async (id: string): Promise<Grn | null> => {
  const found = mockGrnsState.find((g) => g.id === id) ?? null;
  return delay(found);
};

/**
 * Patch an existing GRN. SCOPE LIMITATION: only the top-level metadata
 * (supplier, supplier invoice no., received date, notes) is mutated;
 * `input.lines` is intentionally ignored because rewriting per-line
 * batches after a GRN is saved would also have to retire the original
 * `medicine_batches` rows and stamp new ones (TSD-10 §4.3) — out of
 * scope for this pass. When the real backend lands, line edits become
 * a separate "amend GRN" workflow with its own audit trail.
 */
export const updateGrn = async (
  id: string,
  input: UpdateGrnInput,
): Promise<Grn> => {
  const idx = mockGrnsState.findIndex((g) => g.id === id);
  if (idx === -1) throw new Error('Unknown GRN');
  const existing = mockGrnsState[idx];
  let supplierName = existing.supplierName;
  let supplierId = existing.supplierId;
  if (input.supplierId && input.supplierId !== existing.supplierId) {
    const sup = mockSuppliersState.find((s) => s.id === input.supplierId);
    if (!sup) throw new Error('Unknown supplier');
    supplierId = sup.id;
    supplierName = sup.name;
  }
  const merged: Grn = {
    ...existing,
    supplierId,
    supplierName,
    supplierInvoiceNo: input.supplierInvoiceNo ?? existing.supplierInvoiceNo,
    receivedAt: input.receivedAt ?? existing.receivedAt,
    notes: input.notes ?? existing.notes,
  };
  mockGrnsState = [
    ...mockGrnsState.slice(0, idx),
    merged,
    ...mockGrnsState.slice(idx + 1),
  ];
  return delay(merged, 200);
};

const yearShort = (): string => String(new Date().getFullYear());

/**
 * Create a Goods Receive Note. Writes one batch per line + a GRN
 * header row. Real backend also bumps `medicines.available_qty`
 * accordingly; mock leaves the per-medicine counter alone for now.
 */
export const createGrn = async (input: CreateGrnInput): Promise<Grn> => {
  grnSeq += 1;
  const grnNumber = `GRN-${yearShort()}-${String(grnSeq).padStart(6, '0')}`;
  const supplier = mockSuppliersState.find((s) => s.id === input.supplierId);
  if (!supplier) throw new Error('Unknown supplier');
  const totalQuantity = input.lines.reduce((s, l) => s + l.quantity, 0);
  const totalCost = input.lines.reduce((s, l) => s + l.quantity * l.unitCost, 0);

  for (const l of input.lines) {
    const med = mockMedicines.find((m) => m.id === l.medicineId);
    if (!med) continue;
    mockBatchesState = [
      {
        id: `bat-${grnSeq}-${l.medicineId}`,
        medicineId: l.medicineId,
        medicineName: med.name,
        strength: med.strength,
        batchNumber: l.batchNumber,
        mfgDate: l.mfgDate,
        expiryDate: l.expiryDate,
        quantityOnHand: l.quantity,
        unitCost: l.unitCost,
        unitPrice: l.unitPrice,
        supplierId: supplier.id,
        supplierName: supplier.name,
        receivedAt: new Date().toISOString(),
        isActive: true,
      },
      ...mockBatchesState,
    ];
  }

  const grn: Grn = {
    id: `grn-${grnSeq}`,
    grnNumber,
    supplierId: supplier.id,
    supplierName: supplier.name,
    supplierInvoiceNo: input.supplierInvoiceNo,
    receivedAt: input.receivedAt ?? new Date().toISOString(),
    receivedBy: 'mock-user',
    notes: input.notes,
    lineCount: input.lines.length,
    totalQuantity,
    totalCost: Number(totalCost.toFixed(2)),
  };
  mockGrnsState = [grn, ...mockGrnsState];
  return delay(grn, 200);
};
