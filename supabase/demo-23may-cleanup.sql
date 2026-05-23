-- =====================================================================
-- demo-23may-cleanup.sql
--
-- Wipes everything written by demo-23may-seed.sql so the script can be
-- re-run from scratch. Targets only the demo prefix UHIDs / numbers,
-- so existing real data is left alone.
-- =====================================================================

do $$
declare
  bs uuid := '00000000-0000-0000-0000-000000000001';
  demo_patient_ids uuid[];
  demo_opv_ids     uuid[];
  demo_cons_ids    uuid[];
  demo_rx_ids      uuid[];
begin
  -- Resolve which rows belong to the demo
  select array_agg(id) into demo_patient_ids
    from patients where uhid like 'KH-2026-DEMO-%';

  if demo_patient_ids is null or array_length(demo_patient_ids, 1) is null then
    raise notice 'No demo data found (no KH-2026-DEMO-% patients). Nothing to clean.';
    return;
  end if;

  select array_agg(id) into demo_opv_ids
    from op_visits where patient_id = any(demo_patient_ids);

  select array_agg(c.id) into demo_cons_ids
    from consultations c where c.op_visit_id = any(coalesce(demo_opv_ids, array[]::uuid[]));

  select array_agg(p.id) into demo_rx_ids
    from prescriptions p where p.consultation_id = any(coalesce(demo_cons_ids, array[]::uuid[]));

  -- Hard delete in FK-dependency order. Append-only tables (drug_stock_ledger,
  -- narcotic_register, payment_allocations, audit_logs) intentionally left
  -- as-is — they're audit history.

  -- payments → invoice cascade we'll do via invoice_id
  delete from payments
   where invoice_id in (select id from invoices where patient_id = any(demo_patient_ids));

  delete from invoice_items
   where invoice_id in (select id from invoices where patient_id = any(demo_patient_ids));

  delete from invoices where patient_id = any(demo_patient_ids);

  delete from pharmacy_sale_items
   where pharmacy_sale_id in (select id from pharmacy_sales where patient_id = any(demo_patient_ids));

  delete from pharmacy_sales where patient_id = any(demo_patient_ids);

  delete from lab_results
   where lab_order_item_id in (
     select id from lab_order_items
      where lab_order_id in (select id from lab_orders where patient_id = any(demo_patient_ids))
   );

  delete from lab_order_items
   where lab_order_id in (select id from lab_orders where patient_id = any(demo_patient_ids));

  delete from lab_orders where patient_id = any(demo_patient_ids);

  delete from radiology_reports
   where radiology_order_id in (select id from radiology_orders where patient_id = any(demo_patient_ids));

  delete from radiology_orders where patient_id = any(demo_patient_ids);

  delete from prescription_items where prescription_id = any(coalesce(demo_rx_ids, array[]::uuid[]));
  delete from prescriptions where consultation_id = any(coalesce(demo_cons_ids, array[]::uuid[]));
  delete from consultations where op_visit_id = any(coalesce(demo_opv_ids, array[]::uuid[]));

  delete from tokens where op_visit_id = any(coalesce(demo_opv_ids, array[]::uuid[]));
  delete from patient_states where op_visit_id = any(coalesce(demo_opv_ids, array[]::uuid[]));
  delete from appointments where patient_id = any(demo_patient_ids);
  delete from op_visits where patient_id = any(demo_patient_ids);

  -- Today's demo cash session (keep history sessions)
  delete from cash_sessions
   where business_date = date '2026-05-23'
     and session_number = 'SES-20260523-MOR-demo';

  delete from patients where uhid like 'KH-2026-DEMO-%';

  raise notice 'Demo cleanup complete.';
end $$;
