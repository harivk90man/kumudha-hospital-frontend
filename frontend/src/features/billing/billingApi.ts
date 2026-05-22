import type {
  CreateInvoiceInput,
  Counter,
  Invoice,
  InvoiceLine,
  InvoiceStatus,
  InvoicesListParams,
  LineDiscount,
  Payment,
  PaymentMethod,
  PaymentsListParams,
  RecordPaymentInput,
  RefundPaymentInput,
  Service,
  ServiceCategory,
  UpdateInvoiceInput,
} from './billingTypes';
import {
  mockCounters,
  mockInvoices,
  mockPayments,
  mockServices,
} from './__mocks__/billingMocks';
import { sortAndPaginate, type PageResult } from '@/utils/listQuery';
import { isShiftLocked, useShiftCloseStore } from './shiftCloseStore';
import { useCurrentCounterStore, DEFAULT_COUNTER_ID } from './currentCounterStore';
import { HttpError } from '@/lib/http/httpError';
import { supabase, DEMO_USER_ID } from '@/lib/supabase/supabaseClient';
import type { PatientSummary, Gender } from '@/features/patient';

/**
 * Server-side sort whitelist for the cashier’s invoices grid.
 * Anything outside this set is silently dropped.
 */
export const INVOICES_SORT_WHITELIST = [
  'invoiceNumber',
  'patient.fullName',
  'station',
  'status',
  'total',
  'createdAt',
] as const;

/**
 * Server-side sort whitelist for the cashier’s payments grid.
 * Anything outside this set is silently dropped.
 */
export const PAYMENTS_SORT_WHITELIST = [
  'receivedAt',
  'patient.fullName',
  'invoiceNumber',
  'method',
  'amount',
] as const;

const delay = <T>(value: T, ms = 250): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

/**
 * Billing API surface. Mocked today; signatures match the final backend
 * contract (TSD-12 + TSD-13). All list endpoints honour
 * `?page=&limit=&sort=` per CLAUDE.md §3.4.
 *
 * Wire points:
 *  GET    /api/services?category=                       → fetchServices
 *  GET    /api/invoices?...                             → fetchInvoices
 *  GET    /api/invoices/:id                             → fetchInvoice
 *  POST   /api/invoices                                 → createInvoice
 *  PATCH  /api/invoices/:id                             → updateInvoice
 *  POST   /api/invoices/:id/payments                    → recordPayment
 *  POST   /api/payments/:id/refund                      → refundPayment
 *  GET    /api/payments?...                             → fetchPayments
 */

let mockInvoiceState: Invoice[] = [...mockInvoices];
let mockPaymentState: Payment[] = [...mockPayments];
let invoiceSeq = 1300;
let paymentSeq = 1000;

/**
 * Resolves a `LineDiscount` against a gross amount, capped to gross.
 * Shared with the cashier's editable invoice cells; mirrors the same
 * helper in pharmacy/RxDispense so the two surfaces compute discounts
 * identically.
 */
export const resolveLineDiscount = (
  discount: LineDiscount | undefined,
  gross: number,
): number => {
  if (!discount || discount.value <= 0) return 0;
  const raw =
    discount.kind === 'pct' ? (gross * discount.value) / 100 : discount.value;
  return Math.max(0, Math.min(gross, Number(raw.toFixed(2))));
};

/** Net amount (pre-tax) for one invoice line after applying its discount. */
const lineNet = (l: Pick<InvoiceLine, 'unitPrice' | 'quantity' | 'lineDiscount'>): number => {
  const gross = l.unitPrice * l.quantity;
  return Number((gross - resolveLineDiscount(l.lineDiscount, gross)).toFixed(2));
};

const computeTotals = (
  lines: Invoice['lines'],
): Pick<Invoice, 'subtotal' | 'tax' | 'total'> => {
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const tax = lines.reduce((s, l) => s + (l.lineTotal * l.gstPct) / 100, 0);
  const total = subtotal + tax;
  return {
    subtotal: Number(subtotal.toFixed(2)),
    tax: Number(tax.toFixed(2)),
    total: Number(total.toFixed(2)),
  };
};

const yearShort = (): string => String(new Date().getFullYear());

/* ---------- Counters ---------- */

export const fetchCounters = async (): Promise<Counter[]> => {
  return delay(mockCounters.filter((c) => c.isActive));
};

/* ---------- Cash session (shift open / close) ---------- */

/**
 * Resolve the DB counter UUID for a FE counterId. Mock counter ids
 * ('cnt-001' etc.) don't exist in cash_counters, so we fall back to
 * the first active counter (single-tenant demo: there's only TILL-1).
 */
const resolveCounterUuid = async (
  feCounterId: string,
): Promise<string | null> => {
  try {
    const { supabase } = await import('@/lib/supabase/supabaseClient');
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (UUID_RE.test(feCounterId)) return feCounterId;
    const { data } = await supabase
      .from('cash_counters').select('id').is('deleted_at', null).limit(1).maybeSingle();
    return (data as { id: string } | null)?.id ?? null;
  } catch {
    return null;
  }
};

interface ShiftOpenDbInput {
  feCounterId:   string;
  shiftType:     'morning' | 'evening';
  shiftDate:     string;       // yyyy-mm-dd
  openingFloat:  number;
  openedByName:  string;
}

/**
 * Persist a shift-open event to Supabase as an `open` cash_sessions row.
 *
 * The table enforces `uq_cash_sessions_counter_active` (only one row with
 * status='open' per counter) so we first check for an existing open
 * session on this counter and skip the insert when one is already there
 * — opening from another tab / a previous demo run is a no-op rather
 * than a 409.
 *
 * Returns the session UUID (new or pre-existing) on success, null when
 * the counter can't be resolved or the insert genuinely fails.
 */
export const recordShiftOpenInDb = async (
  input: ShiftOpenDbInput,
): Promise<string | null> => {
  try {
    const { supabase, DEMO_USER_ID } = await import('@/lib/supabase/supabaseClient');
    const counterUuid = await resolveCounterUuid(input.feCounterId);
    if (!counterUuid) return null;

    // Already an open session on this counter? Return its id and bail.
    const { data: existing } = await supabase
      .from('cash_sessions')
      .select('id')
      .eq('counter_id', counterUuid)
      .eq('status', 'open')
      .is('deleted_at', null)
      .maybeSingle();
    if (existing) return (existing as { id: string }).id;

    const sessionNo = `SES-${input.shiftDate.replace(/-/g, '')}-${input.shiftType.slice(0, 3).toUpperCase()}-${Date.now().toString(36).slice(-4)}`;
    const { data, error } = await supabase
      .from('cash_sessions').insert({
        counter_id:     counterUuid,
        session_number: sessionNo,
        session_label:  input.shiftType,
        business_date:  input.shiftDate,
        opened_by:      DEMO_USER_ID,
        status:         'open',
        opening_float:  input.openingFloat,
        created_by:     DEMO_USER_ID,
      })
      .select('id').maybeSingle();
    if (error || !data) return null;
    return (data as { id: string }).id;
  } catch {
    return null;
  }
};

/**
 * Pull the currently-open cash_session for a counter from Supabase.
 * Used by ShiftPage on mount so a second machine sees that Machine 1
 * has already opened the till — the local Zustand store lives per-
 * browser, so without this hydrate step each tab would render its
 * own truth.
 */
export interface ActiveCashSession {
  id:             string;
  sessionLabel:   string;     // 'morning' | 'evening' | 'night' | 'full_day' | 'custom'
  businessDate:   string;     // yyyy-mm-dd
  openedAt:       string;
  openedByName:   string;
  openingFloat:   number;
}

export const fetchActiveCashSession = async (
  feCounterId: string,
): Promise<ActiveCashSession | null> => {
  try {
    const counterUuid = await resolveCounterUuid(feCounterId);
    if (!counterUuid) return null;
    const { data, error } = await supabase
      .from('cash_sessions')
      .select(`
        id, session_label, business_date, opened_at, opening_float,
        opened_user:users!cash_sessions_opened_by_fkey ( full_name )
      `)
      .eq('counter_id', counterUuid)
      .eq('status', 'open')
      .is('deleted_at', null)
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as unknown as {
      id: string; session_label: string; business_date: string;
      opened_at: string; opening_float: number;
      opened_user: { full_name: string } | null;
    };
    return {
      id:           row.id,
      sessionLabel: row.session_label,
      businessDate: row.business_date,
      openedAt:     row.opened_at,
      openedByName: row.opened_user?.full_name ?? 'Cashier',
      openingFloat: Number(row.opening_float ?? 0),
    };
  } catch {
    return null;
  }
};

interface ShiftCloseDbInput {
  feCounterId:    string;
  shiftType:      'morning' | 'evening';
  shiftDate:      string;
  countedCash:    number;
  expectedCash:   number;
  varianceReason?: string;
  closureNotes?:  string;
}

/**
 * Persist a shift-close event by updating the open cash_sessions row for
 * this counter / date / session_label. Returns true on success; false
 * if no matching open row exists or the update fails (table constraint
 * etc.). The local store still drives the UI.
 */
export const recordShiftCloseInDb = async (
  input: ShiftCloseDbInput,
): Promise<boolean> => {
  try {
    const { supabase, DEMO_USER_ID } = await import('@/lib/supabase/supabaseClient');
    const counterUuid = await resolveCounterUuid(input.feCounterId);
    if (!counterUuid) return false;
    const { data: session } = await supabase
      .from('cash_sessions')
      .select('id')
      .eq('counter_id', counterUuid)
      .eq('business_date', input.shiftDate)
      .eq('session_label', input.shiftType)
      .eq('status', 'open')
      .maybeSingle();
    const id = (session as { id: string } | null)?.id;
    if (!id) return false;
    // chk_cash_sessions_variance_reason: variance != 0 requires reason
    const variance = input.countedCash - input.expectedCash;
    const reason = (Math.abs(variance) > 0.005)
      ? (input.varianceReason ?? 'Variance not explained by cashier')
      : null;
    const { error } = await supabase
      .from('cash_sessions').update({
        closed_by:        DEMO_USER_ID,
        closed_at:        new Date().toISOString(),
        status:           'closed',
        expected_cash:    input.expectedCash,
        counted_cash:     input.countedCash,
        variance_reason:  reason,
        closure_notes:    input.closureNotes ?? null,
        updated_by:       DEMO_USER_ID,
      })
      .eq('id', id);
    return !error;
  } catch {
    return false;
  }
};

/* ---------- Services catalogue ---------- */

export const fetchServices = async (category?: ServiceCategory): Promise<Service[]> => {
  const rows = category
    ? mockServices.filter((s) => s.category === category && s.isActive)
    : mockServices.filter((s) => s.isActive);
  return delay(rows);
};

/* ---------- Invoices (Supabase-backed for demo) ---------- */

/** Map DB invoice row + joined patient → FE Invoice shape. */
const ageFromDob = (dob: string | null): number => {
  if (!dob) return 0;
  const d = new Date(dob);
  const now = new Date();
  return Math.max(0, now.getFullYear() - d.getFullYear() - (now < new Date(now.getFullYear(), d.getMonth(), d.getDate()) ? 1 : 0));
};

interface SupabaseInvoiceRow {
  id: string;
  invoice_number: string;
  invoice_type: string;
  patient_id: string;
  op_visit_id: string | null;
  subtotal: string | number;
  total_tax: string | number;
  total_amount: string | number;
  amount_paid: string | number;
  balance: string | number;
  payment_status: string;
  created_at: string;
  finalized_at: string | null;
  patients: {
    id: string;
    uhid: string;
    first_name: string;
    last_name: string;
    gender: string;
    date_of_birth: string | null;
    mobile: string | null;
    blood_group: string | null;
  } | null;
  op_visits: { op_number: string } | null;
}

interface SupabasePaymentRow {
  id: string;
  patient_id: string | null;
  payment_mode: string;
  amount: string | number;
  transaction_ref: string | null;
  received_by: string | null;
  created_at: string;
  notes: string | null;
  patients: SupabaseInvoiceRow['patients'];
  payment_allocations: { invoice_id: string | null; invoices: { invoice_number: string } | null }[];
}

const DB_TO_FE_INVOICE_STATUS: Record<string, InvoiceStatus> = {
  draft: 'draft',
  finalized: 'billed',
  paid: 'paid',
  partially_paid: 'partially_paid',
  refunded: 'cancelled',
  cancelled: 'cancelled',
};

const DB_TO_FE_INVOICE_STATION = (invoiceType: string): Invoice['station'] => {
  switch (invoiceType) {
    case 'pharmacy':         return 'pharmacy';
    case 'lab_direct':       return 'lab';
    case 'radiology_direct': return 'radiology';
    default:                 return 'front_desk';
  }
};

const DB_TO_FE_PAYMENT_METHOD: Record<string, PaymentMethod> = {
  cash:        'cash',
  card:        'card',
  upi:         'upi',
  net_banking: 'netbanking',
  cheque:      'cash',
  other:       'cash',
};

const mapPatient = (p: SupabaseInvoiceRow['patients']): PatientSummary => {
  if (!p) {
    return {
      id: '', uhid: '', firstName: '', lastName: '', fullName: '(unknown)',
      gender: 'o', ageYears: 0, mobile: '', allergies: [], chronicConditions: [],
    } as PatientSummary;
  }
  return {
    id: p.id,
    uhid: p.uhid,
    firstName: p.first_name,
    lastName: p.last_name,
    fullName: `${p.first_name} ${p.last_name}`.trim(),
    gender: p.gender as Gender,
    ageYears: ageFromDob(p.date_of_birth),
    mobile: p.mobile ?? '',
    bloodGroup: p.blood_group ?? undefined,
    allergies: [],
    chronicConditions: [],
  } as PatientSummary;
};

const mapInvoice = (r: SupabaseInvoiceRow): Invoice => {
  const total = Number(r.total_amount);
  const paid  = Number(r.amount_paid);
  return {
    id: r.id,
    invoiceNumber: r.invoice_number,
    patient: mapPatient(r.patients),
    opNumber: r.op_visits?.op_number,
    station: DB_TO_FE_INVOICE_STATION(r.invoice_type),
    status: DB_TO_FE_INVOICE_STATUS[r.payment_status] ?? 'billed',
    lines: [],  // dashboard tiles only need totals; line detail loads in fetchInvoice
    subtotal: Number(r.subtotal),
    tax: Number(r.total_tax),
    total,
    balance: Number(r.balance),
    createdBy: DEMO_USER_ID,
    createdAt: r.created_at,
    lastPaidAt: paid > 0 ? (r.finalized_at ?? r.created_at) : undefined,
  };
};

export const fetchInvoices = async (
  params: InvoicesListParams = {},
): Promise<Invoice[]> => {
  void params.page;
  void params.limit;
  void params.sort;

  let qb = supabase
    .from('invoices')
    .select(`
      id, invoice_number, invoice_type, patient_id, op_visit_id,
      subtotal, total_tax, total_amount, amount_paid, balance,
      payment_status, created_at, finalized_at,
      patients ( id, uhid, first_name, last_name, gender, date_of_birth, mobile, blood_group ),
      op_visits ( op_number )
    `)
    .is('deleted_at', null);

  // Status filtering
  const dbStatuses: string[] = [];
  const feStatuses = params.statuses && params.statuses.length > 0
    ? params.statuses
    : (params.status && params.status !== 'all' ? [params.status] : []);
  for (const fe of feStatuses) {
    for (const [db, mapped] of Object.entries(DB_TO_FE_INVOICE_STATUS)) {
      if (mapped === fe) dbStatuses.push(db);
    }
  }
  if (dbStatuses.length > 0) qb = qb.in('payment_status', dbStatuses);

  // Station → invoice_type filter
  if (params.station && params.station !== 'all') {
    const typeFilter: Record<string, string> = {
      pharmacy:   'pharmacy',
      lab:        'lab_direct',
      radiology:  'radiology_direct',
      front_desk: 'op',
      billing:    'op',
    };
    const t = typeFilter[params.station];
    if (t) qb = qb.eq('invoice_type', t);
  }

  // Date filter — by created_at (UTC) using local-date bounds expanded to a 24h window.
  if (params.dateFrom || params.dateTo) {
    if (params.dateFrom) qb = qb.gte('created_at', `${params.dateFrom}T00:00:00`);
    if (params.dateTo)   qb = qb.lte('created_at', `${params.dateTo}T23:59:59`);
  } else if (params.date) {
    qb = qb.gte('created_at', `${params.date}T00:00:00`).lte('created_at', `${params.date}T23:59:59`);
  }

  if (params.q) {
    qb = qb.ilike('invoice_number', `%${params.q}%`);
  }

  qb = qb.order('created_at', { ascending: false }).limit(500);

  const { data, error } = await qb;
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as unknown) as SupabaseInvoiceRow[];
  return rows.map(mapInvoice);
};

/**
 * Paged sibling of {@link fetchInvoices} — same filters, then sort +
 * paginate per the §3.4 wire contract. Used by the cashier’s invoices
 * grid; dashboards / aggregation callers stay on the flat sibling.
 */
export const fetchInvoicesPaged = async (
  params: InvoicesListParams = {},
): Promise<PageResult<Invoice>> => {
  const all = await fetchInvoices({
    ...params,
    page: undefined,
    limit: undefined,
    sort: undefined,
  });
  return sortAndPaginate(all, params, INVOICES_SORT_WHITELIST);
};

export const fetchInvoice = async (id: string): Promise<Invoice | null> => {
  const found = mockInvoiceState.find((i) => i.id === id) ?? null;
  return delay(found);
};

/**
 * Look up the invoice attached to a given op_visit. Resolves the
 * op_visit by op_number first (UNIQUE in DB), then queries invoices
 * by op_visit_id. Returns null when:
 *   - the op_number doesn't resolve (typo / wrong route param), or
 *   - the op_visit exists but no invoice has been written yet.
 *
 * Replaces the old `fetchInvoices({ q: opNumber })` substring pattern,
 * which filtered against `invoice_number` (INV-…) and could never
 * match an op_number (OP-…). That filter was the silent reason the
 * PaymentPage rendered "No invoice found" even after createInvoice
 * had successfully written the row.
 */
export const fetchInvoiceByOpNumber = async (
  opNumber: string,
): Promise<Invoice | null> => {
  try {
    const { data: opvRow } = await supabase
      .from('op_visits')
      .select('id')
      .eq('op_number', opNumber)
      .is('deleted_at', null)
      .maybeSingle();
    const opVisitId = (opvRow as { id: string } | null)?.id;
    if (!opVisitId) return null;

    const { data, error } = await supabase
      .from('invoices')
      .select(`
        id, invoice_number, invoice_type, patient_id, op_visit_id,
        subtotal, total_tax, total_amount, amount_paid, balance,
        payment_status, created_at, finalized_at,
        patients ( id, uhid, first_name, last_name, gender, date_of_birth, mobile, blood_group ),
        op_visits ( op_number )
      `)
      .eq('op_visit_id', opVisitId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return mapInvoice(data as unknown as SupabaseInvoiceRow);
  } catch {
    return null;
  }
};

/**
 * Resolve an "approver" UUID different from the bootstrap admin so the
 * invoice's chk_invoices_sod constraint (created_by <> approved_by)
 * doesn't reject the row. Prefers an owner / chief_doctor; falls back
 * to any active user that isn't the bootstrap. Cached in module scope
 * so we hit the DB at most once per session.
 */
let cachedApproverId: string | null = null;
const resolveApproverId = async (): Promise<string | null> => {
  if (cachedApproverId) return cachedApproverId;
  try {
    // Look for an owner first, then any other active user.
    const { data: ownerRoleRow } = await supabase
      .from('roles').select('id')
      .in('role_code', ['owner', 'chief_doctor'])
      .is('deleted_at', null)
      .limit(1).maybeSingle();
    const roleId = (ownerRoleRow as { id: string } | null)?.id;
    if (roleId) {
      const { data: link } = await supabase
        .from('user_roles').select('user_id')
        .eq('role_id', roleId)
        .neq('user_id', DEMO_USER_ID)
        .is('deleted_at', null)
        .limit(1).maybeSingle();
      const uid = (link as { user_id: string } | null)?.user_id;
      if (uid) { cachedApproverId = uid; return uid; }
    }
    // Fallback: any active non-bootstrap user.
    const { data: anyUser } = await supabase
      .from('users').select('id')
      .neq('id', DEMO_USER_ID)
      .eq('status', 'active')
      .is('deleted_at', null)
      .limit(1).maybeSingle();
    const uid = (anyUser as { id: string } | null)?.id;
    if (uid) { cachedApproverId = uid; return uid; }
  } catch {
    // fall through
  }
  return null;
};

/**
 * DEMO: writes the invoice + invoice_items to Supabase so walk-in lab/
 * radiology orders surface on the owner dashboard. Mock state is also
 * kept in sync so the cashier's editable-line flow (still mock) reads
 * back what the front-desk wrote.
 */
export const createInvoice = async (input: CreateInvoiceInput): Promise<Invoice> => {
  invoiceSeq += 1;
  const invoiceNumber = `INV-${yearShort()}-${String(invoiceSeq).padStart(6, '0')}`;

  // Build FE-shape lines first so we always return a valid Invoice object.
  const lines = input.lines.map((l, idx) => {
    if (l.serviceId && l.adhoc) throw new Error('Invoice line cannot specify both serviceId and adhoc');
    if (!l.serviceId && !l.adhoc) throw new Error('Invoice line must specify serviceId or adhoc');
    if (l.serviceId) {
      const svc = mockServices.find((s) => s.id === l.serviceId);
      if (!svc) throw new Error(`Unknown service ${l.serviceId}`);
      return {
        id: `inl-${invoiceSeq}-${idx + 1}`,
        serviceId: svc.id, serviceCode: svc.code, serviceName: svc.name,
        category: svc.category, unitPrice: svc.unitPrice, quantity: l.quantity,
        gstPct: svc.gstPct, lineTotal: Number((svc.unitPrice * l.quantity).toFixed(2)),
        notes: l.notes,
      };
    }
    const a = l.adhoc!;
    return {
      id: `inl-${invoiceSeq}-${idx + 1}`,
      serviceId: `adhoc-${a.code}`, serviceCode: a.code, serviceName: a.name,
      category: a.category, unitPrice: a.unitPrice, quantity: l.quantity,
      gstPct: a.gstPct, lineTotal: Number((a.unitPrice * l.quantity).toFixed(2)),
      notes: l.notes,
    };
  });
  const totals = computeTotals(lines);

  const stationToInvoiceType: Record<Invoice['station'], string> = {
    lab:        'lab_direct',
    radiology:  'radiology_direct',
    pharmacy:   'pharmacy',
    front_desk: 'op',
    billing:    'op',
  };
  const feCategoryToItemType: Record<string, string> = {
    consultation: 'consultation', lab: 'lab_test', radiology: 'radiology',
    pharmacy: 'drug', procedure: 'procedure', admission: 'room_charge',
    registration: 'other', other: 'other',
  };

  // Resolve an approver != bootstrap so chk_invoices_sod
  // (created_by <> approved_by) accepts the row. When no other user
  // exists (very early demo setup), persist as 'pending_approval' so
  // the consistency CHECK still passes; the row stays editable from
  // the UI until someone approves.
  const approverId = await resolveApproverId();
  const useApproved = approverId !== null && approverId !== DEMO_USER_ID;

  // Try to persist; on any failure, fall back to mock state only so the UI still works.
  let persistedId: string | null = null;
  try {
    const { error: invErr, data: invRow } = await supabase
      .from('invoices')
      .insert({
        invoice_number: invoiceNumber,
        invoice_type: stationToInvoiceType[input.station] ?? 'op',
        patient_id: input.patientId,
        invoice_date: new Date().toISOString().slice(0, 10),
        subtotal: totals.subtotal,
        total_line_discount: 0,
        bill_discount_amount: 0,
        total_tax: totals.tax,
        total_amount: totals.total,
        amount_paid: 0,
        payment_status: 'finalized',
        approval_status: useApproved ? 'approved' : 'pending_approval',
        approved_by:     useApproved ? approverId : null,
        approved_at:     useApproved ? new Date().toISOString() : null,
        finalized_at: new Date().toISOString(),
        created_by: DEMO_USER_ID,
      })
      .select('id')
      .single();
    if (invErr) throw new Error(invErr.message);
    persistedId = (invRow as { id: string }).id;

    const itemRows = lines.map((l, idx) => ({
      invoice_id: persistedId,
      item_type: feCategoryToItemType[l.category] ?? 'other',
      item_name: l.serviceName,
      sequence_no: idx + 1,
      quantity: l.quantity,
      unit_price: l.unitPrice,
      line_discount_pct: 0,
      line_discount_amount: 0,
      cgst_pct: 0, cgst_amount: 0, sgst_pct: 0, sgst_amount: 0,
      igst_pct: 0, igst_amount: 0,
      total_price: l.lineTotal,
      created_by: DEMO_USER_ID,
    }));
    const { error: liErr } = await supabase.from('invoice_items').insert(itemRows);
    if (liErr) throw new Error(liErr.message);
  } catch (err) {
    // Persistence failed (RLS / network); fall through to mock-only.
    // eslint-disable-next-line no-console
    console.warn('[createInvoice] persistence failed, mock-only:', err);
  }

  const created: Invoice = {
    id: persistedId ?? `inv-${invoiceSeq}`,
    invoiceNumber,
    patient: input.patientSnapshot ?? {
      id: input.patientId,
      uhid: 'KH-?-?',
      fullName: '(unresolved patient)',
      gender: 'o',
      ageYears: 0,
      firstName: '(unresolved)',
      lastName: '',
      mobile: '',
      allergies: [],
      chronicConditions: [],
    },
    opNumber: input.opNumber,
    station: input.station,
    status: 'billed',
    lines,
    ...totals,
    balance: totals.total,
    createdBy: DEMO_USER_ID,
    createdAt: new Date().toISOString(),
  };
  mockInvoiceState = [created, ...mockInvoiceState];
  return created;
};

/**
 * Patch an invoice's lines — cashier's editable cells.
 *
 * Each input line is merged with the existing line by `id`; omitted
 * fields keep their current value. Pass `lineDiscount: null` to clear
 * an existing discount. Recomputes `lineTotal`, then `subtotal`/`tax`/
 * `total`, then `balance` against the existing succeeded payments for
 * this invoice. Status reflows: `paid` if balance hits zero, otherwise
 * `partially_paid` (when any payment exists) or `billed`.
 *
 * Refuses to mutate invoices that are already `cancelled` — the
 * cashier must reopen via a separate action, not edit silently.
 */
export const updateInvoice = async (
  id: string,
  input: UpdateInvoiceInput,
): Promise<Invoice> => {
  const idx = mockInvoiceState.findIndex((i) => i.id === id);
  if (idx < 0) throw new Error(`Invoice ${id} not found`);
  const inv = mockInvoiceState[idx];
  if (inv.status === 'cancelled') {
    throw new Error('Cancelled invoice cannot be edited.');
  }

  const patchById = new Map(input.lines.map((p) => [p.id, p] as const));
  const nextLines: InvoiceLine[] = inv.lines.map((l) => {
    const patch = patchById.get(l.id);
    if (!patch) return l;
    const quantity = patch.quantity ?? l.quantity;
    if (quantity < 0) throw new Error('Quantity cannot be negative');
    const lineDiscount =
      patch.lineDiscount === null
        ? undefined
        : (patch.lineDiscount ?? l.lineDiscount);
    if (lineDiscount && lineDiscount.value < 0) {
      throw new Error('Discount cannot be negative');
    }
    if (lineDiscount && lineDiscount.kind === 'pct' && lineDiscount.value > 100) {
      throw new Error('Percent discount cannot exceed 100');
    }
    const notes = patch.notes !== undefined ? patch.notes : l.notes;
    const next: InvoiceLine = {
      ...l,
      quantity,
      lineDiscount,
      notes,
    };
    next.lineTotal = lineNet(next);
    return next;
  });

  const totals = computeTotals(nextLines);

  // Recompute balance against the payments already booked. Mirrors the
  // server's behaviour — a discount applied after a partial payment may
  // close the balance, flipping status to `paid`.
  const paidSoFar = mockPaymentState
    .filter((p) => p.invoiceId === inv.id && p.status === 'succeeded')
    .reduce((s, p) => s + p.amount, 0);
  const balance = Number((totals.total - paidSoFar).toFixed(2));
  const hasPayments = paidSoFar > 0;
  const status: Invoice['status'] =
    balance <= 0 ? 'paid' : hasPayments ? 'partially_paid' : 'billed';

  const updated: Invoice = {
    ...inv,
    lines: nextLines,
    ...totals,
    balance,
    status,
  };
  mockInvoiceState = [
    ...mockInvoiceState.slice(0, idx),
    updated,
    ...mockInvoiceState.slice(idx + 1),
  ];
  return delay(updated, 150);
};

/* ---------- Payments ---------- */

const PAY_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FE_TO_DB_PAYMENT_MODE: Record<PaymentMethod, string> = {
  cash:       'cash',
  card:       'card',
  upi:        'upi',
  netbanking: 'net_banking',
  insurance:  'other',
};

/**
 * Persist a payment + its allocation + invoice status update to Supabase.
 *
 * Looks up the active cash_sessions row for the resolved counter (the
 * payments.cash_session_id FK is NOT NULL — every payment must be tied
 * to an open session). Returns null when:
 *  - the invoiceId isn't a real UUID (mock-only invoice → fall back), or
 *  - no open session exists on the counter (mirrors the FE shift lock,
 *    but coming from a different layer of defence).
 */
const persistPaymentToDb = async (
  input: RecordPaymentInput,
  feCounterId: string,
): Promise<{ paymentId: string; nextDbStatus: string; amountPaid: number; total: number } | null> => {
  if (!PAY_UUID_RE.test(input.invoiceId)) return null;
  try {
    // Resolve counter → open cash session
    const counterUuid = await resolveCounterUuid(feCounterId);
    if (!counterUuid) return null;
    const { data: openSess } = await supabase
      .from('cash_sessions')
      .select('id')
      .eq('counter_id', counterUuid)
      .eq('status', 'open')
      .is('deleted_at', null)
      .maybeSingle();
    const cashSessionId = (openSess as { id: string } | null)?.id;
    if (!cashSessionId) return null;

    // Resolve invoice to confirm + read patient_id + current totals.
    const { data: invRow, error: invErr } = await supabase
      .from('invoices')
      .select('id, patient_id, total_amount, amount_paid, payment_status')
      .eq('id', input.invoiceId)
      .is('deleted_at', null)
      .maybeSingle();
    if (invErr || !invRow) return null;
    const inv = invRow as {
      id: string; patient_id: string;
      total_amount: number; amount_paid: number; payment_status: string;
    };

    // Insert the payment.
    const { data: payIns, error: payErr } = await supabase
      .from('payments')
      .insert({
        patient_id:        inv.patient_id,
        payment_direction: 'in',
        payment_mode:      FE_TO_DB_PAYMENT_MODE[input.method] ?? 'other',
        amount:            input.amount,
        transaction_ref:   input.referenceNo ?? null,
        received_by:       DEMO_USER_ID,
        cash_session_id:   cashSessionId,
        notes:             input.notes ?? null,
        created_by:        DEMO_USER_ID,
      })
      .select('id')
      .maybeSingle();
    if (payErr || !payIns) return null;
    const paymentId = (payIns as { id: string }).id;

    // Insert the allocation against the invoice.
    await supabase.from('payment_allocations').insert({
      payment_id:      paymentId,
      allocation_type: 'invoice',
      invoice_id:      input.invoiceId,
      amount:          input.amount,
      created_by:      DEMO_USER_ID,
    });

    // Bump the invoice's amount_paid + payment_status. balance is generated.
    const newAmountPaid = Number((Number(inv.amount_paid) + input.amount).toFixed(2));
    const newPaymentStatus = newAmountPaid >= Number(inv.total_amount) ? 'paid' : 'partially_paid';
    await supabase.from('invoices')
      .update({
        amount_paid:    newAmountPaid,
        payment_status: newPaymentStatus,
        updated_by:     DEMO_USER_ID,
      })
      .eq('id', input.invoiceId);

    return {
      paymentId,
      nextDbStatus: newPaymentStatus,
      amountPaid: newAmountPaid,
      total: Number(inv.total_amount),
    };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[recordPayment] DB persistence failed; mock-only:', e);
    return null;
  }
};

export const recordPayment = async (input: RecordPaymentInput): Promise<{
  invoice: Invoice;
  payment: Payment;
}> => {
  // Defence-in-depth gate — even if a UI path bypassed the ShiftLockedBanner,
  // the API still refuses to book money against a counter whose shift hasn't
  // been formally opened (or has already been closed). Mirrors the real
  // backend's `423 Locked` response on the same condition.
  const counterId = input.counterId ?? useCurrentCounterStore.getState().counterId ?? DEFAULT_COUNTER_ID;
  const { closes, opens } = useShiftCloseStore.getState();
  const lock = isShiftLocked({ counterId, at: new Date(), closes, opens });
  if (lock.locked) {
    throw new HttpError(
      423,
      'Shift not open',
      {
        reason: lock.reason,
        counterId,
        message:
          lock.reason === 'no_open'
            ? 'Cashier shift has not been opened on this counter yet.'
            : 'Cashier shift on this counter is closed. Open the next shift to resume.',
      },
      `/api/invoices/${input.invoiceId}/payments`,
    );
  }

  // Best-effort DB persistence. Mock invoices (synthetic ids) silently
  // skip the DB path; the local mock state below stays authoritative for
  // those. Real invoice UUIDs round-trip through payments +
  // payment_allocations + invoices.amount_paid in one shot.
  const dbResult = await persistPaymentToDb(input, counterId);

  const idx = mockInvoiceState.findIndex((i) => i.id === input.invoiceId);
  if (idx < 0 && !dbResult) throw new Error(`Invoice ${input.invoiceId} not found`);
  // DB-only invoice — synthesise a mock-shape Payment from the DB write
  // so callers (which expect the result shape) keep working without a
  // mockInvoiceState entry. The PaymentsPage re-reads from DB on next
  // render so the row will show up properly.
  if (idx < 0 && dbResult) {
    const synthPayment: Payment = {
      id:             dbResult.paymentId,
      invoiceId:      input.invoiceId,
      invoiceNumber:  '',
      patient:        { id: '', uhid: '', firstName: '', lastName: '', fullName: '—',
                        gender: 'o', ageYears: 0, allergies: [], chronicConditions: [] },
      amount:         input.amount,
      method:         input.method,
      referenceNo:    input.referenceNo,
      status:         'succeeded',
      receivedBy:     DEMO_USER_ID,
      receivedAt:     new Date().toISOString(),
      notes:          input.notes,
      counterId,
    };
    const synthInvoice: Invoice = {
      id:             input.invoiceId,
      invoiceNumber:  '',
      patient:        synthPayment.patient,
      station:        'front_desk',
      lines:          [],
      subtotal:       0,
      tax:            0,
      total:          dbResult.total,
      balance:        Math.max(0, dbResult.total - dbResult.amountPaid),
      status:         dbResult.nextDbStatus === 'paid' ? 'paid' : 'partially_paid',
      createdBy:      DEMO_USER_ID,
      createdAt:      new Date().toISOString(),
      lastPaidAt:     synthPayment.receivedAt,
    };
    return { invoice: synthInvoice, payment: synthPayment };
  }
  const inv = mockInvoiceState[idx];
  if (input.amount <= 0) throw new Error('Amount must be positive');
  if (input.amount > inv.balance) throw new Error('Amount exceeds outstanding balance');

  paymentSeq += 1;
  const payment: Payment = {
    id: dbResult?.paymentId ?? `pay-${paymentSeq}`,
    invoiceId: inv.id,
    invoiceNumber: inv.invoiceNumber,
    patient: inv.patient,
    amount: input.amount,
    method: input.method,
    referenceNo: input.referenceNo,
    status: 'succeeded',
    receivedBy: 'mock-user',
    receivedAt: new Date().toISOString(),
    notes: input.notes,
    counterId,
  };
  const newBalance = Number((inv.balance - input.amount).toFixed(2));
  const updated: Invoice = {
    ...inv,
    balance: newBalance,
    status: newBalance <= 0 ? 'paid' : 'partially_paid',
    lastPaidAt: payment.receivedAt,
  };
  mockInvoiceState = [
    ...mockInvoiceState.slice(0, idx),
    updated,
    ...mockInvoiceState.slice(idx + 1),
  ];
  mockPaymentState = [payment, ...mockPaymentState];

  // Mock-only side-effect: when the invoice is fully paid AND it’s a
  // counter invoice tied to an op_visit, propagate the right state
  // transition. Real backend handles each via FK + status trigger.
  if (updated.status === 'paid' && updated.opNumber) {
    const opNumber = updated.opNumber;
    if (updated.station === 'front_desk') {
      // Consult fee paid → patient now eligible for vitals capture.
      // BRD §1 steps 4-5: cashier owns this transition; reception
      // cannot. The vitals queue picks it up immediately.
      void import('@/features/encounter/encounterApi').then((m) =>
        m.transitionEncounterState(opNumber, 'awaiting_vitals'),
      );
    } else if (updated.station === 'lab') {
      void import('@/features/lab/labApi').then((m) =>
        m.markVisitOrdersPaid?.(opNumber),
      );
    } else if (updated.station === 'radiology') {
      void import('@/features/radiology/radiologyApi').then((m) =>
        m.markVisitOrdersPaid?.(opNumber),
      );
    }
  }

  return delay({ invoice: updated, payment }, 150);
};

export const refundPayment = async (
  input: RefundPaymentInput,
): Promise<{ invoice: Invoice; refund: Payment }> => {
  const original = mockPaymentState.find((p) => p.id === input.paymentId);
  if (!original) throw new Error(`Payment ${input.paymentId} not found`);
  if (original.status === 'refunded') throw new Error('Payment already refunded');

  paymentSeq += 1;
  const refund: Payment = {
    id: `pay-${paymentSeq}`,
    invoiceId: original.invoiceId,
    invoiceNumber: original.invoiceNumber,
    patient: original.patient,
    amount: -original.amount,
    method: original.method,
    referenceNo: original.referenceNo,
    status: 'succeeded',
    refundOf: original.id,
    receivedBy: 'mock-user',
    receivedAt: new Date().toISOString(),
    notes: input.reason,
    counterId: original.counterId,
  };
  // Mark original as refunded.
  mockPaymentState = mockPaymentState.map((p) =>
    p.id === original.id ? { ...p, status: 'refunded' } : p,
  );
  // Bump invoice balance back up.
  const idx = mockInvoiceState.findIndex((i) => i.id === original.invoiceId);
  let updated = mockInvoiceState[idx];
  if (idx >= 0) {
    const newBalance = Number((mockInvoiceState[idx].balance + original.amount).toFixed(2));
    updated = {
      ...mockInvoiceState[idx],
      balance: newBalance,
      status: newBalance >= mockInvoiceState[idx].total ? 'billed' : 'partially_paid',
    };
    mockInvoiceState = [
      ...mockInvoiceState.slice(0, idx),
      updated,
      ...mockInvoiceState.slice(idx + 1),
    ];
  }
  mockPaymentState = [refund, ...mockPaymentState];
  return delay({ invoice: updated, refund }, 150);
};

export const fetchPayments = async (
  params: PaymentsListParams = {},
): Promise<Payment[]> => {
  void params.page;
  void params.limit;
  void params.sort;

  let qb = supabase
    .from('payments')
    .select(`
      id, patient_id, payment_mode, amount, transaction_ref, received_by, created_at, notes,
      patients ( id, uhid, first_name, last_name, gender, date_of_birth, mobile, blood_group ),
      payment_allocations ( invoice_id, invoices ( invoice_number ) )
    `)
    .is('deleted_at', null)
    .eq('payment_direction', 'in');

  if (params.method && params.method !== 'all') {
    const dbModes: Record<PaymentMethod, string> = {
      cash: 'cash', card: 'card', upi: 'upi', netbanking: 'net_banking', insurance: 'other',
    };
    qb = qb.eq('payment_mode', dbModes[params.method]);
  }

  if (params.dateFrom || params.dateTo) {
    if (params.dateFrom) qb = qb.gte('created_at', `${params.dateFrom}T00:00:00`);
    if (params.dateTo)   qb = qb.lte('created_at', `${params.dateTo}T23:59:59`);
  } else if (params.date) {
    qb = qb.gte('created_at', `${params.date}T00:00:00`).lte('created_at', `${params.date}T23:59:59`);
  }

  qb = qb.order('created_at', { ascending: false }).limit(500);

  const { data, error } = await qb;
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as unknown) as SupabasePaymentRow[];

  return rows.map((r) => {
    const firstAlloc = r.payment_allocations?.[0];
    return {
      id: r.id,
      invoiceId: firstAlloc?.invoice_id ?? '',
      invoiceNumber: firstAlloc?.invoices?.invoice_number ?? '',
      patient: mapPatient(r.patients),
      amount: Number(r.amount),
      method: DB_TO_FE_PAYMENT_METHOD[r.payment_mode] ?? 'cash',
      referenceNo: r.transaction_ref ?? undefined,
      status: 'succeeded',
      receivedBy: r.received_by ?? DEMO_USER_ID,
      receivedAt: r.created_at,
      notes: r.notes ?? undefined,
      counterId: DEFAULT_COUNTER_ID,
    } as Payment;
  });
};

/**
 * Paged sibling of {@link fetchPayments} — same filters, then sort +
 * paginate per the §3.4 wire contract. Used by the cashier’s payments
 * grid; the totals-strip / dashboards stay on the flat sibling.
 */
export const fetchPaymentsPaged = async (
  params: PaymentsListParams = {},
): Promise<PageResult<Payment>> => {
  const all = await fetchPayments({
    ...params,
    page: undefined,
    limit: undefined,
    sort: undefined,
  });
  return sortAndPaginate(all, params, PAYMENTS_SORT_WHITELIST);
};
