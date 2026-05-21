-- =====================================================================
-- 999_grants.sql
-- Supabase ships with `anon` and `authenticated` PostgREST roles that
-- have schema-level USAGE on `public`. The intent here is that the
-- Spring backend connects with the `postgres` superuser (or a dedicated
-- service role) — no PostgREST exposure. Revoke everything from anon /
-- authenticated so a misconfigured client cannot read the tables.
--
-- Safe to run even on a fresh Postgres that does not have these roles —
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

-- Sanity confirmation — list any non-postgres role that still has rights on public.
-- (Pure SELECT — Supabase SQL Editor will show this for review.)
select grantee, table_schema, table_name, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public'
   and grantee not in ('postgres','PUBLIC')
 order by grantee, table_name, privilege_type;
