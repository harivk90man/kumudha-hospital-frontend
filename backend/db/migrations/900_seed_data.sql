-- =====================================================================
-- 900_seed_data.sql
-- Reference data + bootstrap rows (Kumudha Hospital tenant + Dr. Priya Iyer).
--
-- Idempotent — uses ON CONFLICT DO NOTHING so reruns are safe.
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- 1. Tenant — Kumudha Hospital, Villupuram
-- ---------------------------------------------------------------------
insert into tenants
  (id, tenant_code, hospital_name, address, timezone,
   uhid_prefix, uhid_separator, uhid_sequence_padding, uhid_include_year, is_active)
values
  ('11111111-1111-1111-1111-111111111111',
   'KH', 'Kumudha Hospital',
   'Villupuram, Tamil Nadu, India',
   'Asia/Kolkata',
   'KH', '-', 6, true, true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 2. Departments
-- ---------------------------------------------------------------------
insert into departments (id, tenant_id, dept_name, dept_code, segment, is_active) values
  ('22222222-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Orthopaedics',     'ORTHO',  'clinical', true),
  ('22222222-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Dermatology',      'DERMA',  'clinical', true),
  ('22222222-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'General Medicine', 'GENMED', 'clinical', true),
  ('22222222-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Laboratory',       'LAB',    'lab',      true),
  ('22222222-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'Pharmacy',         'PHARMA', 'pharma',   true),
  ('22222222-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'Radiology',        'RADIO',  'radiology',true),
  ('22222222-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', 'Front Desk',       'FRONT',  'support',  true),
  ('22222222-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', 'Nursing',          'NURSE',  'support',  true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 3. Roles  (system role keys)
-- ---------------------------------------------------------------------
insert into roles (id, tenant_id, role_name, description, is_system_role) values
  ('33333333-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'admin',         'Hospital administrator',           true),
  ('33333333-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'owner',         'Hospital owner — full read access', true),
  ('33333333-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'doctor',        'Treating doctor',                  true),
  ('33333333-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'nurse',         'Nursing staff',                    true),
  ('33333333-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'front_desk',    'Front-desk reception',             true),
  ('33333333-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'cashier',       'Billing / cashier',                true),
  ('33333333-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', 'lab_tech',      'Lab technician',                   true),
  ('33333333-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', 'radiologist',   'Radiologist',                      true),
  ('33333333-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', 'radiology_tech','Radiology technician',             true),
  ('33333333-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'pharmacist',    'Pharmacist',                       true),
  ('33333333-0000-0000-0000-00000000000b', '11111111-1111-1111-1111-111111111111', 'platform_admin','Cross-tenant platform admin',      true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 4. Bootstrap admin user (required for created_by FKs below)
-- password_hash is a placeholder — must be reset before any login.
-- ---------------------------------------------------------------------
insert into users
  (id, tenant_id, employee_id, full_name, mobile, email, username, password_hash,
   department_id, designation, status)
values
  ('44444444-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111',
   'EMP001', 'System Administrator', '0000000001', 'admin@kumudhahospital.in',
   'admin', '$2b$12$REPLACE_ME_BEFORE_USE',
   '22222222-0000-0000-0000-000000000007',
   'Administrator', 'active')
on conflict (id) do nothing;

insert into user_roles (user_id, role_id, is_default, assigned_at)
values
  ('44444444-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', true, now())
on conflict (user_id, role_id) do nothing;

-- ---------------------------------------------------------------------
-- 5. Sample doctor — Dr. Priya Iyer (matches FE mocks)
-- ---------------------------------------------------------------------
insert into users
  (id, tenant_id, employee_id, full_name, mobile, email, username, password_hash,
   department_id, designation, status, created_by)
values
  ('44444444-0000-0000-0000-000000000002',
   '11111111-1111-1111-1111-111111111111',
   'EMP002', 'Dr. Priya Iyer', '9876500001', 'priya.iyer@kumudhahospital.in',
   'priya.iyer', '$2b$12$REPLACE_ME_BEFORE_USE',
   '22222222-0000-0000-0000-000000000001',   -- Orthopaedics
   'Consultant Orthopaedic Surgeon', 'active',
   '44444444-0000-0000-0000-000000000001')
on conflict (id) do nothing;

insert into doctor_profiles
  (user_id, specialization, qualification, registration_number,
   consultation_fee, follow_up_fee, follow_up_window_days,
   slot_duration_mins, available_days)
values
  ('44444444-0000-0000-0000-000000000002',
   'Orthopaedics', 'MBBS, MS (Ortho)', 'KMC-67821',
   500.00, 300.00, 7, 15,
   '{"mon":[{"from":"09:00","to":"13:00"},{"from":"17:00","to":"20:00"}],
     "tue":[{"from":"09:00","to":"13:00"}],
     "wed":[{"from":"09:00","to":"13:00"},{"from":"17:00","to":"20:00"}],
     "thu":[{"from":"09:00","to":"13:00"}],
     "fri":[{"from":"09:00","to":"13:00"},{"from":"17:00","to":"20:00"}],
     "sat":[{"from":"09:00","to":"12:00"}]}'::jsonb)
on conflict (user_id) do nothing;

insert into user_roles (user_id, role_id, is_default, assigned_at)
values
  ('44444444-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000003', true, now())
on conflict (user_id, role_id) do nothing;

-- ---------------------------------------------------------------------
-- 6. patient_states (catalog 100..710) — codes from
--    docs/03-schema/v1/state-catalog.md
-- ---------------------------------------------------------------------
insert into patient_states (code, phase, phase_label, slug, display_name, description, owning_dept, derived_from, is_blocking, is_terminal, sla_minutes, next_possible_codes, display_color, is_active) values
  (100,0,'Emergency / Arrival','walk_in_arrived','Walked-In',           'Patient arrived (walk-in / appt) — pre-registration.','front_desk','patients',         false,false,null, '{110,120}',         '#9CA3AF',true),
  (110,1,'Front Desk',         'registered',     'Registered',          'Reception completed registration / UHID assigned.', 'front_desk','patients',         false,false,5,    '{120,200}',         '#378ADD',true),
  (120,1,'Vitals',              'awaiting_vitals','Awaiting Vitals',     'Patient queued for vitals capture.',                'nursing',   'patient_queue',    true, false,10,   '{130}',             '#F59E0B',true),
  (130,1,'Vitals',              'vitals_done',   'Vitals Done',          'Vitals captured.',                                   'nursing',   'vitals',           false,false,2,    '{140,200}',         '#10B981',true),
  (140,2,'Doctor',              'awaiting_doctor','Awaiting Doctor',     'In doctor''s queue.',                                'doctor',    'patient_queue',    true, false,20,   '{150}',             '#F59E0B',true),
  (150,2,'Doctor',              'in_consultation','In Consultation',     'Doctor is currently consulting patient.',            'doctor',    'consultations',    false,false,15,   '{160,165,300,400}', '#3B82F6',true),
  (160,2,'Doctor',              'consultation_done','Consultation Done', 'Doctor closed consultation.',                        'doctor',    'consultations',    false,false,2,    '{200,500,600,620}', '#10B981',true),
  (165,2,'Doctor',              'doctor_review_pending','Doctor Review Pending','All ordered tests reported — awaiting doctor review.','doctor','lab_results',true,false,null, '{150,600}',          '#F59E0B',true),
  (200,3,'Billing',             'awaiting_billing','Awaiting Billing',    'Patient queued at billing counter.',                'billing',   'patient_queue',    true, false,10,   '{210,220,230}',     '#F59E0B',true),
  (210,3,'Billing',             'billed',        'Billed',              'Invoice generated, awaiting payment.',               'billing',   'invoices',         false,false,5,    '{220,230}',         '#3B82F6',true),
  (220,3,'Billing',             'paid',          'Paid',                'Invoice fully paid.',                                'billing',   'invoices',         false,false,1,    '{300,400,500,600}', '#10B981',true),
  (230,3,'Billing',             'partially_paid','Partially Paid',       'Invoice has remaining balance.',                     'billing',   'invoices',         true, false,60,   '{220}',             '#EF4444',true),
  (300,4,'Lab',                 'lab_pending',   'Lab Pending',          'Lab order placed, awaiting sample collection.',      'lab',       'lab_orders',       true, false,60,   '{310}',             '#F59E0B',true),
  (310,4,'Lab',                 'lab_collected', 'Sample Collected',     'Sample collected.',                                  'lab',       'lab_samples',      false,false,30,   '{320}',             '#3B82F6',true),
  (320,4,'Lab',                 'lab_in_progress','Lab In Progress',     'Sample processing in lab.',                          'lab',       'lab_samples',      false,false,120,  '{330}',             '#3B82F6',true),
  (330,4,'Lab',                 'lab_reported',  'Lab Reported',         'Lab result reported (verified/released).',           'lab',       'lab_results',      false,false,2,    '{165,500,600}',     '#10B981',true),
  (400,5,'Radiology',           'imaging_pending','Imaging Pending',     'Radiology order placed, awaiting capture.',          'radiology', 'radiology_orders', true, false,30,   '{410}',             '#F59E0B',true),
  (410,5,'Radiology',           'imaging_done',  'Imaging Done',         'Imaging captured.',                                  'radiology', 'radiology_studies',false,false,5,    '{420}',             '#3B82F6',true),
  (420,5,'Radiology',           'imaging_reported','Imaging Reported',   'Radiology report released.',                         'radiology', 'radiology_reports',false,false,60,   '{165,500,600}',     '#10B981',true),
  (500,6,'Pharmacy',            'rx_pending',    'Rx Pending',           'Prescription queued at pharmacy.',                   'pharmacy',  'prescriptions',    true, false,10,   '{510}',             '#F59E0B',true),
  (510,6,'Pharmacy',            'rx_dispensed',  'Rx Dispensed',         'Prescription fully dispensed.',                      'pharmacy',  'prescriptions',    false,false,1,    '{600}',             '#10B981',true),
  (600,7,'Closed',              'completed',     'Completed',            'OP visit terminal state — closed.',                  null,        'op_visits',        false,true, 0,    '{}',                '#9CA3AF',true),
  (620,7,'IP Handoff',          'ip_admission_recommended','IP Admission Recommended','OPD recommended admission; waiting bed.','front_desk','op_visits',        true, false,60,   '{630}',             '#F59E0B',true),
  (630,7,'IP Handoff',          'transferred_to_ip','Transferred to IP', 'OP visit closed; IP admission created.',             null,        'op_visits',        false,true, 0,    '{}',                '#9CA3AF',true),
  (701,8,'Inpatient',           'admission_pending','Admission Pending', 'IP admission record created; bed not yet allocated.','inpatient', 'ip_admissions',    true, false,60,   '{702}',             '#F59E0B',true),
  (702,8,'Inpatient',           'admitted_ip',   'Admitted',             'Patient admitted, bed assigned.',                    'inpatient', 'ip_admissions',    false,false,null, '{703,704,708}',     '#3B82F6',true),
  (703,8,'Inpatient',           'in_treatment',  'In Treatment',         'Active inpatient treatment.',                        'inpatient', 'ip_admissions',    false,false,null, '{704,708}',         '#3B82F6',true),
  (704,8,'Surgery',             'pre_op',        'Pre-Op',               'Pre-operative workup.',                              'surgery',   'ip_admissions',    false,false,60,   '{705}',             '#F59E0B',true),
  (705,8,'Surgery',             'in_surgery',    'In Surgery',           'In operating theatre.',                              'surgery',   'ip_admissions',    false,false,null, '{706}',             '#3B82F6',true),
  (706,8,'Surgery',             'post_op',       'Post-Op',              'Post-operative recovery.',                           'surgery',   'ip_admissions',    false,false,null, '{707}',             '#3B82F6',true),
  (707,8,'Inpatient',           'mobilized',     'Mobilized',            'Patient mobilised, recovering.',                     'inpatient', 'ip_admissions',    false,false,null, '{708}',             '#10B981',true),
  (708,8,'Inpatient',           'discharge_pending','Discharge Pending', 'Discharge process started.',                         'inpatient', 'ip_admissions',    true, false,60,   '{709}',             '#F59E0B',true),
  (709,8,'Billing',             'final_billed',  'Final Billed',         'Final IP invoice generated.',                        'billing',   'invoices',         true, false,30,   '{710}',             '#F59E0B',true),
  (710,9,'Closed',              'discharged',    'Discharged',           'Patient discharged. Terminal IP state.',             null,        'ip_admissions',    true, true, 0,    '{}',                '#9CA3AF',true)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- 7. stations  (per-tenant physical service points)
-- ---------------------------------------------------------------------
insert into stations (code, tenant_id, slug, display_name, phase, station_type, owning_dept, physical_location, avg_service_time_minutes, is_active) values
  (1, '11111111-1111-1111-1111-111111111111', 'front_desk',         'Front Desk',         1, 'front_desk',     'front_desk', 'Ground floor, Counter 1',  3,  true),
  (2, '11111111-1111-1111-1111-111111111111', 'billing',            'Billing Counter',    3, 'billing',        'billing',    'Ground floor, Counter 2',  4,  true),
  (3, '11111111-1111-1111-1111-111111111111', 'vitals',             'Vitals Room',        1, 'vitals',         'nursing',    'Ground floor, Room 1',     5,  true),
  (4, '11111111-1111-1111-1111-111111111111', 'doctor:priya',       'Dr. Priya Iyer',     2, 'doctor',         'doctor',     '1st floor, Room 101',      15, true),
  (5, '11111111-1111-1111-1111-111111111111', 'lab_collection',     'Lab — Collection',   4, 'lab_collection', 'lab',        'Ground floor, Room 5',     5,  true),
  (6, '11111111-1111-1111-1111-111111111111', 'lab_processing',     'Lab — Processing',   4, 'lab_processing', 'lab',        'Ground floor, Room 5A',    60, true),
  (7, '11111111-1111-1111-1111-111111111111', 'radiology',          'Radiology',          5, 'radiology',      'radiology',  'Ground floor, Room 6',     10, true),
  (8, '11111111-1111-1111-1111-111111111111', 'pharmacy',           'Pharmacy',           6, 'pharmacy',       'pharmacy',   'Ground floor, Counter 3',  4,  true),
  (9, '11111111-1111-1111-1111-111111111111', 'er_triage',          'ER Triage',          0, 'er_triage',      'er',         'Ground floor, ER',         5,  true),
  (10,'11111111-1111-1111-1111-111111111111', 'ip_ward_general',    'General Ward',       8, 'ip_ward',        'inpatient',  '2nd floor, Ward A',        null, true)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- 8. allergies_lookup  (sample seed for FE picker)
-- ---------------------------------------------------------------------
insert into allergies_lookup (tenant_id, allergen_name, allergen_class, drug_class_code, description, is_active, created_by) values
  ('11111111-1111-1111-1111-111111111111', 'Penicillin',          'drug',           'penicillin',    'Beta-lactam antibiotics', true, '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111', 'Cephalosporins',      'drug',           'cephalosporin', 'Cross-reactivity with penicillins possible', true, '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111', 'Sulpha drugs',        'drug',           'sulfonamide',   'Sulfonamide antibiotics', true, '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111', 'NSAIDs',              'drug',           'nsaid',         'Non-steroidal anti-inflammatories', true, '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111', 'Aspirin',             'drug',           'salicylate',    'Salicylates', true, '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111', 'Iodine contrast',     'drug',           'iodine',        'Iodinated radio-contrast media', true, '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111', 'Local anaesthetics',  'drug',           'local_anesthetic','Lidocaine, prilocaine etc.', true, '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111', 'Peanuts',             'food',           null,            'Peanut allergy', true, '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111', 'Shellfish',           'food',           null,            'Shellfish allergy', true, '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111', 'Eggs',                'food',           null,            'Egg allergy', true, '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111', 'Milk / dairy',        'food',           null,            'Lactose / dairy', true, '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111', 'Dust mites',          'environmental',  null,            'Common indoor allergen', true, '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111', 'Pollen',              'environmental',  null,            'Seasonal allergen', true, '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111', 'Latex',               'other',          null,            'Natural rubber latex', true, '44444444-0000-0000-0000-000000000001')
on conflict (tenant_id, allergen_name) do nothing;

-- ---------------------------------------------------------------------
-- 9. chronic_conditions_lookup  (sample seed for FE picker)
-- ---------------------------------------------------------------------
insert into chronic_conditions_lookup (tenant_id, condition_name, icd10_code, description, is_active, created_by) values
  ('11111111-1111-1111-1111-111111111111', 'Type 2 Diabetes Mellitus',     'E11',  'T2DM',                                     true, '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111', 'Type 1 Diabetes Mellitus',     'E10',  'T1DM',                                     true, '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111', 'Hypertension',                  'I10',  'Essential primary hypertension',            true, '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111', 'Coronary Artery Disease',       'I25',  'CAD / ischaemic heart disease',             true, '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111', 'Asthma',                        'J45',  'Bronchial asthma',                          true, '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111', 'COPD',                          'J44',  'Chronic obstructive pulmonary disease',     true, '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111', 'Hypothyroidism',                'E03',  'Underactive thyroid',                       true, '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111', 'Hyperthyroidism',               'E05',  'Overactive thyroid',                        true, '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111', 'Chronic Kidney Disease',        'N18',  'CKD',                                       true, '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111', 'Hyperlipidemia / Dyslipidemia', 'E78',  'High cholesterol',                          true, '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111', 'Osteoarthritis',                'M19',  'Joint degeneration',                        true, '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111', 'Rheumatoid Arthritis',          'M06',  'RA',                                        true, '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111', 'Depression',                    'F32',  'Major depressive disorder',                 true, '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111', 'Anxiety',                       'F41',  'Anxiety disorder',                          true, '44444444-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111', 'Epilepsy',                      'G40',  'Seizure disorder',                          true, '44444444-0000-0000-0000-000000000001')
on conflict (tenant_id, condition_name) do nothing;

-- ---------------------------------------------------------------------
-- 10. audit_excluded_tables  (Tier-3 registry per TSD-02 §4.7)
-- ---------------------------------------------------------------------
insert into audit_excluded_tables (table_name, exclusion_scope, excluded_columns, reason) values
  ('consultation_drafts', 'full',    '{}',          'Autosave volume — drafts churn every few seconds.'),
  ('user_sessions',       'full',    '{}',          'JWT issue/revoke churn — high volume, low audit value.'),
  ('user_preferences',    'full',    '{}',          'UI preferences only — no clinical/financial impact.'),
  ('appointment_slots',   'full',    '{}',          'Bulk-generated daily by slot generator — out of scope here.'),
  ('patient_queue',       'full',    '{}',          'High-churn live queue data; analytics covered by patient_journey_events.'),
  ('notifications',       'columns', '{read_at}',   'Read-receipt churn only; rest of the row is audited.')
on conflict (table_name) do nothing;

-- ---------------------------------------------------------------------
-- 11. patient_mergeable_tables  (registry — referenced by sp_merge_patients)
-- ---------------------------------------------------------------------
insert into patient_mergeable_tables (module, table_name, fk_column, merge_order, is_active, notes) values
  ('patient',      'patient_govt_ids',          'patient_id', 10, true, null),
  ('patient',      'patient_family_history',    'patient_id', 11, true, null),
  ('encounter',    'op_visits',                 'patient_id', 20, true, null),
  ('encounter',    'patient_queue',             'patient_id', 21, true, null),
  ('journey',      'patient_journey_events',    'patient_id', 22, true, 'Append-only — repointed without UPDATE.'),
  ('consultation', 'vitals',                    'patient_id', 30, true, null),
  ('consultation', 'consultations',             'patient_id', 31, true, null),
  ('consultation', 'prescriptions',             'patient_id', 32, true, null),
  ('consultation', 'doctor_recommendations',    'patient_id', 33, true, null),
  ('consultation', 'consultation_drafts',       'patient_id', 34, true, null),
  ('lab',          'lab_orders',                'patient_id', 40, true, null),
  ('lab',          'lab_samples',               'patient_id', 41, true, null),
  ('radiology',    'radiology_orders',          'patient_id', 50, true, null),
  ('attachments',  'file_attachments',          'patient_id', 90, true, null)
on conflict (table_name) do nothing;

-- ---------------------------------------------------------------------
-- 12. Default permissions  (small, illustrative — extend in app migrations)
-- ---------------------------------------------------------------------
insert into permissions (permission_key, module_name, action_name, description, is_active) values
  ('patient.view',              'patient',      'view',     'View patient records',                   true),
  ('patient.edit',              'patient',      'edit',     'Edit patient records',                   true),
  ('consultation.write',        'consultation', 'write',    'Record a consultation',                  true),
  ('consultation.lock',         'consultation', 'lock',     'Lock/sign-off a consultation',           true),
  ('prescription.write',        'consultation', 'write_rx', 'Write a prescription',                   true),
  ('lab.order',                 'lab',          'order',    'Order a lab test',                       true),
  ('lab.result.verify',         'lab',          'verify',   'Verify / release a lab result',          true),
  ('radiology.order',           'radiology',    'order',    'Order a radiology procedure',            true),
  ('radiology.report.verify',   'radiology',    'verify',   'Verify / release a radiology report',    true),
  ('pharmacy.stock.edit',       'pharmacy',     'edit',     'Edit pharmacy stock (POs, adjustments)', true),
  ('billing.discount.approve',  'billing',      'approve',  'Approve discounts above tier threshold', true)
on conflict (permission_key) do nothing;
