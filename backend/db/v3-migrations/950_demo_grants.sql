-- =====================================================================
-- 950_demo_grants.sql
-- DEMO-ONLY: re-grant authenticated + anon roles on demo tables and
-- disable RLS so the frontend (using @supabase/supabase-js) can read
-- and write directly.
--
-- DO NOT USE IN PRODUCTION. The long-term plan is a Spring backend
-- connecting as `postgres` with all PostgREST exposure revoked
-- (see 999_grants.sql).
--
-- This file is named 950_* so it runs AFTER 900_seed_data.sql but
-- BEFORE 999_grants.sql. To use the demo configuration, run only
-- 001-950 (skip 999) — or run 999 then re-run 950 to override.
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- 1. Grant schema-level usage
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant usage on schema public to anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant usage on schema public to authenticated';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Grant CRUD on every public table to authenticated; SELECT to anon.
--    Done in a DO block so the grants apply across all 69 tables and
--    14 audit partitions without enumerating each.
-- ---------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename
      from pg_tables
     where schemaname = 'public'
  loop
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant select, insert, update, delete on %I.%I to authenticated',
                     r.schemaname, r.tablename);
    end if;
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('grant select on %I.%I to anon', r.schemaname, r.tablename);
    end if;
  end loop;

  for r in
    select schemaname, sequencename
      from pg_sequences
     where schemaname = 'public'
  loop
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant usage, select on sequence %I.%I to authenticated',
                     r.schemaname, r.sequencename);
    end if;
  end loop;
end $$;

-- Allow future objects (created by the postgres role) to inherit the grants.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'alter default privileges in schema public grant select, insert, update, delete on tables to authenticated';
    execute 'alter default privileges in schema public grant usage, select on sequences to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'alter default privileges in schema public grant select on tables to anon';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Disable RLS on demo tables.
--    Supabase enables RLS by default on user-created tables. Without
--    policies, NO rows are visible. For the demo we disable RLS so the
--    anon key has unrestricted access. Production will use Spring +
--    direct postgres connection (RLS irrelevant) OR add policies later.
-- ---------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename
      from pg_tables
     where schemaname = 'public'
  loop
    execute format('alter table %I.%I disable row level security',
                   r.schemaname, r.tablename);
  end loop;
end $$;

-- Confirmation: list tables that still have RLS enabled (should be none in public)
select schemaname, tablename, rowsecurity
  from pg_tables
 where schemaname = 'public' and rowsecurity = true;
