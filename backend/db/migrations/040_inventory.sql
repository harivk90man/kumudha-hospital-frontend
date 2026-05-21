-- =====================================================================
-- 040_inventory.sql
-- vendors, medicines, medicine_batches, purchase_orders,
-- purchase_order_items, stock_movements, narcotic_register.
--
-- Spec: docs/03-schema/v2/modules/14-inventory.html
-- TSD : docs/05-tsd/10-pharmacy-inventory.md
--
-- NOTE: stock_movements.pharmacy_sale_item_id and pharmacy_return_item_id
-- and narcotic_register.pharmacy_sale_id reference the PHARMACY module
-- which is OUT OF SCOPE here. Those columns are kept (per spec) as plain
-- uuid without FK constraints — they will be wired up by the pharmacy
-- migration when that module lands.
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- 1. vendors
-- ---------------------------------------------------------------------
create table if not exists vendors (
  id                     uuid         primary key default gen_random_uuid(),
  tenant_id              uuid         not null references tenants(id) on delete restrict,
  vendor_code            varchar(64)  not null,
  vendor_name            varchar(200) not null,
  contact_person         varchar(120),
  mobile                 varchar(20)  not null,
  email                  varchar(200),
  address                text,
  gstin                  varchar(32),
  pan                    varchar(16),
  drug_licence_number    varchar(64),
  payment_terms_days     int          not null default 30,
  is_narcotic_supplier   boolean      not null default false,
  is_active              boolean      not null default true,
  created_by             uuid         references users(id) on delete set null,
  created_at             timestamptz  not null default now(),
  updated_by             uuid         references users(id) on delete set null,
  updated_at             timestamptz  not null default now(),
  version                int          not null default 0,
  constraint uq_vendors_tenant_code unique (tenant_id, vendor_code)
);
comment on table vendors is
  'Pharma supplier directory — contact, GST, payment terms, drug licence, narcotic-supplier flag.';

create index if not exists idx_vendors_tenant_active on vendors(tenant_id, is_active);

drop trigger if exists trg_vendors_updated_at on vendors;
create trigger trg_vendors_updated_at
  before update on vendors
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------
-- 2. medicines
-- ---------------------------------------------------------------------
create table if not exists medicines (
  id                     uuid         primary key default gen_random_uuid(),
  tenant_id              uuid         not null references tenants(id) on delete restrict,
  medicine_code          varchar(64)  not null,
  medicine_name          varchar(200) not null,
  generic_name           varchar(200),
  brand_name             varchar(200),
  manufacturer           varchar(200),
  category               varchar(64),
  drug_schedule          varchar(8),
  is_narcotic            boolean      not null default false,
  drug_class             varchar(64),
  form                   varchar(32)  not null,
  strength               varchar(64),
  unit                   varchar(32)  not null,
  pack_size              int          not null default 1,
  storage_temp           varchar(16),
  hsn_code               varchar(16),
  gst_pct                numeric(5,2) not null default 12,
  requires_prescription  boolean      not null default true,
  reorder_level          int          not null default 0,
  max_stock_level        int          not null default 0,
  is_active              boolean      not null default true,
  created_by             uuid         references users(id) on delete set null,
  created_at             timestamptz  not null default now(),
  updated_by             uuid         references users(id) on delete set null,
  updated_at             timestamptz  not null default now(),
  version                int          not null default 0,
  constraint chk_medicines_schedule
    check (drug_schedule is null or drug_schedule in ('H','H1','X','G','OTC')),
  constraint chk_medicines_form
    check (form in ('tablet','capsule','syrup','injection','cream','ointment','drops','inhaler','patch','suppository','powder','other')),
  constraint chk_medicines_storage
    check (storage_temp is null or storage_temp in ('room','refrigerated','frozen','controlled')),
  constraint uq_medicines_code unique (tenant_id, medicine_code)
);
comment on table  medicines is
  'Drug master — name, schedule, form, strength, GST, reorder level, narcotic flag, drug_class for allergy alerting.';
comment on column medicines.drug_class is
  'Matches allergies_lookup.drug_class_code for prescribe-time allergy alert.';

create index if not exists idx_medicines_generic
  on medicines(tenant_id, lower(generic_name), strength, form);
create index if not exists idx_medicines_drug_class
  on medicines(tenant_id, drug_class) where drug_class is not null;
create index if not exists idx_medicines_narcotic
  on medicines(tenant_id, is_narcotic, is_active) where is_narcotic = true;
create index if not exists idx_medicines_active
  on medicines(tenant_id, is_active);

drop trigger if exists trg_medicines_updated_at on medicines;
create trigger trg_medicines_updated_at
  before update on medicines
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------
-- 3. purchase_orders
-- (purchase_order_items.purchase_order_id FK requires this to exist;
--  medicine_batches.po_id FK does too — order created here.)
-- ---------------------------------------------------------------------
create table if not exists purchase_orders (
  id                   uuid         primary key default gen_random_uuid(),
  tenant_id            uuid         not null references tenants(id) on delete restrict,
  po_number            varchar(32)  not null unique,
  vendor_id            uuid         not null references vendors(id) on delete restrict,
  expected_date        date,
  status               varchar(32)  not null default 'draft',
  total_amount         numeric(12,2) not null default 0,
  includes_narcotics   boolean      not null default false,
  ordered_by           uuid         not null references users(id) on delete restrict,
  approval_status      varchar(16)  not null default 'pending',
  approved_by          uuid         references users(id) on delete set null,
  approved_at          timestamptz,
  rejection_reason     text,
  ordered_at           timestamptz,
  received_at          timestamptz,
  created_by           uuid         references users(id) on delete set null,
  created_at           timestamptz  not null default now(),
  updated_by           uuid         references users(id) on delete set null,
  updated_at           timestamptz  not null default now(),
  version              int          not null default 0,
  constraint chk_purchase_orders_status
    check (status in ('draft','pending_approval','approved','sent','partially_received','received','cancelled','rejected')),
  constraint chk_purchase_orders_approval
    check (approval_status in ('pending','approved','rejected'))
);
comment on table purchase_orders is
  'PO header to a vendor — status, totals, Layer 2 approver. includes_narcotics flag for NDPS routing.';

create index if not exists idx_purchase_orders_status
  on purchase_orders(tenant_id, status, ordered_at desc);
create index if not exists idx_purchase_orders_vendor
  on purchase_orders(vendor_id, status);

drop trigger if exists trg_purchase_orders_updated_at on purchase_orders;
create trigger trg_purchase_orders_updated_at
  before update on purchase_orders
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------
-- 4. medicine_batches
-- ---------------------------------------------------------------------
create table if not exists medicine_batches (
  id                   uuid         primary key default gen_random_uuid(),
  tenant_id            uuid         not null references tenants(id) on delete restrict,
  medicine_id          uuid         not null references medicines(id) on delete restrict,
  batch_number         varchar(64)  not null,
  mfg_date             date,
  expiry_date          date         not null,
  purchase_price       numeric(10,2) not null,
  mrp_at_purchase      numeric(10,2) not null,
  selling_price        numeric(10,2) not null,
  quantity_received    int          not null,
  quantity_available   int          not null,
  vendor_id            uuid         not null references vendors(id) on delete restrict,
  po_id                uuid         references purchase_orders(id) on delete set null,
  received_date        date         not null,
  is_blocked           boolean      not null default false,
  blocked_reason       varchar(32),
  version              int          not null default 0,
  constraint chk_medicine_batches_qty_received check (quantity_received >= 0),
  constraint chk_medicine_batches_qty_available check (quantity_available >= 0),
  constraint chk_medicine_batches_blocked_reason
    check (blocked_reason is null or blocked_reason in ('expired','recall','damaged')),
  constraint uq_medicine_batches unique (tenant_id, medicine_id, batch_number, vendor_id)
);
comment on table  medicine_batches is
  'Per-batch stock — batch no, expiry, MRP, qty available. FEFO pick. Block expired/recalled.';
comment on column medicine_batches.quantity_available is
  'Decremented atomically at dispense by trigger; optimistic-lock via version.';

create index if not exists idx_medicine_batches_fefo
  on medicine_batches(tenant_id, medicine_id, expiry_date)
  where quantity_available > 0 and is_blocked = false;
-- Full B-tree (no partial predicate) — `current_date` is STABLE, not
-- IMMUTABLE, so Postgres rejects it in an index predicate. Range queries
-- like `where expiry_date <= now() + interval '30 days'` still use this
-- index via index-range scan.
create index if not exists idx_medicine_batches_expiry_warn
  on medicine_batches(tenant_id, expiry_date);
create index if not exists idx_medicine_batches_stock_summary
  on medicine_batches(tenant_id, medicine_id, quantity_available);

-- ---------------------------------------------------------------------
-- 5. purchase_order_items
-- ---------------------------------------------------------------------
create table if not exists purchase_order_items (
  id                   uuid         primary key default gen_random_uuid(),
  purchase_order_id    uuid         not null references purchase_orders(id) on delete cascade,
  medicine_id          uuid         not null references medicines(id) on delete restrict,
  quantity_ordered     int          not null,
  quantity_received    int          not null default 0,
  unit_price           numeric(10,2) not null,
  cgst_pct             numeric(5,2) not null default 0,
  cgst_amount          numeric(10,2) not null default 0,
  sgst_pct             numeric(5,2) not null default 0,
  sgst_amount          numeric(10,2) not null default 0,
  igst_pct             numeric(5,2) not null default 0,
  igst_amount          numeric(10,2) not null default 0,
  total_price          numeric(12,2) not null,
  constraint chk_poi_qty_ordered  check (quantity_ordered > 0),
  constraint chk_poi_qty_received check (quantity_received >= 0),
  constraint uq_purchase_order_items unique (purchase_order_id, medicine_id)
);
comment on table purchase_order_items is 'Lines on a PO — medicine, qty ordered/received, price, GST split.';

-- ---------------------------------------------------------------------
-- 6. stock_movements  (append-only ledger)
-- ---------------------------------------------------------------------
create table if not exists stock_movements (
  id                          uuid         primary key default gen_random_uuid(),
  tenant_id                   uuid         not null references tenants(id) on delete restrict,
  medicine_batch_id           uuid         not null references medicine_batches(id) on delete restrict,
  movement_type               varchar(32)  not null,
  quantity                    int          not null,
  balance_after               int          not null,
  purchase_order_item_id      uuid         references purchase_order_items(id) on delete set null,
  pharmacy_sale_item_id       uuid,                        -- FK target out of scope (pharmacy module)
  pharmacy_return_item_id     uuid,                        -- FK target out of scope (pharmacy module)
  transfer_counterpart_id     uuid         references stock_movements(id) on delete set null,
  adjustment_reason           text,
  performed_by                uuid         not null references users(id) on delete restrict,
  performed_at                timestamptz  not null default now(),
  notes                       text,
  constraint chk_stock_movements_type check (
    movement_type in ('purchase_in','sale_out','return_in','return_writeoff','adjustment',
                      'expiry_writeoff','surgery_use','ward_use','transfer_in','transfer_out')
  ),
  constraint chk_stock_movements_qty_signed   check (quantity <> 0),
  constraint chk_stock_movements_balance      check (balance_after >= 0),
  constraint chk_stock_movements_one_source   check (
    num_nonnulls(purchase_order_item_id, pharmacy_sale_item_id,
                 pharmacy_return_item_id, transfer_counterpart_id) <= 1
  ),
  constraint chk_stock_movements_adjustment_reason
    check ((movement_type = 'adjustment') = (adjustment_reason is not null)),
  constraint chk_stock_movements_purchase_in
    check ((movement_type = 'purchase_in') = (purchase_order_item_id is not null)),
  constraint chk_stock_movements_sale_out
    check ((movement_type = 'sale_out')    = (pharmacy_sale_item_id is not null)),
  constraint chk_stock_movements_return
    check ((movement_type in ('return_in','return_writeoff')) = (pharmacy_return_item_id is not null))
);
comment on table stock_movements is
  'Append-only stock change log — purchase_in, sale_out, return, writeoff, surgery/ward use. Separate-column FKs.';

create index if not exists idx_stock_movements_batch
  on stock_movements(medicine_batch_id, performed_at desc);
create index if not exists idx_stock_movements_type
  on stock_movements(tenant_id, movement_type, performed_at desc);
create index if not exists idx_stock_movements_po_item
  on stock_movements(purchase_order_item_id) where purchase_order_item_id is not null;
create index if not exists idx_stock_movements_sale_item
  on stock_movements(pharmacy_sale_item_id) where pharmacy_sale_item_id is not null;
create index if not exists idx_stock_movements_return_item
  on stock_movements(pharmacy_return_item_id) where pharmacy_return_item_id is not null;

-- Append-only enforcement
drop trigger if exists trg_stock_movements_append_only on stock_movements;
create trigger trg_stock_movements_append_only
  before update or delete on stock_movements
  for each row execute function fn_append_only_guard();

-- ---------------------------------------------------------------------
-- 7. narcotic_register  (NDPS Schedule X ledger, append-only)
--
-- prescription_id FK is set in 050_consultation.sql (prescriptions exists
-- only after consultation module). pharmacy_sale_id FK is out of scope.
-- ---------------------------------------------------------------------
create table if not exists narcotic_register (
  id                    uuid         primary key default gen_random_uuid(),
  tenant_id             uuid         not null references tenants(id) on delete restrict,
  medicine_id           uuid         not null references medicines(id) on delete restrict,
  medicine_batch_id     uuid         references medicine_batches(id) on delete restrict,
  pharmacy_sale_id      uuid,                                 -- FK target out of scope (pharmacy module)
  prescription_id       uuid,                                 -- FK added in 050_consultation.sql
  transaction_type      varchar(32)  not null,
  quantity              int          not null,
  balance_after         int          not null,
  prescriber_name       varchar(200),
  prescriber_reg_no     varchar(64),
  recipient_name        varchar(200),
  recipient_relation    varchar(32),
  recipient_id_proof    varchar(64),
  witnessed_by          uuid         references users(id) on delete restrict,
  performed_by          uuid         not null references users(id) on delete restrict,
  performed_at          timestamptz  not null default now(),
  approval_status       varchar(16)  not null default 'approved',
  approved_by           uuid         references users(id) on delete set null,
  approved_at           timestamptz,
  rejection_reason      text,
  notes                 text,
  constraint chk_narcotic_register_type check (
    transaction_type in ('opening_balance','purchase_in','dispense_out','wastage',
                          'transfer_in','transfer_out','return','expired_writeoff','adjustment')
  ),
  constraint chk_narcotic_register_qty       check (quantity <> 0),
  constraint chk_narcotic_register_balance   check (balance_after >= 0),
  constraint chk_narcotic_register_approval  check (approval_status in ('pending','approved','rejected')),
  constraint chk_narcotic_register_recipient_relation
    check (recipient_relation is null or recipient_relation in
           ('self','spouse','parent','father','mother','sibling','child',
            'authorized_attendant','attender','other')),
  constraint chk_narcotic_register_two_person
    check (witnessed_by is null or witnessed_by <> performed_by),
  constraint chk_narcotic_register_dispense_disclosure
    check (
      transaction_type <> 'dispense_out' or (
        prescriber_name    is not null
        and recipient_name is not null
        and recipient_id_proof is not null
      )
    ),
  constraint chk_narcotic_register_wastage_approved
    check (
      transaction_type not in ('wastage','adjustment')
      or (approval_status = 'approved' and approved_by is not null)
    )
);
comment on table narcotic_register is
  'NDPS-compliant Schedule X ledger — every transaction with running balance, prescriber, recipient, witness. Append-only. 7-year legal retention.';

create index if not exists idx_narcotic_register_medicine
  on narcotic_register(tenant_id, medicine_id, performed_at desc);
create index if not exists idx_narcotic_register_dispense
  on narcotic_register(tenant_id, performed_at desc) where transaction_type = 'dispense_out';
create index if not exists idx_narcotic_register_prescription
  on narcotic_register(prescription_id) where prescription_id is not null;

-- Append-only enforcement
drop trigger if exists trg_narcotic_register_append_only on narcotic_register;
create trigger trg_narcotic_register_append_only
  before update or delete on narcotic_register
  for each row execute function fn_append_only_guard();
