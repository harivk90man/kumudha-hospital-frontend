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

/** Pharmacist claims an Rx — moves from rx_pending to rx_in_progress.
 *  Note: prescriptions.status enum has no 'in_progress' value (the DB
 *  treats pickup as a UI affordance). We update the mock state for the
 *  on-screen badge but leave the DB row alone until dispense actually
 *  commits drug movement.
 */
export const pickupRx = async (id: string): Promise<RxQueueEntry> => {
  const idx = mockState.findIndex((r) => r.id === id);
  if (idx >= 0) {
    return delay(updateRx(id, { status: 'rx_in_progress', pickedUpAt: new Date().toISOString() }), 100);
  }
  // DB-backed Rx that isn't in mockState: try to fetch + cache locally so
  // the pickup badge shows, then return the now-cached row.
  const fresh = await fetchRx(id);
  if (!fresh) throw new Error(`Rx ${id} not found`);
  const pickedUp: RxQueueEntry = { ...fresh, status: 'rx_in_progress', pickedUpAt: new Date().toISOString() };
  mockState.push(pickedUp);
  return pickedUp;
};

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

const FE_RX_STATUS_TO_DB: Record<RxQueueStatus, string> = {
  rx_pending:              'active',
  rx_in_progress:          'active',
  rx_dispensed:            'dispensed',
  rx_partially_dispensed:  'partially_dispensed',
  rx_cancelled:            'cancelled',
};

/**
 * Pick the FEFO (earliest-expiry) active batch with enough stock for the
 * given drug. Returns null when no usable batch exists. Schedule-X /
 * narcotic drugs would normally require additional checks but for the
 * demo we treat them like any other drug.
 */
const pickFefoBatch = async (
  drugId: string,
  qty: number,
): Promise<{ id: string; quantity_available: number; selling_price: number; cgst_pct: number; sgst_pct: number; igst_pct: number } | null> => {
  try {
    const { supabase } = await import('@/lib/supabase/supabaseClient');
    const { data } = await supabase
      .from('drug_stock')
      .select('id, quantity_available, selling_price, expiry_date, is_blocked')
      .eq('drug_id', drugId)
      .gte('quantity_available', qty)
      .eq('is_blocked', false)
      .order('expiry_date', { ascending: true })
      .limit(1);
    const rows = (data ?? []) as Array<{ id: string; quantity_available: number; selling_price: number; expiry_date: string; is_blocked: boolean }>;
    if (rows.length === 0) return null;
    const b = rows[0];
    // We don't have CGST/SGST split per batch — default to 0; GST will go in igst_pct=0 with line totals carrying tax inline.
    return { id: b.id, quantity_available: b.quantity_available, selling_price: b.selling_price, cgst_pct: 0, sgst_pct: 0, igst_pct: 0 };
  } catch {
    return null;
  }
};

/**
 * Persist a dispense to Supabase: pharmacy_sales + pharmacy_sale_items
 * (one row per drug batch picked FEFO), decrement drug_stock, and append
 * drug_stock_ledger sale_out rows. Returns {saleId, invoiceTotal} on
 * success; null when the Rx isn't a real DB row or when batch picking
 * fails — caller falls back to mock-only behaviour in that case.
 */
const persistDispenseToDb = async (
  input: DispenseRxInput,
  rx: RxQueueEntry,
): Promise<{ saleId: string; invoiceTotal: number; nextDbStatus: string } | null> => {
  try {
    const { supabase, DEMO_USER_ID } = await import('@/lib/supabase/supabaseClient');
    const bs = DEMO_USER_ID;

    // Compute per-line totals + pick a batch per dispensed line.
    interface LineWork {
      rxItem: RxQueueEntry['items'][number];
      qty: number;
      batchId: string;
      unitPrice: number;
      lineDisc: number;
      lineNet: number;
      lineGst: number;
      cgstPct: number; sgstPct: number; igstPct: number;
      cgstAmt: number; sgstAmt: number; igstAmt: number;
      totalPrice: number;
      lineDiscPct: number;
    }
    const work: LineWork[] = [];
    let subtotal = 0;
    let totalTax = 0;

    for (const dec of input.lines) {
      if (dec.decision !== 'dispense' || !dec.quantityDispensed || dec.quantityDispensed <= 0) continue;
      const item = rx.items.find((i) => i.id === dec.rxItemId);
      if (!item) continue;
      const batch = await pickFefoBatch(item.medicineId, dec.quantityDispensed);
      if (!batch) return null; // can't fulfil; bail to mock path
      const unitPrice = batch.selling_price > 0 ? batch.selling_price : item.unitPrice;
      const gross = unitPrice * dec.quantityDispensed;
      const lineDisc = resolveDiscount(dec.lineDiscount, gross);
      const lineDiscPct = dec.lineDiscount?.kind === 'pct' ? Number(dec.lineDiscount.value) : 0;
      const lineNet = gross - lineDisc;
      const lineGst = lineNet * (item.gstPct / 100);
      // Treat whole gst as IGST for simplicity (single-state demo).
      const igstPct = item.gstPct;
      const igstAmt = Number(lineGst.toFixed(2));
      const totalPrice = Number((lineNet + lineGst).toFixed(2));
      subtotal += lineNet;
      totalTax += lineGst;
      work.push({
        rxItem: item,
        qty: dec.quantityDispensed,
        batchId: batch.id,
        unitPrice,
        lineDisc: Number(lineDisc.toFixed(2)),
        lineNet,
        lineGst,
        cgstPct: 0, sgstPct: 0, igstPct,
        cgstAmt: 0, sgstAmt: 0, igstAmt,
        totalPrice,
        lineDiscPct,
      });
    }

    const dispensedAny = work.length > 0;
    const declinedAny = input.lines.some((l) => l.decision === 'decline');
    let nextDbStatus = 'dispensed';
    if (dispensedAny && declinedAny) nextDbStatus = 'partially_dispensed';
    if (!dispensedAny) nextDbStatus = 'cancelled';

    if (!dispensedAny) {
      // Pure cancel — only update prescription status.
      await supabase.from('prescriptions')
        .update({ status: nextDbStatus, updated_by: bs })
        .eq('id', input.rxId);
      return { saleId: '', invoiceTotal: 0, nextDbStatus };
    }

    const billDisc = resolveDiscount(input.billDiscount, subtotal + totalTax);
    const billDiscPct = input.billDiscount?.kind === 'pct' ? Number(input.billDiscount.value) : null;
    const netAmount = Number(((subtotal + totalTax) - billDisc).toFixed(2));

    // Resolve patient_id from prescription if we have one.
    const patientId = rx.patient.id || null;
    const saleNumber = `PS-${new Date().getFullYear()}-${input.rxId.slice(0, 6).toUpperCase()}-${String(Date.now()).slice(-4)}`;

    const { data: saleIns, error: saleErr } = await supabase
      .from('pharmacy_sales')
      .insert({
        sale_number:           saleNumber,
        patient_id:            patientId,
        sale_type:             'op_patient',
        prescription_id:       input.rxId,
        subtotal:              Number(subtotal.toFixed(2)),
        total_tax:             Number(totalTax.toFixed(2)),
        bill_discount_pct:     billDiscPct,
        bill_discount_amount:  Number(billDisc.toFixed(2)),
        net_amount:            netAmount,
        status:                nextDbStatus === 'partially_dispensed' ? 'partially_dispensed' : 'dispensed',
        created_by:            bs,
      })
      .select('id')
      .maybeSingle();
    if (saleErr || !saleIns) return null;
    const saleId = (saleIns as { id: string }).id;

    // Insert sale_items, then decrement drug_stock, then write ledger rows.
    for (const w of work) {
      const { data: itemIns } = await supabase
        .from('pharmacy_sale_items')
        .insert({
          pharmacy_sale_id:      saleId,
          drug_id:               w.rxItem.medicineId,
          drug_stock_id:         w.batchId,
          prescription_item_id:  w.rxItem.id,
          quantity:              w.qty,
          unit_price:            Number(w.unitPrice.toFixed(2)),
          line_discount_pct:     w.lineDiscPct,
          line_discount_amount:  w.lineDisc,
          cgst_pct:              w.cgstPct, cgst_amount: w.cgstAmt,
          sgst_pct:              w.sgstPct, sgst_amount: w.sgstAmt,
          igst_pct:              w.igstPct, igst_amount: w.igstAmt,
          total_price:           w.totalPrice,
          created_by:            bs,
        })
        .select('id')
        .maybeSingle();

      // Decrement drug_stock — fetch current qty first for ledger record.
      const { data: cur } = await supabase
        .from('drug_stock').select('quantity_available').eq('id', w.batchId).maybeSingle();
      const before = (cur as { quantity_available: number } | null)?.quantity_available ?? 0;
      const after = Math.max(0, before - w.qty);
      await supabase.from('drug_stock')
        .update({ quantity_available: after, updated_by: bs })
        .eq('id', w.batchId);

      // Append ledger row.
      await supabase.from('drug_stock_ledger').insert({
        drug_stock_id:          w.batchId,
        movement_type:          'sale_out',
        quantity_before:        before,
        quantity_after:         after,
        pharmacy_sale_item_id:  (itemIns as { id: string } | null)?.id ?? null,
        performed_by:           bs,
        notes:                  `Dispense for Rx ${input.rxId}`,
        created_by:             bs,
      });
    }

    // Update prescription status.
    await supabase.from('prescriptions')
      .update({ status: nextDbStatus, updated_by: bs })
      .eq('id', input.rxId);

    return { saleId, invoiceTotal: netAmount, nextDbStatus };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[dispenseRx] DB persistence failed; falling back to mock-only:', e);
    return null;
  }
};

export const dispenseRx = async (
  input: DispenseRxInput,
): Promise<DispenseRxResult> => {
  // Try to find the Rx in mockState first; if not there, hydrate from DB.
  let rx = mockState.find((r) => r.id === input.rxId);
  if (!rx) {
    const fromDb = await fetchRx(input.rxId);
    if (!fromDb) throw new Error(`Rx ${input.rxId} not found`);
    rx = fromDb;
    mockState.push(rx);
  }

  const dispensedAny = input.lines.some((l) => l.decision === 'dispense' && (l.quantityDispensed ?? 0) > 0);
  const declinedAny = input.lines.some((l) => l.decision === 'decline');
  let nextStatus: RxQueueStatus = 'rx_dispensed';
  if (dispensedAny && declinedAny) nextStatus = 'rx_partially_dispensed';
  if (!dispensedAny) nextStatus = 'rx_cancelled';

  // Persist to Supabase (best-effort).
  const dbResult = await persistDispenseToDb(input, rx);

  // Always update mock state so the UI reflects the change.
  const newItems = rx.items.map((it) => {
    const decision = input.lines.find((l) => l.rxItemId === it.id);
    if (!decision || decision.decision !== 'dispense') return it;
    const qty = Math.min(decision.quantityDispensed ?? 0, it.availableQty);
    if (qty > 0) consumeStockFefo(it.medicineId, qty);
    return {
      ...it,
      availableQty: Math.max(0, it.availableQty - qty),
      notes: decision.notes ?? it.notes,
    };
  });
  const updated = updateRx(input.rxId, {
    items: newItems,
    status: nextStatus,
    dispensedAt: new Date().toISOString(),
  });
  // Avoid unused-var warning when DB path computes the status itself.
  void FE_RX_STATUS_TO_DB;

  // Prefer the DB-computed total when persistence succeeded; otherwise
  // compute locally from mock state.
  let invoiceTotal = dbResult?.invoiceTotal ?? 0;
  let invoiceId = dbResult?.saleId || undefined;
  if (!dbResult) {
    const preBillTotal = input.lines
      .filter((l) => l.decision === 'dispense' && l.quantityDispensed && l.quantityDispensed > 0)
      .reduce((acc, l) => {
        const item = rx!.items.find((i) => i.id === l.rxItemId);
        if (!item) return acc;
        const gross = item.unitPrice * (l.quantityDispensed ?? 0);
        const lineDisc = resolveDiscount(l.lineDiscount, gross);
        const lineNet = gross - lineDisc;
        const lineGst = lineNet * (item.gstPct / 100);
        return acc + lineNet + lineGst;
      }, 0);
    const billDisc = resolveDiscount(input.billDiscount, preBillTotal);
    invoiceTotal = Number((preBillTotal - billDisc).toFixed(2));
    invoiceId = invoiceTotal > 0 ? `inv-rx-${input.rxId}-${Date.now()}` : undefined;
  }

  return {
    rx: updated,
    invoiceId,
    invoiceTotal,
  };
};
