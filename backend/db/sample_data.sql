-- =====================================================================
-- sample_data.sql
--
-- WARNING: DEV / DEMO DATA ONLY — NOT FOR PRODUCTION.
--
-- Designed to run ONCE on an empty DB (or after truncate_all.sql).
-- Re-running on a populated DB WILL fail on UNIQUE constraints
-- (op_number, uhid, medicine_code, lab test_code, etc.). To reset:
--    psql -f truncate_all.sql && psql -f sample_data.sql
--
-- Volumes (mid-sized clinic, 6-month operating history):
--   6 doctors,  50 patients,  ~25 family-history rows
--   ~40 medicines, ~50 batches, ~100 stock movements
--   ~30 lab tests, ~14 radiology procedures, ~10 diagnosis templates
--   ~120 visits, ~10 in today's live queue
--   ~120 vitals, ~120 consultations, ~250 prescription items
--   ~60 lab orders / 150 items / 150 samples / 120 results
--   ~30 radiology orders / studies / reports
--   ~30 doctor recommendations, ~5 NDPS register entries
--   ~8 notifications (1 active critical), ~700 journey events
--
-- Style: each section wrapped in a CTE chain that pulls tenant + actors
-- once at the top; deterministic UUIDs only for FE-mock-pinned entities;
-- everything else gen_random_uuid().
-- =====================================================================

set search_path = public;

-- =====================================================================
-- SECTION 1 — Doctors (5 new + reuse Dr. Priya Iyer from 900_seed_data)
-- =====================================================================
-- Deterministic UUIDs so subsequent CTE blocks can reference them by id.
insert into users
  (id, tenant_id, employee_id, full_name, mobile, email, username, password_hash,
   department_id, designation, status, created_by)
values
  ('44444444-0000-0000-0000-000000000010',
   '11111111-1111-1111-1111-111111111111',
   'EMP010', 'Dr. Anand Krishnan', '9876500010', 'anand.krishnan@kumudhahospital.in',
   'anand.krishnan', '$2b$12$REPLACE_ME_BEFORE_USE',
   '22222222-0000-0000-0000-000000000003', -- General Medicine
   'Consultant Physician', 'active',
   '44444444-0000-0000-0000-000000000001'),
  ('44444444-0000-0000-0000-000000000011',
   '11111111-1111-1111-1111-111111111111',
   'EMP011', 'Dr. Saritha Nair', '9876500011', 'saritha.nair@kumudhahospital.in',
   'saritha.nair', '$2b$12$REPLACE_ME_BEFORE_USE',
   '22222222-0000-0000-0000-000000000003', -- (no Paediatrics dept seeded; sit under GenMed)
   'Consultant Paediatrician', 'active',
   '44444444-0000-0000-0000-000000000001'),
  ('44444444-0000-0000-0000-000000000012',
   '11111111-1111-1111-1111-111111111111',
   'EMP012', 'Dr. Vinod Kumar', '9876500012', 'vinod.kumar@kumudhahospital.in',
   'vinod.kumar', '$2b$12$REPLACE_ME_BEFORE_USE',
   '22222222-0000-0000-0000-000000000003',
   'Consultant Cardiologist', 'active',
   '44444444-0000-0000-0000-000000000001'),
  ('44444444-0000-0000-0000-000000000013',
   '11111111-1111-1111-1111-111111111111',
   'EMP013', 'Dr. Lakshmi Subramanian', '9876500013', 'lakshmi.subramanian@kumudhahospital.in',
   'lakshmi.subramanian', '$2b$12$REPLACE_ME_BEFORE_USE',
   '22222222-0000-0000-0000-000000000003',
   'Consultant Ophthalmologist', 'active',
   '44444444-0000-0000-0000-000000000001'),
  ('44444444-0000-0000-0000-000000000014',
   '11111111-1111-1111-1111-111111111111',
   'EMP014', 'Dr. Ravi Gopalan', '9876500014', 'ravi.gopalan@kumudhahospital.in',
   'ravi.gopalan', '$2b$12$REPLACE_ME_BEFORE_USE',
   '22222222-0000-0000-0000-000000000003',
   'Consultant General Surgeon', 'active',
   '44444444-0000-0000-0000-000000000001');

insert into doctor_profiles
  (user_id, specialization, qualification, registration_number,
   consultation_fee, follow_up_fee, follow_up_window_days,
   slot_duration_mins, available_days)
values
  ('44444444-0000-0000-0000-000000000010', 'General Medicine', 'MBBS, MD (Gen. Med)', 'TNMC-45128',
   400.00, 250.00, 7, 15,
   '{"mon":[{"from":"09:00","to":"13:00"}],"tue":[{"from":"09:00","to":"13:00"},{"from":"17:00","to":"20:00"}],"wed":[{"from":"09:00","to":"13:00"}],"thu":[{"from":"17:00","to":"20:00"}],"fri":[{"from":"09:00","to":"13:00"}],"sat":[{"from":"09:00","to":"12:00"}]}'::jsonb),
  ('44444444-0000-0000-0000-000000000011', 'Paediatrics', 'MBBS, DCH, MD (Paed)', 'TNMC-52310',
   450.00, 300.00, 14, 15,
   '{"mon":[{"from":"10:00","to":"13:00"}],"tue":[{"from":"10:00","to":"13:00"}],"wed":[{"from":"10:00","to":"13:00"},{"from":"17:00","to":"20:00"}],"thu":[{"from":"10:00","to":"13:00"}],"fri":[{"from":"10:00","to":"13:00"}],"sat":[{"from":"10:00","to":"12:00"}]}'::jsonb),
  ('44444444-0000-0000-0000-000000000012', 'Cardiology', 'MBBS, MD, DM (Cardio)', 'TNMC-31055',
   800.00, 500.00, 30, 20,
   '{"mon":[{"from":"09:00","to":"12:00"}],"wed":[{"from":"09:00","to":"12:00"}],"fri":[{"from":"09:00","to":"12:00"}]}'::jsonb),
  ('44444444-0000-0000-0000-000000000013', 'Ophthalmology', 'MBBS, MS (Ophth)', 'TNMC-48772',
   500.00, 300.00, 14, 15,
   '{"tue":[{"from":"09:00","to":"13:00"}],"thu":[{"from":"09:00","to":"13:00"}],"sat":[{"from":"09:00","to":"13:00"}]}'::jsonb),
  ('44444444-0000-0000-0000-000000000014', 'General Surgery', 'MBBS, MS (Gen. Surg)', 'TNMC-39120',
   600.00, 400.00, 14, 20,
   '{"mon":[{"from":"14:00","to":"18:00"}],"wed":[{"from":"14:00","to":"18:00"}],"fri":[{"from":"14:00","to":"18:00"}]}'::jsonb);

insert into user_roles (user_id, role_id, is_default, assigned_at) values
  ('44444444-0000-0000-0000-000000000010', '33333333-0000-0000-0000-000000000003', true, now()),
  ('44444444-0000-0000-0000-000000000011', '33333333-0000-0000-0000-000000000003', true, now()),
  ('44444444-0000-0000-0000-000000000012', '33333333-0000-0000-0000-000000000003', true, now()),
  ('44444444-0000-0000-0000-000000000013', '33333333-0000-0000-0000-000000000003', true, now()),
  ('44444444-0000-0000-0000-000000000014', '33333333-0000-0000-0000-000000000003', true, now());

-- Convenience: a per-doctor station so the journey events / queues can
-- attribute work cleanly. Skip dr.priya - already has station code 4.
insert into stations (code, tenant_id, slug, display_name, phase, station_type, owning_dept, physical_location, avg_service_time_minutes, is_active) values
  (11, '11111111-1111-1111-1111-111111111111', 'doctor:anand',     'Dr. Anand Krishnan',       2, 'doctor', 'doctor', '1st floor, Room 102', 15, true),
  (12, '11111111-1111-1111-1111-111111111111', 'doctor:saritha',   'Dr. Saritha Nair',         2, 'doctor', 'doctor', '1st floor, Room 103', 15, true),
  (13, '11111111-1111-1111-1111-111111111111', 'doctor:vinod',     'Dr. Vinod Kumar',          2, 'doctor', 'doctor', '2nd floor, Room 201', 20, true),
  (14, '11111111-1111-1111-1111-111111111111', 'doctor:lakshmi_s', 'Dr. Lakshmi Subramanian',  2, 'doctor', 'doctor', '2nd floor, Room 202', 15, true),
  (15, '11111111-1111-1111-1111-111111111111', 'doctor:ravi',      'Dr. Ravi Gopalan',         2, 'doctor', 'doctor', '2nd floor, Room 203', 20, true);

-- =====================================================================
-- SECTION 2 — Patients (50 total: 11 FE-pinned + 39 generated)
-- =====================================================================
-- FE-pinned patients keep deterministic UUIDs so visits / consultations /
-- lab orders below can reference them by id without a lookup CTE.
insert into patients
  (id, tenant_id, uhid, registration_status, first_name, last_name,
   gender, dob, age, mobile, alt_mobile, address, blood_group,
   marital_status, allergies, chronic_conditions, emergency_contact,
   created_by)
values
  -- 1. Karthik Raghavan (FE active visit OP-2026-00121)
  ('aaaaaaaa-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111',
   'KH-2026-00045', 'complete',
   'Karthik', 'Raghavan', 'M', '1983-04-12', 42,
   '+91 9876543221', '+91 9876543210',
   '{"line1":"12 Anna Salai","city":"Villupuram","state":"Tamil Nadu","pincode":"605602"}'::jsonb,
   'B+', 'married', '{Penicillin}', '{Hypertension}',
   '{"name":"Geetha Raghavan","relation":"spouse","mobile":"+91 9876543210"}'::jsonb,
   '44444444-0000-0000-0000-000000000001'),
  -- 2. Meera Pillai
  ('aaaaaaaa-0000-0000-0000-000000000002',
   '11111111-1111-1111-1111-111111111111',
   'KH-2026-00046', 'complete',
   'Meera', 'Pillai', 'F', '1967-08-30', 58,
   '+91 9876543234', null,
   '{"line1":"45 Gandhi Road","city":"Villupuram","state":"Tamil Nadu","pincode":"605602"}'::jsonb,
   'O+', 'married', '{}', '{"Type 2 Diabetes Mellitus","Osteoarthritis"}',
   '{"name":"Suresh Pillai","relation":"spouse","mobile":"+91 9876543235"}'::jsonb,
   '44444444-0000-0000-0000-000000000001'),
  -- 3. Ramesh Babu
  ('aaaaaaaa-0000-0000-0000-000000000003',
   '11111111-1111-1111-1111-111111111111',
   'KH-2026-00047', 'complete',
   'Ramesh', 'Babu', 'M', '1958-02-18', 67,
   '+91 9876543288', null,
   '{"line1":"7 Bharathi Street","city":"Tindivanam","state":"Tamil Nadu","pincode":"604001"}'::jsonb,
   'A+', 'married', '{"Sulpha drugs"}', '{"Coronary Artery Disease",Hypertension}',
   '{"name":"Bhavani Babu","relation":"spouse","mobile":"+91 9876543289"}'::jsonb,
   '44444444-0000-0000-0000-000000000001'),
  -- 4. Aarav Sharma (paediatric, fall from cycle)
  ('aaaaaaaa-0000-0000-0000-000000000004',
   '11111111-1111-1111-1111-111111111111',
   'KH-2026-00048', 'complete',
   'Aarav', 'Sharma', 'M', '2016-09-04', 9,
   '+91 9876543202', null,
   '{"line1":"22 Nehru Nagar","city":"Villupuram","state":"Tamil Nadu","pincode":"605602"}'::jsonb,
   'AB+', 'single', '{}', '{}',
   '{"name":"Priyanka Sharma","relation":"mother","mobile":"+91 9876543203"}'::jsonb,
   '44444444-0000-0000-0000-000000000001'),
  -- 5. Lakshmi Narasimhan (current-year reg)
  ('aaaaaaaa-0000-0000-0000-000000000005',
   '11111111-1111-1111-1111-111111111111',
   'KH-2026-00049', 'complete',
   'Lakshmi', 'Narasimhan', 'F', '1954-12-22', 71,
   '+91 9876543214', null,
   '{"line1":"3 Periyar Street","city":"Villupuram","state":"Tamil Nadu","pincode":"605602"}'::jsonb,
   'B-', 'widowed', '{}', '{Osteoporosis,Hypothyroidism}',
   '{"name":"Ranjini Narasimhan","relation":"daughter","mobile":"+91 9876543215"}'::jsonb,
   '44444444-0000-0000-0000-000000000001'),
  -- 6. Joseph Mathew
  ('aaaaaaaa-0000-0000-0000-000000000006',
   '11111111-1111-1111-1111-111111111111',
   'KH-2026-00042', 'complete',
   'Joseph', 'Mathew', 'M', '1992-06-15', 33,
   '+91 9876543277', null,
   '{"line1":"18 Church Lane","city":"Pondicherry","state":"Puducherry","pincode":"605001"}'::jsonb,
   'O+', 'single', '{}', '{}',
   '{"name":"Mary Mathew","relation":"mother","mobile":"+91 9876543278"}'::jsonb,
   '44444444-0000-0000-0000-000000000001'),
  -- 7. Anita Reddy
  ('aaaaaaaa-0000-0000-0000-000000000007',
   '11111111-1111-1111-1111-111111111111',
   'KH-2026-00012', 'complete',
   'Anita', 'Reddy', 'F', '1980-11-08', 45,
   '+91 9876543205', null,
   '{"line1":"56 Lake View","city":"Villupuram","state":"Tamil Nadu","pincode":"605602"}'::jsonb,
   'A+', 'married', '{}', '{Hypothyroidism}',
   '{"name":"Krishna Reddy","relation":"spouse","mobile":"+91 9876543206"}'::jsonb,
   '44444444-0000-0000-0000-000000000001'),
  -- 8. Geetha Raghavan (Karthik's wife — same mobile family demo)
  ('aaaaaaaa-0000-0000-0000-000000000008',
   '11111111-1111-1111-1111-111111111111',
   'KH-2025-04210', 'complete',
   'Geetha', 'Raghavan', 'F', '1986-07-19', 39,
   '+91 9876543210', '+91 9876543221',
   '{"line1":"12 Anna Salai","city":"Villupuram","state":"Tamil Nadu","pincode":"605602"}'::jsonb,
   'O+', 'married', '{}', '{}',
   '{"name":"Karthik Raghavan","relation":"spouse","mobile":"+91 9876543221"}'::jsonb,
   '44444444-0000-0000-0000-000000000001'),
  -- 9. Aarav Raghavan (Karthik's son)
  ('aaaaaaaa-0000-0000-0000-000000000009',
   '11111111-1111-1111-1111-111111111111',
   'KH-2025-04211', 'complete',
   'Aarav', 'Raghavan', 'M', '2014-03-25', 11,
   '+91 9876543210', null,
   '{"line1":"12 Anna Salai","city":"Villupuram","state":"Tamil Nadu","pincode":"605602"}'::jsonb,
   'B+', 'single', '{Eggs}', '{Asthma}',
   '{"name":"Geetha Raghavan","relation":"mother","mobile":"+91 9876543210"}'::jsonb,
   '44444444-0000-0000-0000-000000000001'),
  -- 10. Subramanian Raghavan (Karthik's father)
  ('aaaaaaaa-0000-0000-0000-00000000000a',
   '11111111-1111-1111-1111-111111111111',
   'KH-2024-02018', 'complete',
   'Subramanian', 'Raghavan', 'M', '1955-01-30', 70,
   '+91 9876543210', '+91 9876543221',
   '{"line1":"12 Anna Salai","city":"Villupuram","state":"Tamil Nadu","pincode":"605602"}'::jsonb,
   'B+', 'married', '{Aspirin}', '{"Type 2 Diabetes Mellitus",Hypertension,"Coronary Artery Disease"}',
   '{"name":"Karthik Raghavan","relation":"son","mobile":"+91 9876543221"}'::jsonb,
   '44444444-0000-0000-0000-000000000001'),
  -- 11. Lakshmi Narasimhan (older registration — second-Lakshmi demo)
  ('aaaaaaaa-0000-0000-0000-00000000000b',
   '11111111-1111-1111-1111-111111111111',
   'KH-2025-04412', 'complete',
   'Lakshmi', 'Narasimhan', 'F', '1954-12-22', 71,
   '+91 9876543214', null,
   '{"line1":"3 Periyar Street","city":"Villupuram","state":"Tamil Nadu","pincode":"605602"}'::jsonb,
   'B-', 'widowed', '{}', '{Osteoporosis,Hypothyroidism,"Type 2 Diabetes Mellitus"}',
   '{"name":"Ranjini Narasimhan","relation":"daughter","mobile":"+91 9876543215"}'::jsonb,
   '44444444-0000-0000-0000-000000000001');

-- 39 generated patients (varied South-Indian / Indian names, ages 1-85).
-- gen_random_uuid() — never referenced directly downstream.
insert into patients
  (tenant_id, uhid, registration_status, first_name, last_name,
   gender, dob, age, mobile, address, blood_group, marital_status,
   allergies, chronic_conditions, created_by)
values
  ('11111111-1111-1111-1111-111111111111','KH-2026-00050','complete','Murugan','Selvaraj','M','1972-05-14',53,'+91 9445123001','{"city":"Villupuram","pincode":"605602"}'::jsonb,'B+','married','{}','{Hypertension,"Hyperlipidemia / Dyslipidemia"}','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','KH-2026-00051','complete','Bhavana','Sundaram','F','1990-09-22',35,'+91 9445123002','{"city":"Villupuram","pincode":"605602"}'::jsonb,'O+','married','{NSAIDs}','{}','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','KH-2026-00052','complete','Divya','Krishnamoorthy','F','1995-02-10',31,'+91 9445123003','{"city":"Tindivanam","pincode":"604001"}'::jsonb,'A-','single','{}','{Asthma}','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','KH-2026-00053','complete','Ananya','Iyengar','F','2018-11-01',7,'+91 9445123004','{"city":"Villupuram","pincode":"605602"}'::jsonb,'AB+','single','{Peanuts}','{}','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','KH-2026-00054','complete','Karunya','Devi','F','1988-04-17',37,'+91 9445123005','{"city":"Villupuram","pincode":"605602"}'::jsonb,'B+','married','{}','{Hypothyroidism}','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','KH-2026-00055','complete','Pradeep','Srinivasan','M','1980-07-09',45,'+91 9445123006','{"city":"Villupuram","pincode":"605602"}'::jsonb,'O+','married','{}','{"Type 2 Diabetes Mellitus"}','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','KH-2026-00056','complete','Sundar','Ramachandran','M','1948-03-25',77,'+91 9445123007','{"city":"Tindivanam","pincode":"604001"}'::jsonb,'A+','married','{}','{Hypertension,"Coronary Artery Disease",COPD}','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','KH-2026-00057','complete','Vasanthi','Rajagopal','F','1962-10-30',63,'+91 9445123008','{"city":"Villupuram","pincode":"605602"}'::jsonb,'B-','widowed','{Cephalosporins}','{Osteoarthritis,"Type 2 Diabetes Mellitus"}','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','KH-2026-00058','complete','Padma','Venkatesh','F','1975-06-12',50,'+91 9445123009','{"city":"Villupuram","pincode":"605602"}'::jsonb,'O+','married','{}','{Hypertension}','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','KH-2026-00059','complete','Senthil','Kumaran','M','1970-12-04',55,'+91 9445123010','{"city":"Pondicherry","pincode":"605001"}'::jsonb,'A+','married','{}','{"Coronary Artery Disease",Hypertension,"Type 2 Diabetes Mellitus"}','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','KH-2026-00060','complete','Janani','Balasubramanian','F','1996-01-19',30,'+91 9445123011','{"city":"Villupuram","pincode":"605602"}'::jsonb,'B+','single','{Penicillin,Eggs}','{}','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','KH-2026-00061','complete','Arjun','Mohan','M','2008-08-22',17,'+91 9445123012','{"city":"Villupuram","pincode":"605602"}'::jsonb,'O+','single','{}','{Asthma}','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','KH-2026-00062','complete','Kavya','Lakshman','F','2022-03-08',3,'+91 9445123013','{"city":"Villupuram","pincode":"605602"}'::jsonb,'A+','single','{}','{}','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','KH-2026-00063','complete','Vikram','Chidambaram','M','1985-11-14',40,'+91 9445123014','{"city":"Villupuram","pincode":"605602"}'::jsonb,'B+','married','{Latex}','{}','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','KH-2026-00064','complete','Revathi','Natarajan','F','1957-09-09',68,'+91 9445123015','{"city":"Tindivanam","pincode":"604001"}'::jsonb,'O-','widowed','{}','{Hypertension,Hypothyroidism,Osteoporosis}','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','KH-2026-00065','complete','Manikandan','Thirumal','M','1978-04-28',47,'+91 9445123016','{"city":"Villupuram","pincode":"605602"}'::jsonb,'AB+','married','{}','{"Type 2 Diabetes Mellitus","Hyperlipidemia / Dyslipidemia"}','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','KH-2026-00066','complete','Saraswathi','Pandian','F','1942-07-20',83,'+91 9445123017','{"city":"Villupuram","pincode":"605602"}'::jsonb,'B+','widowed','{"Sulpha drugs","Iodine contrast"}','{Hypertension,Osteoarthritis,"Chronic Kidney Disease"}','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','KH-2026-00067','complete','Gopinath','Velu','M','1965-02-03',60,'+91 9445123018','{"city":"Villupuram","pincode":"605602"}'::jsonb,'A+','married','{}','{Hypertension}','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','KH-2026-00068','complete','Hari','Prasad','M','2001-12-12',24,'+91 9445123019','{"city":"Villupuram","pincode":"605602"}'::jsonb,'O+','single','{}','{}','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','KH-2026-00069','complete','Indira','Swaminathan','F','1969-05-25',56,'+91 9445123020','{"city":"Villupuram","pincode":"605602"}'::jsonb,'B+','married','{Aspirin}','{Hypertension,Anxiety}','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','KH-2026-00070','complete','Jeevan','Pillai','M','2024-08-11',1,'+91 9445123021','{"city":"Villupuram","pincode":"605602"}'::jsonb,'A+','single','{}','{}','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','KH-2025-04501','complete','Sivakumar','Nadar','M','1956-11-30',69,'+91 9445123022','{"city":"Pondicherry","pincode":"605001"}'::jsonb,'B-','married','{}','{COPD,Hypertension}','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','KH-2025-04502','complete','Tamilselvi','Ganesan','F','1973-06-08',52,'+91 9445123023','{"city":"Villupuram","pincode":"605602"}'::jsonb,'O+','married','{}','{Hypothyroidism,"Type 2 Diabetes Mellitus"}','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','KH-2025-04503','complete','Nirmala','Devi','F','1981-03-15',44,'+91 9445123024','{"city":"Villupuram","pincode":"605602"}'::jsonb,'A+','married','{NSAIDs,Aspirin}','{Hypertension}','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','KH-2025-04504','complete','Balaji','Shankar','M','1990-01-27',36,'+91 9445123025','{"city":"Villupuram","pincode":"605602"}'::jsonb,'B+','married','{}','{}','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','KH-2025-04505','complete','Chitra','Mohanraj','F','1959-08-04',66,'+91 9445123026','{"city":"Tindivanam","pincode":"604001"}'::jsonb,'O+','widowed','{}','{Hypertension,"Type 2 Diabetes Mellitus","Coronary Artery Disease"}','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','KH-2025-04506','complete','Deepak','Anand','M','1987-10-21',38,'+91 9445123027','{"city":"Villupuram","pincode":"605602"}'::jsonb,'AB+','married','{}','{}','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','KH-2025-04507','complete','Eswari','Chandran','F','1944-12-19',81,'+91 9445123028','{"city":"Villupuram","pincode":"605602"}'::jsonb,'B+','widowed','{Penicillin}','{"Chronic Kidney Disease",Hypertension,Osteoporosis}','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','KH-2025-04508','complete','Ferzin','Jamal','M','1993-05-06',32,'+91 9445123029','{"city":"Pondicherry","pincode":"605001"}'::jsonb,'A+','single','{}','{}','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','KH-2025-04509','complete','Geeta','Iyer','F','1970-03-11',55,'+91 9445123030','{"city":"Villupuram","pincode":"605602"}'::jsonb,'O+','married','{Cephalosporins}','{Hypertension,"Hyperlipidemia / Dyslipidemia"}','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','KH-2025-04510','complete','Harish','Kumar','M','2010-07-30',15,'+91 9445123031','{"city":"Villupuram","pincode":"605602"}'::jsonb,'B+','single','{}','{Asthma}','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','KH-2025-04511','complete','Ishita','Menon','F','1998-09-17',27,'+91 9445123032','{"city":"Villupuram","pincode":"605602"}'::jsonb,'A-','single','{}','{}','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','KH-2025-04512','complete','Jagadish','Kannan','M','1952-06-23',73,'+91 9445123033','{"city":"Tindivanam","pincode":"604001"}'::jsonb,'O+','married','{}','{Hypertension,"Coronary Artery Disease","Type 2 Diabetes Mellitus"}','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','KH-2025-04513','complete','Kasthuri','Bai','F','1965-01-08',60,'+91 9445123034','{"city":"Villupuram","pincode":"605602"}'::jsonb,'B+','married','{Latex}','{Hypothyroidism,Osteoarthritis}','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','KH-2025-04514','complete','Lokesh','Babu','M','1986-04-02',39,'+91 9445123035','{"city":"Villupuram","pincode":"605602"}'::jsonb,'A+','married','{}','{}','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','KH-2025-04515','complete','Mythili','Raman','F','1979-11-14',46,'+91 9445123036','{"city":"Villupuram","pincode":"605602"}'::jsonb,'O+','married','{}','{"Type 2 Diabetes Mellitus",Hypertension}','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','KH-2025-04516','complete','Naveen','Raj','M','2003-02-26',23,'+91 9445123037','{"city":"Villupuram","pincode":"605602"}'::jsonb,'B+','single','{}','{}','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','KH-2025-04517','complete','Omkari','Bhat','F','1991-12-05',34,'+91 9445123038','{"city":"Villupuram","pincode":"605602"}'::jsonb,'AB-','married','{}','{Anxiety,Depression}','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','KH-2025-04518','complete','Prabhu','Doss','M','1947-09-29',78,'+91 9445123039','{"city":"Villupuram","pincode":"605602"}'::jsonb,'O+','married','{Aspirin,Penicillin}','{Hypertension,COPD,"Coronary Artery Disease"}','44444444-0000-0000-0000-000000000001');

-- =====================================================================
-- SECTION 3 — patient_family_history (kin / family-history rows)
-- =====================================================================
-- Schema has no patient_kin table — patient_family_history is the closest
-- concept (relative + condition + ICD-10). Karthik gets 3 rows for
-- spouse / son / father verbatim; other patients get clusters that share
-- a household mobile so the FE same-mobile family lookup demo works.
insert into patient_family_history
  (tenant_id, patient_id, relationship, relationship_specific,
   condition_name, icd10_code, age_of_onset, is_deceased, notes, created_by)
values
  -- Karthik Raghavan family
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','other','spouse','Geetha Raghavan — household contact (no chronic conditions)',null,null,false,'Spouse',  '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','child','son','Aarav Raghavan — childhood asthma','J45',2,false,'Son, paediatric asthma','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','father',null,'Type 2 Diabetes Mellitus','E11',55,false,'Father — uncontrolled DM, on insulin','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','father',null,'Coronary Artery Disease','I25',62,false,'Father — post-CABG 2018','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','mother',null,'Hypertension','I10',50,true,'Deceased age 68 — CVA','44444444-0000-0000-0000-000000000001'),
  -- Meera Pillai family
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000002','father',null,'Type 2 Diabetes Mellitus','E11',58,true,'Deceased age 75','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000002','mother',null,'Osteoarthritis','M19',60,false,'Mother, ambulatory','44444444-0000-0000-0000-000000000001'),
  -- Ramesh Babu family
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000003','father',null,'Coronary Artery Disease','I25',60,true,'Father — MI age 70','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000003','sibling','brother','Hypertension','I10',55,false,'Elder brother on amlodipine','44444444-0000-0000-0000-000000000001'),
  -- Lakshmi Narasimhan (KH-2026-00049)
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000005','child','daughter','Hypothyroidism','E03',35,false,'Ranjini, on thyroxine','44444444-0000-0000-0000-000000000001'),
  -- Anita Reddy
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000007','mother',null,'Hypothyroidism','E03',40,false,'Mother — same condition','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000007','sibling','sister','Type 2 Diabetes Mellitus','E11',38,false,'Younger sister','44444444-0000-0000-0000-000000000001'),
  -- Joseph Mathew
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000006','father',null,'Hypertension','I10',55,false,'Father','44444444-0000-0000-0000-000000000001'),
  -- Subramanian Raghavan
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-00000000000a','child','son','Hypertension','I10',40,false,'Karthik, hypertensive','44444444-0000-0000-0000-000000000001'),
  -- 15 more clusters across other patients (sub-selected by uhid lookup)
  ('11111111-1111-1111-1111-111111111111',(select id from patients where uhid='KH-2026-00050'),'father',null,'Hypertension','I10',58,true,'Deceased CVA age 72','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111',(select id from patients where uhid='KH-2026-00050'),'mother',null,'Type 2 Diabetes Mellitus','E11',55,false,'Mother on OHA','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111',(select id from patients where uhid='KH-2026-00056'),'sibling','brother','Coronary Artery Disease','I25',65,true,'Brother — MI age 70','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111',(select id from patients where uhid='KH-2026-00057'),'mother',null,'Osteoarthritis','M19',62,true,'Deceased age 80','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111',(select id from patients where uhid='KH-2026-00059'),'father',null,'Coronary Artery Disease','I25',60,true,'Father MI age 68','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111',(select id from patients where uhid='KH-2026-00059'),'mother',null,'Type 2 Diabetes Mellitus','E11',55,false,'Mother on insulin','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111',(select id from patients where uhid='KH-2026-00064'),'sibling','sister','Hypothyroidism','E03',50,false,'Elder sister','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111',(select id from patients where uhid='KH-2026-00065'),'father',null,'Type 2 Diabetes Mellitus','E11',50,false,'Father','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111',(select id from patients where uhid='KH-2026-00066'),'child','daughter','Hypertension','I10',45,false,'Daughter, on telmisartan','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111',(select id from patients where uhid='KH-2025-04505'),'sibling','sister','Coronary Artery Disease','I25',60,false,'Sister post-PCI','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111',(select id from patients where uhid='KH-2025-04507'),'father',null,'Chronic Kidney Disease','N18',70,true,'Father — dialysis','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111',(select id from patients where uhid='KH-2025-04512'),'sibling','brother','Type 2 Diabetes Mellitus','E11',55,false,'Brother','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111',(select id from patients where uhid='KH-2025-04513'),'mother',null,'Osteoarthritis','M19',60,false,'Mother — knee replacement','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111',(select id from patients where uhid='KH-2025-04515'),'father',null,'Hypertension','I10',55,false,'Father','44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111',(select id from patients where uhid='KH-2025-04518'),'sibling','brother','COPD','J44',70,true,'Brother — chronic smoker','44444444-0000-0000-0000-000000000001');

-- =====================================================================
-- SECTION 4 — Vendors (suppliers in spec) + medicines + batches
-- =====================================================================
-- Schema names the supplier table `vendors`. Three vendors so PO + batch
-- demos have variety; one is flagged is_narcotic_supplier for Tramadol.
insert into vendors
  (id, tenant_id, vendor_code, vendor_name, contact_person, mobile, email,
   address, gstin, drug_licence_number, payment_terms_days,
   is_narcotic_supplier, created_by)
values
  ('cccccccc-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','VEN-001','MediSupply South Pvt Ltd','R. Karthikeyan','+91 9444010101','sales@medisupply-south.in','100 Anna Salai, Chennai','33ABCDE1234F1Z5','TN-CHE-DR-1101', 30, false,'44444444-0000-0000-0000-000000000001'),
  ('cccccccc-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','VEN-002','Bharath Pharma Distributors','S. Lakshmi','+91 9444020202','orders@bharathpharma.in','55 Ranganathan Street, Chennai','33XYZAB6789K1Z3','TN-CHE-DR-1207', 45, false,'44444444-0000-0000-0000-000000000001'),
  ('cccccccc-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','VEN-003','South Pharma Narcotics Wholesalers','D. Mohan','+91 9444030303','ndps@southpharma-nar.in','Industrial Estate, Pondicherry','34NDPSL5544P1Z9','PY-PON-NDPS-007', 15, true, '44444444-0000-0000-0000-000000000001');

-- Medicines: 11 FE-pinned with deterministic UUIDs (referenced by
-- prescription_items below) + 30 generated. drug_class lines up with
-- allergies_lookup.drug_class_code so prescribe-time alerts fire.
insert into medicines
  (id, tenant_id, medicine_code, medicine_name, generic_name, brand_name,
   manufacturer, category, drug_schedule, is_narcotic, drug_class,
   form, strength, unit, pack_size, gst_pct, requires_prescription,
   reorder_level, max_stock_level, created_by)
values
  -- 11 FE-pinned
  ('dddddddd-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','MED-PCM500','Paracetamol 500mg','Paracetamol','Crocin','GSK','analgesic','OTC',false,'analgesic','tablet','500mg','tablet',10,12,false,200,2000,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','MED-IBU400','Ibuprofen 400mg','Ibuprofen','Brufen','Abbott','nsaid','H',false,'nsaid','tablet','400mg','tablet',10,12,true,150,1500,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','MED-AMOX500','Amoxicillin 500mg','Amoxicillin','Mox','Ranbaxy','antibiotic','H',false,'penicillin','capsule','500mg','capsule',10,12,true,100,1000,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','MED-DICLO50','Diclofenac 50mg','Diclofenac sodium','Voveran','Novartis','nsaid','H',false,'nsaid','tablet','50mg','tablet',10,12,true,150,1200,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','MED-PAN40','Pantoprazole 40mg','Pantoprazole','Pantocid','Sun Pharma','ppi','H',false,'ppi','tablet','40mg','tablet',15,12,true,200,2000,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000006','11111111-1111-1111-1111-111111111111','MED-CALD3','Calcium + Vit D3','Calcium carbonate + Cholecalciferol','Shelcal','Torrent','supplement','OTC',false,null,'tablet','500mg + 250IU','tablet',15,12,false,100,1000,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000007','11111111-1111-1111-1111-111111111111','MED-TRAM50','Tramadol 50mg','Tramadol HCl','Ultracet','Janssen','opioid','X',true,'opioid','capsule','50mg','capsule',10,12,true,30,200,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000008','11111111-1111-1111-1111-111111111111','MED-CEF200','Cefixime 200mg','Cefixime','Taxim-O','Alkem','antibiotic','H',false,'cephalosporin','tablet','200mg','tablet',10,12,true,80,800,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000009','11111111-1111-1111-1111-111111111111','MED-MET500','Metformin 500mg','Metformin','Glycomet','USV','antidiabetic','H',false,null,'tablet','500mg','tablet',15,12,true,250,2500,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-00000000000a','11111111-1111-1111-1111-111111111111','MED-ETO90','Etoricoxib 90mg','Etoricoxib','Etoshine','Sun Pharma','nsaid','H',false,'nsaid','tablet','90mg','tablet',10,12,true,80,800,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-00000000000b','11111111-1111-1111-1111-111111111111','MED-COTRIM','Cotrimoxazole DS','Sulphamethoxazole + Trimethoprim','Septran','GSK','antibiotic','H',false,'sulfonamide','tablet','800mg + 160mg','tablet',10,12,true,80,800,'44444444-0000-0000-0000-000000000001'),
  -- Generated 30
  ('dddddddd-0000-0000-0000-000000000020','11111111-1111-1111-1111-111111111111','MED-ATOR10','Atorvastatin 10mg','Atorvastatin','Atorva','Zydus','statin','H',false,'statin','tablet','10mg','tablet',10,12,true,150,1500,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000021','11111111-1111-1111-1111-111111111111','MED-ATOR40','Atorvastatin 40mg','Atorvastatin','Atorva','Zydus','statin','H',false,'statin','tablet','40mg','tablet',10,12,true,80,800,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000022','11111111-1111-1111-1111-111111111111','MED-TELM40','Telmisartan 40mg','Telmisartan','Telma','Glenmark','arb','H',false,'arb','tablet','40mg','tablet',10,12,true,150,1500,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000023','11111111-1111-1111-1111-111111111111','MED-AMLO5','Amlodipine 5mg','Amlodipine','Amlogard','Pfizer','calcium_channel_blocker','H',false,'ccb','tablet','5mg','tablet',10,12,true,200,2000,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000024','11111111-1111-1111-1111-111111111111','MED-LOSAR50','Losartan 50mg','Losartan','Losar','Unichem','arb','H',false,'arb','tablet','50mg','tablet',10,12,true,120,1200,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000025','11111111-1111-1111-1111-111111111111','MED-HCTZ25','Hydrochlorothiazide 25mg','HCTZ','Aquazide','Sun Pharma','diuretic','H',false,'thiazide','tablet','25mg','tablet',10,12,true,80,800,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000026','11111111-1111-1111-1111-111111111111','MED-RAMI5','Ramipril 5mg','Ramipril','Cardace','Sanofi','ace_inhibitor','H',false,'ace_inhibitor','capsule','5mg','capsule',10,12,true,100,1000,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000027','11111111-1111-1111-1111-111111111111','MED-BISO5','Bisoprolol 5mg','Bisoprolol','Concor','Merck','beta_blocker','H',false,'beta_blocker','tablet','5mg','tablet',10,12,true,80,800,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000028','11111111-1111-1111-1111-111111111111','MED-ASP75','Aspirin 75mg','Aspirin','Ecosprin','USV','antiplatelet','OTC',false,'salicylate','tablet','75mg','tablet',14,5,true,200,2000,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000029','11111111-1111-1111-1111-111111111111','MED-CLOP75','Clopidogrel 75mg','Clopidogrel','Clopilet','Sun','antiplatelet','H',false,'antiplatelet','tablet','75mg','tablet',10,12,true,100,1000,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-00000000002a','11111111-1111-1111-1111-111111111111','MED-INSGLG','Insulin Glargine','Insulin glargine','Lantus','Sanofi','antidiabetic','H',false,null,'injection','100 IU/ml','vial',1,5,true,30,150,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-00000000002b','11111111-1111-1111-1111-111111111111','MED-GLIM2','Glimepiride 2mg','Glimepiride','Amaryl','Sanofi','antidiabetic','H',false,null,'tablet','2mg','tablet',10,12,true,100,1000,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-00000000002c','11111111-1111-1111-1111-111111111111','MED-SITA100','Sitagliptin 100mg','Sitagliptin','Januvia','MSD','antidiabetic','H',false,null,'tablet','100mg','tablet',7,12,true,80,800,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-00000000002d','11111111-1111-1111-1111-111111111111','MED-LEVOTHY','Levothyroxine 50mcg','Levothyroxine','Eltroxin','GSK','hormone','H',false,null,'tablet','50mcg','tablet',100,5,true,80,800,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-00000000002e','11111111-1111-1111-1111-111111111111','MED-OMP20','Omeprazole 20mg','Omeprazole','Omez','Dr.Reddys','ppi','H',false,'ppi','capsule','20mg','capsule',15,12,true,150,1500,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-00000000002f','11111111-1111-1111-1111-111111111111','MED-DOMP10','Domperidone 10mg','Domperidone','Domstal','Torrent','antiemetic','H',false,null,'tablet','10mg','tablet',10,12,true,80,800,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000030','11111111-1111-1111-1111-111111111111','MED-OND4','Ondansetron 4mg','Ondansetron','Emeset','Cipla','antiemetic','H',false,null,'tablet','4mg','tablet',10,12,true,60,600,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000031','11111111-1111-1111-1111-111111111111','MED-METRO400','Metronidazole 400mg','Metronidazole','Flagyl','Abbott','antibiotic','H',false,null,'tablet','400mg','tablet',15,12,true,100,1000,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000032','11111111-1111-1111-1111-111111111111','MED-DOXY100','Doxycycline 100mg','Doxycycline','Doxt','Cipla','antibiotic','H',false,null,'capsule','100mg','capsule',10,12,true,60,600,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000033','11111111-1111-1111-1111-111111111111','MED-AZI500','Azithromycin 500mg','Azithromycin','Azithral','Alembic','antibiotic','H',false,null,'tablet','500mg','tablet',5,12,true,80,800,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000034','11111111-1111-1111-1111-111111111111','MED-CIPRO500','Ciprofloxacin 500mg','Ciprofloxacin','Cifran','Ranbaxy','antibiotic','H',false,'fluoroquinolone','tablet','500mg','tablet',10,12,true,80,800,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000035','11111111-1111-1111-1111-111111111111','MED-LEVO500','Levofloxacin 500mg','Levofloxacin','Levoflox','Cipla','antibiotic','H',false,'fluoroquinolone','tablet','500mg','tablet',5,12,true,60,600,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000036','11111111-1111-1111-1111-111111111111','MED-CEFU500','Cefuroxime 500mg','Cefuroxime','Ceftum','GSK','antibiotic','H',false,'cephalosporin','tablet','500mg','tablet',10,12,true,60,600,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000037','11111111-1111-1111-1111-111111111111','MED-SAL2','Salbutamol Syrup','Salbutamol','Asthalin','Cipla','bronchodilator','H',false,null,'syrup','2mg/5ml','ml',60,12,true,40,200,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000038','11111111-1111-1111-1111-111111111111','MED-BUDIN','Budesonide Inhaler','Budesonide','Budecort','Cipla','steroid','H',false,'corticosteroid','inhaler','200mcg','dose',200,12,true,30,200,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000039','11111111-1111-1111-1111-111111111111','MED-CETZ10','Cetirizine 10mg','Cetirizine','Cetzine','Dr.Reddys','antihistamine','OTC',false,null,'tablet','10mg','tablet',10,5,false,150,1500,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-00000000003a','11111111-1111-1111-1111-111111111111','MED-MONT10','Montelukast 10mg','Montelukast','Montair','Cipla','leukotriene','H',false,null,'tablet','10mg','tablet',10,12,true,80,800,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-00000000003b','11111111-1111-1111-1111-111111111111','MED-VITD60K','Vitamin D3 60K','Cholecalciferol','Calcirol','Cadila','supplement','OTC',false,null,'capsule','60000 IU','sachet',4,5,false,200,2000,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-00000000003c','11111111-1111-1111-1111-111111111111','MED-FOLIC5','Folic Acid 5mg','Folic acid','Folvite','Pfizer','supplement','OTC',false,null,'tablet','5mg','tablet',10,5,false,100,1000,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-00000000003d','11111111-1111-1111-1111-111111111111','MED-FERSU','Iron Sucrose Inj','Iron sucrose','Orofer-S','Emcure','hematinic','H',false,null,'injection','100mg/5ml','vial',1,12,true,40,200,'44444444-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-00000000003e','11111111-1111-1111-1111-111111111111','MED-HYDRX25','Hydroxyzine 25mg','Hydroxyzine','Atarax','UCB','antihistamine','H',false,null,'tablet','25mg','tablet',15,12,true,40,400,'44444444-0000-0000-0000-000000000001');

-- One PO per vendor so batches have a parent (purchase_in stock movements
-- need a non-null purchase_order_item_id). Layer 2 — already 'approved'.
insert into purchase_orders
  (id, tenant_id, po_number, vendor_id, expected_date, status,
   total_amount, includes_narcotics, ordered_by, approval_status,
   approved_by, approved_at, ordered_at, received_at, created_by)
values
  ('eeeeeeee-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','PO-2025-0001','cccccccc-0000-0000-0000-000000000001',
   '2025-09-15','received', 142500.00, false,
   '44444444-0000-0000-0000-000000000001','approved','44444444-0000-0000-0000-000000000001', now() - interval '180 days',
   now() - interval '178 days', now() - interval '170 days', '44444444-0000-0000-0000-000000000001'),
  ('eeeeeeee-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','PO-2025-0002','cccccccc-0000-0000-0000-000000000002',
   '2025-12-01','received', 98750.00, false,
   '44444444-0000-0000-0000-000000000001','approved','44444444-0000-0000-0000-000000000001', now() - interval '90 days',
   now() - interval '88 days', now() - interval '82 days', '44444444-0000-0000-0000-000000000001'),
  ('eeeeeeee-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','PO-2026-0001','cccccccc-0000-0000-0000-000000000003',
   '2026-04-10','received', 18500.00, true,
   '44444444-0000-0000-0000-000000000001','approved','44444444-0000-0000-0000-000000000001', now() - interval '40 days',
   now() - interval '38 days', now() - interval '30 days', '44444444-0000-0000-0000-000000000001');

-- One PO line per medicine across the three POs. Quantity_ordered =
-- quantity_received (full receipt). Captured below as INSERT … RETURNING
-- via a separate row-set is not needed — we recompute totals via SQL.
-- Use medicine codes to drive a bulk insert.
insert into purchase_order_items
  (id, purchase_order_id, medicine_id, quantity_ordered, quantity_received,
   unit_price, cgst_pct, cgst_amount, sgst_pct, sgst_amount, total_price)
select
  ('ffffffff-0000-0000-0000-' || lpad(row_number() over ()::text, 12, '0'))::uuid,
  case
    when m.medicine_code = 'MED-TRAM50' then 'eeeeeeee-0000-0000-0000-000000000003'::uuid -- narcotic vendor
    when m.medicine_code in ('MED-PCM500','MED-IBU400','MED-AMOX500','MED-DICLO50','MED-PAN40','MED-CALD3',
                             'MED-CEF200','MED-MET500','MED-ETO90','MED-COTRIM','MED-ATOR10','MED-ATOR40',
                             'MED-TELM40','MED-AMLO5','MED-LOSAR50','MED-HCTZ25','MED-RAMI5','MED-BISO5',
                             'MED-ASP75','MED-CLOP75')
      then 'eeeeeeee-0000-0000-0000-000000000001'::uuid
    else 'eeeeeeee-0000-0000-0000-000000000002'::uuid
  end,
  m.id,
  500, 500,
  case
    when m.medicine_code = 'MED-INSGLG' then 1200.00
    when m.form = 'injection'           then  250.00
    when m.form = 'inhaler'             then  320.00
    when m.form = 'syrup'               then   85.00
    when m.is_narcotic                  then   95.00
    else                                        35.00
  end,
  6, 0, 6, 0, 0  -- placeholder GST; total_price recomputed below
from medicines m
where m.tenant_id = '11111111-1111-1111-1111-111111111111';

-- Backfill total_price = qty * unit_price for the rows just inserted.
update purchase_order_items
   set total_price = quantity_received * unit_price
 where total_price = 0;

-- ---------------------------------------------------------------------
-- Medicine batches: one batch per medicine with a healthy stock,
-- plus 4 special-case rows (near-expiry, expired-blocked, out-of-stock,
-- recently-recalled-blocked) so the FE inventory list has variety.
-- ---------------------------------------------------------------------
insert into medicine_batches
  (tenant_id, medicine_id, batch_number, mfg_date, expiry_date,
   purchase_price, mrp_at_purchase, selling_price,
   quantity_received, quantity_available,
   vendor_id, po_id, received_date, is_blocked, blocked_reason)
select
  '11111111-1111-1111-1111-111111111111',
  m.id,
  'B-' || upper(substring(m.medicine_code from 5 for 8)) || '-01',
  current_date - interval '120 days',
  current_date + interval '24 months',
  case when m.is_narcotic then 80.00 else 25.00 end,
  case when m.is_narcotic then 110.00 else 45.00 end,
  case when m.is_narcotic then 95.00 else 40.00 end,
  500,
  case
    when m.medicine_code = 'MED-AMOX500' then 0          -- out of stock demo
    when m.medicine_code = 'MED-CEF200'  then 12         -- low-stock demo
    else 320 + (random()*150)::int
  end,
  case when m.is_narcotic
       then 'cccccccc-0000-0000-0000-000000000003'::uuid
       else 'cccccccc-0000-0000-0000-000000000001'::uuid end,
  case when m.is_narcotic
       then 'eeeeeeee-0000-0000-0000-000000000003'::uuid
       else 'eeeeeeee-0000-0000-0000-000000000001'::uuid end,
  current_date - interval '110 days',
  false, null
from medicines m
where m.tenant_id = '11111111-1111-1111-1111-111111111111';

-- 4 special-case batches.
insert into medicine_batches
  (tenant_id, medicine_id, batch_number, mfg_date, expiry_date,
   purchase_price, mrp_at_purchase, selling_price,
   quantity_received, quantity_available,
   vendor_id, po_id, received_date, is_blocked, blocked_reason)
values
  -- Near-expiry: Pantoprazole (will trigger 30-day expiry warning index)
  ('11111111-1111-1111-1111-111111111111','dddddddd-0000-0000-0000-000000000005','B-PAN-NEAR','2024-02-01', current_date + interval '20 days',
   12.50, 22.00, 19.50, 100, 38,
   'cccccccc-0000-0000-0000-000000000001','eeeeeeee-0000-0000-0000-000000000001', current_date - interval '150 days', false, null),
  -- Expired-blocked: Diclofenac old batch
  ('11111111-1111-1111-1111-111111111111','dddddddd-0000-0000-0000-000000000004','B-DICLO-EXP','2023-01-01', current_date - interval '60 days',
   8.00, 14.00, 12.50, 200, 0,
   'cccccccc-0000-0000-0000-000000000001','eeeeeeee-0000-0000-0000-000000000001', current_date - interval '500 days', true, 'expired'),
  -- Recall-blocked: Cotrimoxazole batch
  ('11111111-1111-1111-1111-111111111111','dddddddd-0000-0000-0000-00000000000b','B-COTRIM-RCL','2024-08-01', current_date + interval '12 months',
   18.00, 32.00, 28.00, 200, 200,
   'cccccccc-0000-0000-0000-000000000002','eeeeeeee-0000-0000-0000-000000000002', current_date - interval '60 days', true, 'recall'),
  -- Damaged-blocked: Insulin glargine vial
  ('11111111-1111-1111-1111-111111111111','dddddddd-0000-0000-0000-00000000002a','B-INS-DMG','2025-09-01', current_date + interval '18 months',
   1100.00, 1450.00, 1380.00, 10, 0,
   'cccccccc-0000-0000-0000-000000000002','eeeeeeee-0000-0000-0000-000000000002', current_date - interval '20 days', true, 'damaged');

-- Stock movements: one purchase_in per non-blocked batch (~40), plus a
-- handful of sale_out rows (no FK target since pharmacy module is out of
-- scope — pharmacy_sale_item_id stays null and movement_type cannot be
-- sale_out by check constraint, so use 'ward_use' instead — used by
-- nursing for OPD vitals room consumption).
insert into stock_movements
  (tenant_id, medicine_batch_id, movement_type, quantity, balance_after,
   purchase_order_item_id, performed_by, performed_at, notes)
select
  '11111111-1111-1111-1111-111111111111',
  mb.id,
  'purchase_in',
  mb.quantity_received,
  mb.quantity_received,
  poi.id,
  '44444444-0000-0000-0000-000000000001',
  mb.received_date::timestamptz + interval '2 hours',
  'Initial receipt against PO ' || (select po_number from purchase_orders po where po.id = mb.po_id)
from medicine_batches mb
join purchase_order_items poi on poi.purchase_order_id = mb.po_id and poi.medicine_id = mb.medicine_id
where mb.tenant_id = '11111111-1111-1111-1111-111111111111'
  and not mb.is_blocked;

-- 30 ward_use movements (mock pharmacy dispenses for past visits).
insert into stock_movements
  (tenant_id, medicine_batch_id, movement_type, quantity, balance_after,
   performed_by, performed_at, notes)
select
  '11111111-1111-1111-1111-111111111111',
  mb.id,
  'ward_use',
  -1 * (1 + (random()*9)::int),
  greatest(mb.quantity_available - 50, 100),
  '44444444-0000-0000-0000-000000000001',
  now() - (random() * interval '120 days'),
  'OPD consumption (vitals room / minor procedures)'
from medicine_batches mb
where mb.tenant_id = '11111111-1111-1111-1111-111111111111'
  and not mb.is_blocked
  and mb.medicine_id in (
    'dddddddd-0000-0000-0000-000000000001'::uuid, -- Paracetamol
    'dddddddd-0000-0000-0000-000000000002'::uuid, -- Ibuprofen
    'dddddddd-0000-0000-0000-000000000004'::uuid, -- Diclofenac
    'dddddddd-0000-0000-0000-000000000005'::uuid, -- Pantoprazole
    'dddddddd-0000-0000-0000-000000000028'::uuid  -- Aspirin
  )
  and mb.quantity_available > 100;

-- One expiry write-off for the expired diclofenac batch (so the audit
-- demo shows the workflow end-to-end).
insert into stock_movements
  (tenant_id, medicine_batch_id, movement_type, quantity, balance_after,
   performed_by, performed_at, adjustment_reason, notes)
select
  '11111111-1111-1111-1111-111111111111', mb.id, 'expiry_writeoff',
  -200, 0, '44444444-0000-0000-0000-000000000001',
  current_date - interval '55 days',
  null,
  'Quarterly expiry sweep — destroyed under pharmacist supervision.'
from medicine_batches mb
where mb.batch_number = 'B-DICLO-EXP';

-- =====================================================================
-- SECTION 5 — Lab catalog (lab_tests + lab_test_panels)
-- =====================================================================
-- 13 FE-pinned (deterministic UUIDs so lab_order_items can reference) +
-- 17 generated. Reference ranges are nominal (literature values).
insert into lab_tests
  (id, tenant_id, test_code, test_name, category, sample_type, sample_volume_ml,
   department_id, default_price,
   normal_range_male, normal_range_female,
   ref_min_male, ref_max_male, ref_min_female, ref_max_female,
   critical_low, critical_high, unit, tat_hours, result_type, requires_fasting, created_by)
values
  ('11111111-2222-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','CBC','Complete Blood Count','hematology','EDTA whole blood',3.0,
   '22222222-0000-0000-0000-000000000004', 350.00,
   '13.0-17.0 g/dL (Hb)','12.0-15.0 g/dL (Hb)', 13.0, 17.0, 12.0, 15.0, 7.0, 20.0, 'g/dL', 4, 'numeric', false, '44444444-0000-0000-0000-000000000001'),
  ('11111111-2222-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','CRP','C-Reactive Protein','biochemistry','Serum',2.0,
   '22222222-0000-0000-0000-000000000004', 450.00,
   '< 5 mg/L','< 5 mg/L', 0.0, 5.0, 0.0, 5.0, null, 100.0, 'mg/L', 6, 'numeric', false, '44444444-0000-0000-0000-000000000001'),
  ('11111111-2222-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','RFT','Renal Function Test','biochemistry','Serum',3.0,
   '22222222-0000-0000-0000-000000000004', 650.00,
   'Creat 0.7-1.3 mg/dL','Creat 0.6-1.1 mg/dL', 0.7, 1.3, 0.6, 1.1, null, 5.0, 'mg/dL', 6, 'numeric', false, '44444444-0000-0000-0000-000000000001'),
  ('11111111-2222-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','LFT','Liver Function Test','biochemistry','Serum',3.0,
   '22222222-0000-0000-0000-000000000004', 700.00,
   'ALT 7-56 U/L','ALT 7-56 U/L', 7.0, 56.0, 7.0, 56.0, null, 1000.0, 'U/L', 6, 'numeric', true, '44444444-0000-0000-0000-000000000001'),
  ('11111111-2222-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','ESR','Erythrocyte Sedimentation Rate','hematology','EDTA whole blood',2.0,
   '22222222-0000-0000-0000-000000000004', 150.00,
   '0-15 mm/hr','0-20 mm/hr', 0.0, 15.0, 0.0, 20.0, null, 100.0, 'mm/hr', 4, 'numeric', false, '44444444-0000-0000-0000-000000000001'),
  ('11111111-2222-0000-0000-000000000006','11111111-1111-1111-1111-111111111111','HBA1C','Glycated Haemoglobin (HbA1c)','biochemistry','EDTA whole blood',2.0,
   '22222222-0000-0000-0000-000000000004', 550.00,
   '4.0-5.6 %','4.0-5.6 %', 4.0, 5.6, 4.0, 5.6, null, 14.0, '%', 8, 'numeric', false, '44444444-0000-0000-0000-000000000001'),
  ('11111111-2222-0000-0000-000000000007','11111111-1111-1111-1111-111111111111','GLU','Random Blood Glucose','biochemistry','Fluoride plasma',2.0,
   '22222222-0000-0000-0000-000000000004', 100.00,
   '70-140 mg/dL','70-140 mg/dL', 70.0, 140.0, 70.0, 140.0, 40.0, 400.0, 'mg/dL', 2, 'numeric', false, '44444444-0000-0000-0000-000000000001'),
  ('11111111-2222-0000-0000-000000000008','11111111-1111-1111-1111-111111111111','LIPID','Lipid Profile','biochemistry','Serum',3.0,
   '22222222-0000-0000-0000-000000000004', 850.00,
   'TC < 200 mg/dL','TC < 200 mg/dL', 0.0, 200.0, 0.0, 200.0, null, 400.0, 'mg/dL', 8, 'numeric', true, '44444444-0000-0000-0000-000000000001'),
  ('11111111-2222-0000-0000-000000000009','11111111-1111-1111-1111-111111111111','BGR','Blood Group + Rh','hematology','EDTA whole blood',2.0,
   '22222222-0000-0000-0000-000000000004', 200.00,
   null, null, null, null, null, null, null, null, null, 4, 'free_text', false, '44444444-0000-0000-0000-000000000001'),
  ('11111111-2222-0000-0000-00000000000a','11111111-1111-1111-1111-111111111111','URN','Urine Routine','biochemistry','Urine',20.0,
   '22222222-0000-0000-0000-000000000004', 150.00,
   null, null, null, null, null, null, null, null, null, 4, 'free_text', false, '44444444-0000-0000-0000-000000000001'),
  ('11111111-2222-0000-0000-00000000000b','11111111-1111-1111-1111-111111111111','HIV','HIV I & II Screening','serology','Serum',2.0,
   '22222222-0000-0000-0000-000000000004', 450.00,
   'Non-reactive','Non-reactive', null, null, null, null, null, null, null, 24, 'reactive_nonreactive', false, '44444444-0000-0000-0000-000000000001'),
  ('11111111-2222-0000-0000-00000000000c','11111111-1111-1111-1111-111111111111','HCV','Hepatitis C antibody','serology','Serum',2.0,
   '22222222-0000-0000-0000-000000000004', 500.00,
   'Non-reactive','Non-reactive', null, null, null, null, null, null, null, 24, 'reactive_nonreactive', false, '44444444-0000-0000-0000-000000000001'),
  ('11111111-2222-0000-0000-00000000000d','11111111-1111-1111-1111-111111111111','HBSAG','Hepatitis B surface antigen','serology','Serum',2.0,
   '22222222-0000-0000-0000-000000000004', 400.00,
   'Non-reactive','Non-reactive', null, null, null, null, null, null, null, 24, 'reactive_nonreactive', false, '44444444-0000-0000-0000-000000000001'),
  -- Critical-demo Potassium (Karthik active visit)
  ('11111111-2222-0000-0000-00000000000e','11111111-1111-1111-1111-111111111111','POTASSIUM','Serum Potassium','biochemistry','Serum',2.0,
   '22222222-0000-0000-0000-000000000004', 250.00,
   '3.5-5.0 mmol/L','3.5-5.0 mmol/L', 3.5, 5.0, 3.5, 5.0, 2.8, 6.0, 'mmol/L', 4, 'numeric', false, '44444444-0000-0000-0000-000000000001'),
  ('11111111-2222-0000-0000-00000000000f','11111111-1111-1111-1111-111111111111','SODIUM','Serum Sodium','biochemistry','Serum',2.0,
   null, 250.00, '135-145 mmol/L','135-145 mmol/L', 135.0, 145.0, 135.0, 145.0, 120.0, 160.0, 'mmol/L', 4, 'numeric', false, '44444444-0000-0000-0000-000000000001'),
  ('11111111-2222-0000-0000-000000000010','11111111-1111-1111-1111-111111111111','CALCIUM','Serum Calcium','biochemistry','Serum',2.0,
   null, 250.00, '8.5-10.5 mg/dL','8.5-10.5 mg/dL', 8.5, 10.5, 8.5, 10.5, 6.0, 13.0, 'mg/dL', 6, 'numeric', false, '44444444-0000-0000-0000-000000000001'),
  ('11111111-2222-0000-0000-000000000011','11111111-1111-1111-1111-111111111111','MAGNESIUM','Serum Magnesium','biochemistry','Serum',2.0,
   null, 250.00, '1.7-2.4 mg/dL','1.7-2.4 mg/dL', 1.7, 2.4, 1.7, 2.4, 1.0, 4.0, 'mg/dL', 6, 'numeric', false, '44444444-0000-0000-0000-000000000001'),
  ('11111111-2222-0000-0000-000000000012','11111111-1111-1111-1111-111111111111','T3','Triiodothyronine (T3)','endocrinology','Serum',2.0,
   null, 350.00, '0.8-2.0 ng/mL','0.8-2.0 ng/mL', 0.8, 2.0, 0.8, 2.0, null, null, 'ng/mL', 24, 'numeric', false, '44444444-0000-0000-0000-000000000001'),
  ('11111111-2222-0000-0000-000000000013','11111111-1111-1111-1111-111111111111','T4','Thyroxine (T4)','endocrinology','Serum',2.0,
   null, 350.00, '5-12 ug/dL','5-12 ug/dL', 5.0, 12.0, 5.0, 12.0, null, null, 'ug/dL', 24, 'numeric', false, '44444444-0000-0000-0000-000000000001'),
  ('11111111-2222-0000-0000-000000000014','11111111-1111-1111-1111-111111111111','TSH','Thyroid Stimulating Hormone','endocrinology','Serum',2.0,
   null, 350.00, '0.4-4.0 mIU/L','0.4-4.0 mIU/L', 0.4, 4.0, 0.4, 4.0, null, null, 'mIU/L', 24, 'numeric', false, '44444444-0000-0000-0000-000000000001'),
  ('11111111-2222-0000-0000-000000000015','11111111-1111-1111-1111-111111111111','VIT_D','25-OH Vitamin D','biochemistry','Serum',2.0,
   null, 1200.00, '30-100 ng/mL','30-100 ng/mL', 30.0, 100.0, 30.0, 100.0, null, null, 'ng/mL', 48, 'numeric', false, '44444444-0000-0000-0000-000000000001'),
  ('11111111-2222-0000-0000-000000000016','11111111-1111-1111-1111-111111111111','VIT_B12','Vitamin B12','biochemistry','Serum',2.0,
   null, 800.00, '200-900 pg/mL','200-900 pg/mL', 200.0, 900.0, 200.0, 900.0, null, null, 'pg/mL', 24, 'numeric', false, '44444444-0000-0000-0000-000000000001'),
  ('11111111-2222-0000-0000-000000000017','11111111-1111-1111-1111-111111111111','FERRITIN','Serum Ferritin','biochemistry','Serum',2.0,
   null, 700.00, '30-400 ng/mL','15-150 ng/mL', 30.0, 400.0, 15.0, 150.0, null, null, 'ng/mL', 24, 'numeric', false, '44444444-0000-0000-0000-000000000001'),
  ('11111111-2222-0000-0000-000000000018','11111111-1111-1111-1111-111111111111','IRON','Serum Iron','biochemistry','Serum',2.0,
   null, 400.00, '60-170 ug/dL','60-170 ug/dL', 60.0, 170.0, 60.0, 170.0, null, null, 'ug/dL', 12, 'numeric', false, '44444444-0000-0000-0000-000000000001'),
  ('11111111-2222-0000-0000-000000000019','11111111-1111-1111-1111-111111111111','FBS','Fasting Blood Sugar','biochemistry','Fluoride plasma',2.0,
   null, 100.00, '70-100 mg/dL','70-100 mg/dL', 70.0, 100.0, 70.0, 100.0, 40.0, 400.0, 'mg/dL', 2, 'numeric', true, '44444444-0000-0000-0000-000000000001'),
  ('11111111-2222-0000-0000-00000000001a','11111111-1111-1111-1111-111111111111','PPBS','Post-Prandial Blood Sugar','biochemistry','Fluoride plasma',2.0,
   null, 120.00, '< 140 mg/dL','< 140 mg/dL', 0.0, 140.0, 0.0, 140.0, 40.0, 400.0, 'mg/dL', 2, 'numeric', true, '44444444-0000-0000-0000-000000000001'),
  ('11111111-2222-0000-0000-00000000001b','11111111-1111-1111-1111-111111111111','PSA','Prostate Specific Antigen','biochemistry','Serum',2.0,
   null, 800.00, '< 4 ng/mL', null, 0.0, 4.0, null, null, null, null, 'ng/mL', 24, 'numeric', false, '44444444-0000-0000-0000-000000000001'),
  ('11111111-2222-0000-0000-00000000001c','11111111-1111-1111-1111-111111111111','COAG_PT','Prothrombin Time','hematology','Citrate plasma',2.0,
   null, 350.00, '11-14 sec','11-14 sec', 11.0, 14.0, 11.0, 14.0, null, 30.0, 'sec', 6, 'numeric', false, '44444444-0000-0000-0000-000000000001'),
  ('11111111-2222-0000-0000-00000000001d','11111111-1111-1111-1111-111111111111','COAG_INR','INR','hematology','Citrate plasma',2.0,
   null, 350.00, '0.9-1.1','0.9-1.1', 0.9, 1.1, 0.9, 1.1, null, 5.0, null, 6, 'numeric', false, '44444444-0000-0000-0000-000000000001'),
  ('11111111-2222-0000-0000-00000000001e','11111111-1111-1111-1111-111111111111','DENGUE_NS1','Dengue NS1 antigen','serology','Serum',2.0,
   null, 600.00, 'Negative', 'Negative', null, null, null, null, null, null, null, 6, 'positive_negative', false, '44444444-0000-0000-0000-000000000001');

-- A couple panels so the order screen has packages.
insert into lab_test_panels
  (tenant_id, panel_code, panel_name, test_ids, package_price, description, created_by)
values
  ('11111111-1111-1111-1111-111111111111','PNL-DIAB','Diabetes Panel',
   array['11111111-2222-0000-0000-000000000006','11111111-2222-0000-0000-000000000019','11111111-2222-0000-0000-00000000001a']::uuid[],
   850.00, 'HbA1c + FBS + PPBS', '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','PNL-THY','Thyroid Panel',
   array['11111111-2222-0000-0000-000000000012','11111111-2222-0000-0000-000000000013','11111111-2222-0000-0000-000000000014']::uuid[],
   900.00, 'T3 + T4 + TSH', '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','PNL-PREOP','Pre-Op Workup',
   array['11111111-2222-0000-0000-000000000001','11111111-2222-0000-0000-000000000003','11111111-2222-0000-0000-000000000004','11111111-2222-0000-0000-00000000001c','11111111-2222-0000-0000-00000000001d','11111111-2222-0000-0000-00000000000b','11111111-2222-0000-0000-00000000000c','11111111-2222-0000-0000-00000000000d']::uuid[],
   2200.00, 'Standard pre-operative workup', '44444444-0000-0000-0000-000000000001');

-- =====================================================================
-- SECTION 6 — Radiology procedures
-- =====================================================================
insert into radiology_procedures
  (id, tenant_id, procedure_code, test_name, modality, body_part,
   with_contrast, default_price, typical_duration_mins,
   requires_fasting, requires_radiologist_presence, created_by)
values
  ('11111111-3333-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','XR-KNE','X-Ray Knee AP/Lat','xray','knee',false,300.00,10,false,false,'44444444-0000-0000-0000-000000000001'),
  ('11111111-3333-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','XR-LSP','X-Ray Lumbar Spine AP/Lat','xray','lumbar_spine',false,350.00,15,false,false,'44444444-0000-0000-0000-000000000001'),
  ('11111111-3333-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','MR-LSP','MRI Lumbar Spine','mri','lumbar_spine',false,5500.00,30,false,true,'44444444-0000-0000-0000-000000000001'),
  ('11111111-3333-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','CT-LSP','CT Lumbar Spine','ct','lumbar_spine',false,3200.00,15,false,true,'44444444-0000-0000-0000-000000000001'),
  ('11111111-3333-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','USG-ABD','Ultrasound Abdomen','ultrasound','abdomen',false,800.00,20,true,true,'44444444-0000-0000-0000-000000000001'),
  ('11111111-3333-0000-0000-000000000006','11111111-1111-1111-1111-111111111111','XR-CHE','X-Ray Chest PA','xray','chest',false,250.00,5,false,false,'44444444-0000-0000-0000-000000000001'),
  ('11111111-3333-0000-0000-000000000007','11111111-1111-1111-1111-111111111111','CT-BRAIN','CT Brain Plain','ct','brain',false,2800.00,15,false,true,'44444444-0000-0000-0000-000000000001'),
  ('11111111-3333-0000-0000-000000000008','11111111-1111-1111-1111-111111111111','MR-BRAIN','MRI Brain','mri','brain',false,6500.00,40,false,true,'44444444-0000-0000-0000-000000000001'),
  ('11111111-3333-0000-0000-000000000009','11111111-1111-1111-1111-111111111111','USG-PELVIS','Ultrasound Pelvis','ultrasound','pelvis',false,900.00,20,true,true,'44444444-0000-0000-0000-000000000001'),
  ('11111111-3333-0000-0000-00000000000a','11111111-1111-1111-1111-111111111111','USG-WHOLE-ABD','Ultrasound Whole Abdomen','ultrasound','whole_abdomen',false,1200.00,30,true,true,'44444444-0000-0000-0000-000000000001'),
  ('11111111-3333-0000-0000-00000000000b','11111111-1111-1111-1111-111111111111','MAMMO-BIL','Mammography Bilateral','mammography','breast',false,1800.00,25,false,true,'44444444-0000-0000-0000-000000000001'),
  ('11111111-3333-0000-0000-00000000000c','11111111-1111-1111-1111-111111111111','XR-SHO','X-Ray Shoulder AP','xray','shoulder',false,300.00,10,false,false,'44444444-0000-0000-0000-000000000001'),
  ('11111111-3333-0000-0000-00000000000d','11111111-1111-1111-1111-111111111111','XR-HIP','X-Ray Hip AP/Lat','xray','hip',false,350.00,10,false,false,'44444444-0000-0000-0000-000000000001'),
  ('11111111-3333-0000-0000-00000000000e','11111111-1111-1111-1111-111111111111','MR-KNEE','MRI Knee','mri','knee',false,5800.00,30,false,true,'44444444-0000-0000-0000-000000000001');

-- =====================================================================
-- SECTION 7 — Diagnosis templates (schema has no prescription_templates;
-- diagnosis_templates is the closest concept — bundles diagnosis + Rx)
-- =====================================================================
insert into diagnosis_templates
  (tenant_id, template_name, department_id, specialty, icd10_code,
   diagnosis_text, template_json, default_advice, default_followup_days, created_by)
values
  ('11111111-1111-1111-1111-111111111111','Acute LBP — Mechanical','22222222-0000-0000-0000-000000000001','Orthopaedics','M54.5',
   'Acute mechanical low back pain',
   '{"medicines":[{"code":"MED-PCM500","dose":"1 tab","freq":"TDS","days":5},{"code":"MED-DICLO50","dose":"1 tab","freq":"BD","days":3},{"code":"MED-PAN40","dose":"1 tab","freq":"OD before food","days":5}],"investigations":["XR-LSP"]}'::jsonb,
   'Hot fomentation, posture advice. Avoid lifting >5kg.', 7, '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','Knee OA — Symptomatic','22222222-0000-0000-0000-000000000001','Orthopaedics','M17',
   'Osteoarthritis knee — symptomatic flare',
   '{"medicines":[{"code":"MED-ETO90","dose":"1 tab","freq":"OD","days":7},{"code":"MED-PAN40","dose":"1 tab","freq":"OD","days":7},{"code":"MED-CALD3","dose":"1 tab","freq":"OD","days":30}],"investigations":["XR-KNE"]}'::jsonb,
   'Quadriceps strengthening exercises. Weight reduction.', 14, '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','Fracture Forearm — Initial','22222222-0000-0000-0000-000000000001','Orthopaedics','S52',
   'Forearm fracture — closed, initial management',
   '{"medicines":[{"code":"MED-PCM500","dose":"1 tab","freq":"QID","days":5},{"code":"MED-TRAM50","dose":"1 cap","freq":"BD PRN","days":3}],"investigations":["XR-FOREARM"]}'::jsonb,
   'Above-elbow POP slab. Elevate limb. Review in 1 week.', 7, '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','URTI 5-day','22222222-0000-0000-0000-000000000003','General Medicine','J06.9',
   'Acute upper respiratory tract infection',
   '{"medicines":[{"code":"MED-PCM500","dose":"1 tab","freq":"QID PRN","days":5},{"code":"MED-CETZ10","dose":"1 tab","freq":"HS","days":5}]}'::jsonb,
   'Steam inhalation. Plenty of fluids. Return if fever > 102F or breathing difficulty.', 5, '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','UTI Female 7-day','22222222-0000-0000-0000-000000000003','General Medicine','N39.0',
   'Uncomplicated UTI — female adult',
   '{"medicines":[{"code":"MED-CIPRO500","dose":"1 tab","freq":"BD","days":5},{"code":"MED-PCM500","dose":"1 tab","freq":"TDS PRN","days":3}],"investigations":["URN"]}'::jsonb,
   'Increase oral fluids 2.5-3 L/day. Repeat culture if symptoms persist.', 7, '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','Acute Gastritis','22222222-0000-0000-0000-000000000003','General Medicine','K29.7',
   'Acute gastritis',
   '{"medicines":[{"code":"MED-PAN40","dose":"1 tab","freq":"OD","days":7},{"code":"MED-DOMP10","dose":"1 tab","freq":"TDS","days":5}]}'::jsonb,
   'Bland diet. Avoid spicy/oily food, NSAIDs, alcohol.', 7, '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','Hypertension — First Line','22222222-0000-0000-0000-000000000003','General Medicine','I10',
   'Essential hypertension',
   '{"medicines":[{"code":"MED-TELM40","dose":"1 tab","freq":"OD","days":30},{"code":"MED-AMLO5","dose":"1 tab","freq":"OD","days":30}],"investigations":["RFT","LIPID"]}'::jsonb,
   'Low-salt diet. Daily 30-min walk. BP monitoring twice weekly.', 30, '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','T2DM Newly Diagnosed','22222222-0000-0000-0000-000000000003','General Medicine','E11',
   'Type 2 diabetes mellitus — newly diagnosed',
   '{"medicines":[{"code":"MED-MET500","dose":"1 tab","freq":"BD after food","days":30}],"investigations":["HBA1C","FBS","PPBS","LIPID","RFT"]}'::jsonb,
   'Diet counselling. Daily walk 45 min. Glucometer SMBG twice/week.', 30, '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','Acute Migraine','22222222-0000-0000-0000-000000000003','General Medicine','G43',
   'Acute migraine attack',
   '{"medicines":[{"code":"MED-PCM500","dose":"1 tab","freq":"stat + Q6H PRN","days":2},{"code":"MED-DOMP10","dose":"1 tab","freq":"stat","days":1}]}'::jsonb,
   'Dark quiet room. Identify and avoid triggers. Return if frequency > 2/week.', 7, '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','Allergic Rhinitis','22222222-0000-0000-0000-000000000003','General Medicine','J30.4',
   'Allergic rhinitis',
   '{"medicines":[{"code":"MED-CETZ10","dose":"1 tab","freq":"OD HS","days":14},{"code":"MED-MONT10","dose":"1 tab","freq":"OD HS","days":14}]}'::jsonb,
   'Allergen avoidance. Saline nasal douche BD.', 14, '44444444-0000-0000-0000-000000000001');

-- =====================================================================
-- SECTION 8 — OP visits, queue, vitals, consultations, Rx, lab, radiology
-- =====================================================================
-- 8a. FE-pinned visits (today + recent past). Deterministic UUIDs so
-- consultations / lab orders / journey events below can reference.
insert into op_visits
  (id, tenant_id, op_number, patient_id, doctor_id, visit_date,
   token_number, chief_complaint, is_emergency, emergency_triage,
   current_state_code, created_by, created_at)
values
  -- 1. Karthik (ACTIVE — in_consultation 150)
  ('11111111-aaaa-0000-0000-000000000121','11111111-1111-1111-1111-111111111111','OP-2026-00121','aaaaaaaa-0000-0000-0000-000000000001',
   '44444444-0000-0000-0000-000000000002', current_date, 'OP-T-12','Lower back pain × 3 weeks',
   false, null, 150, '44444444-0000-0000-0000-000000000001', now() - interval '20 minutes'),
  -- 2. Meera (awaiting_doctor 140)
  ('11111111-aaaa-0000-0000-000000000122','11111111-1111-1111-1111-111111111111','OP-2026-00122','aaaaaaaa-0000-0000-0000-000000000002',
   '44444444-0000-0000-0000-000000000002', current_date, 'OP-T-13','Bilateral knee pain, swelling',
   false, null, 140, '44444444-0000-0000-0000-000000000001', now() - interval '18 minutes'),
  -- 3. Ramesh (emergency yellow, awaiting doctor)
  ('11111111-aaaa-0000-0000-000000000123','11111111-1111-1111-1111-111111111111','OP-2026-00123','aaaaaaaa-0000-0000-0000-000000000003',
   '44444444-0000-0000-0000-000000000002', current_date, 'OP-T-14','Acute lumbar radiculopathy',
   true, 'yellow', 140, '44444444-0000-0000-0000-000000000001', now() - interval '8 minutes'),
  -- 4. Aarav Sharma (emergency red, walk_in_arrived)
  ('11111111-aaaa-0000-0000-000000000124','11111111-1111-1111-1111-111111111111','OP-2026-00124','aaaaaaaa-0000-0000-0000-000000000004',
   '44444444-0000-0000-0000-000000000002', current_date, 'OP-T-15','Right forearm — fall from cycle',
   true, 'red', 100, '44444444-0000-0000-0000-000000000001', now() - interval '2 minutes'),
  -- 5. Lakshmi Narasimhan (registered 110)
  ('11111111-aaaa-0000-0000-000000000125','11111111-1111-1111-1111-111111111111','OP-2026-00125','aaaaaaaa-0000-0000-0000-000000000005',
   '44444444-0000-0000-0000-000000000002', current_date, 'OP-T-16','Hip pain — follow-up',
   false, null, 110, '44444444-0000-0000-0000-000000000001', now()),
  -- 6. Joseph Mathew (consultation_done 160)
  ('11111111-aaaa-0000-0000-000000000118','11111111-1111-1111-1111-111111111111','OP-2026-00118','aaaaaaaa-0000-0000-0000-000000000006',
   '44444444-0000-0000-0000-000000000002', current_date, 'OP-T-9','Shoulder impingement',
   false, null, 160, '44444444-0000-0000-0000-000000000001', now() - interval '90 minutes'),
  -- 7. Anita Reddy (doctor_review_pending 165, 6h ago)
  ('11111111-aaaa-0000-0000-000000000112','11111111-1111-1111-1111-111111111111','OP-2026-00112','aaaaaaaa-0000-0000-0000-000000000007',
   '44444444-0000-0000-0000-000000000002', current_date, 'OP-T-3','Post-op knee arthroscopy review',
   false, null, 165, '44444444-0000-0000-0000-000000000001', now() - interval '6 hours'),
  -- 8. Lakshmi (older — yesterday, lab in progress)
  ('11111111-aaaa-0000-0000-000000000099','11111111-1111-1111-1111-111111111111','OP-2026-00099','aaaaaaaa-0000-0000-0000-00000000000b',
   '44444444-0000-0000-0000-000000000010', current_date - interval '1 day', 'OP-T-22','HbA1c review',
   false, null, 165, '44444444-0000-0000-0000-000000000001', now() - interval '24 hours'),
  -- 9. Karthik historical 2025
  ('11111111-aaaa-0000-0000-000000002211','11111111-1111-1111-1111-111111111111','OP-2025-02211','aaaaaaaa-0000-0000-0000-000000000001',
   '44444444-0000-0000-0000-000000000002', '2025-11-04', 'OP-T-31','Back pain — follow-up after physio',
   false, null, 600, '44444444-0000-0000-0000-000000000001', '2025-11-04 10:05:00+05:30'),
  ('11111111-aaaa-0000-0000-000000001180','11111111-1111-1111-1111-111111111111','OP-2025-01180','aaaaaaaa-0000-0000-0000-000000000001',
   '44444444-0000-0000-0000-000000000002', '2025-06-22', 'OP-T-18','LBP initial visit',
   false, null, 600, '44444444-0000-0000-0000-000000000001', '2025-06-22 11:30:00+05:30'),
  ('11111111-aaaa-0000-0000-000000004902','11111111-1111-1111-1111-111111111111','OP-2024-04902','aaaaaaaa-0000-0000-0000-000000000001',
   '44444444-0000-0000-0000-000000000010', '2024-12-10', 'OP-T-44','Annual exec health check',
   false, null, 600, '44444444-0000-0000-0000-000000000001', '2024-12-10 09:10:00+05:30');

-- 8b. Today's live queue (10 entries, linked to today's visits).
insert into patient_queue
  (tenant_id, patient_id, op_visit_id, station_id, state_code, status,
   priority, token_number, queue_position, entered_at, called_at)
values
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','11111111-aaaa-0000-0000-000000000121',4,150,'in_service','normal','OP-T-12',1, now() - interval '20 min', now() - interval '15 min'),
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000002','11111111-aaaa-0000-0000-000000000122',4,140,'waiting','normal','OP-T-13',2, now() - interval '18 min', null),
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000003','11111111-aaaa-0000-0000-000000000123',4,140,'waiting','urgent','OP-T-14',3, now() - interval '8 min', null),
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000004','11111111-aaaa-0000-0000-000000000124',9,100,'waiting','emergency','OP-T-15',1, now() - interval '2 min', null),
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000005','11111111-aaaa-0000-0000-000000000125',1,110,'waiting','normal','OP-T-16',1, now(), null),
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000006','11111111-aaaa-0000-0000-000000000118',8,500,'waiting','normal','OP-T-9',1, now() - interval '5 min', null),
  ('11111111-1111-1111-1111-111111111111',(select id from patients where uhid='KH-2026-00050'),null,3,120,'waiting','normal','OP-T-17',1, now() - interval '12 min', null),
  ('11111111-1111-1111-1111-111111111111',(select id from patients where uhid='KH-2026-00056'),null,3,120,'waiting','normal','OP-T-18',2, now() - interval '7 min', null),
  ('11111111-1111-1111-1111-111111111111',(select id from patients where uhid='KH-2026-00062'),null,12,140,'waiting','normal','OP-T-19',1, now() - interval '4 min', null),
  ('11111111-1111-1111-1111-111111111111',(select id from patients where uhid='KH-2025-04510'),null,12,140,'waiting','normal','OP-T-20',2, now() - interval '2 min', null);

-- 8c. Bulk historical visits — 109 across the past 6 months (~80 over
-- months 1-5, ~30 over the last month). One row per patient-week pair
-- via generate_series. Mix of doctors, all closed (state 600).
insert into op_visits
  (tenant_id, op_number, patient_id, doctor_id, visit_date,
   token_number, chief_complaint, is_emergency, current_state_code,
   created_by, created_at)
select
  '11111111-1111-1111-1111-111111111111',
  'OP-2025-' || lpad((1000 + row_number() over ())::text, 5, '0'),
  p.id,
  d.id,
  (current_date - (g * interval '7 days'))::date,
  'OP-T-' || (50 + row_number() over ())::text,
  cc.complaint,
  false, 600,
  '44444444-0000-0000-0000-000000000001',
  (current_date - (g * interval '7 days'))::timestamptz + (9 + (random()*7)::int) * interval '1 hour'
from generate_series(1, 26) g
cross join lateral (
  select id from patients
   where tenant_id='11111111-1111-1111-1111-111111111111'
     and uhid not in ('KH-2026-00045','KH-2026-00048','KH-2026-00049')
   order by md5(g::text || id::text) limit 4
) p
cross join lateral (
  select id from users
   where id in ('44444444-0000-0000-0000-000000000002'::uuid,
                '44444444-0000-0000-0000-000000000010'::uuid,
                '44444444-0000-0000-0000-000000000011'::uuid,
                '44444444-0000-0000-0000-000000000012'::uuid,
                '44444444-0000-0000-0000-000000000014'::uuid)
   order by md5(g::text || p.id::text) limit 1
) d
cross join lateral (
  select complaint from (values
    ('Low back pain'),('Fever × 2 days'),('Knee pain'),('Cough and cold'),
    ('Acidity / heartburn'),('BP follow-up'),('Diabetes follow-up'),
    ('Headache'),('Skin rash'),('Wound dressing'),('Abdominal pain'),
    ('Joint pain — multiple sites'),('Giddiness'),('Routine check-up')
  ) as cc(complaint)
  order by md5(g::text || p.id::text || cc.complaint) limit 1
) cc
limit 109;

-- 8d. Vitals — one row per visit (FE-pinned + historical).
insert into vitals
  (tenant_id, patient_id, op_visit_id,
   temperature_f, weight_kg, height_cm,
   bp_systolic, bp_diastolic, spo2, pulse_rate, respiratory_rate,
   pain_score, notes, recorded_by, recorded_at)
select
  '11111111-1111-1111-1111-111111111111',
  v.patient_id, v.id,
  98.0 + (random()*2.5)::numeric(3,1),
  50 + (random()*40)::numeric(4,1),
  150 + (random()*30)::numeric(4,1),
  110 + (random()*40)::int,
  70  + (random()*20)::int,
  95  + (random()*5)::int,
  68  + (random()*30)::int,
  14  + (random()*6)::int,
  (random()*6)::int,
  case when random() < 0.15 then 'Patient reports mild dizziness on standing.' else null end,
  '44444444-0000-0000-0000-000000000001',
  v.created_at + interval '5 min'
from op_visits v
where v.tenant_id = '11111111-1111-1111-1111-111111111111';

-- 8e. Consultations — one per visit. Today's Karthik visit stays
-- UNLOCKED; everything past gets locked_at set. diagnoses is a jsonb[].
insert into consultations
  (tenant_id, op_visit_id, patient_id, doctor_id,
   chief_complaint, history_of_present_illness, examination_findings,
   diagnoses, symptoms, clinical_notes, advice,
   next_action, follow_up_required, follow_up_date,
   locked_at, created_by, created_at)
select
  '11111111-1111-1111-1111-111111111111',
  v.id, v.patient_id, v.doctor_id,
  v.chief_complaint,
  'HPI as per chief complaint. Onset gradual. No red-flag symptoms.',
  '{"general":"Conscious, oriented","systemic":"Within normal limits"}'::jsonb,
  array[case
    when v.chief_complaint ilike '%back pain%' then '{"icd10":"M54.5","text":"Low back pain","isPrimary":true}'::jsonb
    when v.chief_complaint ilike '%knee%'      then '{"icd10":"M17","text":"Osteoarthritis knee","isPrimary":true}'::jsonb
    when v.chief_complaint ilike '%fever%'     then '{"icd10":"R50.9","text":"Fever, unspecified","isPrimary":true}'::jsonb
    when v.chief_complaint ilike '%cough%'     then '{"icd10":"J06.9","text":"Acute URTI","isPrimary":true}'::jsonb
    when v.chief_complaint ilike '%acid%' or v.chief_complaint ilike '%heart%' then '{"icd10":"K30","text":"Functional dyspepsia","isPrimary":true}'::jsonb
    when v.chief_complaint ilike '%bp%'        then '{"icd10":"I10","text":"Essential hypertension","isPrimary":true}'::jsonb
    when v.chief_complaint ilike '%diab%'      then '{"icd10":"E11","text":"Type 2 DM","isPrimary":true}'::jsonb
    when v.chief_complaint ilike '%headache%'  then '{"icd10":"G43","text":"Migraine","isPrimary":true}'::jsonb
    when v.chief_complaint ilike '%skin%' or v.chief_complaint ilike '%rash%' then '{"icd10":"L30","text":"Dermatitis NOS","isPrimary":true}'::jsonb
    when v.chief_complaint ilike '%shoulder%'  then '{"icd10":"M75","text":"Shoulder impingement","isPrimary":true}'::jsonb
    when v.chief_complaint ilike '%hip%'       then '{"icd10":"M25.55","text":"Hip pain","isPrimary":true}'::jsonb
    when v.chief_complaint ilike '%forearm%'   then '{"icd10":"S52","text":"Forearm fracture","isPrimary":true}'::jsonb
    when v.chief_complaint ilike '%HbA1c%' or v.chief_complaint ilike '%review%' then '{"icd10":"E11","text":"T2DM follow-up","isPrimary":true}'::jsonb
    else '{"icd10":"Z00.0","text":"Routine check","isPrimary":true}'::jsonb
  end]::jsonb[],
  v.chief_complaint,
  'Plan: symptomatic management. Investigation if not improving.',
  'Rest, hydration, follow advice. Return if worsening.',
  case
    when v.current_state_code in (140,150) then 'prescription_only'
    when v.current_state_code = 165 then 'lab_ordered'
    else 'prescription_only'
  end,
  random() < 0.3, (v.visit_date + interval '7 days')::date,
  case when v.op_number = 'OP-2026-00121' then null else v.created_at + interval '15 minutes' end,
  v.doctor_id, v.created_at + interval '10 minutes'
from op_visits v
where v.tenant_id = '11111111-1111-1111-1111-111111111111';

-- 8f. Prescriptions header (one per consultation). Status = 'active'
-- for past visits; 'draft' for Karthik's active one.
insert into prescriptions
  (tenant_id, consultation_id, patient_id, doctor_id, status,
   locked_at, created_by, created_at)
select
  '11111111-1111-1111-1111-111111111111',
  c.id, c.patient_id, c.doctor_id,
  case when c.locked_at is null then 'draft' else 'active' end,
  c.locked_at, c.doctor_id, c.created_at + interval '12 minutes'
from consultations c
where c.tenant_id = '11111111-1111-1111-1111-111111111111';

-- 8g. Prescription items — 2 to 3 per prescription, pulled from a small
-- rotating catalogue keyed off the row number for deterministic mix.
-- Skip drafts so item authoring matches the locked Rx semantics.
insert into prescription_items
  (prescription_id, medicine_id, medicine_name_snapshot, dosage, frequency,
   duration_days, quantity_prescribed, dispensed_qty, sequence_no)
select
  p.id, m.id, m.medicine_name, '1 tab', m.freq,
  m.dd, m.dd * m.tpd,
  case when random() < 0.7 then m.dd * m.tpd else (m.dd * m.tpd) / 2 end,
  m.seq
from prescriptions p
join (
  values
    ('dddddddd-0000-0000-0000-000000000001'::uuid, 'Paracetamol 500mg',  'TDS',         5, 3, 1),
    ('dddddddd-0000-0000-0000-000000000005'::uuid, 'Pantoprazole 40mg',  'OD before food', 5, 1, 2),
    ('dddddddd-0000-0000-0000-000000000004'::uuid, 'Diclofenac 50mg',    'BD',          3, 2, 3)
) as m(id, medicine_name, freq, dd, tpd, seq) on true
where p.status = 'active';

-- A second pass — 2 items per Rx for the consultations whose ICD-10 is
-- hypertension/T2DM, to vary the catalog a bit.
insert into prescription_items
  (prescription_id, medicine_id, medicine_name_snapshot, dosage, frequency,
   duration_days, quantity_prescribed, dispensed_qty, sequence_no)
select
  p.id,
  'dddddddd-0000-0000-0000-000000000022'::uuid, 'Telmisartan 40mg', '1 tab', 'OD', 30, 30,
  case when random() < 0.7 then 30 else 15 end, 10
from prescriptions p
join consultations c on c.id = p.consultation_id
where p.status = 'active'
  and exists (select 1 from unnest(c.diagnoses) d where d->>'icd10' = 'I10')
union all
select
  p.id, 'dddddddd-0000-0000-0000-000000000009'::uuid, 'Metformin 500mg', '1 tab', 'BD', 30, 60,
  case when random() < 0.7 then 60 else 30 end, 10
from prescriptions p
join consultations c on c.id = p.consultation_id
where p.status = 'active'
  and exists (select 1 from unnest(c.diagnoses) d where d->>'icd10' = 'E11');

-- =====================================================================
-- SECTION 9 — Lab orders / items / samples / results
-- =====================================================================
-- 9a. FE-pinned lab orders for Karthik's active visit (3 tests:
-- CBC in_progress, POTASSIUM critical_high reported, CRP high reported).
insert into lab_orders
  (id, tenant_id, order_number, patient_id, op_visit_id, consultation_id,
   doctor_id, priority, status, ordered_at, created_by)
values
  ('11111111-bbbb-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','LAB-2026-00121-A',
   'aaaaaaaa-0000-0000-0000-000000000001','11111111-aaaa-0000-0000-000000000121',
   (select id from consultations where op_visit_id='11111111-aaaa-0000-0000-000000000121'),
   '44444444-0000-0000-0000-000000000002','urgent','partially_reported', now() - interval '90 minutes',
   '44444444-0000-0000-0000-000000000002');

insert into lab_order_items
  (id, lab_order_id, lab_test_id, status, sequence_no)
values
  ('11111111-bbbb-1111-0000-000000000001','11111111-bbbb-0000-0000-000000000001','11111111-2222-0000-0000-000000000001','in_progress',1),
  ('11111111-bbbb-1111-0000-000000000002','11111111-bbbb-0000-0000-000000000001','11111111-2222-0000-0000-00000000000e','reported',2),
  ('11111111-bbbb-1111-0000-000000000003','11111111-bbbb-0000-0000-000000000001','11111111-2222-0000-0000-000000000002','reported',3);

insert into lab_samples
  (tenant_id, sample_barcode, patient_id, lab_order_id, sample_type,
   status, collected_by, collected_at, received_by, received_at)
values
  ('11111111-1111-1111-1111-111111111111','S-2026-001','aaaaaaaa-0000-0000-0000-000000000001','11111111-bbbb-0000-0000-000000000001',
   'EDTA whole blood','processing','44444444-0000-0000-0000-000000000001',
   now() - interval '85 minutes','44444444-0000-0000-0000-000000000001', now() - interval '80 minutes'),
  ('11111111-1111-1111-1111-111111111111','S-2026-002','aaaaaaaa-0000-0000-0000-000000000001','11111111-bbbb-0000-0000-000000000001',
   'Serum','processed','44444444-0000-0000-0000-000000000001',
   now() - interval '85 minutes','44444444-0000-0000-0000-000000000001', now() - interval '80 minutes');

-- Results: critical Potassium 6.4 + high CRP 87 mg/L. value_numeric set
-- so trigger flags it; we explicitly set release_status / verified_by.
insert into lab_results
  (tenant_id, lab_order_item_id, value, value_numeric, unit, flag,
   method, release_status, performed_by, verified_by, verified_at, reported_at,
   created_by, approval_status, approved_by, approved_at)
values
  ('11111111-1111-1111-1111-111111111111','11111111-bbbb-1111-0000-000000000002',
   '6.4', 6.4, 'mmol/L', 'critical_high', 'ISE',
   'verified','44444444-0000-0000-0000-000000000001','44444444-0000-0000-0000-000000000001',
   now() - interval '50 minutes', now() - interval '55 minutes',
   '44444444-0000-0000-0000-000000000001','approved','44444444-0000-0000-0000-000000000001', now() - interval '50 minutes'),
  ('11111111-1111-1111-1111-111111111111','11111111-bbbb-1111-0000-000000000003',
   '87.0', 87.0, 'mg/L', 'high', 'Latex agglutination',
   'verified','44444444-0000-0000-0000-000000000001','44444444-0000-0000-0000-000000000001',
   now() - interval '40 minutes', now() - interval '45 minutes',
   '44444444-0000-0000-0000-000000000001','approved','44444444-0000-0000-0000-000000000001', now() - interval '40 minutes');

-- 9b. Bulk historical lab orders — ~1 in 3 past visits gets a 2-test
-- order (CBC + LFT, or HBA1C + RFT). Fully reported so the FE has
-- chargeable + viewable history.
insert into lab_orders
  (tenant_id, order_number, patient_id, op_visit_id, consultation_id,
   doctor_id, priority, status, ordered_at, completed_at, created_by)
select
  '11111111-1111-1111-1111-111111111111',
  'LAB-' || to_char(v.visit_date, 'YYYY') || '-' || lpad(row_number() over ()::text, 5, '0'),
  v.patient_id, v.id,
  (select id from consultations where op_visit_id = v.id),
  v.doctor_id, 'routine', 'reported',
  v.created_at + interval '20 minutes', v.created_at + interval '4 hours',
  v.doctor_id
from op_visits v
where v.tenant_id = '11111111-1111-1111-1111-111111111111'
  and v.current_state_code = 600
  and md5(v.id::text)::text < 'a';  -- ~37 % of historical visits

-- One CBC item per bulk lab order.
insert into lab_order_items
  (lab_order_id, lab_test_id, status, sequence_no)
select lo.id, '11111111-2222-0000-0000-000000000001', 'reported', 1
from lab_orders lo
where lo.order_number ~ '^LAB-(2025|2026)-[0-9]{5}$';

-- One CBC sample per bulk order, accepted.
insert into lab_samples
  (tenant_id, sample_barcode, patient_id, lab_order_id, sample_type,
   status, collected_by, collected_at, received_by, received_at)
select
  '11111111-1111-1111-1111-111111111111',
  'S-' || lo.order_number,
  lo.patient_id, lo.id, 'EDTA whole blood', 'processed',
  '44444444-0000-0000-0000-000000000001', lo.ordered_at + interval '15 minutes',
  '44444444-0000-0000-0000-000000000001', lo.ordered_at + interval '20 minutes'
from lab_orders lo
where lo.order_number ~ '^LAB-(2025|2026)-[0-9]{5}$';

-- Results — Hb values normally distributed around 13. Flag computed by trigger.
insert into lab_results
  (tenant_id, lab_order_item_id, value, value_numeric, unit, flag,
   method, release_status, performed_by, verified_by, verified_at, reported_at,
   created_by, approval_status, approved_by, approved_at)
select
  '11111111-1111-1111-1111-111111111111', oi.id,
  to_char(11 + random()*5, 'FM99.9'),
  (11 + random()*5)::numeric(12,4),
  'g/dL', 'normal', 'Coulter',
  'verified','44444444-0000-0000-0000-000000000001','44444444-0000-0000-0000-000000000001',
  lo.completed_at - interval '30 minutes', lo.completed_at,
  '44444444-0000-0000-0000-000000000001','approved','44444444-0000-0000-0000-000000000001', lo.completed_at
from lab_order_items oi
join lab_orders lo on lo.id = oi.lab_order_id
where lo.order_number ~ '^LAB-(2025|2026)-[0-9]{5}$';

-- One critical low Sodium + one critical high Glucose for the ACK list demo.
insert into lab_orders
  (id, tenant_id, order_number, patient_id, doctor_id, priority, status,
   ordered_at, completed_at, created_by)
values
  ('11111111-bbbb-0000-0000-000000000099','11111111-1111-1111-1111-111111111111','LAB-2026-CRIT1',
   'aaaaaaaa-0000-0000-0000-00000000000a','44444444-0000-0000-0000-000000000010',
   'urgent','reported', now() - interval '2 days', now() - interval '2 days',
   '44444444-0000-0000-0000-000000000010'),
  ('11111111-bbbb-0000-0000-000000000098','11111111-1111-1111-1111-111111111111','LAB-2026-CRIT2',
   (select id from patients where uhid='KH-2026-00056'),'44444444-0000-0000-0000-000000000010',
   'urgent','reported', now() - interval '5 days', now() - interval '5 days',
   '44444444-0000-0000-0000-000000000010');

insert into lab_order_items
  (id, lab_order_id, lab_test_id, status, sequence_no)
values
  ('11111111-bbbb-1111-0000-000000000099','11111111-bbbb-0000-0000-000000000099','11111111-2222-0000-0000-00000000000f','reported',1),
  ('11111111-bbbb-1111-0000-000000000098','11111111-bbbb-0000-0000-000000000098','11111111-2222-0000-0000-000000000007','reported',1);

insert into lab_samples
  (tenant_id, sample_barcode, patient_id, lab_order_id, sample_type,
   status, collected_by, collected_at, received_by, received_at)
values
  ('11111111-1111-1111-1111-111111111111','S-CRIT-001','aaaaaaaa-0000-0000-0000-00000000000a','11111111-bbbb-0000-0000-000000000099','Serum','processed','44444444-0000-0000-0000-000000000001', now() - interval '2 days', '44444444-0000-0000-0000-000000000001', now() - interval '2 days'),
  ('11111111-1111-1111-1111-111111111111','S-CRIT-002',(select id from patients where uhid='KH-2026-00056'),'11111111-bbbb-0000-0000-000000000098','Fluoride plasma','processed','44444444-0000-0000-0000-000000000001', now() - interval '5 days', '44444444-0000-0000-0000-000000000001', now() - interval '5 days');

insert into lab_results
  (tenant_id, lab_order_item_id, value, value_numeric, unit, flag,
   method, release_status, performed_by, verified_by, verified_at, reported_at,
   created_by, approval_status, approved_by, approved_at)
values
  ('11111111-1111-1111-1111-111111111111','11111111-bbbb-1111-0000-000000000099',
   '118', 118.0, 'mmol/L', 'critical_low', 'ISE',
   'verified','44444444-0000-0000-0000-000000000001','44444444-0000-0000-0000-000000000001',
   now() - interval '2 days', now() - interval '2 days',
   '44444444-0000-0000-0000-000000000001','approved','44444444-0000-0000-0000-000000000001', now() - interval '2 days'),
  ('11111111-1111-1111-1111-111111111111','11111111-bbbb-1111-0000-000000000098',
   '420', 420.0, 'mg/dL', 'critical_high', 'GOD-POD',
   'verified','44444444-0000-0000-0000-000000000001','44444444-0000-0000-0000-000000000001',
   now() - interval '5 days', now() - interval '5 days',
   '44444444-0000-0000-0000-000000000001','approved','44444444-0000-0000-0000-000000000001', now() - interval '5 days');

-- 9c. One rejected sample + recollection for QA demo.
insert into lab_orders
  (id, tenant_id, order_number, patient_id, doctor_id, priority, status,
   ordered_at, created_by)
values
  ('11111111-bbbb-0000-0000-000000000050','11111111-1111-1111-1111-111111111111','LAB-2026-RJ-1',
   'aaaaaaaa-0000-0000-0000-000000000007','44444444-0000-0000-0000-000000000002',
   'routine','sample_collection', now() - interval '3 hours',
   '44444444-0000-0000-0000-000000000002');

insert into lab_order_items
  (lab_order_id, lab_test_id, status, sequence_no)
values
  ('11111111-bbbb-0000-0000-000000000050','11111111-2222-0000-0000-000000000004','recollection_pending', 1);

insert into lab_samples
  (id, tenant_id, sample_barcode, patient_id, lab_order_id, sample_type,
   status, collected_by, collected_at, rejected_at, rejected_by, rejection_reason)
values
  ('11111111-bbbb-2222-0000-000000000050','11111111-1111-1111-1111-111111111111','S-RJ-001',
   'aaaaaaaa-0000-0000-0000-000000000007','11111111-bbbb-0000-0000-000000000050','Serum',
   'rejected','44444444-0000-0000-0000-000000000001', now() - interval '2 hours 45 minutes',
   now() - interval '2 hours 30 minutes','44444444-0000-0000-0000-000000000001',
   'Hemolysed sample — recollection required.');

-- =====================================================================
-- SECTION 10 — Radiology orders / studies / reports
-- =====================================================================
-- 10a. FE-pinned XR-LSP for Karthik (reported with disc-spaces impression)
insert into radiology_orders
  (id, tenant_id, order_number, patient_id, op_visit_id, consultation_id,
   doctor_id, radiology_procedure_id, clinical_question, priority,
   status, ordered_at, imaging_completed_at, released_at, created_by)
values
  ('11111111-cccc-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','RAD-2026-00121-A',
   'aaaaaaaa-0000-0000-0000-000000000001','11111111-aaaa-0000-0000-000000000121',
   (select id from consultations where op_visit_id='11111111-aaaa-0000-0000-000000000121'),
   '44444444-0000-0000-0000-000000000002','11111111-3333-0000-0000-000000000002',
   'r/o disc prolapse, evaluate disc spaces','urgent',
   'released', now() - interval '85 minutes', now() - interval '70 minutes',
   now() - interval '60 minutes','44444444-0000-0000-0000-000000000002');

insert into radiology_studies
  (id, tenant_id, radiology_order_id, study_uid, accession_number,
   modality_snapshot, body_part_snapshot, technique, images_count,
   pacs_archive_status, technician_id, study_started_at, study_completed_at)
values
  ('11111111-cccc-1111-0000-000000000001','11111111-1111-1111-1111-111111111111','11111111-cccc-0000-0000-000000000001',
   '1.2.840.113619.2.1234.5678.20260511.121','ACC-2026-00121-A',
   'xray','lumbar_spine','AP + Lateral, standing',2,
   'archived','44444444-0000-0000-0000-000000000001',
   now() - interval '78 minutes', now() - interval '70 minutes');

insert into radiology_reports
  (tenant_id, radiology_order_id, study_id, findings, impression, recommendation,
   reported_by_radiologist_id, dictated_at, release_status, approval_status,
   approved_by, approved_at, uploaded_by, uploaded_at)
values
  ('11111111-1111-1111-1111-111111111111','11111111-cccc-0000-0000-000000000001','11111111-cccc-1111-0000-000000000001',
   'Lumbar vertebrae aligned. Mild reduction of L4-L5 and L5-S1 disc spaces. Anterior osteophytes at L4-L5.',
   'Mild lumbar spondylosis with reduced disc spaces at L4-L5 and L5-S1. Disc prolapse cannot be excluded — clinical correlation suggested. Consider MRI if neurological symptoms persist.',
   'MRI lumbar spine if symptoms persist > 2 weeks.',
   '44444444-0000-0000-0000-000000000001', now() - interval '65 minutes',
   'released','approved','44444444-0000-0000-0000-000000000001', now() - interval '60 minutes',
   '44444444-0000-0000-0000-000000000001', now() - interval '70 minutes');

-- 10b. Bulk historical radiology — XR-CHE / USG-ABD across visits.
insert into radiology_orders
  (tenant_id, order_number, patient_id, op_visit_id, consultation_id, doctor_id,
   radiology_procedure_id, priority, status, ordered_at, imaging_completed_at,
   released_at, created_by)
select
  '11111111-1111-1111-1111-111111111111',
  'RAD-' || to_char(v.visit_date, 'YYYY') || '-' || lpad(row_number() over ()::text, 5, '0'),
  v.patient_id, v.id,
  (select id from consultations where op_visit_id = v.id),
  v.doctor_id,
  case when md5(v.id::text)::text > 'k'
       then '11111111-3333-0000-0000-000000000006'::uuid    -- XR-CHE
       else '11111111-3333-0000-0000-000000000005'::uuid end, -- USG-ABD
  'routine','released',
  v.created_at + interval '25 minutes', v.created_at + interval '90 minutes',
  v.created_at + interval '2 hours', v.doctor_id
from op_visits v
where v.tenant_id = '11111111-1111-1111-1111-111111111111'
  and v.current_state_code = 600
  and md5(v.id::text)::text < '4';  -- ~25 of the historical visits

insert into radiology_studies
  (tenant_id, radiology_order_id, study_uid, accession_number,
   modality_snapshot, body_part_snapshot, images_count, pacs_archive_status,
   technician_id, study_started_at, study_completed_at)
select
  '11111111-1111-1111-1111-111111111111', r.id,
  '1.2.840.99999.' || replace(r.id::text, '-', ''),
  'ACC-' || r.order_number,
  case when rp.procedure_code like 'XR-%' then 'xray' else 'ultrasound' end,
  rp.body_part,
  case when rp.procedure_code like 'XR-%' then 1 else 8 end,
  'archived', '44444444-0000-0000-0000-000000000001',
  r.ordered_at + interval '15 minutes', r.imaging_completed_at
from radiology_orders r
join radiology_procedures rp on rp.id = r.radiology_procedure_id
where r.order_number ~ '^RAD-(2025|2026)-[0-9]{5}$';

insert into radiology_reports
  (tenant_id, radiology_order_id, findings, impression, recommendation,
   reported_by_radiologist_id, dictated_at, release_status, approval_status,
   approved_by, approved_at, uploaded_by, uploaded_at)
select
  '11111111-1111-1111-1111-111111111111', r.id,
  'Findings within normal limits.',
  'No acute abnormality.',
  null, '44444444-0000-0000-0000-000000000001',
  r.released_at - interval '30 minutes', 'released','approved',
  '44444444-0000-0000-0000-000000000001', r.released_at,
  '44444444-0000-0000-0000-000000000001', r.released_at - interval '20 minutes'
from radiology_orders r
where r.order_number ~ '^RAD-(2025|2026)-[0-9]{5}$';

-- =====================================================================
-- SECTION 11 — Doctor recommendations
-- =====================================================================
-- ~30 mixed recs across past visits + Karthik's active visit.
insert into doctor_recommendations
  (tenant_id, consultation_id, patient_id, recommendation_type,
   notes, priority, status, lab_order_id, radiology_order_id, created_by, created_at)
values
  -- Karthik active visit: physio referral
  ('11111111-1111-1111-1111-111111111111',
   (select id from consultations where op_visit_id='11111111-aaaa-0000-0000-000000000121'),
   'aaaaaaaa-0000-0000-0000-000000000001','physio',
   '10 sessions of lumbar physiotherapy — start after 1 week.',
   'routine','open', null, null,
   '44444444-0000-0000-0000-000000000002', now() - interval '10 minutes'),
  ('11111111-1111-1111-1111-111111111111',
   (select id from consultations where op_visit_id='11111111-aaaa-0000-0000-000000000121'),
   'aaaaaaaa-0000-0000-0000-000000000001','radiology',
   'XR-LSP ordered — see imaging.','urgent','completed',
   null, '11111111-cccc-0000-0000-000000000001',
   '44444444-0000-0000-0000-000000000002', now() - interval '85 minutes'),
  ('11111111-1111-1111-1111-111111111111',
   (select id from consultations where op_visit_id='11111111-aaaa-0000-0000-000000000121'),
   'aaaaaaaa-0000-0000-0000-000000000001','lab',
   'CBC + Potassium + CRP ordered.','urgent','completed',
   '11111111-bbbb-0000-0000-000000000001', null,
   '44444444-0000-0000-0000-000000000002', now() - interval '90 minutes'),
  -- Joseph active follow-up: surgery referral
  ('11111111-1111-1111-1111-111111111111',
   (select id from consultations where op_visit_id='11111111-aaaa-0000-0000-000000000118'),
   'aaaaaaaa-0000-0000-0000-000000000006','specialist_referral',
   'Refer to Sports Medicine for shoulder impingement evaluation.',
   'routine','open', null, null,
   '44444444-0000-0000-0000-000000000002', now() - interval '70 minutes'),
  -- Ramesh emergency yellow: admission rec
  ('11111111-1111-1111-1111-111111111111',
   (select id from consultations where op_visit_id='11111111-aaaa-0000-0000-000000000123'),
   'aaaaaaaa-0000-0000-0000-000000000003','admission',
   'Admit for IV analgesia and observation — query cauda equina.',
   'stat','open', null, null,
   '44444444-0000-0000-0000-000000000002', now() - interval '5 minutes');

-- 25 more — distributed mix across older closed consultations.
insert into doctor_recommendations
  (tenant_id, consultation_id, patient_id, recommendation_type,
   notes, priority, status, created_by, created_at)
select
  '11111111-1111-1111-1111-111111111111',
  c.id, c.patient_id,
  case (row_number() over () % 5)
    when 0 then 'follow_up'
    when 1 then 'physio'
    when 2 then 'specialist_referral'
    when 3 then 'lab'
    else        'radiology'
  end,
  'Routine recommendation captured during visit.', 'routine','completed',
  c.doctor_id, c.created_at + interval '20 minutes'
from consultations c
where c.locked_at is not null
  and md5(c.id::text)::text < '5'
limit 25;

-- =====================================================================
-- SECTION 12 — patient_journey_events (~700 rows)
-- =====================================================================
-- 6 events per closed visit (arrived → vitals → in_consultation →
--  lab_pending → in_consultation → consultation_done). Timestamps relative
-- to the visit's created_at. Triggers on the table compute
-- duration_in_prev_state_seconds + sync op_visits.current_state_code.
--
-- IMPORTANT: the fn_sync_op_visit_state trigger will overwrite
-- op_visits.current_state_code on every insert. Past visits are
-- already 600 so they'll end at 600 after the final event below.
-- Today's visits (Karthik et al.) are intentionally NOT included
-- in this bulk insert so their current_state_code stays as initialised.
insert into patient_journey_events
  (tenant_id, patient_id, op_visit_id, from_state_code, to_state_code,
   station_id, triggered_by_user_id, reason, occurred_at)
select
  '11111111-1111-1111-1111-111111111111', v.patient_id, v.id,
  s.from_state, s.to_state, s.station,
  '44444444-0000-0000-0000-000000000001', s.reason,
  v.created_at + s.offset_min * interval '1 minute'
from op_visits v
cross join (values
  (null,     100, 1,  'Walk-in arrival',                       0),
  (100::int, 110, 1,  'Registered at front desk',              4),
  (110::int, 120, 3,  'Queued at vitals',                      6),
  (120::int, 130, 3,  'Vitals captured',                       8),
  (130::int, 150, 4,  'In consultation',                      22),
  (150::int, 600, 4,  'Consultation closed (terminal)',      110)
) as s(from_state, to_state, station, reason, offset_min)
where v.tenant_id = '11111111-1111-1111-1111-111111111111'
  and v.current_state_code = 600;  -- only closed historicals

-- Karthik's active visit gets its real-world journey (only up to in_consultation;
-- the fn_sync_op_visit_state trigger will leave op_visits.current_state_code at 150).
insert into patient_journey_events
  (tenant_id, patient_id, op_visit_id, from_state_code, to_state_code,
   station_id, triggered_by_user_id, reason, occurred_at)
values
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','11111111-aaaa-0000-0000-000000000121', null, 100, 1, '44444444-0000-0000-0000-000000000001', 'Walk-in', now() - interval '45 minutes'),
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','11111111-aaaa-0000-0000-000000000121', 100,  110, 1, '44444444-0000-0000-0000-000000000001', 'Registered', now() - interval '42 minutes'),
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','11111111-aaaa-0000-0000-000000000121', 110,  120, 3, '44444444-0000-0000-0000-000000000001', 'Awaiting vitals', now() - interval '40 minutes'),
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','11111111-aaaa-0000-0000-000000000121', 120,  130, 3, '44444444-0000-0000-0000-000000000001', 'Vitals captured by Nurse Saritha', now() - interval '32 minutes'),
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','11111111-aaaa-0000-0000-000000000121', 130,  140, 4, '44444444-0000-0000-0000-000000000001', 'Queued for Dr. Priya Iyer', now() - interval '25 minutes'),
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','11111111-aaaa-0000-0000-000000000121', 140,  150, 4, '44444444-0000-0000-0000-000000000002', 'In consultation', now() - interval '20 minutes');

-- =====================================================================
-- SECTION 13 — Narcotic register (NDPS demo)
-- =====================================================================
-- Opening balance + 4 dispenses of Tramadol over 60 days, with witness +
-- recipient details (required by chk_narcotic_register_dispense_disclosure).
insert into narcotic_register
  (tenant_id, medicine_id, medicine_batch_id, transaction_type, quantity,
   balance_after, prescriber_name, prescriber_reg_no,
   recipient_name, recipient_relation, recipient_id_proof,
   witnessed_by, performed_by, performed_at, notes)
values
  ('11111111-1111-1111-1111-111111111111','dddddddd-0000-0000-0000-000000000007',
   (select id from medicine_batches where batch_number='B-TRAM50-01'),
   'opening_balance', 500, 500, null, null, null, null, null,
   null, '44444444-0000-0000-0000-000000000001', now() - interval '170 days',
   'Opening balance on first receipt from VEN-003.'),
  ('11111111-1111-1111-1111-111111111111','dddddddd-0000-0000-0000-000000000007',
   (select id from medicine_batches where batch_number='B-TRAM50-01'),
   'dispense_out', -20, 480,
   'Dr. Priya Iyer', 'KMC-67821',
   'Geetha Raghavan', 'spouse', 'AADHAAR-XXXX-XXXX-1234',
   '44444444-0000-0000-0000-000000000010', '44444444-0000-0000-0000-000000000001',
   now() - interval '90 days',
   'Post-op pain mgmt for Subramanian Raghavan.'),
  ('11111111-1111-1111-1111-111111111111','dddddddd-0000-0000-0000-000000000007',
   (select id from medicine_batches where batch_number='B-TRAM50-01'),
   'dispense_out', -10, 470,
   'Dr. Anand Krishnan', 'TNMC-45128',
   'Sundar Ramachandran', 'self', 'PAN-AAAAA0000A',
   '44444444-0000-0000-0000-000000000011', '44444444-0000-0000-0000-000000000001',
   now() - interval '60 days',
   'Severe lumbar pain — 5-day course.'),
  ('11111111-1111-1111-1111-111111111111','dddddddd-0000-0000-0000-000000000007',
   (select id from medicine_batches where batch_number='B-TRAM50-01'),
   'dispense_out', -10, 460,
   'Dr. Priya Iyer', 'KMC-67821',
   'Karthik Raghavan', 'self', 'AADHAAR-XXXX-XXXX-5678',
   '44444444-0000-0000-0000-000000000014', '44444444-0000-0000-0000-000000000001',
   now() - interval '30 days',
   'Post-fracture follow-up Rx.'),
  ('11111111-1111-1111-1111-111111111111','dddddddd-0000-0000-0000-000000000007',
   (select id from medicine_batches where batch_number='B-TRAM50-01'),
   'dispense_out', -15, 445,
   'Dr. Ravi Gopalan', 'TNMC-39120',
   'Prabhu Doss', 'self', 'PAN-BBBBB1111B',
   '44444444-0000-0000-0000-000000000010', '44444444-0000-0000-0000-000000000001',
   now() - interval '10 days',
   'Post-op surgical pain.');

-- =====================================================================
-- SECTION 14 — Notifications (drives FE banner / ACK list)
-- =====================================================================
-- 1 ACTIVE critical for Karthik's potassium — ack_required true, no
-- acked_at. The fn_critical_lab_alert trigger will ALSO insert one when
-- the K result above lands, so this is a second deterministic copy so
-- the FE banner renders even if triggers are disabled in dev.
insert into notifications
  (user_id, type, title, body, link, priority, ack_required, ack_sla_minutes, created_at)
values
  ('44444444-0000-0000-0000-000000000002',
   'lab_result_critical',
   'CRITICAL lab value: Serum Potassium',
   'Karthik Raghavan (KH-2026-00045) — Serum K 6.4 mmol/L (critical_high). Please review immediately.',
   '/doctor/lab-results/11111111-bbbb-1111-0000-000000000002',
   'urgent', true, 30, now() - interval '50 minutes'),
  ('44444444-0000-0000-0000-000000000010',
   'lab_result_critical',
   'CRITICAL lab value: Serum Sodium',
   'Subramanian Raghavan (KH-2024-02018) — Na 118 mmol/L (critical_low).',
   '/doctor/lab-results/11111111-bbbb-1111-0000-000000000099',
   'urgent', true, 30, now() - interval '2 days'),
  ('44444444-0000-0000-0000-000000000010',
   'lab_result_critical',
   'CRITICAL lab value: Random Glucose',
   'Sundar Ramachandran (KH-2026-00056) — RBS 420 mg/dL (critical_high).',
   'urgent_glu_link_here'::varchar,
   'urgent', true, 30, now() - interval '5 days'),
  ('44444444-0000-0000-0000-000000000002',
   'consultation_reminder',
   'Pending lock — OP-2026-00118',
   'Joseph Mathew consultation has been done but not locked. Sign off when ready.',
   '/doctor/consultations/11111111-aaaa-0000-0000-000000000118',
   'normal', false, null, now() - interval '90 minutes'),
  ('44444444-0000-0000-0000-000000000002',
   'follow_up_due',
   'Follow-up due today',
   'Anita Reddy (KH-2026-00012) is due for review — post-op knee.',
   '/doctor/patients/aaaaaaaa-0000-0000-0000-000000000007',
   'normal', false, null, now() - interval '3 hours'),
  ('44444444-0000-0000-0000-000000000002',
   'system',
   'New protocol — antibiotic stewardship',
   'Cipro reserve: avoid for uncomplicated UTI in patients < 60 yrs.',
   '/announcements/abx-2026-q1','normal', false, null, now() - interval '14 days'),
  ('44444444-0000-0000-0000-000000000010',
   'system',
   'Mandatory CME upload',
   'Q1 CME certificate upload deadline 30 days away.',
   '/profile/cme','normal', false, null, now() - interval '20 days'),
  ('44444444-0000-0000-0000-000000000002',
   'lab_result_critical',
   'CRITICAL lab value: HbA1c',
   'Past critical — already acknowledged. Audit retention only.',
   '/doctor/lab-results/historical-1',
   'urgent', true, 30, now() - interval '45 days');

-- Historical critical ACKed for completeness.
insert into notification_acknowledgments
  (notification_id, acked_by, acked_at, action_taken, sla_minutes, breached_sla)
select n.id, '44444444-0000-0000-0000-000000000002', n.created_at + interval '12 minutes',
       'Reviewed. Patient called back, dose adjusted.', 12, false
from notifications n
where n.title = 'CRITICAL lab value: HbA1c';

-- =====================================================================
-- END — sample_data.sql
-- =====================================================================
-- Quick post-load sanity check (uncomment to run):
-- select count(*) as patients from patients;
-- select count(*) as visits from op_visits;
-- select count(*) as consultations from consultations;
-- select count(*) as rx_items from prescription_items;
-- select count(*) as lab_results from lab_results;
-- select count(*) as journey_events from patient_journey_events;
-- =====================================================================
