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
-- Per TSD-02 §4.1 this is partitioned monthly by occurred_at; we ship
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
comment on column audit_logs.entity_table  is 'Target table name (polymorphic — orphan-check via nightly job).';
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
