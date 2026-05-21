-- =====================================================================
-- demo-rich-seed.sql
-- Realistic demo data: 30 patients, future appointments, past visits
-- with prescriptions + invoices for 3 patients. Caste-neutral names.
-- Idempotent: re-runs are no-ops via `where not exists` guards.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Patients (29 new + the "Demo Patient" already present = 30 total)
--    Mix of demographics + 3 shared-mobile family groups.
-- ---------------------------------------------------------------------
insert into patients (
  uhid, first_name, last_name, gender, date_of_birth, mobile, alt_mobile,
  email, address, blood_group, emergency_contact_name, emergency_contact_mobile,
  emergency_contact_relation, created_by
)
select
  v.uhid, v.first_name, v.last_name, v.gender, v.dob::date,
  v.mobile, nullif(v.alt_mobile,''), nullif(v.email,''),
  jsonb_build_object('line1', v.line1, 'city', v.city, 'state', 'Tamil Nadu',
                     'pincode', v.pincode, 'country', 'IN'),
  nullif(v.bg,''), nullif(v.ec_name,''), nullif(v.ec_mobile,''),
  nullif(v.ec_rel,''),
  '00000000-0000-0000-0000-000000000001'::uuid
from (values
  -- Family A — shared mobile 9000000001
  ('KH-2026-00100','Karthik','R.','m','1982-04-15','9000000001','','karthik@example.com','12 Sterling Road','Chennai','600034','B+','Geetha R.','9000000001','Spouse'),
  ('KH-2026-00101','Geetha','R.','f','1986-09-30','9000000001','','geetha@example.com','12 Sterling Road','Chennai','600034','A+','Karthik R.','9000000001','Spouse'),
  ('KH-2026-00102','Aarav','R.','m','2014-07-21','9000000001','','','12 Sterling Road','Chennai','600034','','Geetha R.','9000000001','Parent'),
  -- Family B — shared mobile 9000000002
  ('KH-2026-00103','Sundar','R.','m','1955-01-12','9000000002','','sundar@example.com','7 Velachery Main Road','Chennai','600042','B+','Lalitha R.','9000000002','Spouse'),
  ('KH-2026-00104','Lalitha','R.','f','1957-11-04','9000000002','','','7 Velachery Main Road','Chennai','600042','O+','Sundar R.','9000000002','Spouse'),
  -- Family C — shared mobile 9000000003
  ('KH-2026-00105','Imran','Khan','m','1991-03-08','9000000003','','imran@example.com','18 Saidapet Mount Road','Chennai','600015','B+','Sameera Khan','9000000003','Spouse'),
  ('KH-2026-00106','Sameera','Khan','f','1996-12-19','9000000003','','sameera@example.com','18 Saidapet Mount Road','Chennai','600015','B+','Imran Khan','9000000003','Spouse'),
  -- Singletons
  ('KH-2026-00107','Meera','S.','f','1968-06-25','9000000010','','meera@example.com','45 Luz Church Road','Chennai','600004','O+','Rajan S.','9000000011','Sibling'),
  ('KH-2026-00108','Rajan','S.','m','1964-02-14','9000000011','','rajan@example.com','45 Luz Church Road','Chennai','600004','O+','Meera S.','9000000010','Sibling'),
  ('KH-2026-00109','Anjali','S.','f','2000-08-09','9000000012','','anjali@example.com','45 Luz Church Road','Chennai','600004','A-','Meera S.','9000000010','Parent'),
  ('KH-2026-00110','Ramesh','B.','m','1959-04-30','9000000013','','ramesh@example.com','22 Indira Nagar 2nd Avenue','Chennai','600020','A+','Sundari B.','9000000014','Spouse'),
  ('KH-2026-00111','Sundari','B.','f','1962-10-16','9000000014','','','22 Indira Nagar 2nd Avenue','Chennai','600020','A+','Ramesh B.','9000000013','Spouse'),
  ('KH-2026-00112','Aarav','K.','m','2017-05-22','9000000015','','','14 Phoenix Apartments, Velachery','Chennai','600042','AB+','Vivek K.','9000000015','Parent'),
  ('KH-2026-00113','Vivek','K.','m','1985-09-14','9000000015','','vivek@example.com','14 Phoenix Apartments, Velachery','Chennai','600042','B+','Priya K.','9000000016','Spouse'),
  ('KH-2026-00114','Priya','K.','f','1987-11-02','9000000016','','priya.k@example.com','14 Phoenix Apartments, Velachery','Chennai','600042','O+','Vivek K.','9000000015','Spouse'),
  ('KH-2026-00115','Lakshmi','N.','f','1955-03-17','9000000017','','lakshmi.n@example.com','9 Pondy Bazaar, T. Nagar','Chennai','600017','B-','Naren K.','9000000018','Child'),
  ('KH-2026-00116','Naren','K.','m','1950-07-12','9000000018','','','14 Triplicane','Chennai','600005','B-','Lakshmi N.','9000000017','Parent'),
  ('KH-2026-00117','Suresh','B.','m','1977-06-04','9000000019','','suresh@example.com','33 GST Road, Tambaram','Chennai','600045','A+','','',''),
  ('KH-2026-00118','Sunita','V.','f','1992-12-28','9000000020','','sunita@example.com','21 Velachery 1st Cross','Chennai','600042','O+','','',''),
  ('KH-2026-00119','Vikram','B.','m','1975-08-19','9000000021','','vikram@example.com','77 OMR, Sholinganallur','Chennai','600119','A+','','',''),
  ('KH-2026-00120','Aisha','S.','f','1998-04-05','9000000022','','aisha@example.com','30 Royapettah High Road','Chennai','600014','O-','','',''),
  ('KH-2026-00121','Ravi','A.','m','1981-01-23','9000000023','','ravi.a@example.com','66 Anna Nagar West','Chennai','600040','AB+','','',''),
  ('KH-2026-00122','Divya','M.','f','1994-09-11','9000000024','','divya@example.com','11 Adyar Bridge Road','Chennai','600020','A+','','',''),
  ('KH-2026-00123','Sanjay','Murthy','m','1966-03-04','9000000025','','sanjay@example.com','41 T. Nagar','Chennai','600017','A-','','',''),
  ('KH-2026-00124','Latha','Devi','f','1959-10-08','9000000026','','latha@example.com','27 Anna Nagar East','Chennai','600102','A+','','',''),
  ('KH-2026-00125','Tamilarasan','M.','m','1946-02-12','9000000027','','tamil@example.com','22 Porur Lake View','Chennai','600116','A+','','',''),
  ('KH-2026-00126','Yogesh','Sivan','m','2021-09-30','9000000028','','','22 Adyar 4th Cross','Chennai','600020','','','',''),
  ('KH-2026-00127','Zara','Khan','f','2025-05-15','9000000029','','','11 Saidapet East','Chennai','600015','','','',''),
  ('KH-2026-00128','Manjunath','Daniel','m','1955-08-08','9000000030','','manjunath@example.com','5 Mylapore Mada Street','Chennai','600004','B+','','','')
) as v(uhid, first_name, last_name, gender, dob, mobile, alt_mobile, email, line1, city, pincode, bg, ec_name, ec_mobile, ec_rel)
where not exists (select 1 from patients p where p.uhid = v.uhid);

-- ---------------------------------------------------------------------
-- 2. Patient allergies + chronic conditions
-- ---------------------------------------------------------------------
do $$
declare bs uuid := '00000000-0000-0000-0000-000000000001'; begin
  -- Allergies
  insert into patient_allergies (patient_id, allergy_id, severity, source, created_by)
  select (select id from patients where uhid='KH-2026-00100'),
         (select id from allergies_lookup where allergy_code='PENICILLIN'),
         'severe','doctor_recorded',bs
  where not exists (select 1 from patient_allergies pa
    where pa.patient_id=(select id from patients where uhid='KH-2026-00100')
      and pa.allergy_id=(select id from allergies_lookup where allergy_code='PENICILLIN'));

  insert into patient_allergies (patient_id, allergy_id, severity, source, created_by)
  select (select id from patients where uhid='KH-2026-00110'),
         (select id from allergies_lookup where allergy_code='SULFONAMIDES'),
         'moderate','doctor_recorded',bs
  where not exists (select 1 from patient_allergies pa
    where pa.patient_id=(select id from patients where uhid='KH-2026-00110')
      and pa.allergy_id=(select id from allergies_lookup where allergy_code='SULFONAMIDES'));

  insert into patient_allergies (patient_id, allergy_id, severity, source, created_by)
  select (select id from patients where uhid='KH-2026-00120'),
         (select id from allergies_lookup where allergy_code='PENICILLIN'),
         'mild','patient_reported',bs
  where not exists (select 1 from patient_allergies pa
    where pa.patient_id=(select id from patients where uhid='KH-2026-00120')
      and pa.allergy_id=(select id from allergies_lookup where allergy_code='PENICILLIN'));

  -- Chronic conditions
  insert into patient_chronic_conditions (patient_id, condition_id, diagnosed_date, severity, controlled_status, created_by)
  select (select id from patients where uhid='KH-2026-00103'),
         (select id from chronic_conditions_lookup where condition_code='T2DM'),
         '2015-03-10','moderate','partially_controlled',bs
  where not exists (select 1 from patient_chronic_conditions pcc
    where pcc.patient_id=(select id from patients where uhid='KH-2026-00103')
      and pcc.condition_id=(select id from chronic_conditions_lookup where condition_code='T2DM'));

  insert into patient_chronic_conditions (patient_id, condition_id, diagnosed_date, severity, controlled_status, created_by)
  select (select id from patients where uhid='KH-2026-00103'),
         (select id from chronic_conditions_lookup where condition_code='HYPERTENSION'),
         '2012-06-20','moderate','controlled',bs
  where not exists (select 1 from patient_chronic_conditions pcc
    where pcc.patient_id=(select id from patients where uhid='KH-2026-00103')
      and pcc.condition_id=(select id from chronic_conditions_lookup where condition_code='HYPERTENSION'));

  insert into patient_chronic_conditions (patient_id, condition_id, diagnosed_date, severity, controlled_status, created_by)
  select (select id from patients where uhid='KH-2026-00114'),
         (select id from chronic_conditions_lookup where condition_code='ASTHMA'),
         '2018-08-15','mild','controlled',bs
  where not exists (select 1 from patient_chronic_conditions pcc
    where pcc.patient_id=(select id from patients where uhid='KH-2026-00114')
      and pcc.condition_id=(select id from chronic_conditions_lookup where condition_code='ASTHMA'));

  insert into patient_chronic_conditions (patient_id, condition_id, diagnosed_date, severity, controlled_status, created_by)
  select (select id from patients where uhid='KH-2026-00115'),
         (select id from chronic_conditions_lookup where condition_code='HYPERTENSION'),
         '2010-04-12','moderate','controlled',bs
  where not exists (select 1 from patient_chronic_conditions pcc
    where pcc.patient_id=(select id from patients where uhid='KH-2026-00115')
      and pcc.condition_id=(select id from chronic_conditions_lookup where condition_code='HYPERTENSION'));

  insert into patient_chronic_conditions (patient_id, condition_id, diagnosed_date, severity, controlled_status, created_by)
  select (select id from patients where uhid='KH-2026-00128'),
         (select id from chronic_conditions_lookup where condition_code='CAD'),
         '2020-11-22','severe','partially_controlled',bs
  where not exists (select 1 from patient_chronic_conditions pcc
    where pcc.patient_id=(select id from patients where uhid='KH-2026-00128')
      and pcc.condition_id=(select id from chronic_conditions_lookup where condition_code='CAD'));
end $$;

-- ---------------------------------------------------------------------
-- 3. Services (consultation + a couple of lab/radiology so invoice_items can FK)
-- ---------------------------------------------------------------------
insert into services (
  service_code, service_name, service_type, default_price, is_taxable, default_gst_pct, sac_code, created_by
)
select v.service_code, v.service_name, v.service_type, v.default_price::numeric, v.is_taxable, v.default_gst_pct::numeric, v.sac_code,
       '00000000-0000-0000-0000-000000000001'::uuid
from (values
  ('CONSULT_NEW',     'New Consultation',      'procedure', 500.00, false, 0,    '999316'),
  ('CONSULT_FU',      'Follow-up Consultation','procedure', 300.00, false, 0,    '999316'),
  ('LAB_CBC',         'Complete Blood Count',  'lab_test',  400.00, true,  5,    '998311'),
  ('LAB_BSF',         'Blood Sugar Fasting',   'lab_test',  150.00, true,  5,    '998311'),
  ('LAB_LIPID',       'Lipid Profile',         'lab_panel', 800.00, true,  5,    '998311'),
  ('LAB_HBA1C',       'HbA1c',                 'lab_test',  600.00, true,  5,    '998311'),
  ('RAD_XRAY_CHEST',  'Chest X-Ray PA View',   'radiology', 400.00, true,  5,    '998311'),
  ('RAD_USG_ABD',     'Abdominal Ultrasound',  'radiology', 1200.00,true,  5,    '998311'),
  ('RAD_ECG',         'ECG 12-Lead',           'radiology', 300.00, true,  5,    '998311')
) as v(service_code, service_name, service_type, default_price, is_taxable, default_gst_pct, sac_code)
where not exists (select 1 from services s where s.service_code = v.service_code and s.deleted_at is null);

-- ---------------------------------------------------------------------
-- 4. Drug catalogue (10 common generics)
-- ---------------------------------------------------------------------
insert into drug_catalogue (
  drug_code, generic_name, brand_name, manufacturer, drug_class, category,
  drug_schedule, is_narcotic, form, strength, unit, pack_size, hsn_code,
  gst_pct, requires_prescription, low_stock_threshold, max_stock_threshold,
  storage_temp, created_by
)
select v.drug_code, v.generic_name, v.brand_name, v.manufacturer, v.drug_class,
       v.category, v.drug_schedule, v.is_narcotic, v.form, v.strength, v.unit,
       v.pack_size, v.hsn_code, v.gst_pct::numeric, v.req_rx,
       v.low_thresh, v.max_thresh, v.storage_temp,
       '00000000-0000-0000-0000-000000000001'::uuid
from (values
  ('DRG-PARA-500',  'Paracetamol',      'Calpol 500',   'GSK',          'analgesic',  'oral_tablet','H',  false, 'tablet',   '500 mg', 'tablet', 10, '30049099', 12, false, 50, 500, 'room'),
  ('DRG-AMOX-500',  'Amoxicillin',      'Mox 500',      'Sun Pharma',   'antibiotic', 'oral_capsule','H', false, 'capsule',  '500 mg', 'capsule',10, '30049099', 12, true,  30, 300, 'room'),
  ('DRG-METF-500',  'Metformin',        'Glycomet 500', 'USV',          'antidiabetic','oral_tablet','H', false, 'tablet',   '500 mg', 'tablet', 15, '30049099',  5, true,  40, 400, 'room'),
  ('DRG-AMLO-5',    'Amlodipine',       'Amlokind 5',   'Mankind',      'antihypertensive','oral_tablet','H',false,'tablet','5 mg',    'tablet', 10, '30049099',  5, true,  40, 400, 'room'),
  ('DRG-ATOR-10',   'Atorvastatin',     'Atorlip 10',   'Cipla',        'statin',     'oral_tablet','H',  false, 'tablet',   '10 mg',  'tablet', 10, '30049099',  5, true,  30, 300, 'room'),
  ('DRG-PAN-40',    'Pantoprazole',     'Pantop 40',    'Aristo',       'ppi',        'oral_tablet','H',  false, 'tablet',   '40 mg',  'tablet', 10, '30049099', 12, true,  40, 400, 'room'),
  ('DRG-CETI-10',   'Cetirizine',       'Cetzine 10',   'Glenmark',     'antihistamine','oral_tablet','H',false,'tablet','10 mg',     'tablet', 10, '30049099', 12, false, 30, 300, 'room'),
  ('DRG-AZIT-500',  'Azithromycin',     'Azee 500',     'Cipla',        'antibiotic', 'oral_tablet','H',  false, 'tablet',   '500 mg', 'tablet',  3, '30049099', 12, true,  20, 200, 'room'),
  ('DRG-SALB-INH',  'Salbutamol',       'Asthalin Inh', 'Cipla',        'bronchodilator','inhaler','H',   false, 'inhaler',  '100 mcg','dose',  200, '30049099', 12, true,  10, 100, 'room'),
  ('DRG-LEVO-50',   'Levothyroxine',    'Eltroxin 50',  'Abbott',       'thyroid_hormone','oral_tablet','H',false,'tablet','50 mcg',  'tablet', 30, '30049099',  5, true,  20, 200, 'room')
) as v(drug_code, generic_name, brand_name, manufacturer, drug_class, category, drug_schedule, is_narcotic, form, strength, unit, pack_size, hsn_code, gst_pct, req_rx, low_thresh, max_thresh, storage_temp)
where not exists (select 1 from drug_catalogue d where d.drug_code = v.drug_code and d.deleted_at is null);

-- ---------------------------------------------------------------------
-- 5. Future appointments (5 across next 3 days, multiple doctors)
-- ---------------------------------------------------------------------
insert into appointments (
  appointment_no, patient_id, doctor_id, scheduled_at, visit_type, status, source, reason, created_by
)
select v.appt_no,
       (select id from patients where uhid = v.uhid),
       (select id from users where username = v.doctor_username),
       v.scheduled_at::timestamptz,
       v.visit_type, 'booked', v.source, v.reason,
       '00000000-0000-0000-0000-000000000001'::uuid
from (values
  ('APT-2026-00100', 'KH-2026-00100', 'drnaveen',  (current_date + 1 || ' 09:30:00+05:30')::text, 'new',       'phone',  'Knee pain - second opinion'),
  ('APT-2026-00101', 'KH-2026-00114', 'dranand',   (current_date + 1 || ' 10:00:00+05:30')::text, 'follow_up', 'online', 'Asthma review'),
  ('APT-2026-00102', 'KH-2026-00115', 'dranand',   (current_date + 2 || ' 11:00:00+05:30')::text, 'follow_up', 'phone',  'BP and lipids review'),
  ('APT-2026-00103', 'KH-2026-00106', 'drlakshmi', (current_date + 2 || ' 14:30:00+05:30')::text, 'new',       'walk_in','Antenatal first visit'),
  ('APT-2026-00104', 'KH-2026-00128', 'drnaveen',  (current_date + 3 || ' 09:00:00+05:30')::text, 'follow_up', 'phone',  'Post-op review')
) as v(appt_no, uhid, doctor_username, scheduled_at, visit_type, source, reason)
where not exists (select 1 from appointments a where a.appointment_no = v.appt_no and a.deleted_at is null);

-- ---------------------------------------------------------------------
-- 5b. Cash counter + a single open cash session for demo payments
-- ---------------------------------------------------------------------
insert into cash_counters (counter_code, counter_name, location, created_by)
select 'TILL-1', 'Reception Till', 'Front Desk', '00000000-0000-0000-0000-000000000001'::uuid
where not exists (select 1 from cash_counters where counter_code = 'TILL-1' and deleted_at is null);

insert into cash_sessions (
  counter_id, session_number, session_label, business_date, opened_by, opened_at,
  status, opening_float, created_by
)
select (select id from cash_counters where counter_code='TILL-1'),
       'CS-2026-001', 'full_day', current_date,
       (select id from users where username='naveen'),
       (current_date - 200)::timestamptz,
       'open', 0,
       '00000000-0000-0000-0000-000000000001'::uuid
where not exists (select 1 from cash_sessions where session_number = 'CS-2026-001' and deleted_at is null);

-- ---------------------------------------------------------------------
-- 6. Past history for 3 patients: Sundar R. (00103), Priya K. (00114),
--    Manjunath Daniel (00128). Each gets 2 historic visits with
--    consultations, prescriptions, invoices, payments.
-- ---------------------------------------------------------------------
do $$
declare
  bs uuid := '00000000-0000-0000-0000-000000000001';
  approver uuid := (select id from users where username = 'kuppan');
  cases jsonb[] := array[
    -- Each entry: (uhid, doctor_username, op_number, visit_date offset,
    --              chief_complaint, diagnosis icd10/desc, rx_items, invoice_amount)
    jsonb_build_object(
      'uhid','KH-2026-00103','doctor','drnaveen','op','OP-2026-00100','offset',180,
      'chief','Knee pain and stiffness for 2 weeks',
      'dx', jsonb_build_array(jsonb_build_object('icd10','M19.91','desc','Primary OA, knee','type','primary')),
      'rx', jsonb_build_array(
        jsonb_build_object('drug','DRG-PARA-500','dose','500 mg','freq','1-0-1','days',7,'qty',14),
        jsonb_build_object('drug','DRG-AMLO-5',  'dose','5 mg',  'freq','1-0-0','days',30,'qty',30)
      ),
      'inv', 800
    ),
    jsonb_build_object(
      'uhid','KH-2026-00103','doctor','drnaveen','op','OP-2026-00101','offset',60,
      'chief','BP and diabetes review',
      'dx', jsonb_build_array(jsonb_build_object('icd10','I10','desc','Hypertension','type','primary'),
                              jsonb_build_object('icd10','E11','desc','T2DM','type','secondary')),
      'rx', jsonb_build_array(
        jsonb_build_object('drug','DRG-METF-500','dose','500 mg','freq','1-0-1','days',90,'qty',180),
        jsonb_build_object('drug','DRG-AMLO-5',  'dose','5 mg',  'freq','1-0-0','days',90,'qty',90)
      ),
      'inv', 800
    ),
    jsonb_build_object(
      'uhid','KH-2026-00114','doctor','dranand','op','OP-2026-00102','offset',120,
      'chief','Wheezing episode last night',
      'dx', jsonb_build_array(jsonb_build_object('icd10','J45.20','desc','Mild intermittent asthma','type','primary')),
      'rx', jsonb_build_array(
        jsonb_build_object('drug','DRG-SALB-INH','dose','2 puffs','freq','PRN','days',30,'qty',1),
        jsonb_build_object('drug','DRG-CETI-10', 'dose','10 mg', 'freq','0-0-1','days',7,'qty',7)
      ),
      'inv', 500
    ),
    jsonb_build_object(
      'uhid','KH-2026-00114','doctor','dranand','op','OP-2026-00103','offset',30,
      'chief','Routine asthma review',
      'dx', jsonb_build_array(jsonb_build_object('icd10','J45.20','desc','Mild intermittent asthma','type','primary')),
      'rx', jsonb_build_array(
        jsonb_build_object('drug','DRG-SALB-INH','dose','2 puffs','freq','PRN','days',60,'qty',1)
      ),
      'inv', 300
    ),
    jsonb_build_object(
      'uhid','KH-2026-00128','doctor','drnaveen','op','OP-2026-00104','offset',90,
      'chief','Chest tightness on exertion',
      'dx', jsonb_build_array(jsonb_build_object('icd10','I25.10','desc','CAD without angina','type','primary')),
      'rx', jsonb_build_array(
        jsonb_build_object('drug','DRG-ATOR-10', 'dose','10 mg','freq','0-0-1','days',90,'qty',90),
        jsonb_build_object('drug','DRG-AMLO-5',  'dose','5 mg', 'freq','1-0-0','days',90,'qty',90),
        jsonb_build_object('drug','DRG-PAN-40',  'dose','40 mg','freq','1-0-0','days',30,'qty',30)
      ),
      'inv', 800
    ),
    jsonb_build_object(
      'uhid','KH-2026-00128','doctor','drnaveen','op','OP-2026-00105','offset',30,
      'chief','Cardiology follow-up',
      'dx', jsonb_build_array(jsonb_build_object('icd10','I25.10','desc','CAD without angina','type','primary')),
      'rx', jsonb_build_array(
        jsonb_build_object('drug','DRG-ATOR-10', 'dose','10 mg','freq','0-0-1','days',90,'qty',90)
      ),
      'inv', 500
    )
  ];
  c jsonb;
  pid uuid; did uuid; visit_d date;
  v_op uuid; v_cons uuid; v_rx uuid; v_inv uuid;
  rx_item jsonb;
  service_consult_new uuid := (select id from services where service_code='CONSULT_NEW');
  service_consult_fu  uuid := (select id from services where service_code='CONSULT_FU');
  invoice_no_seq int := 100;
  seq int;
begin
  foreach c in array cases loop
    pid := (select id from patients where uhid = c->>'uhid');
    did := (select id from users where username = c->>'doctor');
    visit_d := (current_date - ((c->>'offset')::int))::date;

    -- Skip if op_visit already exists.
    if exists (select 1 from op_visits where op_number = c->>'op') then continue; end if;

    -- op_visit
    insert into op_visits (op_number, patient_id, doctor_id, visit_date, chief_complaint, closed_at, created_by, created_at)
    values (c->>'op', pid, did, visit_d, c->>'chief', (visit_d + interval '2 hours')::timestamptz, bs, visit_d::timestamptz)
    returning id into v_op;

    -- consultation (locked — must INSERT with all clinical data because the
    -- lock-guard trigger blocks subsequent UPDATEs of those fields)
    insert into consultations (
      op_visit_id, status, patient_id, doctor_id, chief_complaint,
      history_of_present_illness, diagnoses, clinical_notes, advice,
      next_action, follow_up_required, follow_up_date, locked_at,
      created_by, created_at
    )
    values (
      v_op, 'locked', pid, did, c->>'chief',
      c->>'chief',
      c->'dx',
      'Plan and review per the protocol for the primary diagnosis.',
      'Take medications regularly. Return for review as scheduled.',
      'prescription_only', true, (visit_d + interval '30 days')::date,
      (visit_d + interval '1 hour')::timestamptz, bs, visit_d::timestamptz
    )
    returning id into v_cons;

    -- prescription
    insert into prescriptions (consultation_id, patient_id, doctor_id, status, locked_at, created_by, created_at)
    values (v_cons, pid, did, 'dispensed', (visit_d + interval '1 hour')::timestamptz, bs, visit_d::timestamptz)
    returning id into v_rx;

    -- prescription items
    seq := 0;
    for rx_item in select * from jsonb_array_elements(c->'rx') loop
      seq := seq + 1;
      insert into prescription_items (
        prescription_id, medicine_id, medicine_name_snapshot,
        dosage, frequency, duration_days, quantity_prescribed, sequence_no,
        created_by, created_at
      )
      values (
        v_rx,
        (select id from drug_catalogue where drug_code = rx_item->>'drug'),
        (select generic_name || coalesce(' '||strength,'') from drug_catalogue where drug_code = rx_item->>'drug'),
        rx_item->>'dose',
        rx_item->>'freq',
        (rx_item->>'days')::int,
        (rx_item->>'qty')::int,
        seq, bs, visit_d::timestamptz
      );
    end loop;

    -- invoice (consult fee only — invoice_items minimal)
    invoice_no_seq := invoice_no_seq + 1;
    insert into invoices (
      invoice_number, invoice_type, patient_id, op_visit_id, invoice_date,
      subtotal, total_line_discount, bill_discount_amount, total_tax,
      total_amount, amount_paid,
      payment_status, approval_status, approved_by, approved_at,
      finalized_at, created_by, created_at
    )
    values (
      'INV-2026-' || lpad(invoice_no_seq::text, 5, '0'),
      'op', pid, v_op, visit_d,
      (c->>'inv')::numeric, 0, 0, 0,
      (c->>'inv')::numeric, (c->>'inv')::numeric,
      'paid', 'approved', approver, (visit_d + interval '90 minutes')::timestamptz,
      (visit_d + interval '90 minutes')::timestamptz, bs, visit_d::timestamptz
    )
    returning id into v_inv;

    -- invoice item (just the consultation line)
    insert into invoice_items (
      invoice_id, service_id, item_type, item_name, sequence_no,
      consultation_id, quantity, unit_price, line_discount_pct, line_discount_amount,
      cgst_pct, cgst_amount, sgst_pct, sgst_amount, igst_pct, igst_amount,
      total_price, created_by, created_at
    )
    values (
      v_inv,
      case when (c->>'offset')::int > 90 then service_consult_new else service_consult_fu end,
      'consultation',
      case when (c->>'offset')::int > 90 then 'New Consultation' else 'Follow-up Consultation' end,
      1, v_cons, 1, (c->>'inv')::numeric, 0, 0,
      0, 0, 0, 0, 0, 0,
      (c->>'inv')::numeric, bs, visit_d::timestamptz
    );

    -- payment + allocation
    insert into payments (
      patient_id, payment_direction, payment_mode, amount, received_by,
      cash_session_id, idempotency_key, created_by, created_at
    )
    values (
      pid, 'in', 'cash', (c->>'inv')::numeric,
      (select id from users where username='naveen'),
      (select id from cash_sessions where session_number='CS-2026-001'),
      uuidv7(), bs, visit_d::timestamptz
    )
    returning id into v_inv;  -- reusing v_inv variable as payment_id

    -- allocation
    insert into payment_allocations (
      payment_id, allocation_type, invoice_id, amount, created_by, created_at
    )
    values (
      v_inv, 'invoice',
      (select id from invoices where invoice_number = 'INV-2026-' || lpad(invoice_no_seq::text, 5, '0')),
      (c->>'inv')::numeric, bs, visit_d::timestamptz
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------
select 'patients' as t, count(*)::text as n from patients where deleted_at is null
union all select 'allergies_rows', count(*)::text from patient_allergies where deleted_at is null
union all select 'condition_rows', count(*)::text from patient_chronic_conditions where deleted_at is null
union all select 'drug_catalogue', count(*)::text from drug_catalogue where deleted_at is null
union all select 'services', count(*)::text from services where deleted_at is null
union all select 'appointments', count(*)::text from appointments where deleted_at is null
union all select 'future_appointments', count(*)::text from appointments where deleted_at is null and scheduled_at > now()
union all select 'op_visits', count(*)::text from op_visits where deleted_at is null
union all select 'consultations', count(*)::text from consultations where deleted_at is null
union all select 'prescriptions', count(*)::text from prescriptions where deleted_at is null
union all select 'prescription_items', count(*)::text from prescription_items where deleted_at is null
union all select 'invoices', count(*)::text from invoices where deleted_at is null
union all select 'payments', count(*)::text from payments where deleted_at is null
union all select 'payment_allocations', count(*)::text from payment_allocations where deleted_at is null
order by t;
