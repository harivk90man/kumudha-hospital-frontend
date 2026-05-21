import type { RxItem, RxQueueEntry, RxQueueStatus } from '../pharmacyTypes';
import type { StockSeverity } from '@/features/inventory';
import { MEDICINE_DEFAULT_GST } from '@/config/taxRates';
import { findPatient } from '@/features/patient/__mocks__/patientMocks';
import { mockMedicines, mockShelfQty } from '@/features/inventory/__mocks__/inventoryMocks';

const minutesAgoIso = (m: number): string =>
  new Date(Date.now() - m * 60 * 1000).toISOString();

const isoOn = (date: string, hour: number, minute: number): string =>
  `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+05:30`;

/* ---------- Item builder ---------- */
//
// Resolve a medicine id â†’ an RxItem snapshot. Pulls availableQty +
// shelfQty + severity + genericName from the inventory catalogue so
// the dispense surface sees a consistent stock picture.

interface RxLineSpec {
  medicineId: string;
  dosage: string;
  frequency: string;
  route: string;
  durationDays: number;
  quantityPrescribed: number;
  unitPrice: number;
  notes?: string;
}

const lineFromSpec = (spec: RxLineSpec, idx: number): RxItem => {
  const m = mockMedicines.find((x) => x.id === spec.medicineId);
  if (!m) throw new Error(`Rx item references unknown medicine ${spec.medicineId}`);
  const available = m.availableQty;
  const shelf = mockShelfQty[spec.medicineId] ?? available;
  const sev: StockSeverity = m.severity;
  return {
    id: `rxi-${idx}`,
    medicineId: m.id,
    medicineName: m.name,
    strength: m.strength,
    dosage: spec.dosage,
    frequency: spec.frequency,
    route: spec.route,
    durationDays: spec.durationDays,
    quantityPrescribed: spec.quantityPrescribed,
    availableQty: available,
    shelfQty: shelf,
    stockSeverity: sev,
    genericName: m.genericName,
    unitPrice: spec.unitPrice,
    gstPct: MEDICINE_DEFAULT_GST,
    notes: spec.notes,
  };
};

let rxItemSeq = 1;

/* ---------- Rx seed ---------- */

interface RxSeed {
  id: string;
  prescriptionNumber: string;
  opNumber: string;
  uhid: string;
  doctorName: string;
  status: RxQueueStatus;
  prescribedAt: string;
  pickedUpAt?: string;
  dispensedAt?: string;
  lines: RxLineSpec[];
}

const seeds: RxSeed[] = [
  /* ---- TODAY (May 17) â€” rx_pending (10) ---- */
  { id: 'rx-101', prescriptionNumber: 'RX-2026-001045', opNumber: 'OP-2026-00121', uhid: 'KH-2026-00045', doctorName: 'Dr. Naveen Kumar', status: 'rx_pending',     prescribedAt: minutesAgoIso(15),
    lines: [
      { medicineId: 'med-100', dosage: '1 tab', frequency: 'TDS', route: 'PO', durationDays: 5, quantityPrescribed: 15, unitPrice: 1.5 },
      { medicineId: 'med-140', dosage: '1 tab', frequency: 'OD',  route: 'PO', durationDays: 7, quantityPrescribed: 7,  unitPrice: 4   },
    ] },
  { id: 'rx-102', prescriptionNumber: 'RX-2026-001046', opNumber: 'OP-2026-00122', uhid: 'KH-2026-00046', doctorName: 'Dr. Naveen Kumar', status: 'rx_pending',     prescribedAt: minutesAgoIso(40),
    lines: [
      { medicineId: 'med-130', dosage: '1 tab', frequency: 'BD',  route: 'PO', durationDays: 30, quantityPrescribed: 60, unitPrice: 2.5 },
      { medicineId: 'med-120', dosage: '1 tab', frequency: 'OD',  route: 'PO', durationDays: 30, quantityPrescribed: 30, unitPrice: 3.0 },
      { medicineId: 'med-101', dosage: '1 tab', frequency: 'BD',  route: 'PO', durationDays: 5,  quantityPrescribed: 10, unitPrice: 2.0, notes: 'Fetch from back-storage' },
    ] },
  { id: 'rx-103', prescriptionNumber: 'RX-2026-001047', opNumber: 'OP-2026-00168', uhid: 'KH-2025-09020', doctorName: 'Dr. Anand', status: 'rx_pending',     prescribedAt: minutesAgoIso(25),
    lines: [
      { medicineId: 'med-130', dosage: '1 tab', frequency: 'BD',  route: 'PO', durationDays: 30, quantityPrescribed: 60, unitPrice: 2.5 },
      { medicineId: 'med-122', dosage: '1 tab', frequency: 'OD',  route: 'PO', durationDays: 30, quantityPrescribed: 30, unitPrice: 4.5 },
    ] },
  { id: 'rx-104', prescriptionNumber: 'RX-2026-001048', opNumber: 'OP-2026-00169', uhid: 'KH-2026-00049', doctorName: 'Dr. Naveen Kumar', status: 'rx_pending',     prescribedAt: minutesAgoIso(10),
    lines: [
      { medicineId: 'med-100', dosage: '1 tab', frequency: 'QID', route: 'PO', durationDays: 3, quantityPrescribed: 12, unitPrice: 1.5 },
      { medicineId: 'med-104', dosage: '1 tab', frequency: 'BD',  route: 'PO', durationDays: 3, quantityPrescribed: 6,  unitPrice: 6.5 },
    ] },
  { id: 'rx-105', prescriptionNumber: 'RX-2026-001049', opNumber: 'OP-2026-00163', uhid: 'KH-2026-00060', doctorName: 'Dr. Anand', status: 'rx_pending',     prescribedAt: minutesAgoIso(8),
    lines: [
      { medicineId: 'med-100', dosage: '1 tab', frequency: 'TDS', route: 'PO', durationDays: 3, quantityPrescribed: 9,  unitPrice: 1.5 },
      { medicineId: 'med-153', dosage: '1 tab', frequency: 'OD',  route: 'PO', durationDays: 5, quantityPrescribed: 5,  unitPrice: 1.2 },
    ] },
  { id: 'rx-106', prescriptionNumber: 'RX-2026-001050', opNumber: 'OP-2026-00164', uhid: 'KH-2026-00069', doctorName: 'Dr. Naveen Kumar', status: 'rx_pending',     prescribedAt: minutesAgoIso(20),
    lines: [
      { medicineId: 'med-102', dosage: '1 tab', frequency: 'BD',  route: 'PO', durationDays: 5, quantityPrescribed: 10, unitPrice: 3.0 },
      { medicineId: 'med-170', dosage: 'Apply', frequency: 'BD',  route: 'TOP',durationDays: 7, quantityPrescribed: 1,  unitPrice: 95  },
    ] },
  { id: 'rx-107', prescriptionNumber: 'RX-2026-001051', opNumber: 'OP-2026-00165', uhid: 'KH-2024-04401', doctorName: 'Dr. Anand', status: 'rx_pending',     prescribedAt: minutesAgoIso(35),
    lines: [
      { medicineId: 'med-121', dosage: '1 tab', frequency: 'OD',  route: 'PO', durationDays: 30, quantityPrescribed: 30, unitPrice: 1.8 },
      { medicineId: 'med-124', dosage: '1 tab', frequency: 'OD',  route: 'PO', durationDays: 30, quantityPrescribed: 30, unitPrice: 0.6 },
      { medicineId: 'med-123', dosage: '1 tab', frequency: 'HS',  route: 'PO', durationDays: 30, quantityPrescribed: 30, unitPrice: 2.0 },
    ] },
  { id: 'rx-108', prescriptionNumber: 'RX-2026-001052', opNumber: 'OP-2026-00166', uhid: 'KH-2025-09015', doctorName: 'Dr. Lakshmi',   status: 'rx_pending',     prescribedAt: minutesAgoIso(45),
    lines: [
      { medicineId: 'med-162', dosage: '1 tab', frequency: 'OD',  route: 'PO', durationDays: 30, quantityPrescribed: 30, unitPrice: 4.0 },
      { medicineId: 'med-163', dosage: '1 tab', frequency: 'OD',  route: 'PO', durationDays: 30, quantityPrescribed: 30, unitPrice: 5.0 },
    ] },
  { id: 'rx-109', prescriptionNumber: 'RX-2026-001053', opNumber: 'OP-2026-00167', uhid: 'KH-2024-04416', doctorName: 'Dr. Ravi',   status: 'rx_pending',     prescribedAt: minutesAgoIso(50),
    lines: [
      { medicineId: 'med-102', dosage: '1 tab', frequency: 'BD',  route: 'PO', durationDays: 5, quantityPrescribed: 10, unitPrice: 3.0 },
      { medicineId: 'med-170', dosage: 'Apply', frequency: 'TDS', route: 'TOP',durationDays: 5, quantityPrescribed: 1,  unitPrice: 95  },
    ] },
  { id: 'rx-110', prescriptionNumber: 'RX-2026-001054', opNumber: 'OP-2026-00150', uhid: 'KH-2026-00071', doctorName: 'Dr. Meera',   status: 'rx_pending',     prescribedAt: minutesAgoIso(2),
    lines: [
      { medicineId: 'med-100', dosage: '1 tab', frequency: 'TDS', route: 'PO', durationDays: 3, quantityPrescribed: 9,  unitPrice: 1.5 },
      { medicineId: 'med-115', dosage: '1 tab', frequency: 'TDS', route: 'PO', durationDays: 5, quantityPrescribed: 15, unitPrice: 2.5 },
    ] },

  /* ---- TODAY â€” rx_in_progress (4) ---- */
  { id: 'rx-120', prescriptionNumber: 'RX-2026-001040', opNumber: 'OP-2026-00170', uhid: 'KH-2024-04405', doctorName: 'Dr. Naveen Kumar', status: 'rx_in_progress', prescribedAt: minutesAgoIso(120), pickedUpAt: minutesAgoIso(5),
    lines: [
      { medicineId: 'med-102', dosage: '1 tab', frequency: 'BD',  route: 'PO', durationDays: 7, quantityPrescribed: 14, unitPrice: 3.0 },
      { medicineId: 'med-141', dosage: '1 cap', frequency: 'OD',  route: 'PO', durationDays: 7, quantityPrescribed: 7,  unitPrice: 3.5 },
    ] },
  { id: 'rx-121', prescriptionNumber: 'RX-2026-001041', opNumber: 'OP-2026-00176', uhid: 'KH-2025-09008', doctorName: 'Dr. Anand', status: 'rx_in_progress', prescribedAt: minutesAgoIso(95),  pickedUpAt: minutesAgoIso(8),
    lines: [
      { medicineId: 'med-141', dosage: '1 cap', frequency: 'OD',  route: 'PO', durationDays: 14, quantityPrescribed: 14, unitPrice: 3.5 },
      { medicineId: 'med-143', dosage: '1 tab', frequency: 'BD',  route: 'PO', durationDays: 7,  quantityPrescribed: 14, unitPrice: 2.5 },
    ] },
  { id: 'rx-122', prescriptionNumber: 'RX-2026-001042', opNumber: 'OP-2026-00177', uhid: 'KH-2025-09017', doctorName: 'Dr. Anand', status: 'rx_in_progress', prescribedAt: minutesAgoIso(110), pickedUpAt: minutesAgoIso(15),
    lines: [
      { medicineId: 'med-100', dosage: '1 tab', frequency: 'TDS', route: 'PO', durationDays: 3, quantityPrescribed: 9, unitPrice: 1.5 },
      { medicineId: 'med-153', dosage: '1 tab', frequency: 'OD',  route: 'PO', durationDays: 5, quantityPrescribed: 5, unitPrice: 1.2 },
    ] },
  { id: 'rx-123', prescriptionNumber: 'RX-2026-001043', opNumber: 'OP-2026-00184', uhid: 'KH-2025-09001', doctorName: 'Dr. Meera',   status: 'rx_in_progress', prescribedAt: minutesAgoIso(105), pickedUpAt: minutesAgoIso(20),
    lines: [
      { medicineId: 'med-115', dosage: '1 tab', frequency: 'TDS', route: 'PO', durationDays: 5, quantityPrescribed: 15, unitPrice: 2.5 },
      { medicineId: 'med-100', dosage: '1 tab', frequency: 'QID', route: 'PO', durationDays: 3, quantityPrescribed: 12, unitPrice: 1.5 },
    ] },

  /* ---- TODAY â€” rx_partially_dispensed (5) ---- */
  { id: 'rx-130', prescriptionNumber: 'RX-2026-001030', opNumber: 'OP-2026-00171', uhid: 'KH-2024-04406', doctorName: 'Dr. Naveen Kumar', status: 'rx_partially_dispensed', prescribedAt: minutesAgoIso(180), pickedUpAt: minutesAgoIso(165), dispensedAt: minutesAgoIso(150),
    lines: [
      { medicineId: 'med-102', dosage: '1 tab', frequency: 'BD',  route: 'PO', durationDays: 5, quantityPrescribed: 10, unitPrice: 3.0 },
      { medicineId: 'med-110', dosage: '1 cap', frequency: 'TDS', route: 'PO', durationDays: 5, quantityPrescribed: 15, unitPrice: 7.5, notes: 'Out of stock â€” declined' },
    ] },
  { id: 'rx-131', prescriptionNumber: 'RX-2026-001031', opNumber: 'OP-2026-00172', uhid: 'KH-2024-04409', doctorName: 'Dr. Naveen Kumar', status: 'rx_partially_dispensed', prescribedAt: minutesAgoIso(200), pickedUpAt: minutesAgoIso(180), dispensedAt: minutesAgoIso(160),
    lines: [
      { medicineId: 'med-102', dosage: '1 tab', frequency: 'BD',  route: 'PO', durationDays: 7, quantityPrescribed: 14, unitPrice: 3.0 },
      { medicineId: 'med-104', dosage: '1 tab', frequency: 'SOS', route: 'PO', durationDays: 3, quantityPrescribed: 6,  unitPrice: 6.5, notes: 'Patient declined' },
    ] },
  { id: 'rx-132', prescriptionNumber: 'RX-2026-001032', opNumber: 'OP-2026-00178', uhid: 'KH-2025-09019', doctorName: 'Dr. Anand', status: 'rx_partially_dispensed', prescribedAt: minutesAgoIso(160), pickedUpAt: minutesAgoIso(140), dispensedAt: minutesAgoIso(120),
    lines: [
      { medicineId: 'med-121', dosage: '1 tab', frequency: 'OD',  route: 'PO', durationDays: 30, quantityPrescribed: 30, unitPrice: 1.8 },
      { medicineId: 'med-124', dosage: '1 tab', frequency: 'OD',  route: 'PO', durationDays: 30, quantityPrescribed: 30, unitPrice: 0.6 },
    ] },
  { id: 'rx-133', prescriptionNumber: 'RX-2026-001033', opNumber: 'OP-2026-00181', uhid: 'KH-2024-04414', doctorName: 'Dr. Anand', status: 'rx_partially_dispensed', prescribedAt: minutesAgoIso(220), pickedUpAt: minutesAgoIso(200), dispensedAt: minutesAgoIso(170),
    lines: [
      { medicineId: 'med-153', dosage: '1 tab', frequency: 'OD',  route: 'PO', durationDays: 7, quantityPrescribed: 7, unitPrice: 1.2 },
    ] },
  { id: 'rx-134', prescriptionNumber: 'RX-2026-001034', opNumber: 'OP-2026-00188', uhid: 'KH-2024-08812', doctorName: 'Dr. Lakshmi',   status: 'rx_partially_dispensed', prescribedAt: minutesAgoIso(190), pickedUpAt: minutesAgoIso(170), dispensedAt: minutesAgoIso(140),
    lines: [
      { medicineId: 'med-162', dosage: '1 tab', frequency: 'OD',  route: 'PO', durationDays: 30, quantityPrescribed: 30, unitPrice: 4.0 },
      { medicineId: 'med-163', dosage: '1 tab', frequency: 'OD',  route: 'PO', durationDays: 30, quantityPrescribed: 30, unitPrice: 5.0 },
    ] },

  /* ---- May 15-17 â€” rx_dispensed (~25) ---- */
  ...buildPastDispensed(),
];

function buildPastDispensed(): RxSeed[] {
  // Past Rx dispenses on May 15-16 + a few earlier today.
  const past: RxSeed[] = [];
  const PAST = [
    { date: '2026-05-15', uhid: 'KH-2026-00045', doctor: 'Dr. Naveen Kumar', op: 'OP-2026-00030', meds: ['med-102', 'med-100'], hour: 11 },
    { date: '2026-05-15', uhid: 'KH-2024-08812', doctor: 'Dr. Anand', op: 'OP-2026-00031', meds: ['med-122', 'med-130'], hour: 12 },
    { date: '2026-05-15', uhid: 'KH-2026-00046', doctor: 'Dr. Naveen Kumar', op: 'OP-2026-00033', meds: ['med-102', 'med-141'], hour: 13 },
    { date: '2026-05-15', uhid: 'KH-2024-04401', doctor: 'Dr. Anand', op: 'OP-2026-00041', meds: ['med-121', 'med-124', 'med-123'], hour: 14 },
    { date: '2026-05-15', uhid: 'KH-2025-09008', doctor: 'Dr. Anand', op: 'OP-2026-00042', meds: ['med-141'], hour: 15 },
    { date: '2026-05-15', uhid: 'KH-2026-00064', doctor: 'Dr. Anand', op: 'OP-2026-00043', meds: ['med-130', 'med-126'], hour: 16 },
    { date: '2026-05-15', uhid: 'KH-2025-09001', doctor: 'Dr. Meera',   op: 'OP-2026-00056', meds: ['med-100', 'med-115'], hour: 11 },
    { date: '2026-05-15', uhid: 'KH-2024-04401', doctor: 'Dr. Lakshmi',   op: 'OP-2026-00062', meds: ['med-162'], hour: 13 },
    { date: '2026-05-15', uhid: 'KH-2024-04416', doctor: 'Dr. Ravi',   op: 'OP-2026-00066', meds: ['med-102', 'med-170'], hour: 16 },
    { date: '2026-05-16', uhid: 'KH-2018-00094', doctor: 'Dr. Anand', op: 'OP-2026-00071', meds: ['med-130', 'med-121', 'med-124', 'med-123'], hour: 11 },
    { date: '2026-05-16', uhid: 'KH-2024-04401', doctor: 'Dr. Anand', op: 'OP-2026-00073', meds: ['med-123', 'med-124'], hour: 12 },
    { date: '2026-05-16', uhid: 'KH-2026-00046', doctor: 'Dr. Naveen Kumar', op: 'OP-2026-00080', meds: ['med-102', 'med-100'], hour: 14 },
    { date: '2026-05-16', uhid: 'KH-2025-09022', doctor: 'Dr. Anand', op: 'OP-2026-00081', meds: ['med-130'], hour: 15 },
    { date: '2026-05-16', uhid: 'KH-2024-04419', doctor: 'Dr. Naveen Kumar', op: 'OP-2026-00084', meds: ['med-101', 'med-170'], hour: 11 },
    { date: '2026-05-16', uhid: 'KH-2024-04421', doctor: 'Dr. Naveen Kumar', op: 'OP-2026-00085', meds: ['med-100', 'med-141'], hour: 12 },
    { date: '2026-05-16', uhid: 'KH-2024-08812', doctor: 'Dr. Lakshmi',   op: 'OP-2026-00094', meds: ['med-162', 'med-163'], hour: 16 },
    { date: '2026-05-16', uhid: 'KH-2024-04416', doctor: 'Dr. Ravi',   op: 'OP-2026-00096', meds: ['med-170'], hour: 17 },
    // Today â€” already dispensed in early part of the day.
    { date: '2026-05-17', uhid: 'KH-2024-04419', doctor: 'Dr. Naveen Kumar', op: 'OP-2026-00173', meds: ['med-100', 'med-141'], hour: 11 },
    { date: '2026-05-17', uhid: 'KH-2026-00056', doctor: 'Dr. Naveen Kumar', op: 'OP-2026-00175', meds: ['med-102'], hour: 12 },
    { date: '2026-05-17', uhid: 'KH-2026-00043', doctor: 'Dr. Anand', op: 'OP-2026-00182', meds: ['med-160'], hour: 13 },
    { date: '2026-05-17', uhid: 'KH-2024-04411', doctor: 'Dr. Anand', op: 'OP-2026-00180', meds: ['med-153', 'med-154'], hour: 13 },
    { date: '2026-05-17', uhid: 'KH-2024-04407', doctor: 'Dr. Meera',   op: 'OP-2026-00185', meds: ['med-100'], hour: 14 },
    { date: '2026-05-17', uhid: 'KH-2024-04422', doctor: 'Dr. Meera',   op: 'OP-2026-00186', meds: ['med-100', 'med-115'], hour: 14 },
    { date: '2026-05-17', uhid: 'KH-2026-00073', doctor: 'Dr. Meera',   op: 'OP-2026-00187', meds: ['med-115'], hour: 15 },
    { date: '2026-05-17', uhid: 'KH-2026-00072', doctor: 'Dr. Ravi',   op: 'OP-2026-00192', meds: ['med-170'], hour: 15 },
    { date: '2026-05-17', uhid: 'KH-2026-00066', doctor: 'Dr. Ravi',   op: 'OP-2026-00193', meds: ['med-102', 'med-170'], hour: 16 },
  ];
  let seq = 800;
  for (const r of PAST) {
    seq += 1;
    const lines: RxLineSpec[] = r.meds.map((mid) => {
      const m = mockMedicines.find((x) => x.id === mid);
      return {
        medicineId: mid,
        dosage: '1 tab', frequency: 'BD', route: 'PO', durationDays: 5,
        quantityPrescribed: 10,
        unitPrice: m && mid === 'med-160' ? 13 : m && mid === 'med-170' ? 95 : m && mid === 'med-141' ? 3.5 : 2.0,
      };
    });
    past.push({
      id: `rx-${seq}`,
      prescriptionNumber: `RX-2026-${String(seq).padStart(6, '0')}`,
      opNumber: r.op,
      uhid: r.uhid,
      doctorName: r.doctor,
      status: 'rx_dispensed',
      prescribedAt: isoOn(r.date, r.hour, 0),
      pickedUpAt: isoOn(r.date, r.hour, 5),
      dispensedAt: isoOn(r.date, r.hour, 18),
      lines,
    });
  }
  return past;
}

/* Cancelled (2) */
const cancelled: RxSeed[] = [
  { id: 'rx-901', prescriptionNumber: 'RX-2026-001020', opNumber: 'OP-2026-00043', uhid: 'KH-2026-00064', doctorName: 'Dr. Anand', status: 'rx_cancelled', prescribedAt: isoOn('2026-05-15', 16, 0),
    lines: [{ medicineId: 'med-130', dosage: '1 tab', frequency: 'BD', route: 'PO', durationDays: 30, quantityPrescribed: 60, unitPrice: 2.5 }] },
  { id: 'rx-902', prescriptionNumber: 'RX-2026-001021', opNumber: 'OP-2026-00073', uhid: 'KH-2024-04401', doctorName: 'Dr. Anand', status: 'rx_cancelled', prescribedAt: isoOn('2026-05-16', 12, 30),
    lines: [{ medicineId: 'med-104', dosage: '1 cap', frequency: 'SOS', route: 'PO', durationDays: 3, quantityPrescribed: 6, unitPrice: 6.5 }] },
];
seeds.push(...cancelled);

const rxFromSeed = (s: RxSeed): RxQueueEntry => ({
  id: s.id,
  prescriptionNumber: s.prescriptionNumber,
  opNumber: s.opNumber,
  patient: findPatient(s.uhid),
  doctorName: s.doctorName,
  status: s.status,
  prescribedAt: s.prescribedAt,
  pickedUpAt: s.pickedUpAt,
  dispensedAt: s.dispensedAt,
  items: s.lines.map((l, i) => lineFromSpec(l, ++rxItemSeq * 100 + i)),
});

export const mockRxQueue: RxQueueEntry[] = seeds.map(rxFromSeed);

/* ---------- Mutators (consumed by consultationApi) ---------- */

export const appendRxToQueue = (rx: RxQueueEntry): void => {
  const existingIdx = mockRxQueue.findIndex((r) => r.id === rx.id);
  if (existingIdx >= 0) {
    const existing = mockRxQueue[existingIdx];
    mockRxQueue.splice(existingIdx, 1);
    mockRxQueue.unshift({
      ...rx,
      status: existing.status,
      pickedUpAt: existing.pickedUpAt,
      dispensedAt: existing.dispensedAt,
    });
    return;
  }
  mockRxQueue.unshift(rx);
};

export const removeRxFromQueue = (rxId: string): void => {
  const idx = mockRxQueue.findIndex((r) => r.id === rxId);
  if (idx >= 0) mockRxQueue.splice(idx, 1);
};
