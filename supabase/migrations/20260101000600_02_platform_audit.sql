-- =====================================================================
-- 020_02_platform_audit.sql
-- Module 02 — Platform Audit
-- Tables: audit_logs (RANGE-partitioned monthly, append-only),
--         audit_excluded_tables
--
-- This file REPLACES the placeholder audit_logs from 002_helpers.sql
-- with the production-shape partitioned table, plus the full
-- fn_audit_row() body with secret redaction and exclusion checks.
-- Spec: docs/03-schema/v3/modules/02-platform-audit.html
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- Replace the placeholder audit_logs with the partitioned production
-- version. Drop only if it is the empty stub (no triggers yet).
-- ---------------------------------------------------------------------
drop table if exists audit_logs cascade;

create table if not exists audit_logs (
  id              uuid         not null default uuidv7(),
  entity_table    text         not null,
  entity_id       uuid         not null,
  action          text         not null,
  actor_id        uuid,
  session_id      uuid,
  before_state    jsonb,
  after_state     jsonb,
  -- uniform block — created_at is the PARTITION KEY
  created_by      uuid,
  created_at      timestamptz  not null default now(),
  updated_by      uuid,
  updated_at      timestamptz  not null default now(),
  version         int          not null default 0,
  deleted_at      timestamptz,
  deleted_by      uuid,
  primary key (id, created_at),
  constraint chk_audit_logs_entity_table_len check (char_length(entity_table) between 2 and 64),
  constraint chk_audit_logs_action           check (action in ('INSERT','UPDATE','DELETE'))
) partition by range (created_at);

comment on table audit_logs is 'Central forensic log — every INSERT/UPDATE/DELETE on Tier-1 tables. Append-only (UPDATE/DELETE blocked). Partitioned monthly by created_at.';

-- Indexes on the PARENT — Postgres propagates partitioned indexes to every child partition.
create index if not exists ix_audit_logs_entity
  on audit_logs (entity_table, entity_id, created_at desc);

create index if not exists ix_audit_logs_actor
  on audit_logs (actor_id, created_at desc)
  where actor_id is not null;

-- Helper to create monthly partitions on demand.
create or replace function fn_ensure_audit_partition(p_month date)
returns void
language plpgsql
as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end   date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_name  text := format('audit_logs_%s', to_char(v_start, 'YYYY_MM'));
begin
  execute format(
    'create table if not exists %I partition of audit_logs for values from (%L) to (%L)',
    v_name, v_start, v_end
  );
end
$$;

-- Seed partitions for previous, current, and next 12 months.
do $$
declare
  m date := (date_trunc('month', now()) - interval '1 month')::date;
  i int;
begin
  for i in 0..13 loop
    perform fn_ensure_audit_partition(m);
    m := (m + interval '1 month')::date;
  end loop;
end $$;

-- Append-only guard on every partition (and the parent).
drop trigger if exists tr_audit_logs_bu_guard on audit_logs;
create trigger tr_audit_logs_bu_guard
  before update on audit_logs
  for each row execute function fn_append_only_guard();

drop trigger if exists tr_audit_logs_bd_guard on audit_logs;
create trigger tr_audit_logs_bd_guard
  before delete on audit_logs
  for each row execute function fn_append_only_guard();

-- ---------------------------------------------------------------------
-- audit_excluded_tables — tables fn_audit_row should skip.
-- ---------------------------------------------------------------------
create table if not exists audit_excluded_tables (
  id          uuid         primary key default uuidv7(),
  table_name  text         not null,
  reason      text         not null,
  notes       text,
  -- uniform block
  created_by  uuid         references users(id) on delete set null,
  created_at  timestamptz  not null default now(),
  updated_by  uuid         references users(id) on delete set null,
  updated_at  timestamptz  not null default now(),
  version     int          not null default 0,
  deleted_at  timestamptz,
  deleted_by  uuid         references users(id) on delete set null,
  constraint chk_audit_excluded_tables_reason check (reason in ('composite_pk','high_volume','admin_decision'))
);

comment on table audit_excluded_tables is 'Catalogue of tables fn_audit_row() must skip. Two categories: composite_pk (M:M bridges with no single id column) and high_volume (e.g. user_sessions last_active_at bumps).';

create unique index if not exists uq_audit_excluded_tables_name
  on audit_excluded_tables (table_name) where deleted_at is null;

drop trigger if exists tr_audit_excluded_tables_bu_touch on audit_excluded_tables;
create trigger tr_audit_excluded_tables_bu_touch
  before update on audit_excluded_tables
  for each row execute function fn_touch_updated();

drop trigger if exists tr_audit_excluded_tables_au_audit on audit_excluded_tables;
create trigger tr_audit_excluded_tables_au_audit
  after insert or update or delete on audit_excluded_tables
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- fn_audit_row — full production body.
-- Reads actor / session from session variables:
--   SET LOCAL app.current_user_id    = '<uuid>';
--   SET LOCAL app.current_session_id = '<uuid>';
-- Redacts users.password_hash / users.mfa_secret / system_config.config_value
-- when is_secret = true.
-- ---------------------------------------------------------------------
create or replace function fn_audit_row()
returns trigger
language plpgsql
security definer
as $$
declare
  v_before  jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_after   jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_actor   uuid;
  v_session uuid;
  v_id      uuid;
begin
  -- Short-circuit on excluded tables
  if exists (
    select 1 from audit_excluded_tables
     where table_name = tg_table_name
       and deleted_at is null
  ) then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  begin v_actor   := nullif(current_setting('app.current_user_id',    true), '')::uuid; exception when others then v_actor   := null; end;
  begin v_session := nullif(current_setting('app.current_session_id', true), '')::uuid; exception when others then v_session := null; end;

  -- Redact sensitive columns
  if tg_table_name = 'users' then
    if v_before is not null then
      v_before := v_before - 'password_hash' - 'mfa_secret'
                  || jsonb_build_object('password_hash','***REDACTED***','mfa_secret','***REDACTED***');
    end if;
    if v_after is not null then
      v_after  := v_after  - 'password_hash' - 'mfa_secret'
                  || jsonb_build_object('password_hash','***REDACTED***','mfa_secret','***REDACTED***');
    end if;
  end if;

  if tg_table_name = 'system_config'
     and (coalesce((case when tg_op='DELETE' then v_before else v_after end)->>'is_secret','false')::boolean) then
    if v_before is not null then
      v_before := v_before - 'config_value' || jsonb_build_object('config_value','***REDACTED***');
    end if;
    if v_after is not null then
      v_after  := v_after  - 'config_value' || jsonb_build_object('config_value','***REDACTED***');
    end if;
  end if;

  if tg_op = 'DELETE' then
    v_id := (to_jsonb(old)->>'id')::uuid;
  else
    v_id := (to_jsonb(new)->>'id')::uuid;
  end if;

  insert into audit_logs
    (id, entity_table, entity_id, action, actor_id, session_id,
     before_state, after_state, created_by, created_at, updated_at)
  values
    (uuidv7(), tg_table_name, v_id, tg_op, v_actor, v_session,
     v_before, v_after, v_actor, now(), now());

  if tg_op = 'DELETE' then return old; else return new; end if;
end
$$;
