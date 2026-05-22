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
import { todayLocalIso } from '@/utils/dateRange';

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
  // prescriptions has no direct FK to op_visits — op_number is reached
  // via the consultation_id → op_visit_id chain.
  consultations: { op_visits: { op_number: string } | null } | null;
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
    opNumber: r.consultations?.op_visits?.op_number ?? '—',
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
        consultations ( op_visits ( op_number ) ),
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

const RX_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const fetchRx = async (id: string): Promise<RxQueueEntry | null> => {
  // Mock/synthetic ids (`rx-801`, `rx-OP-…`) are not valid UUIDs. PostgREST
  // would reject them with 400 ("invalid input syntax for type uuid"), so
  // short-circuit to the local mock state for those.
  if (!RX_UUID_RE.test(id)) {
    return mockState.find((r) => r.id === id) ?? null;
  }
  try {
    const { supabase } = await import('@/lib/supabase/supabaseClient');
    const { data, error } = await supabase
      .from('prescriptions')
      .select(`
        id, status, locked_at, created_at,
        patients!prescriptions_patient_id_fkey ( id, uhid, first_name, last_name, gender, date_of_birth, mobile, blood_group ),
        users:users!prescriptions_doctor_id_fkey ( full_name ),
        consultations ( op_visits ( op_number ) ),
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
  try {
    const { supabase } = await import('@/lib/supabase/supabaseClient');
    // Resolve UHID → patient_id, then pull every prescription with items.
    const { data: pRow } = await supabase
      .from('patients').select('id').eq('uhid', uhid).is('deleted_at', null).maybeSingle();
    const patientId = (pRow as { id: string } | null)?.id;
    if (patientId) {
      const { data, error } = await supabase
        .from('prescriptions')
        .select(`
          id, status, locked_at, created_at,
          patients!prescriptions_patient_id_fkey ( id, uhid, first_name, last_name, gender, date_of_birth, mobile, blood_group ),
          users:users!prescriptions_doctor_id_fkey ( full_name ),
          consultations ( op_visits ( op_number ) ),
          prescription_items ( id, medicine_id, medicine_name_snapshot, dosage, frequency, duration_days, quantity_prescribed, sequence_no )
        `)
        .eq('patient_id', patientId)
        .neq('status', 'draft')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (!error && data) {
        return (data as unknown as SbRxRow[]).map(mapRxRow);
      }
    }
  } catch {
    // fall through to mock
  }
  const matches = mockState
    .filter((r) => r.patient.uhid === uhid)
    .sort(
      (a, b) =>
        new Date(b.prescribedAt).getTime() - new Date(a.prescribedAt).getTime(),
    )
    .slice(0, limit);
  return matches;
};

/**
 * Look up the cheapest active batch's selling_price for a medicine.
 * Sync helper for the UI render path — it asks Supabase synchronously
 * via a cached promise (see {@link primeOtcPriceCache}) and falls back
 * to the mock batches list when the cache is empty.
 *
 * To get a live price for a medicine call {@link fetchOtcUnitPrice}
 * before opening the OTC dialog; the cashier sees the real selling
 * price on the line item.
 */
const otcPriceCache = new Map<string, number>();

export const getOtcUnitPrice = (medicineId: string): number => {
  const cached = otcPriceCache.get(medicineId);
  if (cached !== undefined) return cached;
  const candidates = mockMedicineBatches.filter(
    (b) => b.medicineId === medicineId && b.isActive,
  );
  if (candidates.length === 0) return 0;
  return Math.min(...candidates.map((b) => b.unitPrice));
};

/**
 * Resolve and cache the FEFO selling_price for a medicine from Supabase.
 * The OTC counter calls this before adding a medicine to the cart so
 * the displayed unit price matches the actual batch the dispense will
 * decrement from.
 */
export const fetchOtcUnitPrice = async (medicineId: string): Promise<number> => {
  try {
    const { supabase } = await import('@/lib/supabase/supabaseClient');
    const { data } = await supabase
      .from('drug_stock')
      .select('selling_price, expiry_date, quantity_available, is_blocked')
      .eq('drug_id', medicineId)
      .gt('quantity_available', 0)
      .eq('is_blocked', false)
      .order('expiry_date', { ascending: true })
      .limit(1);
    const rows = (data ?? []) as Array<{ selling_price: number }>;
    if (rows.length > 0 && rows[0].selling_price > 0) {
      otcPriceCache.set(medicineId, rows[0].selling_price);
      return rows[0].selling_price;
    }
  } catch {
    // fall through
  }
  return getOtcUnitPrice(medicineId);
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
/**
 * Persist an OTC sale to Supabase:
 *  - one pharmacy_sales header (sale_type='walkin_otc', prescription_id=null)
 *  - one pharmacy_sale_items row per dispensed line (per FEFO batch)
 *  - drug_stock decrement + drug_stock_ledger sale_out per line
 *
 * Returns the new sale UUID + computed totals + any shortfalls. Returns
 * null when the DB rejects the write (e.g. nothing fulfilled) so the
 * caller can fall back to the mock path.
 */
interface OtcDbResult {
  saleId:        string;
  saleNumber:    string;
  invoiceTotal:  number;
  shortfalls:    OtcSaleResult['shortfalls'];
}

const persistOtcSaleToDb = async (
  input: OtcSaleInput,
): Promise<OtcDbResult | null> => {
  try {
    const { supabase, DEMO_USER_ID } = await import('@/lib/supabase/supabaseClient');
    const bs = DEMO_USER_ID;

    interface LineWork {
      medicineId: string; qty: number; unitPrice: number; gstPct: number;
      batchId: string; lineTotal: number; lineGst: number;
    }
    const work: LineWork[] = [];
    const shortfalls: OtcSaleResult['shortfalls'] = [];
    let subtotal = 0;
    let totalTax = 0;

    for (const line of input.lines) {
      if (line.quantity <= 0) continue;
      const batch = await pickFefoBatch(line.medicineId, line.quantity);
      if (!batch) {
        // Try smaller — pick any batch with some stock and partially fulfil.
        const { data: anyBatch } = await supabase
          .from('drug_stock')
          .select('id, quantity_available, selling_price, expiry_date')
          .eq('drug_id', line.medicineId)
          .gt('quantity_available', 0)
          .eq('is_blocked', false)
          .order('expiry_date', { ascending: true })
          .limit(1)
          .maybeSingle();
        const partial = anyBatch as { id: string; quantity_available: number; selling_price: number } | null;
        if (!partial || partial.quantity_available <= 0) {
          shortfalls.push({ medicineId: line.medicineId, requested: line.quantity, fulfilled: 0 });
          continue;
        }
        const taken = partial.quantity_available;
        shortfalls.push({ medicineId: line.medicineId, requested: line.quantity, fulfilled: taken });
        const unit = partial.selling_price > 0 ? partial.selling_price : line.unitPrice;
        const gross = unit * taken;
        const gst = gross * (line.gstPct / 100);
        subtotal += gross;
        totalTax += gst;
        work.push({ medicineId: line.medicineId, qty: taken, unitPrice: unit, gstPct: line.gstPct,
          batchId: partial.id, lineTotal: Number((gross + gst).toFixed(2)), lineGst: gst });
        continue;
      }
      const unit = batch.selling_price > 0 ? batch.selling_price : line.unitPrice;
      const gross = unit * line.quantity;
      const gst = gross * (line.gstPct / 100);
      subtotal += gross;
      totalTax += gst;
      work.push({ medicineId: line.medicineId, qty: line.quantity, unitPrice: unit, gstPct: line.gstPct,
        batchId: batch.id, lineTotal: Number((gross + gst).toFixed(2)), lineGst: gst });
    }

    if (work.length === 0) return null;

    const today = todayLocalIso().replace(/-/g, '');
    const saleNumber = `OTC-${today}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const netAmount = Number((subtotal + totalTax).toFixed(2));

    const { data: saleIns, error: saleErr } = await supabase
      .from('pharmacy_sales')
      .insert({
        sale_number:           saleNumber,
        patient_id:            null,
        sale_type:             'walkin_otc',
        prescription_id:       null,
        customer_name:         input.customerName ?? null,
        customer_mobile:       input.customerPhone ?? null,
        subtotal:              Number(subtotal.toFixed(2)),
        total_tax:             Number(totalTax.toFixed(2)),
        bill_discount_amount:  0,
        net_amount:            netAmount,
        status:                shortfalls.length > 0 ? 'partially_dispensed' : 'dispensed',
        created_by:            bs,
      })
      .select('id')
      .maybeSingle();
    if (saleErr || !saleIns) return null;
    const saleId = (saleIns as { id: string }).id;

    for (const w of work) {
      const { data: itemIns } = await supabase
        .from('pharmacy_sale_items')
        .insert({
          pharmacy_sale_id:      saleId,
          drug_id:               w.medicineId,
          drug_stock_id:         w.batchId,
          quantity:              w.qty,
          unit_price:            Number(w.unitPrice.toFixed(2)),
          line_discount_pct:     0,
          line_discount_amount:  0,
          cgst_pct:              0, cgst_amount: 0,
          sgst_pct:              0, sgst_amount: 0,
          igst_pct:              w.gstPct,
          igst_amount:           Number(w.lineGst.toFixed(2)),
          total_price:           w.lineTotal,
          created_by:            bs,
        })
        .select('id')
        .maybeSingle();

      const { data: cur } = await supabase
        .from('drug_stock').select('quantity_available').eq('id', w.batchId).maybeSingle();
      const before = (cur as { quantity_available: number } | null)?.quantity_available ?? 0;
      const after = Math.max(0, before - w.qty);
      await supabase.from('drug_stock')
        .update({ quantity_available: after, updated_by: bs })
        .eq('id', w.batchId);

      await supabase.from('drug_stock_ledger').insert({
        drug_stock_id:          w.batchId,
        movement_type:          'sale_out',
        quantity_before:        before,
        quantity_after:         after,
        pharmacy_sale_item_id:  (itemIns as { id: string } | null)?.id ?? null,
        performed_by:           bs,
        notes:                  `OTC sale ${saleNumber}`,
        created_by:             bs,
      });
    }

    return { saleId, saleNumber, invoiceTotal: netAmount, shortfalls: shortfalls.length > 0 ? shortfalls : undefined };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[dispenseOtcSale] DB persistence failed; mock-only:', e);
    return null;
  }
};

interface SbOtcSaleRow {
  id: string; sale_number: string; created_at: string;
  customer_name: string | null; customer_mobile: string | null;
  subtotal: number; total_tax: number; net_amount: number; status: string;
  pharmacy_sale_items: Array<{
    id: string; quantity: number; unit_price: number; total_price: number;
    igst_pct: number;
    drug_catalogue: { generic_name: string; brand_name: string | null; strength: string | null } | null;
  }>;
}

/**
 * Pull the latest OTC counter sales straight from `pharmacy_sales`
 * (sale_type='walkin_otc'). One row per sale with the line items
 * embedded; the page builds OtcSaleRecord objects from these so the
 * existing UI components keep working unchanged.
 */
export const fetchOtcSales = async (
  params: { q?: string; limit?: number } = {},
): Promise<import('./otcSalesStore').OtcSaleRecord[]> => {
  const { q, limit = 100 } = params;
  try {
    const { supabase } = await import('@/lib/supabase/supabaseClient');
    const { data, error } = await supabase
      .from('pharmacy_sales')
      .select(`
        id, sale_number, created_at, customer_name, customer_mobile,
        subtotal, total_tax, net_amount, status,
        pharmacy_sale_items (
          id, quantity, unit_price, total_price, igst_pct,
          drug_catalogue ( generic_name, brand_name, strength )
        )
      `)
      .eq('sale_type', 'walkin_otc')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    const rows = (data as unknown as SbOtcSaleRow[]).map((r): import('./otcSalesStore').OtcSaleRecord => {
      const lines = r.pharmacy_sale_items.map((it) => {
        const d = it.drug_catalogue;
        const name = d ? (d.brand_name && d.brand_name.trim() ? d.brand_name : d.generic_name) : '—';
        return {
          medicineId:  '',  // not surfaced for the list view; not needed by the row UI
          medicineName: name,
          strength:    d?.strength ?? '',
          quantity:    it.quantity,
          unitPrice:   it.unit_price,
          gstPct:      it.igst_pct,
          lineTotal:   it.total_price,
        };
      });
      return {
        saleNumber:     r.sale_number,
        soldAt:         r.created_at,
        invoiceId:      r.id,
        invoiceTotal:   r.net_amount,
        lines,
        customerName:   r.customer_name ?? undefined,
        customerPhone:  r.customer_mobile ?? undefined,
        shortfalls:     undefined,
      };
    });
    if (!q) return rows;
    const needle = q.toLowerCase();
    return rows.filter((s) =>
      s.saleNumber.toLowerCase().includes(needle) ||
      (s.customerName ?? '').toLowerCase().includes(needle) ||
      (s.customerPhone ?? '').toLowerCase().includes(needle) ||
      s.lines.some((l) => l.medicineName.toLowerCase().includes(needle)),
    );
  } catch {
    return [];
  }
};

export const dispenseOtcSale = async (
  input: OtcSaleInput,
): Promise<OtcSaleResult> => {
  // Try the real DB path first — OTC is an audit-bearing event that
  // must hit pharmacy_sales for owner reports + cashier shift totals.
  const dbResult = await persistOtcSaleToDb(input);
  if (dbResult) {
    // Mirror mock stock for the in-process inventory feature panels.
    for (const line of input.lines) {
      if (line.quantity > 0) consumeStockFefo(line.medicineId, line.quantity);
    }
    return {
      saleNumber:   dbResult.saleNumber,
      invoiceId:    dbResult.saleId,
      invoiceTotal: dbResult.invoiceTotal,
      shortfalls:   dbResult.shortfalls,
    };
  }

  // Fallback: keep the demo alive when DB write fails.
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
  return {
    saleNumber,
    invoiceId: `inv-otc-${mockOtcSeq}`,
    invoiceTotal: Number(total.toFixed(2)),
    shortfalls: shortfalls.length > 0 ? shortfalls : undefined,
  };
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
  // Mock Rx (id like 'rx-801' or 'rx-OP-XXX') has no DB row to update.
  // Skip the full persistence path; the caller falls back to mock-only.
  if (!RX_UUID_RE.test(input.rxId)) return null;
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
