-- =====================================================================
-- 900_seed_data.sql
-- Bootstrap seeds for a fresh v3 deployment:
--   * hospital_profile singleton
--   * departments
--   * roles (system roles)
--   * bootstrap admin user
--   * allergies + chronic conditions lookups
--   * stations
--   * audit_excluded_tables registry
--   * system_config defaults
--   * document_templates defaults (minimal)
--
-- All inserts are idempotent (ON CONFLICT DO NOTHING / WHERE NOT EXISTS).
-- Re-running this file is a no-op once seeds are in place.
--
-- IMPORTANT: replace the admin password_hash before going live.
-- The seed uses a placeholder Argon2id hash for the password "ChangeMe!1".
-- =====================================================================

set search_path = public, extensions, pg_catalog;

-- ---------------------------------------------------------------------
-- 0. Patch uuidv7 function search_path on already-deployed databases.
-- The 002_helpers.sql migration is idempotent in source but already
-- recorded as applied, so a fresh CREATE OR REPLACE here updates the
-- function body on the existing cloud database so it can find pgcrypto's
-- gen_random_bytes (which Supabase installs in the `extensions` schema).
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where p.proname = 'uuidv7' and n.nspname = 'pg_catalog'
  ) then
    execute $f$
      create or replace function uuidv7() returns uuid
      language plpgsql
      set search_path = public, extensions, pg_catalog
      as $body$
      declare
        ms  bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
        b   bytea  := decode('000000000000', 'hex') || gen_random_bytes(10);
      begin
        b := set_byte(b, 0, ((ms >> 40) & 255)::int);
        b := set_byte(b, 1, ((ms >> 32) & 255)::int);
        b := set_byte(b, 2, ((ms >> 24) & 255)::int);
        b := set_byte(b, 3, ((ms >> 16) & 255)::int);
        b := set_byte(b, 4, ((ms >>  8) & 255)::int);
        b := set_byte(b, 5, ((ms      ) & 255)::int);
        b := set_byte(b, 6, (get_byte(b, 6) & 15) | 112);
        b := set_byte(b, 8, (get_byte(b, 8) & 63) | 128);
        return encode(b, 'hex')::uuid;
      end
      $body$;
    $f$;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 0b. audit_excluded_tables — register composite-PK + high-volume tables
--     BEFORE any inserts into them, so fn_audit_row() skips them and
--     does not try to write a NULL entity_id into audit_logs.
-- ---------------------------------------------------------------------
insert into audit_excluded_tables (table_name, reason, notes)
select v.table_name, v.reason, v.notes
from (values
  ('audit_logs',            'admin_decision', 'Self-exclusion — auditing the audit table would cause infinite recursion'),
  ('audit_excluded_tables', 'admin_decision', 'Changes here are still logged by fn_audit_row() for non-excluded tables — safe; no recursion'),
  ('user_roles',            'composite_pk',   'Composite PK (user_id, role_id) — no single id column for entity_id'),
  ('role_permissions',      'composite_pk',   'Composite PK (role_id, table_name) — same reason as user_roles'),
  ('user_sessions',         'high_volume',    'last_active_at bumped frequently per active session — Layer 1 + session table itself provide the trail')
) as v(table_name, reason, notes)
where not exists (select 1 from audit_excluded_tables e where e.table_name = v.table_name);

-- ---------------------------------------------------------------------
-- 1. Bootstrap admin user (no created_by yet — points to self after insert)
-- ---------------------------------------------------------------------
insert into users (
  id, employee_id, full_name, designation, joining_date, profile_data,
  username, mobile, email,
  password_hash, password_changed_at, must_change_password,
  status, created_by, created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000001'::uuid,
  'EMP001', 'System Administrator', 'Administrator', current_date, '{"type":"admin"}'::jsonb,
  'admin', '0000000001', 'admin@example.com',
  '$argon2id$v=19$m=65536,t=3,p=4$REPLACE_ME$REPLACE_ME', now(), true,
  'active', null, now(), now()
where not exists (select 1 from users where employee_id = 'EMP001');

-- self-reference: admin's created_by = admin
update users
   set created_by = id
 where employee_id = 'EMP001' and created_by is null;

-- ---------------------------------------------------------------------
-- 2. hospital_profile singleton — created by bootstrap admin
-- ---------------------------------------------------------------------
insert into hospital_profile (
  hospital_code, hospital_name, address, timezone,
  uhid_prefix, uhid_separator, uhid_sequence_padding, uhid_include_year,
  created_by
)
select
  'KH', 'Kumudha Hospital',
  jsonb_build_object(
    'line1', '22 Pondy Salai',
    'line2', null,
    'city',  'Villupuram',
    'state', 'Tamil Nadu',
    'pincode','605602',
    'country','IN',
    'gstStateCode','33'
  ),
  'Asia/Kolkata',
  'KH', '-', 5, true,
  (select id from users where employee_id = 'EMP001')
where not exists (select 1 from hospital_profile);

-- ---------------------------------------------------------------------
-- 3. departments
-- ---------------------------------------------------------------------
insert into departments (dept_name, dept_code, segment, created_by)
select v.dept_name, v.dept_code, v.segment, (select id from users where employee_id = 'EMP001')
from (values
  ('Orthopaedics',    'ORTHO',  'clinical'),
  ('Dermatology',     'DERMA',  'clinical'),
  ('General Medicine','GENMED', 'clinical'),
  ('Cardiology',      'CARDIO', 'clinical'),
  ('Paediatrics',     'PAED',   'clinical'),
  ('Ophthalmology',   'OPHTH',  'clinical'),
  ('General Surgery', 'SURG',   'clinical'),
  ('Laboratory',      'LAB',    'lab'),
  ('Pharmacy',        'PHARMA', 'pharma'),
  ('Radiology',       'RADIO',  'radiology'),
  ('Front Desk',      'FRONT',  'support'),
  ('Nursing',         'NURSE',  'support')
) as v(dept_name, dept_code, segment)
where not exists (
  select 1 from departments d where d.dept_code = v.dept_code and d.deleted_at is null
);

-- assign bootstrap admin to Front Desk
update users
   set department_id = (select id from departments where dept_code = 'FRONT')
 where employee_id = 'EMP001' and department_id is null;

-- ---------------------------------------------------------------------
-- 4. roles (system roles — is_system_role = true)
-- ---------------------------------------------------------------------
insert into roles (role_code, role_name, description, category, is_system_role)
select v.role_code, v.role_name, v.description, v.category, true
from (values
  ('admin',        'Hospital Administrator',   'Full system access; user provisioning; system config',                                  'admin'),
  ('doctor',       'Consultant Doctor',        'Clinical consultations, prescriptions, lab orders',                                     'clinical'),
  ('receptionist', 'Front Desk Receptionist',  'Patient registration, appointment booking, billing intake',                              'support'),
  ('pharmacist',   'Pharmacist',               'Dispensing, stock management, narcotic register',                                       'clinical'),
  ('lab_tech',     'Laboratory Technician',    'Sample collection, result entry (subject to doctor approval)',                          'clinical'),
  ('radiologist',  'Radiologist',              'Radiology reporting and approval',                                                       'clinical'),
  ('nurse',        'Nurse',                    'Vitals capture, patient queue management',                                              'clinical'),
  ('cashier',      'Cashier',                  'Billing, payments, cash counter operations',                                            'support')
) as v(role_code, role_name, description, category)
where not exists (select 1 from roles r where r.role_code = v.role_code and r.deleted_at is null);

-- ---------------------------------------------------------------------
-- 5. user_roles — grant admin role to bootstrap admin
-- ---------------------------------------------------------------------
insert into user_roles (user_id, role_id, is_primary, created_by)
select
  (select id from users where employee_id = 'EMP001'),
  (select id from roles where role_code = 'admin'),
  true,
  (select id from users where employee_id = 'EMP001')
where not exists (
  select 1 from user_roles
   where user_id = (select id from users where employee_id = 'EMP001')
     and role_id = (select id from roles where role_code = 'admin')
);

-- ---------------------------------------------------------------------
-- 6. role_permissions — admin gets full CRUD on all key tables
-- ---------------------------------------------------------------------
insert into role_permissions (role_id, table_name, can_create, can_read, can_update, can_delete, created_by)
select (select id from roles where role_code = 'admin'), t, true, true, true, false,
       (select id from users where employee_id = 'EMP001')
from unnest(array[
  'users','user_sessions','departments','doctor_profiles','doctor_leaves','doctor_registrations','department_heads',
  'roles','user_roles','role_permissions',
  'system_config','user_preferences','holidays',
  'patients','patient_govt_ids','patient_merges','patient_allergies','patient_chronic_conditions',
  'stations','op_visits','patient_states',
  'appointments','appointment_slots','tokens',
  'vitals','consultations','diagnosis_templates','prescriptions','prescription_items','doctor_recommendations',
  'lab_tests','lab_test_groups','lab_orders','lab_order_items','lab_samples','lab_results',
  'radiology_procedures','radiology_orders','radiology_attachments','radiology_reports',
  'vendors','drug_catalogue','drug_stock','purchase_orders','purchase_order_items','narcotic_register',
  'pharmacy_sales','pharmacy_sale_items','pharmacy_returns','pharmacy_return_items',
  'services','invoices','invoice_items','payments','payment_allocations','cash_counters','cash_sessions',
  'allergies_lookup','chronic_conditions_lookup','document_templates'
]) as t
on conflict (role_id, table_name) do nothing;

-- ---------------------------------------------------------------------
-- 7. allergies_lookup
-- ---------------------------------------------------------------------
insert into allergies_lookup (allergy_code, allergy_name, category, description)
select v.allergy_code, v.allergy_name, v.category, v.description
from (values
  ('PENICILLIN',    'Penicillin',    'drug',         'Includes all penicillin-class antibiotics (amoxicillin, ampicillin, etc.)'),
  ('PEANUTS',       'Peanuts',       'food',         'Ground nuts and peanut-derived products'),
  ('SULFONAMIDES',  'Sulfonamides',  'drug',         'Sulpha drugs — cross-reactivity with some diuretics and diabetes medications'),
  ('LATEX',         'Latex',         'environmental','Natural rubber latex — relevant for surgical gloves and medical equipment'),
  ('NSAIDS',        'NSAIDs',        'drug',         'Non-steroidal anti-inflammatory drugs including aspirin, ibuprofen, diclofenac'),
  ('IODINE',        'Iodine',        'drug',         'Iodine-containing contrast media — relevant for radiology'),
  ('SHELLFISH',     'Shellfish',     'food',         'Crustaceans and molluscs')
) as v(allergy_code, allergy_name, category, description)
where not exists (select 1 from allergies_lookup a where a.allergy_code = v.allergy_code);

-- ---------------------------------------------------------------------
-- 8. chronic_conditions_lookup
-- ---------------------------------------------------------------------
insert into chronic_conditions_lookup (condition_code, condition_name, icd10_code, category, description)
select v.condition_code, v.condition_name, v.icd10_code, v.category, v.description
from (values
  ('T2DM',           'Type 2 Diabetes Mellitus', 'E11',   'endocrine',      'Non-insulin-dependent diabetes; chronic condition requiring ongoing management'),
  ('HYPERTENSION',   'Hypertension',             'I10',   'cardiovascular', 'Persistently elevated blood pressure; primary or secondary'),
  ('ASTHMA',         'Asthma',                   'J45',   'respiratory',    'Chronic inflammatory airway disease; includes allergic and non-allergic variants'),
  ('CKD',            'Chronic Kidney Disease',   'N18',   'renal',          'Staged I–V; stage recorded on patient_chronic_conditions row'),
  ('HYPOTHYROIDISM', 'Hypothyroidism',           'E03.9', 'endocrine',      'Underactive thyroid; typically managed with thyroxine replacement'),
  ('COPD',           'COPD',                     'J44',   'respiratory',    'Chronic obstructive pulmonary disease'),
  ('CAD',            'Coronary Artery Disease',  'I25',   'cardiovascular', 'Atherosclerotic heart disease'),
  ('OSTEOARTHRITIS', 'Osteoarthritis',           'M19',   'musculoskeletal','Degenerative joint disease')
) as v(condition_code, condition_name, icd10_code, category, description)
where not exists (select 1 from chronic_conditions_lookup c where c.condition_code = v.condition_code);

-- ---------------------------------------------------------------------
-- 9. stations (Module 08)
-- ---------------------------------------------------------------------
insert into stations (display_name, station_type, display_order, sla_minutes, color)
select v.display_name, v.station_type, v.display_order, v.sla_minutes, v.color
from (values
  ('Reception',             'front_desk',     10,  10, '#6c757d'),
  ('Billing / Cashier',     'billing',        20,  15, '#0d6efd'),
  ('Vitals',                'vitals',         30,  15, '#198754'),
  ('Doctor Consultation',   'doctor',         40,  60, '#6f42c1'),
  ('Lab Collection',        'lab_collection', 50,  30, '#fd7e14'),
  ('Lab — Awaiting Results','lab_processing', 60, 120, '#ffc107'),
  ('Radiology',             'radiology',      70,  60, '#0dcaf0'),
  ('Pharmacy',              'pharmacy',       80,  20, '#20c997')
) as v(display_name, station_type, display_order, sla_minutes, color)
where not exists (select 1 from stations s where s.station_type = v.station_type and s.deleted_at is null);

-- (audit_excluded_tables seeded in §0b above — must happen before user_roles + role_permissions inserts)

-- ---------------------------------------------------------------------
-- 11. system_config defaults
-- ---------------------------------------------------------------------
insert into system_config (config_key, config_value, value_type, category, description, default_value, is_secret)
select v.config_key, v.config_value::jsonb, v.value_type, v.category, v.description, v.default_value::jsonb, v.is_secret
from (values
  ('auth.password_max_age_days',         '0',                  '0',                  'integer', 'auth',     'Days before forced password rotation. 0 = disabled (NIST-aligned).',                false),
  ('auth.lockout_threshold',             '5',                  '5',                  'integer', 'auth',     'Failed login attempts before account locks.',                                      false),
  ('auth.session_idle_timeout_minutes',  '30',                 '30',                 'integer', 'auth',     'Auto-revoke user_sessions after N min idle.',                                      false),
  ('auth.mfa_required_roles',            '["admin"]',          '["admin"]',          'array',   'auth',     'Roles where mfa_enabled = true is mandatory.',                                     false),
  ('billing.invoice_number_prefix',      '"KH-INV-"',          '"INV-"',             'string',  'billing',  'Prefix for generated invoice numbers.',                                            false),
  ('billing.gst_rate',                   '0.18',               '0.18',               'decimal', 'billing',  'GST rate applied to taxable invoice lines.',                                       false),
  ('radiology.allow_self_approval',      'false',              'false',              'boolean', 'radiology','Allow same radiologist to author + approve report (single-radiologist hospitals).',false)
) as v(config_key, config_value, default_value, value_type, category, description, is_secret)
where not exists (select 1 from system_config sc where sc.config_key = v.config_key);

-- ---------------------------------------------------------------------
-- 12. document_templates (minimal — prescription + invoice)
-- ---------------------------------------------------------------------
insert into document_templates (template_code, template_name, template_type, entity_table, content, variables, created_by)
select v.template_code, v.template_name, v.template_type, v.entity_table, v.content, v.variables::jsonb,
       (select id from users where employee_id = 'EMP001')
from (values
  ('PRESCRIPTION_PDF', 'Prescription printout', 'pdf', 'prescriptions',
   '<html><body><h2>{{hospital_name}}</h2><p>Patient: {{patient_uhid}}</p><p>Doctor: {{doctor_name}}</p>{{medicines}}</body></html>',
   '{"required":["hospital_name","doctor_name","patient_uhid","medicines"],"optional":["doctor_signature_path","follow_up_date"]}'),
  ('INVOICE_PDF', 'Patient invoice', 'pdf', 'invoices',
   '<html><body><h2>{{hospital_name}}</h2><p>Invoice: {{invoice_no}}</p><p>Patient: {{patient_name}}</p>{{line_items}}<h3>Total: {{total}}</h3></body></html>',
   '{"required":["invoice_no","patient_name","line_items","total","hospital_name"],"optional":["gst_amount","discount_amount"]}')
) as v(template_code, template_name, template_type, entity_table, content, variables)
where not exists (select 1 from document_templates dt where dt.template_code = v.template_code and dt.deleted_at is null);

-- ---------------------------------------------------------------------
-- 13. uhid_sequences — start fresh for current year
-- ---------------------------------------------------------------------
insert into uhid_sequences (year, last_seq)
values (extract(year from current_date)::int, 0)
on conflict (year) do nothing;
