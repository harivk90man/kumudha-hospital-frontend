-- ============================================================
-- V74__seed_patients.sql
-- 97 patients from the frontend mock catalogue seeded into DB.
-- Families share mobile numbers. Approximate DOB = Jan 1 of
-- (2026 - ageYears). Allergies + conditions linked to V73 lookups.
-- uhid_sequences seeded so new registrations continue from max.
-- ============================================================

-- Add Osteoporosis — used by mock but missing from V73
INSERT INTO chronic_conditions_lookup (condition_code, condition_name, icd_code, category, created_by)
VALUES ('OSTEOPOROSIS', 'Osteoporosis', 'M81', 'musculoskeletal', '00000000-0000-0000-0000-000000000000')
ON CONFLICT DO NOTHING;

-- Capture inserted patient IDs for child-row seeding
CREATE TEMP TABLE _seed_pat (id uuid, uhid text) ON COMMIT DROP;

WITH ins AS (
    INSERT INTO patients (uhid, first_name, last_name, date_of_birth, gender, blood_group, mobile, address, created_via, created_by)
    VALUES
    -- ── Family 1 — Raghavan (Anna Nagar) ─────────────────────────────────
    ('KH-2026-00045','Karthik',    'Raghavan', make_date(1984,1,1),'m','B+','+91 98430 12121','{"line1":"12 Anna Nagar 3rd Cross street","city":"Chennai","pincode":"600040","state":"Tamil Nadu","landmark":"Near Anna Nagar Tower Park"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2024-08812','Geetha',     'Raghavan', make_date(1987,1,1),'f','A+','+91 98430 12121','{"line1":"12 Anna Nagar 3rd Cross","city":"Chennai","pincode":"600040","state":"Tamil Nadu","landmark":"Opp. Anna Nagar Post Office"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2025-11203','Aarav',      'Raghavan', make_date(2015,1,1),'m', NULL,'+91 98430 12121','{"line1":"12 Anna Nagar 3rd Cross","city":"Chennai","pincode":"600040","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2018-00094','Subramanian','Raghavan', make_date(1955,1,1),'m','B+','+91 96754 23867','{"line1":"7 Velachery Main Road","city":"Chennai","pincode":"600042","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    -- ── Family 2 — Pillai (Mylapore) ──────────────────────────────────────
    ('KH-2026-00046','Meera',  'Pillai', make_date(1968,1,1),'f','O+','+91 99100 12434','{"line1":"45 Luz Church Road","city":"Chennai","pincode":"600004","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2023-04501','Rajan',  'Pillai', make_date(1964,1,1),'m','O+','+91 99100 12434','{"line1":"45 Luz Church Road","city":"Chennai","pincode":"600004","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2025-09812','Anjali', 'Pillai', make_date(2000,1,1),'f','A-','+91 99100 12434','{"line1":"45 Luz Church Road","city":"Chennai","pincode":"600004","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    -- ── Family 3 — Babu (Adyar) ───────────────────────────────────────────
    ('KH-2026-00047','Ramesh', 'Babu', make_date(1959,1,1),'m','A+','+91 90080 56788','{"line1":"22 Indira Nagar 2nd Avenue","city":"Chennai","pincode":"600020","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2024-06210','Sundari','Babu', make_date(1962,1,1),'f','A+','+91 90080 56788','{"line1":"22 Indira Nagar 2nd Avenue","city":"Chennai","pincode":"600020","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    -- ── Family 4 — Sharma (Velachery) ─────────────────────────────────────
    ('KH-2026-00048','Aarav', 'Sharma', make_date(2017,1,1),'m','AB+','+91 88997 65302','{"line1":"14 Phoenix Apartments, Velachery","city":"Chennai","pincode":"600042","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2024-03301','Vivek', 'Sharma', make_date(1985,1,1),'m','B+', '+91 88997 65302','{"line1":"14 Phoenix Apartments, Velachery","city":"Chennai","pincode":"600042","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2024-03302','Priya', 'Sharma', make_date(1988,1,1),'f','O+', '+91 88997 65302','{"line1":"14 Phoenix Apartments, Velachery","city":"Chennai","pincode":"600042","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2025-07744','Ishaan','Sharma', make_date(2020,1,1),'m', NULL,'+91 88997 65302','{"line1":"14 Phoenix Apartments, Velachery","city":"Chennai","pincode":"600042","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    -- ── Family 5 — Narasimhan (T. Nagar) ──────────────────────────────────
    ('KH-2026-00049','Lakshmi',    'Narasimhan', make_date(1955,1,1),'f','B-','+91 87654 32114','{"line1":"9 Pondy Bazaar, T. Nagar","city":"Chennai","pincode":"600017","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2020-00721','Narasimhan', 'Iyer',       make_date(1950,1,1),'m','B-','+91 87654 32114','{"line1":"9 Pondy Bazaar, T. Nagar","city":"Chennai","pincode":"600017","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    -- ── Family 6 — Reddy (Tambaram) ───────────────────────────────────────
    ('KH-2026-00050','Suresh','Reddy', make_date(1977,1,1),'m','A+','+91 95000 23456','{"line1":"33 GST Road, Tambaram","city":"Chennai","pincode":"600045","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2024-09033','Padma', 'Reddy', make_date(1979,1,1),'f','A+','+91 95000 23456','{"line1":"33 GST Road, Tambaram","city":"Chennai","pincode":"600045","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2025-12012','Rahul', 'Reddy', make_date(2007,1,1),'m','O+','+91 95000 23456','{"line1":"33 GST Road, Tambaram","city":"Chennai","pincode":"600045","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    -- ── Family 7 — Mathew (Besant Nagar) ──────────────────────────────────
    ('KH-2026-00042','Joseph','Mathew', make_date(1993,1,1),'m','O+','+91 99334 56777','{"line1":"5 Kalakshetra Road, Besant Nagar","city":"Chennai","pincode":"600090","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2026-00043','Mary',  'Mathew', make_date(1995,1,1),'f','O+','+91 99334 56777','{"line1":"5 Kalakshetra Road, Besant Nagar","city":"Chennai","pincode":"600090","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    -- ── Family 8 — Khan (Saidapet) ────────────────────────────────────────
    ('KH-2025-08801','Imran',  'Khan', make_date(1991,1,1),'m','B+','+91 89393 11220','{"line1":"18 Mount Road, Saidapet","city":"Chennai","pincode":"600015","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2025-08802','Sameera','Khan', make_date(1996,1,1),'f','B+','+91 89393 11220','{"line1":"18 Mount Road, Saidapet","city":"Chennai","pincode":"600015","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    -- ── Singletons ────────────────────────────────────────────────────────
    ('KH-2026-00051','Sunita',    'Verma',       make_date(1992,1,1),'f','O+','+91 90909 80155','{"line1":"21 Velachery 1st Cross","city":"Chennai","pincode":"600042","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2026-00052','Vikram',    'Bhatt',        make_date(1975,1,1),'m','A+','+91 88112 34512','{"line1":"77 OMR, Sholinganallur","city":"Chennai","pincode":"600119","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2026-00053','Aisha',     'Sheikh',       make_date(1998,1,1),'f','O-','+91 77665 54381','{"line1":"30 Royapettah High Road","city":"Chennai","pincode":"600014","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2026-00054','Ravi',      'Nair',         make_date(1981,1,1),'m','AB+','+91 91234 50012','{"line1":"66 Anna Nagar West","city":"Chennai","pincode":"600040","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2026-00055','Divya',     'Menon',        make_date(1994,1,1),'f','A+','+91 91234 50013','{"line1":"11 Adyar Bridge Road","city":"Chennai","pincode":"600020","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2026-00056','Arun',      'Krishnan',     make_date(1998,1,1),'m','B+','+91 91234 50014','{"line1":"5 Porur Junction","city":"Chennai","pincode":"600116","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2026-00057','Kavita',    'Iyer',         make_date(1972,1,1),'f','O+','+91 91234 50015','{"line1":"19 Mylapore Tank Bund","city":"Chennai","pincode":"600004","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2026-00058','Sanjay',    'Murthy',       make_date(1966,1,1),'m','A-','+91 91234 50016','{"line1":"41 T. Nagar","city":"Chennai","pincode":"600017","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2026-00059','Pooja',     'Rao',          make_date(1997,1,1),'f','O+','+91 91234 50017','{"line1":"8 Velachery Bypass","city":"Chennai","pincode":"600042","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2026-00060','Karthik',   'Subramaniam',  make_date(1988,1,1),'m','B+','+91 91234 50018','{"line1":"14 OMR, Karapakkam","city":"Chennai","pincode":"600097","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2026-00061','Latha',     'Devi',         make_date(1959,1,1),'f','A+','+91 91234 50019','{"line1":"27 Anna Nagar East","city":"Chennai","pincode":"600102","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2026-00062','Mohan',     'Das',          make_date(1971,1,1),'m','O-','+91 91234 50020','{"line1":"72 Tambaram East","city":"Chennai","pincode":"600059","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2026-00063','Selvi',     'Ganesan',      make_date(1980,1,1),'f','A+','+91 91234 50021','{"line1":"16 Adyar Signal","city":"Chennai","pincode":"600020","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2026-00064','Manjunath', 'Hegde',        make_date(1955,1,1),'m','B+','+91 91234 50022','{"line1":"5 Mylapore Mada Street","city":"Chennai","pincode":"600004","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2026-00065','Anita',     'Joshi',        make_date(1991,1,1),'f','O+','+91 91234 50023','{"line1":"29 OMR, Thoraipakkam","city":"Chennai","pincode":"600097","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2026-00066','Rohit',     'Bhardwaj',     make_date(1999,1,1),'m','A+','+91 91234 50024','{"line1":"44 Saidapet West","city":"Chennai","pincode":"600015","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2026-00067','Deepa',     'Pillai',       make_date(1985,1,1),'f','B+','+91 91234 50025','{"line1":"3 Besant Nagar Beach Road","city":"Chennai","pincode":"600090","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2026-00068','Krishnan',  'Iyer',         make_date(1948,1,1),'m','A+','+91 91234 50026','{"line1":"60 Triplicane","city":"Chennai","pincode":"600005","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2026-00069','Sangeetha', 'Shankar',      make_date(1993,1,1),'f','O+','+91 91234 50027','{"line1":"22 Porur Lake View","city":"Chennai","pincode":"600116","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2026-00070','Vinod',     'Kumar',        make_date(1974,1,1),'m','B-','+91 91234 50028','{"line1":"48 OMR, Navalur","city":"Chennai","pincode":"600130","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2026-00071','Madhavi',   'Lakshmi',      make_date(1966,1,1),'f','A+','+91 91234 50029','{"line1":"15 T. Nagar Bazaar","city":"Chennai","pincode":"600017","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2026-00072','Saravanan', 'Bose',         make_date(1982,1,1),'m','O+','+91 91234 50030','{"line1":"11 Anna Nagar Tower","city":"Chennai","pincode":"600040","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2026-00073','Nirmala',   'Devi',         make_date(1970,1,1),'f','A-','+91 91234 50031','{"line1":"38 Velachery Inner Ring","city":"Chennai","pincode":"600042","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2025-09001','Bharat',    'Mehta',        make_date(1987,1,1),'m','B+','+91 91234 50032','{"line1":"5 Mylapore Tank Square","city":"Chennai","pincode":"600004","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2025-09002','Chandrika', 'Iyer',         make_date(1978,1,1),'f','A+','+91 91234 50033','{"line1":"20 Adyar Signal","city":"Chennai","pincode":"600020","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2025-09003','Dileep',    'Varma',        make_date(1995,1,1),'m','O+','+91 91234 50034','{"line1":"44 OMR Sholinganallur","city":"Chennai","pincode":"600119","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2025-09004','Elango',    'Kumaresan',    make_date(1961,1,1),'m','B+','+91 91234 50035','{"line1":"19 Tambaram Sanatorium","city":"Chennai","pincode":"600047","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2025-09005','Fatima',    'Begum',        make_date(1990,1,1),'f','A+','+91 91234 50036','{"line1":"11 Royapettah","city":"Chennai","pincode":"600014","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2025-09006','Govindaraj','S',            make_date(1956,1,1),'m','O+','+91 91234 50037','{"line1":"25 Porur Junction","city":"Chennai","pincode":"600116","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2025-09007','Hema',      'Lalitha',      make_date(1981,1,1),'f','A+','+91 91234 50038','{"line1":"16 Velachery 2nd Cross","city":"Chennai","pincode":"600042","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2025-09008','Indrajit',  'Banerjee',     make_date(1976,1,1),'m','B+','+91 91234 50039','{"line1":"7 Anna Nagar West Roundtana","city":"Chennai","pincode":"600040","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2025-09009','Janaki',    'Sundaram',     make_date(1969,1,1),'f','O-','+91 91234 50040','{"line1":"29 T. Nagar","city":"Chennai","pincode":"600017","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2025-09010','Kishore',   'Mohan',        make_date(2003,1,1),'m','A+','+91 91234 50041','{"line1":"11 OMR Karapakkam","city":"Chennai","pincode":"600097","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2025-09011','Leelavathi','Ramesh',       make_date(1953,1,1),'f','B-','+91 91234 50042','{"line1":"40 Mylapore Luz Corner","city":"Chennai","pincode":"600004","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2025-09012','Mahesh',    'Pandian',      make_date(1986,1,1),'m','O+','+91 91234 50043','{"line1":"18 Adyar Anna University","city":"Chennai","pincode":"600025","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2025-09013','Nandini',   'Krishnan',     make_date(1998,1,1),'f','A+','+91 91234 50044','{"line1":"5 Saidapet East","city":"Chennai","pincode":"600015","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2025-09014','Omar',      'Pasha',        make_date(1978,1,1),'m','B+','+91 91234 50045','{"line1":"22 Triplicane","city":"Chennai","pincode":"600005","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2025-09015','Padmaja',   'Naidu',        make_date(1974,1,1),'f','A+','+91 91234 50046','{"line1":"33 OMR Navalur","city":"Chennai","pincode":"600130","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2025-09016','Quraishi',  'Ahmed',        make_date(1990,1,1),'m','O+','+91 91234 50047','{"line1":"14 Royapettah High Road","city":"Chennai","pincode":"600014","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2025-09017','Radhika',   'Murali',       make_date(1996,1,1),'f','B+','+91 91234 50048','{"line1":"66 Velachery Main Road","city":"Chennai","pincode":"600042","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2025-09018','Senthil',   'Velan',        make_date(1968,1,1),'m','A-','+91 91234 50049','{"line1":"19 Tambaram West","city":"Chennai","pincode":"600045","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2025-09019','Tara',      'Subramanian',  make_date(1962,1,1),'f','O+','+91 91234 50050','{"line1":"41 Anna Nagar 3rd Avenue","city":"Chennai","pincode":"600040","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2025-09020','Uday',      'Sankar',       make_date(2004,1,1),'m','B+','+91 91234 50051','{"line1":"5 OMR Karapakkam","city":"Chennai","pincode":"600097","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2025-09021','Vasanthi',  'Devi',         make_date(1977,1,1),'f','A+','+91 91234 50052','{"line1":"27 Mylapore Mandaveli","city":"Chennai","pincode":"600028","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2025-09022','Wilson',    'Christopher',  make_date(1983,1,1),'m','O+','+91 91234 50053','{"line1":"11 Besant Nagar 6th Cross","city":"Chennai","pincode":"600090","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2025-09023','Xavier',    'Nadar',        make_date(1970,1,1),'m','B-','+91 91234 50054','{"line1":"22 Porur Kundrathur Road","city":"Chennai","pincode":"600116","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2025-09024','Yamini',    'Kumari',       make_date(1988,1,1),'f','A+','+91 91234 50055','{"line1":"39 Saidapet West","city":"Chennai","pincode":"600015","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2025-09025','Zubair',    'Ali',          make_date(1964,1,1),'m','O+','+91 91234 50056','{"line1":"5 Triplicane Big Mosque","city":"Chennai","pincode":"600005","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2024-04401','Anand',     'Iyengar',      make_date(1938,1,1),'m','A+','+91 91234 50057','{"line1":"19 Mylapore Kapaleeshwar Lane","city":"Chennai","pincode":"600004","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2024-04402','Bhavana',   'Rao',          make_date(2001,1,1),'f','B+','+91 91234 50058','{"line1":"11 Adyar Gandhi Nagar","city":"Chennai","pincode":"600020","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2024-04403','Chandran',  'Mohan',        make_date(1979,1,1),'m','O-','+91 91234 50059','{"line1":"22 Anna Nagar 2nd Main","city":"Chennai","pincode":"600040","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2024-04404','Devika',    'Pillai',       make_date(1973,1,1),'f','A+','+91 91234 50060','{"line1":"38 T. Nagar Pondy Bazaar","city":"Chennai","pincode":"600017","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2024-04405','Eswaran',   'Naidu',        make_date(1958,1,1),'m','B+','+91 91234 50061','{"line1":"5 Tambaram Old Road","city":"Chennai","pincode":"600045","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2024-04406','Farzana',   'Begum',        make_date(1985,1,1),'f','O+','+91 91234 50062','{"line1":"17 Royapettah","city":"Chennai","pincode":"600014","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2024-04407','Gopal',     'Venkatesan',   make_date(1987,1,1),'m','A+','+91 91234 50063','{"line1":"29 Velachery Inner Ring","city":"Chennai","pincode":"600042","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2024-04408','Harini',    'Rajagopal',    make_date(1994,1,1),'f','B+','+91 91234 50064','{"line1":"11 OMR Sholinganallur","city":"Chennai","pincode":"600119","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2024-04409','Iyer',      'Lakshmanan',   make_date(1951,1,1),'m','A+','+91 91234 50065','{"line1":"45 Mylapore Mada Street","city":"Chennai","pincode":"600004","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2024-04410','Jayanthi',  'Suresh',       make_date(1976,1,1),'f','O+','+91 91234 50066','{"line1":"22 Adyar 2nd Avenue","city":"Chennai","pincode":"600020","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2024-04411','Kannan',    'Murugesan',    make_date(1992,1,1),'m','B+','+91 91234 50067','{"line1":"5 Anna Nagar 4th Avenue","city":"Chennai","pincode":"600040","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2024-04412','Latha',     'Sivakumar',    make_date(2000,1,1),'f','A+','+91 91234 50068','{"line1":"14 Velachery 5th Cross","city":"Chennai","pincode":"600042","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2024-04413','Murali',    'Krishnan',     make_date(1967,1,1),'m','O+','+91 91234 50069','{"line1":"33 Tambaram East","city":"Chennai","pincode":"600059","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2024-04414','Nithya',    'Balan',        make_date(1990,1,1),'f','B-','+91 91234 50070','{"line1":"11 Saidapet West","city":"Chennai","pincode":"600015","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2024-04415','Omkar',     'Pradhan',      make_date(1982,1,1),'m','A+','+91 91234 50071','{"line1":"19 Adyar Besant Avenue","city":"Chennai","pincode":"600020","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2024-04416','Pavithra',  'Kumar',        make_date(1997,1,1),'f','O+','+91 91234 50072','{"line1":"22 OMR Karapakkam","city":"Chennai","pincode":"600097","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2024-04417','Quazi',     'Imam',         make_date(1975,1,1),'m','B+','+91 91234 50073','{"line1":"5 Triplicane Big Mosque","city":"Chennai","pincode":"600005","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2024-04418','Ramya',     'Subramaniyan', make_date(1979,1,1),'f','A+','+91 91234 50074','{"line1":"14 Mylapore Mandaveli","city":"Chennai","pincode":"600028","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2024-04419','Sundar',    'Raj',          make_date(2007,1,1),'m','O+','+91 91234 50075','{"line1":"11 Anna Nagar West","city":"Chennai","pincode":"600040","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2024-04420','Tamilarasan','M',           make_date(1946,1,1),'m','A+','+91 91234 50076','{"line1":"22 Porur Lake View","city":"Chennai","pincode":"600116","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2024-04421','Uma',       'Maheshwari',   make_date(1984,1,1),'f','B+','+91 91234 50077','{"line1":"33 T. Nagar Pondy Bazaar","city":"Chennai","pincode":"600017","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2024-04422','Vijay',     'Anand',        make_date(2009,1,1),'m','O+','+91 91234 50078','{"line1":"5 Velachery 1st Cross","city":"Chennai","pincode":"600042","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2024-04423','Wahida',    'Sheikh',       make_date(2002,1,1),'f','A-','+91 91234 50079','{"line1":"14 Royapettah","city":"Chennai","pincode":"600014","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2024-04424','Yogesh',    'Sivan',        make_date(2021,1,1),'m', NULL,'+91 91234 50080','{"line1":"22 Adyar 4th Cross","city":"Chennai","pincode":"600020","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2024-04425','Zara',      'Khan',         make_date(2025,1,1),'f', NULL,'+91 91234 50081','{"line1":"11 Saidapet East","city":"Chennai","pincode":"600015","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2024-04426','Aadhya',    'Subash',       make_date(2023,1,1),'f', NULL,'+91 91234 50082','{"line1":"14 Anna Nagar 5th Avenue","city":"Chennai","pincode":"600040","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000'),
    ('KH-2024-04427','Vihaan',    'Ramesh',       make_date(2019,1,1),'m', NULL,'+91 91234 50083','{"line1":"5 Velachery 1st Cross","city":"Chennai","pincode":"600042","state":"Tamil Nadu"}'::jsonb,'web','00000000-0000-0000-0000-000000000000')
    RETURNING id, uhid
)
INSERT INTO _seed_pat SELECT id, uhid FROM ins;

-- ── Allergies ─────────────────────────────────────────────────────────────────
INSERT INTO patient_allergies (patient_id, allergy_id, severity, source, created_by)
SELECT p.id, a.id, 'mild', 'patient_reported', '00000000-0000-0000-0000-000000000000'
FROM _seed_pat p
JOIN allergies_lookup a ON a.deleted_at IS NULL
WHERE
    (p.uhid IN ('KH-2026-00045','KH-2026-00053','KH-2025-09005') AND a.allergy_code = 'PENICILLIN')
 OR (p.uhid IN ('KH-2023-04501','KH-2026-00062','KH-2025-09018','KH-2024-04413') AND a.allergy_code = 'NSAIDS')
 OR (p.uhid IN ('KH-2026-00047','KH-2026-00068','KH-2024-04406') AND a.allergy_code = 'SULFA')
 OR (p.uhid IN ('KH-2026-00057') AND a.allergy_code = 'IODINATED_CONTRAST')
 OR (p.uhid IN ('KH-2025-09013') AND a.allergy_code = 'LATEX');

-- ── Chronic conditions ────────────────────────────────────────────────────────
INSERT INTO patient_chronic_conditions (patient_id, condition_id, controlled_status, created_by)
SELECT p.id, c.id, 'unknown', '00000000-0000-0000-0000-000000000000'
FROM _seed_pat p
JOIN chronic_conditions_lookup c ON c.deleted_at IS NULL
WHERE
    (p.uhid IN ('KH-2026-00045','KH-2018-00094','KH-2023-04501','KH-2026-00047','KH-2026-00049','KH-2020-00721',
                'KH-2026-00050','KH-2026-00052','KH-2026-00058','KH-2026-00061','KH-2026-00062','KH-2026-00068',
                'KH-2026-00070','KH-2026-00071','KH-2026-00073','KH-2025-09002','KH-2025-09006','KH-2025-09008',
                'KH-2025-09011','KH-2025-09015','KH-2025-09018','KH-2025-09019','KH-2025-09021','KH-2025-09025',
                'KH-2024-04401','KH-2024-04403','KH-2024-04409','KH-2024-04410','KH-2024-04413','KH-2024-04417',
                'KH-2024-04418','KH-2024-04420') AND c.condition_code = 'HYPERTENSION')
 OR (p.uhid IN ('KH-2018-00094','KH-2026-00046','KH-2024-06210','KH-2020-00721','KH-2026-00054','KH-2026-00057',
                'KH-2026-00061','KH-2026-00064','KH-2026-00068','KH-2026-00071','KH-2025-09004','KH-2025-09006',
                'KH-2025-09014','KH-2025-09018','KH-2025-09023','KH-2025-09025','KH-2024-04401','KH-2024-04405',
                'KH-2024-04409','KH-2024-04413','KH-2024-04420') AND c.condition_code = 'TYPE_2_DIABETES')
 OR (p.uhid IN ('KH-2018-00094','KH-2026-00047','KH-2020-00721','KH-2026-00064','KH-2026-00068','KH-2026-00070',
                'KH-2025-09004','KH-2025-09011','KH-2025-09025','KH-2024-04401','KH-2024-04405','KH-2024-04409',
                'KH-2024-04420') AND c.condition_code = 'CORONARY_ARTERY_DISEASE')
 OR (p.uhid IN ('KH-2024-08812','KH-2024-09033','KH-2026-00057','KH-2026-00067','KH-2026-00073','KH-2025-09009',
                'KH-2025-09011','KH-2025-09015','KH-2024-04404','KH-2024-04418') AND c.condition_code = 'HYPOTHYROIDISM')
 OR (p.uhid IN ('KH-2026-00046','KH-2026-00061','KH-2025-09006','KH-2025-09009','KH-2025-09019',
                'KH-2024-04409') AND c.condition_code = 'OSTEOARTHRITIS')
 OR (p.uhid IN ('KH-2023-04501','KH-2026-00064','KH-2024-04401','KH-2024-04420') AND c.condition_code = 'CKD')
 OR (p.uhid IN ('KH-2024-03302','KH-2026-00070') AND c.condition_code = 'ASTHMA')
 OR (p.uhid IN ('KH-2026-00058') AND c.condition_code = 'COPD')
 OR (p.uhid IN ('KH-2026-00052') AND c.condition_code = 'HYPERLIPIDEMIA')
 OR (p.uhid IN ('KH-2026-00049') AND c.condition_code = 'OSTEOPOROSIS');

-- ── UHID sequences — ensure future registrations continue after max ────────────
INSERT INTO uhid_sequences (year, last_seq) VALUES
    (2018,    94),
    (2020,   721),
    (2023,  4501),
    (2024,  9033),
    (2025, 12012),
    (2026,    73)
ON CONFLICT (year) DO UPDATE
    SET last_seq = GREATEST(uhid_sequences.last_seq, EXCLUDED.last_seq);
