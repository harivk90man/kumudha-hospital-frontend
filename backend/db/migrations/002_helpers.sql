-- =====================================================================
-- 002_helpers.sql
-- Shared trigger functions reused by every business table.
--   * fn_set_updated_at  — BEFORE UPDATE: bumps updated_at to now()
--   * fn_append_only_guard — BEFORE UPDATE OR DELETE on ledger tables
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
  raise exception 'table % is append-only — UPDATE / DELETE is not permitted', tg_table_name
    using errcode = '42501';
end;
$$;
