import type {
  LabOrderQueueEntry,
  LabResultFlag,
  OrderStatus,
} from '../labTypes';
import { findPatient } from '@/features/patient/__mocks__/patientMocks';

// Catalog (mockLabCatalog, mockLabPanels, mockLabComponents) lives in
// labCatalogueMocks.ts so this file can stay focused on the live order
// queue. Re-exported from the public lab index for convenience.
export { mockLabCatalog } from './labCatalogueMocks';

const minutesAgoIso = (m: number): string =>
  new Date(Date.now() - m * 60 * 1000).toISOString();

const isoOn = (date: string, hour: number, minute: number): string =>
  `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+05:30`;

interface LabSeed {
  id: string;
  opNumber: string;
  uhid: string;
  testCode: string;
  testName: string;
  panelCode?: string;
  panelName?: string;
  specimen: string;
  sampleVolumeMl?: number;
  requiresFasting?: boolean;
  clinicalPriority?: 'routine' | 'urgent' | 'stat';
  status: OrderStatus;
  /** ISO string. */
  orderedAt: string;
  sampleCollectedAt?: string;
  reportedAt?: string;
  releasedAt?: string;
  resultSummary?: string;
  resultNumeric?: number;
  resultUnit?: string;
  flag?: LabResultFlag;
}

/**
 * ~30 lab orders across May 15-17 with the brief's status mix:
 *   6-8 reported (with realistic numeric results — "blood reports ready")
 *   4-5 in_progress
 *   3-4 paid / sample_collected (early states)
 *   a few released (consumed by doctor)
 *   1 critical-flag (K+ 6.8 critical_high)
 */
const seeds: LabSeed[] = [
  /* ---- May 15 — released (closed) reports ---- */
  { id: 'lord-001', opNumber: 'OP-2026-00030', uhid: 'KH-2026-00045', testCode: 'CBC',     testName: 'Complete Blood Count', panelCode: 'CBC', panelName: 'Complete Blood Count', specimen: 'EDTA Blood',  sampleVolumeMl: 3, clinicalPriority: 'routine', status: 'released',
    orderedAt: isoOn('2026-05-15', 10,  5), sampleCollectedAt: isoOn('2026-05-15', 10, 35), reportedAt: isoOn('2026-05-15', 12, 10), releasedAt: isoOn('2026-05-15', 13, 30),
    resultSummary: 'Hb 13.2, WBC 7.4, Platelets 220 — within normal range.', flag: 'normal' },
  { id: 'lord-002', opNumber: 'OP-2026-00031', uhid: 'KH-2024-08812', testCode: 'TSH',     testName: 'Thyroid Stimulating Hormone',                                                  specimen: 'Serum',       sampleVolumeMl: 2, clinicalPriority: 'routine', status: 'released',
    orderedAt: isoOn('2026-05-15', 10, 20), sampleCollectedAt: isoOn('2026-05-15', 10, 50), reportedAt: isoOn('2026-05-15', 14, 0), releasedAt: isoOn('2026-05-15', 14, 35),
    resultSummary: 'TSH 4.8 mIU/L (ref 0.4–4.0) — mildly elevated.', resultNumeric: 4.8, resultUnit: 'mIU/L', flag: 'high' },
  { id: 'lord-003', opNumber: 'OP-2026-00033', uhid: 'KH-2026-00046', testCode: 'LFT',     testName: 'Liver Function Test',  panelCode: 'LFT', panelName: 'Liver Function Test', specimen: 'Serum',       sampleVolumeMl: 3, requiresFasting: true,  clinicalPriority: 'routine', status: 'released',
    orderedAt: isoOn('2026-05-15', 11,  0), sampleCollectedAt: isoOn('2026-05-15', 11, 15), reportedAt: isoOn('2026-05-15', 15, 30), releasedAt: isoOn('2026-05-15', 16,  5),
    resultSummary: 'ALT 38, AST 32, T.Bili 1.0 — liver enzymes normal.', flag: 'normal' },

  /* ---- May 16 — released ---- */
  { id: 'lord-004', opNumber: 'OP-2026-00071', uhid: 'KH-2018-00094', testCode: 'HBA1C',   testName: 'HbA1c',                                                                          specimen: 'EDTA Blood',  sampleVolumeMl: 2, clinicalPriority: 'routine', status: 'released',
    orderedAt: isoOn('2026-05-16', 10, 30), sampleCollectedAt: isoOn('2026-05-16', 10, 50), reportedAt: isoOn('2026-05-16', 13, 15), releasedAt: isoOn('2026-05-16', 14,  0),
    resultSummary: 'HbA1c 8.2% — sub-optimal glycemic control.', resultNumeric: 8.2, resultUnit: '%', flag: 'high' },
  { id: 'lord-005', opNumber: 'OP-2026-00073', uhid: 'KH-2024-04401', testCode: 'LIPID',   testName: 'Lipid Profile',                                                                  specimen: 'Serum',       sampleVolumeMl: 3, requiresFasting: true,  clinicalPriority: 'routine', status: 'released',
    orderedAt: isoOn('2026-05-16', 11,  5), sampleCollectedAt: isoOn('2026-05-16', 11, 30), reportedAt: isoOn('2026-05-16', 15, 10), releasedAt: isoOn('2026-05-16', 16,  0),
    resultSummary: 'Total chol 218, LDL 142, HDL 38, TG 184 — borderline-high.', flag: 'high' },

  /* ---- Today (May 17) — REPORTED (ready for doctor to view) — 7 ---- */
  { id: 'lord-010', opNumber: 'OP-2026-00121', uhid: 'KH-2026-00045', testCode: 'POTASSIUM', testName: 'Serum Potassium',                                                              specimen: 'Serum',       sampleVolumeMl: 2, clinicalPriority: 'urgent',  status: 'reported',
    orderedAt: minutesAgoIso(110), sampleCollectedAt: minutesAgoIso(95), reportedAt: minutesAgoIso(15),
    resultSummary: 'K+ 6.8 mmol/L (ref 3.5–5.1) — CRITICAL hyperkalaemia. Repeat sample sent.', resultNumeric: 6.8, resultUnit: 'mmol/L', flag: 'critical_high' },
  { id: 'lord-011', opNumber: 'OP-2026-00121', uhid: 'KH-2026-00045', testCode: 'CBC',       testName: 'Complete Blood Count', panelCode: 'CBC', panelName: 'Complete Blood Count', specimen: 'EDTA Blood',  sampleVolumeMl: 3, clinicalPriority: 'routine', status: 'reported',
    orderedAt: minutesAgoIso(95), sampleCollectedAt: minutesAgoIso(75), reportedAt: minutesAgoIso(10),
    resultSummary: 'Hb 12.4, WBC 8.2, Platelets 240 — within normal range.', flag: 'normal' },
  { id: 'lord-012', opNumber: 'OP-2026-00122', uhid: 'KH-2026-00046', testCode: 'LFT',       testName: 'Liver Function Test',  panelCode: 'LFT', panelName: 'Liver Function Test', specimen: 'Serum',       sampleVolumeMl: 3, requiresFasting: true, clinicalPriority: 'routine', status: 'reported',
    orderedAt: minutesAgoIso(180), sampleCollectedAt: minutesAgoIso(150), reportedAt: minutesAgoIso(20),
    resultSummary: 'ALT 52, AST 48, T.Bili 0.9 — mildly elevated transaminases.', flag: 'high' },
  { id: 'lord-013', opNumber: 'OP-2026-00165', uhid: 'KH-2024-04401', testCode: 'CRP',       testName: 'C-Reactive Protein',                                                            specimen: 'Serum',       sampleVolumeMl: 2, clinicalPriority: 'routine', status: 'reported',
    orderedAt: minutesAgoIso(140), sampleCollectedAt: minutesAgoIso(115), reportedAt: minutesAgoIso(25),
    resultSummary: 'CRP 18 mg/L (ref < 5) — elevated, consistent with active inflammation.', resultNumeric: 18, resultUnit: 'mg/L', flag: 'high' },
  { id: 'lord-014', opNumber: 'OP-2026-00168', uhid: 'KH-2018-00094', testCode: 'HBA1C',     testName: 'HbA1c',                                                                          specimen: 'EDTA Blood',  sampleVolumeMl: 2, clinicalPriority: 'routine', status: 'reported',
    orderedAt: minutesAgoIso(220), sampleCollectedAt: minutesAgoIso(190), reportedAt: minutesAgoIso(30),
    resultSummary: 'HbA1c 7.4% — sub-optimal control, trending down from 8.1% three months ago.', resultNumeric: 7.4, resultUnit: '%', flag: 'high' },
  { id: 'lord-015', opNumber: 'OP-2026-00183', uhid: 'KH-2026-00064', testCode: 'RFT',       testName: 'Renal Function Test',  panelCode: 'RFT', panelName: 'Renal Function Test', specimen: 'Serum',       sampleVolumeMl: 3, clinicalPriority: 'routine', status: 'reported',
    orderedAt: minutesAgoIso(200), sampleCollectedAt: minutesAgoIso(170), reportedAt: minutesAgoIso(35),
    resultSummary: 'Urea 64, Creat 1.6, eGFR 48 — Stage 3a CKD, stable.', flag: 'high' },
  { id: 'lord-016', opNumber: 'OP-2026-00118', uhid: 'KH-2026-00047', testCode: 'CRP',       testName: 'C-Reactive Protein',                                                            specimen: 'Serum',       sampleVolumeMl: 2, clinicalPriority: 'routine', status: 'reported',
    orderedAt: minutesAgoIso(180), sampleCollectedAt: minutesAgoIso(150), reportedAt: minutesAgoIso(45),
    resultSummary: 'CRP 8 mg/L (ref < 5) — mildly elevated.', resultNumeric: 8, resultUnit: 'mg/L', flag: 'high' },

  /* ---- Today — IN_PROGRESS (4) ---- */
  { id: 'lord-020', opNumber: 'OP-2026-00122', uhid: 'KH-2026-00046', testCode: 'RFT',       testName: 'Renal Function Test',  panelCode: 'RFT', panelName: 'Renal Function Test', specimen: 'Serum',       sampleVolumeMl: 3, clinicalPriority: 'routine', status: 'in_progress',
    orderedAt: minutesAgoIso(50), sampleCollectedAt: minutesAgoIso(35) },
  { id: 'lord-021', opNumber: 'OP-2026-00163', uhid: 'KH-2026-00054', testCode: 'CBC',       testName: 'Complete Blood Count', panelCode: 'CBC', panelName: 'Complete Blood Count', specimen: 'EDTA Blood',  sampleVolumeMl: 3, clinicalPriority: 'routine', status: 'in_progress',
    orderedAt: minutesAgoIso(40), sampleCollectedAt: minutesAgoIso(28) },
  { id: 'lord-022', opNumber: 'OP-2026-00164', uhid: 'KH-2026-00055', testCode: 'CRP',       testName: 'C-Reactive Protein',                                                            specimen: 'Serum',       sampleVolumeMl: 2, clinicalPriority: 'routine', status: 'in_progress',
    orderedAt: minutesAgoIso(35), sampleCollectedAt: minutesAgoIso(20) },
  { id: 'lord-023', opNumber: 'OP-2026-00167', uhid: 'KH-2024-04420', testCode: 'CBC',       testName: 'Complete Blood Count', panelCode: 'CBC', panelName: 'Complete Blood Count', specimen: 'EDTA Blood',  sampleVolumeMl: 3, clinicalPriority: 'routine', status: 'in_progress',
    orderedAt: minutesAgoIso(60), sampleCollectedAt: minutesAgoIso(40) },

  /* ---- Today — PAID / SAMPLE_COLLECTED (3) ---- */
  { id: 'lord-030', opNumber: 'OP-2026-00153', uhid: 'KH-2026-00051', testCode: 'CBC',     testName: 'Complete Blood Count', panelCode: 'CBC', panelName: 'Complete Blood Count', specimen: 'EDTA Blood',  sampleVolumeMl: 3, clinicalPriority: 'routine', status: 'paid',
    orderedAt: minutesAgoIso(20) },
  { id: 'lord-031', opNumber: 'OP-2026-00157', uhid: 'KH-2026-00046', testCode: 'HBA1C',   testName: 'HbA1c',                                                                          specimen: 'EDTA Blood',  sampleVolumeMl: 2, clinicalPriority: 'routine', status: 'sample_collected',
    orderedAt: minutesAgoIso(30), sampleCollectedAt: minutesAgoIso(15) },
  { id: 'lord-032', opNumber: 'OP-2026-00160', uhid: 'KH-2026-00049', testCode: 'TSH',     testName: 'Thyroid Stimulating Hormone',                                                  specimen: 'Serum',       sampleVolumeMl: 2, clinicalPriority: 'routine', status: 'sample_collection',
    orderedAt: minutesAgoIso(15) },

  /* ---- Today — RELEASED (consumed by doctor) (3) ---- */
  { id: 'lord-040', opNumber: 'OP-2026-00170', uhid: 'KH-2026-00050', testCode: 'CBC',     testName: 'Complete Blood Count', panelCode: 'CBC', panelName: 'Complete Blood Count', specimen: 'EDTA Blood',  sampleVolumeMl: 3, clinicalPriority: 'routine', status: 'released',
    orderedAt: minutesAgoIso(160), sampleCollectedAt: minutesAgoIso(140), reportedAt: minutesAgoIso(80), releasedAt: minutesAgoIso(40),
    resultSummary: 'Hb 12.8, WBC 6.4, Platelets 198 — within normal range.', flag: 'normal' },
  { id: 'lord-041', opNumber: 'OP-2026-00176', uhid: 'KH-2024-06210', testCode: 'LFT',     testName: 'Liver Function Test',  panelCode: 'LFT', panelName: 'Liver Function Test', specimen: 'Serum',       sampleVolumeMl: 3, requiresFasting: true,  clinicalPriority: 'routine', status: 'released',
    orderedAt: minutesAgoIso(200), sampleCollectedAt: minutesAgoIso(180), reportedAt: minutesAgoIso(100), releasedAt: minutesAgoIso(60),
    resultSummary: 'ALT 30, AST 28, T.Bili 0.8 — within normal range.', flag: 'normal' },
  { id: 'lord-042', opNumber: 'OP-2026-00179', uhid: 'KH-2026-00058', testCode: 'FBS',     testName: 'Fasting Blood Sugar',                                                            specimen: 'Fluoride Blood', sampleVolumeMl: 2, requiresFasting: true,  clinicalPriority: 'routine', status: 'released',
    orderedAt: minutesAgoIso(180), sampleCollectedAt: minutesAgoIso(160), reportedAt: minutesAgoIso(110), releasedAt: minutesAgoIso(70),
    resultSummary: 'FBS 142 mg/dL (ref < 100) — elevated.', resultNumeric: 142, resultUnit: 'mg/dL', flag: 'high' },

  /* ---- Today — AWAITING_PAYMENT (just placed) ---- */
  { id: 'lord-050', opNumber: 'OP-2026-00118', uhid: 'KH-2026-00047', testCode: 'URN',     testName: 'Urine Routine & Microscopy', panelCode: 'URN', panelName: 'Urine Routine & Microscopy', specimen: 'Urine',  sampleVolumeMl: 10, clinicalPriority: 'routine', status: 'awaiting_payment',
    orderedAt: minutesAgoIso(5) },
];

export const mockLabOrderQueue: LabOrderQueueEntry[] = seeds.map((s) => ({
  id: s.id,
  opNumber: s.opNumber,
  patient: findPatient(s.uhid),
  testCode: s.testCode,
  testName: s.testName,
  panelCode: s.panelCode,
  panelName: s.panelName,
  specimen: s.specimen,
  sampleVolumeMl: s.sampleVolumeMl,
  requiresFasting: s.requiresFasting,
  clinicalPriority: s.clinicalPriority,
  status: s.status,
  orderedAt: s.orderedAt,
  sampleCollectedAt: s.sampleCollectedAt,
  reportedAt: s.reportedAt,
  releasedAt: s.releasedAt,
  resultSummary: s.resultSummary,
  resultNumeric: s.resultNumeric,
  resultUnit: s.resultUnit,
  flag: s.flag,
}));
