import type {
  BatchesListParams,
  CreateGrnInput,
  CreateSupplierInput,
  Grn,
  Medicine,
  MedicineBatch,
  MedicineForm,
  MedicinesListParams,
  PharmacyAlert,
  StockSeverity,
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
import { supabase } from '@/lib/supabase/supabaseClient';

/* ---------- DB form/severity helpers ---------- */

const DB_FORM_TO_FE: Record<string, MedicineForm> = {
  tablet:        'tab',
  capsule:       'cap',
  injection:     'inj',
  syrup:         'syrup',
  drops:         'drops',
  inhaler:       'inj',
  cream:         'oint',
  ointment:      'oint',
  powder:        'syrup',
};

const computeSeverity = (
  availableQty: number,
  thresholdQty: number,
  earliestExpiry: string | null,
): StockSeverity => {
  if (earliestExpiry) {
    const exp = new Date(earliestExpiry).getTime();
    if (exp <= Date.now()) return 'expired';
    if (exp <= Date.now() + 30 * 24 * 60 * 60 * 1000) return 'near_expiry';
  }
  if (availableQty <= 0) return 'out_of_stock';
  if (availableQty < thresholdQty) return 'low';
  return 'ok';
};

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

/**
 * Load every drug from the catalogue + aggregate stock across batches.
 * Returns the FE-shape Medicine list with availableQty / threshold /
 * earliestExpiry / severity computed from drug_stock rows.
 */
const loadCatalogueWithStock = async (): Promise<Medicine[]> => {
  const { data: drugs, error: dErr } = await supabase
    .from('drug_catalogue')
    .select('id, drug_code, generic_name, brand_name, strength, form, drug_class, is_narcotic, requires_prescription, low_stock_threshold')
    .is('deleted_at', null);
  if (dErr) throw new Error(dErr.message);
  const drugRows = (drugs ?? []) as Array<{
    id: string; drug_code: string; generic_name: string; brand_name: string | null;
    strength: string | null; form: string; drug_class: string | null;
    is_narcotic: boolean; requires_prescription: boolean; low_stock_threshold: number;
  }>;
  if (drugRows.length === 0) return [];

  const { data: stock, error: sErr } = await supabase
    .from('drug_stock')
    .select('drug_id, quantity_available, expiry_date, is_blocked');
  if (sErr) throw new Error(sErr.message);
  const stockRows = (stock ?? []) as Array<{ drug_id: string; quantity_available: number; expiry_date: string; is_blocked: boolean }>;

  const agg = new Map<string, { qty: number; earliest: string | null }>();
  for (const r of stockRows) {
    if (r.is_blocked) continue;
    const cur = agg.get(r.drug_id) ?? { qty: 0, earliest: null };
    if (r.quantity_available > 0) {
      cur.qty += r.quantity_available;
      if (!cur.earliest || r.expiry_date < cur.earliest) cur.earliest = r.expiry_date;
    }
    agg.set(r.drug_id, cur);
  }

  return drugRows.map((d) => {
    const a = agg.get(d.id) ?? { qty: 0, earliest: null };
    const severity = computeSeverity(a.qty, d.low_stock_threshold, a.earliest);
    return {
      id: d.id,
      name: d.brand_name ?? d.generic_name,
      genericName: d.generic_name,
      strength: d.strength ?? '',
      form: DB_FORM_TO_FE[d.form] ?? 'tab',
      availableQty: a.qty,
      thresholdQty: d.low_stock_threshold,
      earliestExpiry: a.earliest ?? undefined,
      severity,
      requiresPrescription: d.requires_prescription || undefined,
      isNarcotic: d.is_narcotic || undefined,
      drugClass: d.drug_class ?? undefined,
    } satisfies Medicine;
  });
};

export const searchMedicines = async (query: string): Promise<Medicine[]> => {
  try {
    const all = await loadCatalogueWithStock();
    const q = query.trim().toLowerCase();
    const filtered = q
      ? all.filter(
          (m) => m.name.toLowerCase().includes(q) || m.genericName.toLowerCase().includes(q),
        )
      : all;
    return filtered.slice(0, 20);
  } catch {
    return mockMedicines.slice(0, 20);
  }
};

export const fetchPharmacyAlerts = async (): Promise<PharmacyAlert[]> => {
  try {
    const all = await loadCatalogueWithStock();
    return all.filter((m) => m.severity !== 'ok').map((m) => ({
      medicineId: m.id,
      medicineName: m.name,
      strength: m.strength,
      availableQty: m.availableQty,
      thresholdQty: m.thresholdQty,
      expiry: m.earliestExpiry,
      severity: m.severity,
    } satisfies PharmacyAlert));
  } catch {
    return mockPharmacyAlerts;
  }
};

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
  let rows: Medicine[];
  try {
    rows = await loadCatalogueWithStock();
  } catch {
    rows = mockMedicines;
  }
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
  return rows;
};

export const fetchMedicineBatches = async (
  params: BatchesListParams = {},
): Promise<MedicineBatch[]> => {
  void params.page;
  void params.limit;
  void params.sort;
  let rows: MedicineBatch[];
  try {
    const { data, error } = await supabase
      .from('drug_stock')
      .select(`
        id, batch_number, mfg_date, expiry_date, purchase_price, selling_price,
        quantity_received, quantity_available, received_date, is_blocked,
        drug_catalogue!drug_stock_drug_id_fkey ( id, brand_name, generic_name, strength ),
        vendors!drug_stock_vendor_id_fkey ( id, vendor_name )
      `)
      .order('expiry_date', { ascending: true });
    if (error) throw new Error(error.message);
    const dbRows = (data ?? []) as unknown as Array<{
      id: string; batch_number: string; mfg_date: string | null; expiry_date: string;
      purchase_price: string | number; selling_price: string | number;
      quantity_received: number; quantity_available: number; received_date: string;
      is_blocked: boolean;
      drug_catalogue: { id: string; brand_name: string | null; generic_name: string; strength: string | null } | null;
      vendors: { id: string; vendor_name: string } | null;
    }>;
    rows = dbRows.map((r) => ({
      id: r.id,
      medicineId: r.drug_catalogue?.id ?? '',
      medicineName: r.drug_catalogue?.brand_name ?? r.drug_catalogue?.generic_name ?? '—',
      strength: r.drug_catalogue?.strength ?? '',
      batchNumber: r.batch_number,
      mfgDate: r.mfg_date ?? undefined,
      expiryDate: r.expiry_date,
      quantityOnHand: r.quantity_available,
      unitCost: Number(r.purchase_price),
      unitPrice: Number(r.selling_price),
      supplierId: r.vendors?.id ?? '',
      supplierName: r.vendors?.vendor_name ?? '—',
      receivedAt: r.received_date,
      isActive: !r.is_blocked,
    } satisfies MedicineBatch));
  } catch {
    rows = mockBatchesState;
  }
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
  return rows;
};

export const fetchSuppliers = async (): Promise<Supplier[]> => {
  try {
    const { data, error } = await supabase
      .from('vendors')
      .select('id, vendor_code, vendor_name, gstin, address, deleted_at')
      .is('deleted_at', null)
      .order('vendor_name', { ascending: true });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{
      id: string; vendor_code: string; vendor_name: string;
      gstin: string | null; address: { line1?: string; city?: string } | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      name: r.vendor_name,
      gstin: r.gstin ?? undefined,
      address: r.address ? `${r.address.line1 ?? ''}${r.address.city ? ', ' + r.address.city : ''}`.trim() : undefined,
      isActive: true,
    } satisfies Supplier));
  } catch {
    return mockSuppliersState;
  }
};

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
