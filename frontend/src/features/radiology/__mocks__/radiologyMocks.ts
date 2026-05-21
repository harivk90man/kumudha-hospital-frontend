import type {
  Modality,
  RadiologyOrderQueueEntry,
  RadiologyTestCatalogItem,
} from '../radiologyTypes';
import type { ClinicalPriority, OrderStatus } from '@/features/lab';
import { findPatient } from '@/features/patient/__mocks__/patientMocks';

export const mockRadiologyCatalog: RadiologyTestCatalogItem[] = [
  { id: 'rad-xr-knee',   code: 'XR-KNE', name: 'X-Ray Knee AP/Lat',     modality: 'xray',       bodyPart: 'Knee' },
  { id: 'rad-xr-lspine', code: 'XR-LSP', name: 'X-Ray L-Spine AP/Lat',  modality: 'xray',       bodyPart: 'Lumbar spine' },
  { id: 'rad-mri-lspine',code: 'MR-LSP', name: 'MRI Lumbar spine',      modality: 'mri',        bodyPart: 'Lumbar spine' },
  { id: 'rad-ct-lspine', code: 'CT-LSP', name: 'CT Lumbar spine',       modality: 'ct',         bodyPart: 'Lumbar spine' },
  { id: 'rad-usg-abd',   code: 'USG-ABD',name: 'USG Abdomen',           modality: 'ultrasound', bodyPart: 'Abdomen' },
  { id: 'rad-xr-chest',  code: 'XR-CHE', name: 'X-Ray Chest PA',        modality: 'xray',       bodyPart: 'Chest' },
  { id: 'rad-ct-head',   code: 'CT-HD',  name: 'CT Head plain',         modality: 'ct',         bodyPart: 'Head' },
  { id: 'rad-usg-obg',   code: 'USG-OBG',name: 'USG Obstetric',         modality: 'ultrasound', bodyPart: 'Pelvis' },
];

const minutesAgoIso = (m: number): string =>
  new Date(Date.now() - m * 60 * 1000).toISOString();

const isoOn = (date: string, hour: number, minute: number): string =>
  `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+05:30`;

interface RadSeed {
  id: string;
  opNumber: string;
  uhid: string;
  testCode: string;
  testName: string;
  modality: Modality;
  bodyPart: string;
  clinicalPriority?: ClinicalPriority;
  status: OrderStatus;
  orderedAt: string;
  capturedAt?: string;
  reportedAt?: string;
  releasedAt?: string;
  resultSummary?: string;
}

/** ~15 imaging orders. Mix of statuses + modalities. 4-5 reported. */
const seeds: RadSeed[] = [
  /* May 15 — released */
  { id: 'rord-001', opNumber: 'OP-2026-00030', uhid: 'KH-2026-00045', testCode: 'XR-LSP', testName: 'X-Ray L-Spine AP/Lat', modality: 'xray', bodyPart: 'Lumbar spine', clinicalPriority: 'routine', status: 'released',
    orderedAt: isoOn('2026-05-15', 11,  0), capturedAt: isoOn('2026-05-15', 11, 25), reportedAt: isoOn('2026-05-15', 13,  0), releasedAt: isoOn('2026-05-15', 14,  0),
    resultSummary: 'Mild loss of lumbar lordosis. No fracture. Disc spaces preserved.' },
  { id: 'rord-002', opNumber: 'OP-2026-00033', uhid: 'KH-2026-00046', testCode: 'XR-KNE', testName: 'X-Ray Knee AP/Lat',    modality: 'xray', bodyPart: 'Knee',          clinicalPriority: 'routine', status: 'released',
    orderedAt: isoOn('2026-05-15', 11, 30), capturedAt: isoOn('2026-05-15', 11, 50), reportedAt: isoOn('2026-05-15', 13, 30), releasedAt: isoOn('2026-05-15', 14, 30),
    resultSummary: 'Bilateral medial joint space narrowing — Grade II OA. No effusion.' },

  /* May 16 — released */
  { id: 'rord-003', opNumber: 'OP-2026-00073', uhid: 'KH-2024-04401', testCode: 'XR-CHE', testName: 'X-Ray Chest PA',       modality: 'xray', bodyPart: 'Chest',         clinicalPriority: 'routine', status: 'released',
    orderedAt: isoOn('2026-05-16', 11,  0), capturedAt: isoOn('2026-05-16', 11, 20), reportedAt: isoOn('2026-05-16', 13,  0), releasedAt: isoOn('2026-05-16', 14,  0),
    resultSummary: 'Cardiothoracic ratio normal. No active focal lesion. Costophrenic angles clear.' },

  /* Today — REPORTED (4) */
  { id: 'rord-010', opNumber: 'OP-2026-00118', uhid: 'KH-2026-00047', testCode: 'XR-SHO', testName: 'X-Ray Shoulder AP',    modality: 'xray', bodyPart: 'Shoulder',      clinicalPriority: 'routine', status: 'reported',
    orderedAt: minutesAgoIso(110), capturedAt: minutesAgoIso(85), reportedAt: minutesAgoIso(20),
    resultSummary: 'No bony abnormality. Joint space preserved. Soft tissue swelling at greater tubercle.' },
  { id: 'rord-011', opNumber: 'OP-2026-00121', uhid: 'KH-2026-00045', testCode: 'XR-LSP', testName: 'X-Ray L-Spine AP/Lat', modality: 'xray', bodyPart: 'Lumbar spine',  clinicalPriority: 'routine', status: 'reported',
    orderedAt: minutesAgoIso(140), capturedAt: minutesAgoIso(115), reportedAt: minutesAgoIso(35),
    resultSummary: 'Mild loss of lumbar lordosis. L4-L5 disc space narrowing. No vertebral collapse.' },
  { id: 'rord-012', opNumber: 'OP-2026-00122', uhid: 'KH-2026-00046', testCode: 'XR-KNE', testName: 'X-Ray Knee AP/Lat',    modality: 'xray', bodyPart: 'Knee',          clinicalPriority: 'routine', status: 'reported',
    orderedAt: minutesAgoIso(160), capturedAt: minutesAgoIso(140), reportedAt: minutesAgoIso(40),
    resultSummary: 'Tricompartmental OA. Medial joint space markedly narrowed. Subchondral sclerosis.' },
  { id: 'rord-013', opNumber: 'OP-2026-00166', uhid: 'KH-2025-08802', testCode: 'USG-OBG',testName: 'USG Obstetric',         modality: 'ultrasound', bodyPart: 'Pelvis',  clinicalPriority: 'routine', status: 'reported',
    orderedAt: minutesAgoIso(140), capturedAt: minutesAgoIso(95),  reportedAt: minutesAgoIso(30),
    resultSummary: 'Single live intrauterine pregnancy ~32 weeks. Cephalic. AFI 14. Placenta posterior, well away from os.' },

  /* Today — IN_PROGRESS (3) */
  { id: 'rord-020', opNumber: 'OP-2026-00123', uhid: 'KH-2026-00047', testCode: 'MR-LSP', testName: 'MRI Lumbar spine',     modality: 'mri', bodyPart: 'Lumbar spine',  clinicalPriority: 'urgent',  status: 'in_progress',
    orderedAt: minutesAgoIso(60), capturedAt: minutesAgoIso(20) },
  { id: 'rord-021', opNumber: 'OP-2026-00164', uhid: 'KH-2026-00055', testCode: 'XR-KNE', testName: 'X-Ray Knee AP/Lat',    modality: 'xray', bodyPart: 'Knee',          clinicalPriority: 'routine', status: 'in_progress',
    orderedAt: minutesAgoIso(50), capturedAt: minutesAgoIso(25) },
  { id: 'rord-022', opNumber: 'OP-2026-00149', uhid: 'KH-2024-04401', testCode: 'XR-WRT', testName: 'X-Ray Wrist AP/Lat',   modality: 'xray', bodyPart: 'Wrist',         clinicalPriority: 'routine', status: 'in_progress',
    orderedAt: minutesAgoIso(30), capturedAt: minutesAgoIso(15) },

  /* Today — AWAITING_PAYMENT */
  { id: 'rord-030', opNumber: 'OP-2026-00163', uhid: 'KH-2026-00054', testCode: 'CT-HD',  testName: 'CT Head plain',         modality: 'ct',  bodyPart: 'Head',          clinicalPriority: 'urgent',  status: 'awaiting_payment',
    orderedAt: minutesAgoIso(10) },

  /* Today — PAID (in queue, sample/scan not yet) */
  { id: 'rord-031', opNumber: 'OP-2026-00141', uhid: 'KH-2026-00050', testCode: 'XR-KNE', testName: 'X-Ray Knee AP/Lat',    modality: 'xray', bodyPart: 'Knee',          clinicalPriority: 'routine', status: 'paid',
    orderedAt: minutesAgoIso(8) },
  { id: 'rord-032', opNumber: 'OP-2026-00161', uhid: 'KH-2025-08801', testCode: 'XR-ANK', testName: 'X-Ray Ankle AP/Lat',   modality: 'xray', bodyPart: 'Ankle',         clinicalPriority: 'routine', status: 'paid',
    orderedAt: minutesAgoIso(15) },

  /* Today — RELEASED (consumed by doctor) */
  { id: 'rord-040', opNumber: 'OP-2026-00170', uhid: 'KH-2026-00050', testCode: 'XR-KNE', testName: 'X-Ray Knee AP/Lat',    modality: 'xray', bodyPart: 'Knee',          clinicalPriority: 'routine', status: 'released',
    orderedAt: minutesAgoIso(180), capturedAt: minutesAgoIso(140), reportedAt: minutesAgoIso(80), releasedAt: minutesAgoIso(50),
    resultSummary: 'Right knee — Grade I medial OA. No effusion. Patellofemoral joint preserved.' },
  { id: 'rord-041', opNumber: 'OP-2026-00177', uhid: 'KH-2025-08801', testCode: 'XR-CHE', testName: 'X-Ray Chest PA',       modality: 'xray', bodyPart: 'Chest',         clinicalPriority: 'routine', status: 'released',
    orderedAt: minutesAgoIso(220), capturedAt: minutesAgoIso(190), reportedAt: minutesAgoIso(120), releasedAt: minutesAgoIso(60),
    resultSummary: 'Lung fields clear. CTR normal. No pleural effusion. Diaphragm domes well-defined.' },
];

export const mockRadiologyOrderQueue: RadiologyOrderQueueEntry[] = seeds.map((s) => ({
  id: s.id,
  opNumber: s.opNumber,
  patient: findPatient(s.uhid),
  testCode: s.testCode,
  testName: s.testName,
  modality: s.modality,
  bodyPart: s.bodyPart,
  clinicalPriority: s.clinicalPriority,
  status: s.status,
  orderedAt: s.orderedAt,
  capturedAt: s.capturedAt,
  reportedAt: s.reportedAt,
  releasedAt: s.releasedAt,
  resultSummary: s.resultSummary,
}));
