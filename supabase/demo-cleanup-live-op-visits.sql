-- ─────────────────────────────────────────────────────────────────────────────
-- demo-cleanup-live-op-visits.sql
--
-- Removes the 8 seeded `OP-2026-LIVE-NNN` op_visits + their dependents.
-- These rows came from `demo-live-queue.sql` and pre-populated the live
-- queue without ever going through book → check-in → pay. They violate
-- the rule "op_id only after payment". Real demo data will now only
-- appear via the proper FE flow.
--
-- Cascade order (children first, parent last):
--   radiology_reports → radiology_orders
--   lab_results → lab_order_items → lab_samples → lab_orders
--   patient_states → op_visits
--
-- All inside a single transaction; either everything deletes or nothing
-- does. Re-runnable: if nothing matches the LIVE prefix, every DELETE
-- is a 0-row no-op.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- 1) radiology side
delete from radiology_reports
 where radiology_order_id in (
   select id from radiology_orders
    where op_visit_id in (select id from op_visits where op_number like 'OP-2026-LIVE-%')
 );

delete from radiology_attachments
 where radiology_order_id in (
   select id from radiology_orders
    where op_visit_id in (select id from op_visits where op_number like 'OP-2026-LIVE-%')
 );

delete from radiology_orders
 where op_visit_id in (select id from op_visits where op_number like 'OP-2026-LIVE-%');

-- 2) lab side
delete from lab_results
 where lab_order_item_id in (
   select id from lab_order_items
    where lab_order_id in (
      select id from lab_orders where op_visit_id in (select id from op_visits where op_number like 'OP-2026-LIVE-%')
    )
 );

delete from lab_order_items
 where lab_order_id in (
   select id from lab_orders where op_visit_id in (select id from op_visits where op_number like 'OP-2026-LIVE-%')
 );

delete from lab_samples
 where lab_order_id in (
   select id from lab_orders where op_visit_id in (select id from op_visits where op_number like 'OP-2026-LIVE-%')
 );

delete from lab_orders
 where op_visit_id in (select id from op_visits where op_number like 'OP-2026-LIVE-%');

-- 3) state log + the visits themselves
delete from patient_states
 where op_visit_id in (select id from op_visits where op_number like 'OP-2026-LIVE-%');

delete from op_visits where op_number like 'OP-2026-LIVE-%';

commit;

-- Verify
select 'remaining_live_op_visits' as t, count(*)::text as n
  from op_visits where op_number like 'OP-2026-LIVE-%';
