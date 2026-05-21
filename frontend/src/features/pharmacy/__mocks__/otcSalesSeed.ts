import type { OtcSaleRecord, OtcSaleLineRecord } from '../otcSalesStore';
import {
  mockMedicines,
  mockMedicineBatches,
} from '@/features/inventory/__mocks__/inventoryMocks';

/**
 * OTC counter-sale seed — ~80 sales spread across the last 14 days
 * so the OTC invoices page has 4+ pages of pagination on first
 * mount. Stored under the Zustand `persist` key (bumped to v2) so
 * stale localStorage from before this seed gets replaced.
 *
 * Built from the inventory catalogue's mockMedicines so every line
 * references a real SKU. Each sale carries a saleNumber (`OTC-2026-
 * NNNNN`), a payment method (mostly cash, then UPI / card / net
 * banking), an optional customer name+phone, and lines computed from
 * the catalogue (unitPrice + GST baked into invoiceTotal).
 */

const OTC_GST = 12;

/**
 * Resolve OTC unit price from the cheapest active batch (mirrors
 * `getOtcUnitPrice` in pharmacyApi). Falls back to a token ₹1 if no
 * batch is configured for the medicine — keeps the seed builder
 * resilient to inventory shape drift.
 */
const otcUnitPrice = (medicineId: string): number => {
  const candidates = mockMedicineBatches.filter(
    (b) => b.medicineId === medicineId && b.isActive,
  );
  if (candidates.length === 0) return 1;
  return Math.min(...candidates.map((b) => b.unitPrice));
};

const med = (id: string): { name: string; strength: string; unitPrice: number } => {
  const m = mockMedicines.find((x) => x.id === id);
  if (!m) throw new Error(`OTC seed references unknown medicine ${id}`);
  return { name: m.name, strength: m.strength, unitPrice: otcUnitPrice(id) };
};

const line = (id: string, quantity: number): OtcSaleLineRecord => {
  const m = med(id);
  const lineTotal = Number((m.unitPrice * quantity).toFixed(2));
  return {
    medicineId: id,
    medicineName: m.name,
    strength: m.strength,
    quantity,
    unitPrice: m.unitPrice,
    gstPct: OTC_GST,
    lineTotal,
  };
};

const total = (lines: OtcSaleLineRecord[]): number => {
  const sub = lines.reduce((s, l) => s + l.lineTotal, 0);
  const tax = sub * (OTC_GST / 100);
  return Number((sub + tax).toFixed(2));
};

/** Build an ISO timestamp `daysAgo` days back at the given local clock. */
const daysAgoIso = (daysAgo: number, hour: number, minute = 0): string => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

interface OtcSeed {
  saleNumber: string;
  daysAgo: number;
  hour: number;
  minute: number;
  customerName?: string;
  customerPhone?: string;
  paymentMethod: OtcSaleRecord['paymentMethod'];
  paymentRef?: string;
  lineSpecs: { id: string; qty: number }[];
}

// Common pediatric / OTC mix. Reusing strings keeps the seed tight.
const COMMON_LINES = {
  cold:        [{ id: 'med-100', qty: 10 }, { id: 'med-152', qty: 6 }],
  fever:       [{ id: 'med-100', qty: 10 }],
  acid:        [{ id: 'med-140', qty: 10 }],
  bp:          [{ id: 'med-120', qty: 30 }, { id: 'med-121', qty: 30 }],
  diabetes:    [{ id: 'med-130', qty: 60 }],
  cough:       [{ id: 'med-152', qty: 6 }, { id: 'med-100', qty: 10 }],
  topical:     [{ id: 'med-170', qty: 1 }],
  vitamin:     [{ id: 'med-160', qty: 30 }],
  ors:         [{ id: 'med-160', qty: 10 }],
  multi:       [{ id: 'med-100', qty: 10 }, { id: 'med-140', qty: 14 }, { id: 'med-160', qty: 30 }],
  derm:        [{ id: 'med-171', qty: 1 }, { id: 'med-100', qty: 6 }],
  asthma:      [{ id: 'med-150', qty: 1 }],
  antihista:   [{ id: 'med-153', qty: 10 }],
  pain:        [{ id: 'med-101', qty: 10 }, { id: 'med-100', qty: 10 }],
  antibiotic:  [{ id: 'med-110', qty: 9 }],
} as const;

/* Distribute the 80 sales across the 14-day window with realistic
   weekday weighting (heavier mid-week). Each row stays a one-liner
   so the seed reads as a table. Customer details are mostly blank
   (OTC is anonymous by default) — about 30% have a name + phone. */
const seeds: OtcSeed[] = [
  // Day 0 (today) — 10 sales
  { saleNumber: 'OTC-2026-00080', daysAgo: 0, hour: 9,  minute: 22, paymentMethod: 'cash',                                       lineSpecs: [...COMMON_LINES.fever] },
  { saleNumber: 'OTC-2026-00079', daysAgo: 0, hour: 10, minute: 8,  paymentMethod: 'upi',  paymentRef: '4XXX9821', customerName: 'Suresh M',         customerPhone: '+91 98410 23311', lineSpecs: [...COMMON_LINES.cold] },
  { saleNumber: 'OTC-2026-00078', daysAgo: 0, hour: 10, minute: 41, paymentMethod: 'cash',                                       lineSpecs: [...COMMON_LINES.acid] },
  { saleNumber: 'OTC-2026-00077', daysAgo: 0, hour: 11, minute: 17, paymentMethod: 'card', paymentRef: '6712-9921',                                                                  lineSpecs: [...COMMON_LINES.multi] },
  { saleNumber: 'OTC-2026-00076', daysAgo: 0, hour: 12, minute: 4,  paymentMethod: 'cash', customerName: 'Latha R',           customerPhone: '+91 99520 18841',                     lineSpecs: [...COMMON_LINES.bp] },
  { saleNumber: 'OTC-2026-00075', daysAgo: 0, hour: 13, minute: 33, paymentMethod: 'upi',  paymentRef: '8XXX2284',                                                                  lineSpecs: [...COMMON_LINES.cough] },
  { saleNumber: 'OTC-2026-00074', daysAgo: 0, hour: 14, minute: 20, paymentMethod: 'cash',                                       lineSpecs: [...COMMON_LINES.topical] },
  { saleNumber: 'OTC-2026-00073', daysAgo: 0, hour: 15, minute: 5,  paymentMethod: 'cash',                                       lineSpecs: [...COMMON_LINES.vitamin] },
  { saleNumber: 'OTC-2026-00072', daysAgo: 0, hour: 16, minute: 47, paymentMethod: 'upi',  paymentRef: '2XXX7741', customerName: 'Joseph M',           customerPhone: '+91 99334 56777', lineSpecs: [...COMMON_LINES.diabetes] },
  { saleNumber: 'OTC-2026-00071', daysAgo: 0, hour: 17, minute: 12, paymentMethod: 'netbanking', paymentRef: 'NB7782991',                                                            lineSpecs: [...COMMON_LINES.multi] },

  // Day 1 — 8 sales
  { saleNumber: 'OTC-2026-00070', daysAgo: 1, hour: 9,  minute: 14, paymentMethod: 'cash',                                       lineSpecs: [...COMMON_LINES.fever] },
  { saleNumber: 'OTC-2026-00069', daysAgo: 1, hour: 10, minute: 27, paymentMethod: 'upi',  paymentRef: '7XXX1183',                                                                  lineSpecs: [...COMMON_LINES.acid] },
  { saleNumber: 'OTC-2026-00068', daysAgo: 1, hour: 11, minute: 3,  paymentMethod: 'cash',                                       lineSpecs: [...COMMON_LINES.ors] },
  { saleNumber: 'OTC-2026-00067', daysAgo: 1, hour: 12, minute: 38, paymentMethod: 'card', paymentRef: '4452-1198',                                                                  lineSpecs: [...COMMON_LINES.derm] },
  { saleNumber: 'OTC-2026-00066', daysAgo: 1, hour: 13, minute: 50, paymentMethod: 'cash', customerName: 'Vimala R',           customerPhone: '+91 98843 21177',                     lineSpecs: [...COMMON_LINES.bp] },
  { saleNumber: 'OTC-2026-00065', daysAgo: 1, hour: 15, minute: 11, paymentMethod: 'upi',  paymentRef: '1XXX9970',                                                                  lineSpecs: [...COMMON_LINES.cold] },
  { saleNumber: 'OTC-2026-00064', daysAgo: 1, hour: 16, minute: 22, paymentMethod: 'cash',                                       lineSpecs: [...COMMON_LINES.cough] },
  { saleNumber: 'OTC-2026-00063', daysAgo: 1, hour: 17, minute: 45, paymentMethod: 'upi',  paymentRef: '9XXX0011', customerName: 'Anand T',           customerPhone: '+91 98403 11220', lineSpecs: [...COMMON_LINES.pain] },

  // Day 2 — 7 sales
  { saleNumber: 'OTC-2026-00062', daysAgo: 2, hour: 9,  minute: 38, paymentMethod: 'cash',                                       lineSpecs: [...COMMON_LINES.fever] },
  { saleNumber: 'OTC-2026-00061', daysAgo: 2, hour: 10, minute: 50, paymentMethod: 'cash',                                       lineSpecs: [...COMMON_LINES.acid] },
  { saleNumber: 'OTC-2026-00060', daysAgo: 2, hour: 11, minute: 17, paymentMethod: 'upi',  paymentRef: '5XXX8841',                                                                  lineSpecs: [...COMMON_LINES.cold] },
  { saleNumber: 'OTC-2026-00059', daysAgo: 2, hour: 13, minute: 4,  paymentMethod: 'cash',                                       lineSpecs: [...COMMON_LINES.topical] },
  { saleNumber: 'OTC-2026-00058', daysAgo: 2, hour: 14, minute: 30, paymentMethod: 'upi',  paymentRef: '3XXX9012',                                                                  lineSpecs: [...COMMON_LINES.diabetes] },
  { saleNumber: 'OTC-2026-00057', daysAgo: 2, hour: 16, minute: 8,  paymentMethod: 'cash',                                       lineSpecs: [...COMMON_LINES.multi] },
  { saleNumber: 'OTC-2026-00056', daysAgo: 2, hour: 17, minute: 22, paymentMethod: 'card', paymentRef: '7711-2284', customerName: 'Karthik R',         customerPhone: '+91 98430 12121', lineSpecs: [...COMMON_LINES.antibiotic] },

  // Day 3 — 6 sales
  { saleNumber: 'OTC-2026-00055', daysAgo: 3, hour: 9,  minute: 12, paymentMethod: 'cash',                                       lineSpecs: [...COMMON_LINES.fever] },
  { saleNumber: 'OTC-2026-00054', daysAgo: 3, hour: 10, minute: 45, paymentMethod: 'cash',                                       lineSpecs: [...COMMON_LINES.cold] },
  { saleNumber: 'OTC-2026-00053', daysAgo: 3, hour: 12, minute: 0,  paymentMethod: 'upi',  paymentRef: '4XXX2218',                                                                  lineSpecs: [...COMMON_LINES.acid] },
  { saleNumber: 'OTC-2026-00052', daysAgo: 3, hour: 14, minute: 19, paymentMethod: 'cash',                                       lineSpecs: [...COMMON_LINES.ors] },
  { saleNumber: 'OTC-2026-00051', daysAgo: 3, hour: 15, minute: 50, paymentMethod: 'upi',  paymentRef: '2XXX7791',                                                                  lineSpecs: [...COMMON_LINES.vitamin] },
  { saleNumber: 'OTC-2026-00050', daysAgo: 3, hour: 17, minute: 5,  paymentMethod: 'netbanking', paymentRef: 'NB1290011',                                                            lineSpecs: [...COMMON_LINES.multi] },

  // Day 4 — 6 sales
  { saleNumber: 'OTC-2026-00049', daysAgo: 4, hour: 9,  minute: 30, paymentMethod: 'cash',                                       lineSpecs: [...COMMON_LINES.cold] },
  { saleNumber: 'OTC-2026-00048', daysAgo: 4, hour: 11, minute: 0,  paymentMethod: 'cash',                                       lineSpecs: [...COMMON_LINES.fever] },
  { saleNumber: 'OTC-2026-00047', daysAgo: 4, hour: 12, minute: 38, paymentMethod: 'upi',  paymentRef: '8XXX5510',                                                                  lineSpecs: [...COMMON_LINES.diabetes] },
  { saleNumber: 'OTC-2026-00046', daysAgo: 4, hour: 14, minute: 12, paymentMethod: 'cash', customerName: 'Geetha R',          customerPhone: '+91 98430 12121',                     lineSpecs: [...COMMON_LINES.bp] },
  { saleNumber: 'OTC-2026-00045', daysAgo: 4, hour: 15, minute: 47, paymentMethod: 'card', paymentRef: '5519-8821',                                                                  lineSpecs: [...COMMON_LINES.derm] },
  { saleNumber: 'OTC-2026-00044', daysAgo: 4, hour: 17, minute: 30, paymentMethod: 'cash',                                       lineSpecs: [...COMMON_LINES.cough] },

  // Day 5 — 5 sales
  { saleNumber: 'OTC-2026-00043', daysAgo: 5, hour: 9,  minute: 50, paymentMethod: 'cash',                                       lineSpecs: [...COMMON_LINES.fever] },
  { saleNumber: 'OTC-2026-00042', daysAgo: 5, hour: 11, minute: 21, paymentMethod: 'upi',  paymentRef: '6XXX1190',                                                                  lineSpecs: [...COMMON_LINES.cold] },
  { saleNumber: 'OTC-2026-00041', daysAgo: 5, hour: 13, minute: 14, paymentMethod: 'cash',                                       lineSpecs: [...COMMON_LINES.acid] },
  { saleNumber: 'OTC-2026-00040', daysAgo: 5, hour: 15, minute: 0,  paymentMethod: 'cash',                                       lineSpecs: [...COMMON_LINES.antihista] },
  { saleNumber: 'OTC-2026-00039', daysAgo: 5, hour: 16, minute: 42, paymentMethod: 'upi',  paymentRef: '7XXX2381', customerName: 'Sridhar R',         customerPhone: '+91 99405 22177', lineSpecs: [...COMMON_LINES.multi] },

  // Day 6 — 6 sales
  { saleNumber: 'OTC-2026-00038', daysAgo: 6, hour: 9,  minute: 12, paymentMethod: 'cash',                                       lineSpecs: [...COMMON_LINES.fever] },
  { saleNumber: 'OTC-2026-00037', daysAgo: 6, hour: 10, minute: 33, paymentMethod: 'upi',  paymentRef: '5XXX9921',                                                                  lineSpecs: [...COMMON_LINES.bp] },
  { saleNumber: 'OTC-2026-00036', daysAgo: 6, hour: 12, minute: 0,  paymentMethod: 'cash',                                       lineSpecs: [...COMMON_LINES.cold] },
  { saleNumber: 'OTC-2026-00035', daysAgo: 6, hour: 13, minute: 47, paymentMethod: 'cash',                                       lineSpecs: [...COMMON_LINES.ors] },
  { saleNumber: 'OTC-2026-00034', daysAgo: 6, hour: 15, minute: 10, paymentMethod: 'card', paymentRef: '4429-0091',                                                                  lineSpecs: [...COMMON_LINES.diabetes] },
  { saleNumber: 'OTC-2026-00033', daysAgo: 6, hour: 17, minute: 22, paymentMethod: 'upi',  paymentRef: '8XXX1124',                                                                  lineSpecs: [...COMMON_LINES.topical] },

  // Day 7 — 5
  { saleNumber: 'OTC-2026-00032', daysAgo: 7, hour: 10, minute: 14, paymentMethod: 'cash',                                       lineSpecs: [...COMMON_LINES.fever] },
  { saleNumber: 'OTC-2026-00031', daysAgo: 7, hour: 11, minute: 25, paymentMethod: 'upi',  paymentRef: '3XXX9911',                                                                  lineSpecs: [...COMMON_LINES.cold] },
  { saleNumber: 'OTC-2026-00030', daysAgo: 7, hour: 13, minute: 8,  paymentMethod: 'cash',                                       lineSpecs: [...COMMON_LINES.acid] },
  { saleNumber: 'OTC-2026-00029', daysAgo: 7, hour: 15, minute: 30, paymentMethod: 'cash', customerName: 'Manju S',           customerPhone: '+91 99843 22188',                     lineSpecs: [...COMMON_LINES.bp] },
  { saleNumber: 'OTC-2026-00028', daysAgo: 7, hour: 17, minute: 12, paymentMethod: 'cash',                                       lineSpecs: [...COMMON_LINES.cough] },

  // Day 8 — 5
  { saleNumber: 'OTC-2026-00027', daysAgo: 8, hour: 9,  minute: 28, paymentMethod: 'cash',                                       lineSpecs: [...COMMON_LINES.fever] },
  { saleNumber: 'OTC-2026-00026', daysAgo: 8, hour: 11, minute: 5,  paymentMethod: 'upi',  paymentRef: '2XXX1129',                                                                  lineSpecs: [...COMMON_LINES.diabetes] },
  { saleNumber: 'OTC-2026-00025', daysAgo: 8, hour: 13, minute: 19, paymentMethod: 'cash',                                       lineSpecs: [...COMMON_LINES.acid] },
  { saleNumber: 'OTC-2026-00024', daysAgo: 8, hour: 15, minute: 48, paymentMethod: 'card', paymentRef: '7782-1190',                                                                  lineSpecs: [...COMMON_LINES.antibiotic] },
  { saleNumber: 'OTC-2026-00023', daysAgo: 8, hour: 17, minute: 22, paymentMethod: 'cash',                                       lineSpecs: [...COMMON_LINES.derm] },

  // Day 9 — 4
  { saleNumber: 'OTC-2026-00022', daysAgo: 9, hour: 10, minute: 0,  paymentMethod: 'cash',                                       lineSpecs: [...COMMON_LINES.fever] },
  { saleNumber: 'OTC-2026-00021', daysAgo: 9, hour: 12, minute: 14, paymentMethod: 'upi',  paymentRef: '5XXX9011',                                                                  lineSpecs: [...COMMON_LINES.cold] },
  { saleNumber: 'OTC-2026-00020', daysAgo: 9, hour: 14, minute: 33, paymentMethod: 'cash',                                       lineSpecs: [...COMMON_LINES.ors] },
  { saleNumber: 'OTC-2026-00019', daysAgo: 9, hour: 16, minute: 50, paymentMethod: 'cash',                                       lineSpecs: [...COMMON_LINES.vitamin] },

  // Day 10 — 5
  { saleNumber: 'OTC-2026-00018', daysAgo: 10, hour: 9, minute: 38, paymentMethod: 'cash',                                       lineSpecs: [...COMMON_LINES.fever] },
  { saleNumber: 'OTC-2026-00017', daysAgo: 10, hour: 11, minute: 0, paymentMethod: 'cash',                                       lineSpecs: [...COMMON_LINES.acid] },
  { saleNumber: 'OTC-2026-00016', daysAgo: 10, hour: 13, minute: 28, paymentMethod: 'upi', paymentRef: '4XXX9921',                                                                  lineSpecs: [...COMMON_LINES.diabetes] },
  { saleNumber: 'OTC-2026-00015', daysAgo: 10, hour: 15, minute: 50, paymentMethod: 'cash',                                      lineSpecs: [...COMMON_LINES.cough] },
  { saleNumber: 'OTC-2026-00014', daysAgo: 10, hour: 17, minute: 22, paymentMethod: 'card', paymentRef: '6651-9921',                                                                lineSpecs: [...COMMON_LINES.multi] },

  // Day 11 — 4
  { saleNumber: 'OTC-2026-00013', daysAgo: 11, hour: 10, minute: 22, paymentMethod: 'cash',                                      lineSpecs: [...COMMON_LINES.fever] },
  { saleNumber: 'OTC-2026-00012', daysAgo: 11, hour: 12, minute: 14, paymentMethod: 'upi', paymentRef: '7XXX1129',                                                                  lineSpecs: [...COMMON_LINES.cold] },
  { saleNumber: 'OTC-2026-00011', daysAgo: 11, hour: 14, minute: 47, paymentMethod: 'cash',                                      lineSpecs: [...COMMON_LINES.acid] },
  { saleNumber: 'OTC-2026-00010', daysAgo: 11, hour: 16, minute: 33, paymentMethod: 'cash',                                      lineSpecs: [...COMMON_LINES.bp] },

  // Day 12 — 4
  { saleNumber: 'OTC-2026-00009', daysAgo: 12, hour: 9, minute: 50, paymentMethod: 'cash',                                       lineSpecs: [...COMMON_LINES.fever] },
  { saleNumber: 'OTC-2026-00008', daysAgo: 12, hour: 11, minute: 28, paymentMethod: 'upi', paymentRef: '5XXX2299',                                                                  lineSpecs: [...COMMON_LINES.cold] },
  { saleNumber: 'OTC-2026-00007', daysAgo: 12, hour: 13, minute: 5, paymentMethod: 'cash',                                       lineSpecs: [...COMMON_LINES.diabetes] },
  { saleNumber: 'OTC-2026-00006', daysAgo: 12, hour: 16, minute: 19, paymentMethod: 'cash',                                      lineSpecs: [...COMMON_LINES.cough] },

  // Day 13 — 5
  { saleNumber: 'OTC-2026-00005', daysAgo: 13, hour: 9, minute: 12, paymentMethod: 'cash',                                       lineSpecs: [...COMMON_LINES.fever] },
  { saleNumber: 'OTC-2026-00004', daysAgo: 13, hour: 11, minute: 28, paymentMethod: 'upi', paymentRef: '4XXX5511',                                                                  lineSpecs: [...COMMON_LINES.cold] },
  { saleNumber: 'OTC-2026-00003', daysAgo: 13, hour: 13, minute: 47, paymentMethod: 'cash',                                      lineSpecs: [...COMMON_LINES.bp] },
  { saleNumber: 'OTC-2026-00002', daysAgo: 13, hour: 15, minute: 14, paymentMethod: 'cash',                                      lineSpecs: [...COMMON_LINES.acid] },
  { saleNumber: 'OTC-2026-00001', daysAgo: 13, hour: 17, minute: 0,  paymentMethod: 'card',                                      lineSpecs: [...COMMON_LINES.derm] },
];

export const SEED_OTC_SALES: OtcSaleRecord[] = seeds.map((s, i) => {
  const lines = s.lineSpecs.map((spec) => line(spec.id, spec.qty));
  return {
    saleNumber: s.saleNumber,
    soldAt: daysAgoIso(s.daysAgo, s.hour, s.minute),
    invoiceId: `inv-otc-${i + 1}`,
    invoiceTotal: total(lines),
    lines,
    customerName: s.customerName,
    customerPhone: s.customerPhone,
    paymentMethod: s.paymentMethod,
    paymentRef: s.paymentRef,
  };
});
