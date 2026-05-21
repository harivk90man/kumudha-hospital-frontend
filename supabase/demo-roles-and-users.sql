-- =====================================================================
-- demo-roles-and-users.sql
-- Align DB roles with the UI's 7-role enum and seed 11 named users.
--
-- UI roles (single source of truth: frontend/src/features/auth/authTypes.ts):
--   frontdesk | doctor | chief_doctor | pharma | inventory | lab_radio | owner
--
-- Each user can hold multiple roles via user_roles (M:M bridge).
-- Exactly one row per user has is_primary = true — that drives login routing.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Insert the 7 UI-aligned role rows.
--    Old rows (admin/receptionist/nurse/cashier/pharmacist/lab_tech/radiologist)
--    are migrated to the new ones in §2, then soft-deleted in §3.
-- ---------------------------------------------------------------------
insert into roles (role_code, role_name, description, category, is_system_role)
select v.role_code, v.role_name, v.description, v.category, true
from (values
  ('frontdesk',    'Front Desk',      'Registration, appointments, vitals + nurse station, billing intake',     'support'),
  ('doctor',       'Doctor',          'Clinical consultations, prescriptions, lab + radiology orders',          'clinical'),
  ('chief_doctor', 'Chief Doctor',    'Doctor + owner surfaces; co-runs the practice with the owner',           'clinical'),
  ('pharma',       'Pharmacy',        'Dispensing, stock visibility, narcotic register',                        'clinical'),
  ('inventory',    'Inventory',       'Drug + supply catalogue, vendors, purchase orders, stock movements',     'support'),
  ('lab_radio',    'Lab / Radiology', 'Sample collection, lab results, radiology orders + reports',             'clinical'),
  ('owner',        'Owner',           'Full analytical + management view of the hospital; can assign roles',    'admin')
) as v(role_code, role_name, description, category)
where not exists (select 1 from roles r where r.role_code = v.role_code);

-- ---------------------------------------------------------------------
-- 2. Migrate any existing user_roles rows that point at retired roles
--    to point at the new role ids.
-- ---------------------------------------------------------------------
do $$
declare
  old_to_new text[][] := array[
    ['admin',        'owner'],
    ['receptionist', 'frontdesk'],
    ['nurse',        'frontdesk'],
    ['cashier',      'frontdesk'],
    ['pharmacist',   'pharma'],
    ['lab_tech',     'lab_radio'],
    ['radiologist',  'lab_radio']
  ];
  pair text[];
  old_id uuid;
  new_id uuid;
begin
  foreach pair slice 1 in array old_to_new loop
    select id into old_id from roles where role_code = pair[1] and deleted_at is null;
    select id into new_id from roles where role_code = pair[2] and deleted_at is null;
    if old_id is not null and new_id is not null then
      -- Skip rows that already have the destination role (would collide on the composite PK).
      delete from user_roles
       where role_id = old_id
         and exists (select 1 from user_roles u2 where u2.user_id = user_roles.user_id and u2.role_id = new_id);
      update user_roles set role_id = new_id where role_id = old_id;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. Soft-delete the retired role rows.
-- ---------------------------------------------------------------------
update roles
   set deleted_at = now(),
       deleted_by = '00000000-0000-0000-0000-000000000001'::uuid
 where role_code in ('admin','receptionist','nurse','cashier','pharmacist','lab_tech','radiologist')
   and deleted_at is null;

-- ---------------------------------------------------------------------
-- 4. Ensure the departments we need exist (mock data introduces Dental,
--    OB-GYN, Physiotherapy which v3 seed did not include).
-- ---------------------------------------------------------------------
insert into departments (dept_name, dept_code, segment, created_by)
select v.dept_name, v.dept_code, v.segment, '00000000-0000-0000-0000-000000000001'::uuid
from (values
  ('Dental',                  'DENT',  'clinical'),
  ('Obstetrics & Gynaecology','OBGYN', 'clinical'),
  ('Physiotherapy',           'PHYSIO','clinical')
) as v(dept_name, dept_code, segment)
where not exists (select 1 from departments d where d.dept_code = v.dept_code and d.deleted_at is null);

-- ---------------------------------------------------------------------
-- 5. Seed 11 demo users.
--    Login() ignores the password column, so any input lets them in.
-- ---------------------------------------------------------------------
-- Helper: emit `insert ... where not exists` with username + role
do $$
declare
  bootstrap uuid := '00000000-0000-0000-0000-000000000001';
  u record;
  dept uuid;
begin
  -- (username, employee_id, full_name, designation, mobile, email, dept_code, profile_data)
  for u in
    select * from (values
      ('priya',          'EMP100', 'Priya Iyer',           'Front Desk',     '9876510001', 'priya@example.com',          'FRONT',  '{"type":"receptionist","tills":["till-1"]}'::jsonb),
      ('drnaveen',       'EMP101', 'Dr. K Naveen Kumar',   'Orthopaedic Surgeon', '9876510002', 'naveen.kumar@example.com',   'ORTHO',  '{"type":"doctor","specialization":"Orthopaedics","registrationNo":"TNMC-78921","languages":["English","Tamil"]}'::jsonb),
      ('dranand',        'EMP102', 'Dr. Anand Krishnan',   'General Physician',   '9876510003', 'anand@example.com',          'GENMED', '{"type":"doctor","specialization":"General Medicine","registrationNo":"TNMC-45128","languages":["English","Tamil","Hindi"]}'::jsonb),
      ('drmeera',        'EMP103', 'Dr. Meera Suresh',     'Dentist',             '9876510004', 'meera@example.com',          'DENT',   '{"type":"doctor","specialization":"Dental","registrationNo":"TNMC-52310","languages":["English","Tamil"]}'::jsonb),
      ('drlakshmi',      'EMP104', 'Dr. Lakshmi Bharath',  'OB-GYN',              '9876510005', 'lakshmi@example.com',        'OBGYN',  '{"type":"doctor","specialization":"Obstetrics & Gynaecology","registrationNo":"TNMC-48772","languages":["English","Tamil"]}'::jsonb),
      ('drravi',         'EMP105', 'Dr. Ravi Shankar',     'Physiotherapist',     '9876510006', 'ravi@example.com',           'PHYSIO', '{"type":"doctor","specialization":"Physiotherapy","registrationNo":"TNMC-39120","languages":["English","Tamil"]}'::jsonb),
      ('naveenkumar',    'EMP106', 'Naveenkumar',          'Chief Doctor',        '9876510007', 'chief@example.com',          'GENMED', '{"type":"doctor","specialization":"General Medicine","registrationNo":"TNMC-31055","languages":["English","Tamil"]}'::jsonb),
      ('amudha',         'EMP107', 'Amudha',               'Pharmacist',          '9876510008', 'amudha@example.com',         'PHARMA', '{"type":"pharmacist","narcotic_licence":"NL-2024-018"}'::jsonb),
      ('suresh',         'EMP108', 'Suresh',               'Inventory Manager',   '9876510009', 'suresh@example.com',         'PHARMA', '{"type":"receptionist"}'::jsonb),
      ('gopi',           'EMP109', 'Gopi',                 'Lab / Radiology Tech','9876510010', 'gopi@example.com',           'LAB',    '{"type":"lab_tech"}'::jsonb),
      ('kuppan',         'EMP110', 'Kuppan',               'Owner',               '9876510011', 'kuppan@example.com',         'FRONT',  '{"type":"admin"}'::jsonb)
    ) as t(username, employee_id, full_name, designation, mobile, email, dept_code, profile_data)
  loop
    select id into dept from departments where dept_code = u.dept_code and deleted_at is null;
    insert into users (
      employee_id, full_name, designation, joining_date, department_id, profile_data,
      username, mobile, email, password_hash, password_changed_at,
      must_change_password, status, created_by
    )
    select u.employee_id, u.full_name, u.designation, current_date, dept, u.profile_data,
           u.username, u.mobile, u.email, 'demo', now(),
           false, 'active', bootstrap
    where not exists (select 1 from users where username = u.username);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 6. Assign primary role to each user (idempotent — won't re-add if exists).
-- ---------------------------------------------------------------------
do $$
declare
  bootstrap uuid := '00000000-0000-0000-0000-000000000001';
  pair record;
  u uuid;
  r uuid;
begin
  for pair in
    select * from (values
      ('priya',       'frontdesk'),
      ('drnaveen',    'doctor'),
      ('dranand',     'doctor'),
      ('drmeera',     'doctor'),
      ('drlakshmi',   'doctor'),
      ('drravi',      'doctor'),
      ('naveenkumar', 'chief_doctor'),
      ('amudha',      'pharma'),
      ('suresh',      'inventory'),
      ('gopi',        'lab_radio'),
      ('kuppan',      'owner')
    ) as t(username, role_code)
  loop
    select id into u from users where username = pair.username and deleted_at is null;
    select id into r from roles where role_code = pair.role_code and deleted_at is null;
    if u is not null and r is not null then
      -- Demote any existing primary so the new INSERT can be primary.
      update user_roles set is_primary = false
       where user_id = u and is_primary = true and deleted_at is null;
      -- Insert (skip if pair already exists) and ensure is_primary = true.
      insert into user_roles (user_id, role_id, is_primary, created_by)
      select u, r, true, bootstrap
      where not exists (
        select 1 from user_roles where user_id = u and role_id = r
      );
      update user_roles set is_primary = true
       where user_id = u and role_id = r and deleted_at is null;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 7. Ensure every doctor has a doctor_profile (so fetchBookableDoctors finds them).
-- ---------------------------------------------------------------------
do $$
declare
  bootstrap uuid := '00000000-0000-0000-0000-000000000001';
  u record;
begin
  for u in
    select usr.id, usr.profile_data
      from users usr
      join user_roles ur on ur.user_id = usr.id and ur.deleted_at is null
      join roles      r  on r.id = ur.role_id and r.deleted_at is null
     where r.role_code in ('doctor','chief_doctor')
       and usr.deleted_at is null
  loop
    insert into doctor_profiles (
      user_id, qualification, consultation_fee, follow_up_fee,
      follow_up_window_days, slot_duration_mins, created_by
    )
    select u.id, 'MBBS', 500.00, 300.00, 7, 15, bootstrap
    where not exists (select 1 from doctor_profiles dp where dp.user_id = u.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------
select usr.username,
       usr.full_name,
       string_agg(r.role_code, ', ' order by ur.is_primary desc, r.role_code) as roles
  from users usr
  left join user_roles ur on ur.user_id = usr.id and ur.deleted_at is null
  left join roles      r  on r.id = ur.role_id and r.deleted_at is null
 where usr.deleted_at is null
 group by usr.username, usr.full_name
 order by usr.username;
