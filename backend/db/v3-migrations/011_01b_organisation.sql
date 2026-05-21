-- =====================================================================
-- 011_01b_organisation.sql
-- Module 01B — Organisation
-- Tables: departments, doctor_profiles (1:1 shared-PK), doctor_leaves,
--         doctor_registrations, department_heads
-- Spec: docs/03-schema/v3/modules/01b-organisation.html
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- departments
-- ---------------------------------------------------------------------
create table if not exists departments (
  id          uuid         primary key default uuidv7(),
  dept_name   text         not null,
  dept_code   text         not null,
  segment     text         not null,
  -- uniform block
  created_by  uuid         references users(id) on delete set null,
  created_at  timestamptz  not null default now(),
  updated_by  uuid         references users(id) on delete set null,
  updated_at  timestamptz  not null default now(),
  version     int          not null default 0,
  deleted_at  timestamptz,
  deleted_by  uuid         references users(id) on delete set null,
  constraint chk_departments_dept_code_len check (char_length(dept_code) between 2 and 16),
  constraint chk_departments_segment       check (segment in ('clinical','lab','pharma','radiology','support','er','inpatient'))
);

comment on table departments is 'Functional units of the hospital (Ortho, Cardio, Lab, Pharmacy, …). Drives staff routing, dept-wise revenue rollups, approval scoping.';

create unique index if not exists uq_departments_dept_code   on departments (dept_code) where deleted_at is null;
create index        if not exists ix_departments_segment_active on departments (segment) where deleted_at is null;

drop trigger if exists tr_departments_bu_touch on departments;
create trigger tr_departments_bu_touch
  before update on departments
  for each row execute function fn_touch_updated();

drop trigger if exists tr_departments_au_audit on departments;
create trigger tr_departments_au_audit
  after insert or update or delete on departments
  for each row execute function fn_audit_row();

-- now wire users.department_id (forward-declared in 010)
alter table users
  add constraint fk_users_department foreign key (department_id) references departments(id) on delete restrict;

-- ---------------------------------------------------------------------
-- doctor_profiles  (1:1 shared-PK extension of users)
-- ---------------------------------------------------------------------
create table if not exists doctor_profiles (
  user_id                uuid         primary key references users(id) on delete cascade,
  qualification          text,
  consultation_fee       numeric(14,2),
  follow_up_fee          numeric(14,2),
  follow_up_window_days  int          not null default 7,
  available_days         jsonb,
  slot_duration_mins     int          not null default 15,
  signature_path         text,
  -- uniform block
  created_by             uuid         references users(id) on delete set null,
  created_at             timestamptz  not null default now(),
  updated_by             uuid         references users(id) on delete set null,
  updated_at             timestamptz  not null default now(),
  version                int          not null default 0,
  deleted_at             timestamptz,
  deleted_by             uuid         references users(id) on delete set null,
  constraint chk_doctor_profiles_consultation_fee check (consultation_fee is null or consultation_fee >= 0),
  constraint chk_doctor_profiles_follow_up_fee    check (follow_up_fee    is null or follow_up_fee    >= 0),
  constraint chk_doctor_profiles_window           check (follow_up_window_days between 1 and 365),
  constraint chk_doctor_profiles_slot             check (slot_duration_mins  between 5 and 120),
  constraint chk_doctor_profiles_available_days   check (available_days is null or fn_validate_available_days(available_days))
);

comment on table doctor_profiles is 'Doctor-only attributes — qualification, consultation/follow-up fees (source of truth — read by invoice-line code), weekly availability template, digital signature. Strict 1:1 with users (shared-PK pattern).';

drop trigger if exists tr_doctor_profiles_bu_touch on doctor_profiles;
create trigger tr_doctor_profiles_bu_touch
  before update on doctor_profiles
  for each row execute function fn_touch_updated();

drop trigger if exists tr_doctor_profiles_au_audit on doctor_profiles;
create trigger tr_doctor_profiles_au_audit
  after insert or update or delete on doctor_profiles
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- doctor_leaves  (one row per doctor × date)
-- ---------------------------------------------------------------------
create table if not exists doctor_leaves (
  id            uuid         primary key default uuidv7(),
  doctor_id     uuid         not null references users(id) on delete restrict,
  leave_date    date         not null,
  leave_type    text         not null,
  reason        text,
  approved_by   uuid         references users(id) on delete set null,
  -- uniform block
  created_by    uuid         not null references users(id) on delete set null,
  created_at    timestamptz  not null default now(),
  updated_by    uuid         references users(id) on delete set null,
  updated_at    timestamptz  not null default now(),
  version       int          not null default 0,
  deleted_at    timestamptz,
  deleted_by    uuid         references users(id) on delete set null,
  constraint chk_doctor_leaves_type check (leave_type in ('sick','vacation','conference','emergency','other'))
);

comment on table doctor_leaves is 'Individual doctor leave / unavailability days. One row per (doctor × date). Slot generator suppresses slots for the doctor on the date even if the weekday template would allow them.';

create unique index if not exists uq_doctor_leaves_doctor_date
  on doctor_leaves (doctor_id, leave_date)
  where deleted_at is null;

create index if not exists ix_doctor_leaves_doctor_date
  on doctor_leaves (doctor_id, leave_date)
  where deleted_at is null;

drop trigger if exists tr_doctor_leaves_bu_touch on doctor_leaves;
create trigger tr_doctor_leaves_bu_touch
  before update on doctor_leaves
  for each row execute function fn_touch_updated();

drop trigger if exists tr_doctor_leaves_au_audit on doctor_leaves;
create trigger tr_doctor_leaves_au_audit
  after insert or update or delete on doctor_leaves
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- doctor_registrations  (N:1 child of users; per medical council)
-- ---------------------------------------------------------------------
create table if not exists doctor_registrations (
  id                    uuid         primary key default uuidv7(),
  user_id               uuid         not null references users(id) on delete restrict,
  council               text         not null,
  registration_number   text         not null,
  registered_at         date         not null,
  valid_until           date,
  is_primary            boolean      not null default false,
  status                text         not null default 'active',
  notes                 text,
  -- uniform block
  created_by            uuid         not null references users(id) on delete set null,
  created_at            timestamptz  not null default now(),
  updated_by            uuid         references users(id) on delete set null,
  updated_at            timestamptz  not null default now(),
  version               int          not null default 0,
  deleted_at            timestamptz,
  deleted_by            uuid         references users(id) on delete set null,
  constraint chk_doctor_registrations_council_len  check (char_length(council) between 2 and 10),
  constraint chk_doctor_registrations_number_len   check (char_length(registration_number) between 3 and 32),
  constraint chk_doctor_registrations_validity     check (valid_until is null or valid_until > registered_at),
  constraint chk_doctor_registrations_status       check (status in ('active','lapsed','revoked','historical'))
);

comment on table doctor_registrations is 'Medical-council registrations held by clinical staff. One row per (doctor × council). Replaces the single doctor_profiles.registration_number column from earlier v3 drafts. Supports state council + NMC + historical regs.';

create unique index if not exists uq_doctor_registrations_pair
  on doctor_registrations (council, registration_number)
  where deleted_at is null;

create unique index if not exists uq_doctor_registrations_primary
  on doctor_registrations (user_id)
  where is_primary = true and status = 'active' and deleted_at is null;

create index if not exists ix_doctor_registrations_user
  on doctor_registrations (user_id, status)
  where deleted_at is null;

create index if not exists ix_doctor_registrations_renewal
  on doctor_registrations (valid_until)
  where valid_until is not null and status = 'active' and deleted_at is null;

drop trigger if exists tr_doctor_registrations_bu_touch on doctor_registrations;
create trigger tr_doctor_registrations_bu_touch
  before update on doctor_registrations
  for each row execute function fn_touch_updated();

drop trigger if exists tr_doctor_registrations_au_audit on doctor_registrations;
create trigger tr_doctor_registrations_au_audit
  after insert or update or delete on doctor_registrations
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- department_heads  (M:N — formal department roles with history)
-- ---------------------------------------------------------------------
create table if not exists department_heads (
  id              uuid         primary key default uuidv7(),
  department_id   uuid         not null references departments(id) on delete cascade,
  user_id         uuid         not null references users(id) on delete restrict,
  role_type       text         not null,
  started_at      date         not null default current_date,
  ended_at        date,
  notes           text,
  -- uniform block
  created_by      uuid         not null references users(id) on delete set null,
  created_at      timestamptz  not null default now(),
  updated_by      uuid         references users(id) on delete set null,
  updated_at      timestamptz  not null default now(),
  version         int          not null default 0,
  deleted_at      timestamptz,
  deleted_by      uuid         references users(id) on delete set null,
  constraint chk_department_heads_role   check (role_type in ('head','co_head','acting_head','senior_consultant','junior_consultant','registrar','intern')),
  constraint chk_department_heads_period check (ended_at is null or ended_at >= started_at)
);

comment on table department_heads is 'Formal clinical roles within a department (head / co_head / acting_head / senior / junior / registrar / intern). Many-to-many between users and departments with history (started_at, ended_at). Replaces v2 departments.head_doctor_id.';

create unique index if not exists uq_department_heads_one_head_per_dept
  on department_heads (department_id)
  where role_type = 'head' and ended_at is null and deleted_at is null;

create unique index if not exists uq_department_heads_user_role
  on department_heads (department_id, user_id, role_type)
  where ended_at is null and deleted_at is null;

create index if not exists ix_department_heads_current
  on department_heads (department_id, role_type)
  where ended_at is null and deleted_at is null;

create index if not exists ix_department_heads_user_active
  on department_heads (user_id)
  where ended_at is null and deleted_at is null;

drop trigger if exists tr_department_heads_bu_touch on department_heads;
create trigger tr_department_heads_bu_touch
  before update on department_heads
  for each row execute function fn_touch_updated();

drop trigger if exists tr_department_heads_au_audit on department_heads;
create trigger tr_department_heads_au_audit
  after insert or update or delete on department_heads
  for each row execute function fn_audit_row();
