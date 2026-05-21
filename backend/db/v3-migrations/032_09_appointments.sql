-- =====================================================================
-- 032_09_appointments.sql
-- Module 09 — Appointments
-- Tables: appointments, appointment_slots, tokens
--
-- Cross-module FKs (to op_visits, lab_orders, radiology_orders,
-- pharmacy_sales, invoices) are added in 099_cross_module_fks.sql
-- after the downstream tables exist.
-- Spec: docs/03-schema/v3/modules/09-appointments.html
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- appointment_slots
-- ---------------------------------------------------------------------
create table if not exists appointment_slots (
  id                uuid         primary key default uuidv7(),
  doctor_id         uuid         not null references users(id) on delete restrict,
  slot_start        timestamptz  not null,
  duration_mins     int          not null default 15,
  status            text         not null default 'available',
  booked_by         uuid         references users(id) on delete set null,
  blocked_reason    text,
  -- uniform block
  created_by        uuid         references users(id) on delete set null,
  created_at        timestamptz  not null default now(),
  updated_by        uuid         references users(id) on delete set null,
  updated_at        timestamptz  not null default now(),
  version           int          not null default 0,
  deleted_at        timestamptz,
  deleted_by        uuid         references users(id) on delete set null,
  constraint chk_appointment_slots_status   check (status in ('available','booked','blocked','cancelled')),
  constraint chk_appointment_slots_duration check (duration_mins > 0),
  constraint chk_appointment_slots_blocked  check (status = 'blocked' or blocked_reason is null)
);

comment on table appointment_slots is 'One row per time slot per doctor per day. Generated from doctor_profiles.available_days × slot_duration_mins for the next N days. FK target for appointments.slot_id.';

create unique index if not exists uq_appointment_slots_doctor_start on appointment_slots (doctor_id, slot_start);
create index        if not exists ix_appointment_slots_doctor       on appointment_slots (doctor_id, slot_start, status) where deleted_at is null;
create index        if not exists ix_appointment_slots_available    on appointment_slots (slot_start) where status = 'available' and deleted_at is null;

drop trigger if exists tr_appointment_slots_bu_touch on appointment_slots;
create trigger tr_appointment_slots_bu_touch
  before update on appointment_slots
  for each row execute function fn_touch_updated();

drop trigger if exists tr_appointment_slots_au_audit on appointment_slots;
create trigger tr_appointment_slots_au_audit
  after insert or update or delete on appointment_slots
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- appointments
-- ---------------------------------------------------------------------
create table if not exists appointments (
  id              uuid         primary key default uuidv7(),
  appointment_no  text         not null,
  patient_id      uuid         not null references patients(id) on delete restrict,
  doctor_id       uuid         not null references users(id) on delete restrict,
  slot_id         uuid         references appointment_slots(id) on delete restrict,
  scheduled_at    timestamptz  not null,
  visit_type      text         not null default 'new',
  status          text         not null default 'booked',
  source          text         not null,
  reason          text,
  cancelled_at    timestamptz,
  cancelled_by    uuid         references users(id) on delete set null,
  cancel_reason   text,
  -- uniform block
  created_by      uuid         references users(id) on delete set null,
  created_at      timestamptz  not null default now(),
  updated_by      uuid         references users(id) on delete set null,
  updated_at      timestamptz  not null default now(),
  version         int          not null default 0,
  deleted_at      timestamptz,
  deleted_by      uuid         references users(id) on delete set null,
  constraint chk_appointments_visit_type   check (visit_type in ('new','follow_up','emergency','procedure')),
  constraint chk_appointments_status       check (status in ('booked','confirmed','arrived','in_consultation','completed','cancelled','no_show')),
  constraint chk_appointments_source       check (source in ('walk_in','phone','online','referral')),
  constraint chk_appointments_cancellation check ((status = 'cancelled' and cancelled_at is not null) or (status <> 'cancelled' and cancelled_at is null))
);

comment on table appointments is 'Booked appointment. Pinned to a slot (slot_id) which is the source of truth for date and time; scheduled_at denormalises slot start for fast sorting. Channel + cancellation tracked.';

create unique index if not exists uq_appointments_no       on appointments (appointment_no) where deleted_at is null;
create unique index if not exists uq_appointments_slot     on appointments (slot_id)        where slot_id is not null and status not in ('cancelled','no_show');
create index        if not exists ix_appointments_patient  on appointments (patient_id, scheduled_at desc) where deleted_at is null;
create index        if not exists ix_appointments_doctor   on appointments (doctor_id,  scheduled_at desc) where deleted_at is null;
create index        if not exists ix_appointments_status   on appointments (status, scheduled_at)         where deleted_at is null;

drop trigger if exists tr_appointments_bu_touch on appointments;
create trigger tr_appointments_bu_touch
  before update on appointments
  for each row execute function fn_touch_updated();

drop trigger if exists tr_appointments_au_audit on appointments;
create trigger tr_appointments_au_audit
  after insert or update or delete on appointments
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- tokens  (cross-module FKs added in 099_cross_module_fks.sql)
-- ---------------------------------------------------------------------
create table if not exists tokens (
  id                  uuid         primary key default uuidv7(),
  token_number        text         not null,
  token_sequence      int          not null,
  service_type        text         not null,
  provider_id         uuid         references users(id) on delete set null,
  issue_date          date         not null,
  -- One of these is non-null depending on service_type (FKs in 099)
  op_visit_id         uuid,
  lab_order_id        uuid,
  radiology_order_id  uuid,
  pharmacy_sale_id    uuid,
  invoice_id          uuid,
  status              text         not null default 'active',
  issued_by           uuid         references users(id) on delete set null,
  called_at           timestamptz,
  completed_at        timestamptz,
  -- uniform block
  created_by          uuid         references users(id) on delete set null,
  created_at          timestamptz  not null default now(),
  updated_by          uuid         references users(id) on delete set null,
  updated_at          timestamptz  not null default now(),
  version             int          not null default 0,
  deleted_at          timestamptz,
  deleted_by          uuid         references users(id) on delete set null,
  constraint chk_tokens_service_type   check (service_type in ('consultation','lab','pharmacy','radiology','billing')),
  constraint chk_tokens_status         check (status in ('active','called','completed','cancelled','no_show')),
  constraint chk_tokens_sequence       check (token_sequence > 0),
  constraint chk_tokens_exactly_one_parent check (num_nonnulls(op_visit_id, lab_order_id, radiology_order_id, pharmacy_sale_id, invoice_id) = 1),
  constraint chk_tokens_consultation_fk    check ((service_type = 'consultation') = (op_visit_id        is not null)),
  constraint chk_tokens_lab_fk             check ((service_type = 'lab')          = (lab_order_id       is not null)),
  constraint chk_tokens_radiology_fk       check ((service_type = 'radiology')    = (radiology_order_id is not null)),
  constraint chk_tokens_pharmacy_fk        check ((service_type = 'pharmacy')     = (pharmacy_sale_id   is not null)),
  constraint chk_tokens_billing_fk         check ((service_type = 'billing')      = (invoice_id         is not null))
);

comment on table tokens is 'Visible queue identifier shown on display boards (D-04 / L-12 / P-08). One token per service request. Never reused — cancelled sequences stay cancelled for the day. FK columns to op_visits / lab_orders / radiology_orders / pharmacy_sales / invoices wired in 099_cross_module_fks.sql.';

create unique index if not exists uq_tokens_with_provider on tokens (service_type, provider_id, issue_date, token_sequence) where provider_id is not null;
create unique index if not exists uq_tokens_no_provider   on tokens (service_type, issue_date, token_sequence)              where provider_id is null;
create index        if not exists ix_tokens_op_visit      on tokens (op_visit_id)                                            where op_visit_id is not null;
create index        if not exists ix_tokens_live_queue    on tokens (service_type, provider_id, status, issue_date)          where status in ('active','called');

drop trigger if exists tr_tokens_bu_touch on tokens;
create trigger tr_tokens_bu_touch
  before update on tokens
  for each row execute function fn_touch_updated();

drop trigger if exists tr_tokens_au_audit on tokens;
create trigger tr_tokens_au_audit
  after insert or update or delete on tokens
  for each row execute function fn_audit_row();
