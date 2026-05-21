import type {
  RadiologyOrder,
  RadiologyOrderQueueEntry,
  RadiologyOrdersListParams,
  RadiologyTestCatalogItem,
  RecordRadiologyResultInput,
} from './radiologyTypes';
import type { ClinicalPriority, OrderStatus } from '@/features/lab';
import { mockRadiologyCatalog, mockRadiologyOrderQueue } from './__mocks__/radiologyMocks';
import type { PatientSummary } from '@/features/patient';
import { createInvoice } from '@/features/billing';
import { mockServices } from '@/features/billing/__mocks__/billingMocks';
import { appendReportPending } from '@/features/encounter/__mocks__/encounterMocks';
import { sortAndPaginate, type PageResult } from '@/utils/listQuery';

/**
 * Server-side sort whitelist for the radiology-tech worklist.
 * Anything outside this set is silently dropped.
 */
export const RADIOLOGY_ORDERS_SORT_WHITELIST = [
  'orderedAt',
  'patient.fullName',
  'testName',
  'status',
  'clinicalPriority',
] as const;

const delay = <T>(value: T, ms = 250): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

/**
 * Radiology API surface. Mocked today; signatures match the final backend
 * contract (TSD-09). All list endpoints honour ?page=&limit=&sort= per
 * CLAUDE.md §3.4.
 *
 * Wire points:
 *  GET   /api/radiology/catalog                 → fetchRadiologyCatalog
 *  POST  /api/radiology/orders                  → placeRadiologyOrder
 *  GET   /api/radiology/orders?status=&...      → fetchRadiologyOrderQueue
 *  POST  /api/radiology/orders/:id/transition   → transitionRadiologyOrder
 *  PATCH /api/radiology/orders/:id/report       → recordRadiologyResult
 *  POST  /api/radiology/orders/:id/release      → releaseRadiologyOrder
 */

let mockQueueState: RadiologyOrderQueueEntry[] = [...mockRadiologyOrderQueue];

/**
 * Demo: query radiology_procedures from Supabase. Falls back to mock on error.
 */
export const fetchRadiologyCatalog = async (): Promise<RadiologyTestCatalogItem[]> => {
  const { supabase } = await import('@/lib/supabase/supabaseClient');
  const { data, error } = await supabase
    .from('radiology_procedures')
    .select('id, procedure_code, procedure_name, modality, body_part')
    .is('deleted_at', null)
    .order('procedure_name', { ascending: true })
    .limit(200);

  if (error || !data || data.length === 0) return delay(mockRadiologyCatalog);

  return (data as unknown as Array<{
    id: string; procedure_code: string; procedure_name: string;
    modality: string; body_part: string;
  }>).map((r) => ({
    id: r.id,
    code: r.procedure_code,
    name: r.procedure_name,
    modality: r.modality as RadiologyTestCatalogItem['modality'],
    bodyPart: r.body_part,
  } satisfies RadiologyTestCatalogItem));
};

/**
 * Map a radiology catalogue test_code to the matching billing service code.
 * Catalogue codes are XR-LSP, XR-KNE, MR-LSP, CT-LSP, USG-ABD, XR-CHE, CT-HD;
 * billing prefixes them all with `RAD-` (and aliases the chest x-ray).
 */
const radCodeToBillingCode = (radCode: string): string => {
  // Chest is 'XR-CHE' in the catalog but 'RAD-XR-CHT' in billing.
  if (radCode === 'XR-CHE') return 'RAD-XR-CHT';
  if (radCode === 'USG-ABD') return 'RAD-USG';
  if (radCode === 'CT-HD') return 'RAD-CT-HD';
  if (radCode === 'MR-LSP') return 'RAD-MRI-LSP';
  return `RAD-${radCode}`;
};

export const placeRadiologyOrder = async (
  /**
   * Owning OP visit. Optional for **walk-in imaging** — TSD-05 §4.3
   * allows a `radiology_order_id` to be the token anchor with no
   * `op_visit_id`. Mock issues a synthetic `WALK-…` id when omitted.
   */
  opNumber: string | null,
  testIds: string[],
  clinicalPriority: ClinicalPriority = 'routine',
  patientSnapshot?: PatientSummary,
): Promise<RadiologyOrder[]> => {
  const effectiveOpNumber =
    opNumber ?? `WALK-${Date.now().toString(36).toUpperCase()}`;
  const tests = testIds
    .map((id) => mockRadiologyCatalog.find((c) => c.id === id))
    .filter((c): c is RadiologyTestCatalogItem => Boolean(c));

  const orders: RadiologyOrder[] = tests.map((c) => ({
    id: `rad-${c.id}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    orderedAt: new Date().toISOString(),
    status: 'ordered' as const,
    testCode: c.code,
    testName: c.name,
    modality: c.modality,
    clinicalPriority,
  }));

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
        modality: t.modality,
        bodyPart: t.bodyPart,
        clinicalPriority,
        status: 'awaiting_payment',
        orderedAt: o.orderedAt,
      });
    }

    const lines = orders
      .map((o) => mockServices.find((s) => s.code === radCodeToBillingCode(o.testCode)))
      .filter((s): s is (typeof mockServices)[number] => Boolean(s))
      .map((s) => ({ serviceId: s.id, quantity: 1 }));
    if (lines.length > 0) {
      await createInvoice({
        patientId: patientSnapshot.id,
        patientSnapshot,
        // Walk-in invoices skip opNumber (joined on radiology_order_id).
        opNumber: opNumber ?? undefined,
        station: 'radiology',
        lines,
      }).catch(() => {
        /* Mock-only: never block on a billing hiccup. */
      });
    }
  }

  return delay(orders);
};

/* ---------- Radiology-tech actor flows ---------- */

interface SbRadOrderRow {
  id: string; order_number: string; priority: string; status: string;
  created_at: string; imaging_completed_at: string | null; released_at: string | null;
  op_visits: { op_number: string } | null;
  patients: {
    id: string; uhid: string; first_name: string; last_name: string;
    gender: string; date_of_birth: string | null; mobile: string | null;
    blood_group: string | null;
  } | null;
  radiology_procedures: { procedure_code: string; procedure_name: string; modality: string; body_part: string } | null;
  radiology_reports: Array<{ findings: string | null; impression: string | null; release_status: string }>;
}

const ageFromDobR = (dob: string | null): number => {
  if (!dob) return 0;
  const d = new Date(dob); const n = new Date();
  return Math.max(0, n.getFullYear() - d.getFullYear() -
    (n < new Date(n.getFullYear(), d.getMonth(), d.getDate()) ? 1 : 0));
};

const DB_TO_FE_RAD_STATUS: Record<string, RadiologyOrderQueueEntry['status']> = {
  ordered:              'ordered',
  awaiting_payment:     'ordered',
  paid:                 'paid',
  imaging_pending:      'paid',
  imaging_in_progress:  'in_progress',
  imaging_completed:    'in_progress',
  reporting_pending:    'in_progress',
  reported:             'reported',
  released:             'released',
  cancelled:            'cancelled',
};

const mapRadOrderRow = (r: SbRadOrderRow): RadiologyOrderQueueEntry => {
  const p = r.patients;
  const rpt = r.radiology_reports[0];
  return {
    id: r.id,
    opNumber: r.op_visits?.op_number ?? '—',
    patient: p ? {
      id: p.id, uhid: p.uhid,
      firstName: p.first_name, lastName: p.last_name,
      fullName: `${p.first_name} ${p.last_name}`.trim(),
      gender: p.gender as 'm' | 'f' | 'o',
      ageYears: ageFromDobR(p.date_of_birth),
      mobile: p.mobile ?? undefined,
      bloodGroup: p.blood_group ?? undefined,
      allergies: [], chronicConditions: [],
    } : { id: '', uhid: '', firstName: '', lastName: '', fullName: '—', gender: 'o', ageYears: 0, allergies: [], chronicConditions: [] },
    testCode: r.radiology_procedures?.procedure_code ?? '—',
    testName: r.radiology_procedures?.procedure_name ?? '—',
    modality: (r.radiology_procedures?.modality ?? 'other') as RadiologyOrderQueueEntry['modality'],
    bodyPart: r.radiology_procedures?.body_part ?? '',
    clinicalPriority: r.priority as ClinicalPriority,
    status: DB_TO_FE_RAD_STATUS[r.status] ?? 'ordered',
    orderedAt: r.created_at,
    capturedAt: r.imaging_completed_at ?? undefined,
    reportedAt: r.imaging_completed_at ?? undefined,
    releasedAt: r.released_at ?? undefined,
    resultSummary: rpt?.impression ?? undefined,
    notes: rpt?.findings ?? undefined,
  } satisfies RadiologyOrderQueueEntry;
};

export const fetchRadiologyOrderQueue = async (
  params: RadiologyOrdersListParams = {},
): Promise<RadiologyOrderQueueEntry[]> => {
  void params.page;
  void params.limit;
  void params.sort;
  let rows: RadiologyOrderQueueEntry[];
  try {
    const { supabase } = await import('@/lib/supabase/supabaseClient');
    const { data, error } = await supabase
      .from('radiology_orders')
      .select(`
        id, order_number, priority, status, created_at, imaging_completed_at, released_at,
        op_visits!radiology_orders_op_visit_id_fkey ( op_number ),
        patients!radiology_orders_patient_id_fkey ( id, uhid, first_name, last_name, gender, date_of_birth, mobile, blood_group ),
        radiology_procedures ( procedure_code, procedure_name, modality, body_part ),
        radiology_reports ( findings, impression, release_status )
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    rows = ((data ?? []) as unknown as SbRadOrderRow[]).map(mapRadOrderRow);
  } catch {
    rows = mockQueueState;
  }
  if (params.statuses && params.statuses.length > 0) {
    const set = new Set(params.statuses);
    rows = rows.filter((r) => set.has(r.status));
  } else if (params.status && params.status !== 'all') {
    rows = rows.filter((r) => r.status === params.status);
  }
  if (params.modality && params.modality !== 'all') {
    rows = rows.filter((r) => r.modality === params.modality);
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
  return delay(rows);
};

/**
 * Single-order lookup. Mock-only convenience that scans the queue;
 * real backend exposes `GET /api/radiology/orders/:id`.
 */
export const fetchRadiologyOrder = async (
  id: string,
): Promise<RadiologyOrderQueueEntry | null> => {
  try {
    const { supabase } = await import('@/lib/supabase/supabaseClient');
    const { data, error } = await supabase
      .from('radiology_orders')
      .select(`
        id, order_number, priority, status, created_at, imaging_completed_at, released_at,
        op_visits!radiology_orders_op_visit_id_fkey ( op_number ),
        patients!radiology_orders_patient_id_fkey ( id, uhid, first_name, last_name, gender, date_of_birth, mobile, blood_group ),
        radiology_procedures ( procedure_code, procedure_name, modality, body_part ),
        radiology_reports ( findings, impression, release_status )
      `)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error || !data) return mockQueueState.find((r) => r.id === id) ?? null;
    return mapRadOrderRow(data as unknown as SbRadOrderRow);
  } catch {
    return mockQueueState.find((r) => r.id === id) ?? null;
  }
};

/**
 * Paged sibling of {@link fetchRadiologyOrderQueue} — same filters,
 * then sort + paginate per the §3.4 wire contract. Used by the
 * radiology-tech worklist; dashboards stay on the flat sibling.
 */
export const fetchRadiologyOrderQueuePaged = async (
  params: RadiologyOrdersListParams = {},
): Promise<PageResult<RadiologyOrderQueueEntry>> => {
  const all = await fetchRadiologyOrderQueue({
    ...params,
    page: undefined,
    limit: undefined,
    sort: undefined,
  });
  return sortAndPaginate(all, params, RADIOLOGY_ORDERS_SORT_WHITELIST);
};

const updateQueue = (
  id: string,
  patch: Partial<RadiologyOrderQueueEntry>,
): RadiologyOrderQueueEntry => {
  const idx = mockQueueState.findIndex((r) => r.id === id);
  if (idx < 0) throw new Error(`Radiology order ${id} not found`);
  const updated = { ...mockQueueState[idx], ...patch };
  mockQueueState = [
    ...mockQueueState.slice(0, idx),
    updated,
    ...mockQueueState.slice(idx + 1),
  ];
  return updated;
};

export const transitionRadiologyOrder = async (
  id: string,
  toStatus: OrderStatus,
): Promise<RadiologyOrderQueueEntry> => {
  const patch: Partial<RadiologyOrderQueueEntry> = { status: toStatus };
  if (toStatus === 'in_progress') patch.capturedAt = new Date().toISOString();
  if (toStatus === 'released') patch.releasedAt = new Date().toISOString();
  return delay(updateQueue(id, patch), 150);
};

export const recordRadiologyResult = async (
  input: RecordRadiologyResultInput,
): Promise<RadiologyOrderQueueEntry> => {
  const updated = updateQueue(input.orderId, {
    status: 'reported',
    reportedAt: new Date().toISOString(),
    resultSummary: input.resultSummary,
    notes: input.notes,
    imagesUrl: input.imagesUrl,
  });
  return delay(updated, 200);
};

export const releaseRadiologyOrder = async (
  id: string,
): Promise<RadiologyOrderQueueEntry> => {
  const updated = await transitionRadiologyOrder(id, 'released');
  // Mock side-effect: surface this released report on the doctor’s
  // "Reports to check" tab.
  appendReportPending({
    opNumber: updated.opNumber,
    patient: updated.patient,
    report: {
      kind: 'radiology',
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
 * every awaiting_payment radiology order for a visit to `paid`.
 */
export const markVisitOrdersPaid = (opNumber: string): void => {
  for (const o of mockQueueState) {
    if (o.opNumber === opNumber && o.status === 'awaiting_payment') {
      o.status = 'paid';
    }
  }
};
