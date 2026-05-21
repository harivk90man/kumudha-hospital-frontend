-- Exclude shared-PK tables from audit (no `id` column means fn_audit_row
-- writes NULL into audit_logs.entity_id and violates NOT NULL).
insert into audit_excluded_tables (table_name, reason, notes)
select v.table_name, v.reason, v.notes
from (values
  ('doctor_profiles',  'composite_pk', 'Shared-PK pattern — user_id is both PK and FK; no `id` column'),
  ('user_preferences', 'composite_pk', 'Shared-PK pattern — user_id is both PK and FK; no `id` column')
) as v(table_name, reason, notes)
where not exists (select 1 from audit_excluded_tables e where e.table_name = v.table_name);

-- Add demo users for login: doctor (priya) + receptionist (naveen).
-- The login() function ignores password, so any seeded username works.

insert into users (
  id, employee_id, full_name, designation, joining_date, profile_data,
  username, mobile, email, password_hash, password_changed_at,
  must_change_password, status, created_by
)
select
  '00000000-0000-0000-0000-000000000002'::uuid,
  'EMP002', 'Dr. Priya Iyer', 'Consultant Orthopaedic Surgeon', '2024-01-15',
  '{"type":"doctor","specialization":"Orthopaedics","registrationNo":"TNMC-78921","languages":["English","Tamil"]}'::jsonb,
  'priya', '9876500002', 'priya@example.com', 'demo', now(), false, 'active',
  '00000000-0000-0000-0000-000000000001'::uuid
where not exists (select 1 from users where username = 'priya');

insert into users (
  id, employee_id, full_name, designation, joining_date, profile_data,
  username, mobile, email, password_hash, password_changed_at,
  must_change_password, status, created_by
)
select
  '00000000-0000-0000-0000-000000000003'::uuid,
  'EMP020', 'Naveen Rajan', 'Receptionist', '2024-05-20',
  '{"type":"receptionist","tills":["till-1"]}'::jsonb,
  'naveen', '9876500020', 'naveen@example.com', 'demo', now(), false, 'active',
  '00000000-0000-0000-0000-000000000001'::uuid
where not exists (select 1 from users where username = 'naveen');

-- Assign primary roles.
insert into user_roles (user_id, role_id, is_primary, created_by)
select '00000000-0000-0000-0000-000000000002'::uuid,
       (select id from roles where role_code = 'doctor'),
       true,
       '00000000-0000-0000-0000-000000000001'::uuid
where not exists (
  select 1 from user_roles
  where user_id = '00000000-0000-0000-0000-000000000002'::uuid
    and role_id = (select id from roles where role_code = 'doctor')
);

insert into user_roles (user_id, role_id, is_primary, created_by)
select '00000000-0000-0000-0000-000000000003'::uuid,
       (select id from roles where role_code = 'receptionist'),
       true,
       '00000000-0000-0000-0000-000000000001'::uuid
where not exists (
  select 1 from user_roles
  where user_id = '00000000-0000-0000-0000-000000000003'::uuid
    and role_id = (select id from roles where role_code = 'receptionist')
);

-- Assign Dr Priya to Ortho and give her a doctor_profile.
update users
   set department_id = (select id from departments where dept_code = 'ORTHO')
 where employee_id = 'EMP002'
   and department_id is null;

insert into doctor_profiles (
  user_id, qualification, consultation_fee, follow_up_fee,
  follow_up_window_days, slot_duration_mins, created_by
)
select '00000000-0000-0000-0000-000000000002'::uuid,
       'MBBS, MS (Ortho)', 500.00, 300.00, 7, 15,
       '00000000-0000-0000-0000-000000000001'::uuid
where not exists (
  select 1 from doctor_profiles
   where user_id = '00000000-0000-0000-0000-000000000002'::uuid
);

select 'users' as t, count(*)::text as n from users
union all select 'doctors', count(*)::text from doctor_profiles
union all select 'user_roles', count(*)::text from user_roles
order by t;
