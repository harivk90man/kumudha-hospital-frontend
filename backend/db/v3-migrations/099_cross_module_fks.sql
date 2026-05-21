-- =====================================================================
-- 099_cross_module_fks.sql
-- Wire all cross-module foreign keys that were deferred during module
-- creation (to avoid forward-reference ordering pain).
--
-- Run AFTER all module files (010-052) but BEFORE 900_seed_data.sql.
-- =====================================================================

set search_path = public;

-- Each constraint is added via a DO block so a re-run is idempotent.

do $$
begin
  -- prescription_items.medicine_id → drug_catalogue(id)
  if not exists (select 1 from pg_constraint where conname = 'fk_prescription_items_medicine') then
    alter table prescription_items
      add constraint fk_prescription_items_medicine
        foreign key (medicine_id) references drug_catalogue(id) on delete restrict;
  end if;

  -- doctor_recommendations.lab_order_id → lab_orders(id)
  if not exists (select 1 from pg_constraint where conname = 'fk_doctor_recommendations_lab_order') then
    alter table doctor_recommendations
      add constraint fk_doctor_recommendations_lab_order
        foreign key (lab_order_id) references lab_orders(id) on delete restrict;
  end if;

  -- doctor_recommendations.radiology_order_id → radiology_orders(id)
  if not exists (select 1 from pg_constraint where conname = 'fk_doctor_recommendations_radiology_order') then
    alter table doctor_recommendations
      add constraint fk_doctor_recommendations_radiology_order
        foreign key (radiology_order_id) references radiology_orders(id) on delete restrict;
  end if;

  -- tokens.lab_order_id → lab_orders(id)
  if not exists (select 1 from pg_constraint where conname = 'fk_tokens_lab_order') then
    alter table tokens
      add constraint fk_tokens_lab_order
        foreign key (lab_order_id) references lab_orders(id) on delete restrict;
  end if;

  -- tokens.radiology_order_id → radiology_orders(id)
  if not exists (select 1 from pg_constraint where conname = 'fk_tokens_radiology_order') then
    alter table tokens
      add constraint fk_tokens_radiology_order
        foreign key (radiology_order_id) references radiology_orders(id) on delete restrict;
  end if;

  -- tokens.pharmacy_sale_id → pharmacy_sales(id)
  if not exists (select 1 from pg_constraint where conname = 'fk_tokens_pharmacy_sale') then
    alter table tokens
      add constraint fk_tokens_pharmacy_sale
        foreign key (pharmacy_sale_id) references pharmacy_sales(id) on delete restrict;
  end if;

  -- tokens.invoice_id → invoices(id)
  if not exists (select 1 from pg_constraint where conname = 'fk_tokens_invoice') then
    alter table tokens
      add constraint fk_tokens_invoice
        foreign key (invoice_id) references invoices(id) on delete restrict;
  end if;

  -- lab_tests.service_id → services(id)
  if not exists (select 1 from pg_constraint where conname = 'fk_lab_tests_service') then
    alter table lab_tests
      add constraint fk_lab_tests_service
        foreign key (service_id) references services(id) on delete restrict;
  end if;

  -- lab_test_groups.service_id → services(id)
  if not exists (select 1 from pg_constraint where conname = 'fk_lab_test_groups_service') then
    alter table lab_test_groups
      add constraint fk_lab_test_groups_service
        foreign key (service_id) references services(id) on delete restrict;
  end if;

  -- lab_orders.invoice_id → invoices(id)
  if not exists (select 1 from pg_constraint where conname = 'fk_lab_orders_invoice') then
    alter table lab_orders
      add constraint fk_lab_orders_invoice
        foreign key (invoice_id) references invoices(id) on delete restrict;
  end if;

  -- radiology_procedures.service_id → services(id)
  if not exists (select 1 from pg_constraint where conname = 'fk_radiology_procedures_service') then
    alter table radiology_procedures
      add constraint fk_radiology_procedures_service
        foreign key (service_id) references services(id) on delete restrict;
  end if;

  -- radiology_orders.invoice_id → invoices(id)
  if not exists (select 1 from pg_constraint where conname = 'fk_radiology_orders_invoice') then
    alter table radiology_orders
      add constraint fk_radiology_orders_invoice
        foreign key (invoice_id) references invoices(id) on delete restrict;
  end if;

  -- drug_stock_ledger.pharmacy_sale_item_id → pharmacy_sale_items(id)
  if not exists (select 1 from pg_constraint where conname = 'fk_drug_stock_ledger_pharmacy_sale_item') then
    alter table drug_stock_ledger
      add constraint fk_drug_stock_ledger_pharmacy_sale_item
        foreign key (pharmacy_sale_item_id) references pharmacy_sale_items(id) on delete restrict;
  end if;

  -- drug_stock_ledger.pharmacy_return_item_id → pharmacy_return_items(id)
  if not exists (select 1 from pg_constraint where conname = 'fk_drug_stock_ledger_pharmacy_return_item') then
    alter table drug_stock_ledger
      add constraint fk_drug_stock_ledger_pharmacy_return_item
        foreign key (pharmacy_return_item_id) references pharmacy_return_items(id) on delete restrict;
  end if;

  -- narcotic_register.pharmacy_sale_id → pharmacy_sales(id)
  if not exists (select 1 from pg_constraint where conname = 'fk_narcotic_register_pharmacy_sale') then
    alter table narcotic_register
      add constraint fk_narcotic_register_pharmacy_sale
        foreign key (pharmacy_sale_id) references pharmacy_sales(id) on delete restrict;
  end if;

  -- pharmacy_sales.invoice_id → invoices(id)
  if not exists (select 1 from pg_constraint where conname = 'fk_pharmacy_sales_invoice') then
    alter table pharmacy_sales
      add constraint fk_pharmacy_sales_invoice
        foreign key (invoice_id) references invoices(id) on delete restrict;
  end if;

  -- pharmacy_sales.cash_session_id → cash_sessions(id)
  if not exists (select 1 from pg_constraint where conname = 'fk_pharmacy_sales_cash_session') then
    alter table pharmacy_sales
      add constraint fk_pharmacy_sales_cash_session
        foreign key (cash_session_id) references cash_sessions(id) on delete restrict;
  end if;

  -- pharmacy_returns.cash_session_id → cash_sessions(id)
  if not exists (select 1 from pg_constraint where conname = 'fk_pharmacy_returns_cash_session') then
    alter table pharmacy_returns
      add constraint fk_pharmacy_returns_cash_session
        foreign key (cash_session_id) references cash_sessions(id) on delete restrict;
  end if;

  -- invoice_items.pharmacy_sale_item_id → pharmacy_sale_items(id)
  if not exists (select 1 from pg_constraint where conname = 'fk_invoice_items_pharmacy_sale_item') then
    alter table invoice_items
      add constraint fk_invoice_items_pharmacy_sale_item
        foreign key (pharmacy_sale_item_id) references pharmacy_sale_items(id) on delete restrict;
  end if;

  -- payments.pharmacy_return_id → pharmacy_returns(id)
  if not exists (select 1 from pg_constraint where conname = 'fk_payments_pharmacy_return') then
    alter table payments
      add constraint fk_payments_pharmacy_return
        foreign key (pharmacy_return_id) references pharmacy_returns(id) on delete restrict;
  end if;

  -- payment_allocations.pharmacy_sale_id → pharmacy_sales(id)
  if not exists (select 1 from pg_constraint where conname = 'fk_payment_allocations_pharmacy_sale') then
    alter table payment_allocations
      add constraint fk_payment_allocations_pharmacy_sale
        foreign key (pharmacy_sale_id) references pharmacy_sales(id) on delete restrict;
  end if;
end $$;
