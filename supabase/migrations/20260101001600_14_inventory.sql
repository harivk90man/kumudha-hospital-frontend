-- =====================================================================
-- 042_14_inventory.sql
-- Module 14 — Inventory
-- Tables: vendors, vendor_contacts, drug_catalogue, drug_stock,
--         purchase_orders (L2 maker-checker), purchase_order_items,
--         drug_stock_ledger (append-only),
--         narcotic_register (append-only + L2 maker-checker)
--
-- Cross-module FKs deferred to 099_cross_module_fks.sql:
--   * drug_stock_ledger.pharmacy_sale_item_id   → pharmacy_sale_items(id)   — Module 15 (043)
--   * drug_stock_ledger.pharmacy_return_item_id → pharmacy_return_items(id) — Module 15 (043)
--   * narcotic_register.pharmacy_sale_id        → pharmacy_sales(id)        — Module 15 (043)
-- Spec: docs/03-schema/v3/modules/14-inventory.html
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- vendors
-- ---------------------------------------------------------------------
create table if not exists vendors (
  id                      uuid         primary key default uuidv7(),
  vendor_code             text         not null,
  vendor_name             text         not null,
  address                 jsonb,
  gstin                   text,
  pan                     text,
  drug_licence_number     text,
  payment_terms_days      int          not null default 30,
  is_narcotic_supplier    boolean      not null default false,
  -- uniform block
  created_by              uuid         not null references users(id) on delete set null,
  created_at              timestamptz  not null default now(),
  updated_by              uuid         references users(id) on delete set null,
  updated_at              timestamptz  not null default now(),
  version                 int          not null default 0,
  deleted_at              timestamptz,
  deleted_by              uuid         references users(id) on delete set null,
  constraint chk_vendors_code_len       check (char_length(vendor_code) between 2 and 20),
  constraint chk_vendors_gstin_len      check (gstin is null or char_length(gstin) = 15),
  constraint chk_vendors_pan_len        check (pan   is null or char_length(pan)   = 10),
  constraint chk_vendors_payment_terms  check (payment_terms_days > 0)
);

comment on table vendors is 'Supplier registry — pharmaceutical distributors and consumables suppliers. is_narcotic_supplier gates Schedule X purchase orders; contact persons live in child table vendor_contacts.';

create unique index if not exists uq_vendors_code   on vendors (vendor_code) where deleted_at is null;
create index        if not exists ix_vendors_active on vendors (vendor_name) where deleted_at is null;

drop trigger if exists tr_vendors_bu_touch on vendors;
create trigger tr_vendors_bu_touch
  before update on vendors
  for each row execute function fn_touch_updated();

drop trigger if exists tr_vendors_au_audit on vendors;
create trigger tr_vendors_au_audit
  after insert or update or delete on vendors
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- vendor_contacts
-- ---------------------------------------------------------------------
create table if not exists vendor_contacts (
  id            uuid         primary key default uuidv7(),
  vendor_id     uuid         not null references vendors(id) on delete cascade,
  contact_name  text         not null,
  role          text         not null,
  mobile        text,
  phone         text,
  email         text,
  is_primary    boolean      not null default false,
  -- uniform block
  created_by    uuid         not null references users(id) on delete set null,
  created_at    timestamptz  not null default now(),
  updated_by    uuid         references users(id) on delete set null,
  updated_at    timestamptz  not null default now(),
  version       int          not null default 0,
  deleted_at    timestamptz,
  deleted_by    uuid         references users(id) on delete set null,
  constraint chk_vendor_contacts_role        check (role in ('sales_rep','delivery','accounts','support','other')),
  constraint chk_vendor_contacts_mobile_len  check (mobile is null or char_length(mobile) between 10 and 15),
  constraint chk_vendor_contacts_has_contact check (num_nonnulls(mobile, phone, email) >= 1)
);

comment on table vendor_contacts is 'One row per contact person per vendor (sales rep, delivery, accounts). Exactly one contact per vendor is marked is_primary; used as the default PO recipient.';

create unique index if not exists uq_vendor_contacts_primary on vendor_contacts (vendor_id) where is_primary = true and deleted_at is null;
create index        if not exists ix_vendor_contacts_vendor  on vendor_contacts (vendor_id) where deleted_at is null;

drop trigger if exists tr_vendor_contacts_bu_touch on vendor_contacts;
create trigger tr_vendor_contacts_bu_touch
  before update on vendor_contacts
  for each row execute function fn_touch_updated();

drop trigger if exists tr_vendor_contacts_au_audit on vendor_contacts;
create trigger tr_vendor_contacts_au_audit
  after insert or update or delete on vendor_contacts
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- drug_catalogue
-- ---------------------------------------------------------------------
create table if not exists drug_catalogue (
  id                      uuid         primary key default uuidv7(),
  drug_code               text         not null,
  generic_name            text         not null,
  brand_name              text,
  manufacturer            text,
  drug_class              text,
  category                text,
  drug_schedule           text,
  is_narcotic             boolean      not null default false,
  form                    text         not null,
  strength                text,
  unit                    text         not null,
  pack_size               int          not null default 1,
  hsn_code                text,
  gst_pct                 numeric(4,2) not null default 12.00,
  requires_prescription   boolean      not null default true,
  low_stock_threshold     int          not null default 0,
  max_stock_threshold     int          not null default 0,
  storage_temp            text,
  -- uniform block
  created_by              uuid         references users(id) on delete set null,
  created_at              timestamptz  not null default now(),
  updated_by              uuid         references users(id) on delete set null,
  updated_at              timestamptz  not null default now(),
  version                 int          not null default 0,
  deleted_at              timestamptz,
  deleted_by              uuid         references users(id) on delete set null,
  constraint chk_drug_catalogue_code_len     check (char_length(drug_code) between 2 and 20),
  constraint chk_drug_catalogue_schedule     check (drug_schedule in ('H','H1','X','G','OTC') or drug_schedule is null),
  constraint chk_drug_catalogue_form         check (form in ('tablet','capsule','syrup','injection','cream','ointment','drops','inhaler','patch','suppository','powder','other')),
  constraint chk_drug_catalogue_gst          check (gst_pct in (0, 5, 12, 18, 28)),
  constraint chk_drug_catalogue_pack_size    check (pack_size > 0),
  constraint chk_drug_catalogue_reorder      check (low_stock_threshold >= 0 and max_stock_threshold >= 0),
  constraint chk_drug_catalogue_storage_temp check (storage_temp in ('room','refrigerated','frozen','controlled') or storage_temp is null)
);

comment on table drug_catalogue is 'Drug catalogue — the "what can be prescribed and dispensed" reference. Drives allergy alerting (drug_class), narcotic register enforcement (is_narcotic), and FEFO stock display at prescribing time.';

create unique index if not exists uq_drug_catalogue_code       on drug_catalogue (drug_code) where deleted_at is null;
create index        if not exists ix_drug_catalogue_generic    on drug_catalogue (lower(generic_name), strength, form) where deleted_at is null;
create index        if not exists ix_drug_catalogue_drug_class on drug_catalogue (drug_class) where drug_class is not null and deleted_at is null;
create index        if not exists ix_drug_catalogue_narcotic   on drug_catalogue (is_narcotic) where is_narcotic = true and deleted_at is null;

drop trigger if exists tr_drug_catalogue_bu_touch on drug_catalogue;
create trigger tr_drug_catalogue_bu_touch
  before update on drug_catalogue
  for each row execute function fn_touch_updated();

drop trigger if exists tr_drug_catalogue_au_audit on drug_catalogue;
create trigger tr_drug_catalogue_au_audit
  after insert or update or delete on drug_catalogue
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- purchase_orders  (L2 maker-checker)
-- Defined before drug_stock since drug_stock.purchase_order_id → purchase_orders(id)
-- ---------------------------------------------------------------------
create table if not exists purchase_orders (
  id                    uuid         primary key default uuidv7(),
  po_number             text         not null,
  vendor_id             uuid         not null references vendors(id) on delete restrict,
  expected_date         date,
  status                text         not null default 'draft',
  total_amount          numeric(14,2) not null default 0,
  received_at           timestamptz,
  includes_narcotics    boolean      not null default false,
  -- L2 maker-checker
  approval_status       text         not null default 'pending_approval',
  approved_by           uuid         references users(id) on delete restrict,
  approved_at           timestamptz,
  rejection_reason      text,
  -- uniform block
  created_by            uuid         not null references users(id) on delete set null,
  created_at            timestamptz  not null default now(),
  updated_by            uuid         references users(id) on delete set null,
  updated_at            timestamptz  not null default now(),
  version               int          not null default 0,
  deleted_at            timestamptz,
  deleted_by            uuid         references users(id) on delete set null,
  constraint chk_purchase_orders_number_len       check (char_length(po_number) between 5 and 30),
  constraint chk_purchase_orders_status           check (status in ('draft','pending_approval','approved','sent','partially_received','received','cancelled','rejected')),
  constraint chk_purchase_orders_total            check (total_amount >= 0),
  constraint chk_purchase_orders_approval_status  check (approval_status in ('pending_approval','approved','rejected')),
  constraint chk_purchase_orders_sod              check (approved_by is null or created_by <> approved_by)
);

comment on table purchase_orders is 'Purchase order header to a vendor. L2 maker-checker — POs above the requester''s spending limit require a second person to approve. includes_narcotics recomputed by trigger on purchase_order_items.';

create unique index if not exists uq_purchase_orders_number   on purchase_orders (po_number);
create index        if not exists ix_purchase_orders_pending  on purchase_orders (status, created_at desc) where status in ('pending_approval','approved','sent','partially_received');
create index        if not exists ix_purchase_orders_vendor   on purchase_orders (vendor_id, status);

drop trigger if exists tr_purchase_orders_bu_touch on purchase_orders;
create trigger tr_purchase_orders_bu_touch
  before update on purchase_orders
  for each row execute function fn_touch_updated();

drop trigger if exists tr_purchase_orders_au_audit on purchase_orders;
create trigger tr_purchase_orders_au_audit
  after insert or update or delete on purchase_orders
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- drug_stock  (no soft-delete — financial/compliance rows)
-- ---------------------------------------------------------------------
create table if not exists drug_stock (
  id                     uuid         primary key default uuidv7(),
  drug_id                uuid         not null references drug_catalogue(id) on delete restrict,
  batch_number           text         not null,
  mfg_date               date,
  expiry_date            date         not null,
  purchase_price         numeric(14,2) not null,
  mrp                    numeric(14,2) not null,
  selling_price          numeric(14,2) not null,
  quantity_received      int          not null,
  quantity_available     int          not null,
  vendor_id              uuid         not null references vendors(id) on delete restrict,
  purchase_order_id      uuid         references purchase_orders(id)  on delete restrict,
  received_date          date         not null,
  is_blocked             boolean      not null default false,
  blocked_reason         text,
  -- L1 audit block (no soft-delete per spec)
  created_by             uuid         not null references users(id) on delete set null,
  created_at             timestamptz  not null default now(),
  updated_by             uuid         references users(id) on delete set null,
  updated_at             timestamptz  not null default now(),
  version                int          not null default 0,
  constraint chk_drug_stock_expiry             check (mfg_date is null or expiry_date > mfg_date),
  constraint chk_drug_stock_prices             check (purchase_price >= 0 and mrp > 0 and selling_price > 0 and selling_price <= mrp),
  constraint chk_drug_stock_qty                check (quantity_received > 0 and quantity_available >= 0),
  constraint chk_drug_stock_blocked_reason     check ((is_blocked = false and blocked_reason is null) or (is_blocked = true and blocked_reason is not null)),
  constraint chk_drug_stock_blocked_reason_val check (blocked_reason in ('expired','recalled','damaged','quality_hold') or blocked_reason is null)
);

comment on table drug_stock is 'Batch-level stock — the single source of truth for "what can we dispense right now?". FEFO pick order sorts active batches by expiry_date ASC. Optimistic-lock version prevents concurrent decrement races. No soft-delete; is_blocked gates availability.';

create unique index if not exists uq_drug_stock_batch        on drug_stock (drug_id, batch_number, vendor_id);
create index        if not exists ix_drug_stock_fefo         on drug_stock (drug_id, expiry_date) where quantity_available > 0 and is_blocked = false;
-- "near-expiry" alert index. Postgres rejects current_date in a partial-index predicate (must be IMMUTABLE),
-- so we index expiry_date for non-blocked rows and let queries add the date range filter.
create index        if not exists ix_drug_stock_expiry_alert on drug_stock (expiry_date) where is_blocked = false;
create index        if not exists ix_drug_stock_stock        on drug_stock (drug_id, quantity_available);

drop trigger if exists tr_drug_stock_bu_touch on drug_stock;
create trigger tr_drug_stock_bu_touch
  before update on drug_stock
  for each row execute function fn_touch_updated();

drop trigger if exists tr_drug_stock_au_audit on drug_stock;
create trigger tr_drug_stock_au_audit
  after insert or update or delete on drug_stock
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- purchase_order_items
-- ---------------------------------------------------------------------
create table if not exists purchase_order_items (
  id                  uuid         primary key default uuidv7(),
  purchase_order_id   uuid         not null references purchase_orders(id) on delete cascade,
  drug_id             uuid         not null references drug_catalogue(id)  on delete restrict,
  quantity_ordered    int          not null,
  quantity_received   int          not null default 0,
  unit_price          numeric(14,2) not null,
  cgst_pct            numeric(4,2) not null default 0,
  cgst_amount         numeric(14,2) not null default 0,
  sgst_pct            numeric(4,2) not null default 0,
  sgst_amount         numeric(14,2) not null default 0,
  igst_pct            numeric(4,2) not null default 0,
  igst_amount         numeric(14,2) not null default 0,
  total_price         numeric(14,2) not null,
  -- L1 audit block (no soft-delete per spec)
  created_by          uuid         not null references users(id) on delete set null,
  created_at          timestamptz  not null default now(),
  updated_by          uuid         references users(id) on delete set null,
  updated_at          timestamptz  not null default now(),
  version             int          not null default 0,
  constraint chk_purchase_order_items_qty           check (quantity_ordered > 0 and quantity_received >= 0),
  constraint chk_purchase_order_items_unit_price    check (unit_price > 0),
  constraint chk_purchase_order_items_gst           check (cgst_pct >= 0 and sgst_pct >= 0 and igst_pct >= 0 and cgst_amount >= 0 and sgst_amount >= 0 and igst_amount >= 0),
  constraint chk_purchase_order_items_gst_exclusive check ((igst_pct = 0) or (cgst_pct = 0 and sgst_pct = 0)),
  constraint chk_purchase_order_items_total         check (total_price > 0)
);

comment on table purchase_order_items is 'PO line items — one row per drug per PO. Tracks ordered vs received quantity for partial-receipt scenarios. GST is split into CGST+SGST (intra-state) or IGST (inter-state). Trigger on INSERT recomputes purchase_orders.total_amount and includes_narcotics.';

create unique index if not exists uq_purchase_order_items_drug     on purchase_order_items (purchase_order_id, drug_id);
create index        if not exists ix_purchase_order_items_po       on purchase_order_items (purchase_order_id);
create index        if not exists ix_purchase_order_items_medicine on purchase_order_items (drug_id);

drop trigger if exists tr_purchase_order_items_bu_touch on purchase_order_items;
create trigger tr_purchase_order_items_bu_touch
  before update on purchase_order_items
  for each row execute function fn_touch_updated();

drop trigger if exists tr_purchase_order_items_au_audit on purchase_order_items;
create trigger tr_purchase_order_items_au_audit
  after insert or update or delete on purchase_order_items
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- drug_stock_ledger  (APPEND-ONLY)
-- pharmacy_sale_item_id, pharmacy_return_item_id FKs added in 099
-- ---------------------------------------------------------------------
create table if not exists drug_stock_ledger (
  id                          uuid         primary key default uuidv7(),
  drug_stock_id               uuid         not null references drug_stock(id) on delete restrict,
  movement_type               text         not null,
  quantity_before             int          not null,
  quantity_after              int          not null,
  purchase_order_item_id      uuid         references purchase_order_items(id) on delete restrict,
  pharmacy_sale_item_id       uuid,        -- FK to pharmacy_sale_items(id)   added in 099 (Module 15)
  pharmacy_return_item_id     uuid,        -- FK to pharmacy_return_items(id) added in 099 (Module 15)
  adjustment_reason           text,
  transfer_counterpart_id     uuid         references drug_stock_ledger(id) on delete restrict,
  performed_by                uuid         not null references users(id) on delete restrict,
  notes                       text,
  -- L1 audit block (no updated_*, no soft-delete — append-only)
  created_by                  uuid         not null references users(id) on delete set null,
  created_at                  timestamptz  not null default now(),
  updated_by                  uuid         references users(id) on delete set null,
  updated_at                  timestamptz  not null default now(),
  version                     int          not null default 0,
  deleted_at                  timestamptz,
  deleted_by                  uuid         references users(id) on delete set null,
  constraint chk_drug_stock_ledger_type              check (movement_type in ('purchase_in','sale_out','return_in','return_writeoff','adjustment','expiry_writeoff','ward_use','transfer_in','transfer_out')),
  constraint chk_drug_stock_ledger_qty               check (quantity_before >= 0 and quantity_after >= 0),
  constraint chk_drug_stock_ledger_nonzero           check (quantity_before <> quantity_after),
  constraint chk_drug_stock_ledger_one_source        check (num_nonnulls(purchase_order_item_id, pharmacy_sale_item_id, pharmacy_return_item_id, transfer_counterpart_id) <= 1),
  constraint chk_drug_stock_ledger_purchase_in       check ((movement_type = 'purchase_in') = (purchase_order_item_id is not null)),
  constraint chk_drug_stock_ledger_sale_out          check ((movement_type = 'sale_out') = (pharmacy_sale_item_id is not null)),
  constraint chk_drug_stock_ledger_return            check ((movement_type in ('return_in','return_writeoff')) = (pharmacy_return_item_id is not null)),
  constraint chk_drug_stock_ledger_adjustment_reason check ((movement_type = 'adjustment') = (adjustment_reason is not null and char_length(adjustment_reason) >= 10))
);

comment on table drug_stock_ledger is 'Append-only ledger — every change to drug_stock.quantity_available writes one row. Authoritative audit trail for stock reconciliation and pharmacy inspection. Errors are corrected by appending an adjustment row (never UPDATE/DELETE). 7-year retention.';

create index if not exists ix_drug_stock_ledger_batch     on drug_stock_ledger (drug_stock_id, created_at desc);
create index if not exists ix_drug_stock_ledger_type      on drug_stock_ledger (movement_type, created_at desc);
create index if not exists ix_drug_stock_ledger_sale_item on drug_stock_ledger (pharmacy_sale_item_id) where pharmacy_sale_item_id is not null;
create index if not exists ix_drug_stock_ledger_po_item   on drug_stock_ledger (purchase_order_item_id) where purchase_order_item_id is not null;

drop trigger if exists tr_drug_stock_ledger_bu_guard on drug_stock_ledger;
create trigger tr_drug_stock_ledger_bu_guard
  before update on drug_stock_ledger
  for each row execute function fn_append_only_guard();

drop trigger if exists tr_drug_stock_ledger_bd_guard on drug_stock_ledger;
create trigger tr_drug_stock_ledger_bd_guard
  before delete on drug_stock_ledger
  for each row execute function fn_append_only_guard();

drop trigger if exists tr_drug_stock_ledger_au_audit on drug_stock_ledger;
create trigger tr_drug_stock_ledger_au_audit
  after insert on drug_stock_ledger
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- narcotic_register  (APPEND-ONLY + L2 maker-checker)
-- pharmacy_sale_id FK added in 099 (Module 15)
-- ---------------------------------------------------------------------
create table if not exists narcotic_register (
  id                    uuid         primary key default uuidv7(),
  drug_id               uuid         not null references drug_catalogue(id) on delete restrict,
  drug_stock_id         uuid         references drug_stock(id)              on delete restrict,
  transaction_type      text         not null,
  quantity_before       int          not null,
  quantity_after        int          not null,
  pharmacy_sale_id      uuid,        -- FK to pharmacy_sales(id) added in 099 (Module 15)
  prescription_id       uuid         references prescriptions(id)           on delete restrict,
  prescriber_name       text,
  prescriber_reg_no     text,
  recipient_name        text,
  recipient_relation    text,
  recipient_id_proof    text,
  performed_by          uuid         not null references users(id) on delete restrict,
  witnessed_by          uuid         not null references users(id) on delete restrict,
  notes                 text,
  -- L2 maker-checker
  approval_status       text         not null default 'approved',
  approved_by           uuid         references users(id) on delete restrict,
  approved_at           timestamptz,
  rejection_reason      text,
  -- L1 audit block (no updated_*, no soft-delete — append-only)
  created_by            uuid         not null references users(id) on delete set null,
  created_at            timestamptz  not null default now(),
  updated_by            uuid         references users(id) on delete set null,
  updated_at            timestamptz  not null default now(),
  version               int          not null default 0,
  deleted_at            timestamptz,
  deleted_by            uuid         references users(id) on delete set null,
  constraint chk_narcotic_register_type                 check (transaction_type in ('opening_balance','purchase_in','dispense_out','wastage','transfer_in','transfer_out','return','expired_writeoff','adjustment')),
  constraint chk_narcotic_register_qty                  check (quantity_before >= 0 and quantity_after >= 0),
  constraint chk_narcotic_register_nonzero              check (quantity_before <> quantity_after),
  constraint chk_narcotic_register_sod_witness          check (performed_by <> witnessed_by),
  constraint chk_narcotic_register_dispense_fields      check ((transaction_type <> 'dispense_out') or (prescriber_name is not null and recipient_name is not null and recipient_id_proof is not null)),
  constraint chk_narcotic_register_wastage_approval     check ((transaction_type not in ('wastage','adjustment')) or (approval_status = 'approved' and approved_by is not null)),
  constraint chk_narcotic_register_recipient_relation   check (recipient_relation in ('self','mother','father','spouse','sibling','child','attender','other') or recipient_relation is null),
  constraint chk_narcotic_register_approval_status      check (approval_status in ('pending_approval','approved','rejected'))
);

comment on table narcotic_register is 'NDPS Act 1985 mandated Schedule X transactions register. Append-only, 7-year legal retention. Two-person witness rule (performed_by <> witnessed_by). quantity_before/after computed by trigger from previous row. Paired insert required for any narcotic stock movement.';

create index if not exists ix_narcotic_register_medicine     on narcotic_register (drug_id, created_at desc);
create index if not exists ix_narcotic_register_dispense     on narcotic_register (created_at desc) where transaction_type = 'dispense_out';
create index if not exists ix_narcotic_register_prescription on narcotic_register (prescription_id) where prescription_id is not null;

drop trigger if exists tr_narcotic_register_bu_guard on narcotic_register;
create trigger tr_narcotic_register_bu_guard
  before update on narcotic_register
  for each row execute function fn_append_only_guard();

drop trigger if exists tr_narcotic_register_bd_guard on narcotic_register;
create trigger tr_narcotic_register_bd_guard
  before delete on narcotic_register
  for each row execute function fn_append_only_guard();

drop trigger if exists tr_narcotic_register_au_audit on narcotic_register;
create trigger tr_narcotic_register_au_audit
  after insert on narcotic_register
  for each row execute function fn_audit_row();
