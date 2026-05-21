-- =====================================================================
-- 043_15_pharmacy.sql
-- Module 15 — Pharmacy
-- Tables: pharmacy_sales, pharmacy_sale_items,
--         pharmacy_returns, pharmacy_return_items
--
-- Cross-module FKs deferred to 099_cross_module_fks.sql:
--   * pharmacy_sales.invoice_id        → invoices(id)      — Module 17 (051)
--   * pharmacy_sales.cash_session_id   → cash_sessions(id) — Module 18 (052)
--   * pharmacy_returns.cash_session_id → cash_sessions(id) — Module 18 (052)
-- Spec: docs/03-schema/v3/modules/15-pharmacy.html
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- pharmacy_sales
-- ---------------------------------------------------------------------
create table if not exists pharmacy_sales (
  id                          uuid         primary key default uuidv7(),
  sale_number                 text         not null,
  patient_id                  uuid         references patients(id) on delete restrict,
  sale_type                   text         not null,
  prescription_id             uuid         references prescriptions(id) on delete restrict,
  external_prescription_ref   text,
  customer_name               text,
  customer_mobile             text,
  customer_age                int,
  invoice_id                  uuid,        -- FK to invoices(id)      added in 099 (Module 17)
  cash_session_id             uuid,        -- FK to cash_sessions(id) added in 099 (Module 18)
  subtotal                    numeric(14,2) not null default 0,
  total_tax                   numeric(14,2) not null default 0,
  bill_discount_pct           numeric(4,2),
  bill_discount_amount        numeric(14,2) not null default 0,
  bill_discount_approved_by   uuid         references users(id) on delete restrict,
  bill_discount_reason        text,
  net_amount                  numeric(14,2) not null default 0,
  status                      text         not null default 'draft',
  idempotency_key             uuid,
  -- uniform block
  created_by                  uuid         not null references users(id) on delete set null,
  created_at                  timestamptz  not null default now(),
  updated_by                  uuid         references users(id) on delete set null,
  updated_at                  timestamptz  not null default now(),
  version                     int          not null default 0,
  deleted_at                  timestamptz,
  deleted_by                  uuid         references users(id) on delete set null,
  constraint chk_pharmacy_sales_number_len      check (char_length(sale_number) between 5 and 30),
  constraint chk_pharmacy_sales_type            check (sale_type in ('op_patient','ip_patient','walkin_prescription','walkin_otc','staff_self')),
  constraint chk_pharmacy_sales_status          check (status in ('draft','billed','dispensed','partially_dispensed','cancelled','returned')),
  constraint chk_pharmacy_sales_discount_pct    check (bill_discount_pct is null or (bill_discount_pct > 0 and bill_discount_pct <= 100)),
  constraint chk_pharmacy_sales_amounts         check (subtotal >= 0 and total_tax >= 0 and bill_discount_amount >= 0 and net_amount >= 0),
  constraint chk_pharmacy_sales_customer_mobile check (customer_mobile is null or char_length(customer_mobile) between 10 and 15),
  constraint chk_pharmacy_sales_customer_age    check (customer_age is null or customer_age > 0)
);

comment on table pharmacy_sales is 'Sale header — one row per dispensing event. Rx-bound (prescription_id set) or OTC. idempotency_key prevents double-charge on network retry. Whole-bill discounts above the configured threshold require a second approver.';

create unique index if not exists uq_pharmacy_sales_number       on pharmacy_sales (sale_number);
create unique index if not exists uq_pharmacy_sales_idempotency  on pharmacy_sales (idempotency_key) where idempotency_key is not null;
create index        if not exists ix_pharmacy_sales_patient      on pharmacy_sales (patient_id, created_at desc) where patient_id is not null;
create index        if not exists ix_pharmacy_sales_status       on pharmacy_sales (status, created_at desc)     where deleted_at is null;
create index        if not exists ix_pharmacy_sales_prescription on pharmacy_sales (prescription_id) where prescription_id is not null;

drop trigger if exists tr_pharmacy_sales_bu_touch on pharmacy_sales;
create trigger tr_pharmacy_sales_bu_touch
  before update on pharmacy_sales
  for each row execute function fn_touch_updated();

drop trigger if exists tr_pharmacy_sales_au_audit on pharmacy_sales;
create trigger tr_pharmacy_sales_au_audit
  after insert or update or delete on pharmacy_sales
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- pharmacy_sale_items
-- ---------------------------------------------------------------------
create table if not exists pharmacy_sale_items (
  id                       uuid         primary key default uuidv7(),
  pharmacy_sale_id         uuid         not null references pharmacy_sales(id) on delete cascade,
  drug_id                  uuid         not null references drug_catalogue(id) on delete restrict,
  drug_stock_id            uuid         not null references drug_stock(id)     on delete restrict,
  prescription_item_id     uuid         references prescription_items(id)      on delete restrict,
  quantity                 int          not null,
  unit_price               numeric(14,2) not null,
  line_discount_pct        numeric(4,2) not null default 0,
  line_discount_amount     numeric(14,2) not null default 0,
  cgst_pct                 numeric(4,2) not null default 0,
  cgst_amount              numeric(14,2) not null default 0,
  sgst_pct                 numeric(4,2) not null default 0,
  sgst_amount              numeric(14,2) not null default 0,
  igst_pct                 numeric(4,2) not null default 0,
  igst_amount              numeric(14,2) not null default 0,
  total_price              numeric(14,2) not null,
  -- L1 audit block (no soft-delete per spec)
  created_by               uuid         not null references users(id) on delete set null,
  created_at               timestamptz  not null default now(),
  updated_by               uuid         references users(id) on delete set null,
  updated_at               timestamptz  not null default now(),
  version                  int          not null default 0,
  constraint chk_pharmacy_sale_items_qty           check (quantity > 0),
  constraint chk_pharmacy_sale_items_price         check (unit_price > 0 and total_price >= 0),
  constraint chk_pharmacy_sale_items_discount      check (line_discount_pct >= 0 and line_discount_amount >= 0),
  constraint chk_pharmacy_sale_items_gst           check (cgst_pct >= 0 and sgst_pct >= 0 and igst_pct >= 0 and cgst_amount >= 0 and sgst_amount >= 0 and igst_amount >= 0),
  constraint chk_pharmacy_sale_items_gst_exclusive check ((igst_pct = 0) or (cgst_pct = 0 and sgst_pct = 0))
);

comment on table pharmacy_sale_items is 'Sale lines — one row per drug per dispense. INSERT triggers FEFO decrement on drug_stock and appends drug_stock_ledger row; narcotic drugs require a paired narcotic_register row in the same transaction.';

create unique index if not exists uq_pharmacy_sale_items_batch              on pharmacy_sale_items (pharmacy_sale_id, drug_id, drug_stock_id);
create index        if not exists ix_pharmacy_sale_items_sale               on pharmacy_sale_items (pharmacy_sale_id);
create index        if not exists ix_pharmacy_sale_items_prescription_item  on pharmacy_sale_items (prescription_item_id) where prescription_item_id is not null;
create index        if not exists ix_pharmacy_sale_items_batch_idx          on pharmacy_sale_items (drug_stock_id);

drop trigger if exists tr_pharmacy_sale_items_bu_touch on pharmacy_sale_items;
create trigger tr_pharmacy_sale_items_bu_touch
  before update on pharmacy_sale_items
  for each row execute function fn_touch_updated();

drop trigger if exists tr_pharmacy_sale_items_au_audit on pharmacy_sale_items;
create trigger tr_pharmacy_sale_items_au_audit
  after insert or update or delete on pharmacy_sale_items
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- pharmacy_returns
-- ---------------------------------------------------------------------
create table if not exists pharmacy_returns (
  id                    uuid         primary key default uuidv7(),
  return_number         text         not null,
  original_sale_id      uuid         not null references pharmacy_sales(id) on delete restrict,
  patient_id            uuid         references patients(id) on delete restrict,
  customer_name         text,
  customer_mobile       text,
  return_type           text         not null,
  return_reason         text         not null,
  total_return_amount   numeric(14,2) not null,
  cash_session_id       uuid,        -- FK to cash_sessions(id) added in 099 (Module 18)
  processed_by          uuid         not null references users(id) on delete restrict,
  processed_at          timestamptz  not null default now(),
  -- uniform block
  created_by            uuid         not null references users(id) on delete set null,
  created_at            timestamptz  not null default now(),
  updated_by            uuid         references users(id) on delete set null,
  updated_at            timestamptz  not null default now(),
  version               int          not null default 0,
  deleted_at            timestamptz,
  deleted_by            uuid         references users(id) on delete set null,
  constraint chk_pharmacy_returns_number_len      check (char_length(return_number) between 5 and 30),
  constraint chk_pharmacy_returns_type            check (return_type in ('full','partial')),
  constraint chk_pharmacy_returns_amounts         check (total_return_amount >= 0),
  constraint chk_pharmacy_returns_customer_mobile check (customer_mobile is null or char_length(customer_mobile) between 10 and 15)
);

comment on table pharmacy_returns is 'Customer return header — one row per return event. Always references an original sale. Refund mechanics live in Module 18 non_sale_cash_movements; total_return_amount here is the claim amount.';

create unique index if not exists uq_pharmacy_returns_number on pharmacy_returns (return_number);
create index        if not exists ix_pharmacy_returns_sale   on pharmacy_returns (original_sale_id);
create index        if not exists ix_pharmacy_returns_date   on pharmacy_returns (processed_at desc) where deleted_at is null;

drop trigger if exists tr_pharmacy_returns_bu_touch on pharmacy_returns;
create trigger tr_pharmacy_returns_bu_touch
  before update on pharmacy_returns
  for each row execute function fn_touch_updated();

drop trigger if exists tr_pharmacy_returns_au_audit on pharmacy_returns;
create trigger tr_pharmacy_returns_au_audit
  after insert or update or delete on pharmacy_returns
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- pharmacy_return_items
-- ---------------------------------------------------------------------
create table if not exists pharmacy_return_items (
  id                     uuid         primary key default uuidv7(),
  pharmacy_return_id     uuid         not null references pharmacy_returns(id)    on delete cascade,
  pharmacy_sale_item_id  uuid         not null references pharmacy_sale_items(id) on delete restrict,
  drug_id                uuid         not null references drug_catalogue(id)      on delete restrict,
  drug_stock_id          uuid         not null references drug_stock(id)          on delete restrict,
  quantity_returned      int          not null,
  unit_price             numeric(14,2) not null,
  return_amount          numeric(14,2) not null,
  notes                  text,
  -- L1 audit block (no soft-delete per spec)
  created_by             uuid         not null references users(id) on delete set null,
  created_at             timestamptz  not null default now(),
  updated_by             uuid         references users(id) on delete set null,
  updated_at             timestamptz  not null default now(),
  version                int          not null default 0,
  constraint chk_pharmacy_return_items_qty    check (quantity_returned > 0),
  constraint chk_pharmacy_return_items_prices check (unit_price > 0 and return_amount >= 0)
);

comment on table pharmacy_return_items is 'Return lines — one row per drug per return. quantity_returned is always the restockable quantity (counter inspection rejects damaged/expired items before recording). Trigger appends one drug_stock_ledger return_in row to restore stock.';

create unique index if not exists uq_pharmacy_return_items           on pharmacy_return_items (pharmacy_return_id, pharmacy_sale_item_id);
create index        if not exists ix_pharmacy_return_items_return    on pharmacy_return_items (pharmacy_return_id);
create index        if not exists ix_pharmacy_return_items_sale_item on pharmacy_return_items (pharmacy_sale_item_id);

drop trigger if exists tr_pharmacy_return_items_bu_touch on pharmacy_return_items;
create trigger tr_pharmacy_return_items_bu_touch
  before update on pharmacy_return_items
  for each row execute function fn_touch_updated();

drop trigger if exists tr_pharmacy_return_items_au_audit on pharmacy_return_items;
create trigger tr_pharmacy_return_items_au_audit
  after insert or update or delete on pharmacy_return_items
  for each row execute function fn_audit_row();
