import type {
  Grn,
  Medicine,
  MedicineBatch,
  MedicineForm,
  PharmacyAlert,
  StockSeverity,
  Supplier,
} from '../inventoryTypes';

/* ---------- Helpers ---------- */

const med = (
  id: string,
  name: string,
  genericName: string,
  strength: string,
  form: MedicineForm,
  availableQty: number,
  thresholdQty: number,
  severity: StockSeverity,
  earliestExpiry?: string,
  drugClass?: string,
  shelfQty?: number,
  isNarcotic = false,
  requiresPrescription = false,
): Medicine & { shelfQty?: number } => ({
  id,
  name,
  genericName,
  strength,
  form,
  availableQty,
  thresholdQty,
  severity,
  earliestExpiry,
  drugClass,
  isNarcotic: isNarcotic || undefined,
  requiresPrescription: requiresPrescription || undefined,
  // shelfQty isn't part of the Medicine type but is referenced by the
  // pharmacy RxItem snapshot — store it inline so the dispense screen
  // can find it via medicineId join (mock-only field).
  ...(shelfQty !== undefined ? { shelfQty } : {}),
});

/* ---------- Catalogue (60 medicines) ----------
   Coverage: pain, antibiotics, CV, diabetes, GI, respiratory,
   vitamins, topical, drops, pediatric, narcotics. */

export const mockMedicines: Medicine[] = [
  /* Pain & Inflammation (5) */
  med('med-100', 'Paracetamol',           'Acetaminophen',                '500 mg', 'tab', 420,  100, 'ok',          '2027-04-30', 'analgesic',     180),
  med('med-101', 'Ibuprofen',             'Ibuprofen',                    '400 mg', 'tab',  38,  100, 'low',         '2026-09-30', 'nsaid',          18),
  med('med-102', 'Diclofenac',            'Diclofenac sodium',            '50 mg',  'tab', 110,   80, 'ok',          '2026-12-30', 'nsaid',          50),
  med('med-103', 'Naproxen',              'Naproxen sodium',              '250 mg', 'tab',   0,   60, 'out_of_stock', undefined,    'nsaid',           0),
  med('med-104', 'Tramadol',              'Tramadol HCl',                 '50 mg',  'cap',  12,   40, 'low',         '2026-11-30', 'opioid',          5, true,  true),

  /* Antibiotics (6) */
  med('med-110', 'Amoxicillin',           'Amoxicillin',                  '500 mg', 'cap',   0,   80, 'out_of_stock', undefined,    'penicillin',      0, false, true),
  med('med-111', 'Azithromycin',          'Azithromycin',                 '500 mg', 'tab', 200,   60, 'ok',          '2027-06-30', 'macrolide',      80, false, true),
  med('med-112', 'Ciprofloxacin',         'Ciprofloxacin',                '500 mg', 'tab', 145,   60, 'ok',          '2026-10-30', 'fluoroquinolone',60, false, true),
  med('med-113', 'Cefixime',              'Cefixime',                     '200 mg', 'tab', 220,   80, 'ok',          '2027-01-15', 'cephalosporin',  90, false, true),
  med('med-114', 'Doxycycline',           'Doxycycline hyclate',          '100 mg', 'cap',  44,   60, 'low',         '2026-08-30', 'tetracycline',   20, false, true),
  med('med-115', 'Metronidazole',         'Metronidazole',                '400 mg', 'tab', 165,   60, 'ok',          '2027-02-28', 'nitroimidazole', 60, false, true),

  /* Cardiovascular (7) */
  med('med-120', 'Amlodipine',            'Amlodipine besylate',          '5 mg',   'tab',   0,   80, 'out_of_stock', undefined,    'ccb',             0, false, true),
  med('med-121', 'Atenolol',              'Atenolol',                     '50 mg',  'tab', 240,   80, 'ok',          '2027-03-31', 'beta_blocker',  100, false, true),
  med('med-122', 'Telmisartan',           'Telmisartan',                  '40 mg',  'tab', 180,   80, 'ok',          '2027-05-31', 'arb',            70, false, true),
  med('med-123', 'Atorvastatin',          'Atorvastatin',                 '10 mg',  'tab', 320,  100, 'ok',          '2027-08-31', 'statin',        130, false, true),
  med('med-124', 'Aspirin',               'Acetylsalicylic acid',         '75 mg',  'tab', 510,  150, 'ok',          '2028-01-31', 'antiplatelet',  200),
  med('med-125', 'Clopidogrel',           'Clopidogrel bisulfate',        '75 mg',  'tab',  18,   60, 'low',         '2026-09-30', 'antiplatelet',    8, false, true),
  med('med-126', 'Losartan',              'Losartan potassium',           '50 mg',  'tab', 195,   80, 'ok',          '2027-04-30', 'arb',            75, false, true),

  /* Diabetes (5) */
  med('med-130', 'Metformin',             'Metformin HCl',                '500 mg', 'tab', 540,  150, 'ok',          '2027-08-30', 'biguanide',     220, false, true),
  med('med-131', 'Glimepiride',           'Glimepiride',                  '2 mg',   'tab',  18,   60, 'low',         '2026-10-15', 'sulfonylurea',    8, false, true),
  med('med-132', 'Sitagliptin',           'Sitagliptin phosphate',        '50 mg',  'tab',  90,   40, 'ok',          '2027-02-28', 'dpp4',           40, false, true),
  med('med-133', 'Insulin Glargine',      'Insulin glargine (rDNA)',      '100 IU/mL','inj',  16,   20, 'low',         '2026-11-30', 'insulin',         8, false, true),
  med('med-134', 'Insulin Regular',       'Insulin regular (rDNA)',       '40 IU/mL', 'inj',   0,   20, 'out_of_stock', undefined,   'insulin',         0, false, true),

  /* Acid + GI (5) */
  med('med-140', 'Pantoprazole',          'Pantoprazole sodium',          '40 mg',  'tab',  22,   80, 'low',         '2026-06-30', 'ppi',             8),
  med('med-141', 'Omeprazole',            'Omeprazole',                   '20 mg',  'cap', 280,   80, 'ok',          '2027-05-31', 'ppi',           120),
  med('med-142', 'Ranitidine',            'Ranitidine',                   '150 mg', 'tab',  60,   60, 'ok',          '2026-08-31', 'h2_blocker',     20),
  med('med-143', 'Domperidone',           'Domperidone maleate',          '10 mg',  'tab', 165,   60, 'ok',          '2027-04-30', 'prokinetic',     70),
  med('med-144', 'Ondansetron',           'Ondansetron HCl',              '4 mg',   'tab', 130,   50, 'ok',          '2027-01-15', 'antiemetic',     50, false, true),

  /* Respiratory (5) */
  med('med-150', 'Salbutamol',            'Salbutamol sulfate',           '100 mcg','inj',  44,   30, 'ok',          '2027-03-31', 'saba',           20),
  med('med-151', 'Budesonide',            'Budesonide',                   '200 mcg','inj',  18,   25, 'low',         '2026-12-15', 'ics',             6),
  med('med-152', 'Montelukast',           'Montelukast sodium',           '10 mg',  'tab', 140,   50, 'ok',          '2027-06-30', 'ltra',           60, false, true),
  med('med-153', 'Cetirizine',            'Cetirizine HCl',               '10 mg',  'tab', 380,  100, 'ok',          '2027-09-30', 'antihistamine', 150),
  med('med-154', 'Levocetirizine',        'Levocetirizine HCl',           '5 mg',   'tab', 220,   80, 'ok',          '2027-07-31', 'antihistamine',  90),

  /* Vitamins & Supplements (5) */
  med('med-160', 'Vitamin D3',            'Cholecalciferol',              '60000 IU','cap',180,   60, 'ok',          '2028-01-31', 'supplement',     80),
  med('med-161', 'Vitamin B12',           'Methylcobalamin',              '1000 mcg','inj', 28,   25, 'ok',          '2026-10-31', 'supplement',     12),
  med('med-162', 'Iron + Folic Acid',     'Ferrous fumarate + Folic acid','60 mg',  'tab', 450,  120, 'ok',          '2027-11-30', 'supplement',    180),
  med('med-163', 'Calcium + Vit D3',      'Calcium carbonate + D3',       '500 mg', 'tab',  40,   60, 'near_expiry', '2026-06-15', 'supplement',     20),
  med('med-164', 'Multivitamin',          'Multivitamin + minerals',      '—',      'cap', 240,   80, 'ok',          '2027-08-31', 'supplement',    100),

  /* Topical (4) */
  med('med-170', 'Diclofenac gel',        'Diclofenac diethylamine',      '1.16%',  'oint',105,   40, 'ok',          '2027-03-31', 'nsaid',          50),
  med('med-171', 'Mupirocin',             'Mupirocin',                    '2%',     'oint', 38,   25, 'low',         '2026-09-30', 'topical_abx',    18, false, true),
  med('med-172', 'Clotrimazole cream',    'Clotrimazole',                 '1%',     'oint', 62,   30, 'ok',          '2027-02-28', 'antifungal',     30),
  med('med-173', 'Hydrocortisone',        'Hydrocortisone acetate',       '1%',     'oint',  0,   25, 'out_of_stock', undefined,   'corticosteroid',  0, false, true),

  /* Eye / Ear / Nose drops (3) */
  med('med-180', 'Tobramycin eye drops',  'Tobramycin',                   '0.3%',   'drops',24,   20, 'ok',          '2026-11-15', 'topical_abx',    12, false, true),
  med('med-181', 'Xylometazoline nasal',  'Xylometazoline HCl',           '0.1%',   'drops',38,   20, 'ok',          '2027-04-30', 'decongestant',   18),
  med('med-182', 'Ciprofloxacin ear',     'Ciprofloxacin',                '0.3%',   'drops',12,   15, 'low',         '2026-08-30', 'topical_abx',     6, false, true),

  /* Pediatric (4) */
  med('med-190', 'Paracetamol syrup',     'Acetaminophen',                '125 mg/5mL','syrup', 78,   40, 'ok',       '2026-12-31', 'analgesic',      30),
  med('med-191', 'Ibuprofen syrup',       'Ibuprofen',                    '100 mg/5mL','syrup',  4,   30, 'low',      '2026-10-31', 'nsaid',           4),
  med('med-192', 'ORS sachets',           'Oral Rehydration Salt',        '21.8 g', 'syrup',420,  120, 'ok',          '2028-04-30', 'rehydration',   180),
  med('med-193', 'Cefixime syrup',        'Cefixime',                     '100 mg/5mL','syrup', 26,   25, 'ok',       '2026-09-30', 'cephalosporin',  12, false, true),

  /* Narcotics (1 — already covered Tramadol above; add Pentazocine) */
  med('med-200', 'Pentazocine',           'Pentazocine',                  '30 mg',  'inj',   8,   15, 'low',         '2026-08-30', 'opioid',          4, true,  true),

  /* Older / expired entry (1) */
  med('med-210', 'Cotrimoxazole',         'Sulfamethoxazole + Trimethoprim','480 mg','tab',  18,   60, 'expired',     '2025-12-20', 'sulfa',           8),

  /* Recently expired contrast / injectable */
  med('med-211', 'Iopamidol contrast',    'Iopamidol',                    '370 mg/mL','inj',  18,   20, 'expired',     '2025-11-30', 'contrast',        4, false, true),

  /* Near-expiry (3) */
  med('med-212', 'Atenolol 25mg',         'Atenolol',                     '25 mg',  'tab',  60,   60, 'near_expiry', '2026-06-12', 'beta_blocker',   24, false, true),
  med('med-213', 'Hydrochlorothiazide',   'Hydrochlorothiazide',          '12.5 mg','tab',  35,   40, 'near_expiry', '2026-06-10', 'diuretic',       12, false, true),
  med('med-214', 'Lorazepam',             'Lorazepam',                    '1 mg',   'tab',  22,   25, 'near_expiry', '2026-06-08', 'benzodiazepine',  6, false, true),
];

/**
 * Mock-only side-table for the dispensing surface — `RxItem.shelfQty`.
 * Looked up by medicineId; defaults to availableQty when not set.
 */
export const mockShelfQty: Record<string, number> = Object.fromEntries(
  mockMedicines
    .map((m) => {
      const shelf = (m as Medicine & { shelfQty?: number }).shelfQty;
      return shelf !== undefined ? [m.id, shelf] : [m.id, m.availableQty];
    }),
);

/* ---------- Pharmacy alerts (snapshot of low / expired / OOS / near-expiry) ---------- */

export const mockPharmacyAlerts: PharmacyAlert[] = mockMedicines
  .filter((m) => m.severity !== 'ok')
  .map((m) => ({
    medicineId: m.id,
    medicineName: m.name,
    strength: m.strength,
    availableQty: m.availableQty,
    thresholdQty: m.thresholdQty,
    expiry: m.earliestExpiry,
    severity: m.severity,
  }));

/* ---------- Suppliers (15 — Indian pharma distributors) ---------- */

export const mockSuppliers: Supplier[] = [
  { id: 'sup-001', name: 'Apollo Pharma Distributors', gstin: '33ABCDE1234F1Z5', contactPerson: 'Suresh Kumar', phone: '+91 80808 70010', email: 'orders@apollo-pharma.in',  address: '14 Chetpet, Chennai 600031',           outstandingBalance: 124500, isActive: true },
  { id: 'sup-002', name: 'MedPlus Wholesale',          gstin: '33FGHIJ5678K2Y4', contactPerson: 'Priya Kumar',  phone: '+91 81818 60030', email: 'wholesale@medplus.in',     address: '22 Anna Salai, Chennai 600002',         outstandingBalance:  38200, isActive: true },
  { id: 'sup-003', name: 'Cipla India',                gstin: '27LMNOP9012Q3X8', contactPerson: 'Anand Kumar',    phone: '+91 82828 50055', email: 'south@cipla.com',          address: '5 OMR, Chennai 600119',                 outstandingBalance:      0, isActive: true },
  { id: 'sup-004', name: 'Sun Pharma Distribution',    gstin: '24QRSTU4567V6W2', contactPerson: 'Latha Mehta',  phone: '+91 83838 40077', email: 'tn-orders@sunpharma.com',  address: '11 Mount Road, Chennai 600015',         outstandingBalance:  87600, isActive: true },
  { id: 'sup-005', name: 'Alkem Labs',                 gstin: '27VWXYZ1234A5B6', contactPerson: 'Manoj Kumar',   phone: '+91 84848 30099', email: 'orders@alkem.com',         address: '33 Velachery Tambaram Road, Chennai 600100', outstandingBalance:  52300, isActive: true },
  { id: 'sup-006', name: 'Lupin Distributors',         gstin: '27CDEFG7890H1I2', contactPerson: 'Reshma Pawar', phone: '+91 85858 20011', email: 'south.tn@lupin.com',       address: '8 OMR, Chennai 600097',                 outstandingBalance:  19400, isActive: true },
  { id: 'sup-007', name: "Dr. Reddy's Wholesale",      gstin: '36JKLMN1234O5P6', contactPerson: 'Ravi Kishan',  phone: '+91 86868 10022', email: 'south@drreddys.com',       address: '17 Adyar, Chennai 600020',              outstandingBalance:  64800, isActive: true },
  { id: 'sup-008', name: 'Aurobindo Pharma',           gstin: '36QRSTU4567V8W9', contactPerson: 'Anil Kumar',   phone: '+91 87878 90033', email: 'tn-orders@aurobindo.com',  address: '5 Tambaram East, Chennai 600059',       outstandingBalance:      0, isActive: true },
  { id: 'sup-009', name: 'Mankind Pharma',             gstin: '07XYZAB1234C5D6', contactPerson: 'Neha Sharma',  phone: '+91 88888 80044', email: 'south@mankindpharma.com',  address: '22 Porur, Chennai 600116',              outstandingBalance:  31200, isActive: true },
  { id: 'sup-010', name: 'Zydus Cadila',               gstin: '24EFGHI7890J1K2', contactPerson: 'Bhavin Shah',  phone: '+91 89898 70055', email: 'south@zyduscadila.com',    address: '11 OMR Karapakkam, Chennai 600097',     outstandingBalance:  45600, isActive: true },
  { id: 'sup-011', name: 'Glenmark',                   gstin: '27LMNOP1234Q5R6', contactPerson: 'Sandeep Joshi',phone: '+91 90909 60066', email: 'distrib.south@glenmark.com', address: '14 Anna Nagar, Chennai 600040',       outstandingBalance:      0, isActive: true },
  { id: 'sup-012', name: 'Torrent Pharma',             gstin: '24STUVW7890X1Y2', contactPerson: 'Mehul Patel',  phone: '+91 91919 50077', email: 'south.tn@torrentpharma.com', address: '6 Saidapet, Chennai 600015',          outstandingBalance:  92100, isActive: true },
  { id: 'sup-013', name: 'Wockhardt',                  gstin: '27ZABCD1234E5F6', contactPerson: 'Karan Mehta',  phone: '+91 92929 40088', email: 'south@wockhardt.com',      address: '19 Mylapore, Chennai 600004',           outstandingBalance:  -8500, isActive: true }, // credit balance
  { id: 'sup-014', name: 'Hetero Drugs',               gstin: '36GHIJK7890L1M2', contactPerson: 'Vinod Kumar',  phone: '+91 93939 30099', email: 'south.tn@heterodrugs.com', address: '12 Tambaram West, Chennai 600045',      outstandingBalance:  41200, isActive: true },
  { id: 'sup-015', name: 'Biocon Distributors',        gstin: '29NOPQR1234S5T6', contactPerson: 'Anitha Suresh',phone: '+91 94949 20011', email: 'tn-distrib@biocon.com',    address: '7 Besant Nagar, Chennai 600090',        outstandingBalance:  17800, isActive: true },
];

/* ---------- Batches (~20) — references real medicines + suppliers ---------- */

const ymdPlusDays = (n: number): string => {
  const d = new Date('2026-05-17T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const mockMedicineBatches: MedicineBatch[] = [
  { id: 'bat-001', medicineId: 'med-100', medicineName: 'Paracetamol',     strength: '500 mg',     batchNumber: 'PAR-A2401', mfgDate: '2024-06-01', expiryDate: '2027-04-30', quantityOnHand: 320, unitCost: 0.9,  unitPrice: 1.5, supplierId: 'sup-001', supplierName: 'Apollo Pharma Distributors', receivedAt: '2025-09-12T10:00:00Z', isActive: true },
  { id: 'bat-002', medicineId: 'med-100', medicineName: 'Paracetamol',     strength: '500 mg',     batchNumber: 'PAR-B2503', mfgDate: '2025-04-01', expiryDate: '2028-03-31', quantityOnHand: 100, unitCost: 0.95, unitPrice: 1.5, supplierId: 'sup-002', supplierName: 'MedPlus Wholesale',          receivedAt: '2025-12-21T11:30:00Z', isActive: true },
  { id: 'bat-003', medicineId: 'med-101', medicineName: 'Ibuprofen',       strength: '400 mg',     batchNumber: 'IBU-2412',  mfgDate: '2024-12-01', expiryDate: '2026-09-30', quantityOnHand:  38, unitCost: 1.4,  unitPrice: 2.0, supplierId: 'sup-001', supplierName: 'Apollo Pharma Distributors', receivedAt: '2025-02-04T09:00:00Z', isActive: true },
  { id: 'bat-004', medicineId: 'med-102', medicineName: 'Diclofenac',      strength: '50 mg',      batchNumber: 'DIC-2503',  mfgDate: '2025-03-01', expiryDate: '2026-12-30', quantityOnHand: 110, unitCost: 1.8,  unitPrice: 3.0, supplierId: 'sup-003', supplierName: 'Cipla India',                 receivedAt: '2025-08-14T08:30:00Z', isActive: true },
  { id: 'bat-005', medicineId: 'med-140', medicineName: 'Pantoprazole',    strength: '40 mg',      batchNumber: 'PAN-A2502', mfgDate: '2025-02-01', expiryDate: ymdPlusDays(45), quantityOnHand: 22, unitCost: 2.5, unitPrice: 4.0, supplierId: 'sup-002', supplierName: 'MedPlus Wholesale',          receivedAt: '2025-06-09T12:00:00Z', isActive: true },
  { id: 'bat-006', medicineId: 'med-163', medicineName: 'Calcium + Vit D3',strength: '500 mg',     batchNumber: 'CAL-2401',  mfgDate: '2024-01-01', expiryDate: ymdPlusDays(35), quantityOnHand: 40, unitCost: 3.0, unitPrice: 5.0, supplierId: 'sup-001', supplierName: 'Apollo Pharma Distributors', receivedAt: '2024-08-04T10:00:00Z', isActive: true },
  { id: 'bat-007', medicineId: 'med-130', medicineName: 'Metformin',       strength: '500 mg',     batchNumber: 'MET-2603',  mfgDate: '2026-01-01', expiryDate: '2028-02-28', quantityOnHand: 540, unitCost: 1.5,  unitPrice: 2.5, supplierId: 'sup-008', supplierName: 'Aurobindo Pharma',           receivedAt: '2026-04-10T11:00:00Z', isActive: true },
  { id: 'bat-008', medicineId: 'med-120', medicineName: 'Amlodipine',      strength: '5 mg',       batchNumber: 'AML-2510',  mfgDate: '2025-10-01', expiryDate: '2027-09-30', quantityOnHand:   0, unitCost: 1.7,  unitPrice: 3.0, supplierId: 'sup-007', supplierName: "Dr. Reddy's Wholesale",       receivedAt: '2025-12-20T08:00:00Z', isActive: true },
  { id: 'bat-009', medicineId: 'med-110', medicineName: 'Amoxicillin',     strength: '500 mg',     batchNumber: 'AMX-2502',  mfgDate: '2025-02-01', expiryDate: '2026-09-30', quantityOnHand:   0, unitCost: 4.5,  unitPrice: 7.5, supplierId: 'sup-006', supplierName: 'Lupin Distributors',         receivedAt: '2025-08-05T08:00:00Z', isActive: true },
  { id: 'bat-010', medicineId: 'med-111', medicineName: 'Azithromycin',    strength: '500 mg',     batchNumber: 'AZI-2510',  mfgDate: '2025-10-01', expiryDate: '2027-06-30', quantityOnHand: 200, unitCost: 6.0,  unitPrice: 9.5, supplierId: 'sup-004', supplierName: 'Sun Pharma Distribution',     receivedAt: '2026-02-12T10:00:00Z', isActive: true },
  { id: 'bat-011', medicineId: 'med-123', medicineName: 'Atorvastatin',    strength: '10 mg',      batchNumber: 'ATO-2509',  mfgDate: '2025-09-01', expiryDate: '2027-08-31', quantityOnHand: 320, unitCost: 1.2,  unitPrice: 2.0, supplierId: 'sup-005', supplierName: 'Alkem Labs',                  receivedAt: '2025-12-09T10:00:00Z', isActive: true },
  { id: 'bat-012', medicineId: 'med-104', medicineName: 'Tramadol',        strength: '50 mg',      batchNumber: 'TRA-2511',  mfgDate: '2025-11-01', expiryDate: '2026-11-30', quantityOnHand:  12, unitCost: 4.0,  unitPrice: 6.5, supplierId: 'sup-009', supplierName: 'Mankind Pharma',              receivedAt: '2025-12-20T10:00:00Z', isActive: true },
  { id: 'bat-013', medicineId: 'med-160', medicineName: 'Vitamin D3',      strength: '60000 IU',   batchNumber: 'VTD-2601',  mfgDate: '2026-01-01', expiryDate: '2028-01-31', quantityOnHand: 180, unitCost: 8.0,  unitPrice:13.0, supplierId: 'sup-010', supplierName: 'Zydus Cadila',                receivedAt: '2026-03-14T10:00:00Z', isActive: true },
  { id: 'bat-014', medicineId: 'med-150', medicineName: 'Salbutamol',      strength: '100 mcg',    batchNumber: 'SAL-2509',  mfgDate: '2025-09-01', expiryDate: '2027-03-31', quantityOnHand:  44, unitCost:75.0,  unitPrice:120.0,supplierId: 'sup-003', supplierName: 'Cipla India',                 receivedAt: '2025-11-22T10:00:00Z', isActive: true },
  { id: 'bat-015', medicineId: 'med-153', medicineName: 'Cetirizine',      strength: '10 mg',      batchNumber: 'CET-2602',  mfgDate: '2026-02-01', expiryDate: '2027-09-30', quantityOnHand: 380, unitCost: 0.8,  unitPrice: 1.2, supplierId: 'sup-004', supplierName: 'Sun Pharma Distribution',     receivedAt: '2026-04-08T10:00:00Z', isActive: true },
  { id: 'bat-016', medicineId: 'med-210', medicineName: 'Cotrimoxazole',   strength: '480 mg',     batchNumber: 'COT-2305',  mfgDate: '2023-05-01', expiryDate: '2025-12-20', quantityOnHand:  18, unitCost: 1.5,  unitPrice: 2.5, supplierId: 'sup-006', supplierName: 'Lupin Distributors',         receivedAt: '2023-12-14T08:30:00Z', isActive: true },
  { id: 'bat-017', medicineId: 'med-133', medicineName: 'Insulin Glargine',strength: '100 IU/mL',  batchNumber: 'GLA-2510',  mfgDate: '2025-10-01', expiryDate: '2026-11-30', quantityOnHand:  16, unitCost:380.0, unitPrice:520.0,supplierId: 'sup-015', supplierName: 'Biocon Distributors',         receivedAt: '2025-12-16T10:00:00Z', isActive: true },
  { id: 'bat-018', medicineId: 'med-191', medicineName: 'Ibuprofen syrup', strength: '100 mg/5mL', batchNumber: 'IBS-2509',  mfgDate: '2025-09-01', expiryDate: '2026-10-31', quantityOnHand:   4, unitCost:38.0,  unitPrice: 60.0,supplierId: 'sup-007', supplierName: "Dr. Reddy's Wholesale",       receivedAt: '2025-12-18T10:00:00Z', isActive: true },
  { id: 'bat-019', medicineId: 'med-192', medicineName: 'ORS sachets',     strength: '21.8 g',     batchNumber: 'ORS-2604',  mfgDate: '2026-04-01', expiryDate: '2028-04-30', quantityOnHand: 420, unitCost: 6.0,  unitPrice: 9.0, supplierId: 'sup-011', supplierName: 'Glenmark',                    receivedAt: '2026-04-22T10:00:00Z', isActive: true },
  { id: 'bat-020', medicineId: 'med-211', medicineName: 'Iopamidol contrast',strength: '370 mg/mL',batchNumber: 'IOP-2410',  mfgDate: '2024-10-01', expiryDate: '2025-11-30', quantityOnHand:  18, unitCost:380.0, unitPrice:520.0,supplierId: 'sup-013', supplierName: 'Wockhardt',                   receivedAt: '2024-12-30T10:00:00Z', isActive: true },
];

/**
 * FEFO consume — deduct `qty` from the earliest-expiring active batches.
 */
export const consumeStockFefo = (medicineId: string, qty: number): number => {
  let remaining = qty;
  const candidates = mockMedicineBatches
    .filter((b) => b.medicineId === medicineId && b.isActive && b.quantityOnHand > 0)
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
  for (const batch of candidates) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantityOnHand, remaining);
    batch.quantityOnHand -= take;
    remaining -= take;
  }
  const consumed = qty - remaining;
  const m = mockMedicines.find((x) => x.id === medicineId);
  if (m) m.availableQty = Math.max(0, m.availableQty - consumed);
  return consumed;
};

/* ---------- GRNs (~17) — referenced suppliers, last 60 days ---------- */

export const mockGrns: Grn[] = [
  { id: 'grn-001', grnNumber: 'GRN-2026-000118', supplierId: 'sup-001', supplierName: 'Apollo Pharma Distributors', supplierInvoiceNo: 'APO-INV-44219', receivedAt: '2026-03-22T10:30:00Z', receivedBy: 'usr-inv-001', lineCount:  6, totalQuantity:  1640, totalCost: 152400 },
  { id: 'grn-002', grnNumber: 'GRN-2026-000119', supplierId: 'sup-002', supplierName: 'MedPlus Wholesale',          supplierInvoiceNo: 'MC-2026-9912',  receivedAt: '2026-03-29T11:00:00Z', receivedBy: 'usr-inv-001', lineCount:  9, totalQuantity:  2200, totalCost:  84500 },
  { id: 'grn-003', grnNumber: 'GRN-2026-000120', supplierId: 'sup-003', supplierName: 'Cipla India',                supplierInvoiceNo: 'CIP-DC-3210',   receivedAt: '2026-04-02T09:30:00Z', receivedBy: 'usr-inv-001', lineCount:  4, totalQuantity:   780, totalCost:  64800 },
  { id: 'grn-004', grnNumber: 'GRN-2026-000121', supplierId: 'sup-005', supplierName: 'Alkem Labs',                 supplierInvoiceNo: 'ALK-2026-411',  receivedAt: '2026-04-06T14:00:00Z', receivedBy: 'usr-inv-001', lineCount:  7, totalQuantity:  1100, totalCost:  93200 },
  { id: 'grn-005', grnNumber: 'GRN-2026-000122', supplierId: 'sup-004', supplierName: 'Sun Pharma Distribution',    supplierInvoiceNo: 'SUN-DC-7702',   receivedAt: '2026-04-09T10:00:00Z', receivedBy: 'usr-inv-001', lineCount: 11, totalQuantity:  1820, totalCost: 213700 },
  { id: 'grn-006', grnNumber: 'GRN-2026-000123', supplierId: 'sup-006', supplierName: 'Lupin Distributors',         supplierInvoiceNo: 'LUP-INV-1188',  receivedAt: '2026-04-13T11:30:00Z', receivedBy: 'usr-inv-001', lineCount:  3, totalQuantity:   620, totalCost:  41500 },
  { id: 'grn-007', grnNumber: 'GRN-2026-000124', supplierId: 'sup-007', supplierName: "Dr. Reddy's Wholesale",      supplierInvoiceNo: 'DRR-DC-9981',   receivedAt: '2026-04-17T13:30:00Z', receivedBy: 'usr-inv-001', lineCount:  8, totalQuantity:  1450, totalCost: 124800 },
  { id: 'grn-008', grnNumber: 'GRN-2026-000125', supplierId: 'sup-008', supplierName: 'Aurobindo Pharma',           supplierInvoiceNo: 'AUR-2026-220',  receivedAt: '2026-04-20T10:00:00Z', receivedBy: 'usr-inv-001', lineCount:  5, totalQuantity:  1680, totalCost:  68400 },
  { id: 'grn-009', grnNumber: 'GRN-2026-000126', supplierId: 'sup-009', supplierName: 'Mankind Pharma',             supplierInvoiceNo: 'MAN-DC-4421',   receivedAt: '2026-04-24T09:00:00Z', receivedBy: 'usr-inv-001', lineCount:  6, totalQuantity:   980, totalCost:  41200 },
  { id: 'grn-010', grnNumber: 'GRN-2026-000127', supplierId: 'sup-010', supplierName: 'Zydus Cadila',               supplierInvoiceNo: 'ZYD-INV-7811',  receivedAt: '2026-04-28T11:00:00Z', receivedBy: 'usr-inv-001', lineCount:  4, totalQuantity:   720, totalCost:  82400 },
  { id: 'grn-011', grnNumber: 'GRN-2026-000128', supplierId: 'sup-011', supplierName: 'Glenmark',                   supplierInvoiceNo: 'GLN-2026-1190', receivedAt: '2026-05-02T10:30:00Z', receivedBy: 'usr-inv-001', lineCount:  3, totalQuantity:   540, totalCost:  29800 },
  { id: 'grn-012', grnNumber: 'GRN-2026-000129', supplierId: 'sup-012', supplierName: 'Torrent Pharma',             supplierInvoiceNo: 'TOR-DC-2208',   receivedAt: '2026-05-05T13:00:00Z', receivedBy: 'usr-inv-001', lineCount:  9, totalQuantity:  1820, totalCost: 168400 },
  { id: 'grn-013', grnNumber: 'GRN-2026-000130', supplierId: 'sup-001', supplierName: 'Apollo Pharma Distributors', supplierInvoiceNo: 'APO-INV-44890', receivedAt: '2026-05-08T11:30:00Z', receivedBy: 'usr-inv-001', lineCount:  7, totalQuantity:  1320, totalCost: 102400 },
  { id: 'grn-014', grnNumber: 'GRN-2026-000131', supplierId: 'sup-013', supplierName: 'Wockhardt',                  supplierInvoiceNo: 'WOC-2026-310',  receivedAt: '2026-05-10T10:00:00Z', receivedBy: 'usr-inv-001', lineCount:  2, totalQuantity:    320, totalCost:  18400 },
  { id: 'grn-015', grnNumber: 'GRN-2026-000132', supplierId: 'sup-014', supplierName: 'Hetero Drugs',               supplierInvoiceNo: 'HET-DC-4400',   receivedAt: '2026-05-12T14:00:00Z', receivedBy: 'usr-inv-001', lineCount:  5, totalQuantity:   980, totalCost:  53400 },
  { id: 'grn-016', grnNumber: 'GRN-2026-000133', supplierId: 'sup-015', supplierName: 'Biocon Distributors',        supplierInvoiceNo: 'BIO-INV-1102',  receivedAt: '2026-05-14T11:00:00Z', receivedBy: 'usr-inv-001', lineCount:  4, totalQuantity:   480, totalCost:  78400 },
  { id: 'grn-017', grnNumber: 'GRN-2026-000134', supplierId: 'sup-002', supplierName: 'MedPlus Wholesale',          supplierInvoiceNo: 'MC-2026-9988',  receivedAt: '2026-05-16T10:00:00Z', receivedBy: 'usr-inv-001', lineCount: 12, totalQuantity:  3100, totalCost: 138900 },
];
