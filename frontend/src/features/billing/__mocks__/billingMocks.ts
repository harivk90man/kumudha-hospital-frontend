import type {
  Counter,
  Invoice,
  InvoiceLine,
  InvoiceStatus,
  Payment,
  PaymentMethod,
  Service,
} from '../billingTypes';
import { DEFAULT_GST_BY_CATEGORY } from '@/config/taxRates';
import { findPatient, mockPatientsByUhid } from '@/features/patient/__mocks__/patientMocks';
import { mockPastOpVisits } from '@/features/encounter/__mocks__/encounterMocks';
import { DEFAULT_COUNTER_ID } from '../currentCounterStore';

const CONS = DEFAULT_GST_BY_CATEGORY.consultation;
const LAB = DEFAULT_GST_BY_CATEGORY.lab;
const RAD = DEFAULT_GST_BY_CATEGORY.radiology;
const PHA = DEFAULT_GST_BY_CATEGORY.pharmacy;
const REG = DEFAULT_GST_BY_CATEGORY.registration;

/* ---------- Counters (TSD-13.b) ---------- */
//
// Single seeded counter today. The schema + API surface support N
// counters so multi-till reporting needs no migration when the UI for
// switching counters lands. Every payment + shift record carries the
// `counterId` of the till that took the money.

export const mockCounters: Counter[] = [
  { id: DEFAULT_COUNTER_ID, code: 'COUNTER-1', name: 'Front desk', isActive: true },
];

/* ---------- Service catalogue (TSD-11) ---------- */

export const mockServices: Service[] = [
  /* Consultation */
  { id: 'svc-001', code: 'CONS-OPD',   name: 'OPD consultation',          category: 'consultation', unitPrice: 500,  gstPct: CONS, isActive: true },
  { id: 'svc-002', code: 'CONS-FU',    name: 'Follow-up consultation',    category: 'consultation', unitPrice: 250,  gstPct: CONS, isActive: true },
  { id: 'svc-003', code: 'CONS-SPC',   name: 'Specialist consultation',   category: 'consultation', unitPrice: 800,  gstPct: CONS, isActive: true },
  { id: 'svc-004', code: 'CONS-DENT',  name: 'Dental consultation',       category: 'consultation', unitPrice: 400,  gstPct: CONS, isActive: true },
  { id: 'svc-005', code: 'CONS-OBG',   name: 'OB-GYN consultation',       category: 'consultation', unitPrice: 700,  gstPct: CONS, isActive: true },
  { id: 'svc-006', code: 'CONS-PHYS',  name: 'Physiotherapy session',     category: 'consultation', unitPrice: 600,  gstPct: CONS, isActive: true },
  /* Lab */
  { id: 'svc-101', code: 'LAB-CBC',    name: 'Complete Blood Count',      category: 'lab',          unitPrice: 350,  gstPct: LAB,  isActive: true },
  { id: 'svc-102', code: 'LAB-CRP',    name: 'C-Reactive Protein',        category: 'lab',          unitPrice: 450,  gstPct: LAB,  isActive: true },
  { id: 'svc-103', code: 'LAB-LFT',    name: 'Liver Function Test',       category: 'lab',          unitPrice: 600,  gstPct: LAB,  isActive: true },
  { id: 'svc-104', code: 'LAB-RFT',    name: 'Renal Function Test',       category: 'lab',          unitPrice: 600,  gstPct: LAB,  isActive: true },
  { id: 'svc-105', code: 'LAB-HBA1C',  name: 'HbA1c',                     category: 'lab',          unitPrice: 550,  gstPct: LAB,  isActive: true },
  { id: 'svc-106', code: 'LAB-URN',    name: 'Urine Routine',             category: 'lab',          unitPrice: 200,  gstPct: LAB,  isActive: true },
  { id: 'svc-107', code: 'LAB-POT',    name: 'Serum Potassium',           category: 'lab',          unitPrice: 250,  gstPct: LAB,  isActive: true },
  { id: 'svc-108', code: 'LAB-LIPID',  name: 'Lipid Profile',             category: 'lab',          unitPrice: 750,  gstPct: LAB,  isActive: true },
  { id: 'svc-109', code: 'LAB-FBS',    name: 'Fasting Blood Sugar',       category: 'lab',          unitPrice: 150,  gstPct: LAB,  isActive: true },
  { id: 'svc-110', code: 'LAB-TSH',    name: 'Thyroid Stimulating Hormone',category: 'lab',         unitPrice: 450,  gstPct: LAB,  isActive: true },
  /* Radiology */
  { id: 'svc-201', code: 'RAD-XR-LSP', name: 'X-Ray L-Spine AP/Lat',      category: 'radiology',    unitPrice: 800,  gstPct: RAD,  isActive: true },
  { id: 'svc-202', code: 'RAD-XR-CHT', name: 'X-Ray Chest PA',            category: 'radiology',    unitPrice: 600,  gstPct: RAD,  isActive: true },
  { id: 'svc-203', code: 'RAD-XR-KNE', name: 'X-Ray Knee AP/Lat',         category: 'radiology',    unitPrice: 700,  gstPct: RAD,  isActive: true },
  { id: 'svc-204', code: 'RAD-USG',    name: 'Ultrasound abdomen',        category: 'radiology',    unitPrice: 1500, gstPct: RAD,  isActive: true },
  { id: 'svc-205', code: 'RAD-CT-HD',  name: 'CT Head plain',             category: 'radiology',    unitPrice: 3500, gstPct: RAD,  isActive: true },
  { id: 'svc-206', code: 'RAD-MRI-LSP',name: 'MRI Lumbar spine',          category: 'radiology',    unitPrice: 8000, gstPct: RAD,  isActive: true },
  { id: 'svc-207', code: 'RAD-USG-OBG',name: 'USG Obstetric',             category: 'radiology',    unitPrice: 1800, gstPct: RAD,  isActive: true },
];

/* ---------- Helpers ---------- */

const computeLine = (svc: Service, qty: number, idSuffix: string): InvoiceLine => {
  const lineTotal = Number((svc.unitPrice * qty).toFixed(2));
  return {
    id: `inl-${idSuffix}`,
    serviceId: svc.id,
    serviceCode: svc.code,
    serviceName: svc.name,
    category: svc.category,
    unitPrice: svc.unitPrice,
    quantity: qty,
    gstPct: svc.gstPct,
    lineTotal,
  };
};

const totalsFor = (lines: InvoiceLine[]): { subtotal: number; tax: number; total: number } => {
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const tax = lines.reduce((s, l) => s + (l.lineTotal * l.gstPct) / 100, 0);
  const total = subtotal + tax;
  return {
    subtotal: Number(subtotal.toFixed(2)),
    tax: Number(tax.toFixed(2)),
    total: Number(total.toFixed(2)),
  };
};

const findSvc = (code: string): Service => {
  const s = mockServices.find((x) => x.code === code);
  if (!s) throw new Error(`mock service ${code} missing`);
  return s;
};

const isoOn = (date: string, hour: number, minute: number): string =>
  `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+05:30`;

/**
 * Map a doctor id to the consultation service code they typically charge.
 * Naveen = ortho specialist; Anand = GP; Meera = dental; Lakshmi = OB-GYN;
 * Ravi = physio. Drives realistic per-doctor revenue distribution.
 */
const consultCodeForDoctor = (doctorId: string): string => {
  switch (doctorId) {
    case 'usr-doc-001': return 'CONS-SPC';   // Orthopaedics specialist
    case 'usr-doc-002': return 'CONS-OPD';   // General Medicine
    case 'usr-doc-003': return 'CONS-DENT';  // Dental
    case 'usr-doc-004': return 'CONS-OBG';   // OB-GYN
    case 'usr-doc-005': return 'CONS-PHYS';  // Physiotherapy
    default:            return 'CONS-OPD';
  }
};

/* ---------- Invoice + payment seed ---------- */
//
// We build invoices in three buckets:
//   1) Past-day consultation invoices for every PastOpVisit (May 15 + 16),
//      all PAID — anchors revenue + doctor breakdowns.
//   2) Past-day add-on invoices (lab / radiology / pharmacy) for ~30%
//      of past visits — fattens category mix.
//   3) Today's invoices: consult invoices for today's queue rows
//      (paid for past-states; billed for awaiting_billing) plus a few
//      lab/radiology/pharmacy add-ons.

interface InvoiceSeed {
  uhid: string;
  opNumber?: string;
  station: Invoice['station'];
  status: InvoiceStatus;
  lines: { code: string; qty: number }[];
  createdAt: string;
  /** Optional overrides for partial / lastPaid timestamps. */
  paidAmount?: number;
  paidAt?: string;
  paidMethod?: PaymentMethod;
  paidRef?: string;
  createdBy?: string;
}

const seeds: InvoiceSeed[] = [];

/* (1) Past-day consult invoices — PAID. */
for (const visit of mockPastOpVisits) {
  // Stagger within the day: 09:00 → 18:00 spread.
  const idx = mockPastOpVisits.indexOf(visit);
  const hour = 9 + (idx % 9);
  const minute = (idx * 7) % 60;
  const code = consultCodeForDoctor(visit.doctorId);
  // Methods rotation: cash dominant, then UPI, card, netbanking, insurance.
  const methodRotation: PaymentMethod[] = [
    'cash', 'cash', 'cash', 'upi', 'upi', 'card', 'cash', 'upi', 'netbanking', 'cash', 'insurance',
  ];
  const method = methodRotation[idx % methodRotation.length];
  seeds.push({
    uhid: visit.uhid,
    opNumber: visit.opNumber,
    station: 'front_desk',
    status: 'paid',
    lines: [{ code, qty: 1 }],
    createdAt: isoOn(visit.visitDate, hour, minute),
    paidAmount: findSvc(code).unitPrice,
    paidAt: isoOn(visit.visitDate, hour, minute + 4),
    paidMethod: method,
    paidRef: method === 'upi' ? `YBL-${visit.opNumber.slice(-4)}KQ` : undefined,
    createdBy: 'usr-rec-001',
  });
}

/* (2) Add-on invoices for ~35% of past visits. */
const addonPattern: Array<{ station: Invoice['station']; lines: { code: string; qty: number }[]; status: InvoiceStatus; method: PaymentMethod }> = [
  { station: 'lab',       lines: [{ code: 'LAB-CBC', qty: 1 }, { code: 'LAB-CRP', qty: 1 }],                            status: 'paid',           method: 'cash' },
  { station: 'lab',       lines: [{ code: 'LAB-LFT', qty: 1 }, { code: 'LAB-RFT', qty: 1 }],                            status: 'paid',           method: 'upi' },
  { station: 'lab',       lines: [{ code: 'LAB-HBA1C', qty: 1 }, { code: 'LAB-FBS', qty: 1 }, { code: 'LAB-LIPID', qty: 1 }], status: 'paid',     method: 'card' },
  { station: 'lab',       lines: [{ code: 'LAB-URN', qty: 1 }],                                                         status: 'paid',           method: 'cash' },
  { station: 'lab',       lines: [{ code: 'LAB-TSH', qty: 1 }],                                                         status: 'paid',           method: 'upi' },
  { station: 'radiology', lines: [{ code: 'RAD-XR-LSP', qty: 1 }],                                                      status: 'paid',           method: 'cash' },
  { station: 'radiology', lines: [{ code: 'RAD-XR-KNE', qty: 1 }],                                                      status: 'paid',           method: 'upi' },
  { station: 'radiology', lines: [{ code: 'RAD-XR-CHT', qty: 1 }],                                                      status: 'paid',           method: 'cash' },
  { station: 'radiology', lines: [{ code: 'RAD-USG', qty: 1 }],                                                         status: 'paid',           method: 'card' },
  { station: 'radiology', lines: [{ code: 'RAD-MRI-LSP', qty: 1 }],                                                     status: 'partially_paid', method: 'card' },
  { station: 'radiology', lines: [{ code: 'RAD-CT-HD', qty: 1 }],                                                       status: 'paid',           method: 'netbanking' },
  { station: 'pharmacy',  lines: [{ code: 'CONS-OPD', qty: 0 }],  status: 'paid', method: 'cash' }, // placeholder — replaced below
];

// For pharmacy invoices, we synthesise a single "Rx dispense" line as adhoc — but
// the InvoiceSeed shape only supports services_catalog codes. To keep it simple:
// pharmacy invoices use the radiology/lab pattern but with real services. We'll
// just use 1-3 generic Rx-priced items expressed via existing services for the
// mock, OR we'll create dedicated `PHARMA-RX-*` adhoc-ish service entries in
// the catalogue. Let's add a couple of pharmacy "service" rows for the mock:

mockServices.push(
  { id: 'svc-301', code: 'PHA-RX-S', name: 'Rx dispense — small (1-3 items)',  category: 'pharmacy', unitPrice: 180,  gstPct: PHA, isActive: true },
  { id: 'svc-302', code: 'PHA-RX-M', name: 'Rx dispense — medium (4-6 items)', category: 'pharmacy', unitPrice: 420,  gstPct: PHA, isActive: true },
  { id: 'svc-303', code: 'PHA-RX-L', name: 'Rx dispense — large (7+ items)',   category: 'pharmacy', unitPrice: 850,  gstPct: PHA, isActive: true },
  // Registration fees — new-patient one-time charge + UHID card reprint.
  { id: 'svc-401', code: 'REG-NEW', name: 'New patient registration', category: 'registration', unitPrice: 100, gstPct: REG, isActive: true },
  { id: 'svc-402', code: 'REG-CARD', name: 'UHID card reprint',       category: 'registration', unitPrice:  50, gstPct: REG, isActive: true },
);

// Replace the placeholder at index 11.
addonPattern[11] = { station: 'pharmacy', lines: [{ code: 'PHA-RX-M', qty: 1 }], status: 'paid', method: 'cash' };

let addonCursor = 0;
for (let i = 0; i < mockPastOpVisits.length; i += 1) {
  // Add an addon to ~every 3rd visit so we get ~23 add-ons.
  if (i % 3 !== 1) continue;
  const visit = mockPastOpVisits[i];
  const pat = addonPattern[addonCursor % addonPattern.length];
  addonCursor += 1;
  const lineTotal = pat.lines.reduce((s, l) => s + findSvc(l.code).unitPrice * l.qty, 0);
  const lineTax = pat.lines.reduce((s, l) => s + findSvc(l.code).unitPrice * l.qty * findSvc(l.code).gstPct / 100, 0);
  const grand = Math.round(lineTotal + lineTax);
  // For partially_paid, half the bill outstanding.
  const paidAmount = pat.status === 'paid' ? grand : pat.status === 'partially_paid' ? Math.round(grand / 2) : 0;
  const baseHour = 10 + (i % 7);
  seeds.push({
    uhid: visit.uhid,
    opNumber: visit.opNumber,
    station: pat.station,
    status: pat.status,
    lines: pat.lines,
    createdAt: isoOn(visit.visitDate, baseHour, (i * 3) % 60),
    paidAmount,
    paidAt: paidAmount > 0 ? isoOn(visit.visitDate, baseHour + 1, (i * 5) % 60) : undefined,
    paidMethod: pat.method,
    createdBy: pat.station === 'pharmacy' ? 'usr-pha-001' : pat.station === 'lab' ? 'usr-lab-001' : pat.station === 'radiology' ? 'usr-rad-001' : 'usr-cas-001',
  });
}

/* (3) Today's invoices. */
//
// For each row in today's queue: consult invoice (paid for paid-states,
// billed for awaiting_billing). Also a few lab/radiology/pharmacy
// follow-ons for in-flight encounters. The encounter mocks already
// cover 58 today rows OP-2026-00118..00193.

interface TodayConsultSeed { opNumber: string; uhid: string; doctorId: string; status: InvoiceStatus; createdHour: number; createdMin: number; }
// One consult invoice per row in the refreshed TODAY_QUEUE (30 rows).
// Mirrors `encounterMocks.ts` exactly so the cashier sees a coherent
// "today" view that lines up with what the doctor + nurse see.
const TODAY_CONSULT_SEEDS: TodayConsultSeed[] = [
  // 6 awaiting_billing / registered → billed (unpaid)
  { opNumber: 'OP-2026-00141', uhid: 'KH-2026-00050', doctorId: 'usr-doc-002', status: 'billed', createdHour: 17, createdMin:  3 },
  { opNumber: 'OP-2026-00142', uhid: 'KH-2026-00051', doctorId: 'usr-doc-002', status: 'billed', createdHour: 17, createdMin:  6 },
  { opNumber: 'OP-2026-00143', uhid: 'KH-2025-08801', doctorId: 'usr-doc-002', status: 'billed', createdHour: 17, createdMin:  9 },
  { opNumber: 'OP-2026-00144', uhid: 'KH-2026-00053', doctorId: 'usr-doc-002', status: 'billed', createdHour: 17, createdMin: 11 },
  { opNumber: 'OP-2026-00145', uhid: 'KH-2025-11203', doctorId: 'usr-doc-002', status: 'billed', createdHour: 17, createdMin: 14 },
  { opNumber: 'OP-2026-00146', uhid: 'KH-2025-08802', doctorId: 'usr-doc-004', status: 'billed', createdHour: 17, createdMin: 16 },

  // 5 awaiting_vitals → paid
  { opNumber: 'OP-2026-00147', uhid: 'KH-2026-00055', doctorId: 'usr-doc-002', status: 'paid', createdHour: 16, createdMin: 50 },
  { opNumber: 'OP-2026-00148', uhid: 'KH-2025-09812', doctorId: 'usr-doc-002', status: 'paid', createdHour: 16, createdMin: 53 },
  { opNumber: 'OP-2026-00149', uhid: 'KH-2024-03301', doctorId: 'usr-doc-002', status: 'paid', createdHour: 16, createdMin: 55 },
  { opNumber: 'OP-2026-00150', uhid: 'KH-2024-04424', doctorId: 'usr-doc-002', status: 'paid', createdHour: 16, createdMin: 45 },
  { opNumber: 'OP-2026-00151', uhid: 'KH-2026-00048', doctorId: 'usr-doc-002', status: 'paid', createdHour: 16, createdMin: 40 },

  // 5 awaiting_doctor / vitals_done → paid
  { opNumber: 'OP-2026-00122', uhid: 'KH-2026-00046', doctorId: 'usr-doc-001', status: 'paid', createdHour: 16, createdMin: 35 },
  { opNumber: 'OP-2026-00123', uhid: 'KH-2024-03302', doctorId: 'usr-doc-002', status: 'paid', createdHour: 16, createdMin: 51 },
  { opNumber: 'OP-2026-00124', uhid: 'KH-2024-04425', doctorId: 'usr-doc-002', status: 'paid', createdHour: 16, createdMin: 32 },
  { opNumber: 'OP-2026-00152', uhid: 'KH-2026-00061', doctorId: 'usr-doc-002', status: 'paid', createdHour: 16, createdMin: 43 },
  { opNumber: 'OP-2026-00153', uhid: 'KH-2026-00054', doctorId: 'usr-doc-002', status: 'paid', createdHour: 16, createdMin: 26 },

  // 3 in_consultation → paid
  { opNumber: 'OP-2026-00121', uhid: 'KH-2026-00045', doctorId: 'usr-doc-001', status: 'paid', createdHour: 16, createdMin: 42 },
  { opNumber: 'OP-2026-00154', uhid: 'KH-2024-06210', doctorId: 'usr-doc-002', status: 'paid', createdHour: 16, createdMin: 52 },
  { opNumber: 'OP-2026-00155', uhid: 'KH-2026-00049', doctorId: 'usr-doc-001', status: 'paid', createdHour: 16, createdMin: 22 },

  // 11 consultation_done → paid
  { opNumber: 'OP-2026-00156', uhid: 'KH-2026-00058', doctorId: 'usr-doc-002', status: 'paid', createdHour: 15, createdMin: 27 },
  { opNumber: 'OP-2026-00157', uhid: 'KH-2026-00052', doctorId: 'usr-doc-002', status: 'paid', createdHour: 15, createdMin: 22 },
  { opNumber: 'OP-2026-00158', uhid: 'KH-2018-00094', doctorId: 'usr-doc-002', status: 'paid', createdHour: 15, createdMin: 17 },
  { opNumber: 'OP-2026-00159', uhid: 'KH-2023-04501', doctorId: 'usr-doc-002', status: 'paid', createdHour: 15, createdMin:  7 },
  { opNumber: 'OP-2026-00160', uhid: 'KH-2024-08812', doctorId: 'usr-doc-004', status: 'paid', createdHour: 14, createdMin: 57 },
  { opNumber: 'OP-2026-00161', uhid: 'KH-2024-04401', doctorId: 'usr-doc-002', status: 'paid', createdHour: 14, createdMin: 47 },
  { opNumber: 'OP-2026-00162', uhid: 'KH-2024-04420', doctorId: 'usr-doc-002', status: 'paid', createdHour: 14, createdMin: 37 },
  { opNumber: 'OP-2026-00163', uhid: 'KH-2026-00064', doctorId: 'usr-doc-002', status: 'paid', createdHour: 15, createdMin: 25 },
  { opNumber: 'OP-2026-00164', uhid: 'KH-2026-00068', doctorId: 'usr-doc-002', status: 'paid', createdHour: 15, createdMin: 12 },
  { opNumber: 'OP-2026-00165', uhid: 'KH-2026-00047', doctorId: 'usr-doc-002', status: 'paid', createdHour: 15, createdMin:  2 },
  { opNumber: 'OP-2026-00166', uhid: 'KH-2020-00721', doctorId: 'usr-doc-002', status: 'paid', createdHour: 14, createdMin: 52 },
];

const TODAY = '2026-05-17';

const todayMethodRotation: PaymentMethod[] = ['cash', 'upi', 'cash', 'card', 'cash', 'upi', 'netbanking', 'cash', 'upi', 'insurance'];

for (let i = 0; i < TODAY_CONSULT_SEEDS.length; i += 1) {
  const t = TODAY_CONSULT_SEEDS[i];
  const code = consultCodeForDoctor(t.doctorId);
  const svc = findSvc(code);
  const m = todayMethodRotation[i % todayMethodRotation.length];
  seeds.push({
    uhid: t.uhid,
    opNumber: t.opNumber,
    station: 'front_desk',
    status: t.status,
    lines: [{ code, qty: 1 }],
    createdAt: isoOn(TODAY, t.createdHour, t.createdMin),
    paidAmount: t.status === 'paid' ? svc.unitPrice : 0,
    paidAt: t.status === 'paid' ? isoOn(TODAY, t.createdHour, t.createdMin + 4) : undefined,
    paidMethod: m,
    paidRef: m === 'upi' ? `YBL-${t.opNumber.slice(-4)}KQ` : undefined,
    createdBy: 'usr-rec-001',
  });
}

/* Add ~12 today add-on invoices (lab/rad/pharmacy) — feeds today's
   cashier multi-station view. */
const todayAddons: InvoiceSeed[] = [
  // Lab for Karthik (in_consultation) — billed, not yet paid.
  { uhid: 'KH-2026-00045', opNumber: 'OP-2026-00121', station: 'lab',       status: 'billed',         lines: [{ code: 'LAB-CBC', qty: 1 }, { code: 'LAB-POT', qty: 1 }],   createdAt: isoOn(TODAY, 16, 50),                                                                          createdBy: 'usr-doc-001' },
  // Lab for Meera (awaiting_doctor)
  { uhid: 'KH-2026-00046', opNumber: 'OP-2026-00122', station: 'lab',       status: 'paid',           lines: [{ code: 'LAB-LFT', qty: 1 }, { code: 'LAB-RFT', qty: 1 }],   createdAt: isoOn(TODAY, 16, 30), paidAmount: 1260, paidAt: isoOn(TODAY, 16, 35), paidMethod: 'cash',     createdBy: 'usr-doc-001' },
  // Knee X-Ray for Meera — partially paid
  { uhid: 'KH-2026-00046', opNumber: 'OP-2026-00122', station: 'radiology', status: 'partially_paid', lines: [{ code: 'RAD-XR-KNE', qty: 2 }],                              createdAt: isoOn(TODAY, 16, 18), paidAmount: 800,  paidAt: isoOn(TODAY, 16, 28), paidMethod: 'upi',      createdBy: 'usr-doc-001' },
  // Lab for Sundari (in_consultation) — DM panel
  { uhid: 'KH-2024-06210', opNumber: 'OP-2026-00154', station: 'lab',       status: 'paid',           lines: [{ code: 'LAB-HBA1C', qty: 1 }, { code: 'LAB-FBS', qty: 1 }], createdAt: isoOn(TODAY, 15, 40), paidAmount: 735,  paidAt: isoOn(TODAY, 15, 47), paidMethod: 'cash',     createdBy: 'usr-doc-002' },
  // Lab for Manjunath (consultation_done) — CKD workup
  { uhid: 'KH-2026-00064', opNumber: 'OP-2026-00163', station: 'lab',       status: 'paid',           lines: [{ code: 'LAB-RFT', qty: 1 }, { code: 'LAB-LIPID', qty: 1 }], createdAt: isoOn(TODAY, 14, 20), paidAmount: 1418, paidAt: isoOn(TODAY, 14, 28), paidMethod: 'card',     createdBy: 'usr-doc-002' },
  // ECG/CXR for Anand (consultation_done)
  { uhid: 'KH-2024-04401', opNumber: 'OP-2026-00161', station: 'radiology', status: 'paid',           lines: [{ code: 'RAD-XR-CHT', qty: 1 }],                              createdAt: isoOn(TODAY, 16, 24), paidAmount: 672,  paidAt: isoOn(TODAY, 16, 31), paidMethod: 'cash',     createdBy: 'usr-doc-002' },
  // USG for Geetha (consultation_done — OBG visit)
  { uhid: 'KH-2024-08812', opNumber: 'OP-2026-00160', station: 'radiology', status: 'paid',           lines: [{ code: 'RAD-USG-OBG', qty: 1 }],                             createdAt: isoOn(TODAY, 16, 32), paidAmount: 2016, paidAt: isoOn(TODAY, 16, 40), paidMethod: 'upi',      createdBy: 'usr-doc-004' },
  // Pharmacy dispenses on consultation_done rows
  { uhid: 'KH-2024-04420', opNumber: 'OP-2026-00162', station: 'pharmacy',  status: 'paid',           lines: [{ code: 'PHA-RX-S', qty: 1 }],                                createdAt: isoOn(TODAY, 15, 12), paidAmount: 202,  paidAt: isoOn(TODAY, 15, 14), paidMethod: 'cash',     createdBy: 'usr-pha-001' },
  { uhid: 'KH-2026-00058', opNumber: 'OP-2026-00156', station: 'pharmacy',  status: 'paid',           lines: [{ code: 'PHA-RX-M', qty: 1 }],                                createdAt: isoOn(TODAY, 16,  0), paidAmount: 470,  paidAt: isoOn(TODAY, 16,  4), paidMethod: 'upi',      createdBy: 'usr-pha-001' },
  { uhid: 'KH-2026-00047', opNumber: 'OP-2026-00165', station: 'pharmacy',  status: 'paid',           lines: [{ code: 'PHA-RX-L', qty: 1 }],                                createdAt: isoOn(TODAY, 14, 55), paidAmount: 952,  paidAt: isoOn(TODAY, 15,  0), paidMethod: 'card',     createdBy: 'usr-pha-001' },
  // Cancelled invoices (small handful for filter coverage)
  { uhid: 'KH-2026-00051', station: 'lab',                                  status: 'cancelled',      lines: [{ code: 'LAB-URN', qty: 1 }],                                 createdAt: isoOn(TODAY, 13, 10),                                                                          createdBy: 'usr-lab-001' },
  { uhid: 'KH-2026-00055', station: 'pharmacy',                             status: 'cancelled',      lines: [{ code: 'PHA-RX-S', qty: 1 }],                                createdAt: isoOn(TODAY, 12, 30),                                                                          createdBy: 'usr-pha-001' },
];
seeds.push(...todayAddons);

/* Today's registration-fee invoices — surfaces the new analytics
   "Registration" bucket on the owner dashboard. A handful per day so
   the bar isn't empty without dominating the chart. */
const todayRegistrations: InvoiceSeed[] = [
  { uhid: 'KH-2026-00045', opNumber: 'OP-2026-00121', station: 'front_desk', status: 'paid', lines: [{ code: 'REG-NEW', qty: 1 }],  createdAt: isoOn(TODAY,  9, 12), paidAmount: 100, paidAt: isoOn(TODAY,  9, 13), paidMethod: 'cash', createdBy: 'usr-rec-001' },
  { uhid: 'KH-2026-00046', opNumber: 'OP-2026-00122', station: 'front_desk', status: 'paid', lines: [{ code: 'REG-NEW', qty: 1 }],  createdAt: isoOn(TODAY,  9, 35), paidAmount: 100, paidAt: isoOn(TODAY,  9, 36), paidMethod: 'upi',  createdBy: 'usr-rec-001' },
  { uhid: 'KH-2026-00050', opNumber: 'OP-2026-00141', station: 'front_desk', status: 'paid', lines: [{ code: 'REG-NEW', qty: 1 }],  createdAt: isoOn(TODAY, 10,  4), paidAmount: 100, paidAt: isoOn(TODAY, 10,  5), paidMethod: 'cash', createdBy: 'usr-rec-001' },
  { uhid: 'KH-2026-00051', opNumber: 'OP-2026-00142', station: 'front_desk', status: 'paid', lines: [{ code: 'REG-CARD', qty: 1 }], createdAt: isoOn(TODAY, 11, 21), paidAmount:  50, paidAt: isoOn(TODAY, 11, 22), paidMethod: 'cash', createdBy: 'usr-rec-001' },
  { uhid: 'KH-2026-00055', opNumber: 'OP-2026-00147', station: 'front_desk', status: 'paid', lines: [{ code: 'REG-NEW', qty: 1 }],  createdAt: isoOn(TODAY, 12,  0), paidAmount: 100, paidAt: isoOn(TODAY, 12,  1), paidMethod: 'cash', createdBy: 'usr-rec-001' },
];
seeds.push(...todayRegistrations);

/* (4) Older invoices (May 1-14) — fewer, just enough so weekly chart
       is non-zero. ~8 days × ~6 visits = 48 historical consult invoices. */
const HISTORY_DATES = ['2026-05-01', '2026-05-04', '2026-05-06', '2026-05-08', '2026-05-10', '2026-05-12', '2026-05-13', '2026-05-14'];
const HISTORY_DOCTORS = ['usr-doc-001', 'usr-doc-002', 'usr-doc-001', 'usr-doc-002', 'usr-doc-003', 'usr-doc-004', 'usr-doc-001', 'usr-doc-005'];
const HISTORY_UHIDS = Object.keys(mockPatientsByUhid);
let histOpSeq = 1;
let histPatCursor = 11;
for (const date of HISTORY_DATES) {
  for (let i = 0; i < 6; i += 1) {
    const docId = HISTORY_DOCTORS[(HISTORY_DATES.indexOf(date) + i) % HISTORY_DOCTORS.length];
    const uhid = HISTORY_UHIDS[histPatCursor % HISTORY_UHIDS.length];
    histPatCursor += 1;
    const code = consultCodeForDoctor(docId);
    const svc = findSvc(code);
    const opNumber = `OP-2026-${String(histOpSeq).padStart(5, '0')}`;
    histOpSeq += 1;
    const hour = 9 + (i % 8);
    const minute = (i * 11) % 60;
    seeds.push({
      uhid,
      opNumber,
      station: 'front_desk',
      status: 'paid',
      lines: [{ code, qty: 1 }],
      createdAt: isoOn(date, hour, minute),
      paidAmount: svc.unitPrice,
      paidAt: isoOn(date, hour, minute + 5),
      paidMethod: i % 3 === 0 ? 'cash' : i % 3 === 1 ? 'upi' : 'card',
      createdBy: 'usr-rec-001',
    });
  }
}

/* ---------- Materialise invoices + payments ---------- */

let invoiceSeq = 1200;
let paymentSeq = 800;

const invoices: Invoice[] = [];
const payments: Payment[] = [];

for (const seed of seeds) {
  invoiceSeq += 1;
  const invoiceNumber = `INV-2026-${String(invoiceSeq).padStart(6, '0')}`;
  const lines = seed.lines.map((l, idx) =>
    computeLine(findSvc(l.code), l.qty, `${invoiceSeq}-${idx + 1}`),
  );
  const totals = totalsFor(lines);
  const paidAmount = seed.status === 'cancelled' ? 0 : (seed.paidAmount ?? 0);
  const balance = seed.status === 'cancelled' ? 0 : Math.max(0, Number((totals.total - paidAmount).toFixed(2)));
  const patient = findPatient(seed.uhid);
  const inv: Invoice = {
    id: `inv-${invoiceSeq}`,
    invoiceNumber,
    patient,
    opNumber: seed.opNumber,
    station: seed.station,
    status: seed.status,
    lines,
    ...totals,
    balance,
    createdBy: seed.createdBy ?? 'usr-rec-001',
    createdAt: seed.createdAt,
    lastPaidAt: paidAmount > 0 ? seed.paidAt : undefined,
  };
  invoices.push(inv);

  if (paidAmount > 0) {
    paymentSeq += 1;
    payments.push({
      id: `pay-${paymentSeq}`,
      invoiceId: inv.id,
      invoiceNumber,
      patient,
      amount: paidAmount,
      method: seed.paidMethod ?? 'cash',
      referenceNo: seed.paidRef,
      status: 'succeeded',
      receivedBy: seed.station === 'front_desk' ? 'usr-rec-001' : seed.createdBy ?? 'usr-cas-001',
      receivedAt: seed.paidAt ?? seed.createdAt,
      counterId: DEFAULT_COUNTER_ID,
    });
  }
}

export const mockInvoices: Invoice[] = invoices;
export const mockPayments: Payment[] = payments;
