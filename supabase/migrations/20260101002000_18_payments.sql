-- =====================================================================
-- 052_18_payments.sql
-- Module 18 — Payments & Cash
-- Tables: payments, payment_allocations, cash_counters, cash_sessions,
--         cash_counter_handovers
--
-- Cross-module FKs deferred to 099_cross_module_fks.sql:
--   * payments.pharmacy_return_id           → pharmacy_returns(id)   — Module 15
--   * payment_allocations.pharmacy_sale_id  → pharmacy_sales(id)     — Module 15
--   * payment_allocations.ip_admission_id   → ip_admissions(id)      — Phase 2
--
-- cash_sessions.id is referenced BY pharmacy_sales.cash_session_id and
-- pharmacy_returns.cash_session_id — those downstream FKs wired in 099.
--
-- Note: payment_attempts and payees are NOT created here (deferred / dropped
-- from v3 per CONVENTIONS). Idempotency on payments uses payments.idempotency_key
-- directly for Phase 1.
-- Spec: docs/03-schema/v3/modules/18-payments.html
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- cash_counters
-- ---------------------------------------------------------------------
create table if not exists cash_counters (
  id            uuid         primary key default uuidv7(),
  counter_code  text         not null,
  counter_name  text         not null,
  location      text,
  -- uniform block
  created_by    uuid         not null references users(id) on delete set null,
  created_at    timestamptz  not null default now(),
  updated_by    uuid         references users(id) on delete set null,
  updated_at    timestamptz  not null default now(),
  version       int          not null default 0,
  deleted_at    timestamptz,
  deleted_by    uuid         references users(id) on delete set null,
  constraint chk_cash_counters_code_len check (char_length(counter_code) between 2 and 10)
);

comment on table cash_counters is 'Physical cash counter registry — front desk, pharmacy counter, IP billing, and any other collection point. Each counter can run one or more sessions. Soft-delete preserves historical session references when a counter is decommissioned.';

create unique index if not exists uq_cash_counters_code   on cash_counters (counter_code) where deleted_at is null;
create index        if not exists ix_cash_counters_active on cash_counters (counter_name) where deleted_at is null;

drop trigger if exists tr_cash_counters_bu_touch on cash_counters;
create trigger tr_cash_counters_bu_touch
  before update on cash_counters
  for each row execute function fn_touch_updated();

drop trigger if exists tr_cash_counters_au_audit on cash_counters;
create trigger tr_cash_counters_au_audit
  after insert or update or delete on cash_counters
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- cash_sessions  (self-FK on previous_session_id)
-- ---------------------------------------------------------------------
create table if not exists cash_sessions (
  id                        uuid          primary key default uuidv7(),
  counter_id                uuid          not null references cash_counters(id) on delete restrict,
  session_number            text          not null,
  session_label             text          not null,
  business_date             date          not null,
  opened_by                 uuid          not null references users(id) on delete restrict,
  opened_at                 timestamptz   not null default now(),
  closed_by                 uuid          references users(id) on delete restrict,
  closed_at                 timestamptz,
  status                    text          not null default 'open',
  opening_float             numeric(14,2) not null default 0,
  expected_cash             numeric(14,2),
  counted_cash              numeric(14,2),
  variance                  numeric(14,2) generated always as (counted_cash - expected_cash) stored,
  variance_reason           text,
  denomination_breakdown    jsonb,
  closure_notes             text,
  previous_session_id       uuid          references cash_sessions(id) on delete restrict,
  opening_variance_reason   text,
  -- uniform block
  created_by                uuid          not null references users(id) on delete set null,
  created_at                timestamptz   not null default now(),
  updated_by                uuid          references users(id) on delete set null,
  updated_at                timestamptz   not null default now(),
  version                   int           not null default 0,
  deleted_at                timestamptz,
  deleted_by                uuid          references users(id) on delete set null,
  constraint chk_cash_sessions_number_len           check (char_length(session_number) between 5 and 30),
  constraint chk_cash_sessions_label                check (session_label in ('morning','evening','night','full_day','custom')),
  constraint chk_cash_sessions_status               check (status in ('open','closed','reopened','locked')),
  constraint chk_cash_sessions_float                check (opening_float >= 0),
  constraint chk_cash_sessions_closed_at_consistency check ((status in ('closed','locked')) = (closed_at is not null)),
  constraint chk_cash_sessions_variance_reason      check ((variance is null or variance = 0) or (variance_reason is not null))
);

comment on table cash_sessions is 'Cashier shift open/close cycle — the unit of daily cash reconciliation. One open session per counter and one per cashier enforced by partial unique indexes. previous_session_id forms a custody chain at each counter. variance is generated; locked state set by nightly batch.';

create unique index if not exists uq_cash_sessions_number          on cash_sessions (session_number);
create unique index if not exists uq_cash_sessions_cashier_active  on cash_sessions (opened_by) where status = 'open';
create unique index if not exists uq_cash_sessions_counter_active  on cash_sessions (counter_id) where status = 'open';
create index        if not exists ix_cash_sessions_counter_date    on cash_sessions (counter_id, business_date desc);
create index        if not exists ix_cash_sessions_opened_by       on cash_sessions (opened_by, business_date desc);
create index        if not exists ix_cash_sessions_status          on cash_sessions (status, business_date desc) where deleted_at is null;
create index        if not exists ix_cash_sessions_previous        on cash_sessions (previous_session_id) where previous_session_id is not null;

drop trigger if exists tr_cash_sessions_bu_touch on cash_sessions;
create trigger tr_cash_sessions_bu_touch
  before update on cash_sessions
  for each row execute function fn_touch_updated();

drop trigger if exists tr_cash_sessions_au_audit on cash_sessions;
create trigger tr_cash_sessions_au_audit
  after insert or update or delete on cash_sessions
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------
create table if not exists payments (
  id                  uuid          primary key default uuidv7(),
  patient_id          uuid          references patients(id) on delete restrict,
  walk_in_name        text,
  walk_in_mobile      text,
  payment_direction   text          not null,
  payment_mode        text          not null,
  amount              numeric(14,2) not null,
  transaction_ref     text,
  received_by         uuid          not null references users(id) on delete restrict,
  cash_session_id     uuid          not null references cash_sessions(id) on delete restrict,
  idempotency_key     uuid,
  pharmacy_return_id  uuid,                                                          -- FK to pharmacy_returns(id) deferred to 099 (Module 15)
  notes               text,
  -- uniform block
  created_by          uuid          not null references users(id) on delete set null,
  created_at          timestamptz   not null default now(),
  updated_by          uuid          references users(id) on delete set null,
  updated_at          timestamptz   not null default now(),
  version             int           not null default 0,
  deleted_at          timestamptz,
  deleted_by          uuid          references users(id) on delete set null,
  constraint chk_payments_direction          check (payment_direction in ('in','out')),
  constraint chk_payments_mode               check (payment_mode in ('cash','card','upi','cheque','net_banking','other')),
  constraint chk_payments_amount             check (amount > 0),
  constraint chk_payments_walk_in_mobile_len check (walk_in_mobile is null or char_length(walk_in_mobile) between 10 and 15),
  constraint chk_payments_has_identity       check (patient_id is not null or walk_in_name is not null),
  constraint chk_payments_not_both_identity  check (patient_id is null or walk_in_name is null),
  constraint chk_payments_pharmacy_return    check (pharmacy_return_id is null or payment_direction = 'out')
);

comment on table payments is 'One row per confirmed money movement — collection (direction=in) or refund/payout (direction=out). Amount always positive; sign captured in payment_direction. Every payment belongs to a cash session. patient_id for registered patients, walk_in_name for OTC walk-ins — exactly one non-null.';

create unique index if not exists uq_payments_idempotency    on payments (idempotency_key) where idempotency_key is not null;
create index        if not exists ix_payments_patient        on payments (patient_id, created_at desc) where patient_id is not null and deleted_at is null;
create index        if not exists ix_payments_session        on payments (cash_session_id, created_at desc);
create index        if not exists ix_payments_direction_date on payments (payment_direction, created_at desc) where deleted_at is null;
create index        if not exists ix_payments_mode           on payments (payment_mode, created_at desc) where deleted_at is null;

drop trigger if exists tr_payments_bu_touch on payments;
create trigger tr_payments_bu_touch
  before update on payments
  for each row execute function fn_touch_updated();

drop trigger if exists tr_payments_au_audit on payments;
create trigger tr_payments_au_audit
  after insert or update or delete on payments
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- payment_allocations  (append-only; corrections via reversal rows)
-- ---------------------------------------------------------------------
create table if not exists payment_allocations (
  id                uuid          primary key default uuidv7(),
  payment_id        uuid          not null references payments(id) on delete restrict,
  allocation_type   text          not null,
  invoice_id        uuid          references invoices(id) on delete restrict,
  pharmacy_sale_id  uuid,                                                          -- FK to pharmacy_sales(id) deferred to 099 (Module 15)
  ip_admission_id   uuid,                                                          -- FK to ip_admissions(id) deferred (Phase 2)
  amount            numeric(14,2) not null,
  notes             text,
  -- uniform block (cosmetic — append-only guard blocks UPDATE/DELETE)
  created_by        uuid          not null references users(id) on delete set null,
  created_at        timestamptz   not null default now(),
  updated_by        uuid          references users(id) on delete set null,
  updated_at        timestamptz   not null default now(),
  version           int           not null default 0,
  deleted_at        timestamptz,
  deleted_by        uuid          references users(id) on delete set null,
  constraint chk_payment_allocations_type        check (allocation_type in ('invoice','pharmacy_sale','ip_advance','refund','on_account')),
  constraint chk_payment_allocations_amount      check (amount > 0),
  constraint chk_payment_allocations_max_one_fk  check (num_nonnulls(invoice_id, pharmacy_sale_id, ip_admission_id) <= 1),
  constraint chk_payment_allocations_invoice_fk  check ((allocation_type = 'invoice')       = (invoice_id is not null)),
  constraint chk_payment_allocations_pharmacy_fk check ((allocation_type = 'pharmacy_sale') = (pharmacy_sale_id is not null)),
  constraint chk_payment_allocations_on_account  check ((allocation_type = 'on_account')    = (num_nonnulls(invoice_id, pharmacy_sale_id, ip_admission_id) = 0))
);

comment on table payment_allocations is 'Splits one payment across multiple invoices, pharmacy sales, or IP admissions. allocation_type drives which FK column is set. Append-only — corrections via reversal allocation rows. fn_update_invoice_paid_amount fires on INSERT to keep invoices.amount_paid in sync.';

create index if not exists ix_payment_allocations_payment       on payment_allocations (payment_id);
create index if not exists ix_payment_allocations_invoice       on payment_allocations (invoice_id)       where invoice_id is not null;
create index if not exists ix_payment_allocations_pharmacy_sale on payment_allocations (pharmacy_sale_id) where pharmacy_sale_id is not null;

drop trigger if exists tr_payment_allocations_bu_block on payment_allocations;
create trigger tr_payment_allocations_bu_block
  before update on payment_allocations
  for each row execute function fn_append_only_guard();

drop trigger if exists tr_payment_allocations_bd_block on payment_allocations;
create trigger tr_payment_allocations_bd_block
  before delete on payment_allocations
  for each row execute function fn_append_only_guard();

drop trigger if exists tr_payment_allocations_au_audit on payment_allocations;
create trigger tr_payment_allocations_au_audit
  after insert on payment_allocations
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- fn_update_invoice_paid_amount — keeps invoices.amount_paid +
-- payment_status consistent via SUM recompute on every allocation INSERT.
-- ---------------------------------------------------------------------
create or replace function fn_update_invoice_paid_amount()
returns trigger
language plpgsql
as $$
declare
  v_paid numeric(14,2);
begin
  if new.invoice_id is null then
    return new;
  end if;

  select coalesce(sum(amount), 0)
    into v_paid
    from payment_allocations
   where invoice_id = new.invoice_id
     and deleted_at is null;

  update invoices
     set amount_paid    = v_paid,
         payment_status = case
             when v_paid = 0             then 'draft'
             when v_paid < total_amount  then 'partially_paid'
             else                             'paid'
         end
   where id = new.invoice_id;

  return new;
end
$$;

drop trigger if exists tr_payment_allocations_ai_invoice_paid on payment_allocations;
create trigger tr_payment_allocations_ai_invoice_paid
  after insert on payment_allocations
  for each row execute function fn_update_invoice_paid_amount();

-- ---------------------------------------------------------------------
-- cash_counter_handovers  (append-only — API dropped but table retained)
-- ---------------------------------------------------------------------
create table if not exists cash_counter_handovers (
  id                    uuid          primary key default uuidv7(),
  outgoing_session_id   uuid          not null references cash_sessions(id) on delete restrict,
  incoming_session_id   uuid          not null references cash_sessions(id) on delete restrict,
  amount                numeric(14,2) not null,
  handed_over_by        uuid          not null references users(id) on delete restrict,
  received_by           uuid          not null references users(id) on delete restrict,
  notes                 text,
  -- uniform block (cosmetic — append-only guard blocks UPDATE/DELETE)
  created_by            uuid          not null references users(id) on delete set null,
  created_at            timestamptz   not null default now(),
  updated_by            uuid          references users(id) on delete set null,
  updated_at            timestamptz   not null default now(),
  version               int           not null default 0,
  deleted_at            timestamptz,
  deleted_by            uuid          references users(id) on delete set null,
  constraint chk_cash_counter_handovers_amount         check (amount >= 0),
  constraint chk_cash_counter_handovers_sod            check (handed_over_by <> received_by),
  constraint chk_cash_counter_handovers_diff_sessions  check (outgoing_session_id <> incoming_session_id)
);

comment on table cash_counter_handovers is 'Outgoing cashier → incoming cashier cash handover. API endpoint dropped — table retained for historical rows and potential future reporting. Replaced operationally by independent open + close on cash_sessions with previous_session_id custody chain. Append-only.';

create index if not exists ix_cash_counter_handovers_outgoing       on cash_counter_handovers (outgoing_session_id);
create index if not exists ix_cash_counter_handovers_incoming       on cash_counter_handovers (incoming_session_id);
create index if not exists ix_cash_counter_handovers_handed_over_by on cash_counter_handovers (handed_over_by, created_at desc);

drop trigger if exists tr_cash_counter_handovers_bu_block on cash_counter_handovers;
create trigger tr_cash_counter_handovers_bu_block
  before update on cash_counter_handovers
  for each row execute function fn_append_only_guard();

drop trigger if exists tr_cash_counter_handovers_bd_block on cash_counter_handovers;
create trigger tr_cash_counter_handovers_bd_block
  before delete on cash_counter_handovers
  for each row execute function fn_append_only_guard();

drop trigger if exists tr_cash_counter_handovers_au_audit on cash_counter_handovers;
create trigger tr_cash_counter_handovers_au_audit
  after insert on cash_counter_handovers
  for each row execute function fn_audit_row();
