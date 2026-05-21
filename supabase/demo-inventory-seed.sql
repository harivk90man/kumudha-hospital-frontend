-- =====================================================================
-- demo-inventory-seed.sql
-- Convert inventoryMocks -> DB tables: vendors, drug_catalogue, drug_stock.
-- Skips GRNs (purchase_orders chain) and drug_stock_ledger (movement-only).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Vendors (from mockSuppliers)
-- ---------------------------------------------------------------------
insert into vendors (
  vendor_code, vendor_name, address, gstin, payment_terms_days,
  is_narcotic_supplier, created_by
)
select v.code, v.name,
       jsonb_build_object('line1', v.addr, 'city', 'Chennai', 'state', 'Tamil Nadu', 'country', 'IN'),
       v.gstin, 30, false,
       '00000000-0000-0000-0000-000000000001'::uuid
from (values
  ('VEN-001', 'Apollo Pharma Distributors',  '33ABCDE1234F1Z5', '14 Chetpet, Chennai 600031'),
  ('VEN-002', 'MedPlus Wholesale',            '33FGHIJ5678K2Y4', '22 Anna Salai, Chennai 600002'),
  ('VEN-003', 'Cipla India',                  '27LMNOP9012Q3X8', '5 OMR, Chennai 600119'),
  ('VEN-004', 'Sun Pharma Distribution',      '24QRSTU4567V6W2', '11 Mount Road, Chennai 600015'),
  ('VEN-005', 'Alkem Labs',                   '27VWXYZ1234A5B6', '33 Velachery Tambaram Road, Chennai 600100'),
  ('VEN-006', 'Lupin Distributors',           '27CDEFG7890H1I2', '8 OMR, Chennai 600097'),
  ('VEN-007', 'Dr Reddys Wholesale',          '36JKLMN1234O5P6', '17 Adyar, Chennai 600020'),
  ('VEN-008', 'Aurobindo Pharma',             '36QRSTU4567V8W9', '5 Tambaram East, Chennai 600059'),
  ('VEN-009', 'Mankind Pharma',               '07XYZAB1234C5D6', '22 Porur, Chennai 600116'),
  ('VEN-010', 'Zydus Cadila',                 '24EFGHI7890J1K2', '11 OMR Karapakkam, Chennai 600097'),
  ('VEN-011', 'Glenmark',                     '27LMNOP1234Q5R6', '14 Anna Nagar, Chennai 600040'),
  ('VEN-012', 'Torrent Pharma',               '24STUVW7890X1Y2', '6 Saidapet, Chennai 600015'),
  ('VEN-013', 'Wockhardt',                    '27ZABCD1234E5F6', '19 Mylapore, Chennai 600004'),
  ('VEN-014', 'Hetero Drugs',                 '36GHIJK7890L1M2', '12 Tambaram West, Chennai 600045'),
  ('VEN-015', 'Biocon Distributors',          '29NOPQR1234S5T6', '7 Besant Nagar, Chennai 600090')
) as v(code, name, gstin, addr)
where not exists (select 1 from vendors x where x.vendor_code = v.code and x.deleted_at is null);

-- ---------------------------------------------------------------------
-- 2. Drug catalogue (the 50 not yet seeded — existing 10 stay)
--    form mapping: tab→tablet, cap→capsule, inj→injection, oint→ointment, drops→drops, syrup→syrup
-- ---------------------------------------------------------------------
insert into drug_catalogue (
  drug_code, generic_name, brand_name, manufacturer, drug_class, category,
  drug_schedule, is_narcotic, form, strength, unit, pack_size, hsn_code,
  gst_pct, requires_prescription, low_stock_threshold, max_stock_threshold,
  storage_temp, created_by
)
select v.code, v.generic, v.brand, v.mfr, v.cls, v.cat,
       'H', v.narc, v.form, v.strength, v.unitv, v.pack,
       '30049099', 12, v.rxr, v.lo, v.lo*10, 'room',
       '00000000-0000-0000-0000-000000000001'::uuid
from (values
  ('DRG-IBU-400',   'Ibuprofen',             'Brufen 400',    'Abbott',     'nsaid',           'oral_tablet',   false, 'tablet',    '400 mg',    'tablet',  10, true,  100),
  ('DRG-DIC-50',    'Diclofenac sodium',     'Voveran 50',    'Novartis',   'nsaid',           'oral_tablet',   false, 'tablet',    '50 mg',     'tablet',  10, true,  80),
  ('DRG-NAP-250',   'Naproxen sodium',       'Naprosyn 250',  'Roche',      'nsaid',           'oral_tablet',   false, 'tablet',    '250 mg',    'tablet',  10, true,  60),
  ('DRG-TRA-50',    'Tramadol HCl',          'Tramazac 50',   'Zydus',      'opioid',          'oral_capsule',  true,  'capsule',   '50 mg',     'capsule', 10, true,  40),
  ('DRG-CIP-500',   'Ciprofloxacin',         'Cifran 500',    'Ranbaxy',    'fluoroquinolone', 'oral_tablet',   false, 'tablet',    '500 mg',    'tablet',  10, true,  60),
  ('DRG-CEF-200',   'Cefixime',              'Taxim-O 200',   'Alkem',      'cephalosporin',   'oral_tablet',   false, 'tablet',    '200 mg',    'tablet',  10, true,  80),
  ('DRG-DOX-100',   'Doxycycline hyclate',   'Doxy 100',      'Cipla',      'tetracycline',    'oral_capsule',  false, 'capsule',   '100 mg',    'capsule', 10, true,  60),
  ('DRG-MET-400',   'Metronidazole',         'Flagyl 400',    'Sanofi',     'nitroimidazole',  'oral_tablet',   false, 'tablet',    '400 mg',    'tablet',  10, true,  60),
  ('DRG-ATE-50',    'Atenolol',              'Tenormin 50',   'AstraZeneca','beta_blocker',    'oral_tablet',   false, 'tablet',    '50 mg',     'tablet',  10, true,  80),
  ('DRG-TEL-40',    'Telmisartan',           'Telma 40',      'Glenmark',   'arb',             'oral_tablet',   false, 'tablet',    '40 mg',     'tablet',  10, true,  80),
  ('DRG-ASP-75',    'Acetylsalicylic acid',  'Ecosprin 75',   'USV',        'antiplatelet',    'oral_tablet',   false, 'tablet',    '75 mg',     'tablet',  14, false, 150),
  ('DRG-CLO-75',    'Clopidogrel',           'Plavix 75',     'Sanofi',     'antiplatelet',    'oral_tablet',   false, 'tablet',    '75 mg',     'tablet',  10, true,  60),
  ('DRG-LOS-50',    'Losartan potassium',    'Losar 50',      'Unichem',    'arb',             'oral_tablet',   false, 'tablet',    '50 mg',     'tablet',  10, true,  80),
  ('DRG-GLI-2',     'Glimepiride',           'Amaryl 2',      'Sanofi',     'sulfonylurea',    'oral_tablet',   false, 'tablet',    '2 mg',      'tablet',  10, true,  60),
  ('DRG-SIT-50',    'Sitagliptin phosphate', 'Januvia 50',    'MSD',        'dpp4',            'oral_tablet',   false, 'tablet',    '50 mg',     'tablet',  10, true,  40),
  ('DRG-INS-GLA',   'Insulin glargine',      'Lantus',        'Sanofi',     'insulin',         'injection',     false, 'injection', '100 IU/mL', 'ml',       1, true,  20),
  ('DRG-INS-REG',   'Insulin regular',       'Actrapid',      'Novo',       'insulin',         'injection',     false, 'injection', '40 IU/mL',  'ml',       1, true,  20),
  ('DRG-OME-20',    'Omeprazole',            'Omez 20',       'Dr Reddy',   'ppi',             'oral_capsule',  false, 'capsule',   '20 mg',     'capsule', 10, true,  80),
  ('DRG-RAN-150',   'Ranitidine',            'Aciloc 150',    'Cadila',     'h2_blocker',      'oral_tablet',   false, 'tablet',    '150 mg',    'tablet',  10, false, 60),
  ('DRG-DOM-10',    'Domperidone',           'Domstal 10',    'Torrent',    'prokinetic',      'oral_tablet',   false, 'tablet',    '10 mg',     'tablet',  10, false, 60),
  ('DRG-OND-4',     'Ondansetron HCl',       'Emeset 4',      'Cipla',      'antiemetic',      'oral_tablet',   false, 'tablet',    '4 mg',      'tablet',  10, true,  50),
  ('DRG-BUD-200',   'Budesonide',            'Budecort 200',  'Cipla',      'ics',             'inhaler',       false, 'inhaler',   '200 mcg',   'dose',   200, true,  25),
  ('DRG-MON-10',    'Montelukast',           'Montair 10',    'Cipla',      'ltra',            'oral_tablet',   false, 'tablet',    '10 mg',     'tablet',  10, true,  50),
  ('DRG-LCT-5',     'Levocetirizine',        'Levocet 5',     'Glenmark',   'antihistamine',   'oral_tablet',   false, 'tablet',    '5 mg',      'tablet',  10, false, 80),
  ('DRG-VTD-60K',   'Cholecalciferol',       'Calcirol 60K',  'Cadila',     'supplement',      'oral_capsule',  false, 'capsule',   '60000 IU',  'capsule',  4, false, 60),
  ('DRG-VB12-1K',   'Methylcobalamin',       'Methycobal',    'Eisai',      'supplement',      'injection',     false, 'injection', '1000 mcg',  'ml',       1, false, 25),
  ('DRG-FE-FA',     'Ferrous fumarate + FA', 'Livogen',       'Merck',      'supplement',      'oral_tablet',   false, 'tablet',    '60 mg',     'tablet',  10, false, 120),
  ('DRG-CAL-D3',    'Calcium + D3',          'Shelcal-XT',    'Torrent',    'supplement',      'oral_tablet',   false, 'tablet',    '500 mg',    'tablet',  15, false, 60),
  ('DRG-DCL-GEL',   'Diclofenac gel',        'Volini 1.16%',  'Sun',        'nsaid',           'topical_cream', false, 'cream',     '1.16%',     'g',       30, false, 40),
  ('DRG-MUP-2',     'Mupirocin',             'T-Bact 2%',     'GSK',        'topical_abx',     'topical_cream', false, 'cream',     '2%',        'g',       10, true,  25),
  ('DRG-CLT-1',     'Clotrimazole',          'Candid 1%',     'Glenmark',   'antifungal',      'topical_cream', false, 'cream',     '1%',        'g',       15, false, 30),
  ('DRG-TOB-EYE',   'Tobramycin eye drops',  'Tobacin 0.3%',  'Cipla',      'topical_abx',     'eye_drops',     false, 'drops',     '0.3%',      'ml',       5, true,  20),
  ('DRG-XYL-NSL',   'Xylometazoline HCl',    'Otrivin 0.1%',  'GSK',        'decongestant',    'nasal_drops',   false, 'drops',     '0.1%',      'ml',      10, false, 20),
  ('DRG-CIP-EAR',   'Ciprofloxacin ear',     'Cipla ear 0.3', 'Cipla',      'topical_abx',     'ear_drops',     false, 'drops',     '0.3%',      'ml',       5, true,  15),
  ('DRG-PCM-SYR',   'Paracetamol syrup',     'Calpol 125',    'GSK',        'analgesic',       'oral_syrup',    false, 'syrup',     '125/5mL',   'ml',      60, false, 40),
  ('DRG-IBU-SYR',   'Ibuprofen syrup',       'Brufen 100',    'Abbott',     'nsaid',           'oral_syrup',    false, 'syrup',     '100/5mL',   'ml',      60, true,  30),
  ('DRG-ORS-SCH',   'Oral Rehydration Salt', 'Electral',      'FDC',        'rehydration',     'powder',        false, 'powder',    '21.8 g',    'sachet',   1, false, 120),
  ('DRG-CEF-SYR',   'Cefixime syrup',        'Taxim-O 100',   'Alkem',      'cephalosporin',   'oral_syrup',    false, 'syrup',     '100/5mL',   'ml',      30, true,  25),
  ('DRG-PEN-30',    'Pentazocine',           'Fortwin 30',    'Cadila',     'opioid',          'injection',     true,  'injection', '30 mg',     'ml',       1, true,  15),
  ('DRG-COT-480',   'Sulfamethoxazole+TMP',  'Septran DS',    'Glaxo',      'sulfa',           'oral_tablet',   false, 'tablet',    '480 mg',    'tablet',  10, true,  60),
  ('DRG-IOP-370',   'Iopamidol contrast',    'Niopam 370',    'Bracco',     'contrast',        'injection',     false, 'injection', '370/mL',    'ml',       1, true,  20),
  ('DRG-HTC-12',    'Hydrochlorothiazide',   'Hydrazide 12.5','USV',        'diuretic',        'oral_tablet',   false, 'tablet',    '12.5 mg',   'tablet',  10, true,  40),
  ('DRG-LRZ-1',     'Lorazepam',             'Ativan 1',      'Pfizer',     'benzodiazepine',  'oral_tablet',   false, 'tablet',    '1 mg',      'tablet',  10, true,  25)
) as v(code, generic, brand, mfr, cls, cat, narc, form, strength, unitv, pack, rxr, lo)
where not exists (select 1 from drug_catalogue d where d.drug_code = v.code and d.deleted_at is null);

-- ---------------------------------------------------------------------
-- 3. Drug stock (20 batches from mockMedicineBatches, mapped to DB drugs)
-- ---------------------------------------------------------------------
do $$
declare
  bs uuid := '00000000-0000-0000-0000-000000000001';
  rec record;
  v_drug uuid; v_vendor uuid;
begin
  for rec in select * from (values
    ('PAR-A2401', 'DRG-PARA-500', 'VEN-001', '2024-06-01'::date, '2027-04-30'::date, 320, 0.9::numeric, 1.5::numeric, '2025-09-12'::date),
    ('PAR-B2503', 'DRG-PARA-500', 'VEN-002', '2025-04-01'::date, '2028-03-31'::date, 100, 0.95,         1.5,         '2025-12-21'::date),
    ('IBU-2412',  'DRG-IBU-400',  'VEN-001', '2024-12-01'::date, '2026-09-30'::date,  38, 1.4,          2.0,         '2025-02-04'::date),
    ('DIC-2503',  'DRG-DIC-50',   'VEN-003', '2025-03-01'::date, '2026-12-30'::date, 110, 1.8,          3.0,         '2025-08-14'::date),
    ('PAN-A2502', 'DRG-PAN-40',   'VEN-002', '2025-02-01'::date, (current_date + 45),  22, 2.5,         4.0,         '2025-06-09'::date),
    ('CAL-2401',  'DRG-CAL-D3',   'VEN-001', '2024-01-01'::date, (current_date + 35),  40, 3.0,         5.0,         '2024-08-04'::date),
    ('MET-2603',  'DRG-METF-500', 'VEN-008', '2026-01-01'::date, '2028-02-28'::date, 540, 1.5,          2.5,         '2026-04-10'::date),
    ('AML-2510',  'DRG-AMLO-5',   'VEN-007', '2025-10-01'::date, '2027-09-30'::date,   0, 1.7,          3.0,         '2025-12-20'::date),
    ('AMX-2502',  'DRG-AMOX-500', 'VEN-006', '2025-02-01'::date, '2026-09-30'::date,   0, 4.5,          7.5,         '2025-08-05'::date),
    ('AZI-2510',  'DRG-AZIT-500', 'VEN-004', '2025-10-01'::date, '2027-06-30'::date, 200, 6.0,          9.5,         '2026-02-12'::date),
    ('ATO-2509',  'DRG-ATOR-10',  'VEN-005', '2025-09-01'::date, '2027-08-31'::date, 320, 1.2,          2.0,         '2025-12-09'::date),
    ('TRA-2511',  'DRG-TRA-50',   'VEN-009', '2025-11-01'::date, '2026-11-30'::date,  12, 4.0,          6.5,         '2025-12-20'::date),
    ('VTD-2601',  'DRG-VTD-60K',  'VEN-010', '2026-01-01'::date, '2028-01-31'::date, 180, 8.0,         13.0,         '2026-03-14'::date),
    ('SAL-2509',  'DRG-SALB-INH', 'VEN-003', '2025-09-01'::date, '2027-03-31'::date,  44, 75.0,       120.0,         '2025-11-22'::date),
    ('CET-2602',  'DRG-CETI-10',  'VEN-004', '2026-02-01'::date, '2027-09-30'::date, 380, 0.8,          1.2,         '2026-04-08'::date),
    ('COT-2305',  'DRG-COT-480',  'VEN-006', '2023-05-01'::date, '2025-12-20'::date,  18, 1.5,          2.5,         '2023-12-14'::date),
    ('GLA-2510',  'DRG-INS-GLA',  'VEN-015', '2025-10-01'::date, '2026-11-30'::date,  16, 380.0,      520.0,         '2025-12-16'::date),
    ('IBS-2509',  'DRG-IBU-SYR',  'VEN-007', '2025-09-01'::date, '2026-10-31'::date,   4, 38.0,        60.0,         '2025-12-18'::date),
    ('ORS-2604',  'DRG-ORS-SCH',  'VEN-011', '2026-04-01'::date, '2028-04-30'::date, 420, 6.0,          9.0,         '2026-04-22'::date),
    ('IOP-2410',  'DRG-IOP-370',  'VEN-013', '2024-10-01'::date, '2025-11-30'::date,  18, 380.0,      520.0,         '2024-12-30'::date)
  ) as t(batch, drug_code, vendor_code, mfg, expiry, qty, cost, sale, rcvd)
  loop
    select id into v_drug from drug_catalogue where drug_code = rec.drug_code and deleted_at is null;
    select id into v_vendor from vendors where vendor_code = rec.vendor_code and deleted_at is null;
    if v_drug is null or v_vendor is null then continue; end if;
    insert into drug_stock (
      drug_id, batch_number, mfg_date, expiry_date, purchase_price, mrp, selling_price,
      quantity_received, quantity_available, vendor_id, received_date,
      is_blocked, created_by
    )
    select v_drug, rec.batch, rec.mfg, rec.expiry, rec.cost, rec.sale, rec.sale,
           rec.qty + 50, rec.qty, v_vendor, rec.rcvd,
           false, bs
    where not exists (
      select 1 from drug_stock s where s.drug_id = v_drug and s.batch_number = rec.batch
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------
select 'vendors' as t, count(*)::text as n from vendors where deleted_at is null
union all select 'drug_catalogue', count(*)::text from drug_catalogue where deleted_at is null
union all select 'drug_stock', count(*)::text from drug_stock
union all select 'in_stock_drugs', count(distinct drug_id)::text from drug_stock where quantity_available > 0
order by t;
