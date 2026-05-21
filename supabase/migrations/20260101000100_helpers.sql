-- =====================================================================
-- 002_helpers.sql
-- Shared trigger functions + uuidv7 fallback + jsonb validators.
--
-- Per CONVENTIONS.md §3 the v3 schema relies on three triggers across
-- every table:
--   * fn_touch_updated     — BEFORE UPDATE: bumps updated_at + version
--   * fn_audit_row         — AFTER INSERT/UPDATE/DELETE: Layer-3 audit
--   * fn_append_only_guard — BEFORE UPDATE/DELETE on ledger tables
--
-- And a few jsonb structural validators:
--   * fn_validate_hospital_address
--   * fn_validate_available_days
-- More validators land in their owning module files.
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- uuidv7() — provided natively by Postgres 17. On 15/16, ship a
-- portable pl/pgSQL fallback (RFC 9562 layout — 48-bit ms timestamp +
-- random tail). Time-ordered like the native version; bytes do not need
-- to match the official implementation exactly.
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
        -- 16-byte UUIDv7 = 6-byte big-endian ms timestamp + 10 random bytes.
        b   bytea  := decode('000000000000', 'hex') || gen_random_bytes(10);
      begin
        b := set_byte(b, 0, ((ms >> 40) & 255)::int);
        b := set_byte(b, 1, ((ms >> 32) & 255)::int);
        b := set_byte(b, 2, ((ms >> 24) & 255)::int);
        b := set_byte(b, 3, ((ms >> 16) & 255)::int);
        b := set_byte(b, 4, ((ms >>  8) & 255)::int);
        b := set_byte(b, 5, ((ms      ) & 255)::int);
        b := set_byte(b, 6, (get_byte(b, 6) & 15) | 112);  -- version 7 nibble
        b := set_byte(b, 8, (get_byte(b, 8) & 63) | 128);  -- RFC 4122 variant bits
        return encode(b, 'hex')::uuid;
      end
      $body$;
    $f$;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- fn_touch_updated — BEFORE UPDATE trigger.
-- Sets updated_at = now() and increments version.
-- Attach with:
--   create trigger tr_<table>_bu_touch
--     before update on <table>
--     for each row execute function fn_touch_updated();
-- ---------------------------------------------------------------------
create or replace function fn_touch_updated() returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.version    := coalesce(old.version, 0) + 1;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- fn_append_only_guard — ledger tables that must never be updated/deleted.
-- Attach with:
--   create trigger tr_<table>_bud_append_only
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

-- ---------------------------------------------------------------------
-- audit_logs forward-declared so fn_audit_row compiles.
-- The full table definition (with indexes, partitions, comments) lives in
-- 020_02_platform_audit.sql. Defining it here as a placeholder keeps
-- fn_audit_row resolvable for every business table created before 020.
-- ---------------------------------------------------------------------
create table if not exists audit_logs (
  id              uuid         primary key default uuidv7(),
  user_id         uuid,
  request_id      uuid,
  entity_table    text         not null,
  entity_id       uuid,
  action          text         not null check (action in ('INSERT','UPDATE','DELETE')),
  changed_fields  text[],
  before_state    jsonb,
  after_state     jsonb,
  ip_address      text,
  user_agent      text,
  occurred_at     timestamptz  not null default now(),
  -- uniform block (cosmetic on append-only)
  created_by      uuid,
  created_at      timestamptz  not null default now(),
  updated_by      uuid,
  updated_at      timestamptz  not null default now(),
  version         int          not null default 0,
  deleted_at      timestamptz,
  deleted_by      uuid
);

-- ---------------------------------------------------------------------
-- fn_audit_row — AFTER INSERT/UPDATE/DELETE on every Tier-1 table.
-- Writes a row into audit_logs with JSONB before/after snapshots and
-- the changed_fields array (empty for INSERT/DELETE).
--
-- The trigger reads two session-scoped GUCs that the application sets
-- per request (see backend/BACKEND.md):
--   * app.user_id    — uuid of the acting user (NULL for bootstrap)
--   * app.request_id — uuid correlation id
-- Both are optional; absence yields NULL columns in audit_logs.
-- ---------------------------------------------------------------------
create or replace function fn_audit_row() returns trigger
language plpgsql
security definer
as $$
declare
  v_user_id    uuid;
  v_request_id uuid;
  v_entity_id  uuid;
  v_before     jsonb;
  v_after      jsonb;
  v_changed    text[];
begin
  begin v_user_id    := nullif(current_setting('app.user_id',    true), '')::uuid; exception when others then v_user_id    := null; end;
  begin v_request_id := nullif(current_setting('app.request_id', true), '')::uuid; exception when others then v_request_id := null; end;

  if tg_op = 'INSERT' then
    v_before    := null;
    v_after     := to_jsonb(new);
    v_changed   := array(select jsonb_object_keys(v_after));
    v_entity_id := (v_after->>'id')::uuid;
  elsif tg_op = 'UPDATE' then
    v_before    := to_jsonb(old);
    v_after     := to_jsonb(new);
    v_changed   := array(
      select key
        from jsonb_each(v_after) a
       where a.value is distinct from (v_before->a.key)
    );
    v_entity_id := (v_after->>'id')::uuid;
  else  -- DELETE
    v_before    := to_jsonb(old);
    v_after     := null;
    v_changed   := array[]::text[];
    v_entity_id := (v_before->>'id')::uuid;
  end if;

  insert into audit_logs (
    user_id, request_id, entity_table, entity_id, action,
    changed_fields, before_state, after_state, occurred_at,
    created_by
  ) values (
    v_user_id, v_request_id, tg_table_name, v_entity_id, tg_op,
    v_changed, v_before, v_after, now(),
    v_user_id
  );

  return null;  -- AFTER trigger
end;
$$;

-- ---------------------------------------------------------------------
-- fn_validate_hospital_address(jsonb) — schema check for
-- hospital_profile.address. Required keys: line1, city, state, country
-- (2-char ISO). See 01A spec.
-- ---------------------------------------------------------------------
create or replace function fn_validate_hospital_address(p jsonb)
returns boolean
language plpgsql
immutable
as $$
begin
  if jsonb_typeof(p) <> 'object' then return false; end if;
  if not (p ? 'line1' and p ? 'city' and p ? 'state' and p ? 'country') then return false; end if;
  if jsonb_typeof(p->'line1')   <> 'string' then return false; end if;
  if jsonb_typeof(p->'city')    <> 'string' then return false; end if;
  if jsonb_typeof(p->'state')   <> 'string' then return false; end if;
  if jsonb_typeof(p->'country') <> 'string' then return false; end if;
  if char_length(p->>'country') <> 2 then return false; end if;
  return true;
end
$$;

-- ---------------------------------------------------------------------
-- fn_validate_available_days(jsonb) — doctor_profiles.available_days.
-- Resolution 4 (TSD-01). Lowercase weekday keys, HH:MM windows, from<to.
-- ---------------------------------------------------------------------
create or replace function fn_validate_available_days(p jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  k       text;
  win     jsonb;
  hh_mm   text   := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
  allowed text[] := array['mon','tue','wed','thu','fri','sat','sun'];
begin
  if jsonb_typeof(p) <> 'object' then return false; end if;

  for k in select jsonb_object_keys(p) loop
    if not k = any(allowed)                          then return false; end if;
    if jsonb_typeof(p->k) <> 'array'                 then return false; end if;

    for win in select jsonb_array_elements(p->k) loop
      if jsonb_typeof(win) <> 'object'                                              then return false; end if;
      if not (win ? 'from' and win ? 'to')                                          then return false; end if;
      if not ((win->>'from') ~ hh_mm and (win->>'to') ~ hh_mm)                      then return false; end if;
      if (win->>'from')::time >= (win->>'to')::time                                 then return false; end if;
    end loop;
  end loop;

  return true;
end
$$;

-- ---------------------------------------------------------------------
-- fn_validate_user_profile_data(jsonb) — users.profile_data polymorphic
-- by `type` discriminator. See 01A spec.
-- ---------------------------------------------------------------------
create or replace function fn_validate_user_profile_data(p jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  t text;
begin
  if jsonb_typeof(p) <> 'object' then return false; end if;
  if not (p ? 'type') then return false; end if;
  if jsonb_typeof(p->'type') <> 'string' then return false; end if;
  t := p->>'type';
  if t not in ('admin','doctor','receptionist','pharmacist','lab_tech') then return false; end if;

  if t = 'doctor' then
    if (p ? 'languages') and jsonb_typeof(p->'languages') <> 'array' then return false; end if;
  elsif t = 'receptionist' then
    if (p ? 'tills') and jsonb_typeof(p->'tills') <> 'array' then return false; end if;
  elsif t = 'pharmacist' then
    if (p ? 'narcotic_licence') and jsonb_typeof(p->'narcotic_licence') <> 'string' then return false; end if;
  end if;

  return true;
end
$$;

-- ---------------------------------------------------------------------
-- fn_validate_user_notifications(jsonb) — user_preferences.notifications
-- ---------------------------------------------------------------------
create or replace function fn_validate_user_notifications(p jsonb)
returns boolean
language plpgsql
immutable
as $$
begin
  if jsonb_typeof(p) <> 'object' then return false; end if;
  if (p ? 'sms')   and jsonb_typeof(p->'sms')   <> 'boolean' then return false; end if;
  if (p ? 'email') and jsonb_typeof(p->'email') <> 'boolean' then return false; end if;
  if (p ? 'inApp') and jsonb_typeof(p->'inApp') <> 'boolean' then return false; end if;
  return true;
end
$$;
