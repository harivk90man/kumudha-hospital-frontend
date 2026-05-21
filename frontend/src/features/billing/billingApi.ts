import type {
  CreateInvoiceInput,
  Counter,
  Invoice,
  InvoiceLine,
  InvoicesListParams,
  LineDiscount,
  Payment,
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
import { isoDate } from '@/utils/dateRange';
import { sortAndPaginate, type PageResult } from '@/utils/listQuery';
import { isShiftLocked, useShiftCloseStore } from './shiftCloseStore';
import { useCurrentCounterStore, DEFAULT_COUNTER_ID } from './currentCounterStore';
import { HttpError } from '@/lib/http/httpError';

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

/* ---------- Services catalogue ---------- */

export const fetchServices = async (category?: ServiceCategory): Promise<Service[]> => {
  const rows = category
    ? mockServices.filter((s) => s.category === category && s.isActive)
    : mockServices.filter((s) => s.isActive);
  return delay(rows);
};

/* ---------- Invoices ---------- */

export const fetchInvoices = async (
  params: InvoicesListParams = {},
): Promise<Invoice[]> => {
  void params.page;
  void params.limit;
  void params.sort;
  let rows = mockInvoiceState;
  if (params.statuses && params.statuses.length > 0) {
    const set = new Set(params.statuses);
    rows = rows.filter((r) => set.has(r.status));
  } else if (params.status && params.status !== 'all') {
    rows = rows.filter((r) => r.status === params.status);
  }
  if (params.station && params.station !== 'all') {
    rows = rows.filter((r) => r.station === params.station);
  }
  if (params.dateFrom || params.dateTo) {
    // Range query takes precedence — used by the owner dashboard
    // when a preset (week / month / quarter / year / custom) is
    // active. Both bounds inclusive, local calendar dates.
    const from = params.dateFrom;
    const to = params.dateTo;
    rows = rows.filter((r) => {
      const d = isoDate(new Date(r.createdAt));
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  } else if (params.date) {
    // Compare LOCAL calendar dates so the cashier’s "today" matches the
    // front-desk’s "today" even when the user crosses UTC midnight (5:30 AM
    // IST). Both sides resolve to the same local YYYY-MM-DD.
    const target = params.date;
    rows = rows.filter((r) => isoDate(new Date(r.createdAt)) === target);
  }
  if (params.q) {
    const q = params.q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.invoiceNumber.toLowerCase().includes(q) ||
        r.patient.fullName.toLowerCase().includes(q) ||
        r.patient.uhid.toLowerCase().includes(q) ||
        (r.opNumber ?? '').toLowerCase().includes(q),
    );
  }
  return delay(rows);
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

export const createInvoice = async (input: CreateInvoiceInput): Promise<Invoice> => {
  invoiceSeq += 1;
  const invoiceNumber = `INV-${yearShort()}-${String(invoiceSeq).padStart(6, '0')}`;
  const lines = input.lines.map((l, idx) => {
    // Two paths: services_catalog lookup OR ad-hoc walk-in line.
    // Exactly one of `serviceId` / `adhoc` must be set.
    if (l.serviceId && l.adhoc) {
      throw new Error('Invoice line cannot specify both serviceId and adhoc');
    }
    if (!l.serviceId && !l.adhoc) {
      throw new Error('Invoice line must specify serviceId or adhoc');
    }
    if (l.serviceId) {
      const svc = mockServices.find((s) => s.id === l.serviceId);
      if (!svc) throw new Error(`Unknown service ${l.serviceId}`);
      return {
        id: `inl-${invoiceSeq}-${idx + 1}`,
        serviceId: svc.id,
        serviceCode: svc.code,
        serviceName: svc.name,
        category: svc.category,
        unitPrice: svc.unitPrice,
        quantity: l.quantity,
        gstPct: svc.gstPct,
        lineTotal: Number((svc.unitPrice * l.quantity).toFixed(2)),
        notes: l.notes,
      };
    }
    // Ad-hoc walk-in line.
    const a = l.adhoc!;
    return {
      id: `inl-${invoiceSeq}-${idx + 1}`,
      serviceId: `adhoc-${a.code}`,
      serviceCode: a.code,
      serviceName: a.name,
      category: a.category,
      unitPrice: a.unitPrice,
      quantity: l.quantity,
      gstPct: a.gstPct,
      lineTotal: Number((a.unitPrice * l.quantity).toFixed(2)),
      notes: l.notes,
    };
  });
  const totals = computeTotals(lines);
  const created: Invoice = {
    id: `inv-${invoiceSeq}`,
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
    createdBy: 'mock-user',
    createdAt: new Date().toISOString(),
  };
  mockInvoiceState = [created, ...mockInvoiceState];
  return delay(created, 200);
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

  const idx = mockInvoiceState.findIndex((i) => i.id === input.invoiceId);
  if (idx < 0) throw new Error(`Invoice ${input.invoiceId} not found`);
  const inv = mockInvoiceState[idx];
  if (input.amount <= 0) throw new Error('Amount must be positive');
  if (input.amount > inv.balance) throw new Error('Amount exceeds outstanding balance');

  paymentSeq += 1;
  const payment: Payment = {
    id: `pay-${paymentSeq}`,
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
  let rows = mockPaymentState;
  if (params.method && params.method !== 'all') {
    rows = rows.filter((r) => r.method === params.method);
  }
  if (params.dateFrom || params.dateTo) {
    const from = params.dateFrom;
    const to = params.dateTo;
    rows = rows.filter((r) => {
      const d = isoDate(new Date(r.receivedAt));
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  } else if (params.date) {
    const target = params.date;
    rows = rows.filter((r) => isoDate(new Date(r.receivedAt)) === target);
  }
  if (params.q) {
    const q = params.q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.invoiceNumber.toLowerCase().includes(q) ||
        r.patient.fullName.toLowerCase().includes(q) ||
        r.patient.uhid.toLowerCase().includes(q) ||
        (r.referenceNo ?? '').toLowerCase().includes(q),
    );
  }
  return delay(rows);
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
