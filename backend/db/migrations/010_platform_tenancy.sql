-- =====================================================================
-- 010_platform_tenancy.sql
-- Foundation: tenants, users, departments, doctor_profiles, RBAC,
-- sessions, system config, user preferences, holidays, doctor schedules.
--
-- Spec: docs/03-schema/v2/modules/01-platform-tenancy.html
-- TSD : docs/05-tsd/01-platform-tenancy.md
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- 1. tenants
-- ---------------------------------------------------------------------
create table if not exists tenants (
  id                       uuid        primary key default gen_random_uuid(),
  tenant_code              varchar(32) not null unique,
  hospital_name            varchar(200) not null,
  address                  text,
  gst_number               varchar(32),
  license_number           varchar(64),
  logo_path                text,
  timezone                 varchar(64) not null default 'Asia/Kolkata',
  uhid_prefix              varchar(16) not null default 'UHID',
  uhid_separator           varchar(1)  not null default '-',
  uhid_sequence_padding    int         not null default 6,
  uhid_include_year        boolean     not null default true,
  is_active                boolean     not null default true,
  created_at               timestamptz not null default now()
);
comment on table  tenants is 'Hospital identity — top-level organization. Every other row partitions on tenant_id.';
comment on column tenants.tenant_code is 'Short code, e.g. KH (Kumudha Hospital, Villupuram) — UHID prefix.';
comment on column tenants.timezone    is 'IANA timezone — drives day boundaries for session/business reports.';

-- ---------------------------------------------------------------------
-- 2. departments  (referenced by users.department_id, so created next)
-- ---------------------------------------------------------------------
create table if not exists departments (
  id              uuid         primary key default gen_random_uuid(),
  tenant_id       uuid         not null references tenants(id) on delete restrict,
  dept_name       varchar(120) not null,
  dept_code       varchar(32)  not null,
  segment         varchar(32)  not null,
  head_doctor_id  uuid,                        -- FK added later (cycle: users<->departments)
  is_active       boolean      not null default true,
  constraint uq_departments_tenant_code unique (tenant_id, dept_code)
);
comment on table  departments is 'Functional units (Ortho, Derma, Lab, Pharmacy …). Drives routing, fees, reporting splits.';
create index if not exists idx_departments_tenant_active on departments(tenant_id, is_active);

-- ---------------------------------------------------------------------
-- 3. users
-- (created_by/updated_by self-ref; added as deferrable FK after table.)
-- ---------------------------------------------------------------------
create table if not exists users (
  id              uuid         primary key default gen_random_uuid(),
  tenant_id       uuid         not null references tenants(id) on delete restrict,
  employee_id     varchar(32)  not null,
  full_name       varchar(200) not null,
  mobile          varchar(20)  not null,
  email           varchar(200),
  username        varchar(64)  not null,
  password_hash   varchar(255) not null,
  department_id   uuid         references departments(id) on delete restrict,
  designation     varchar(120),
  profile_data    jsonb        not null default '{}'::jsonb,
  status          varchar(16)  not null default 'active',
  last_login_at   timestamptz,
  created_by      uuid,
  created_at      timestamptz  not null default now(),
  updated_by      uuid,
  updated_at      timestamptz  not null default now(),
  version         int          not null default 0,
  constraint chk_users_status check (status in ('active','inactive','suspended')),
  constraint uq_users_tenant_employee unique (tenant_id, employee_id),
  constraint uq_users_tenant_username unique (tenant_id, username),
  constraint uq_users_mobile          unique (mobile)
);
comment on table users is 'All staff accounts — doctors, nurses, receptionists, pharmacists, admins. One row per employee.';

-- self-FK for created_by / updated_by
alter table users
  add constraint fk_users_created_by foreign key (created_by) references users(id) on delete set null,
  add constraint fk_users_updated_by foreign key (updated_by) references users(id) on delete set null;

-- now wire departments.head_doctor_id -> users
alter table departments
  add constraint fk_departments_head_doctor foreign key (head_doctor_id) references users(id) on delete set null;

create index if not exists idx_users_tenant_status on users(tenant_id, status);
create index if not exists idx_users_department    on users(department_id) where department_id is not null;

drop trigger if exists trg_users_updated_at on users;
create trigger trg_users_updated_at
  before update on users
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------
-- 4. doctor_profiles
-- ---------------------------------------------------------------------
create table if not exists doctor_profiles (
  id                     uuid          primary key default gen_random_uuid(),
  user_id                uuid          not null unique references users(id) on delete cascade,
  specialization         varchar(120),
  qualification          varchar(120),
  registration_number    varchar(64),
  consultation_fee       numeric(10,2),
  follow_up_fee          numeric(10,2),
  follow_up_window_days  int           not null default 7,
  available_days         jsonb,
  slot_duration_mins     int           not null default 15,
  signature_path         text
);
comment on table  doctor_profiles is 'Doctor-only attributes — specialization, fees, slot duration, signature. Extends users for clinical staff.';
comment on column doctor_profiles.available_days is 'Weekly availability template, e.g. {"mon":[{"from":"09:00","to":"13:00"}]}.';

-- ---------------------------------------------------------------------
-- 5. roles
-- ---------------------------------------------------------------------
create table if not exists roles (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references tenants(id) on delete restrict,
  role_name       varchar(64) not null,
  description     text,
  is_system_role  boolean     not null default false,
  constraint uq_roles_tenant_name unique (tenant_id, role_name)
);
comment on table roles is 'Named role definitions (admin, receptionist, doctor …) used for permission grouping.';

-- ---------------------------------------------------------------------
-- 6. user_roles
-- ---------------------------------------------------------------------
create table if not exists user_roles (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references users(id) on delete cascade,
  role_id      uuid        not null references roles(id) on delete restrict,
  is_default   boolean     not null default false,
  assigned_by  uuid        references users(id) on delete set null,
  assigned_at  timestamptz not null default now(),
  is_active    boolean     not null default true,
  constraint uq_user_roles unique (user_id, role_id)
);
comment on table user_roles is 'Many-to-many user↔role assignments. A user can hold multiple roles with one default landing role.';
create index if not exists idx_user_roles_user on user_roles(user_id, is_active);

-- ---------------------------------------------------------------------
-- 7. permissions  (global — not tenant scoped)
-- ---------------------------------------------------------------------
create table if not exists permissions (
  id              uuid         primary key default gen_random_uuid(),
  permission_key  varchar(120) not null unique,
  module_name     varchar(64)  not null,
  action_name     varchar(64)  not null,
  description     text,
  is_active       boolean      not null default true
);
comment on table permissions is 'Atomic permission keys (e.g. pharmacy.stock.edit). The catalog of every gated action.';

-- ---------------------------------------------------------------------
-- 8. role_permissions
-- ---------------------------------------------------------------------
create table if not exists role_permissions (
  id             uuid        primary key default gen_random_uuid(),
  role_id        uuid        not null references roles(id) on delete cascade,
  permission_id  uuid        not null references permissions(id) on delete cascade,
  granted_by     uuid        references users(id) on delete set null,
  granted_at     timestamptz not null default now(),
  constraint uq_role_permissions unique (role_id, permission_id)
);
comment on table role_permissions is 'Grants — which permissions a role carries. Joining table for role↔permission.';

-- ---------------------------------------------------------------------
-- 9. user_sessions
-- ---------------------------------------------------------------------
create table if not exists user_sessions (
  id          uuid         primary key default gen_random_uuid(),
  user_id     uuid         not null references users(id) on delete cascade,
  token_hash  varchar(255) not null,
  ip_address  varchar(64),
  device_info text,
  created_at  timestamptz  not null default now(),
  expires_at  timestamptz  not null,
  is_active   boolean      not null default true
);
comment on table user_sessions is 'Active login sessions. Token hash, device, expiry — used by the auth middleware.';
create index if not exists idx_user_sessions_token  on user_sessions(token_hash);
create index if not exists idx_user_sessions_active on user_sessions(user_id, is_active);

-- ---------------------------------------------------------------------
-- 10. system_config  (Layer 2 maker-checker)
-- ---------------------------------------------------------------------
create table if not exists system_config (
  id                 uuid         primary key default gen_random_uuid(),
  tenant_id          uuid         not null references tenants(id) on delete restrict,
  config_key         varchar(120) not null,
  config_value       text         not null,
  description        text,
  approval_status    varchar(16)  not null default 'approved',
  approved_by        uuid         references users(id) on delete set null,
  approved_at        timestamptz,
  rejection_reason   text,
  updated_by         uuid         references users(id) on delete set null,
  updated_at         timestamptz  not null default now(),
  constraint chk_system_config_approval check (approval_status in ('pending','approved','rejected')),
  constraint uq_system_config_key       unique (tenant_id, config_key)
);
comment on table system_config is 'Tenant-scoped key/value settings. Layer 2 maker-checker on changes.';

drop trigger if exists trg_system_config_updated_at on system_config;
create trigger trg_system_config_updated_at
  before update on system_config
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------
-- 11. user_preferences
-- ---------------------------------------------------------------------
create table if not exists user_preferences (
  id                    uuid        primary key default gen_random_uuid(),
  user_id               uuid        not null unique references users(id) on delete cascade,
  default_role_id       uuid        references roles(id) on delete set null,
  default_landing_path  varchar(200),
  theme                 varchar(16) not null default 'system',
  language              varchar(8)  not null default 'en',
  date_format           varchar(16) not null default 'DD-MM-YYYY',
  notifications_email   boolean     not null default true,
  notifications_inapp   boolean     not null default true,
  notifications_sms     boolean     not null default false,
  updated_at            timestamptz not null default now(),
  constraint chk_user_preferences_theme check (theme in ('light','dark','system'))
);
comment on table user_preferences is 'Per-user UI settings — theme, language, default landing role/path, notification channels.';

drop trigger if exists trg_user_preferences_updated_at on user_preferences;
create trigger trg_user_preferences_updated_at
  before update on user_preferences
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------
-- 12. tenant_holidays
-- ---------------------------------------------------------------------
create table if not exists tenant_holidays (
  id                 uuid         primary key default gen_random_uuid(),
  tenant_id          uuid         not null references tenants(id) on delete restrict,
  holiday_date       date         not null,
  holiday_name       varchar(120) not null,
  holiday_type       varchar(32)  not null,
  affects_op         boolean      not null default true,
  affects_ip         boolean      not null default false,
  affects_pharmacy   boolean      not null default false,
  affects_lab        boolean      not null default true,
  affects_radiology  boolean      not null default true,
  notes              text,
  created_by         uuid         references users(id) on delete set null,
  created_at         timestamptz  not null default now(),
  updated_by         uuid         references users(id) on delete set null,
  updated_at         timestamptz  not null default now(),
  version            int          not null default 0,
  constraint chk_tenant_holidays_type
    check (holiday_type in ('national','regional','restricted','hospital','state','religious','hospital_specific')),
  constraint uq_tenant_holidays_date unique (tenant_id, holiday_date)
);
comment on table tenant_holidays is 'Hospital closure calendar — blocks slot generation per service area (OP/IP/pharmacy/lab/radiology).';

drop trigger if exists trg_tenant_holidays_updated_at on tenant_holidays;
create trigger trg_tenant_holidays_updated_at
  before update on tenant_holidays
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------
-- 13. doctor_schedules
-- ---------------------------------------------------------------------
create table if not exists doctor_schedules (
  id                  uuid        primary key default gen_random_uuid(),
  tenant_id           uuid        not null references tenants(id) on delete restrict,
  doctor_id           uuid        not null references users(id) on delete cascade,
  day_of_week         int         not null,
  start_time          time        not null,
  end_time            time        not null,
  slot_duration_mins  int         not null,
  effective_from      date        not null,
  effective_to        date,
  is_active           boolean     not null default true,
  constraint chk_doctor_schedules_day check (day_of_week between 0 and 6),
  constraint chk_doctor_schedules_time check (start_time < end_time)
);
comment on table doctor_schedules is 'Per-doctor weekly availability template — used to generate appointment_slots.';
create index if not exists idx_doctor_schedules_doctor on doctor_schedules(tenant_id, doctor_id, is_active);
