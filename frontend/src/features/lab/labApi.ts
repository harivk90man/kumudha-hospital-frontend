import type {
  ClinicalPriority,
  LabOrder,
  LabOrderQueueEntry,
  LabOrdersListParams,
  LabResultFlag,
  LabTestCatalogItem,
  LabTestPanel,
  OrderStatus,
  RecordLabResultInput,
} from './labTypes';
import { supabase } from '@/lib/supabase/supabaseClient';
import { mockLabOrderQueue } from './__mocks__/labMocks';
import {
  mockLabCatalog,
  mockLabComponents,
  mockLabPanels,
  resolvePanelToComponents,
} from './__mocks__/labCatalogueMocks';
import type { PatientSummary } from '@/features/patient';
import { createInvoice } from '@/features/billing';
import { mockServices } from '@/features/billing/__mocks__/billingMocks';
import { appendReportPending } from '@/features/encounter/__mocks__/encounterMocks';
import { sortAndPaginate, type PageResult } from '@/utils/listQuery';

/**
 * Server-side sort whitelist for the lab-tech worklist.
 * Anything outside this set is silently dropped.
 */
export const LAB_ORDERS_SORT_WHITELIST = [
  'orderedAt',
  'patient.fullName',
  'testName',
  'status',
  'clinicalPriority',
] as const;

const delay = <T>(value: T, ms = 250): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

/**
 * Lab API surface. Mocked today; signatures match the final backend contract.
 *
 * Wire points (all lists honour ?page=&limit=&sort= per CLAUDE.md §3.4):
 *  GET   /api/lab/catalog?q=                    → fetchLabCatalog
 *  POST  /api/lab/orders                        → placeLabOrder { opNumber, testIds, clinicalPriority }
 *  GET   /api/lab/orders?status=&priority=&q=   → fetchLabOrderQueue (lab-tech queue join)
 *  POST  /api/lab/orders/:id/transition         → transitionLabOrder
 *  PATCH /api/lab/orders/:id/result             → recordLabResult (in_progress -> reported)
 *  POST  /api/lab/orders/:id/release            → releaseLabOrder (reported -> released)
 *  POST  /api/notifications/:id/ack             → acknowledgeNotification (TSD-02)
 */

let mockQueueState: LabOrderQueueEntry[] = [...mockLabOrderQueue];

/**
 * What the doctor sees in the order picker — panels (CBC / LFT / RFT
 * / Urine / Lipid / Blood Group) + standalone tests (CRP, ESR,
 * HbA1C, Glucose, BT, HIV, HCV, HBsAg, STAT Potassium).
 */
/**
 * Demo: query lab_tests + join service (for price). Falls back to mock on error.
 * Real backend (TSD-05): GET /api/lab/catalog returns the catalogue with
 * panel + standalone tests folded together.
 */
export const fetchLabCatalog = async (): Promise<LabTestCatalogItem[]> => {
  const { supabase } = await import('@/lib/supabase/supabaseClient');
  const { data, error } = await supabase
    .from('lab_tests')
    .select(`
      id, test_code, test_name, category, sample_type, tat_hours, result_type,
      unit, ref_min_male, ref_max_male, ref_min_female, ref_max_female,
      critical_low, critical_high, sample_volume_ml, requires_fasting,
      services ( default_price )
    `)
    .is('deleted_at', null)
    .order('test_name', { ascending: true })
    .limit(200);

  if (error || !data || data.length === 0) {
    return delay(mockLabCatalog);
  }

  return (data as unknown as Array<{
    id: string; test_code: string; test_name: string; category: string;
    sample_type: string; tat_hours: number | null; result_type: string;
    unit: string | null;
    ref_min_male: number | null; ref_max_male: number | null;
    ref_min_female: number | null; ref_max_female: number | null;
    critical_low: number | null; critical_high: number | null;
    sample_volume_ml: number | null; requires_fasting: boolean;
    services: { default_price: number | string } | null;
  }>).map((r) => ({
    id: r.id,
    code: r.test_code,
    name: r.test_name,
    fullName: r.test_name,
    category: r.category,
    specimen: r.sample_type,
    tatHours: r.tat_hours ?? 24,
    resultType: r.result_type as LabTestCatalogItem['resultType'],
    unit: r.unit ?? undefined,
    refMinMale: r.ref_min_male ?? undefined,
    refMaxMale: r.ref_max_male ?? undefined,
    refMinFemale: r.ref_min_female ?? undefined,
    refMaxFemale: r.ref_max_female ?? undefined,
    criticalLow: r.critical_low ?? undefined,
    criticalHigh: r.critical_high ?? undefined,
    defaultPrice: Number(r.services?.default_price ?? 300),
    requiresFasting: r.requires_fasting,
    sampleVolumeMl: r.sample_volume_ml ?? undefined,
  } satisfies LabTestCatalogItem));
};

/** lab_test_panels — the bundle definitions (CBC, LFT, …). */
export const fetchLabPanels = async (): Promise<LabTestPanel[]> => delay(mockLabPanels);

/**
 * Every individual `lab_tests` row, including the components that
 * make up panels (Hb, WBC, ALT, eGFR, …). The tech result-entry
 * form reads from this when expanding a panel for input.
 */
export const fetchLabComponents = async (): Promise<LabTestCatalogItem[]> =>
  delay(mockLabComponents);

/** Resolve a panel code → its constituent component tests, in order. */
export const fetchPanelComponents = async (panelCode: string): Promise<LabTestCatalogItem[]> =>
  delay(resolvePanelToComponents(panelCode));

/** Map a lab catalogue test_code to the matching billing service code. */
const labCodeToBillingCode = (labCode: string): string =>
  labCode === 'POTASSIUM' ? 'LAB-POT' : `LAB-${labCode}`;

export const placeLabOrder = async (
  /**
   * Owning OP visit. Optional for **walk-in lab** — TSD-05 §4.3 allows a
   * `lab_order_id` to be the token anchor with no `op_visit_id` (one of
   * the five mutually-exclusive nullable FKs). Mock issues a synthetic
   * `WALK-…` identifier when omitted so the lab tech still sees the row
   * on their worklist.
   */
  opNumber: string | null,
  testIds: string[],
  clinicalPriority: ClinicalPriority = 'routine',
  patientSnapshot?: PatientSummary,
  /** Per-test order-time subtype (e.g. Glucose: 'fasting'/'random'/'pp'). */
  orderSubtypes?: Record<string, string>,
): Promise<LabOrder[]> => {
  const effectiveOpNumber =
    opNumber ?? `WALK-${Date.now().toString(36).toUpperCase()}`;
  const tests = testIds
    .map((id) => mockLabCatalog.find((c) => c.id === id))
    .filter((c): c is LabTestCatalogItem => Boolean(c));

  const orders: LabOrder[] = tests.map((c) => {
    // Catalogue rows whose id starts with `pnl-` are panel surrogates
    // (CBC, LFT, RFT, …) — preserve panelCode/panelName so the doctor’s
    // viewer + tech’s entry form know to expand into components.
    const isPanel = c.id.startsWith('pnl-');
    return {
      id: `lab-${c.id}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      orderedAt: new Date().toISOString(),
      status: 'ordered' as const,
      testCode: c.code,
      testName: c.name,
      panelCode: isPanel ? c.code : undefined,
      panelName: isPanel ? c.name : undefined,
      clinicalPriority,
      orderSubtype: orderSubtypes?.[c.code],
    };
  });

  // Mock side-effects: when the caller passes the patient snapshot we
  // can wire the doctor’s order into the lab tech’s worklist + the
  // cashier’s billing pipeline. Real backend handles both joins itself.
  if (patientSnapshot) {
    for (let i = 0; i < orders.length; i += 1) {
      const o = orders[i];
      const t = tests[i];
      mockQueueState.unshift({
        id: o.id,
        opNumber: effectiveOpNumber,
        patient: patientSnapshot,
        testCode: t.code,
        testName: t.name,
        panelCode: o.panelCode,
        panelName: o.panelName,
        specimen: t.specimen,
        sampleVolumeMl: t.sampleVolumeMl,
        requiresFasting: t.requiresFasting,
        clinicalPriority,
        status: 'awaiting_payment',
        orderedAt: o.orderedAt,
      });
    }

    const lines = orders
      .map((o) => mockServices.find((s) => s.code === labCodeToBillingCode(o.testCode)))
      .filter((s): s is (typeof mockServices)[number] => Boolean(s))
      .map((s) => ({ serviceId: s.id, quantity: 1 }));
    if (lines.length > 0) {
      await createInvoice({
        patientId: patientSnapshot.id,
        patientSnapshot,
        // Walk-in invoices intentionally omit `opNumber` — the
        // back-end joins on lab_order_id instead per TSD-12.
        opNumber: opNumber ?? undefined,
        station: 'lab',
        lines,
      }).catch(() => {
        /* Mock-only: never block the doctor’s order on a billing hiccup. */
      });
    }
  }

  return delay(orders);
};

/**
 * Doctor acknowledges a critical-result notification. Per TSD-02 the ACK
 * stamps `notifications.acked_at` + `acked_by` and writes an audit row.
 */
export const acknowledgeNotification = async (
  notificationId: string,
  doctorId: string,
): Promise<{ id: string; ackedAt: string; ackedBy: string }> => {
  return delay({
    id: notificationId,
    ackedAt: new Date().toISOString(),
    ackedBy: doctorId,
  }, 150);
};

/* ---------- Lab-tech actor flows (TSD-08 §4.6 transitions) ---------- */

interface SbLabOrderRow {
  id: string;
  order_number: string;
  priority: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  op_visits: { op_number: string } | null;
  patients: {
    id: string; uhid: string; first_name: string; last_name: string;
    gender: string; date_of_birth: string | null; mobile: string | null;
    blood_group: string | null;
  } | null;
  lab_order_items: Array<{
    id: string; status: string; sequence_no: number;
    lab_tests: { test_code: string; test_name: string; sample_type: string; requires_fasting: boolean; sample_volume_ml: number | null } | null;
    lab_results: Array<{ value_numeric: number | string | null; value_raw: string | null; unit: string | null; flag: string | null; release_status: string }>;
  }>;
}

const ageFromDob = (dob: string | null): number => {
  if (!dob) return 0;
  const d = new Date(dob); const n = new Date();
  return Math.max(0, n.getFullYear() - d.getFullYear() -
    (n < new Date(n.getFullYear(), d.getMonth(), d.getDate()) ? 1 : 0));
};

const mapLabOrderRow = (r: SbLabOrderRow): LabOrderQueueEntry[] => {
  const p = r.patients;
  const patient: import('@/features/patient').PatientSummary = p ? {
    id: p.id, uhid: p.uhid,
    firstName: p.first_name, lastName: p.last_name,
    fullName: `${p.first_name} ${p.last_name}`.trim(),
    gender: p.gender as 'm' | 'f' | 'o',
    ageYears: ageFromDob(p.date_of_birth),
    mobile: p.mobile ?? undefined,
    bloodGroup: p.blood_group ?? undefined,
    allergies: [], chronicConditions: [],
  } : { id: '', uhid: '', firstName: '', lastName: '', fullName: '—', gender: 'o', ageYears: 0, allergies: [], chronicConditions: [] };

  return r.lab_order_items.map((it) => {
    const result = it.lab_results[0];
    return {
      id: `${r.id}-${it.id}`,
      opNumber: r.op_visits?.op_number ?? '—',
      patient,
      testCode: it.lab_tests?.test_code ?? '—',
      testName: it.lab_tests?.test_name ?? '—',
      specimen: it.lab_tests?.sample_type ?? '',
      requiresFasting: it.lab_tests?.requires_fasting,
      sampleVolumeMl: it.lab_tests?.sample_volume_ml ?? undefined,
      clinicalPriority: r.priority as 'routine' | 'urgent' | 'stat',
      status: it.status as OrderStatus,
      orderedAt: r.created_at,
      reportedAt: r.completed_at ?? undefined,
      releasedAt: r.completed_at ?? undefined,
      resultSummary: result?.value_raw ?? undefined,
      resultNumeric: result?.value_numeric != null ? Number(result.value_numeric) : undefined,
      resultUnit: result?.unit ?? undefined,
      flag: (result?.flag as LabResultFlag | undefined) ?? undefined,
    } satisfies LabOrderQueueEntry;
  });
};

export const fetchLabOrderQueue = async (
  params: LabOrdersListParams = {},
): Promise<LabOrderQueueEntry[]> => {
  void params.page;
  void params.limit;
  void params.sort;
  let rows: LabOrderQueueEntry[];
  try {
    const { data, error } = await supabase
      .from('lab_orders')
      .select(`
        id, order_number, priority, status, created_at, completed_at,
        op_visits!lab_orders_op_visit_id_fkey ( op_number ),
        patients!lab_orders_patient_id_fkey ( id, uhid, first_name, last_name, gender, date_of_birth, mobile, blood_group ),
        lab_order_items (
          id, status, sequence_no,
          lab_tests ( test_code, test_name, sample_type, requires_fasting, sample_volume_ml ),
          lab_results ( value_numeric, value_raw, unit, flag, release_status )
        )
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    rows = ((data ?? []) as unknown as SbLabOrderRow[]).flatMap(mapLabOrderRow);
  } catch {
    rows = mockQueueState;
  }

  if (params.statuses && params.statuses.length > 0) {
    const set = new Set(params.statuses);
    rows = rows.filter((r) => set.has(r.status));
  } else if (params.status && params.status !== 'all') {
    rows = rows.filter((r) => r.status === params.status);
  }
  if (params.priority && params.priority !== 'all') {
    rows = rows.filter((r) => r.clinicalPriority === params.priority);
  }
  if (params.q) {
    const q = params.q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.testCode.toLowerCase().includes(q) ||
        r.testName.toLowerCase().includes(q) ||
        r.patient.fullName.toLowerCase().includes(q) ||
        r.patient.uhid.toLowerCase().includes(q) ||
        r.opNumber.toLowerCase().includes(q),
    );
  }
  return rows;
};

/**
 * Single-order lookup. Mock-only convenience that scans the queue;
 * real backend exposes `GET /api/lab/orders/:id`.
 */
export const fetchLabOrder = async (
  id: string,
): Promise<LabOrderQueueEntry | null> => {
  // Synthetic id from fetchLabOrderQueue is "<orderUuid>-<itemUuid>" (UUIDs
  // are 36 chars each → 73 total with the joining dash at index 36).
  if (id.length === 73 && id[36] === '-') {
    const orderId = id.slice(0, 36);
    const itemId = id.slice(37);
    try {
      const { data, error } = await supabase
        .from('lab_orders')
        .select(`
          id, order_number, priority, status, created_at, completed_at,
          op_visits!lab_orders_op_visit_id_fkey ( op_number ),
          patients!lab_orders_patient_id_fkey ( id, uhid, first_name, last_name, gender, date_of_birth, mobile, blood_group ),
          lab_order_items (
            id, status, sequence_no,
            lab_tests ( test_code, test_name, sample_type, requires_fasting, sample_volume_ml ),
            lab_results ( value_numeric, value_raw, unit, flag, release_status )
          )
        `)
        .eq('id', orderId)
        .is('deleted_at', null)
        .maybeSingle();
      if (error || !data) return mockQueueState.find((r) => r.id === id) ?? null;
      const all = mapLabOrderRow(data as unknown as SbLabOrderRow);
      return all.find((e) => e.id.endsWith(itemId)) ?? all[0] ?? null;
    } catch {
      return mockQueueState.find((r) => r.id === id) ?? null;
    }
  }
  return mockQueueState.find((r) => r.id === id) ?? null;
};

/**
 * Paged sibling of {@link fetchLabOrderQueue} — same filters, then
 * sort + paginate per the §3.4 wire contract. Used by the lab-tech
 * worklist; consultation panels and dashboards stay on the flat sibling.
 */
export const fetchLabOrderQueuePaged = async (
  params: LabOrdersListParams = {},
): Promise<PageResult<LabOrderQueueEntry>> => {
  const all = await fetchLabOrderQueue({
    ...params,
    page: undefined,
    limit: undefined,
    sort: undefined,
  });
  return sortAndPaginate(all, params, LAB_ORDERS_SORT_WHITELIST);
};

const updateQueue = (
  id: string,
  patch: Partial<LabOrderQueueEntry>,
): LabOrderQueueEntry => {
  const idx = mockQueueState.findIndex((r) => r.id === id);
  if (idx < 0) throw new Error(`Lab order ${id} not found`);
  const updated = { ...mockQueueState[idx], ...patch };
  mockQueueState = [
    ...mockQueueState.slice(0, idx),
    updated,
    ...mockQueueState.slice(idx + 1),
  ];
  return updated;
};

/**
 * Move a lab order along the TSD-08 §4.6 status ladder.
 * Server validates the transition is allowed from the current status.
 */
export const transitionLabOrder = async (
  id: string,
  toStatus: OrderStatus,
): Promise<LabOrderQueueEntry> => {
  const patch: Partial<LabOrderQueueEntry> = { status: toStatus };
  if (toStatus === 'sample_collected') patch.sampleCollectedAt = new Date().toISOString();
  if (toStatus === 'released') patch.releasedAt = new Date().toISOString();
  return delay(updateQueue(id, patch), 150);
};

export const recordLabResult = async (
  input: RecordLabResultInput,
): Promise<LabOrderQueueEntry> => {
  const updated = updateQueue(input.orderId, {
    status: 'reported',
    reportedAt: new Date().toISOString(),
    resultSummary: input.resultSummary,
    resultNumeric: input.resultNumeric,
    resultText: input.resultText,
    resultUnit: input.resultUnit,
    flag: input.flag,
    notes: input.notes,
    componentResults: input.componentResults,
  });
  return delay(updated, 200);
};

export const releaseLabOrder = async (
  id: string,
): Promise<LabOrderQueueEntry> => {
  const updated = await transitionLabOrder(id, 'released');
  // Mock side-effect: surface this released test on the doctor’s
  // "Reports to check" tab. Real backend computes the doctor’s
  // report-pending queue via a join when the order flips to 'released'.
  appendReportPending({
    opNumber: updated.opNumber,
    patient: updated.patient,
    report: {
      kind: 'lab',
      testCode: updated.testCode,
      testName: updated.testName,
      status: 'reported',
      reportedAt: updated.reportedAt,
    },
  });
  return updated;
};

/**
 * Mock-only side-effect entrypoint for billing.recordPayment to flip
 * every awaiting_payment lab order for a visit to `paid` once the
 * cashier has settled the invoice. Real backend handles this via the
 * lab_orders ↔ invoice_lines FK + a status-update trigger.
 */
export const markVisitOrdersPaid = (opNumber: string): void => {
  for (const o of mockQueueState) {
    if (o.opNumber === opNumber && o.status === 'awaiting_payment') {
      o.status = 'paid';
    }
  }
};
