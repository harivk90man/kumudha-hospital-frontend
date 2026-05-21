-- =====================================================================
-- 050_16_pricing.sql
-- Module 16 — Pricing
-- Tables: services, service_price_history (append-only)
--
-- services.id is referenced BY lab_tests, lab_test_groups,
-- radiology_procedures, medicines, invoice_items — those reverse FKs
-- are wired in 099_cross_module_fks.sql. No reverse FKs added here.
-- Spec: docs/03-schema/v3/modules/16-pricing.html
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- services
-- ---------------------------------------------------------------------
create table if not exists services (
  id                uuid          primary key default uuidv7(),
  service_code      text          not null,
  service_name      text          not null,
  service_type      text          not null,
  department_id     uuid          references departments(id) on delete restrict,
  default_price     numeric(14,2) not null,
  is_taxable        boolean       not null default false,
  default_gst_pct   numeric(4,2)  not null default 0.00,
  sac_code          text,
  description       text,
  -- uniform block
  created_by        uuid          not null references users(id) on delete set null,
  created_at        timestamptz   not null default now(),
  updated_by        uuid          references users(id) on delete set null,
  updated_at        timestamptz   not null default now(),
  version           int           not null default 0,
  deleted_at        timestamptz,
  deleted_by        uuid          references users(id) on delete set null,
  constraint chk_services_code_len check (char_length(service_code) between 2 and 60),
  constraint chk_services_type     check (service_type in ('lab_test','lab_panel','radiology','medicine','procedure','room_charge','nursing','consumable','ambulance','other')),
  constraint chk_services_price    check (default_price >= 0),
  constraint chk_services_gst      check (default_gst_pct >= 0)
);

comment on table services is 'Master price list for every billable item except doctor consultation fees (those live on doctor_profiles). lab_tests, radiology_procedures, medicines reference this table via service_id — billing always resolves price from one place. Price changes auto-insert into service_price_history via trigger.';

create unique index if not exists uq_services_code       on services (service_code) where deleted_at is null;
create index        if not exists ix_services_type       on services (service_type) where deleted_at is null;
create index        if not exists ix_services_department on services (department_id) where department_id is not null and deleted_at is null;

drop trigger if exists tr_services_bu_touch on services;
create trigger tr_services_bu_touch
  before update on services
  for each row execute function fn_touch_updated();

drop trigger if exists tr_services_au_audit on services;
create trigger tr_services_au_audit
  after insert or update or delete on services
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- service_price_history  (append-only — populated by trigger on services)
-- ---------------------------------------------------------------------
create table if not exists service_price_history (
  id                uuid          primary key default uuidv7(),
  service_id        uuid          not null references services(id) on delete restrict,
  price             numeric(14,2) not null,
  effective_from    date          not null,
  effective_to      date,
  changed_by        uuid          references users(id) on delete set null,
  reason            text,
  -- uniform block (cosmetic — append-only guard blocks all DELETE and most UPDATE)
  created_by        uuid          references users(id) on delete set null,
  created_at        timestamptz   not null default now(),
  updated_by        uuid          references users(id) on delete set null,
  updated_at        timestamptz   not null default now(),
  version           int           not null default 0,
  deleted_at        timestamptz,
  deleted_by        uuid          references users(id) on delete set null,
  constraint chk_service_price_history_price  check (price >= 0),
  constraint chk_service_price_history_period check (effective_to is null or effective_to > effective_from)
);

comment on table service_price_history is 'Closed-period audit of every price change on services. Populated entirely by the trigger tr_services_au_price_history — no app code writes here. Append-only: DELETE blocked, UPDATE blocked except setting effective_to on the currently-open row.';

create unique index if not exists uq_service_price_history_active  on service_price_history (service_id) where effective_to is null;
create index        if not exists ix_service_price_history_service on service_price_history (service_id, effective_from desc);

-- Append-only guards — block DELETE outright; UPDATE handled by a
-- specialised guard that allows only effective_to to be set on the
-- currently-open row (effective_to was NULL and becomes non-NULL).
create or replace function fn_service_price_history_update_guard()
returns trigger
language plpgsql
as $$
begin
  -- Permit only setting effective_to from NULL → a date on the open row.
  if old.effective_to is null
     and new.effective_to is not null
     and new.id              is not distinct from old.id
     and new.service_id      is not distinct from old.service_id
     and new.price           is not distinct from old.price
     and new.effective_from  is not distinct from old.effective_from
     and new.changed_by      is not distinct from old.changed_by
     and new.reason          is not distinct from old.reason
  then
    return new;
  end if;
  raise exception 'service_price_history rows are append-only — only effective_to may be set on the open row'
    using errcode = '42501';
end
$$;

drop trigger if exists tr_service_price_history_bu_guard on service_price_history;
create trigger tr_service_price_history_bu_guard
  before update on service_price_history
  for each row execute function fn_service_price_history_update_guard();

drop trigger if exists tr_service_price_history_bd_guard on service_price_history;
create trigger tr_service_price_history_bd_guard
  before delete on service_price_history
  for each row execute function fn_append_only_guard();

drop trigger if exists tr_service_price_history_au_audit on service_price_history;
create trigger tr_service_price_history_au_audit
  after insert or update on service_price_history
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- tr_services_au_price_history — fires when services.default_price changes.
-- Closes prior open row's effective_to and inserts the new open row.
-- ---------------------------------------------------------------------
create or replace function fn_services_price_history()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into service_price_history
      (service_id, price, effective_from, changed_by, reason, created_by)
    values
      (new.id, new.default_price, current_date, new.created_by, 'Initial price', new.created_by);
    return new;
  end if;

  if tg_op = 'UPDATE' and new.default_price is distinct from old.default_price then
    -- Close out the currently-open row.
    update service_price_history
       set effective_to = current_date
     where service_id = new.id
       and effective_to is null;

    -- Insert the new open row.
    insert into service_price_history
      (service_id, price, effective_from, changed_by, reason, created_by)
    values
      (new.id, new.default_price, current_date, new.updated_by, null, new.updated_by);
  end if;

  return new;
end
$$;

drop trigger if exists tr_services_au_price_history on services;
create trigger tr_services_au_price_history
  after insert or update of default_price on services
  for each row execute function fn_services_price_history();
