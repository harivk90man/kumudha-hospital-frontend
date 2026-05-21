-- =====================================================================
-- 051_17_billing.sql
-- Module 17 — Billing
-- Tables: invoices (L2 maker-checker), invoice_items
--
-- Cross-module FKs deferred to 099_cross_module_fks.sql:
--   * invoice_items.pharmacy_sale_item_id → pharmacy_sale_items(id) — Module 15
--   * invoice_items.bed_assignment_id     → bed_assignments(id)     — Phase 2
--   * invoice_items.surgery_schedule_id   → surgery_schedules(id)   — Phase 2
--   * invoices.ip_admission_id            → ip_admissions(id)       — Phase 2
--
-- invoices.id is referenced BY tokens, lab_orders, radiology_orders,
-- pharmacy_sales — those downstream FKs are wired in 099.
-- Spec: docs/03-schema/v3/modules/17-billing.html
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- invoices  (L2 maker-checker — discount approval)
-- ---------------------------------------------------------------------
create table if not exists invoices (
  id                          uuid          primary key default uuidv7(),
  invoice_number              text          not null,
  invoice_type                text          not null,
  patient_id                  uuid          not null references patients(id) on delete restrict,
  op_visit_id                 uuid          references op_visits(id) on delete restrict,
  ip_admission_id             uuid,                                                    -- FK to ip_admissions(id) deferred (Phase 2)
  invoice_date                date          not null default current_date,
  subtotal                    numeric(14,2) not null default 0,
  total_line_discount         numeric(14,2) not null default 0,
  bill_discount_pct           numeric(4,2),
  bill_discount_amount        numeric(14,2) not null default 0,
  bill_discount_reason        text,
  bill_discount_category      text,
  total_discount              numeric(14,2) not null generated always as (total_line_discount + bill_discount_amount) stored,
  total_tax                   numeric(14,2) not null default 0,
  total_amount                numeric(14,2) not null default 0,
  amount_paid                 numeric(14,2) not null default 0,
  balance                     numeric(14,2) not null generated always as (total_amount - amount_paid) stored,
  payment_status              text          not null default 'draft',
  insurance_covered_amount    numeric(14,2) not null default 0,
  patient_copay_amount        numeric(14,2) not null default 0,
  finalized_at                timestamptz,
  idempotency_key             uuid,
  -- L2 maker-checker
  approval_status             text          not null default 'pending_approval',
  approved_by                 uuid          references users(id) on delete set null,
  approved_at                 timestamptz,
  rejection_reason            text,
  -- uniform block
  created_by                  uuid          not null references users(id) on delete set null,
  created_at                  timestamptz   not null default now(),
  updated_by                  uuid          references users(id) on delete set null,
  updated_at                  timestamptz   not null default now(),
  version                     int           not null default 0,
  deleted_at                  timestamptz,
  deleted_by                  uuid          references users(id) on delete set null,
  constraint chk_invoices_number_len        check (char_length(invoice_number) between 5 and 30),
  constraint chk_invoices_type              check (invoice_type in ('op','ip_interim','ip_final','pharmacy','lab_direct','radiology_direct','other')),
  constraint chk_invoices_status            check (payment_status in ('draft','finalized','paid','partially_paid','refunded','cancelled')),
  constraint chk_invoices_discount_pct      check (bill_discount_pct is null or (bill_discount_pct > 0 and bill_discount_pct <= 100)),
  constraint chk_invoices_discount_category check (bill_discount_category is null or bill_discount_category in ('senior_citizen','staff','camp','corporate','charity','management','special')),
  constraint chk_invoices_discount_reason   check ((total_line_discount = 0 and bill_discount_amount = 0) or bill_discount_reason is not null),
  constraint chk_invoices_amounts           check (subtotal >= 0 and total_line_discount >= 0 and bill_discount_amount >= 0 and total_tax >= 0 and total_amount >= 0 and amount_paid >= 0 and insurance_covered_amount >= 0 and patient_copay_amount >= 0),
  constraint chk_invoices_amount_paid       check (amount_paid <= total_amount),
  constraint chk_invoices_context           check (num_nonnulls(op_visit_id, ip_admission_id) <= 1),
  constraint chk_invoices_approval_status   check (approval_status in ('pending_approval','approved','rejected')),
  constraint chk_invoices_sod               check (approval_status = 'pending_approval' or (created_by is not null and approved_by is not null and created_by <> approved_by)),
  constraint chk_invoices_approval_consistency check (
    (approval_status = 'pending_approval' and approved_by is null and approved_at is null) or
    (approval_status = 'approved'         and approved_by is not null and approved_at is not null) or
    (approval_status = 'rejected'         and rejection_reason is not null)
  )
);

comment on table invoices is 'Bill header — one per billing event. Every paid service (OPD consultation, lab order, radiology, pharmacy sale) links to an invoice row. balance and total_discount are GENERATED ALWAYS — can never silently drift. L2 maker-checker governs discount approval per BRD §9.';

create unique index if not exists uq_invoices_number      on invoices (invoice_number);
create unique index if not exists uq_invoices_idempotency on invoices (idempotency_key) where idempotency_key is not null;
create index        if not exists ix_invoices_patient     on invoices (patient_id, invoice_date desc) where deleted_at is null;
create index        if not exists ix_invoices_status      on invoices (payment_status, invoice_date) where deleted_at is null;
create index        if not exists ix_invoices_overdue     on invoices (payment_status, balance) where balance > 0 and payment_status not in ('cancelled','refunded','draft') and deleted_at is null;
create index        if not exists ix_invoices_visit       on invoices (op_visit_id) where op_visit_id is not null;

drop trigger if exists tr_invoices_bu_touch on invoices;
create trigger tr_invoices_bu_touch
  before update on invoices
  for each row execute function fn_touch_updated();

drop trigger if exists tr_invoices_au_audit on invoices;
create trigger tr_invoices_au_audit
  after insert or update or delete on invoices
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- invoice_items  (parent-owned child — CASCADE on delete)
-- ---------------------------------------------------------------------
create table if not exists invoice_items (
  id                          uuid          primary key default uuidv7(),
  invoice_id                  uuid          not null references invoices(id) on delete cascade,
  service_id                  uuid          references services(id) on delete restrict,
  item_type                   text          not null,
  item_name                   text          not null,
  sequence_no                 int           not null,
  consultation_id             uuid          references consultations(id)   on delete restrict,
  lab_order_item_id           uuid          references lab_order_items(id) on delete restrict,
  radiology_order_id          uuid          references radiology_orders(id) on delete restrict,
  pharmacy_sale_item_id       uuid,                                                          -- FK to pharmacy_sale_items(id) deferred to 099 (Module 15)
  bed_assignment_id           uuid,                                                          -- FK to bed_assignments(id) deferred (Phase 2)
  surgery_schedule_id         uuid,                                                          -- FK to surgery_schedules(id) deferred (Phase 2)
  quantity                    int           not null default 1,
  unit_price                  numeric(14,2) not null,
  line_discount_pct           numeric(4,2)  not null default 0,
  line_discount_amount        numeric(14,2) not null default 0,
  line_discount_reason        text,
  line_discount_approved_by   uuid          references users(id) on delete set null,
  cgst_pct                    numeric(4,2)  not null default 0,
  cgst_amount                 numeric(14,2) not null default 0,
  sgst_pct                    numeric(4,2)  not null default 0,
  sgst_amount                 numeric(14,2) not null default 0,
  igst_pct                    numeric(4,2)  not null default 0,
  igst_amount                 numeric(14,2) not null default 0,
  total_price                 numeric(14,2) not null,
  -- uniform block
  created_by                  uuid          not null references users(id) on delete set null,
  created_at                  timestamptz   not null default now(),
  updated_by                  uuid          references users(id) on delete set null,
  updated_at                  timestamptz   not null default now(),
  version                     int           not null default 0,
  deleted_at                  timestamptz,
  deleted_by                  uuid          references users(id) on delete set null,
  constraint chk_invoice_items_type           check (item_type in ('consultation','lab_test','lab_panel','radiology','drug','room_charge','nursing','procedure','surgery','consumable','ambulance','other')),
  constraint chk_invoice_items_sequence       check (sequence_no > 0),
  constraint chk_invoice_items_quantity       check (quantity > 0),
  constraint chk_invoice_items_one_source     check (num_nonnulls(consultation_id, lab_order_item_id, radiology_order_id, pharmacy_sale_item_id, bed_assignment_id, surgery_schedule_id) <= 1),
  constraint chk_invoice_items_consultation   check ((item_type = 'consultation') = (consultation_id is not null)),
  constraint chk_invoice_items_lab            check ((item_type in ('lab_test','lab_panel')) = (lab_order_item_id is not null)),
  constraint chk_invoice_items_radiology      check ((item_type = 'radiology') = (radiology_order_id is not null)),
  constraint chk_invoice_items_drug           check ((item_type = 'drug') = (pharmacy_sale_item_id is not null)),
  constraint chk_invoice_items_gst_exclusive  check ((igst_pct = 0) or (cgst_pct = 0 and sgst_pct = 0)),
  constraint chk_invoice_items_discount_reason check (line_discount_amount = 0 or line_discount_reason is not null),
  constraint chk_invoice_items_prices         check (unit_price > 0 and total_price >= 0 and line_discount_pct >= 0 and line_discount_amount >= 0 and cgst_pct >= 0 and cgst_amount >= 0 and sgst_pct >= 0 and sgst_amount >= 0 and igst_pct >= 0 and igst_amount >= 0)
);

comment on table invoice_items is 'Bill lines — one row per billable item. Each line has an item_type discriminator and a separate-column FK to the source business object. GST split is per line. fn_recompute_invoice_totals trigger keeps parent invoice totals consistent on every change.';

create unique index if not exists uq_invoice_items_seq                on invoice_items (invoice_id, sequence_no);
create index        if not exists ix_invoice_items_invoice            on invoice_items (invoice_id, sequence_no);
create index        if not exists ix_invoice_items_consultation       on invoice_items (consultation_id)        where consultation_id is not null;
create index        if not exists ix_invoice_items_lab_order_item     on invoice_items (lab_order_item_id)      where lab_order_item_id is not null;
create index        if not exists ix_invoice_items_radiology_order    on invoice_items (radiology_order_id)     where radiology_order_id is not null;
create index        if not exists ix_invoice_items_pharmacy_sale_item on invoice_items (pharmacy_sale_item_id)  where pharmacy_sale_item_id is not null;

drop trigger if exists tr_invoice_items_bu_touch on invoice_items;
create trigger tr_invoice_items_bu_touch
  before update on invoice_items
  for each row execute function fn_touch_updated();

drop trigger if exists tr_invoice_items_au_audit on invoice_items;
create trigger tr_invoice_items_au_audit
  after insert or update or delete on invoice_items
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- fn_recompute_invoice_totals — recomputes parent invoice totals
-- atomically on every invoice_items INSERT/UPDATE/DELETE.
-- ---------------------------------------------------------------------
create or replace function fn_recompute_invoice_totals()
returns trigger
language plpgsql
as $$
declare
  v_invoice_id uuid := coalesce(new.invoice_id, old.invoice_id);
begin
  update invoices i
     set subtotal            = coalesce((select sum(quantity * unit_price) from invoice_items where invoice_id = v_invoice_id and deleted_at is null), 0),
         total_line_discount = coalesce((select sum(line_discount_amount)  from invoice_items where invoice_id = v_invoice_id and deleted_at is null), 0),
         total_tax           = coalesce((select sum(cgst_amount + sgst_amount + igst_amount) from invoice_items where invoice_id = v_invoice_id and deleted_at is null), 0),
         total_amount        = coalesce((select sum(total_price) from invoice_items where invoice_id = v_invoice_id and deleted_at is null), 0)
   where i.id = v_invoice_id;

  if tg_op = 'DELETE' then return old; else return new; end if;
end
$$;

drop trigger if exists tr_invoice_items_au_recompute on invoice_items;
create trigger tr_invoice_items_au_recompute
  after insert or update or delete on invoice_items
  for each row execute function fn_recompute_invoice_totals();
