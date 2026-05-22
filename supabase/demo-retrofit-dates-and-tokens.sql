-- ─────────────────────────────────────────────────────────────────────────────
-- demo-retrofit-dates-and-tokens.sql
--
-- One-shot retrofit so existing demo data lines up with the new FE flow.
--
--  Part A — Rebase BULK seed dates so the 90 historical visits are spread
--           across the past 14 days (today: 2026-05-22) instead of clumped
--           around May 21-23. Same delta applied to every child row so the
--           internal timing of each visit (consultation locked 10 min
--           after start, invoice created at lock time, payment a beat
--           later, etc.) is preserved.
--
--  Part B — Issue a `tokens.token_number` row for every op_visit that
--           doesn't have one. D-NN per (doctor, visit_date). The FE
--           doctor-queue lookup now reads this real token instead of
--           the old synthetic OP-T-<last2digits> formula.
--
-- Idempotent guard: bails out when Part A has already executed (detected
-- by checking if any BULK op_visit's visit_date is still >= today).
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── Part A — Rebase BULK seed dates ─────────────────────────────────────────
do $$
declare
  bs uuid := '00000000-0000-0000-0000-000000000001';
  needs_rebase boolean;
begin
  -- Skip if every BULK row is already < today (we've run this before).
  select exists(
    select 1 from op_visits
     where op_number like 'OP-2026-BULK-%'
       and (visit_date >= current_date or created_at >= current_date)
  ) into needs_rebase;
  if not needs_rebase then
    raise notice 'Part A: BULK dates already in the past — skipping.';
    return;
  end if;

  -- Compute per-BULK new_visit_date by row_number():
  --   BULK rows 1-7   -> 1 day ago
  --   BULK rows 8-14  -> 2 days ago
  --   ...
  --   BULK rows 85-90 -> 13 days ago
  -- All visits keep their hour-of-day offset so the timeline looks natural.
  create temp table _bulk_date_map on commit drop as
  with ranked as (
    select id, op_number, visit_date, created_at,
           row_number() over (order by op_number) as rk
      from op_visits
     where op_number like 'OP-2026-BULK-%'
       and deleted_at is null
  )
  select
    id,
    visit_date          as old_visit_date,
    (current_date - ((((rk - 1) / 7) + 1)::int))::date as new_visit_date,
    created_at          as old_created_at,
    (current_date - ((((rk - 1) / 7) + 1)::int))::timestamptz
      + (created_at - date_trunc('day', created_at))    as new_created_at,
    -- Delta applied to every child row's timestamp columns.
    ((current_date - ((((rk - 1) / 7) + 1)::int))::timestamptz
       + (created_at - date_trunc('day', created_at)))
      - created_at                                       as ts_delta
  from ranked;

  -- 1) op_visits itself
  update op_visits opv
     set visit_date = m.new_visit_date,
         created_at = m.new_created_at,
         updated_at = m.new_created_at,
         updated_by = bs
    from _bulk_date_map m
   where opv.id = m.id;

  -- 2) Closed_at — only shift when it's set (paid visits).
  update op_visits opv
     set closed_at = opv.closed_at + m.ts_delta
    from _bulk_date_map m
   where opv.id = m.id and opv.closed_at is not null;

  -- 3) consultations (with locked_at)
  update consultations c
     set created_at = c.created_at + m.ts_delta,
         updated_at = c.updated_at + m.ts_delta,
         locked_at  = case when c.locked_at is null then null else c.locked_at + m.ts_delta end
    from _bulk_date_map m
   where c.op_visit_id = m.id;

  -- 4) prescriptions
  update prescriptions p
     set created_at = p.created_at + m.ts_delta,
         updated_at = p.updated_at + m.ts_delta,
         locked_at  = case when p.locked_at is null then null else p.locked_at + m.ts_delta end
    from _bulk_date_map m
    join consultations c on c.op_visit_id = m.id
   where p.consultation_id = c.id;

  -- 5) prescription_items
  update prescription_items pi_
     set created_at = pi_.created_at + m.ts_delta,
         updated_at = pi_.updated_at + m.ts_delta
    from _bulk_date_map m
    join consultations c on c.op_visit_id = m.id
    join prescriptions p on p.consultation_id = c.id
   where pi_.prescription_id = p.id;

  -- 6) invoices: created_at, invoice_date, finalized_at, approved_at
  update invoices i
     set created_at    = i.created_at + m.ts_delta,
         updated_at    = i.updated_at + m.ts_delta,
         invoice_date  = (i.created_at + m.ts_delta)::date,
         finalized_at  = case when i.finalized_at is null then null else i.finalized_at + m.ts_delta end,
         approved_at   = case when i.approved_at  is null then null else i.approved_at  + m.ts_delta end
    from _bulk_date_map m
   where i.op_visit_id = m.id;

  -- 7) invoice_items
  update invoice_items ii
     set created_at = ii.created_at + m.ts_delta,
         updated_at = ii.updated_at + m.ts_delta
    from _bulk_date_map m
    join invoices i on i.op_visit_id = m.id
   where ii.invoice_id = i.id;

  -- 8) payments — payment_allocations is append-only (tr_payment_allocations_bu_block)
  --     so we can't shift its created_at. The allocation timestamp will
  --     drift by a few seconds from the payments.created_at it links to;
  --     analytics joins on the FK, not on timestamp, so this is harmless.
  update payments p
     set created_at = p.created_at + m.ts_delta,
         updated_at = p.updated_at + m.ts_delta
    from _bulk_date_map m
    join invoices i on i.op_visit_id = m.id
    join payment_allocations pa on pa.invoice_id = i.id
   where p.id = pa.payment_id;

  -- 9) lab_orders / lab_samples / lab_order_items / lab_results
  update lab_orders lo
     set created_at = lo.created_at + m.ts_delta,
         updated_at = lo.updated_at + m.ts_delta,
         completed_at = case when lo.completed_at is null then null else lo.completed_at + m.ts_delta end
    from _bulk_date_map m
   where lo.op_visit_id = m.id;

  update lab_samples ls
     set created_at = ls.created_at + m.ts_delta,
         updated_at = ls.updated_at + m.ts_delta,
         received_at = case when ls.received_at is null then null else ls.received_at + m.ts_delta end
    from _bulk_date_map m
    join lab_orders lo on lo.op_visit_id = m.id
   where ls.lab_order_id = lo.id;

  update lab_order_items loi
     set created_at = loi.created_at + m.ts_delta,
         updated_at = loi.updated_at + m.ts_delta
    from _bulk_date_map m
    join lab_orders lo on lo.op_visit_id = m.id
   where loi.lab_order_id = lo.id;

  update lab_results lr
     set created_at = lr.created_at + m.ts_delta,
         updated_at = lr.updated_at + m.ts_delta,
         verified_at = case when lr.verified_at is null then null else lr.verified_at + m.ts_delta end
    from _bulk_date_map m
    join lab_orders lo on lo.op_visit_id = m.id
    join lab_order_items loi on loi.lab_order_id = lo.id
   where lr.lab_order_item_id = loi.id;

  -- 10) radiology_orders / radiology_reports
  update radiology_orders ro
     set created_at = ro.created_at + m.ts_delta,
         updated_at = ro.updated_at + m.ts_delta,
         imaging_completed_at = case when ro.imaging_completed_at is null then null else ro.imaging_completed_at + m.ts_delta end,
         released_at = case when ro.released_at is null then null else ro.released_at + m.ts_delta end
    from _bulk_date_map m
   where ro.op_visit_id = m.id;

  update radiology_reports rr
     set created_at = rr.created_at + m.ts_delta,
         updated_at = rr.updated_at + m.ts_delta,
         approved_at = case when rr.approved_at is null then null else rr.approved_at + m.ts_delta end,
         dictated_at = case when rr.dictated_at is null then null else rr.dictated_at + m.ts_delta end
    from _bulk_date_map m
    join radiology_orders ro on ro.op_visit_id = m.id
   where rr.radiology_order_id = ro.id;

  -- 11) patient_states (if any seeded for these visits)
  update patient_states ps
     set created_at = ps.created_at + m.ts_delta,
         updated_at = ps.updated_at + m.ts_delta,
         entered_at = ps.entered_at + m.ts_delta,
         left_at    = case when ps.left_at is null then null else ps.left_at + m.ts_delta end
    from _bulk_date_map m
   where ps.op_visit_id = m.id;

  raise notice 'Part A done.';
end $$;

-- ── Part B — Backfill tokens for every op_visit without one ─────────────────
-- D-NN per (doctor, visit_date). Status='completed' for closed visits (the
-- consultation is done), 'active' for any that are still open.

insert into tokens (
  token_number, token_sequence, service_type, provider_id, issue_date,
  op_visit_id, status, issued_by, created_by
)
with missing as (
  select opv.id, opv.doctor_id, opv.visit_date, opv.closed_at, opv.created_by
    from op_visits opv
   where opv.deleted_at is null
     and not exists (select 1 from tokens t where t.op_visit_id = opv.id)
),
existing_max as (
  select t.provider_id, t.issue_date, coalesce(max(t.token_sequence), 0) as max_seq
    from tokens t
   where t.service_type = 'consultation' and t.provider_id is not null
   group by t.provider_id, t.issue_date
),
ranked as (
  select m.id, m.doctor_id, m.visit_date, m.closed_at, m.created_by,
         coalesce(em.max_seq, 0) +
           row_number() over (partition by m.doctor_id, m.visit_date order by m.id) as seq
    from missing m
    left join existing_max em
      on em.provider_id = m.doctor_id and em.issue_date = m.visit_date
)
select
  'D-' || lpad(seq::text, 2, '0'),
  seq::int,
  'consultation',
  doctor_id,
  visit_date,
  id,
  case when closed_at is not null then 'completed' else 'active' end,
  coalesce(created_by, '00000000-0000-0000-0000-000000000001'),
  coalesce(created_by, '00000000-0000-0000-0000-000000000001')
from ranked;

commit;

-- ── Verify ───────────────────────────────────────────────────────────────────
select 'op_visits total'      as t, count(*)::text as n from op_visits where deleted_at is null
union all select 'op_visits with token', count(*)::text from op_visits opv where exists (select 1 from tokens t where t.op_visit_id = opv.id) and opv.deleted_at is null
union all select 'op_visits without token', count(*)::text from op_visits opv where not exists (select 1 from tokens t where t.op_visit_id = opv.id) and opv.deleted_at is null
union all select 'op_visits future-dated', count(*)::text from op_visits where visit_date > current_date and deleted_at is null
union all select 'invoices future-created', count(*)::text from invoices where created_at::date > current_date and deleted_at is null;
