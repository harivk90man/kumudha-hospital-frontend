/**
 * Owner-app analytics aggregations. Mocked today; signatures match
 * the planned backend contract (TSD-12 invoices + TSD-04 op_visits +
 * TSD-01 doctor_profiles join).
 *
 * All reads are date-range bounded — the caller resolves a preset
 * (`utils/dateRange.resolveDateRange`) into absolute from/to and we
 * filter on `Invoice.createdAt` (day precision). Δ-vs-prior is not
 * computed here; the caller pulls current + previous separately and
 * derives % change with `pctChange()`.
 *
 * Real backend: every aggregate lands on a server-side SQL query
 * grouping `invoice_lines` joined with `op_visits` (for doctor/dept)
 * and `services_catalog` (for category/code). Mock joins via the
 * exported `mockOpVisitDoctor` map.
 */

import {
  fetchInvoices,
  fetchPayments,
  type Invoice,
  type Payment,
  type ServiceCategory,
} from '@/features/billing';
import { mockOpVisitDoctor } from '@/features/encounter';
import { inRange, type DateRange } from '@/utils/dateRange';

/* ---------- Types ---------- */

export interface RevenueOverview {
  /** Sum of `Invoice.total` (incl. GST) issued in the period. */
  billed: number;
  /** Sum of successful payments (positive amounts). */
  collected: number;
  /** Sum of refunds (negative payments) as a positive figure. */
  refunded: number;
  /** Count of invoices issued in the period. */
  invoiceCount: number;
  /** Count of distinct patients invoiced in the period. */
  patientCount: number;
}

export interface CategoryBreakdown {
  category: ServiceCategory;
  amount: number;
  /** Share of the period total, 0-1. */
  share: number;
}

export interface DepartmentBreakdown {
  department: string;
  amount: number;
  share: number;
  doctorCount: number;
  invoiceCount: number;
}

export interface DoctorBreakdown {
  doctorId: string;
  doctorName: string;
  department: string;
  amount: number;
  invoiceCount: number;
  patientCount: number;
}

export interface TopService {
  serviceCode: string;
  serviceName: string;
  category: ServiceCategory;
  quantity: number;
  amount: number;
}

/* ---------- Internals ---------- */

const lineTotalIncGst = (lineTotal: number, gstPct: number): number =>
  lineTotal + (lineTotal * gstPct) / 100;

const dayOf = (iso: string): string => iso.slice(0, 10);

const filterInvoicesByRange = (invoices: Invoice[], range: DateRange): Invoice[] =>
  invoices.filter((i) => inRange(dayOf(i.createdAt), range));

const filterPaymentsByRange = (payments: Payment[], range: DateRange): Payment[] =>
  payments.filter((p) => inRange(dayOf(p.receivedAt), range));

/* ---------- Public aggregates ---------- */

export const fetchRevenueOverview = async (
  range: DateRange,
): Promise<RevenueOverview> => {
  const [allInvoices, allPayments] = await Promise.all([
    fetchInvoices({}),
    fetchPayments({}),
  ]);
  const invs = filterInvoicesByRange(allInvoices, range);
  const pays = filterPaymentsByRange(allPayments, range).filter(
    (p) => p.status === 'succeeded',
  );

  const collected = pays.reduce((s, p) => s + Math.max(p.amount, 0), 0);
  const refunded = pays.reduce((s, p) => s + Math.max(-p.amount, 0), 0);
  const billed = invs.reduce((s, i) => s + i.total, 0);
  const patientCount = new Set(invs.map((i) => i.patient.uhid)).size;

  return {
    billed,
    collected,
    refunded,
    invoiceCount: invs.length,
    patientCount,
  };
};

export const fetchRevenueByCategory = async (
  range: DateRange,
): Promise<CategoryBreakdown[]> => {
  const all = await fetchInvoices({});
  const invs = filterInvoicesByRange(all, range);
  const totals: Partial<Record<ServiceCategory, number>> = {};
  for (const inv of invs) {
    for (const l of inv.lines) {
      totals[l.category] = (totals[l.category] ?? 0) + lineTotalIncGst(l.lineTotal, l.gstPct);
    }
  }
  const grand = Object.values(totals).reduce<number>((s, v) => s + (v ?? 0), 0);
  return Object.entries(totals)
    .map(([category, amount]) => ({
      category: category as ServiceCategory,
      amount: amount ?? 0,
      share: grand > 0 ? (amount ?? 0) / grand : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
};

export const fetchRevenueByDepartment = async (
  range: DateRange,
): Promise<DepartmentBreakdown[]> => {
  const all = await fetchInvoices({});
  const invs = filterInvoicesByRange(all, range);
  const acc = new Map<
    string,
    { amount: number; invoiceCount: number; doctors: Set<string> }
  >();
  for (const inv of invs) {
    const join = inv.opNumber ? mockOpVisitDoctor[inv.opNumber] : undefined;
    if (!join) continue; // walk-in without doctor join — exclude from dept rollup
    const cur = acc.get(join.department) ?? {
      amount: 0,
      invoiceCount: 0,
      doctors: new Set<string>(),
    };
    cur.amount += inv.total;
    cur.invoiceCount += 1;
    cur.doctors.add(join.doctorId);
    acc.set(join.department, cur);
  }
  const grand = Array.from(acc.values()).reduce((s, v) => s + v.amount, 0);
  return Array.from(acc.entries())
    .map(([department, v]) => ({
      department,
      amount: v.amount,
      share: grand > 0 ? v.amount / grand : 0,
      doctorCount: v.doctors.size,
      invoiceCount: v.invoiceCount,
    }))
    .sort((a, b) => b.amount - a.amount);
};

export const fetchRevenueByDoctor = async (
  range: DateRange,
): Promise<DoctorBreakdown[]> => {
  const all = await fetchInvoices({});
  const invs = filterInvoicesByRange(all, range);
  const acc = new Map<
    string,
    {
      doctorName: string;
      department: string;
      amount: number;
      invoiceCount: number;
      patients: Set<string>;
    }
  >();
  for (const inv of invs) {
    const join = inv.opNumber ? mockOpVisitDoctor[inv.opNumber] : undefined;
    if (!join) continue;
    const cur = acc.get(join.doctorId) ?? {
      doctorName: join.doctorName,
      department: join.department,
      amount: 0,
      invoiceCount: 0,
      patients: new Set<string>(),
    };
    cur.amount += inv.total;
    cur.invoiceCount += 1;
    cur.patients.add(inv.patient.uhid);
    acc.set(join.doctorId, cur);
  }
  return Array.from(acc.entries())
    .map(([doctorId, v]) => ({
      doctorId,
      doctorName: v.doctorName,
      department: v.department,
      amount: v.amount,
      invoiceCount: v.invoiceCount,
      patientCount: v.patients.size,
    }))
    .sort((a, b) => b.amount - a.amount);
};

export const fetchTopServices = async (
  range: DateRange,
  limit = 10,
): Promise<TopService[]> => {
  const all = await fetchInvoices({});
  const invs = filterInvoicesByRange(all, range);
  const acc = new Map<
    string,
    { serviceName: string; category: ServiceCategory; quantity: number; amount: number }
  >();
  for (const inv of invs) {
    for (const l of inv.lines) {
      const cur = acc.get(l.serviceCode) ?? {
        serviceName: l.serviceName,
        category: l.category,
        quantity: 0,
        amount: 0,
      };
      cur.quantity += l.quantity;
      cur.amount += lineTotalIncGst(l.lineTotal, l.gstPct);
      acc.set(l.serviceCode, cur);
    }
  }
  return Array.from(acc.entries())
    .map(([serviceCode, v]) => ({
      serviceCode,
      serviceName: v.serviceName,
      category: v.category,
      quantity: v.quantity,
      amount: v.amount,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
};
