-- =====================================================================
-- consolidated.sql
-- Hospital Management System — full schema in one file.
--
-- WHAT THIS IS
--   Every migration in frontend/db/migrations/ concatenated in numerical
--   order so the entire database can be provisioned in a single round-trip.
--
-- WHEN TO USE
--   * First-time provisioning of a fresh Supabase project (or any clean
--     Postgres database) when you do not want to run migrations one by one.
--   * Re-creating a throwaway dev database from scratch.
--
-- HOW TO RUN (Supabase)
--   1. Open Supabase dashboard -> SQL editor -> "New query".
--   2. Paste the entire contents of this file.
--   3. Click "Run".
--   4. Verify success: every section ends with no errors and the schema
--      browser shows tables under the public schema.
--
-- HOW TO RUN (psql / generic Postgres)
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f frontend/db/consolidated.sql
--
-- IDEMPOTENCY
--   The file is safe to re-run. Every CREATE uses IF NOT EXISTS, every
--   FUNCTION uses CREATE OR REPLACE, every seed INSERT uses
--   ON CONFLICT DO NOTHING. No statement was rewritten during
--   concatenation -- this is a straight cat of the migration files.
--
-- SOURCE OF TRUTH
--   The individual files in frontend/db/migrations/ are the source of
--   truth. This file is regenerated from them; do NOT hand-edit it.
--   Edit the relevant migration file and regenerate.
-- =====================================================================

-- =====================================================================
-- 001_extensions.sql
-- =====================================================================
-- =====================================================================
-- 001_extensions.sql
-- Required Postgres extensions and session settings.
-- Safe to run multiple times.
-- =====================================================================

set search_path = public;

-- gen_random_uuid() â€” used as DEFAULT on every PK.
create extension if not exists pgcrypto;

-- Trigram fuzzy search â€” used by patient name / mobile lookups.
create extension if not exists pg_trgm;

-- Belt-and-braces UUID source. pgcrypto's gen_random_uuid is sufficient
-- for our defaults; uuid-ossp is enabled because some Spring tooling
-- generates uuid_generate_v4() expressions.
create extension if not exists "uuid-ossp";

-- btree_gin lets GIN indexes coexist with btree composites
-- (useful for some of the partial GIN indexes below).
create extension if not exists btree_gin;

-- =====================================================================
-- 002_helpers.sql
-- =====================================================================
-- =====================================================================
-- 002_helpers.sql
-- Shared trigger functions reused by every business table.
--   * fn_set_updated_at  â€” BEFORE UPDATE: bumps updated_at to now()
--   * fn_append_only_guard â€” BEFORE UPDATE OR DELETE on ledger tables
--                            (audit_logs, domain_events,
--                             patient_journey_events, stock_movements,
--                             narcotic_register)
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- fn_set_updated_at
-- Generic BEFORE UPDATE trigger. Sets NEW.updated_at = now().
-- Attach with:
--   create trigger trg_<table>_updated_at
--     before update on <table>
--     for each row execute function fn_set_updated_at();
-- ---------------------------------------------------------------------
create or replace function fn_set_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- fn_append_only_guard
-- Used by ledger / audit tables that must never be updated or deleted.
-- Attach with:
--   create trigger trg_<table>_append_only
--     before update or delete on <table>
--     for each row execute function fn_append_only_guard();
-- ---------------------------------------------------------------------
create or replace function fn_append_only_guard() returns trigger
language plpgsql
as $$
begin
  raise exception 'table % is append-only â€” UPDATE / DELETE is not permitted', tg_table_name
    using errcode = '42501';
end;
$$;

-- =====================================================================
-- 010_platform_tenancy.sql
-- =====================================================================
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
comment on table  tenants is 'Hospital identity â€” top-level organization. Every other row partitions on tenant_id.';
comment on column tenants.tenant_code is 'Short code, e.g. KH (Kumudha Hospital, Villupuram) â€” UHID prefix.';
comment on column tenants.timezone    is 'IANA timezone â€” drives day boundaries for session/business reports.';

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
comment on table  departments is 'Functional units (Ortho, Derma, Lab, Pharmacy â€¦). Drives routing, fees, reporting splits.';
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
comment on table users is 'All staff accounts â€” doctors, nurses, receptionists, pharmacists, admins. One row per employee.';

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
comment on table  doctor_profiles is 'Doctor-only attributes â€” specialization, fees, slot duration, signature. Extends users for clinical staff.';
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
comment on table roles is 'Named role definitions (admin, receptionist, doctor â€¦) used for permission grouping.';

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
comment on table user_roles is 'Many-to-many userâ†”role assignments. A user can hold multiple roles with one default landing role.';
create index if not exists idx_user_roles_user on user_roles(user_id, is_active);

-- ---------------------------------------------------------------------
-- 7. permissions  (global â€” not tenant scoped)
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
comment on table role_permissions is 'Grants â€” which permissions a role carries. Joining table for roleâ†”permission.';

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
comment on table user_sessions is 'Active login sessions. Token hash, device, expiry â€” used by the auth middleware.';
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
comment on table user_preferences is 'Per-user UI settings â€” theme, language, default landing role/path, notification channels.';

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
comment on table tenant_holidays is 'Hospital closure calendar â€” blocks slot generation per service area (OP/IP/pharmacy/lab/radiology).';

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
comment on table doctor_schedules is 'Per-doctor weekly availability template â€” used to generate appointment_slots.';
create index if not exists idx_doctor_schedules_doctor on doctor_schedules(tenant_id, doctor_id, is_active);

-- =====================================================================
-- 011_platform_audit.sql
-- =====================================================================
-- =====================================================================
-- 011_platform_audit.sql
-- Append-only audit_logs (Tier-1 CRUD log) + audit_excluded_tables.
--
-- Spec: docs/03-schema/v2/modules/02-platform-audit.html
-- TSD : docs/05-tsd/02-audit-events-notifications.md
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- audit_logs  (append-only)
-- Per TSD-02 Â§4.1 this is partitioned monthly by occurred_at; we ship
-- a non-partitioned table here for Phase 1 simplicity. A future
-- migration can convert it to RANGE partitions without code changes.
-- ---------------------------------------------------------------------
create table if not exists audit_logs (
  id              uuid         primary key default gen_random_uuid(),
  tenant_id       uuid         references tenants(id) on delete restrict,  -- NULL only for cross-tenant Platform Admin actions
  user_id         uuid         references users(id) on delete set null,
  request_id      uuid,
  entity_table    varchar(120) not null,
  entity_id       uuid,
  action          varchar(16)  not null,
  changed_fields  text[],
  old_values      jsonb,
  new_values      jsonb,
  ip_address      varchar(64),
  user_agent      text,
  occurred_at     timestamptz  not null default now(),
  constraint chk_audit_logs_action check (action in ('INSERT','UPDATE','DELETE'))
);
comment on table  audit_logs is 'Append-only Tier-1 log of every sensitive write. Trigger-based; captures JSONB before/after.';
comment on column audit_logs.request_id    is 'Correlation id; all writes within one HTTP request share this.';
comment on column audit_logs.entity_table  is 'Target table name (polymorphic â€” orphan-check via nightly job).';
comment on column audit_logs.changed_fields is 'Columns that actually changed (INSERT = all keys; DELETE = empty).';

create index if not exists idx_audit_logs_entity
  on audit_logs(tenant_id, entity_table, entity_id, occurred_at desc);
create index if not exists idx_audit_logs_user
  on audit_logs(tenant_id, user_id, occurred_at desc);
create index if not exists idx_audit_logs_request
  on audit_logs(request_id);
create index if not exists idx_audit_logs_deletes
  on audit_logs(tenant_id, occurred_at desc) where action = 'DELETE';

-- Append-only enforcement
drop trigger if exists trg_audit_logs_append_only on audit_logs;
create trigger trg_audit_logs_append_only
  before update or delete on audit_logs
  for each row execute function fn_append_only_guard();

-- ---------------------------------------------------------------------
-- audit_excluded_tables  (Tier-3 registry)
-- ---------------------------------------------------------------------
create table if not exists audit_excluded_tables (
  table_name        varchar(120) primary key,
  exclusion_scope   varchar(16)  not null default 'full',
  excluded_columns  text[]       not null default '{}',
  reason            text         not null,
  added_by          uuid         references users(id) on delete set null,
  added_at          timestamptz  not null default now(),
  constraint chk_audit_excluded_scope check (exclusion_scope in ('full','columns'))
);
comment on table audit_excluded_tables is
  'Registry of Tier-3 tables (consultation_drafts, user_sessions, user_preferences, appointment_slots, patient_queue, notifications.read_at) that the audit trigger should skip.';

-- =====================================================================
-- 012_platform_events.sql
-- =====================================================================
-- =====================================================================
-- 012_platform_events.sql
-- Append-only domain_events bus.
--
-- Spec: docs/03-schema/v2/modules/03-platform-events.html
-- TSD : docs/05-tsd/02-audit-events-notifications.md Â§4.2
-- =====================================================================

set search_path = public;

create table if not exists domain_events (
  id              bigserial    primary key,
  tenant_id       uuid         not null references tenants(id) on delete restrict,
  aggregate_type  varchar(64)  not null,
  aggregate_id    uuid         not null,
  event_type      varchar(120) not null,
  payload         jsonb        not null,
  occurred_at     timestamptz  not null default now(),
  processed_by    jsonb,
  created_by      uuid         references users(id) on delete set null
);
comment on table  domain_events is
  'Append-only business event stream â€” BillFinalized, AdmissionCreated, LabResultCriticallyAbnormal â€¦. Subscribers fan out async work. 3-year retention.';
comment on column domain_events.aggregate_type is 'bill | admission | lab_result | radiology_report | â€¦';
comment on column domain_events.event_type     is 'BillFinalized | PaymentAllocated | LabResultReleased | â€¦';
comment on column domain_events.processed_by   is 'Subscriber list / processing metadata.';

create index if not exists idx_domain_events_tenant_type
  on domain_events(tenant_id, event_type, occurred_at desc);
create index if not exists idx_domain_events_aggregate
  on domain_events(aggregate_type, aggregate_id, occurred_at desc);

-- Append-only enforcement
drop trigger if exists trg_domain_events_append_only on domain_events;
create trigger trg_domain_events_append_only
  before update or delete on domain_events
  for each row execute function fn_append_only_guard();

-- =====================================================================
-- 013_platform_notifications.sql
-- =====================================================================
-- =====================================================================
-- 013_platform_notifications.sql
-- notifications + notification_acknowledgments.
--
-- Spec: docs/03-schema/v2/modules/04-platform-notifications.html
-- TSD : docs/05-tsd/02-audit-events-notifications.md Â§Â§4.3, 4.4
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------
create table if not exists notifications (
  id                uuid         primary key default gen_random_uuid(),
  user_id           uuid         references users(id) on delete cascade,
  role_id           uuid         references roles(id) on delete cascade,
  type              varchar(64)  not null,
  title             varchar(200) not null,
  body              text,
  link              varchar(255),
  priority          varchar(16)  not null default 'normal',
  ack_required      boolean      not null default false,
  ack_sla_minutes   int,
  escalation_chain  jsonb,
  escalated_at      timestamptz,
  escalated_to      uuid         references users(id) on delete set null,
  read_at           timestamptz,
  created_at        timestamptz  not null default now(),
  constraint chk_notifications_priority check (priority in ('normal','high','urgent')),
  -- A notification must address at least one of user_id, role_id (otherwise it goes nowhere).
  constraint chk_notifications_recipient check (user_id is not null or role_id is not null)
);
comment on table  notifications is 'In-app/email/SMS alerts to users or roles. Critical alerts require ACK with SLA + escalation chain.';
comment on column notifications.escalation_chain is 'Ordered array e.g. ["doctor","hod","oncall"].';

create index if not exists idx_notifications_user_unread
  on notifications(user_id, read_at, priority desc) where user_id is not null;
create index if not exists idx_notifications_role_unread
  on notifications(role_id, read_at) where role_id is not null;
create index if not exists idx_notifications_escalation
  on notifications(ack_required, escalated_at, created_at)
  where ack_required = true and read_at is null;

-- ---------------------------------------------------------------------
-- notification_acknowledgments
-- ---------------------------------------------------------------------
create table if not exists notification_acknowledgments (
  id               uuid        primary key default gen_random_uuid(),
  notification_id  uuid        not null references notifications(id) on delete cascade,
  acked_by         uuid        not null references users(id) on delete restrict,
  acked_at         timestamptz not null default now(),
  action_taken     text,
  sla_minutes      int,
  breached_sla     boolean     not null default false,
  constraint uq_notification_ack unique (notification_id, acked_by)
);
comment on table notification_acknowledgments is
  'Records who ACKed a critical alert and whether the ACK met SLA. Required for compliance/malpractice defence.';

create index if not exists idx_notification_ack_breached
  on notification_acknowledgments(breached_sla, acked_at desc) where breached_sla = true;

-- =====================================================================
-- 014_platform_attachments.sql
-- =====================================================================
-- =====================================================================
-- 014_platform_attachments.sql
-- document_templates + file_attachments.
--
-- Spec: docs/03-schema/v2/modules/05-platform-attachments.html
-- TSD : docs/05-tsd/02-audit-events-notifications.md Â§Â§4.5, 4.6
--
-- NOTE: file_attachments references patients(id) which lives in 020_patient.sql.
-- We add that FK in 020_patient.sql AFTER patients exists.
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- document_templates
-- ---------------------------------------------------------------------
create table if not exists document_templates (
  id                   uuid         primary key default gen_random_uuid(),
  tenant_id            uuid         not null references tenants(id) on delete restrict,
  template_type        varchar(32)  not null,
  name                 varchar(200) not null,
  category             varchar(64),
  department_id        uuid         references departments(id) on delete set null,
  icd10_code           varchar(16),
  content              jsonb        not null,
  applicable_role_ids  uuid[],
  version              int          not null default 1,
  usage_count          int          not null default 0,
  is_active            boolean      not null default true,
  created_by           uuid         references users(id) on delete set null,
  created_at           timestamptz  not null default now(),
  updated_at           timestamptz  not null default now(),
  constraint chk_document_templates_type
    check (template_type in ('consultation','discharge_summary','prescription','lab_report',
                              'inventory_request','op_notes','receipt'))
);
comment on table  document_templates is 'Reusable rendering templates â€” consultation notes, discharge summaries, prescriptions, lab reports. Versioned per edit.';
comment on column document_templates.content is 'Structure varies by template_type.';

create index if not exists idx_document_templates_tenant_type
  on document_templates(tenant_id, template_type, is_active);

drop trigger if exists trg_document_templates_updated_at on document_templates;
create trigger trg_document_templates_updated_at
  before update on document_templates
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------
-- file_attachments
-- patient_id FK is added in 020_patient.sql after patients exists.
-- ---------------------------------------------------------------------
create table if not exists file_attachments (
  id              uuid         primary key default gen_random_uuid(),
  tenant_id       uuid         not null references tenants(id) on delete restrict,
  patient_id      uuid,                                       -- FK added in 020
  entity_table    varchar(120) not null,
  entity_id       uuid         not null,
  file_name       varchar(255) not null,
  file_type       varchar(64),
  file_path       text         not null,
  mime_type       varchar(120),
  size_bytes      bigint,
  uploaded_by     uuid         references users(id) on delete set null,
  uploaded_at     timestamptz  not null default now()
);
comment on table  file_attachments is
  'Polymorphic blob storage. Any business entity may attach files (consultations, lab results, radiology reports, govt-ID scans). Nightly orphan-check job.';
comment on column file_attachments.entity_table is
  'Target table name (polymorphic â€” DB cannot enforce FK).';

create index if not exists idx_file_attachments_entity
  on file_attachments(tenant_id, entity_table, entity_id);
create index if not exists idx_file_attachments_uploader
  on file_attachments(uploaded_by);

-- =====================================================================
-- 015_platform_lookups.sql
-- =====================================================================
-- =====================================================================
-- 015_platform_lookups.sql
-- allergies_lookup + chronic_conditions_lookup (clinical picklists).
--
-- Spec: docs/03-schema/v2/modules/06-platform-lookups.html
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- allergies_lookup
-- ---------------------------------------------------------------------
create table if not exists allergies_lookup (
  id                uuid         primary key default gen_random_uuid(),
  tenant_id         uuid         not null references tenants(id) on delete restrict,
  allergen_name     varchar(120) not null,
  allergen_class    varchar(32)  not null,
  drug_class_code   varchar(64),
  description       text,
  is_active         boolean      not null default true,
  created_by        uuid         references users(id) on delete set null,
  created_at        timestamptz  not null default now(),
  updated_at        timestamptz  not null default now(),
  constraint chk_allergies_class check (allergen_class in ('drug','food','environmental','other')),
  constraint uq_allergies_name   unique (tenant_id, allergen_name)
);
comment on table  allergies_lookup is
  'Allergen picklist with drug_class_code â€” used at patient registration AND at prescribe time for drug-class allergy alerts.';
comment on column allergies_lookup.drug_class_code is
  'Matches medicines.drug_class for prescribe-time alert.';

create index if not exists idx_allergies_lookup_drug_class
  on allergies_lookup(tenant_id, drug_class_code) where drug_class_code is not null;

drop trigger if exists trg_allergies_lookup_updated_at on allergies_lookup;
create trigger trg_allergies_lookup_updated_at
  before update on allergies_lookup
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------
-- chronic_conditions_lookup
-- ---------------------------------------------------------------------
create table if not exists chronic_conditions_lookup (
  id              uuid         primary key default gen_random_uuid(),
  tenant_id       uuid         not null references tenants(id) on delete restrict,
  condition_name  varchar(200) not null,
  icd10_code      varchar(16),
  description     text,
  is_active       boolean      not null default true,
  created_by      uuid         references users(id) on delete set null,
  created_at      timestamptz  not null default now(),
  updated_at      timestamptz  not null default now(),
  constraint uq_chronic_conditions_name unique (tenant_id, condition_name)
);
comment on table chronic_conditions_lookup is
  'Chronic condition picklist with ICD-10 â€” used at patient registration AND consultation HPI for analytics cohorts.';

create index if not exists idx_chronic_conditions_icd
  on chronic_conditions_lookup(tenant_id, icd10_code) where icd10_code is not null;

drop trigger if exists trg_chronic_conditions_updated_at on chronic_conditions_lookup;
create trigger trg_chronic_conditions_updated_at
  before update on chronic_conditions_lookup
  for each row execute function fn_set_updated_at();

-- =====================================================================
-- 020_patient.sql
-- =====================================================================
-- =====================================================================
-- 020_patient.sql
-- patients, patient_govt_ids, patient_merges, patient_mergeable_tables,
-- uhid_sequences, patient_family_history.
--
-- Spec: docs/03-schema/v2/modules/07-patient.html
-- TSD : docs/05-tsd/03-patient-master.md
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- 1. patients
-- ---------------------------------------------------------------------
create table if not exists patients (
  id                       uuid         primary key default gen_random_uuid(),
  tenant_id                uuid         not null references tenants(id) on delete restrict,
  uhid                     varchar(32)  not null,
  registration_status      varchar(16)  not null default 'provisional',
  merged_into_patient_id   uuid         references patients(id) on delete set null,
  first_name               varchar(120) not null,
  last_name                varchar(120) not null,
  gender                   varchar(1)   not null,
  dob                      date         not null,
  age                      int          not null,
  mobile                   varchar(20)  not null,
  alt_mobile               varchar(20),
  address                  jsonb,
  -- GENERATED columns from address jsonb
  address_pincode          varchar(16)  generated always as ((address->>'pincode')) stored,
  address_city             varchar(120) generated always as ((address->>'city')) stored,
  blood_group              varchar(8),
  marital_status           varchar(32),
  allergies                text[]       not null default '{}',
  chronic_conditions       text[]       not null default '{}',
  emergency_contact        jsonb,
  is_active                boolean      not null default true,
  created_by               uuid         references users(id) on delete set null,
  created_at               timestamptz  not null default now(),
  updated_by               uuid         references users(id) on delete set null,
  updated_at               timestamptz  not null default now(),
  version                  int          not null default 0,
  constraint chk_patients_gender             check (gender in ('M','F','O')),
  constraint chk_patients_registration_status check (registration_status in ('provisional','complete','merged')),
  constraint uq_patients_uhid                unique (uhid)
);
comment on table  patients is 'Master patient identity. UHID, demographics, allergies â€” referenced by every clinical & billing row.';
comment on column patients.uhid is 'UHID or TEMP- prefix.';

create index if not exists idx_patients_tenant         on patients(tenant_id, is_active);
create index if not exists idx_patients_mobile         on patients(tenant_id, mobile);
create index if not exists idx_patients_name_trgm      on patients using gin ((first_name || ' ' || last_name) gin_trgm_ops);
create index if not exists idx_patients_allergies_gin  on patients using gin (allergies);
create index if not exists idx_patients_chronic_gin    on patients using gin (chronic_conditions);
create index if not exists idx_patients_pincode        on patients(tenant_id, address_pincode);
create index if not exists idx_patients_city           on patients(tenant_id, address_city);

drop trigger if exists trg_patients_updated_at on patients;
create trigger trg_patients_updated_at
  before update on patients
  for each row execute function fn_set_updated_at();

-- Now that patients exists, add the deferred FK on file_attachments.patient_id.
alter table file_attachments
  add constraint fk_file_attachments_patient
  foreign key (patient_id) references patients(id) on delete set null;

-- ---------------------------------------------------------------------
-- 2. patient_govt_ids
-- ---------------------------------------------------------------------
create table if not exists patient_govt_ids (
  id                       uuid         primary key default gen_random_uuid(),
  tenant_id                uuid         not null references tenants(id) on delete restrict,
  patient_id               uuid         not null references patients(id) on delete cascade,
  id_type                  varchar(16)  not null,
  id_value_encrypted       bytea        not null,
  id_value_hash            varchar(128) not null,
  id_value_last4           varchar(8),
  issuing_authority        varchar(120),
  holder_name_on_id        varchar(200),
  verified                 boolean      not null default false,
  verified_at              timestamptz,
  verified_by              uuid         references users(id) on delete set null,
  verification_method      varchar(16),
  verification_notes       text,
  document_attachment_id   uuid         references file_attachments(id) on delete set null,
  is_active                boolean      not null default true,
  created_by               uuid         references users(id) on delete set null,
  created_at               timestamptz  not null default now(),
  updated_at               timestamptz  not null default now(),
  constraint chk_patient_govt_ids_type
    check (id_type in ('aadhaar','pan','passport','voter','dl','other')),
  constraint chk_patient_govt_ids_verification_method
    check (verification_method is null or verification_method in ('manual','digilocker','ocr'))
);
comment on table patient_govt_ids is
  'Encrypted KYC storage (Aadhaar, PAN, passport, voter ID, DL) with hash + last4 for dedup. RLS-protected; required for Phase 2 insurance/TPA.';

create index if not exists idx_patient_govt_ids_patient
  on patient_govt_ids(patient_id, is_active);
create index if not exists idx_patient_govt_ids_hash
  on patient_govt_ids(tenant_id, id_type, id_value_hash);

drop trigger if exists trg_patient_govt_ids_updated_at on patient_govt_ids;
create trigger trg_patient_govt_ids_updated_at
  before update on patient_govt_ids
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------
-- 3. patient_merges
-- ---------------------------------------------------------------------
create table if not exists patient_merges (
  id                   uuid         primary key default gen_random_uuid(),
  tenant_id            uuid         not null references tenants(id) on delete restrict,
  source_patient_id    uuid         not null references patients(id) on delete restrict,
  target_patient_id    uuid         not null references patients(id) on delete restrict,
  reason               text         not null,
  rows_repointed       jsonb,
  merged_by            uuid         not null references users(id) on delete restrict,
  merged_at            timestamptz  not null default now(),
  unmerged_at          timestamptz,
  unmerged_by          uuid         references users(id) on delete set null,
  unmerge_reason       text,
  approval_status      varchar(16)  not null default 'approved',
  approved_by          uuid         references users(id) on delete set null,
  approved_at          timestamptz,
  rejection_reason     text,
  constraint chk_patient_merges_approval check (approval_status in ('pending','approved','rejected')),
  constraint chk_patient_merges_distinct check (source_patient_id <> target_patient_id)
);
comment on table patient_merges is
  'Audit of duplicate-record consolidations. Source patient is hidden, child rows repointed to target. Layer 2 maker-checker for unmerge.';

create index if not exists idx_patient_merges_target on patient_merges(target_patient_id, merged_at desc);
create index if not exists idx_patient_merges_source on patient_merges(source_patient_id);

-- ---------------------------------------------------------------------
-- 4. patient_mergeable_tables  (registry â€” driven by sp_merge_patients)
-- ---------------------------------------------------------------------
create table if not exists patient_mergeable_tables (
  id           uuid         primary key default gen_random_uuid(),
  module       varchar(64)  not null,
  table_name   varchar(120) not null,
  fk_column    varchar(64)  not null default 'patient_id',
  merge_order  int          not null,
  is_active    boolean      not null default true,
  notes        text,
  added_at     timestamptz  not null default now(),
  added_by     uuid         references users(id) on delete set null,
  constraint uq_mergeable_tables unique (table_name)
);
comment on table patient_mergeable_tables is
  'Registry of every table with patient_id FK â€” read by sp_merge_patients to dynamically repoint child rows. 21+ entries.';

-- ---------------------------------------------------------------------
-- 5. uhid_sequences  (per-tenant, per-year counter)
-- ---------------------------------------------------------------------
create table if not exists uhid_sequences (
  tenant_id      uuid not null references tenants(id) on delete cascade,
  year           int  not null,
  last_sequence  int  not null default 0,
  constraint pk_uhid_sequences primary key (tenant_id, year)
);
comment on table uhid_sequences is
  'Per-tenant, per-year UHID counter. Source of truth for the next sequence number.';

-- ---------------------------------------------------------------------
-- 6. patient_family_history
-- ---------------------------------------------------------------------
create table if not exists patient_family_history (
  id                      uuid         primary key default gen_random_uuid(),
  tenant_id               uuid         not null references tenants(id) on delete restrict,
  patient_id              uuid         not null references patients(id) on delete cascade,
  relationship            varchar(32)  not null,
  relationship_specific   varchar(64),
  condition_name          varchar(200) not null,
  icd10_code              varchar(16),
  age_of_onset            int,
  is_deceased             boolean      not null default false,
  age_at_death            int,
  cause_of_death          text,
  notes                   text,
  is_active               boolean      not null default true,
  created_by              uuid         references users(id) on delete set null,
  created_at              timestamptz  not null default now(),
  updated_at              timestamptz  not null default now(),
  constraint chk_family_history_relationship
    check (relationship in ('father','mother','sibling','child','grandparent','other'))
);
comment on table patient_family_history is
  'First-degree relatives'' chronic conditions for hereditary-risk assessment by doctors.';

create index if not exists idx_family_history_patient
  on patient_family_history(patient_id, is_active);

drop trigger if exists trg_patient_family_history_updated_at on patient_family_history;
create trigger trg_patient_family_history_updated_at
  before update on patient_family_history
  for each row execute function fn_set_updated_at();

-- =====================================================================
-- 021_journey.sql
-- =====================================================================
-- =====================================================================
-- 021_journey.sql
-- patient_states (catalog), stations (physical service points),
-- patient_journey_events (append-only ledger).
--
-- Spec: docs/03-schema/v2/modules/08-journey.html
-- TSD : docs/05-tsd/04-patient-journey.md
--
-- NOTE: patient_journey_events.op_visit_id FKs op_visits which lives in
-- 030_encounter.sql â€” that FK is added there. We also add the
-- fn_sync_op_visit_state trigger in 030_encounter.sql for the same
-- reason (it updates op_visits.current_state_code).
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- 1. patient_states  (catalog, int PK, tenant-agnostic)
-- ---------------------------------------------------------------------
create table if not exists patient_states (
  code                 int          primary key,
  phase                int          not null,
  phase_label          varchar(120) not null,
  slug                 varchar(64)  not null unique,
  display_name         varchar(120) not null,
  description          text,
  owning_dept          varchar(32),
  derived_from         varchar(32),
  is_blocking          boolean      not null default false,
  is_terminal          boolean      not null default false,
  sla_minutes          int,
  next_possible_codes  int[]        not null default '{}',
  display_color        varchar(16),
  is_active            boolean      not null default true,
  constraint chk_patient_states_owning_dept
    check (owning_dept is null or owning_dept in
           ('front_desk','nursing','doctor','lab','radiology','pharmacy','ward','er','billing','inpatient','surgery','opd','ipd'))
);
comment on table patient_states is
  'Catalog of every state in the patient journey (100..710). Drives the state machine and analytics.';

create index if not exists idx_patient_states_phase on patient_states(phase, code);

-- ---------------------------------------------------------------------
-- 2. stations  (int PK per HTML schema v8)
-- ---------------------------------------------------------------------
create table if not exists stations (
  code                       int          primary key,
  tenant_id                  uuid         not null references tenants(id) on delete restrict,
  slug                       varchar(64)  not null,
  display_name               varchar(120) not null,
  phase                      int          not null,
  station_type               varchar(32)  not null,
  owning_dept                varchar(32)  not null,
  physical_location          varchar(200),
  avg_service_time_minutes   int,
  is_active                  boolean      not null default true,
  constraint chk_stations_type
    check (station_type in (
      'front_desk','billing','vitals','doctor','lab_collection','lab_processing',
      'radiology','pharmacy','er_triage','ip_ward','lab','ward')),
  constraint uq_stations_tenant_slug unique (tenant_id, slug)
);
comment on table stations is
  'Physical service points (front desk, billing, vitals, doctor rooms, lab, pharmacy, radiology). Patients move between stations.';

create index if not exists idx_stations_type
  on stations(tenant_id, station_type, is_active);

-- ---------------------------------------------------------------------
-- 3. patient_journey_events  (append-only ledger)
-- ---------------------------------------------------------------------
create table if not exists patient_journey_events (
  id                                uuid         primary key default gen_random_uuid(),
  tenant_id                         uuid         not null references tenants(id) on delete restrict,
  patient_id                        uuid         not null references patients(id) on delete restrict,
  op_visit_id                       uuid,                                       -- FK to op_visits added in 030
  ip_admission_id                   uuid,                                       -- Phase 2
  from_state_code                   int          references patient_states(code) on delete restrict,
  to_state_code                     int          not null references patient_states(code) on delete restrict,
  station_id                        int          references stations(code) on delete restrict,
  duration_in_prev_state_seconds    int,
  triggered_by_user_id              uuid         references users(id) on delete set null,
  reason                            text,
  metadata                          jsonb,
  occurred_at                       timestamptz  not null default now()
);
comment on table patient_journey_events is
  'Append-only state-transition log per patient. Source of truth for journey analytics. Monthly partitioning, 7-year retention.';

create index if not exists idx_journey_events_patient
  on patient_journey_events(patient_id, occurred_at desc);
create index if not exists idx_journey_events_visit
  on patient_journey_events(op_visit_id, occurred_at desc) where op_visit_id is not null;
create index if not exists idx_journey_events_to_state
  on patient_journey_events(tenant_id, to_state_code, occurred_at desc);
create index if not exists idx_journey_events_tenant_occurred
  on patient_journey_events(tenant_id, occurred_at);

-- Append-only enforcement
drop trigger if exists trg_journey_events_append_only on patient_journey_events;
create trigger trg_journey_events_append_only
  before update or delete on patient_journey_events
  for each row execute function fn_append_only_guard();

-- ---------------------------------------------------------------------
-- fn_compute_prev_duration  (BEFORE INSERT)
-- Fills duration_in_prev_state_seconds from the previous event for this
-- visit. NULL for first event (no previous row).
-- ---------------------------------------------------------------------
create or replace function fn_compute_prev_duration() returns trigger
language plpgsql
as $$
declare
  prev_occurred timestamptz;
begin
  if new.op_visit_id is not null then
    select max(occurred_at) into prev_occurred
      from patient_journey_events
     where op_visit_id = new.op_visit_id;
  else
    select max(occurred_at) into prev_occurred
      from patient_journey_events
     where patient_id = new.patient_id
       and op_visit_id is null
       and ip_admission_id is null;
  end if;

  if prev_occurred is not null and new.duration_in_prev_state_seconds is null then
    new.duration_in_prev_state_seconds :=
      greatest(0, extract(epoch from (new.occurred_at - prev_occurred))::int);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_journey_events_prev_duration on patient_journey_events;
create trigger trg_journey_events_prev_duration
  before insert on patient_journey_events
  for each row execute function fn_compute_prev_duration();

-- =====================================================================
-- 030_encounter.sql
-- =====================================================================
-- =====================================================================
-- 030_encounter.sql
-- op_visits + patient_queue + back-fills for patient_journey_events.
--
-- Spec: docs/03-schema/v2/modules/10-encounter.html
-- TSD : docs/05-tsd/06-opd-encounters.md
--
-- NOTE: op_visits.appointment_id has NO FK because the appointments
-- module is out of scope for this doctor-flow migration. Marked as
-- nullable uuid; FK can be added in a later migration.
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- 1. op_visits
-- ---------------------------------------------------------------------
create table if not exists op_visits (
  id                   uuid         primary key default gen_random_uuid(),
  tenant_id            uuid         not null references tenants(id) on delete restrict,
  op_number            varchar(32)  not null,
  patient_id           uuid         not null references patients(id) on delete restrict,
  appointment_id       uuid,                                            -- FK target lives outside doctor-flow scope
  doctor_id            uuid         not null references users(id) on delete restrict,
  visit_date           date         not null,
  token_number         varchar(32)  not null,
  chief_complaint      text,
  is_emergency         boolean      not null default false,
  emergency_triage     varchar(16),
  current_state_code   int          references patient_states(code) on delete restrict,
  is_mlc               boolean      not null default false,
  mlc_number           varchar(64),
  created_by           uuid         references users(id) on delete set null,
  created_at           timestamptz  not null default now(),
  updated_by           uuid         references users(id) on delete set null,
  updated_at           timestamptz  not null default now(),
  version              int          not null default 0,
  constraint chk_op_visits_emergency_triage
    check (emergency_triage is null or emergency_triage in ('red','yellow','green')),
  constraint uq_op_visits_op_number unique (op_number)
);
comment on table  op_visits is
  'One outpatient visit. OP number, doctor, chief complaint, current state â€” entry point for OP workflow. is_mlc flag for medico-legal cases.';
comment on column op_visits.current_state_code is
  'Denormalized from patient_journey_events (latest to_state_code). Synced by trigger â€” do not write from app code.';

create index if not exists idx_op_visits_doctor
  on op_visits(tenant_id, doctor_id, visit_date, current_state_code);
create index if not exists idx_op_visits_patient
  on op_visits(tenant_id, patient_id, visit_date desc);
create index if not exists idx_op_visits_emergency
  on op_visits(tenant_id, is_emergency, visit_date) where is_emergency = true;

drop trigger if exists trg_op_visits_updated_at on op_visits;
create trigger trg_op_visits_updated_at
  before update on op_visits
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------
-- Back-fill: patient_journey_events.op_visit_id FK now that op_visits exists.
-- ---------------------------------------------------------------------
alter table patient_journey_events
  add constraint fk_journey_events_op_visit
  foreign key (op_visit_id) references op_visits(id) on delete restrict;

-- ---------------------------------------------------------------------
-- 2. patient_queue
-- ---------------------------------------------------------------------
create table if not exists patient_queue (
  id                       uuid         primary key default gen_random_uuid(),
  tenant_id                uuid         not null references tenants(id) on delete restrict,
  patient_id               uuid         not null references patients(id) on delete restrict,
  op_visit_id              uuid         references op_visits(id) on delete cascade,
  parent_queue_id          uuid         references patient_queue(id) on delete set null,
  station_id               int          not null references stations(code) on delete restrict,
  state_code               int          references patient_states(code) on delete restrict,
  status                   varchar(32)  not null default 'waiting',
  priority                 varchar(16)  not null default 'normal',
  token_number             varchar(32)  not null,
  queue_position           int,
  referred_by_user_id      uuid         references users(id) on delete set null,
  referral_reason          varchar(120),
  return_to_station_id     int          references stations(code) on delete set null,
  return_to_provider_id    uuid         references users(id) on delete set null,
  metadata                 jsonb,
  entered_at               timestamptz  not null default now(),
  called_at                timestamptz,
  completed_at             timestamptz,
  constraint chk_patient_queue_status check (
    status in ('waiting','in_service','paused','completed','returned_for_review','left')
  ),
  constraint chk_patient_queue_priority check (priority in ('normal','urgent','emergency'))
);
comment on table patient_queue is
  'Live queue rows â€” where every active patient is right now. Side-trip support via parent_queue_id self-FK.';

create index if not exists idx_patient_queue_station_status
  on patient_queue(tenant_id, station_id, status, queue_position);
create index if not exists idx_patient_queue_visit
  on patient_queue(op_visit_id);
create index if not exists idx_patient_queue_review_provider
  on patient_queue(tenant_id, return_to_provider_id) where return_to_provider_id is not null;

-- ---------------------------------------------------------------------
-- fn_sync_op_visit_state  (AFTER INSERT on patient_journey_events)
-- Sets op_visits.current_state_code to the latest to_state_code for the visit.
-- (Defined here because the function body references op_visits which only
-- now exists.)
-- ---------------------------------------------------------------------
create or replace function fn_sync_op_visit_state() returns trigger
language plpgsql
as $$
begin
  if new.op_visit_id is not null then
    update op_visits
       set current_state_code = new.to_state_code,
           updated_at         = now()
     where id = new.op_visit_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_journey_events_sync_op_visit on patient_journey_events;
create trigger trg_journey_events_sync_op_visit
  after insert on patient_journey_events
  for each row execute function fn_sync_op_visit_state();

-- =====================================================================
-- 040_inventory.sql
-- =====================================================================
-- =====================================================================
-- 040_inventory.sql
-- vendors, medicines, medicine_batches, purchase_orders,
-- purchase_order_items, stock_movements, narcotic_register.
--
-- Spec: docs/03-schema/v2/modules/14-inventory.html
-- TSD : docs/05-tsd/10-pharmacy-inventory.md
--
-- NOTE: stock_movements.pharmacy_sale_item_id and pharmacy_return_item_id
-- and narcotic_register.pharmacy_sale_id reference the PHARMACY module
-- which is OUT OF SCOPE here. Those columns are kept (per spec) as plain
-- uuid without FK constraints â€” they will be wired up by the pharmacy
-- migration when that module lands.
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- 1. vendors
-- ---------------------------------------------------------------------
create table if not exists vendors (
  id                     uuid         primary key default gen_random_uuid(),
  tenant_id              uuid         not null references tenants(id) on delete restrict,
  vendor_code            varchar(64)  not null,
  vendor_name            varchar(200) not null,
  contact_person         varchar(120),
  mobile                 varchar(20)  not null,
  email                  varchar(200),
  address                text,
  gstin                  varchar(32),
  pan                    varchar(16),
  drug_licence_number    varchar(64),
  payment_terms_days     int          not null default 30,
  is_narcotic_supplier   boolean      not null default false,
  is_active              boolean      not null default true,
  created_by             uuid         references users(id) on delete set null,
  created_at             timestamptz  not null default now(),
  updated_by             uuid         references users(id) on delete set null,
  updated_at             timestamptz  not null default now(),
  version                int          not null default 0,
  constraint uq_vendors_tenant_code unique (tenant_id, vendor_code)
);
comment on table vendors is
  'Pharma supplier directory â€” contact, GST, payment terms, drug licence, narcotic-supplier flag.';

create index if not exists idx_vendors_tenant_active on vendors(tenant_id, is_active);

drop trigger if exists trg_vendors_updated_at on vendors;
create trigger trg_vendors_updated_at
  before update on vendors
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------
-- 2. medicines
-- ---------------------------------------------------------------------
create table if not exists medicines (
  id                     uuid         primary key default gen_random_uuid(),
  tenant_id              uuid         not null references tenants(id) on delete restrict,
  medicine_code          varchar(64)  not null,
  medicine_name          varchar(200) not null,
  generic_name           varchar(200),
  brand_name             varchar(200),
  manufacturer           varchar(200),
  category               varchar(64),
  drug_schedule          varchar(8),
  is_narcotic            boolean      not null default false,
  drug_class             varchar(64),
  form                   varchar(32)  not null,
  strength               varchar(64),
  unit                   varchar(32)  not null,
  pack_size              int          not null default 1,
  storage_temp           varchar(16),
  hsn_code               varchar(16),
  gst_pct                numeric(5,2) not null default 12,
  requires_prescription  boolean      not null default true,
  reorder_level          int          not null default 0,
  max_stock_level        int          not null default 0,
  is_active              boolean      not null default true,
  created_by             uuid         references users(id) on delete set null,
  created_at             timestamptz  not null default now(),
  updated_by             uuid         references users(id) on delete set null,
  updated_at             timestamptz  not null default now(),
  version                int          not null default 0,
  constraint chk_medicines_schedule
    check (drug_schedule is null or drug_schedule in ('H','H1','X','G','OTC')),
  constraint chk_medicines_form
    check (form in ('tablet','capsule','syrup','injection','cream','ointment','drops','inhaler','patch','suppository','powder','other')),
  constraint chk_medicines_storage
    check (storage_temp is null or storage_temp in ('room','refrigerated','frozen','controlled')),
  constraint uq_medicines_code unique (tenant_id, medicine_code)
);
comment on table  medicines is
  'Drug master â€” name, schedule, form, strength, GST, reorder level, narcotic flag, drug_class for allergy alerting.';
comment on column medicines.drug_class is
  'Matches allergies_lookup.drug_class_code for prescribe-time allergy alert.';

create index if not exists idx_medicines_generic
  on medicines(tenant_id, lower(generic_name), strength, form);
create index if not exists idx_medicines_drug_class
  on medicines(tenant_id, drug_class) where drug_class is not null;
create index if not exists idx_medicines_narcotic
  on medicines(tenant_id, is_narcotic, is_active) where is_narcotic = true;
create index if not exists idx_medicines_active
  on medicines(tenant_id, is_active);

drop trigger if exists trg_medicines_updated_at on medicines;
create trigger trg_medicines_updated_at
  before update on medicines
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------
-- 3. purchase_orders
-- (purchase_order_items.purchase_order_id FK requires this to exist;
--  medicine_batches.po_id FK does too â€” order created here.)
-- ---------------------------------------------------------------------
create table if not exists purchase_orders (
  id                   uuid         primary key default gen_random_uuid(),
  tenant_id            uuid         not null references tenants(id) on delete restrict,
  po_number            varchar(32)  not null unique,
  vendor_id            uuid         not null references vendors(id) on delete restrict,
  expected_date        date,
  status               varchar(32)  not null default 'draft',
  total_amount         numeric(12,2) not null default 0,
  includes_narcotics   boolean      not null default false,
  ordered_by           uuid         not null references users(id) on delete restrict,
  approval_status      varchar(16)  not null default 'pending',
  approved_by          uuid         references users(id) on delete set null,
  approved_at          timestamptz,
  rejection_reason     text,
  ordered_at           timestamptz,
  received_at          timestamptz,
  created_by           uuid         references users(id) on delete set null,
  created_at           timestamptz  not null default now(),
  updated_by           uuid         references users(id) on delete set null,
  updated_at           timestamptz  not null default now(),
  version              int          not null default 0,
  constraint chk_purchase_orders_status
    check (status in ('draft','pending_approval','approved','sent','partially_received','received','cancelled','rejected')),
  constraint chk_purchase_orders_approval
    check (approval_status in ('pending','approved','rejected'))
);
comment on table purchase_orders is
  'PO header to a vendor â€” status, totals, Layer 2 approver. includes_narcotics flag for NDPS routing.';

create index if not exists idx_purchase_orders_status
  on purchase_orders(tenant_id, status, ordered_at desc);
create index if not exists idx_purchase_orders_vendor
  on purchase_orders(vendor_id, status);

drop trigger if exists trg_purchase_orders_updated_at on purchase_orders;
create trigger trg_purchase_orders_updated_at
  before update on purchase_orders
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------
-- 4. medicine_batches
-- ---------------------------------------------------------------------
create table if not exists medicine_batches (
  id                   uuid         primary key default gen_random_uuid(),
  tenant_id            uuid         not null references tenants(id) on delete restrict,
  medicine_id          uuid         not null references medicines(id) on delete restrict,
  batch_number         varchar(64)  not null,
  mfg_date             date,
  expiry_date          date         not null,
  purchase_price       numeric(10,2) not null,
  mrp_at_purchase      numeric(10,2) not null,
  selling_price        numeric(10,2) not null,
  quantity_received    int          not null,
  quantity_available   int          not null,
  vendor_id            uuid         not null references vendors(id) on delete restrict,
  po_id                uuid         references purchase_orders(id) on delete set null,
  received_date        date         not null,
  is_blocked           boolean      not null default false,
  blocked_reason       varchar(32),
  version              int          not null default 0,
  constraint chk_medicine_batches_qty_received check (quantity_received >= 0),
  constraint chk_medicine_batches_qty_available check (quantity_available >= 0),
  constraint chk_medicine_batches_blocked_reason
    check (blocked_reason is null or blocked_reason in ('expired','recall','damaged')),
  constraint uq_medicine_batches unique (tenant_id, medicine_id, batch_number, vendor_id)
);
comment on table  medicine_batches is
  'Per-batch stock â€” batch no, expiry, MRP, qty available. FEFO pick. Block expired/recalled.';
comment on column medicine_batches.quantity_available is
  'Decremented atomically at dispense by trigger; optimistic-lock via version.';

create index if not exists idx_medicine_batches_fefo
  on medicine_batches(tenant_id, medicine_id, expiry_date)
  where quantity_available > 0 and is_blocked = false;
-- Full B-tree (no partial predicate) — `current_date` is STABLE, not
-- IMMUTABLE, so Postgres rejects it in an index predicate. Range queries
-- like `where expiry_date <= now() + interval '30 days'` still use this
-- index via index-range scan.
create index if not exists idx_medicine_batches_expiry_warn
  on medicine_batches(tenant_id, expiry_date);
create index if not exists idx_medicine_batches_stock_summary
  on medicine_batches(tenant_id, medicine_id, quantity_available);

-- ---------------------------------------------------------------------
-- 5. purchase_order_items
-- ---------------------------------------------------------------------
create table if not exists purchase_order_items (
  id                   uuid         primary key default gen_random_uuid(),
  purchase_order_id    uuid         not null references purchase_orders(id) on delete cascade,
  medicine_id          uuid         not null references medicines(id) on delete restrict,
  quantity_ordered     int          not null,
  quantity_received    int          not null default 0,
  unit_price           numeric(10,2) not null,
  cgst_pct             numeric(5,2) not null default 0,
  cgst_amount          numeric(10,2) not null default 0,
  sgst_pct             numeric(5,2) not null default 0,
  sgst_amount          numeric(10,2) not null default 0,
  igst_pct             numeric(5,2) not null default 0,
  igst_amount          numeric(10,2) not null default 0,
  total_price          numeric(12,2) not null,
  constraint chk_poi_qty_ordered  check (quantity_ordered > 0),
  constraint chk_poi_qty_received check (quantity_received >= 0),
  constraint uq_purchase_order_items unique (purchase_order_id, medicine_id)
);
comment on table purchase_order_items is 'Lines on a PO â€” medicine, qty ordered/received, price, GST split.';

-- ---------------------------------------------------------------------
-- 6. stock_movements  (append-only ledger)
-- ---------------------------------------------------------------------
create table if not exists stock_movements (
  id                          uuid         primary key default gen_random_uuid(),
  tenant_id                   uuid         not null references tenants(id) on delete restrict,
  medicine_batch_id           uuid         not null references medicine_batches(id) on delete restrict,
  movement_type               varchar(32)  not null,
  quantity                    int          not null,
  balance_after               int          not null,
  purchase_order_item_id      uuid         references purchase_order_items(id) on delete set null,
  pharmacy_sale_item_id       uuid,                        -- FK target out of scope (pharmacy module)
  pharmacy_return_item_id     uuid,                        -- FK target out of scope (pharmacy module)
  transfer_counterpart_id     uuid         references stock_movements(id) on delete set null,
  adjustment_reason           text,
  performed_by                uuid         not null references users(id) on delete restrict,
  performed_at                timestamptz  not null default now(),
  notes                       text,
  constraint chk_stock_movements_type check (
    movement_type in ('purchase_in','sale_out','return_in','return_writeoff','adjustment',
                      'expiry_writeoff','surgery_use','ward_use','transfer_in','transfer_out')
  ),
  constraint chk_stock_movements_qty_signed   check (quantity <> 0),
  constraint chk_stock_movements_balance      check (balance_after >= 0),
  constraint chk_stock_movements_one_source   check (
    num_nonnulls(purchase_order_item_id, pharmacy_sale_item_id,
                 pharmacy_return_item_id, transfer_counterpart_id) <= 1
  ),
  constraint chk_stock_movements_adjustment_reason
    check ((movement_type = 'adjustment') = (adjustment_reason is not null)),
  constraint chk_stock_movements_purchase_in
    check ((movement_type = 'purchase_in') = (purchase_order_item_id is not null)),
  constraint chk_stock_movements_sale_out
    check ((movement_type = 'sale_out')    = (pharmacy_sale_item_id is not null)),
  constraint chk_stock_movements_return
    check ((movement_type in ('return_in','return_writeoff')) = (pharmacy_return_item_id is not null))
);
comment on table stock_movements is
  'Append-only stock change log â€” purchase_in, sale_out, return, writeoff, surgery/ward use. Separate-column FKs.';

create index if not exists idx_stock_movements_batch
  on stock_movements(medicine_batch_id, performed_at desc);
create index if not exists idx_stock_movements_type
  on stock_movements(tenant_id, movement_type, performed_at desc);
create index if not exists idx_stock_movements_po_item
  on stock_movements(purchase_order_item_id) where purchase_order_item_id is not null;
create index if not exists idx_stock_movements_sale_item
  on stock_movements(pharmacy_sale_item_id) where pharmacy_sale_item_id is not null;
create index if not exists idx_stock_movements_return_item
  on stock_movements(pharmacy_return_item_id) where pharmacy_return_item_id is not null;

-- Append-only enforcement
drop trigger if exists trg_stock_movements_append_only on stock_movements;
create trigger trg_stock_movements_append_only
  before update or delete on stock_movements
  for each row execute function fn_append_only_guard();

-- ---------------------------------------------------------------------
-- 7. narcotic_register  (NDPS Schedule X ledger, append-only)
--
-- prescription_id FK is set in 050_consultation.sql (prescriptions exists
-- only after consultation module). pharmacy_sale_id FK is out of scope.
-- ---------------------------------------------------------------------
create table if not exists narcotic_register (
  id                    uuid         primary key default gen_random_uuid(),
  tenant_id             uuid         not null references tenants(id) on delete restrict,
  medicine_id           uuid         not null references medicines(id) on delete restrict,
  medicine_batch_id     uuid         references medicine_batches(id) on delete restrict,
  pharmacy_sale_id      uuid,                                 -- FK target out of scope (pharmacy module)
  prescription_id       uuid,                                 -- FK added in 050_consultation.sql
  transaction_type      varchar(32)  not null,
  quantity              int          not null,
  balance_after         int          not null,
  prescriber_name       varchar(200),
  prescriber_reg_no     varchar(64),
  recipient_name        varchar(200),
  recipient_relation    varchar(32),
  recipient_id_proof    varchar(64),
  witnessed_by          uuid         references users(id) on delete restrict,
  performed_by          uuid         not null references users(id) on delete restrict,
  performed_at          timestamptz  not null default now(),
  approval_status       varchar(16)  not null default 'approved',
  approved_by           uuid         references users(id) on delete set null,
  approved_at           timestamptz,
  rejection_reason      text,
  notes                 text,
  constraint chk_narcotic_register_type check (
    transaction_type in ('opening_balance','purchase_in','dispense_out','wastage',
                          'transfer_in','transfer_out','return','expired_writeoff','adjustment')
  ),
  constraint chk_narcotic_register_qty       check (quantity <> 0),
  constraint chk_narcotic_register_balance   check (balance_after >= 0),
  constraint chk_narcotic_register_approval  check (approval_status in ('pending','approved','rejected')),
  constraint chk_narcotic_register_recipient_relation
    check (recipient_relation is null or recipient_relation in
           ('self','spouse','parent','father','mother','sibling','child',
            'authorized_attendant','attender','other')),
  constraint chk_narcotic_register_two_person
    check (witnessed_by is null or witnessed_by <> performed_by),
  constraint chk_narcotic_register_dispense_disclosure
    check (
      transaction_type <> 'dispense_out' or (
        prescriber_name    is not null
        and recipient_name is not null
        and recipient_id_proof is not null
      )
    ),
  constraint chk_narcotic_register_wastage_approved
    check (
      transaction_type not in ('wastage','adjustment')
      or (approval_status = 'approved' and approved_by is not null)
    )
);
comment on table narcotic_register is
  'NDPS-compliant Schedule X ledger â€” every transaction with running balance, prescriber, recipient, witness. Append-only. 7-year legal retention.';

create index if not exists idx_narcotic_register_medicine
  on narcotic_register(tenant_id, medicine_id, performed_at desc);
create index if not exists idx_narcotic_register_dispense
  on narcotic_register(tenant_id, performed_at desc) where transaction_type = 'dispense_out';
create index if not exists idx_narcotic_register_prescription
  on narcotic_register(prescription_id) where prescription_id is not null;

-- Append-only enforcement
drop trigger if exists trg_narcotic_register_append_only on narcotic_register;
create trigger trg_narcotic_register_append_only
  before update or delete on narcotic_register
  for each row execute function fn_append_only_guard();

-- =====================================================================
-- 050_consultation.sql
-- =====================================================================
-- =====================================================================
-- 050_consultation.sql
-- vitals, consultations, diagnosis_templates, prescriptions,
-- prescription_items, doctor_recommendations, consultation_drafts.
--
-- Spec: docs/03-schema/v2/modules/11-consultation.html
-- TSD : docs/05-tsd/07-clinical-consultation.md
--
-- NOTE: doctor_recommendations.lab_order_id and radiology_order_id FKs
-- are wired up in 060_lab.sql / 061_radiology.sql once those tables exist.
-- doctor_recommendations.follow_up_appointment_id has no FK because
-- appointments is out of scope.
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- 1. vitals
-- ---------------------------------------------------------------------
create table if not exists vitals (
  id                   uuid          primary key default gen_random_uuid(),
  tenant_id            uuid          not null references tenants(id) on delete restrict,
  patient_id           uuid          not null references patients(id) on delete restrict,
  op_visit_id          uuid          references op_visits(id) on delete set null,
  ip_admission_id      uuid,                                          -- phase 2
  temperature_f        numeric(4,1),
  weight_kg            numeric(5,2),
  height_cm            numeric(5,2),
  bmi                  numeric(5,2)
                          generated always as
                          (case
                             when height_cm is not null and weight_kg is not null and height_cm > 0
                             then weight_kg / nullif((height_cm/100.0)^2, 0)
                             else null
                           end) stored,
  bp_systolic          int,
  bp_diastolic         int,
  spo2                 int,
  pulse_rate           int,
  respiratory_rate     int,
  blood_sugar_random   numeric(6,2),
  blood_sugar_fasting  numeric(6,2),
  pain_score           int,
  notes                text,
  recorded_by          uuid          not null references users(id) on delete restrict,
  recorded_at          timestamptz   not null default now(),
  created_at           timestamptz   not null default now(),
  updated_at           timestamptz   not null default now(),
  constraint chk_vitals_spo2 check (spo2 is null or (spo2 between 0 and 100)),
  constraint chk_vitals_pain check (pain_score is null or (pain_score between 0 and 10))
);
comment on table vitals is
  'Vitals readings â€” temp, BP, SpO2, pulse, RR, sugar, BMI generated. OP visit, IP, or standalone.';

create index if not exists idx_vitals_visit
  on vitals(op_visit_id, recorded_at desc) where op_visit_id is not null;
create index if not exists idx_vitals_patient
  on vitals(patient_id, recorded_at desc);

drop trigger if exists trg_vitals_updated_at on vitals;
create trigger trg_vitals_updated_at
  before update on vitals
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------
-- 2. consultations
-- ---------------------------------------------------------------------
create table if not exists consultations (
  id                          uuid         primary key default gen_random_uuid(),
  tenant_id                   uuid         not null references tenants(id) on delete restrict,
  op_visit_id                 uuid         not null unique references op_visits(id) on delete restrict,
  patient_id                  uuid         not null references patients(id) on delete restrict,
  doctor_id                   uuid         not null references users(id) on delete restrict,
  chief_complaint             text,
  history_of_present_illness  text,
  past_history                text,
  examination_findings        jsonb,
  diagnoses                   jsonb[]      not null default '{}',
  symptoms                    text,
  clinical_notes              text,
  advice                      text,
  vitals_snapshot             jsonb,
  next_action                 varchar(32)  not null,
  follow_up_required          boolean      not null default false,
  follow_up_date              date,
  admission_required          boolean      not null default false,
  surgery_required            boolean      not null default false,
  physio_required             boolean      not null default false,
  locked_at                   timestamptz,
  created_by                  uuid         references users(id) on delete set null,
  created_at                  timestamptz  not null default now(),
  updated_by                  uuid         references users(id) on delete set null,
  updated_at                  timestamptz  not null default now(),
  version                     int          not null default 0,
  constraint chk_consultations_next_action check (
    next_action in ('prescription_only','lab_ordered','radiology_ordered','admit_ip',
                    'surgery_referral','follow_up','referred_external','no_action')
  )
);
comment on table consultations is
  'One doctor encounter â€” complaint, exam, diagnoses, advice, next action. Locked after sign-off.';

-- GIN on diagnoses for ICD-10 search across visits
create index if not exists idx_consultations_diagnoses_gin
  on consultations using gin (diagnoses);
create index if not exists idx_consultations_doctor
  on consultations(tenant_id, doctor_id, created_at desc);
create index if not exists idx_consultations_follow_up
  on consultations(tenant_id, follow_up_required, follow_up_date)
  where follow_up_required = true;

drop trigger if exists trg_consultations_updated_at on consultations;
create trigger trg_consultations_updated_at
  before update on consultations
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------
-- fn_consultations_lock_guard  (BEFORE UPDATE)
-- Once locked_at is set, blocks subsequent updates EXCEPT the lock-toggle
-- and the standard housekeeping columns (updated_at, updated_by, version).
-- App-level amendment endpoint must clear locked_at before any other edit.
-- ---------------------------------------------------------------------
create or replace function fn_consultations_lock_guard() returns trigger
language plpgsql
as $$
begin
  if old.locked_at is not null then
    -- Allow only housekeeping changes; reject any clinical edit.
    if (new.chief_complaint            is distinct from old.chief_complaint)
       or (new.history_of_present_illness is distinct from old.history_of_present_illness)
       or (new.past_history             is distinct from old.past_history)
       or (new.examination_findings     is distinct from old.examination_findings)
       or (new.diagnoses                is distinct from old.diagnoses)
       or (new.symptoms                 is distinct from old.symptoms)
       or (new.clinical_notes           is distinct from old.clinical_notes)
       or (new.advice                   is distinct from old.advice)
       or (new.vitals_snapshot          is distinct from old.vitals_snapshot)
       or (new.next_action              is distinct from old.next_action)
       or (new.follow_up_required       is distinct from old.follow_up_required)
       or (new.follow_up_date           is distinct from old.follow_up_date)
       or (new.admission_required       is distinct from old.admission_required)
       or (new.surgery_required         is distinct from old.surgery_required)
       or (new.physio_required          is distinct from old.physio_required)
    then
      raise exception 'consultation % is locked; clinical fields cannot be updated', old.id
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_consultations_lock_guard on consultations;
create trigger trg_consultations_lock_guard
  before update on consultations
  for each row execute function fn_consultations_lock_guard();

-- ---------------------------------------------------------------------
-- 3. diagnosis_templates
-- ---------------------------------------------------------------------
create table if not exists diagnosis_templates (
  id                       uuid         primary key default gen_random_uuid(),
  tenant_id                uuid         not null references tenants(id) on delete restrict,
  template_name            varchar(200) not null,
  department_id            uuid         references departments(id) on delete set null,
  specialty                varchar(120),
  icd10_code               varchar(16),
  diagnosis_text           text         not null,
  template_json            jsonb        not null,
  default_advice           text,
  default_followup_days    int,
  created_by               uuid         references users(id) on delete set null,
  is_active                boolean      not null default true,
  created_at               timestamptz  not null default now(),
  updated_at               timestamptz  not null default now()
);
comment on table diagnosis_templates is
  'Pre-built diagnosis bundles â€” exam, common meds, common tests. Speeds up frequent presentations.';

create index if not exists idx_diagnosis_templates_dept
  on diagnosis_templates(tenant_id, department_id, is_active);
create index if not exists idx_diagnosis_templates_name
  on diagnosis_templates(tenant_id, lower(template_name));

drop trigger if exists trg_diagnosis_templates_updated_at on diagnosis_templates;
create trigger trg_diagnosis_templates_updated_at
  before update on diagnosis_templates
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------
-- 4. prescriptions
-- ---------------------------------------------------------------------
create table if not exists prescriptions (
  id                uuid         primary key default gen_random_uuid(),
  tenant_id         uuid         not null references tenants(id) on delete restrict,
  consultation_id   uuid         not null unique references consultations(id) on delete restrict,
  patient_id        uuid         not null references patients(id) on delete restrict,
  doctor_id         uuid         not null references users(id) on delete restrict,
  status            varchar(32)  not null default 'draft',
  locked_at         timestamptz,
  created_by        uuid         references users(id) on delete set null,
  created_at        timestamptz  not null default now(),
  updated_by        uuid         references users(id) on delete set null,
  updated_at        timestamptz  not null default now(),
  version           int          not null default 0,
  constraint chk_prescriptions_status check (
    status in ('draft','active','dispensed','partially_dispensed','cancelled')
  )
);
comment on table prescriptions is
  'Prescription header per consultation. Tracks dispensing status across pharmacy.';

create index if not exists idx_prescriptions_patient
  on prescriptions(tenant_id, patient_id, created_at desc);
create index if not exists idx_prescriptions_status
  on prescriptions(tenant_id, status, created_at desc)
  where status in ('active','partially_dispensed');

drop trigger if exists trg_prescriptions_updated_at on prescriptions;
create trigger trg_prescriptions_updated_at
  before update on prescriptions
  for each row execute function fn_set_updated_at();

-- Now wire narcotic_register.prescription_id FK
alter table narcotic_register
  add constraint fk_narcotic_register_prescription
  foreign key (prescription_id) references prescriptions(id) on delete set null;

-- ---------------------------------------------------------------------
-- 5. prescription_items
-- ---------------------------------------------------------------------
create table if not exists prescription_items (
  id                       uuid         primary key default gen_random_uuid(),
  prescription_id          uuid         not null references prescriptions(id) on delete cascade,
  medicine_id              uuid         not null references medicines(id) on delete restrict,
  medicine_name_snapshot   varchar(200) not null,
  dosage                   varchar(64)  not null,
  frequency                varchar(32)  not null,
  duration_days            int          not null,
  instructions             text,
  quantity_prescribed      int          not null,
  dispensed_qty            int          not null default 0,
  sequence_no              int          not null,
  created_at               timestamptz  not null default now(),
  constraint chk_prescription_items_qty_prescribed check (quantity_prescribed > 0),
  constraint chk_prescription_items_dispensed      check (dispensed_qty >= 0),
  constraint uq_prescription_items_sequence        unique (prescription_id, sequence_no)
);
comment on table prescription_items is
  'One drug per row â€” dosage, frequency, duration, qty prescribed vs dispensed. Stable display order via sequence_no.';

create index if not exists idx_prescription_items_medicine
  on prescription_items(prescription_id, medicine_id);

-- ---------------------------------------------------------------------
-- 6. doctor_recommendations
-- ---------------------------------------------------------------------
create table if not exists doctor_recommendations (
  id                          uuid         primary key default gen_random_uuid(),
  tenant_id                   uuid         not null references tenants(id) on delete restrict,
  consultation_id             uuid         not null references consultations(id) on delete cascade,
  patient_id                  uuid         not null references patients(id) on delete restrict,
  recommendation_type         varchar(32)  not null,
  physio_session_id           uuid,                                  -- phase 2
  surgery_schedule_id         uuid,                                  -- phase 2
  ip_admission_id             uuid,                                  -- phase 2
  follow_up_appointment_id    uuid,                                  -- appointments module out of scope
  lab_order_id                uuid,                                  -- FK added in 060_lab.sql
  radiology_order_id          uuid,                                  -- FK added in 061_radiology.sql
  external_referral_id        uuid,
  notes                       text,
  priority                    varchar(16)  not null default 'routine',
  status                      varchar(16)  not null default 'open',
  created_by                  uuid         references users(id) on delete set null,
  created_at                  timestamptz  not null default now(),
  updated_at                  timestamptz  not null default now(),
  constraint chk_doctor_recommendations_type check (
    recommendation_type in ('physio','surgery','admission','follow_up','lab','radiology','specialist_referral')
  ),
  constraint chk_doctor_recommendations_priority check (priority in ('routine','urgent','stat')),
  constraint chk_doctor_recommendations_status   check (
    status in ('open','scheduled','completed','cancelled','declined')
  ),
  constraint chk_doctor_recommendations_one_fk check (
    num_nonnulls(physio_session_id, surgery_schedule_id, ip_admission_id,
                 follow_up_appointment_id, lab_order_id, radiology_order_id,
                 external_referral_id) <= 1
  ),
  constraint chk_doctor_recommendations_external_referral check (
    recommendation_type = 'specialist_referral' or external_referral_id is null
  )
);
comment on table doctor_recommendations is
  'Non-Rx outputs â€” physio, surgery, admission, follow-up, lab, radiology, specialist referral. At-most-one-non-null FK.';

create index if not exists idx_doctor_rec_worklist
  on doctor_recommendations(tenant_id, status, recommendation_type, priority);
create index if not exists idx_doctor_rec_consultation
  on doctor_recommendations(consultation_id);
create index if not exists idx_doctor_rec_patient
  on doctor_recommendations(patient_id, status, created_at desc);
create index if not exists idx_doctor_rec_lab_order
  on doctor_recommendations(lab_order_id) where lab_order_id is not null;
create index if not exists idx_doctor_rec_radiology_order
  on doctor_recommendations(radiology_order_id) where radiology_order_id is not null;

drop trigger if exists trg_doctor_recommendations_updated_at on doctor_recommendations;
create trigger trg_doctor_recommendations_updated_at
  before update on doctor_recommendations
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------
-- 7. consultation_drafts
-- ---------------------------------------------------------------------
create table if not exists consultation_drafts (
  id                uuid         primary key default gen_random_uuid(),
  tenant_id         uuid         not null references tenants(id) on delete restrict,
  doctor_id         uuid         not null references users(id) on delete cascade,
  patient_id        uuid         not null references patients(id) on delete cascade,
  op_visit_id       uuid         references op_visits(id) on delete cascade,
  ip_admission_id   uuid,                          -- phase 2
  draft_data        jsonb        not null,
  autosave_count    int          not null default 0,
  last_saved_at     timestamptz  not null default now(),
  expires_at        timestamptz  not null default (now() + interval '7 days'),
  restored_at       timestamptz
);
comment on table consultation_drafts is
  'Auto-saved in-progress consultation data. Restores work if browser/session is lost. 7-day TTL.';

create unique index if not exists uq_consultation_drafts_visit
  on consultation_drafts(doctor_id, op_visit_id) where op_visit_id is not null;
create index if not exists idx_consultation_drafts_expiry
  on consultation_drafts(expires_at) where restored_at is null;
create index if not exists idx_consultation_drafts_data_gin
  on consultation_drafts using gin (draft_data);

-- =====================================================================
-- 060_lab.sql
-- =====================================================================
-- =====================================================================
-- 060_lab.sql
-- lab_tests, lab_test_panels, lab_orders, lab_order_items,
-- lab_samples, lab_results.
--
-- Spec: docs/03-schema/v2/modules/12-lab.html
-- TSD : docs/05-tsd/08-lab.md
--
-- NOTE: lab_orders.invoice_id has NO FK (billing module out of scope).
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- 1. lab_tests
-- ---------------------------------------------------------------------
create table if not exists lab_tests (
  id                   uuid          primary key default gen_random_uuid(),
  tenant_id            uuid          not null references tenants(id) on delete restrict,
  test_code            varchar(64)   not null,
  test_name            varchar(200)  not null,
  category             varchar(32)   not null,
  sample_type          varchar(64)   not null,
  sample_volume_ml     numeric(4,1),
  department_id        uuid          references departments(id) on delete set null,
  default_price        numeric(10,2) not null,
  normal_range_male    varchar(120),
  normal_range_female  varchar(120),
  ref_min_male         numeric(12,4),
  ref_max_male         numeric(12,4),
  ref_min_female       numeric(12,4),
  ref_max_female       numeric(12,4),
  critical_low         numeric(12,4),
  critical_high        numeric(12,4),
  unit                 varchar(32),
  tat_hours            int,
  result_type          varchar(32)   not null default 'numeric',
  requires_fasting     boolean       not null default false,
  is_active            boolean       not null default true,
  created_by           uuid          references users(id) on delete set null,
  created_at           timestamptz   not null default now(),
  updated_by           uuid          references users(id) on delete set null,
  updated_at           timestamptz   not null default now(),
  version              int           not null default 0,
  constraint chk_lab_tests_category check (
    category in ('hematology','biochemistry','microbiology','serology','pathology','endocrinology','immunology')
  ),
  constraint chk_lab_tests_result_type check (
    result_type in ('numeric','positive_negative','reactive_nonreactive','grade','free_text','image')
  ),
  constraint uq_lab_tests_code unique (tenant_id, test_code)
);
comment on table lab_tests is
  'Test catalog â€” code, name, category, sample type, reference ranges (gendered), critical thresholds.';

create index if not exists idx_lab_tests_category
  on lab_tests(tenant_id, category, is_active);

drop trigger if exists trg_lab_tests_updated_at on lab_tests;
create trigger trg_lab_tests_updated_at
  before update on lab_tests
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------
-- 2. lab_test_panels
-- ---------------------------------------------------------------------
create table if not exists lab_test_panels (
  id              uuid          primary key default gen_random_uuid(),
  tenant_id       uuid          not null references tenants(id) on delete restrict,
  panel_code      varchar(64)   not null,
  panel_name      varchar(200)  not null,
  test_ids        uuid[]        not null default '{}',
  package_price   numeric(10,2) not null,
  description     text,
  is_active       boolean       not null default true,
  created_by      uuid          references users(id) on delete set null,
  created_at      timestamptz   not null default now(),
  updated_by      uuid          references users(id) on delete set null,
  updated_at      timestamptz   not null default now(),
  version         int           not null default 0,
  constraint uq_lab_test_panels_code unique (tenant_id, panel_code)
);
comment on table lab_test_panels is
  'Bundled test groups (CBC, LFT, Diabetes Panel) priced as a package. GIN index on test_ids.';

create index if not exists idx_lab_test_panels_test_ids
  on lab_test_panels using gin (test_ids);

drop trigger if exists trg_lab_test_panels_updated_at on lab_test_panels;
create trigger trg_lab_test_panels_updated_at
  before update on lab_test_panels
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------
-- 3. lab_orders
-- ---------------------------------------------------------------------
create table if not exists lab_orders (
  id                                uuid         primary key default gen_random_uuid(),
  tenant_id                         uuid         not null references tenants(id) on delete restrict,
  order_number                      varchar(32)  not null unique,
  patient_id                        uuid         not null references patients(id) on delete restrict,
  op_visit_id                       uuid         references op_visits(id) on delete set null,
  ip_admission_id                   uuid,                                       -- phase 2
  consultation_id                   uuid         references consultations(id) on delete set null,
  doctor_id                         uuid         not null references users(id) on delete restrict,
  priority                          varchar(16)  not null default 'routine',
  invoice_id                        uuid,                                       -- billing module out of scope
  payment_required_before_service   boolean      not null default true,
  status                            varchar(32)  not null default 'ordered',
  ordered_at                        timestamptz  not null default now(),
  completed_at                      timestamptz,
  created_by                        uuid         references users(id) on delete set null,
  created_at                        timestamptz  not null default now(),
  updated_by                        uuid         references users(id) on delete set null,
  updated_at                        timestamptz  not null default now(),
  version                           int          not null default 0,
  constraint chk_lab_orders_priority check (priority in ('routine','urgent','stat')),
  constraint chk_lab_orders_status check (
    status in ('ordered','awaiting_payment','paid','sample_collection','sample_collected',
               'in_progress','partially_reported','reported','released','cancelled')
  )
);
comment on table lab_orders is
  'Test order header â€” patient, doctor, priority, payment gate, lifecycle status.';

create index if not exists idx_lab_orders_patient
  on lab_orders(tenant_id, patient_id, ordered_at desc);
create index if not exists idx_lab_orders_worklist
  on lab_orders(tenant_id, status, priority, ordered_at);
create index if not exists idx_lab_orders_consultation
  on lab_orders(consultation_id);

drop trigger if exists trg_lab_orders_updated_at on lab_orders;
create trigger trg_lab_orders_updated_at
  before update on lab_orders
  for each row execute function fn_set_updated_at();

-- Back-fill: doctor_recommendations.lab_order_id FK
alter table doctor_recommendations
  add constraint fk_doctor_rec_lab_order
  foreign key (lab_order_id) references lab_orders(id) on delete set null;

-- ---------------------------------------------------------------------
-- 4. lab_samples  (created BEFORE lab_order_items because items FK samples)
-- ---------------------------------------------------------------------
create table if not exists lab_samples (
  id                     uuid         primary key default gen_random_uuid(),
  tenant_id              uuid         not null references tenants(id) on delete restrict,
  sample_barcode         varchar(64)  not null unique,
  patient_id             uuid         not null references patients(id) on delete restrict,
  lab_order_id           uuid         not null references lab_orders(id) on delete restrict,
  sample_type            varchar(64)  not null,
  status                 varchar(32)  not null default 'collected',
  collected_by           uuid         not null references users(id) on delete restrict,
  collected_at           timestamptz  not null default now(),
  received_by            uuid         references users(id) on delete set null,
  received_at            timestamptz,
  rejected_at            timestamptz,
  rejected_by            uuid         references users(id) on delete set null,
  rejection_reason       text,
  replaces_sample_id     uuid         references lab_samples(id) on delete set null,
  disposed_at            timestamptz,
  notes                  text,
  constraint chk_lab_samples_status check (
    status in ('collected','received','rejected','processing','processed','disposed')
  ),
  constraint chk_lab_samples_rejection
    check ((status = 'rejected') = (rejection_reason is not null))
);
comment on table lab_samples is
  'Physical sample tracking â€” barcode, type, status (collectedâ†’receivedâ†’processed). Recollection chain via replaces_sample_id.';

create index if not exists idx_lab_samples_order
  on lab_samples(tenant_id, lab_order_id);
create index if not exists idx_lab_samples_worklist
  on lab_samples(tenant_id, status, collected_at);
create index if not exists idx_lab_samples_replaces
  on lab_samples(replaces_sample_id) where replaces_sample_id is not null;

-- ---------------------------------------------------------------------
-- 5. lab_order_items  (created BEFORE lab_results since results FK items)
-- ---------------------------------------------------------------------
create table if not exists lab_order_items (
  id            uuid         primary key default gen_random_uuid(),
  lab_order_id  uuid         not null references lab_orders(id) on delete cascade,
  lab_test_id   uuid         not null references lab_tests(id) on delete restrict,
  panel_id      uuid         references lab_test_panels(id) on delete set null,
  sample_id     uuid         references lab_samples(id) on delete set null,
  result_id     uuid,                                  -- FK added after lab_results below
  status        varchar(32)  not null default 'pending',
  sequence_no   int          not null default 1,
  constraint chk_lab_order_items_status check (
    status in ('pending','sample_collected','rejected','recollection_pending','in_progress',
               'reported','verified','released','cancelled')
  ),
  constraint uq_lab_order_items unique (lab_order_id, lab_test_id)
);
comment on table lab_order_items is
  'One test per row inside an order. Each links to its sample and result.';

create index if not exists idx_lab_order_items_sample
  on lab_order_items(sample_id) where sample_id is not null;
create index if not exists idx_lab_order_items_status
  on lab_order_items(status, lab_order_id);

-- ---------------------------------------------------------------------
-- 6. lab_results
-- ---------------------------------------------------------------------
create table if not exists lab_results (
  id                          uuid         primary key default gen_random_uuid(),
  tenant_id                   uuid         not null references tenants(id) on delete restrict,
  lab_order_item_id           uuid         not null unique references lab_order_items(id) on delete restrict,
  value                       varchar(120) not null,
  value_numeric               numeric(12,4),
  value_text                  varchar(120),
  unit                        varchar(32),
  flag                        varchar(16)  not null default 'normal',
  method                      varchar(120),
  comments                    text,
  report_pdf_url              text,
  report_attachment_id        uuid         references file_attachments(id) on delete set null,
  release_status              varchar(32)  not null default 'pending_verification',
  is_override_release         boolean      not null default false,
  override_release_reason     text,
  amended_from_result_id      uuid         references lab_results(id) on delete set null,
  approval_status             varchar(16)  not null default 'pending',
  approved_by                 uuid         references users(id) on delete set null,
  approved_at                 timestamptz,
  rejection_reason            text,
  performed_by                uuid         not null references users(id) on delete restrict,
  verified_by                 uuid         references users(id) on delete set null,
  verified_at                 timestamptz,
  reported_at                 timestamptz  not null default now(),
  created_by                  uuid         references users(id) on delete set null,
  created_at                  timestamptz  not null default now(),
  updated_by                  uuid         references users(id) on delete set null,
  updated_at                  timestamptz  not null default now(),
  version                     int          not null default 0,
  constraint chk_lab_results_flag check (
    flag in ('normal','high','low','critical_high','critical_low')
  ),
  constraint chk_lab_results_release_status check (
    release_status in ('pending_verification','verified','override_released','amended','rejected')
  ),
  constraint chk_lab_results_approval_status check (
    approval_status in ('pending','approved','rejected')
  ),
  constraint chk_lab_results_override_reason check (
    is_override_release = false
    or (override_release_reason is not null and length(override_release_reason) > 10)
  ),
  constraint chk_lab_results_verified_when_released check (
    (release_status in ('verified','override_released')) = (verified_by is not null)
  )
  -- NOTE: separation-of-duties CHECK (created_by <> verified_by) intentionally
  -- omitted at DB level â€” single-tech tenants would be blocked. Enforced by app.
);
comment on table lab_results is
  'Per-test result â€” value, unit, flag (auto-set), method, verifier. Layer 2 maker-checker.';

create index if not exists idx_lab_results_pending_verification
  on lab_results(tenant_id, release_status, reported_at desc)
  where release_status = 'pending_verification';
create index if not exists idx_lab_results_critical
  on lab_results(tenant_id, flag, release_status)
  where flag in ('critical_high','critical_low');
create index if not exists idx_lab_results_performed
  on lab_results(tenant_id, reported_at desc);

drop trigger if exists trg_lab_results_updated_at on lab_results;
create trigger trg_lab_results_updated_at
  before update on lab_results
  for each row execute function fn_set_updated_at();

-- Back-fill lab_order_items.result_id FK
alter table lab_order_items
  add constraint fk_lab_order_items_result
  foreign key (result_id) references lab_results(id) on delete set null;

-- ---------------------------------------------------------------------
-- fn_autoflag_lab_result  (BEFORE INSERT)
-- Sets flag from value_numeric against the constituent lab_tests reference
-- ranges. Gender-aware via patients.gender. Critical thresholds override
-- normal ranges.
-- ---------------------------------------------------------------------
create or replace function fn_autoflag_lab_result() returns trigger
language plpgsql
as $$
declare
  v_test         record;
  v_gender       varchar(1);
  v_ref_min      numeric(12,4);
  v_ref_max      numeric(12,4);
  v_crit_low     numeric(12,4);
  v_crit_high    numeric(12,4);
begin
  if new.value_numeric is null then
    -- Non-numeric results stay at the explicit/default flag value.
    return new;
  end if;

  select t.ref_min_male, t.ref_max_male, t.ref_min_female, t.ref_max_female,
         t.critical_low, t.critical_high,
         p.gender
    into v_test
    from lab_order_items oi
    join lab_tests       t on t.id = oi.lab_test_id
    join lab_orders      lo on lo.id = oi.lab_order_id
    join patients        p  on p.id = lo.patient_id
   where oi.id = new.lab_order_item_id;

  if v_test is null then
    return new;
  end if;

  v_gender    := v_test.gender;
  v_crit_low  := v_test.critical_low;
  v_crit_high := v_test.critical_high;

  if v_gender = 'F' then
    v_ref_min := v_test.ref_min_female;
    v_ref_max := v_test.ref_max_female;
  else
    v_ref_min := v_test.ref_min_male;
    v_ref_max := v_test.ref_max_male;
  end if;

  -- Critical thresholds win over normal/high/low.
  if v_crit_low is not null and new.value_numeric < v_crit_low then
    new.flag := 'critical_low';
  elsif v_crit_high is not null and new.value_numeric > v_crit_high then
    new.flag := 'critical_high';
  elsif v_ref_min is not null and new.value_numeric < v_ref_min then
    new.flag := 'low';
  elsif v_ref_max is not null and new.value_numeric > v_ref_max then
    new.flag := 'high';
  else
    new.flag := 'normal';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_lab_results_autoflag on lab_results;
create trigger trg_lab_results_autoflag
  before insert on lab_results
  for each row execute function fn_autoflag_lab_result();

-- ---------------------------------------------------------------------
-- fn_critical_lab_alert  (AFTER INSERT)
-- Creates a notifications row when flag is critical_high/critical_low.
-- ---------------------------------------------------------------------
create or replace function fn_critical_lab_alert() returns trigger
language plpgsql
as $$
declare
  v_doctor_id  uuid;
  v_patient_id uuid;
  v_test_name  varchar(200);
begin
  if new.flag not in ('critical_high','critical_low') then
    return null;
  end if;

  select lo.doctor_id, lo.patient_id, t.test_name
    into v_doctor_id, v_patient_id, v_test_name
    from lab_order_items oi
    join lab_orders      lo on lo.id = oi.lab_order_id
    join lab_tests       t  on t.id = oi.lab_test_id
   where oi.id = new.lab_order_item_id;

  insert into notifications
    (user_id, type, title, body, link, priority, ack_required, ack_sla_minutes)
  values
    (v_doctor_id,
     'lab_result_critical',
     'CRITICAL lab value: ' || coalesce(v_test_name, 'Unknown test'),
     'A critical ' || new.flag || ' result has been recorded. Please review immediately.',
     '/doctor/lab-results/' || new.id::text,
     'urgent',
     true,
     30);

  -- Also fire a domain event for downstream subscribers.
  insert into domain_events (tenant_id, aggregate_type, aggregate_id, event_type, payload)
  values (new.tenant_id, 'lab_result', new.id, 'LabResultCriticallyAbnormal',
          jsonb_build_object('flag', new.flag,
                             'lab_order_item_id', new.lab_order_item_id,
                             'doctor_id', v_doctor_id,
                             'patient_id', v_patient_id));
  return null;
end;
$$;

drop trigger if exists trg_lab_results_critical_alert on lab_results;
create trigger trg_lab_results_critical_alert
  after insert on lab_results
  for each row execute function fn_critical_lab_alert();

-- ---------------------------------------------------------------------
-- fn_lab_release_event  (AFTER UPDATE OF release_status)
-- Emits a LabResultReleased domain event when status moves to released.
-- ---------------------------------------------------------------------
create or replace function fn_lab_release_event() returns trigger
language plpgsql
as $$
begin
  if new.release_status in ('verified','override_released')
     and old.release_status is distinct from new.release_status
  then
    insert into domain_events
      (tenant_id, aggregate_type, aggregate_id, event_type, payload)
    values
      (new.tenant_id, 'lab_result', new.id, 'LabResultReleased',
       jsonb_build_object('release_status', new.release_status,
                          'is_override_release', new.is_override_release,
                          'lab_order_item_id', new.lab_order_item_id));
  end if;
  return null;
end;
$$;

drop trigger if exists trg_lab_results_release_event on lab_results;
create trigger trg_lab_results_release_event
  after update of release_status on lab_results
  for each row execute function fn_lab_release_event();

-- =====================================================================
-- 061_radiology.sql
-- =====================================================================
-- =====================================================================
-- 061_radiology.sql
-- radiology_procedures (catalog), radiology_orders, radiology_studies,
-- radiology_reports.
--
-- Spec: docs/03-schema/v2/modules/13-radiology.html
-- TSD : docs/05-tsd/09-radiology.md
--
-- NOTE: radiology_orders.invoice_id has NO FK (billing module out of scope).
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- 1. radiology_procedures
-- (The user message refers to "radiology_tests" â€” schema v8 names the
-- table radiology_procedures, which is what we use.)
-- ---------------------------------------------------------------------
create table if not exists radiology_procedures (
  id                              uuid          primary key default gen_random_uuid(),
  tenant_id                       uuid          not null references tenants(id) on delete restrict,
  procedure_code                  varchar(64)   not null,
  test_name                       varchar(200)  not null,
  modality                        varchar(32)   not null,
  body_part                       varchar(64),
  with_contrast                   boolean       not null default false,
  default_price                   numeric(10,2) not null,
  typical_duration_mins           int,
  requires_fasting                boolean       not null default false,
  requires_radiologist_presence   boolean       not null default false,
  is_active                       boolean       not null default true,
  created_by                      uuid          references users(id) on delete set null,
  created_at                      timestamptz   not null default now(),
  updated_by                      uuid          references users(id) on delete set null,
  updated_at                      timestamptz   not null default now(),
  version                         int           not null default 0,
  constraint chk_radiology_procedures_modality check (
    modality in ('xray','ultrasound','ct','mri','mammography','dexa','fluoroscopy','nuclear','other')
  ),
  constraint uq_radiology_procedures_code unique (tenant_id, procedure_code)
);
comment on table radiology_procedures is
  'Procedure catalog â€” code, name, modality (xray/ct/mri/ultrasound), body part, default price, contrast/fasting/radiologist requirements.';

create index if not exists idx_radiology_procedures_modality
  on radiology_procedures(tenant_id, modality, is_active);

drop trigger if exists trg_radiology_procedures_updated_at on radiology_procedures;
create trigger trg_radiology_procedures_updated_at
  before update on radiology_procedures
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------
-- 2. radiology_orders
-- ---------------------------------------------------------------------
create table if not exists radiology_orders (
  id                                uuid          primary key default gen_random_uuid(),
  tenant_id                         uuid          not null references tenants(id) on delete restrict,
  order_number                      varchar(32)   not null unique,
  patient_id                        uuid          not null references patients(id) on delete restrict,
  op_visit_id                       uuid          references op_visits(id) on delete set null,
  ip_admission_id                   uuid,                                         -- phase 2
  consultation_id                   uuid          references consultations(id) on delete set null,
  doctor_id                         uuid          not null references users(id) on delete restrict,
  radiology_procedure_id            uuid          not null references radiology_procedures(id) on delete restrict,
  with_contrast                     boolean,                                       -- order-level override
  clinical_question                 text,
  priority                          varchar(16)   not null default 'routine',
  invoice_id                        uuid,                                          -- billing module out of scope
  payment_required_before_service   boolean       not null default true,
  status                            varchar(32)   not null default 'ordered',
  ordered_at                        timestamptz   not null default now(),
  imaging_completed_at              timestamptz,
  released_at                       timestamptz,
  created_by                        uuid          references users(id) on delete set null,
  created_at                        timestamptz   not null default now(),
  updated_by                        uuid          references users(id) on delete set null,
  updated_at                        timestamptz   not null default now(),
  version                           int           not null default 0,
  constraint chk_radiology_orders_priority check (priority in ('routine','urgent','stat')),
  constraint chk_radiology_orders_status check (
    status in ('ordered','awaiting_payment','paid','imaging_pending','imaging_in_progress',
               'imaging_completed','reporting_pending','reported','released','cancelled')
  )
);
comment on table radiology_orders is
  'Imaging order header â€” patient, doctor, procedure, priority, payment gate, lifecycle status.';

create index if not exists idx_radiology_orders_patient
  on radiology_orders(tenant_id, patient_id, ordered_at desc);
create index if not exists idx_radiology_orders_worklist
  on radiology_orders(tenant_id, status, priority, ordered_at);
create index if not exists idx_radiology_orders_consultation
  on radiology_orders(consultation_id);

drop trigger if exists trg_radiology_orders_updated_at on radiology_orders;
create trigger trg_radiology_orders_updated_at
  before update on radiology_orders
  for each row execute function fn_set_updated_at();

-- Back-fill: doctor_recommendations.radiology_order_id FK
alter table doctor_recommendations
  add constraint fk_doctor_rec_radiology_order
  foreign key (radiology_order_id) references radiology_orders(id) on delete set null;

-- ---------------------------------------------------------------------
-- 3. radiology_studies
-- ---------------------------------------------------------------------
create table if not exists radiology_studies (
  id                      uuid         primary key default gen_random_uuid(),
  tenant_id               uuid         not null references tenants(id) on delete restrict,
  radiology_order_id      uuid         not null references radiology_orders(id) on delete restrict,
  study_uid               varchar(128) not null unique,
  accession_number        varchar(64)  not null unique,
  modality_snapshot       varchar(32)  not null,
  body_part_snapshot      varchar(64),
  technique               text,
  images_count            int          not null default 0,
  images_url              text[]       not null default '{}',
  pacs_archive_status     varchar(32)  not null default 'pending',
  technician_id           uuid         not null references users(id) on delete restrict,
  study_started_at        timestamptz  not null default now(),
  study_completed_at      timestamptz,
  created_by              uuid         references users(id) on delete set null,
  created_at              timestamptz  not null default now(),
  updated_by              uuid         references users(id) on delete set null,
  updated_at              timestamptz  not null default now(),
  version                 int          not null default 0,
  constraint chk_radiology_studies_pacs check (
    pacs_archive_status in ('pending','archived','retrieval_failed')
  )
);
comment on table radiology_studies is
  'Captured study record â€” DICOM UID, accession number, image URLs, technician, completion time. PACS bridge.';

create index if not exists idx_radiology_studies_order
  on radiology_studies(radiology_order_id);

drop trigger if exists trg_radiology_studies_updated_at on radiology_studies;
create trigger trg_radiology_studies_updated_at
  before update on radiology_studies
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------
-- 4. radiology_reports
-- ---------------------------------------------------------------------
create table if not exists radiology_reports (
  id                            uuid         primary key default gen_random_uuid(),
  tenant_id                     uuid         not null references tenants(id) on delete restrict,
  radiology_order_id            uuid         not null references radiology_orders(id) on delete restrict,
  study_id                      uuid         references radiology_studies(id) on delete set null,
  findings                      text,
  impression                    text,
  recommendation                text,
  reported_by_radiologist_id    uuid         references users(id) on delete restrict,
  dictated_at                   timestamptz,
  release_status                varchar(32)  not null default 'pending_verification',
  approval_status               varchar(16)  not null default 'pending',
  approved_by                   uuid         references users(id) on delete set null,
  approved_at                   timestamptz,
  rejection_reason              text,
  amended_from_report_id        uuid         references radiology_reports(id) on delete set null,
  amendment_reason              text,
  file_attachment_id            uuid         references file_attachments(id) on delete set null,
  report_pdf_url                text,
  uploaded_by                   uuid         not null references users(id) on delete restrict,
  uploaded_at                   timestamptz  not null default now(),
  created_by                    uuid         references users(id) on delete set null,
  created_at                    timestamptz  not null default now(),
  updated_by                    uuid         references users(id) on delete set null,
  updated_at                    timestamptz  not null default now(),
  version                       int          not null default 0,
  constraint chk_radiology_reports_release_status check (
    release_status in ('pending_verification','verified','released','amended','rejected')
  ),
  constraint chk_radiology_reports_approval_status check (
    approval_status in ('pending','approved','rejected')
  ),
  constraint chk_radiology_reports_amendment_reason check (
    amended_from_report_id is null
    or (amendment_reason is not null and length(amendment_reason) > 10)
  ),
  constraint chk_radiology_reports_released_when_approved check (
    (release_status = 'released') = (approval_status = 'approved' and approved_by is not null)
  )
  -- NOTE: separation-of-duties (created_by <> approved_by) intentionally omitted â€”
  -- single-radiologist tenants would be blocked. Enforce via tenant-config flag
  -- 'radiology.require_dual_signoff' in app code (TSD-09 Â§6 open item).
);
comment on table radiology_reports is
  'Radiologist findings + impression + recommendation for a study. Layer 2 maker-checker (junior reads, senior verifies). Amendment chain via amended_from_report_id.';

create index if not exists idx_radiology_reports_pending
  on radiology_reports(tenant_id, release_status, dictated_at desc)
  where release_status = 'pending_verification';
create index if not exists idx_radiology_reports_order
  on radiology_reports(radiology_order_id);
create index if not exists idx_radiology_reports_radiologist
  on radiology_reports(reported_by_radiologist_id, dictated_at desc);

drop trigger if exists trg_radiology_reports_updated_at on radiology_reports;
create trigger trg_radiology_reports_updated_at
  before update on radiology_reports
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------
-- fn_radiology_release_event  (AFTER UPDATE OF release_status)
-- Emits a RadiologyReportReleased event when status moves to released.
-- ---------------------------------------------------------------------
create or replace function fn_radiology_release_event() returns trigger
language plpgsql
as $$
begin
  if new.release_status = 'released'
     and old.release_status is distinct from new.release_status
  then
    insert into domain_events
      (tenant_id, aggregate_type, aggregate_id, event_type, payload)
    values
      (new.tenant_id, 'radiology_report', new.id, 'RadiologyReportReleased',
       jsonb_build_object('radiology_order_id', new.radiology_order_id,
                          'reported_by', new.reported_by_radiologist_id));
  end if;
  return null;
end;
$$;

drop trigger if exists trg_radiology_reports_release_event on radiology_reports;
create trigger trg_radiology_reports_release_event
  after update of release_status on radiology_reports
  for each row execute function fn_radiology_release_event();

-- =====================================================================
-- 900_seed_data.sql
-- =====================================================================
-- =====================================================================
-- 900_seed_data.sql
-- Reference data + bootstrap rows (Kumudha Hospital tenant + Dr. Priya Iyer).
--
-- Idempotent â€” uses ON CONFLICT DO NOTHING so reruns are safe.
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- 1. Tenant â€” Kumudha Hospital, Villupuram
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
  ('33333333-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'owner',         'Hospital owner â€” full read access', true),
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
-- password_hash is a placeholder â€” must be reset before any login.
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
-- 5. Sample doctor â€” Dr. Priya Iyer (matches FE mocks)
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
-- 6. patient_states (catalog 100..710) â€” codes from
--    docs/03-schema/v1/state-catalog.md
-- ---------------------------------------------------------------------
insert into patient_states (code, phase, phase_label, slug, display_name, description, owning_dept, derived_from, is_blocking, is_terminal, sla_minutes, next_possible_codes, display_color, is_active) values
  (100,0,'Emergency / Arrival','walk_in_arrived','Walked-In',           'Patient arrived (walk-in / appt) â€” pre-registration.','front_desk','patients',         false,false,null, '{110,120}',         '#9CA3AF',true),
  (110,1,'Front Desk',         'registered',     'Registered',          'Reception completed registration / UHID assigned.', 'front_desk','patients',         false,false,5,    '{120,200}',         '#378ADD',true),
  (120,1,'Vitals',              'awaiting_vitals','Awaiting Vitals',     'Patient queued for vitals capture.',                'nursing',   'patient_queue',    true, false,10,   '{130}',             '#F59E0B',true),
  (130,1,'Vitals',              'vitals_done',   'Vitals Done',          'Vitals captured.',                                   'nursing',   'vitals',           false,false,2,    '{140,200}',         '#10B981',true),
  (140,2,'Doctor',              'awaiting_doctor','Awaiting Doctor',     'In doctor''s queue.',                                'doctor',    'patient_queue',    true, false,20,   '{150}',             '#F59E0B',true),
  (150,2,'Doctor',              'in_consultation','In Consultation',     'Doctor is currently consulting patient.',            'doctor',    'consultations',    false,false,15,   '{160,165,300,400}', '#3B82F6',true),
  (160,2,'Doctor',              'consultation_done','Consultation Done', 'Doctor closed consultation.',                        'doctor',    'consultations',    false,false,2,    '{200,500,600,620}', '#10B981',true),
  (165,2,'Doctor',              'doctor_review_pending','Doctor Review Pending','All ordered tests reported â€” awaiting doctor review.','doctor','lab_results',true,false,null, '{150,600}',          '#F59E0B',true),
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
  (600,7,'Closed',              'completed',     'Completed',            'OP visit terminal state â€” closed.',                  null,        'op_visits',        false,true, 0,    '{}',                '#9CA3AF',true),
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
  (5, '11111111-1111-1111-1111-111111111111', 'lab_collection',     'Lab â€” Collection',   4, 'lab_collection', 'lab',        'Ground floor, Room 5',     5,  true),
  (6, '11111111-1111-1111-1111-111111111111', 'lab_processing',     'Lab â€” Processing',   4, 'lab_processing', 'lab',        'Ground floor, Room 5A',    60, true),
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
-- 10. audit_excluded_tables  (Tier-3 registry per TSD-02 Â§4.7)
-- ---------------------------------------------------------------------
insert into audit_excluded_tables (table_name, exclusion_scope, excluded_columns, reason) values
  ('consultation_drafts', 'full',    '{}',          'Autosave volume â€” drafts churn every few seconds.'),
  ('user_sessions',       'full',    '{}',          'JWT issue/revoke churn â€” high volume, low audit value.'),
  ('user_preferences',    'full',    '{}',          'UI preferences only â€” no clinical/financial impact.'),
  ('appointment_slots',   'full',    '{}',          'Bulk-generated daily by slot generator â€” out of scope here.'),
  ('patient_queue',       'full',    '{}',          'High-churn live queue data; analytics covered by patient_journey_events.'),
  ('notifications',       'columns', '{read_at}',   'Read-receipt churn only; rest of the row is audited.')
on conflict (table_name) do nothing;

-- ---------------------------------------------------------------------
-- 11. patient_mergeable_tables  (registry â€” referenced by sp_merge_patients)
-- ---------------------------------------------------------------------
insert into patient_mergeable_tables (module, table_name, fk_column, merge_order, is_active, notes) values
  ('patient',      'patient_govt_ids',          'patient_id', 10, true, null),
  ('patient',      'patient_family_history',    'patient_id', 11, true, null),
  ('encounter',    'op_visits',                 'patient_id', 20, true, null),
  ('encounter',    'patient_queue',             'patient_id', 21, true, null),
  ('journey',      'patient_journey_events',    'patient_id', 22, true, 'Append-only â€” repointed without UPDATE.'),
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
-- 12. Default permissions  (small, illustrative â€” extend in app migrations)
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

-- =====================================================================
-- 999_grants.sql
-- =====================================================================
-- =====================================================================
-- 999_grants.sql
-- Supabase ships with `anon` and `authenticated` PostgREST roles that
-- have schema-level USAGE on `public`. The intent here is that the
-- Spring backend connects with the `postgres` superuser (or a dedicated
-- service role) â€” no PostgREST exposure. Revoke everything from anon /
-- authenticated so a misconfigured client cannot read the tables.
--
-- Safe to run even on a fresh Postgres that does not have these roles â€”
-- the DO blocks check pg_roles first.
-- =====================================================================

set search_path = public;

do $$
declare
  r record;
begin
  -- Revoke from anon
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema public from anon';
    execute 'revoke all on all tables    in schema public from anon';
    execute 'revoke all on all sequences in schema public from anon';
    execute 'revoke all on all functions in schema public from anon';
    execute 'alter default privileges in schema public revoke all on tables    from anon';
    execute 'alter default privileges in schema public revoke all on sequences from anon';
    execute 'alter default privileges in schema public revoke all on functions from anon';
  end if;

  -- Revoke from authenticated
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on schema public from authenticated';
    execute 'revoke all on all tables    in schema public from authenticated';
    execute 'revoke all on all sequences in schema public from authenticated';
    execute 'revoke all on all functions in schema public from authenticated';
    execute 'alter default privileges in schema public revoke all on tables    from authenticated';
    execute 'alter default privileges in schema public revoke all on sequences from authenticated';
    execute 'alter default privileges in schema public revoke all on functions from authenticated';
  end if;

  -- Revoke from PUBLIC catch-all (denies any future role we forget about)
  execute 'revoke all on schema public from public';
  execute 'revoke all on all tables    in schema public from public';
  execute 'revoke all on all sequences in schema public from public';
  execute 'revoke all on all functions in schema public from public';
end
$$;

-- Sanity confirmation â€” list any non-postgres role that still has rights on public.
-- (Pure SELECT â€” Supabase SQL Editor will show this for review.)
select grantee, table_schema, table_name, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public'
   and grantee not in ('postgres','PUBLIC')
 order by grantee, table_name, privilege_type;
