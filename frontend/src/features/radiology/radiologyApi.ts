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

const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001';

/** Next `RAD-YYYY-NNNNN` from the max suffix already in `radiology_orders`. */
async function nextRadOrderNumber(): Promise<string> {
  const { supabase } = await import('@/lib/supabase/supabaseClient');
  const year = new Date().getFullYear();
  const { data, error } = await supabase
    .from('radiology_orders')
    .select('order_number')
    .like('order_number', `RAD-${year}-_____`)
    .order('order_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  let next = 1;
  if (data) {
    const m = String((data as { order_number: string }).order_number).match(/RAD-\d{4}-(\d+)$/);
    if (m) next = parseInt(m[1], 10) + 1;
  }
  return `RAD-${year}-${String(next).padStart(5, '0')}`;
}

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

  // Resolve from DB first — fetchRadiologyCatalog returns DB UUIDs that
  // never match mockRadiologyCatalog ids, so the mock lookup returned
  // nothing and the doctor's tick-mark add silently produced no order.
  let tests: RadiologyTestCatalogItem[] = [];
  try {
    const { supabase } = await import('@/lib/supabase/supabaseClient');
    const { data } = await supabase
      .from('radiology_procedures')
      .select('id, procedure_code, procedure_name, modality, body_part')
      .in('id', testIds);
    if (data && data.length > 0) {
      tests = (data as Array<{ id: string; procedure_code: string;
                              procedure_name: string; modality: string;
                              body_part: string }>).map((r) => ({
        id:        r.id,
        code:      r.procedure_code,
        name:      r.procedure_name,
        modality:  r.modality as RadiologyTestCatalogItem['modality'],
        bodyPart:  r.body_part,
      } satisfies RadiologyTestCatalogItem));
    }
  } catch {
    // fall through to mock
  }
  if (tests.length === 0) {
    tests = testIds
      .map((id) => mockRadiologyCatalog.find((c) => c.id === id))
      .filter((c): c is RadiologyTestCatalogItem => Boolean(c));
  }

  // Persist to Supabase first so the radiology-tech worklist (which
  // reads from DB) actually sees the doctor's order. Schema CHECK
  // constraint allows one procedure per radiology_orders row, so we
  // insert N rows (one per testId).
  const dbOrderIds: Record<string, string> = {}; // testCatalogId -> radiology_orders.id
  try {
    if (opNumber && patientSnapshot && tests.length > 0) {
      const { supabase } = await import('@/lib/supabase/supabaseClient');
      const { data: opvData } = await supabase
        .from('op_visits')
        .select('id, doctor_id')
        .eq('op_number', opNumber)
        .is('deleted_at', null)
        .maybeSingle();
      if (opvData) {
        const opv = opvData as { id: string; doctor_id: string };
        for (const t of tests) {
          let attempts = 0;
          let orderNum = await nextRadOrderNumber();
          while (attempts < 5) {
            const { data: insOrder, error: insErr } = await supabase
              .from('radiology_orders')
              .insert({
                order_number:           orderNum,
                patient_id:             patientSnapshot.id,
                op_visit_id:            opv.id,
                doctor_id:              opv.doctor_id,
                radiology_procedure_id: t.id,
                priority:               clinicalPriority,
                status:                 'ordered',
                created_by:             DEMO_USER_ID,
              })
              .select('id')
              .maybeSingle();
            if (insErr) {
              const code = (insErr as unknown as { code?: string }).code;
              if (code === '23505') {
                attempts += 1;
                orderNum = await nextRadOrderNumber();
                continue;
              }
              throw insErr;
            }
            const id = (insOrder as { id: string } | null)?.id;
            if (id) dbOrderIds[t.id] = id;
            break;
          }
        }
      }
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[placeRadiologyOrder] Supabase persist failed:', e);
  }

  const orders: RadiologyOrder[] = tests.map((c) => ({
    // Prefer the real DB id so the returned RadiologyOrder maps back
    // to the persisted row (downstream status updates query by id).
    id: dbOrderIds[c.id]
      ?? `rad-${c.id}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
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

interface SbRadAttachmentRow {
  id: string;
  file_name: string;
  file_type: string;
  /** PostgREST returns bytea as a \xhex string. Only present when explicitly selected. */
  file_data?: string | null;
  file_size_bytes: number;
  sequence_no: number;
}

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
  /** Only populated when fetching a single order (detail page) — omitted from queue listing to avoid bulk bytea transfer. */
  radiology_attachments?: SbRadAttachmentRow[];
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

/** Convert a File to the `\xhex` bytea literal that PostgREST accepts in JSON. */
const fileToByteaHex = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const parts: string[] = ['\\x'];
  for (const byte of bytes) parts.push(byte.toString(16).padStart(2, '0'));
  return parts.join('');
};

/**
 * Decode a PostgREST bytea hex string (`\xdeadbeef`) to a data URI so the
 * browser can render the image without a separate network request.
 * Processes in 8 kB chunks to avoid call-stack overflow on large files.
 */
const byteaHexToDataUri = (hex: string, mimeType: string): string => {
  const raw = hex.startsWith('\\x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(raw.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(raw.slice(i * 2, i * 2 + 2), 16);
  }
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
};

const mapRadOrderRow = (r: SbRadOrderRow): RadiologyOrderQueueEntry => {
  const p = r.patients;
  const rpt = r.radiology_reports[0];

  // Decode bytea attachments to data URIs — only present on single-order fetch.
  let imagesUrl: string[] | undefined;
  if (r.radiology_attachments && r.radiology_attachments.length > 0) {
    const sorted = [...r.radiology_attachments].sort((a, b) => a.sequence_no - b.sequence_no);
    const uris = sorted
      .filter((a) => a.file_data)
      .map((a) => byteaHexToDataUri(a.file_data!, a.file_type));
    if (uris.length > 0) imagesUrl = uris;
  }

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
    imagesUrl,
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
        radiology_reports ( findings, impression, release_status ),
        radiology_attachments ( id, file_name, file_type, file_data, file_size_bytes, sequence_no )
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

/**
 * Patch radiology_orders.priority on Supabase. Doctor-side ad-hoc orders
 * may not be persisted yet (synthetic ids); only attempt the write when
 * the id looks like a real UUID. Returns false on no-op / failure so
 * the caller still owns the in-memory consultation update.
 */
export const updateRadiologyOrderPriority = async (
  id: string,
  priority: ClinicalPriority,
): Promise<boolean> => {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(id)) return false;
  try {
    const { supabase } = await import('@/lib/supabase/supabaseClient');
    const { error } = await supabase
      .from('radiology_orders')
      .update({ priority })
      .eq('id', id);
    return !error;
  } catch {
    return false;
  }
};

// FE OrderStatus -> DB radiology_orders.status mapping (DB has more states)
const FE_TO_DB_RAD_STATUS: Record<string, string> = {
  ordered:       'ordered',
  paid:          'paid',
  in_progress:   'imaging_in_progress',
  reported:      'reported',
  released:      'released',
  cancelled:     'cancelled',
};

export const transitionRadiologyOrder = async (
  id: string,
  toStatus: OrderStatus,
): Promise<RadiologyOrderQueueEntry> => {
  const { supabase } = await import('@/lib/supabase/supabaseClient');
  const dbStatus = FE_TO_DB_RAD_STATUS[toStatus] ?? toStatus;
  const patch: Record<string, unknown> = { status: dbStatus };
  if (toStatus === 'in_progress') patch.imaging_completed_at = new Date().toISOString();
  if (toStatus === 'released')    patch.released_at = new Date().toISOString();
  const { error } = await supabase.from('radiology_orders').update(patch).eq('id', id);
  if (error) {
    // Fall back to mock state
    const fePatch: Partial<RadiologyOrderQueueEntry> = { status: toStatus };
    if (toStatus === 'in_progress') fePatch.capturedAt = new Date().toISOString();
    if (toStatus === 'released') fePatch.releasedAt = new Date().toISOString();
    return updateQueue(id, fePatch);
  }
  const re = await fetchRadiologyOrder(id);
  return re ?? updateQueue(id, { status: toStatus });
};

export const recordRadiologyResult = async (
  input: RecordRadiologyResultInput,
): Promise<RadiologyOrderQueueEntry> => {
  const { supabase } = await import('@/lib/supabase/supabaseClient');

  // 1. Upsert radiology_report row (findings + impression).
  const { data: existing } = await supabase
    .from('radiology_reports')
    .select('id')
    .eq('radiology_order_id', input.orderId)
    .maybeSingle();
  const reportPayload: Record<string, unknown> = {
    radiology_order_id: input.orderId,
    findings:           input.notes ?? null,
    impression:         input.resultSummary ?? '',
    reported_by_radiologist_id: '00000000-0000-0000-0000-000000000001',
    dictated_at:        new Date().toISOString(),
    release_status:     'verified',
    approval_status:    'pending_approval',
    created_by:         '00000000-0000-0000-0000-000000000001',
  };
  if (existing) {
    await supabase.from('radiology_reports').update(reportPayload).eq('id', (existing as { id: string }).id);
  } else {
    await supabase.from('radiology_reports').insert(reportPayload);
  }

  // 2. Insert newly uploaded images as radiology_attachments rows.
  //    We query the current max sequence_no so re-saves don't reset numbering.
  if (input.imageFiles && input.imageFiles.length > 0) {
    const { data: existingAttachments } = await supabase
      .from('radiology_attachments')
      .select('sequence_no')
      .eq('radiology_order_id', input.orderId)
      .is('deleted_at', null)
      .order('sequence_no', { ascending: false })
      .limit(1);
    const maxSeq = (existingAttachments as Array<{ sequence_no: number }> | null)?.[0]?.sequence_no ?? 0;

    for (let i = 0; i < input.imageFiles.length; i++) {
      const file = input.imageFiles[i];
      const hexData = await fileToByteaHex(file);
      await supabase.from('radiology_attachments').insert({
        radiology_order_id: input.orderId,
        file_name:          file.name,
        file_type:          file.type,
        file_data:          hexData,
        file_size_bytes:    file.size,
        sequence_no:        maxSeq + i + 1,
        created_by:         '00000000-0000-0000-0000-000000000001',
      });
    }
  }

  // 3. Flip order status to reported.
  await supabase.from('radiology_orders').update({
    status: 'reported',
    imaging_completed_at: new Date().toISOString(),
  }).eq('id', input.orderId);

  const re = await fetchRadiologyOrder(input.orderId);
  return re ?? updateQueue(input.orderId, {
    status: 'reported',
    reportedAt: new Date().toISOString(),
    resultSummary: input.resultSummary,
    notes: input.notes,
  });
};

export const releaseRadiologyOrder = async (
  id: string,
): Promise<RadiologyOrderQueueEntry> => {
  const { supabase } = await import('@/lib/supabase/supabaseClient');
  // Flip the report to released + approved (kuppan as approver)
  const { data: kuppan } = await supabase.from('users').select('id').eq('username', 'kuppan').maybeSingle();
  const approverId = (kuppan as { id: string } | null)?.id ?? '00000000-0000-0000-0000-000000000001';
  const { data: report } = await supabase
    .from('radiology_reports')
    .select('id')
    .eq('radiology_order_id', id)
    .maybeSingle();
  if (report) {
    await supabase
      .from('radiology_reports')
      .update({
        release_status:  'released',
        approval_status: 'approved',
        approved_by:     approverId,
        approved_at:     new Date().toISOString(),
      })
      .eq('id', (report as { id: string }).id);
  }
  await supabase.from('radiology_orders').update({
    status: 'released',
    released_at: new Date().toISOString(),
  }).eq('id', id);
  const re = await fetchRadiologyOrder(id);
  if (re) {
    appendReportPending({
      opNumber: re.opNumber, patient: re.patient,
      report: { kind: 'radiology', testCode: re.testCode, testName: re.testName, status: 'reported', reportedAt: re.reportedAt },
    });
    return re;
  }
  return updateQueue(id, { status: 'released', releasedAt: new Date().toISOString() });
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
