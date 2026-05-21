import type {
  DiscountInput,
  DispenseRxInput,
  DispenseRxResult,
  OtcSaleInput,
  OtcSaleResult,
  RxQueueEntry,
  RxQueueListParams,
  RxQueueStatus,
} from './pharmacyTypes';
import { mockRxQueue } from './__mocks__/pharmacyMocks';
import { consumeStockFefo, mockMedicineBatches } from '@/features/inventory/__mocks__/inventoryMocks';

/**
 * Resolve a discount input against a positive base amount, clamped so we
 * never go below zero. Centralised so the dispense-side total and any
 * downstream consumer (line totals, post-tax bill) agree on the math.
 */
export const resolveDiscount = (
  d: DiscountInput | undefined,
  base: number,
): number => {
  if (!d || base <= 0 || d.value <= 0) return 0;
  const raw = d.kind === 'pct' ? base * (d.value / 100) : d.value;
  return Math.min(Math.max(raw, 0), base);
};

const delay = <T>(value: T, ms = 250): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

/**
 * Pharmacy API surface. Mocked today; signatures match the planned
 * backend contract (TSD-10 §4.4 prescription_dispenses + cross-feature
 * call into billing.createInvoice).
 *
 * Wire points (lists honour ?page=&limit=&sort= per CLAUDE.md §3.4):
 *  GET   /api/pharmacy/rx?status=&q=        → fetchRxQueue
 *  GET   /api/pharmacy/rx/:id               → fetchRx
 *  POST  /api/pharmacy/rx/:id/pickup        → pickupRx (rx_pending → rx_in_progress)
 *  POST  /api/pharmacy/rx/:id/dispense      → dispenseRx (creates billing invoice + dispense rows)
 */

// IMPORTANT: this is the same reference as `mockRxQueue` (NOT a shallow
// copy) so that cross-feature mutations — consultation.lockConsultation
// calling `appendRxToQueue` from the pharmacy mock helper — are visible
// here on the next fetch. Using a shadow copy was the prior bug: the
// doctor’s Rx never reached the pharmacist’s queue.
const mockState: RxQueueEntry[] = mockRxQueue;

const DB_TO_FE_RX_STATUS: Record<string, RxQueueStatus> = {
  draft:                'rx_pending',
  active:               'rx_pending',
  partially_dispensed:  'rx_partially_dispensed',
  dispensed:            'rx_dispensed',
  cancelled:            'rx_cancelled',
};

interface SbRxRow {
  id: string; status: string; locked_at: string | null; created_at: string;
  patients: {
    id: string; uhid: string; first_name: string; last_name: string;
    gender: string; date_of_birth: string | null; mobile: string | null;
    blood_group: string | null;
  } | null;
  users: { full_name: string } | null;
  op_visits: { op_number: string } | null;
  prescription_items: Array<{
    id: string; medicine_id: string; medicine_name_snapshot: string;
    dosage: string; frequency: string; duration_days: number;
    quantity_prescribed: number; sequence_no: number;
  }>;
}

const ageFromDobP = (dob: string | null): number => {
  if (!dob) return 0;
  const d = new Date(dob); const n = new Date();
  return Math.max(0, n.getFullYear() - d.getFullYear() -
    (n < new Date(n.getFullYear(), d.getMonth(), d.getDate()) ? 1 : 0));
};

const mapRxRow = (r: SbRxRow): RxQueueEntry => {
  const p = r.patients;
  return {
    id: r.id,
    prescriptionNumber: `RX-${r.id.slice(0, 8).toUpperCase()}`,
    opNumber: r.op_visits?.op_number ?? '—',
    patient: p ? {
      id: p.id, uhid: p.uhid,
      firstName: p.first_name, lastName: p.last_name,
      fullName: `${p.first_name} ${p.last_name}`.trim(),
      gender: p.gender as 'm' | 'f' | 'o',
      ageYears: ageFromDobP(p.date_of_birth),
      mobile: p.mobile ?? undefined,
      bloodGroup: p.blood_group ?? undefined,
      allergies: [], chronicConditions: [],
    } : { id: '', uhid: '', firstName: '', lastName: '', fullName: '—', gender: 'o', ageYears: 0, allergies: [], chronicConditions: [] },
    doctorName: r.users?.full_name ?? '—',
    status: DB_TO_FE_RX_STATUS[r.status] ?? 'rx_pending',
    prescribedAt: r.locked_at ?? r.created_at,
    pickedUpAt: undefined,
    dispensedAt: r.status === 'dispensed' ? (r.locked_at ?? r.created_at) : undefined,
    items: r.prescription_items
      .sort((a, b) => a.sequence_no - b.sequence_no)
      .map((it) => ({
        id: it.id,
        medicineId: it.medicine_id,
        medicineName: it.medicine_name_snapshot,
        strength: '',
        dosage: it.dosage,
        frequency: it.frequency,
        route: 'PO',
        durationDays: it.duration_days,
        quantityPrescribed: it.quantity_prescribed,
        availableQty: it.quantity_prescribed * 2,  // synthesised; real qty would come from drug_stock join
        shelfQty: it.quantity_prescribed * 2,
        stockSeverity: 'ok',
        genericName: it.medicine_name_snapshot,
        unitPrice: 5,
        gstPct: 12,
      })),
  } satisfies RxQueueEntry;
};

export const fetchRxQueue = async (
  params: RxQueueListParams = {},
): Promise<RxQueueEntry[]> => {
  void params.page;
  void params.limit;
  void params.sort;

  let rows: RxQueueEntry[];
  try {
    const { supabase } = await import('@/lib/supabase/supabaseClient');
    const { data, error } = await supabase
      .from('prescriptions')
      .select(`
        id, status, locked_at, created_at,
        patients!prescriptions_patient_id_fkey ( id, uhid, first_name, last_name, gender, date_of_birth, mobile, blood_group ),
        users:users!prescriptions_doctor_id_fkey ( full_name ),
        op_visits ( op_number ),
        prescription_items ( id, medicine_id, medicine_name_snapshot, dosage, frequency, duration_days, quantity_prescribed, sequence_no )
      `)
      .is('deleted_at', null)
      .neq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    rows = ((data ?? []) as unknown as SbRxRow[]).map(mapRxRow);
  } catch {
    rows = mockState;
  }

  if (params.statuses && params.statuses.length > 0) {
    const set = new Set(params.statuses);
    rows = rows.filter((r) => set.has(r.status));
  } else if (params.status && params.status !== 'all') {
    rows = rows.filter((r) => r.status === params.status);
  }
  if (params.q) {
    const q = params.q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.prescriptionNumber.toLowerCase().includes(q) ||
        r.opNumber.toLowerCase().includes(q) ||
        r.patient.fullName.toLowerCase().includes(q) ||
        r.patient.uhid.toLowerCase().includes(q),
    );
  }
  return rows;
};

export const fetchRx = async (id: string): Promise<RxQueueEntry | null> => {
  try {
    const { supabase } = await import('@/lib/supabase/supabaseClient');
    const { data, error } = await supabase
      .from('prescriptions')
      .select(`
        id, status, locked_at, created_at,
        patients!prescriptions_patient_id_fkey ( id, uhid, first_name, last_name, gender, date_of_birth, mobile, blood_group ),
        users:users!prescriptions_doctor_id_fkey ( full_name ),
        op_visits ( op_number ),
        prescription_items ( id, medicine_id, medicine_name_snapshot, dosage, frequency, duration_days, quantity_prescribed, sequence_no )
      `)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error || !data) return mockState.find((r) => r.id === id) ?? null;
    return mapRxRow(data as unknown as SbRxRow);
  } catch {
    return mockState.find((r) => r.id === id) ?? null;
  }
};

const updateRx = (id: string, patch: Partial<RxQueueEntry>): RxQueueEntry => {
  const idx = mockState.findIndex((r) => r.id === id);
  if (idx < 0) throw new Error(`Rx ${id} not found`);
  const updated = { ...mockState[idx], ...patch };
  // In-place splice (NOT array reassignment) so the shared
  // mockRxQueue reference stays valid for cross-feature mutators.
  mockState[idx] = updated;
  return updated;
};

/** Pharmacist claims an Rx — moves from rx_pending to rx_in_progress. */
export const pickupRx = async (id: string): Promise<RxQueueEntry> =>
  delay(updateRx(id, { status: 'rx_in_progress', pickedUpAt: new Date().toISOString() }), 100);

/**
 * Dispense the Rx. Updates each item’s effective dispensed quantity
 * (mock side-effect: deducts availableQty), flips Rx status, and
 * returns the totals so the caller can hand off to billing.
 *
 * Real backend: writes prescription_dispenses rows, deducts
 * medicine_batches stock with FEFO, calls services_catalog to compute
 * line totals, and creates an `invoices` row in one transaction.
 */
/* ---------- Walk-in: refill lookup + anonymous OTC sale ---------- */

/**
 * Patient’s recent prescription history — sorted newest first. Powers the
 * pharmacy walk-in "Repeat last Rx" path: the pharmacist enters the
 * patient’s mobile number, the receptionist app surfaces matching
 * patients, and clicking one shows their prescription timeline so the
 * pharmacist can re-dispense without going back to the doctor.
 *
 * Real backend: `GET /api/pharmacy/patients/:uhid/prescriptions?limit=`
 * Mock scans the in-memory Rx queue by patient UHID.
 */
export const fetchPatientPrescriptionHistory = async (
  uhid: string,
  limit = 10,
): Promise<RxQueueEntry[]> => {
  const matches = mockState
    .filter((r) => r.patient.uhid === uhid)
    .sort(
      (a, b) =>
        new Date(b.prescribedAt).getTime() - new Date(a.prescribedAt).getTime(),
    )
    .slice(0, limit);
  return delay(matches, 120);
};

/**
 * Look up the cheapest active batch’s unit price for a medicine. Real
 * backend would price from `medicines` or `services_catalog`; mock walks
 * the batches array and picks the lowest-priced active batch (FEFO would
 * pick by expiry — for OTC the customer-facing price is uniform per
 * medicine in a real pharmacy anyway).
 */
export const getOtcUnitPrice = (medicineId: string): number => {
  const candidates = mockMedicineBatches.filter(
    (b) => b.medicineId === medicineId && b.isActive,
  );
  if (candidates.length === 0) return 0;
  return Math.min(...candidates.map((b) => b.unitPrice));
};

let mockOtcSeq = 5000;

/**
 * Record an anonymous OTC counter sale. No patient link, no prescription.
 * Decrements stock FEFO, generates a synthetic sale number + invoice id,
 * and reports any line that couldn’t be fulfilled in full so the
 * pharmacist can collect the reduced amount and inform the customer.
 *
 * Real backend: writes a `prescription_dispenses` row with
 * `prescription_id = NULL` (per TSD-10 §4.4 OTC variant) + `invoices`
 * row in one transaction.
 */
export const dispenseOtcSale = async (
  input: OtcSaleInput,
): Promise<OtcSaleResult> => {
  const shortfalls: OtcSaleResult['shortfalls'] = [];
  let total = 0;
  for (const line of input.lines) {
    if (line.quantity <= 0) continue;
    const fulfilled = consumeStockFefo(line.medicineId, line.quantity);
    if (fulfilled < line.quantity) {
      shortfalls.push({
        medicineId: line.medicineId,
        requested: line.quantity,
        fulfilled,
      });
    }
    const gross = line.unitPrice * fulfilled;
    const gst = gross * (line.gstPct / 100);
    total += gross + gst;
  }

  mockOtcSeq += 1;
  const saleNumber = `OTC-${new Date().getFullYear()}-${String(mockOtcSeq).padStart(6, '0')}`;
  return delay(
    {
      saleNumber,
      invoiceId: `inv-otc-${mockOtcSeq}`,
      invoiceTotal: Number(total.toFixed(2)),
      shortfalls: shortfalls.length > 0 ? shortfalls : undefined,
    },
    200,
  );
};

export const dispenseRx = async (
  input: DispenseRxInput,
): Promise<DispenseRxResult> => {
  const rx = mockState.find((r) => r.id === input.rxId);
  if (!rx) throw new Error(`Rx ${input.rxId} not found`);

  const newItems = rx.items.map((it) => {
    const decision = input.lines.find((l) => l.rxItemId === it.id);
    if (!decision || decision.decision !== 'dispense') return it;
    const qty = Math.min(decision.quantityDispensed ?? 0, it.availableQty);
    // Mock side-effect: deduct from inventory batches FEFO so the
    // back-office Inventory app sees the stock movement.
    if (qty > 0) consumeStockFefo(it.medicineId, qty);
    return {
      ...it,
      availableQty: Math.max(0, it.availableQty - qty),
      notes: decision.notes ?? it.notes,
    };
  });

  const preBillTotal = input.lines
    .filter((l) => l.decision === 'dispense' && l.quantityDispensed && l.quantityDispensed > 0)
    .reduce((acc, l) => {
      const item = rx.items.find((i) => i.id === l.rxItemId);
      if (!item) return acc;
      const gross = item.unitPrice * (l.quantityDispensed ?? 0);
      const lineDisc = resolveDiscount(l.lineDiscount, gross);
      const lineNet = gross - lineDisc;
      const lineGst = lineNet * (item.gstPct / 100);
      return acc + lineNet + lineGst;
    }, 0);
  const billDisc = resolveDiscount(input.billDiscount, preBillTotal);
  const dispensedTotal = preBillTotal - billDisc;

  const dispensedAny = input.lines.some((l) => l.decision === 'dispense' && (l.quantityDispensed ?? 0) > 0);
  const declinedAny = input.lines.some((l) => l.decision === 'decline');
  let nextStatus: RxQueueStatus = 'rx_dispensed';
  if (dispensedAny && declinedAny) nextStatus = 'rx_partially_dispensed';
  if (!dispensedAny) nextStatus = 'rx_cancelled';

  const updated = updateRx(input.rxId, {
    items: newItems,
    status: nextStatus,
    dispensedAt: new Date().toISOString(),
  });

  return delay(
    {
      rx: updated,
      invoiceId: dispensedTotal > 0 ? `inv-rx-${input.rxId}-${Date.now()}` : undefined,
      invoiceTotal: Number(dispensedTotal.toFixed(2)),
    },
    200,
  );
};
