import type {
  ClinicalPriority,
  LabOrder,
  LabOrderQueueEntry,
  LabOrdersListParams,
  LabTestCatalogItem,
  LabTestPanel,
  OrderStatus,
  RecordLabResultInput,
} from './labTypes';
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
export const fetchLabCatalog = async (): Promise<LabTestCatalogItem[]> => delay(mockLabCatalog);

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

export const fetchLabOrderQueue = async (
  params: LabOrdersListParams = {},
): Promise<LabOrderQueueEntry[]> => {
  void params.page;
  void params.limit;
  void params.sort;
  let rows = mockQueueState;
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
  return delay(rows);
};

/**
 * Single-order lookup. Mock-only convenience that scans the queue;
 * real backend exposes `GET /api/lab/orders/:id`.
 */
export const fetchLabOrder = async (
  id: string,
): Promise<LabOrderQueueEntry | null> => {
  const found = mockQueueState.find((r) => r.id === id) ?? null;
  return delay(found, 100);
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
