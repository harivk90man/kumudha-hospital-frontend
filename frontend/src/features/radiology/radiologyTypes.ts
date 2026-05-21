/**
 * Radiology order + catalog types. Maps to schema v2 module 13-radiology and TSD-09.
 *
 * Wire enum values are lowercase_snake.
 */
import type { Iso8601, PatientSummary, Uuid } from '@/features/patient';
import type { ClinicalPriority, OrderStatus } from '@/features/lab';

/** TSD-09 line 56 radiology_orders.modality CHECK enum. */
export type Modality =
  | 'xray'
  | 'ultrasound'
  | 'ct'
  | 'mri'
  | 'mammography'
  | 'dexa'
  | 'fluoroscopy'
  | 'nuclear'
  | 'other';

export interface RadiologyTestCatalogItem {
  id: Uuid;
  code: string;
  name: string;
  modality: Modality;
  bodyPart: string;
}

export interface RadiologyOrder {
  id: Uuid;
  orderedAt: Iso8601;
  status: OrderStatus;
  testCode: string;
  testName: string;
  modality: Modality;
  clinicalPriority?: ClinicalPriority;
  /** TSD-09 §4.4 — short summary of impression. Full report in reportPdfUrl. */
  resultSummary?: string;
  reportPdfUrl?: string;
  /**
   * TSD-09 §4.3 `radiology_studies.images_url[]` — preview / thumbnail
   * URLs for the captured images. Full DICOM stays in PACS via study_uid.
   * Mock backend stores `URL.createObjectURL(file)` blob URLs; real
   * backend swaps for object-store URLs.
   */
  imagesUrl?: string[];
}

/* ---------- Radiology-tech actor view (TSD-09 §4.4) ---------- */

/**
 * The row a radiology technician sees in their worklist. Joins
 * `radiology_orders` ↔ `op_visits` ↔ `patients` ↔ `radiology_tests` so
 * the tech can act without chasing further fetches.
 */
export interface RadiologyOrderQueueEntry {
  id: Uuid;
  opNumber: string;
  patient: PatientSummary;
  testCode: string;
  testName: string;
  modality: Modality;
  bodyPart: string;
  clinicalPriority?: ClinicalPriority;
  status: OrderStatus;
  orderedAt: Iso8601;
  capturedAt?: Iso8601;
  reportedAt?: Iso8601;
  releasedAt?: Iso8601;
  /** Radiologist’s impression — short summary. */
  resultSummary?: string;
  notes?: string;
  /** TSD-09 §4.3 `radiology_studies.images_url[]` — see RadiologyOrder. */
  imagesUrl?: string[];
}

export interface RecordRadiologyResultInput {
  orderId: Uuid;
  resultSummary: string;
  notes?: string;
  /** Preview URLs for the captured images. See RadiologyOrder.imagesUrl. */
  imagesUrl?: string[];
}

export interface RadiologyOrdersListParams {
  page?: number;
  limit?: number;
  sort?: string;
  status?: OrderStatus | 'all';
  /**
   * Multi-status filter — drives the worklist `<MetricStrip>` chips. If
   * present and non-empty, wins over `status` on the wire.
   */
  statuses?: OrderStatus[];
  modality?: Modality | 'all';
  priority?: ClinicalPriority | 'all';
  q?: string;
}
