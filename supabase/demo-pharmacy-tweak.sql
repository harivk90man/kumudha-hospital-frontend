-- Flip ~10 random recently-locked prescriptions from 'dispensed' back to
-- 'active' so the pharmacy queue shows pending Rxs.
with cand as (
  select id from prescriptions
   where deleted_at is null and status = 'dispensed'
   order by random() limit 12
)
update prescriptions
   set status = 'active'
 where id in (select id from cand);

select 'rx_pending(active)'    as t, count(*)::text as n from prescriptions where status = 'active'   and deleted_at is null
union all
select 'rx_dispensed',                count(*)::text       from prescriptions where status = 'dispensed' and deleted_at is null
order by t;
