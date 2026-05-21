-- Grant anon full CRUD on every public table — demo only.
do $$
declare r record;
begin
  for r in select schemaname, tablename from pg_tables where schemaname = 'public' loop
    execute format('grant select, insert, update, delete on %I.%I to anon', r.schemaname, r.tablename);
  end loop;
  for r in select schemaname, sequencename from pg_sequences where schemaname = 'public' loop
    execute format('grant usage, select on sequence %I.%I to anon', r.schemaname, r.sequencename);
  end loop;
  execute 'alter default privileges in schema public grant select, insert, update, delete on tables to anon';
  execute 'alter default privileges in schema public grant usage, select on sequences to anon';
end $$;

-- Verify
select count(*) as anon_writable_tables
  from information_schema.role_table_grants
 where grantee = 'anon'
   and table_schema = 'public'
   and privilege_type = 'INSERT';
