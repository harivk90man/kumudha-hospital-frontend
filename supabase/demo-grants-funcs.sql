-- Grant EXECUTE on all helper / trigger functions in public to anon (and authenticated).
-- The PostgREST anon role calls uuidv7() via column defaults and trips trigger
-- functions (fn_touch_updated, fn_audit_row, fn_validate_*) on every write.
-- Without EXECUTE it bombs with `permission denied for function ...`.

grant execute on all functions in schema public to anon;
grant execute on all functions in schema public to authenticated;

-- Also include the extensions schema (gen_random_bytes lives there).
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'extensions') then
    execute 'grant execute on all functions in schema extensions to anon';
    execute 'grant execute on all functions in schema extensions to authenticated';
    execute 'grant usage on schema extensions to anon';
    execute 'grant usage on schema extensions to authenticated';
  end if;
end $$;

alter default privileges in schema public grant execute on functions to anon;
alter default privileges in schema public grant execute on functions to authenticated;

select count(*) as anon_executable_funcs
  from information_schema.role_routine_grants
 where grantee = 'anon' and routine_schema = 'public';
