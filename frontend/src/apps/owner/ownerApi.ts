/**
 * Owner-app analytics aggregations.
 * DEMO MODE: queries Supabase directly (via @/lib/supabase/supabaseClient).
 *
 * Each aggregation joins `invoices → op_visits → users(doctor) → departments`
 * and `invoices → invoice_items` server-side, then computes the rollups
 * in JS. Real backend would push this entirely into SQL (and we may
 * later, but this keeps the demo simple).
 */

import type { ServiceCategory } from '@/features/billing';
import type { DateRange } from '@/utils/dateRange';
import { supabase } from '@/lib/supabase/supabaseClient';

/* ---------- Types (unchanged) ---------- */

export interface RevenueOverview {
  billed: number;
  collected: number;
  refunded: number;
  invoiceCount: number;
  patientCount: number;
}

export interface CategoryBreakdown {
  category: ServiceCategory;
  amount: number;
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

/* ---------- DB-row shapes ---------- */

interface AggInvoiceRow {
  id: string;
  total_amount: string | number;
  patient_id: string;
  created_at: string;
  payment_status: string;
  op_visits: {
    op_number: string;
    doctor_id: string;
    users: {
      id: string;
      full_name: string;
      department_id: string | null;
      departments: { dept_name: string } | null;
    } | null;
  } | null;
}

interface AggInvoiceItemRow {
  invoice_id: string;
  item_type: string;
  item_name: string;
  service_id: string | null;
  quantity: number;
  total_price: string | number;
  services: { service_code: string; service_name: string } | null;
}

interface AggPaymentRow {
  amount: string | number;
  created_at: string;
  payment_allocations: { invoice_id: string | null }[];
}

const ITEM_TYPE_TO_CATEGORY: Record<string, ServiceCategory> = {
  consultation: 'consultation',
  lab_test:     'lab',
  lab_panel:    'lab',
  radiology:    'radiology',
  drug:         'pharmacy',
  procedure:    'procedure',
  room_charge:  'admission',
  nursing:      'admission',
  consumable:   'other',
  ambulance:    'other',
  other:        'other',
};

const dayLo = (d: string): string => `${d}T00:00:00`;
const dayHi = (d: string): string => `${d}T23:59:59`;

/* ---------- Public aggregates ---------- */

export const fetchRevenueOverview = async (
  range: DateRange,
): Promise<RevenueOverview> => {
  const { data: invs, error: e1 } = await supabase
    .from('invoices')
    .select('id, total_amount, patient_id, created_at')
    .gte('created_at', dayLo(range.from))
    .lte('created_at', dayHi(range.to))
    .is('deleted_at', null);
  if (e1) throw new Error(e1.message);

  const { data: pays, error: e2 } = await supabase
    .from('payments')
    .select('amount, created_at, payment_direction')
    .gte('created_at', dayLo(range.from))
    .lte('created_at', dayHi(range.to))
    .is('deleted_at', null);
  if (e2) throw new Error(e2.message);

  const invRows = (invs ?? []) as { id: string; total_amount: string | number; patient_id: string }[];
  const payRows = (pays ?? []) as { amount: string | number; payment_direction: string }[];

  const billed = invRows.reduce((s, r) => s + Number(r.total_amount), 0);
  const collected = payRows
    .filter((p) => p.payment_direction === 'in')
    .reduce((s, p) => s + Number(p.amount), 0);
  const refunded = payRows
    .filter((p) => p.payment_direction === 'out')
    .reduce((s, p) => s + Number(p.amount), 0);

  return {
    billed,
    collected,
    refunded,
    invoiceCount: invRows.length,
    patientCount: new Set(invRows.map((r) => r.patient_id)).size,
  };
};

export const fetchRevenueByCategory = async (
  range: DateRange,
): Promise<CategoryBreakdown[]> => {
  // Pull invoice_items joined to invoices for date filtering.
  const { data, error } = await supabase
    .from('invoice_items')
    .select(`
      invoice_id, item_type, total_price,
      invoices!inner ( id, created_at, deleted_at )
    `)
    .gte('invoices.created_at', dayLo(range.from))
    .lte('invoices.created_at', dayHi(range.to))
    .is('invoices.deleted_at', null)
    .is('deleted_at', null);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as {
    item_type: string;
    total_price: string | number;
  }[];

  const totals: Partial<Record<ServiceCategory, number>> = {};
  for (const r of rows) {
    const cat = ITEM_TYPE_TO_CATEGORY[r.item_type] ?? 'other';
    totals[cat] = (totals[cat] ?? 0) + Number(r.total_price);
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
  const { data, error } = await supabase
    .from('invoices')
    .select(`
      id, total_amount, created_at, op_visit_id,
      op_visits!inner ( doctor_id, users!op_visits_doctor_id_fkey ( id, full_name, department_id, departments!fk_users_department ( dept_name ) ) )
    `)
    .gte('created_at', dayLo(range.from))
    .lte('created_at', dayHi(range.to))
    .is('deleted_at', null);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as AggInvoiceRow[];
  const acc = new Map<string, { amount: number; invoiceCount: number; doctors: Set<string> }>();
  for (const r of rows) {
    const dept = r.op_visits?.users?.departments?.dept_name ?? 'Unknown';
    const docId = r.op_visits?.doctor_id ?? '';
    const cur = acc.get(dept) ?? { amount: 0, invoiceCount: 0, doctors: new Set<string>() };
    cur.amount += Number(r.total_amount);
    cur.invoiceCount += 1;
    if (docId) cur.doctors.add(docId);
    acc.set(dept, cur);
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
  const { data, error } = await supabase
    .from('invoices')
    .select(`
      id, total_amount, patient_id, created_at,
      op_visits!inner ( doctor_id, users!op_visits_doctor_id_fkey ( id, full_name, departments!fk_users_department ( dept_name ) ) )
    `)
    .gte('created_at', dayLo(range.from))
    .lte('created_at', dayHi(range.to))
    .is('deleted_at', null);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as AggInvoiceRow[];
  const acc = new Map<string, {
    doctorName: string; department: string;
    amount: number; invoiceCount: number; patients: Set<string>;
  }>();
  for (const r of rows) {
    const doc = r.op_visits?.users;
    if (!doc) continue;
    const cur = acc.get(doc.id) ?? {
      doctorName: doc.full_name,
      department: doc.departments?.dept_name ?? '—',
      amount: 0, invoiceCount: 0, patients: new Set<string>(),
    };
    cur.amount += Number(r.total_amount);
    cur.invoiceCount += 1;
    cur.patients.add(r.patient_id);
    acc.set(doc.id, cur);
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
  const { data, error } = await supabase
    .from('invoice_items')
    .select(`
      item_type, item_name, quantity, total_price,
      services ( service_code, service_name ),
      invoices!inner ( id, created_at, deleted_at )
    `)
    .gte('invoices.created_at', dayLo(range.from))
    .lte('invoices.created_at', dayHi(range.to))
    .is('invoices.deleted_at', null)
    .is('deleted_at', null);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as AggInvoiceItemRow[];
  const acc = new Map<string, {
    serviceName: string; category: ServiceCategory;
    quantity: number; amount: number;
  }>();
  for (const r of rows) {
    const code = r.services?.service_code ?? r.item_type.toUpperCase();
    const cat  = ITEM_TYPE_TO_CATEGORY[r.item_type] ?? 'other';
    const cur = acc.get(code) ?? {
      serviceName: r.services?.service_name ?? r.item_name,
      category: cat,
      quantity: 0, amount: 0,
    };
    cur.quantity += r.quantity;
    cur.amount += Number(r.total_price);
    acc.set(code, cur);
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

/* Mark unused imports to satisfy strict tsc */
export type _AggPaymentRow = AggPaymentRow;
