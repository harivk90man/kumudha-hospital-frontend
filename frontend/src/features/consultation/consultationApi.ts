import type {
  ConsultationContext,
  ConsultationContextBase,
  ConsultationDraft,
  PrescriptionItem,
  PrescriptionTemplate,
  VisitHistoryItem,
} from './consultationTypes';
import { mockDoctor } from '@/features/auth/__mocks__/authMocks';
import {
  mockConsultation,
  mockPastEncounterMeta,
  mockPastEncounters,
  mockPrescriptionTemplates,
} from './__mocks__/consultationMocks';
import { appendRxToQueue, removeRxFromQueue } from '@/features/pharmacy/__mocks__/pharmacyMocks';
import { mockMedicines } from '@/features/inventory/__mocks__/inventoryMocks';
import { mockQueue } from '@/features/encounter/__mocks__/encounterMocks';
import type { RxItem, RxQueueEntry } from '@/features/pharmacy';
import type { LabOrder, LabResultFlag, OrderStatus as LabOrderStatus } from '@/features/lab';
import type { Modality, RadiologyOrder } from '@/features/radiology';

// Demo images for the doctor's past-visit radiology view.
// Real images come from radiology_attachments bytea — this fallback keeps
// the consultation view populated until the doctor-side fetch is wired to
// the attachments table.
const PROCEDURE_DEMO_IMAGES: Record<string, string[]> = {
  'XR-CHE': [
    '/images/xray/person1000_virus_1681.jpeg',
    '/images/xray/person1015_virus_1701.jpeg',
    '/images/xray/Xray_share.jpg',
    '/images/xray/istockphoto-465407093-612x612.jpg',
    '/images/xray/360_F_197031952_MGjgPGxw58GG6vQvA8xZh2f015WISGPe.jpg',
  ],
  'XR-KNE': ['/images/xray/download.jpg'],
  'XR-LSP': ['/images/xray/xray-photograph-human-spine-scapula-600w-2535444807.webp'],
  'CT-HD':  ['https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Computed_tomography_of_human_brain_-_large.png/512px-Computed_tomography_of_human_brain_-_large.png'],
  'USG-ABD':['https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Abdominal_ultrasound_007.jpg/512px-Abdominal_ultrasound_007.jpg'],
};

const delay = <T>(value: T, ms = 250): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

/**
 * PostgREST serialises bytea as a `\xhex` string (e.g. "\\x89504e47…").
 * Turn that into a `data:<mime>;base64,…` URL so an <img> can render it
 * inline. Returns null when the input isn't a valid bytea hex literal —
 * caller falls back to the hardcoded demo image in that case.
 */
const byteaHexToDataUrl = (
  byteaHex: string | null | undefined,
  mime: string,
): string | null => {
  if (!byteaHex) return null;
  // Strip the leading `\x` (PostgREST default bytea encoding).
  const hex = byteaHex.startsWith('\\x') ? byteaHex.slice(2) : byteaHex;
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  // Build base64 in 8KB chunks so the call stack doesn't blow up on
  // large X-ray files passed via String.fromCharCode(...spread).
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunkSize)),
    );
  }
  return `data:${mime};base64,${btoa(binary)}`;
};

/**
 * Doses-per-day from a free-text frequency string. Handles:
 *   - Dash patterns: '1-0-1' → 2, '1-1-1' → 3, '1-1-1-1' → 4
 *   - Named:         OD/QD/HS/SOS/STAT → 1, BD/BID → 2, TDS/TID → 3, QID → 4
 * Falls back to 1 when nothing matches (defensive default so the
 * resulting quantity_prescribed still satisfies the CHECK > 0).
 *
 * Used to backfill `quantity_prescribed` when the doctor didn't type
 * a quantity — prescription_items has NOT NULL + CHECK > 0 on that
 * column, so a missing value was silently rejecting the whole insert.
 */
const dosesPerDay = (freq: string): number => {
  const f = freq.trim().toUpperCase();
  if (!f) return 1;
  // Dash-separated: count non-zero parts (handles '1-0-1', '0-1-1' etc.)
  if (/^[\d-]+$/.test(f)) {
    const parts = f.split('-').filter((p) => p !== '');
    const count = parts.filter((p) => {
      const n = parseInt(p, 10);
      return !Number.isNaN(n) && n > 0;
    }).length;
    return count > 0 ? count : 1;
  }
  if (f.includes('QID')) return 4;
  if (f.includes('TID') || f.includes('TDS')) return 3;
  if (f.includes('BD') || f.includes('BID')) return 2;
  return 1;
};

const safeQuantityPrescribed = (
  quantity: number | undefined,
  durationDays: number,
  frequency: string,
): number => {
  if (quantity != null && quantity > 0) return quantity;
  const days = durationDays > 0 ? durationDays : 1;
  return Math.max(1, days * dosesPerDay(frequency));
};

/**
 * Next `LAB-YYYY-NNNNN` from the max suffix already in `lab_orders`.
 * Ignores BULK-prefixed seeds via a strict 5-underscore LIKE pattern.
 * Caller is expected to retry on uq_lab_orders_number 23505.
 */
async function nextLabOrderNumber(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<string> {
  const year = new Date().getFullYear();
  const { data, error } = await supabase
    .from('lab_orders')
    .select('order_number')
    .like('order_number', `LAB-${year}-_____`)
    .order('order_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  let next = 1;
  if (data) {
    const m = String((data as { order_number: string }).order_number).match(/LAB-\d{4}-(\d+)$/);
    if (m) next = parseInt(m[1], 10) + 1;
  }
  return `LAB-${year}-${String(next).padStart(5, '0')}`;
}

/** Same shape as nextLabOrderNumber, for radiology_orders. */
async function nextRadOrderNumber(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<string> {
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

/** Seeded-random vitals so each queue patient has plausible, consistent values. */
const seedVitals = (opNumber: string) => {
  const h = [...opNumber].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return {
    recordedAt: new Date(Date.now() - ((h % 20) + 5) * 60_000).toISOString(),
    recordedBy: 'Nurse',
    bpSystolic: 110 + (h % 40),
    bpDiastolic: 70 + (h % 20),
    pulseRate: 68 + (h % 24),
    temperatureF: Math.round((97.8 + (h % 30) / 3) * 10) / 10,
    spo2: 96 + (h % 4),
    respiratoryRate: 14 + (h % 6),
  };
};

// ── ICD-10 catalog (common codes for demo) ─────────────────────────────────────

export interface Icd10Entry { code: string; description: string; }

const ICD10_CATALOG: Icd10Entry[] = [
  { code: 'I10',    description: 'Essential hypertension' },
  { code: 'I25.1',  description: 'Atherosclerotic heart disease of native coronary artery' },
  { code: 'I48.9',  description: 'Atrial fibrillation and flutter, unspecified' },
  { code: 'E11.9',  description: 'Type 2 diabetes mellitus, without complications' },
  { code: 'E11.65', description: 'Type 2 diabetes mellitus with hyperglycaemia' },
  { code: 'E78.5',  description: 'Hyperlipidaemia, unspecified' },
  { code: 'E03.9',  description: 'Hypothyroidism, unspecified' },
  { code: 'E05.9',  description: 'Thyrotoxicosis, unspecified' },
  { code: 'J00',    description: 'Acute nasopharyngitis (common cold)' },
  { code: 'J02.9',  description: 'Acute pharyngitis, unspecified' },
  { code: 'J03.9',  description: 'Acute tonsillitis, unspecified' },
  { code: 'J06.9',  description: 'Acute upper respiratory infection, unspecified' },
  { code: 'J11.1',  description: 'Influenza with respiratory manifestations' },
  { code: 'J18.9',  description: 'Pneumonia, unspecified' },
  { code: 'J45.9',  description: 'Asthma, unspecified' },
  { code: 'K21.0',  description: 'Gastro-oesophageal reflux disease with oesophagitis' },
  { code: 'K21.9',  description: 'Gastro-oesophageal reflux disease without oesophagitis' },
  { code: 'K29.7',  description: 'Gastritis, unspecified' },
  { code: 'K80.2',  description: 'Cholelithiasis, unspecified' },
  { code: 'M54.5',  description: 'Low back pain' },
  { code: 'M54.2',  description: 'Cervicalgia' },
  { code: 'M75.0',  description: 'Adhesive capsulitis of shoulder' },
  { code: 'M19.9',  description: 'Osteoarthritis, unspecified' },
  { code: 'M05.9',  description: 'Seropositive rheumatoid arthritis, unspecified' },
  { code: 'G43.9',  description: 'Migraine, unspecified' },
  { code: 'G47.0',  description: 'Insomnia' },
  { code: 'R51',    description: 'Headache' },
  { code: 'R05',    description: 'Cough' },
  { code: 'R50.9',  description: 'Fever, unspecified' },
  { code: 'R53.83', description: 'Fatigue' },
  { code: 'L20.9',  description: 'Atopic dermatitis, unspecified' },
  { code: 'L30.9',  description: 'Dermatitis, unspecified' },
  { code: 'A09',    description: 'Other and unspecified gastroenteritis and colitis' },
  { code: 'B34.9',  description: 'Viral infection, unspecified' },
  { code: 'N39.0',  description: 'Urinary tract infection, site not specified' },
  { code: 'N20.0',  description: 'Calculus of kidney' },
  { code: 'F32.9',  description: 'Major depressive disorder, single episode, unspecified' },
  { code: 'F41.1',  description: 'Generalised anxiety disorder' },
  { code: 'Z00.00', description: 'Routine general medical examination' },
];

/** GET /api/icd10/search?q= — returns up to 10 matching entries. */
export const searchIcd10 = (query: string): Icd10Entry[] => {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  return ICD10_CATALOG.filter(
    (e) => e.code.toLowerCase().includes(q) || e.description.toLowerCase().includes(q),
  ).slice(0, 10);
};

// ───────────────────────────────────────────────────────────────────────────────

/**
 * Consultation API surface. Mocked today; signatures match the final backend contract.
 *
 * Wire points (lists honour `?page=&limit=&sort=` per CLAUDE.md §3.4):
 *  GET   /api/doctor/consultations/:opNumber             → fetchConsultation (current + past; locked encounters render read-only)
 *  PATCH /api/doctor/consultations/:opNumber             → updateConsultation
 *  POST  /api/doctor/consultations/:opNumber/lock        → lockConsultation
 *  POST  /api/doctor/consultations/:opNumber/amend       → amendConsultation { reason }
 *  GET   /api/doctor/patients/:uhid/visits               → fetchVisitHistory
 *  GET   /api/prescription-templates                     → fetchPrescriptionTemplates
 *  POST  /api/prescription-templates                     → savePrescriptionTemplate
 *
 *  GET   /api/doctor/consultations/:opNumber/draft       → fetchDraft
 *  PUT   /api/doctor/consultations/:opNumber/draft       → saveDraft (upserts)
 *  POST  /api/doctor/consultations/:opNumber/draft/restore → restoreDraft (audited)
 *  DELETE /api/doctor/consultations/:opNumber/draft      → clearDraft
 */
/**
 * Per-op-number consultation store. Was a single mock today (Karthik’s
 * encounter), which meant any newly-registered patient inherited
 * Karthik’s notes/Rx/diagnoses when the doctor opened them. Now each
 * op_number gets its own context — built from the queue entry on
 * first fetch and persisted across subsequent reads/edits.
 *
 * Real backend obviously already does this — every `consultations`
 * row is keyed by op_visit_id.
 */
const liveConsultations: Record<string, ConsultationContext> = {
  // Seed: Karthik’s existing demo encounter (the one mockConsultation
  // describes) keeps its rich content so the doctor demo still has a
  // populated patient to show off.
  [mockConsultation.opNumber]: mockConsultation,
};

/**
 * Build a fresh, empty consultation context for an op_number that
 * doesn’t have one yet. Pulls patient identity + chief complaint from
 * the live queue entry created at registration.
 */
const blankContextFromQueue = (opNumber: string): ConsultationContext | null => {
  const entry = mockQueue.find((q) => q.opNumber === opNumber);
  if (!entry) return null;
  return {
    opNumber,
    status: { code: 0, name: 'in_consultation' },
    startedAt: new Date().toISOString(),
    patient: entry.patient,
    latestVitals: seedVitals(opNumber),
    notes: {
      chiefComplaint: entry.chiefComplaint || '',
      historyOfPresentIllness: '',
      examinationFindings: '',
      clinicalImpression: '',
      advice: '',
    },
    diagnoses: [],
    prescriptionItems: [],
    labOrders: [],
    radiologyOrders: [],
    recommendations: [],
    recommendationsNotes: '',
    criticalNotifications: [],
  };
};

/**
 * Build the consultation context from Supabase. If a `consultations`
 * row exists for this op_visit, its notes / diagnoses / prescription
 * items / lab + radiology orders are hydrated; otherwise the fields
 * stay empty and the doctor sees a fresh draft pre-filled only with
 * the op_visit's chief_complaint.
 */
const blankContextFromSupabase = async (
  opNumber: string,
): Promise<ConsultationContext | null> => {
  try {
    const { supabase } = await import('@/lib/supabase/supabaseClient');
    const { data, error } = await supabase
      .from('op_visits')
      .select(`
        id, op_number, chief_complaint, visit_date, closed_at,
        patients!op_visits_patient_id_fkey ( id, uhid, first_name, last_name, gender, date_of_birth, mobile, blood_group ),
        consultations (
          id, status, chief_complaint, history_of_present_illness,
          examination_findings, clinical_notes, advice, diagnoses,
          follow_up_required, follow_up_date, locked_at,
          prescriptions ( id, status, prescription_items ( id, medicine_id, medicine_name_snapshot, dosage, frequency, duration_days, quantity_prescribed, sequence_no ) )
        ),
        lab_orders ( id, status, priority, created_at,
          lab_order_items (
            id,
            lab_tests ( test_code, test_name ),
            lab_results ( value_raw, value_numeric, unit, flag )
          )
        ),
        radiology_orders ( id, status, priority, created_at, imaging_completed_at, released_at, radiology_procedures ( procedure_code, procedure_name, modality, body_part ), radiology_reports ( findings, impression ), radiology_attachments ( file_data, file_type, sequence_no ) )
      `)
      .eq('op_number', opNumber)
      .is('deleted_at', null)
      .maybeSingle();
    if (error || !data) return null;
    interface OpVisitRow {
      id: string; op_number: string; chief_complaint: string | null;
      visit_date: string; closed_at: string | null;
      patients: { id: string; uhid: string; first_name: string; last_name: string;
        gender: string; date_of_birth: string | null;
        mobile: string | null; blood_group: string | null } | null;
      consultations: Array<{
        id: string; status: string;
        chief_complaint: string | null; history_of_present_illness: string | null;
        examination_findings: { text?: string } | string | null;
        clinical_notes: string | null; advice: string | null;
        diagnoses: Array<{ icd10?: string; desc?: string; type?: string }> | null;
        follow_up_required: boolean | null; follow_up_date: string | null;
        locked_at: string | null;
        prescriptions: Array<{
          id: string; status: string;
          prescription_items: Array<{
            id: string; medicine_id: string; medicine_name_snapshot: string;
            dosage: string; frequency: string; duration_days: number;
            quantity_prescribed: number; sequence_no: number;
          }>;
        }>;
      }>;
      lab_orders: Array<{
        id: string; status: string; priority: string; created_at: string;
        lab_order_items: Array<{
          id: string;
          lab_tests: { test_code: string; test_name: string } | null;
          lab_results: Array<{
            value_raw: string | null;
            value_numeric: number | string | null;
            unit: string | null;
            flag: string | null;
          }>;
        }>;
      }>;
      radiology_orders: Array<{
        id: string; status: string; priority: string; created_at: string;
        imaging_completed_at: string | null; released_at: string | null;
        radiology_procedures: { procedure_code: string; procedure_name: string; modality: string; body_part: string } | null;
        radiology_reports: Array<{ findings: string | null; impression: string | null }>;
        radiology_attachments: Array<{
          file_data: string | null;
          file_type: string;
          sequence_no: number;
        }>;
      }>;
    }
    const row = data as unknown as OpVisitRow;
    const p = row.patients;
    if (!p) return null;
    const ageFromDob = (dob: string | null): number => {
      if (!dob) return 0;
      const d = new Date(dob); const n = new Date();
      return Math.max(0, n.getFullYear() - d.getFullYear() -
        (n < new Date(n.getFullYear(), d.getMonth(), d.getDate()) ? 1 : 0));
    };

    const cons = row.consultations[0];
    const examText = typeof cons?.examination_findings === 'string'
      ? cons.examination_findings
      : (cons?.examination_findings && typeof cons.examination_findings === 'object'
        ? cons.examination_findings.text ?? ''
        : '');

    const validDxTypes: ReadonlySet<string> = new Set(['primary', 'secondary', 'provisional', 'rule_out']);
    const diagnoses = (cons?.diagnoses ?? []).map((d, i) => ({
      id: `dx-${cons!.id}-${i}`,
      icd10: d.icd10,
      description: d.desc ?? '',
      type: (validDxTypes.has(d.type ?? '') ? d.type! : 'primary') as import('./consultationTypes').DiagnosisType,
    }));

    const rx = cons?.prescriptions[0];
    const prescriptionItems = (rx?.prescription_items ?? [])
      .slice()
      .sort((a, b) => a.sequence_no - b.sequence_no)
      .map((it): PrescriptionItem => ({
        id: it.id,
        medicineId: it.medicine_id,
        medicineNameSnapshot: it.medicine_name_snapshot,
        strength: '',
        dosage: it.dosage,
        frequency: it.frequency,
        route: 'PO',
        durationDays: it.duration_days,
        quantityPrescribed: it.quantity_prescribed,
        sequenceNo: it.sequence_no,
        // severity is a UI-only stock signal — defaulted to 'ok' on reload;
        // OrdersPanel re-derives the real value from current drug_stock.
        severity: 'ok' as PrescriptionItem['severity'],
      }));

    // Fan out lab_order_items so each test is its own LabOrder row in the
    // panel. Past-visit dialog needs `resultValue` / `resultUnit` / `flag`
    // / `resultSummary` populated; without these the dialog opens but
    // shows the "Report pending" fallback.
    const labOrders: LabOrder[] = [];
    for (const o of row.lab_orders) {
      const mappedStatus: LabOrder['status'] =
        o.status === 'released' ? 'reported'
        : o.status === 'reporting_pending' ? 'in_progress'
        : (o.status as LabOrder['status']);
      if (o.lab_order_items.length === 0) {
        labOrders.push({
          id: o.id,
          orderedAt: o.created_at,
          status: mappedStatus,
          testCode: '—',
          testName: '—',
          clinicalPriority: (o.priority ?? 'routine') as 'routine' | 'urgent' | 'stat',
        });
        continue;
      }
      for (const it of o.lab_order_items) {
        const t = it.lab_tests;
        const res = it.lab_results[0];
        const numeric = res?.value_numeric != null ? String(res.value_numeric) : undefined;
        labOrders.push({
          id: it.id,
          orderedAt: o.created_at,
          status: mappedStatus,
          testCode: t?.test_code ?? '—',
          testName: t?.test_name ?? '—',
          clinicalPriority: (o.priority ?? 'routine') as 'routine' | 'urgent' | 'stat',
          resultSummary: res?.value_raw ?? undefined,
          resultValue: numeric ?? res?.value_raw ?? undefined,
          resultUnit: res?.unit ?? undefined,
          flag: (res?.flag as LabResultFlag | undefined) ?? undefined,
        });
      }
    }

    const radiologyOrders = row.radiology_orders.map((o): RadiologyOrder => {
      const rpt = o.radiology_reports[0];
      const procCode = o.radiology_procedures?.procedure_code ?? '';
      const mappedStatus: RadiologyOrder['status'] =
        o.status === 'imaging_in_progress' ? 'in_progress'
        : o.status === 'imaging_completed' || o.status === 'reporting_pending' ? 'in_progress'
        : o.status === 'released' ? 'reported'
        : (o.status as RadiologyOrder['status']);
      const isViewable = mappedStatus === 'reported' || o.status === 'released';

      // Prefer the actual files the radiology tech uploaded
      // (radiology_attachments.file_data bytea). PostgREST returns bytea
      // as a `\xhex` string — convert to a base64 data URL the dialog's
      // <img> can render directly. Fall back to the hardcoded demo
      // image when no attachment is present.
      const attachments = (o.radiology_attachments ?? [])
        .slice()
        .sort((a, b) => a.sequence_no - b.sequence_no);
      const uploadedUrls = attachments
        .map((a) => byteaHexToDataUrl(a.file_data, a.file_type))
        .filter((u): u is string => u !== null);
      const fallback = isViewable ? PROCEDURE_DEMO_IMAGES[procCode] : undefined;

      return {
        id: o.id,
        orderedAt: o.created_at,
        status: mappedStatus,
        testCode: procCode || '—',
        testName: o.radiology_procedures?.procedure_name ?? '—',
        modality: (o.radiology_procedures?.modality ?? 'other') as Modality,
        clinicalPriority: (o.priority ?? 'routine') as 'routine' | 'urgent' | 'stat',
        resultSummary: rpt?.impression ?? undefined,
        imagesUrl: uploadedUrls.length > 0 ? uploadedUrls : fallback,
      };
    });

    return {
      opNumber,
      status: { code: cons?.locked_at ? 0 : 0, name: cons?.locked_at ? 'consultation_done' : 'in_consultation' },
      startedAt: new Date().toISOString(),
      lockedAt: cons?.locked_at ?? undefined,
      patient: {
        id: p.id, uhid: p.uhid,
        firstName: p.first_name, lastName: p.last_name,
        fullName: `${p.first_name} ${p.last_name}`.trim(),
        gender: p.gender as 'm' | 'f' | 'o',
        ageYears: ageFromDob(p.date_of_birth),
        mobile: p.mobile ?? undefined,
        bloodGroup: p.blood_group ?? undefined,
        allergies: [],
        chronicConditions: [],
      },
      latestVitals: seedVitals(opNumber),
      notes: {
        chiefComplaint: cons?.chief_complaint ?? row.chief_complaint ?? '',
        historyOfPresentIllness: cons?.history_of_present_illness ?? '',
        examinationFindings: examText,
        clinicalImpression: cons?.clinical_notes ?? '',
        advice: cons?.advice ?? '',
      },
      diagnoses,
      prescriptionItems,
      labOrders,
      radiologyOrders,
      recommendations: [],
      recommendationsNotes: '',
      criticalNotifications: [],
    };
  } catch {
    return null;
  }
};

export const fetchConsultation = async (opNumber: string): Promise<ConsultationContext> => {
  // Past visits live in mockPastEncounters and are read-only — these
  // are the rich seeded demo encounters (Karthik etc.). Real DB visits
  // bypass this map.
  const past = mockPastEncounters[opNumber];
  if (past) return delay(past);

  // Active draft already in memory — preserves uncommitted notes within
  // the same session (the doctor may have started typing and navigated
  // away).
  if (liveConsultations[opNumber]) {
    return delay(liveConsultations[opNumber]);
  }

  // Supabase first — hydrates saved consultation + Rx + orders so a
  // doctor re-opening a locked visit sees everything they wrote, and
  // a re-opened draft (no consultations row yet) just shows the patient
  // header + chief complaint.
  const fromDb = await blankContextFromSupabase(opNumber);
  if (fromDb) {
    liveConsultations[opNumber] = fromDb;
    return fromDb;
  }

  // Mock fallback for newly-registered patients that only exist in the
  // in-memory queue (no Supabase op_visits row yet).
  const fresh = blankContextFromQueue(opNumber);
  if (fresh) {
    liveConsultations[opNumber] = fresh;
    return delay(fresh);
  }

  // Last-resort fallback: the opNumber came from the patient history
  // panel but has no full encounter data in mockPastEncounters. Render
  // as a locked (read-only) past visit with the correct patient identity
  // but empty clinical content — the doctor can see the visit exists
  // without being shown today's session notes by mistake.
  const fallback: ConsultationContext = {
    opNumber,
    status: { code: 0, name: 'consultation_done' },
    startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    lockedAt:  new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    patient: mockConsultation.patient,
    latestVitals: seedVitals(opNumber),
    notes: { chiefComplaint: '', historyOfPresentIllness: '', examinationFindings: '', clinicalImpression: '', advice: '' },
    diagnoses: [],
    prescriptionItems: [],
    labOrders: [],
    radiologyOrders: [],
    recommendations: [],
    recommendationsNotes: '',
    criticalNotifications: [],
  };
  return delay(fallback);
};

export const updateConsultation = async (
  opNumber: string,
  patch: Partial<ConsultationContext>,
): Promise<ConsultationContext> => {
  const current = liveConsultations[opNumber] ?? (await fetchConsultation(opNumber));
  const next: ConsultationContext = { ...current, ...patch, opNumber };
  liveConsultations[opNumber] = next;

  // Already-locked consultation getting amended → keep the pharmacy
  // queue in sync. Add/edit items → re-push (queue dedupes by rx id
  // and preserves pickup status). Removed all items → pull the Rx
  // off the queue entirely.
  if (next.lockedAt) {
    syncRxToPharmacy(opNumber, next);
  }

  return delay(next);
};

/**
 * Push the latest prescription state for a locked consultation onto
 * the pharmacy queue. If the doctor amended away every item, the
 * Rx is removed from the queue (no medicines to dispense).
 */
const syncRxToPharmacy = (opNumber: string, ctx: ConsultationContext): void => {
  const rx = buildRxFromConsultation(ctx);
  if (rx) {
    appendRxToQueue(rx);
  } else {
    removeRxFromQueue(`rx-${opNumber}`);
  }
};

/**
 * Per-UHID past-visit history. Derived live from `mockPastEncounters`
 * (the single source of truth for past visits) so each chip — Rx count,
 * lab presence, radiology presence, report list — exactly matches what
 * the consultation page shows when the row is clicked. Real backend
 * joins op_visits → consultations filtered by patient_id and
 * status='consultation_done'/'closed' with the same projection.
 */
const META_BY_OP: Record<string, (typeof mockPastEncounterMeta)[number]> = Object.fromEntries(
  mockPastEncounterMeta.map((m) => [m.opNumber, m]),
);

const toVisitHistoryItem = (ctx: ConsultationContext): VisitHistoryItem => {
  const meta = META_BY_OP[ctx.opNumber];
  const primary = ctx.diagnoses.find((d) => d.type === 'primary') ?? ctx.diagnoses[0];
  const reports: VisitHistoryItem['reports'] = [
    ...ctx.labOrders
      .filter((o) => o.status === 'reported')
      .map((o) => ({
        kind: 'lab' as const,
        testCode: o.testCode,
        testName: o.testName,
        resultLine: o.resultSummary ?? '',
        flag: o.flag,
        reportPdfUrl: o.reportPdfUrl,
      })),
    ...ctx.radiologyOrders
      .filter((o) => o.status === 'reported')
      .map((o) => ({
        kind: 'radiology' as const,
        testCode: o.testCode,
        testName: o.testName,
        resultLine: o.resultSummary ?? '',
        reportPdfUrl: o.reportPdfUrl,
      })),
  ];
  return {
    opNumber: ctx.opNumber,
    visitDate: ctx.startedAt ?? new Date().toISOString(),
    doctorName: meta?.doctorName ?? '',
    department: meta?.department ?? '',
    chiefComplaint: ctx.notes.chiefComplaint,
    primaryDiagnosis: primary?.description,
    prescriptionCount: ctx.prescriptionItems.length,
    hasLabReports: ctx.labOrders.length > 0,
    hasRadiologyReports: ctx.radiologyOrders.length > 0,
    reports: reports.length > 0 ? reports : undefined,
  };
};

interface SbVisitHistoryRow {
  op_number: string;
  visit_date: string;
  chief_complaint: string | null;
  created_at: string;
  closed_at: string | null;
  users: { full_name: string;
    departments: { dept_name: string } | null } | null;
  // prescriptions live under consultations.consultation_id (no direct FK
  // from op_visits to prescriptions), so the embed nests them there.
  consultations: Array<{
    diagnoses: Array<{ icd10?: string; desc?: string; type?: string }> | null;
    prescriptions: Array<{ prescription_items: Array<{ id: string }> }>;
  }>;
  lab_orders: Array<{
    id: string; status: string; priority: string;
    created_at: string; completed_at: string | null;
    lab_order_items: Array<{
      id: string; sequence_no: number;
      lab_tests: { test_code: string; test_name: string } | null;
      lab_results: Array<{
        value_raw: string | null; value_numeric: number | string | null;
        unit: string | null; flag: string | null;
      }>;
    }>;
  }>;
  radiology_orders: Array<{
    id: string; status: string; priority: string; created_at: string;
    radiology_procedures: { procedure_code: string; procedure_name: string; modality: string } | null;
    radiology_reports: Array<{ findings: string | null; impression: string | null }>;
  }>;
}

const FE_LAB_STATUS: ReadonlyArray<LabOrderStatus> = [
  'ordered', 'awaiting_payment', 'paid', 'sample_collection', 'sample_collected',
  'in_progress', 'partially_reported', 'reported', 'released', 'cancelled',
];
const toLabStatus = (s: string): LabOrderStatus =>
  (FE_LAB_STATUS as readonly string[]).includes(s) ? (s as LabOrderStatus) : 'ordered';

/**
 * Fan out each lab_order_items row into its own LabOrder so the
 * patient-profile expand can render one View button per test (a
 * panel like CBC produces multiple component rows).
 */
const sbToLabOrders = (orders: SbVisitHistoryRow['lab_orders']): LabOrder[] => {
  const out: LabOrder[] = [];
  for (const o of orders) {
    const status = toLabStatus(o.status);
    if (o.lab_order_items.length === 0) {
      out.push({
        id: o.id,
        orderedAt: o.created_at,
        status,
        testCode: '—',
        testName: '—',
      });
      continue;
    }
    for (const it of o.lab_order_items) {
      const res = it.lab_results[0];
      const numeric = res?.value_numeric != null ? String(res.value_numeric) : undefined;
      out.push({
        id: it.id,
        orderedAt: o.created_at,
        status,
        testCode: it.lab_tests?.test_code ?? '—',
        testName: it.lab_tests?.test_name ?? '—',
        resultSummary: res?.value_raw ?? undefined,
        resultValue: numeric ?? res?.value_raw ?? undefined,
        resultUnit: res?.unit ?? undefined,
        flag: (res?.flag as LabResultFlag | undefined) ?? undefined,
      });
    }
  }
  return out;
};

const sbToRadiologyOrders = (orders: SbVisitHistoryRow['radiology_orders']): RadiologyOrder[] =>
  orders.map((o) => {
    const rpt = o.radiology_reports[0];
    const procCode = o.radiology_procedures?.procedure_code ?? '';
    const isViewable = o.status === 'reported' || o.status === 'released';
    return {
      id: o.id,
      orderedAt: o.created_at,
      status: toLabStatus(o.status),
      testCode: procCode || '—',
      testName: o.radiology_procedures?.procedure_name ?? '—',
      modality: (o.radiology_procedures?.modality ?? 'other') as Modality,
      resultSummary: rpt?.impression ?? rpt?.findings ?? undefined,
      imagesUrl: isViewable ? PROCEDURE_DEMO_IMAGES[procCode] : undefined,
    };
  });

const sbRowToVisitHistory = (r: SbVisitHistoryRow): VisitHistoryItem => {
  const cons = r.consultations[0];
  const primary = cons?.diagnoses?.find((d) => d.type === 'primary') ?? cons?.diagnoses?.[0];
  const rxItemCount = (cons?.prescriptions ?? [])
    .reduce((acc, p) => acc + (p.prescription_items?.length ?? 0), 0);
  const labOrders = sbToLabOrders(r.lab_orders);
  const radiologyOrders = sbToRadiologyOrders(r.radiology_orders);
  return {
    opNumber:            r.op_number,
    visitDate:           r.closed_at ?? r.created_at ?? r.visit_date,
    doctorName:          r.users?.full_name ?? '',
    department:          r.users?.departments?.dept_name ?? '',
    chiefComplaint:      r.chief_complaint ?? '',
    primaryDiagnosis:    primary?.desc,
    prescriptionCount:   rxItemCount,
    hasLabReports:       labOrders.length > 0,
    hasRadiologyReports: radiologyOrders.length > 0,
    labOrders:           labOrders.length > 0 ? labOrders : undefined,
    radiologyOrders:     radiologyOrders.length > 0 ? radiologyOrders : undefined,
  };
};

/**
 * Visit history for a patient. Reads from Supabase: resolves the UHID
 * to a patient_id, then pulls every op_visit joined with consultation
 * (for primary diagnosis), prescription items count, and lab/radiology
 * order presence. Falls back to mockPastEncounters when the patient
 * isn't in Supabase (e.g. the Karthik demo encounter still served
 * from in-memory mocks).
 */
export const fetchVisitHistory = async (
  uhid: string,
  params: { page?: number; limit?: number; sort?: string } = {},
): Promise<VisitHistoryItem[]> => {
  void params;
  try {
    const { supabase } = await import('@/lib/supabase/supabaseClient');
    const { data: p } = await supabase
      .from('patients').select('id').eq('uhid', uhid).is('deleted_at', null).maybeSingle();
    const patientId = (p as { id: string } | null)?.id;
    if (patientId) {
      const { data, error } = await supabase
        .from('op_visits')
        .select(`
          op_number, visit_date, chief_complaint, created_at, closed_at,
          users:users!op_visits_doctor_id_fkey ( full_name, departments!fk_users_department ( dept_name ) ),
          consultations ( diagnoses, prescriptions ( prescription_items ( id ) ) ),
          lab_orders (
            id, status, priority, created_at, completed_at,
            lab_order_items (
              id, sequence_no,
              lab_tests ( test_code, test_name ),
              lab_results ( value_raw, value_numeric, unit, flag )
            )
          ),
          radiology_orders (
            id, status, priority, created_at,
            radiology_procedures ( procedure_code, procedure_name, modality ),
            radiology_reports ( findings, impression )
          )
        `)
        .eq('patient_id', patientId)
        .is('deleted_at', null)
        .order('visit_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50);
      if (!error && data && data.length > 0) {
        return (data as unknown as SbVisitHistoryRow[]).map(sbRowToVisitHistory);
      }
    }
  } catch {
    // fall through to mock
  }
  const items = Object.values(mockPastEncounters)
    .filter((ctx) => ctx.patient.uhid === uhid)
    .sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''))
    .map(toVisitHistoryItem);
  return items;
};

export const fetchPrescriptionTemplates = async (
  params: { page?: number; limit?: number; sort?: string } = {},
): Promise<PrescriptionTemplate[]> => {
  void params;
  return delay(mockPrescriptionTemplates);
};

export const savePrescriptionTemplate = async (
  name: string,
  items: PrescriptionItem[],
): Promise<PrescriptionTemplate> =>
  delay({
    id: `tpl-${Date.now()}`,
    name,
    specialty: mockDoctor.specialization,
    itemCount: items.length,
    updatedAt: new Date().toISOString(),
    items,
  });

/* ---------- Lock + amendment (TSD-07 §4.2) ---------- */

/**
 * Build an RxQueueEntry from the locked consultation’s prescription items
 * so the pharmacy queue picks the Rx up immediately. Real backend writes
 * `prescriptions` + `prescription_items` and surfaces the Rx via a join.
 */
const buildRxFromConsultation = (ctx: ConsultationContext): RxQueueEntry | null => {
  if (!ctx.prescriptionItems || ctx.prescriptionItems.length === 0) return null;
  const items: RxItem[] = ctx.prescriptionItems.map((p) => {
    const med = mockMedicines.find((m) => m.id === p.medicineId);
    return {
      id: `rxi-${p.id}`,
      medicineId: p.medicineId,
      medicineName: p.medicineNameSnapshot,
      strength: p.strength,
      dosage: p.dosage,
      frequency: p.frequency,
      route: p.route,
      durationDays: p.durationDays,
      quantityPrescribed: p.quantityPrescribed ?? p.durationDays,
      availableQty: med?.availableQty ?? 0,
      stockSeverity: med?.severity ?? 'ok',
      genericName: med?.genericName,
      unitPrice: 2,        // mock — real backend reads medicines.unit_price
      gstPct: 12,
      notes: p.instructions,
    };
  });
  return {
    id: `rx-${ctx.opNumber}`,
    prescriptionNumber: `RX-${new Date().getFullYear()}-${ctx.opNumber.slice(-6)}`,
    opNumber: ctx.opNumber,
    patient: ctx.patient,
    doctorName: mockDoctor.fullName,
    status: 'rx_pending',
    prescribedAt: new Date().toISOString(),
    items,
  };
};

/**
 * Mutates `mockConsultation` in place for the demo so subsequent fetches
 * return the locked / amended state. Real backend writes
 * `consultations.locked_at` and an amendment audit row.
 *
 * Mock side-effect: if the locked consultation has prescription items,
 * push them onto the pharmacy queue so the pharmacist sees the Rx.
 */
export const lockConsultation = async (opNumber: string): Promise<ConsultationContext> => {
  const current = liveConsultations[opNumber] ?? (await fetchConsultation(opNumber));
  const lockedAt = new Date().toISOString();
  const next: ConsultationContext = { ...current, opNumber, lockedAt };
  liveConsultations[opNumber] = next;

  // Persist to Supabase: upsert the consultation row, then the prescription + items.
  try {
    const { supabase } = await import('@/lib/supabase/supabaseClient');
    const bs = '00000000-0000-0000-0000-000000000001';
    // Look up op_visit + patient + doctor
    const { data: opv } = await supabase
      .from('op_visits')
      .select('id, patient_id, doctor_id')
      .eq('op_number', opNumber)
      .is('deleted_at', null)
      .maybeSingle();
    if (opv) {
      const row = opv as { id: string; patient_id: string; doctor_id: string };
      // Upsert consultation row keyed by op_visit_id (UNIQUE on the table)
      const { data: existingCons } = await supabase
        .from('consultations').select('id').eq('op_visit_id', row.id).maybeSingle();
      const consPayload = {
        op_visit_id:                row.id,
        status:                     'locked',
        patient_id:                 row.patient_id,
        doctor_id:                  row.doctor_id,
        chief_complaint:            next.notes.chiefComplaint,
        history_of_present_illness: next.notes.historyOfPresentIllness,
        examination_findings:       next.notes.examinationFindings ? { text: next.notes.examinationFindings } : null,
        diagnoses:                  next.diagnoses.length > 0
                                      ? next.diagnoses.map((d) => ({ icd10: d.icd10, desc: d.description, type: d.type }))
                                      : [],
        clinical_notes:             next.notes.clinicalImpression,
        advice:                     next.notes.advice,
        next_action:                'prescription_only',
        follow_up_required:         false,
        follow_up_date:             null,
        locked_at:                  lockedAt,
        created_by:                 bs,
      };
      let consultationId: string | null = null;
      if (existingCons) {
        const id = (existingCons as { id: string }).id;
        // If already locked, the lock-guard trigger blocks updates — best-effort.
        await supabase.from('consultations').update(consPayload).eq('id', id);
        consultationId = id;
      } else {
        const { data: ins } = await supabase.from('consultations').insert(consPayload).select('id').maybeSingle();
        consultationId = (ins as { id: string } | null)?.id ?? null;
      }
      // Prescription + items
      if (consultationId && next.prescriptionItems.length > 0) {
        const { data: existingRx } = await supabase
          .from('prescriptions').select('id').eq('consultation_id', consultationId).maybeSingle();
        let rxId = (existingRx as { id: string } | null)?.id ?? null;
        if (!rxId) {
          const { data: insRx } = await supabase
            .from('prescriptions')
            .insert({
              consultation_id: consultationId,
              patient_id: row.patient_id,
              doctor_id: row.doctor_id,
              status: 'active',
              locked_at: lockedAt,
              created_by: bs,
            })
            .select('id').maybeSingle();
          rxId = (insRx as { id: string } | null)?.id ?? null;
        } else {
          await supabase.from('prescriptions').update({ status: 'active', locked_at: lockedAt }).eq('id', rxId);
          // Clear old items before re-inserting
          await supabase.from('prescription_items').delete().eq('prescription_id', rxId);
        }
        if (rxId) {
          const items = next.prescriptionItems.map((it, i) => ({
            prescription_id: rxId,
            medicine_id: it.medicineId,
            medicine_name_snapshot: `${it.medicineNameSnapshot}${it.strength ? ' ' + it.strength : ''}`,
            dosage: it.dosage,
            frequency: it.frequency,
            // Schema CHECK requires duration_days > 0 — default to 1 day
            // so a doctor who skipped this field still gets a row.
            duration_days: it.durationDays > 0 ? it.durationDays : 1,
            // Schema CHECK requires quantity_prescribed > 0; the FE type
            // had this optional which silently NULL'd the whole insert.
            // Backfill from durationDays * frequency-count when missing.
            quantity_prescribed: safeQuantityPrescribed(
              it.quantityPrescribed,
              it.durationDays,
              it.frequency,
            ),
            sequence_no: i + 1,
            created_by: bs,
          }));
          if (items.length > 0) {
            await supabase.from('prescription_items').insert(items);
          }
        }
      }

      // Lab orders — one lab_orders row + one lab_order_items row per
      // LabOrder in the locked context. Lookup lab_tests.id by test_code
      // so we don't need to thread the catalog UUID through the FE.
      // Panel surrogates ('pnl-…') have no lab_tests row and get skipped.
      if (next.labOrders.length > 0) {
        const labCodes = [...new Set(next.labOrders.map((o) => o.testCode))];
        const { data: labRows } = await supabase
          .from('lab_tests').select('id, test_code').in('test_code', labCodes);
        const labCodeToId = new Map<string, string>(
          (labRows as Array<{ id: string; test_code: string }> | null ?? [])
            .map((r) => [r.test_code, r.id]),
        );
        for (const o of next.labOrders) {
          const labTestId = labCodeToId.get(o.testCode);
          if (!labTestId) continue;
          let attempts = 0;
          let orderNum = await nextLabOrderNumber(supabase);
          let labOrderId: string | null = null;
          while (attempts < 5 && !labOrderId) {
            const { data: insOrd, error: insErr } = await supabase
              .from('lab_orders')
              .insert({
                order_number: orderNum,
                patient_id:   row.patient_id,
                op_visit_id:  row.id,
                doctor_id:    row.doctor_id,
                priority:     o.clinicalPriority ?? 'routine',
                status:       'ordered',
                created_by:   bs,
              })
              .select('id').maybeSingle();
            if (insErr) {
              const code = (insErr as unknown as { code?: string }).code;
              if (code === '23505') {
                attempts += 1;
                orderNum = await nextLabOrderNumber(supabase);
                continue;
              }
              throw insErr;
            }
            labOrderId = (insOrd as { id: string } | null)?.id ?? null;
          }
          if (labOrderId) {
            await supabase.from('lab_order_items').insert({
              lab_order_id: labOrderId,
              lab_test_id:  labTestId,
              status:       'pending',
              sequence_no:  1,
              created_by:   bs,
            });
          }
        }
      }

      // Radiology orders — one radiology_orders row per RadiologyOrder.
      // Schema chk_radiology_orders_context allows one procedure per
      // order, which matches our 1:1 mapping. Lookup procedure id by
      // procedure_code.
      if (next.radiologyOrders.length > 0) {
        const radCodes = [...new Set(next.radiologyOrders.map((o) => o.testCode))];
        const { data: radRows } = await supabase
          .from('radiology_procedures').select('id, procedure_code').in('procedure_code', radCodes);
        const radCodeToId = new Map<string, string>(
          (radRows as Array<{ id: string; procedure_code: string }> | null ?? [])
            .map((r) => [r.procedure_code, r.id]),
        );
        for (const o of next.radiologyOrders) {
          const procId = radCodeToId.get(o.testCode);
          if (!procId) continue;
          let attempts = 0;
          let orderNum = await nextRadOrderNumber(supabase);
          while (attempts < 5) {
            const { error: insErr } = await supabase
              .from('radiology_orders')
              .insert({
                order_number:           orderNum,
                patient_id:             row.patient_id,
                op_visit_id:            row.id,
                doctor_id:              row.doctor_id,
                radiology_procedure_id: procId,
                priority:               o.clinicalPriority ?? 'routine',
                status:                 'ordered',
                created_by:             bs,
              });
            if (insErr) {
              const code = (insErr as unknown as { code?: string }).code;
              if (code === '23505') {
                attempts += 1;
                orderNum = await nextRadOrderNumber(supabase);
                continue;
              }
              throw insErr;
            }
            break;
          }
        }
      }
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[lockConsultation] Supabase persistence failed; mock-only:', e);
  }

  syncRxToPharmacy(opNumber, next);
  return next;
};

export const amendConsultation = async (
  opNumber: string,
  reason: string,
  summary?: string,
): Promise<ConsultationContext> => {
  const current = liveConsultations[opNumber] ?? (await fetchConsultation(opNumber));
  const amendment = {
    id: `amd-${Date.now()}`,
    amendedBy: mockDoctor.id,
    amendedAt: new Date().toISOString(),
    reason,
    summary,
  };
  const next: ConsultationContext = {
    ...current,
    opNumber,
    amendments: [...(current.amendments ?? []), amendment],
  };
  liveConsultations[opNumber] = next;
  return delay(next);
};

/* ---------- Drafts (TSD-07 §4.7) ---------- */

/**
 * In-memory draft store for the demo. Real backend writes to
 * `consultation_drafts` with a 7-day TTL.
 *
 * Per TSD-07 §6: autosaves do NOT emit audit rows; only restores are audited.
 */
const draftStore = new Map<string, ConsultationDraft>();

export const fetchDraft = async (opNumber: string): Promise<ConsultationDraft | null> =>
  delay(draftStore.get(opNumber) ?? null, 50);

export const saveDraft = async (
  opNumber: string,
  draftData: Partial<ConsultationContextBase>,
): Promise<ConsultationDraft> => {
  const existing = draftStore.get(opNumber);
  const now = new Date().toISOString();
  const next: ConsultationDraft = {
    opNumber,
    doctorId: mockDoctor.id,
    draftData,
    lastSavedAt: now,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    autosaveCount: (existing?.autosaveCount ?? 0) + 1,
    restoredAt: existing?.restoredAt,
    version: (existing?.version ?? 0) + 1,
  };
  draftStore.set(opNumber, next);
  // Resolve immediately — autosaves should never block UI.
  return Promise.resolve(next);
};

export const restoreDraft = async (opNumber: string): Promise<ConsultationDraft | null> => {
  const found = draftStore.get(opNumber);
  if (!found) return null;
  const restored: ConsultationDraft = {
    ...found,
    restoredAt: new Date().toISOString(),
  };
  draftStore.set(opNumber, restored);
  return delay(restored, 50);
};

export const clearDraft = async (opNumber: string): Promise<void> => {
  draftStore.delete(opNumber);
};
