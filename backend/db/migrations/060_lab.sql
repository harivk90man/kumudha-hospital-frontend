-- =====================================================================
-- 060_lab.sql
-- lab_tests, lab_test_panels, lab_orders, lab_order_items,
-- lab_samples, lab_results.
--
-- Spec: docs/03-schema/v2/modules/12-lab.html
-- TSD : docs/05-tsd/08-lab.md
--
-- NOTE: lab_orders.invoice_id has NO FK (billing module out of scope).
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- 1. lab_tests
-- ---------------------------------------------------------------------
create table if not exists lab_tests (
  id                   uuid          primary key default gen_random_uuid(),
  tenant_id            uuid          not null references tenants(id) on delete restrict,
  test_code            varchar(64)   not null,
  test_name            varchar(200)  not null,
  category             varchar(32)   not null,
  sample_type          varchar(64)   not null,
  sample_volume_ml     numeric(4,1),
  department_id        uuid          references departments(id) on delete set null,
  default_price        numeric(10,2) not null,
  normal_range_male    varchar(120),
  normal_range_female  varchar(120),
  ref_min_male         numeric(12,4),
  ref_max_male         numeric(12,4),
  ref_min_female       numeric(12,4),
  ref_max_female       numeric(12,4),
  critical_low         numeric(12,4),
  critical_high        numeric(12,4),
  unit                 varchar(32),
  tat_hours            int,
  result_type          varchar(32)   not null default 'numeric',
  requires_fasting     boolean       not null default false,
  is_active            boolean       not null default true,
  created_by           uuid          references users(id) on delete set null,
  created_at           timestamptz   not null default now(),
  updated_by           uuid          references users(id) on delete set null,
  updated_at           timestamptz   not null default now(),
  version              int           not null default 0,
  constraint chk_lab_tests_category check (
    category in ('hematology','biochemistry','microbiology','serology','pathology','endocrinology','immunology')
  ),
  constraint chk_lab_tests_result_type check (
    result_type in ('numeric','positive_negative','reactive_nonreactive','grade','free_text','image')
  ),
  constraint uq_lab_tests_code unique (tenant_id, test_code)
);
comment on table lab_tests is
  'Test catalog — code, name, category, sample type, reference ranges (gendered), critical thresholds.';

create index if not exists idx_lab_tests_category
  on lab_tests(tenant_id, category, is_active);

drop trigger if exists trg_lab_tests_updated_at on lab_tests;
create trigger trg_lab_tests_updated_at
  before update on lab_tests
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------
-- 2. lab_test_panels
-- ---------------------------------------------------------------------
create table if not exists lab_test_panels (
  id              uuid          primary key default gen_random_uuid(),
  tenant_id       uuid          not null references tenants(id) on delete restrict,
  panel_code      varchar(64)   not null,
  panel_name      varchar(200)  not null,
  test_ids        uuid[]        not null default '{}',
  package_price   numeric(10,2) not null,
  description     text,
  is_active       boolean       not null default true,
  created_by      uuid          references users(id) on delete set null,
  created_at      timestamptz   not null default now(),
  updated_by      uuid          references users(id) on delete set null,
  updated_at      timestamptz   not null default now(),
  version         int           not null default 0,
  constraint uq_lab_test_panels_code unique (tenant_id, panel_code)
);
comment on table lab_test_panels is
  'Bundled test groups (CBC, LFT, Diabetes Panel) priced as a package. GIN index on test_ids.';

create index if not exists idx_lab_test_panels_test_ids
  on lab_test_panels using gin (test_ids);

drop trigger if exists trg_lab_test_panels_updated_at on lab_test_panels;
create trigger trg_lab_test_panels_updated_at
  before update on lab_test_panels
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------
-- 3. lab_orders
-- ---------------------------------------------------------------------
create table if not exists lab_orders (
  id                                uuid         primary key default gen_random_uuid(),
  tenant_id                         uuid         not null references tenants(id) on delete restrict,
  order_number                      varchar(32)  not null unique,
  patient_id                        uuid         not null references patients(id) on delete restrict,
  op_visit_id                       uuid         references op_visits(id) on delete set null,
  ip_admission_id                   uuid,                                       -- phase 2
  consultation_id                   uuid         references consultations(id) on delete set null,
  doctor_id                         uuid         not null references users(id) on delete restrict,
  priority                          varchar(16)  not null default 'routine',
  invoice_id                        uuid,                                       -- billing module out of scope
  payment_required_before_service   boolean      not null default true,
  status                            varchar(32)  not null default 'ordered',
  ordered_at                        timestamptz  not null default now(),
  completed_at                      timestamptz,
  created_by                        uuid         references users(id) on delete set null,
  created_at                        timestamptz  not null default now(),
  updated_by                        uuid         references users(id) on delete set null,
  updated_at                        timestamptz  not null default now(),
  version                           int          not null default 0,
  constraint chk_lab_orders_priority check (priority in ('routine','urgent','stat')),
  constraint chk_lab_orders_status check (
    status in ('ordered','awaiting_payment','paid','sample_collection','sample_collected',
               'in_progress','partially_reported','reported','released','cancelled')
  )
);
comment on table lab_orders is
  'Test order header — patient, doctor, priority, payment gate, lifecycle status.';

create index if not exists idx_lab_orders_patient
  on lab_orders(tenant_id, patient_id, ordered_at desc);
create index if not exists idx_lab_orders_worklist
  on lab_orders(tenant_id, status, priority, ordered_at);
create index if not exists idx_lab_orders_consultation
  on lab_orders(consultation_id);

drop trigger if exists trg_lab_orders_updated_at on lab_orders;
create trigger trg_lab_orders_updated_at
  before update on lab_orders
  for each row execute function fn_set_updated_at();

-- Back-fill: doctor_recommendations.lab_order_id FK
alter table doctor_recommendations
  add constraint fk_doctor_rec_lab_order
  foreign key (lab_order_id) references lab_orders(id) on delete set null;

-- ---------------------------------------------------------------------
-- 4. lab_samples  (created BEFORE lab_order_items because items FK samples)
-- ---------------------------------------------------------------------
create table if not exists lab_samples (
  id                     uuid         primary key default gen_random_uuid(),
  tenant_id              uuid         not null references tenants(id) on delete restrict,
  sample_barcode         varchar(64)  not null unique,
  patient_id             uuid         not null references patients(id) on delete restrict,
  lab_order_id           uuid         not null references lab_orders(id) on delete restrict,
  sample_type            varchar(64)  not null,
  status                 varchar(32)  not null default 'collected',
  collected_by           uuid         not null references users(id) on delete restrict,
  collected_at           timestamptz  not null default now(),
  received_by            uuid         references users(id) on delete set null,
  received_at            timestamptz,
  rejected_at            timestamptz,
  rejected_by            uuid         references users(id) on delete set null,
  rejection_reason       text,
  replaces_sample_id     uuid         references lab_samples(id) on delete set null,
  disposed_at            timestamptz,
  notes                  text,
  constraint chk_lab_samples_status check (
    status in ('collected','received','rejected','processing','processed','disposed')
  ),
  constraint chk_lab_samples_rejection
    check ((status = 'rejected') = (rejection_reason is not null))
);
comment on table lab_samples is
  'Physical sample tracking — barcode, type, status (collected→received→processed). Recollection chain via replaces_sample_id.';

create index if not exists idx_lab_samples_order
  on lab_samples(tenant_id, lab_order_id);
create index if not exists idx_lab_samples_worklist
  on lab_samples(tenant_id, status, collected_at);
create index if not exists idx_lab_samples_replaces
  on lab_samples(replaces_sample_id) where replaces_sample_id is not null;

-- ---------------------------------------------------------------------
-- 5. lab_order_items  (created BEFORE lab_results since results FK items)
-- ---------------------------------------------------------------------
create table if not exists lab_order_items (
  id            uuid         primary key default gen_random_uuid(),
  lab_order_id  uuid         not null references lab_orders(id) on delete cascade,
  lab_test_id   uuid         not null references lab_tests(id) on delete restrict,
  panel_id      uuid         references lab_test_panels(id) on delete set null,
  sample_id     uuid         references lab_samples(id) on delete set null,
  result_id     uuid,                                  -- FK added after lab_results below
  status        varchar(32)  not null default 'pending',
  sequence_no   int          not null default 1,
  constraint chk_lab_order_items_status check (
    status in ('pending','sample_collected','rejected','recollection_pending','in_progress',
               'reported','verified','released','cancelled')
  ),
  constraint uq_lab_order_items unique (lab_order_id, lab_test_id)
);
comment on table lab_order_items is
  'One test per row inside an order. Each links to its sample and result.';

create index if not exists idx_lab_order_items_sample
  on lab_order_items(sample_id) where sample_id is not null;
create index if not exists idx_lab_order_items_status
  on lab_order_items(status, lab_order_id);

-- ---------------------------------------------------------------------
-- 6. lab_results
-- ---------------------------------------------------------------------
create table if not exists lab_results (
  id                          uuid         primary key default gen_random_uuid(),
  tenant_id                   uuid         not null references tenants(id) on delete restrict,
  lab_order_item_id           uuid         not null unique references lab_order_items(id) on delete restrict,
  value                       varchar(120) not null,
  value_numeric               numeric(12,4),
  value_text                  varchar(120),
  unit                        varchar(32),
  flag                        varchar(16)  not null default 'normal',
  method                      varchar(120),
  comments                    text,
  report_pdf_url              text,
  report_attachment_id        uuid         references file_attachments(id) on delete set null,
  release_status              varchar(32)  not null default 'pending_verification',
  is_override_release         boolean      not null default false,
  override_release_reason     text,
  amended_from_result_id      uuid         references lab_results(id) on delete set null,
  approval_status             varchar(16)  not null default 'pending',
  approved_by                 uuid         references users(id) on delete set null,
  approved_at                 timestamptz,
  rejection_reason            text,
  performed_by                uuid         not null references users(id) on delete restrict,
  verified_by                 uuid         references users(id) on delete set null,
  verified_at                 timestamptz,
  reported_at                 timestamptz  not null default now(),
  created_by                  uuid         references users(id) on delete set null,
  created_at                  timestamptz  not null default now(),
  updated_by                  uuid         references users(id) on delete set null,
  updated_at                  timestamptz  not null default now(),
  version                     int          not null default 0,
  constraint chk_lab_results_flag check (
    flag in ('normal','high','low','critical_high','critical_low')
  ),
  constraint chk_lab_results_release_status check (
    release_status in ('pending_verification','verified','override_released','amended','rejected')
  ),
  constraint chk_lab_results_approval_status check (
    approval_status in ('pending','approved','rejected')
  ),
  constraint chk_lab_results_override_reason check (
    is_override_release = false
    or (override_release_reason is not null and length(override_release_reason) > 10)
  ),
  constraint chk_lab_results_verified_when_released check (
    (release_status in ('verified','override_released')) = (verified_by is not null)
  )
  -- NOTE: separation-of-duties CHECK (created_by <> verified_by) intentionally
  -- omitted at DB level — single-tech tenants would be blocked. Enforced by app.
);
comment on table lab_results is
  'Per-test result — value, unit, flag (auto-set), method, verifier. Layer 2 maker-checker.';

create index if not exists idx_lab_results_pending_verification
  on lab_results(tenant_id, release_status, reported_at desc)
  where release_status = 'pending_verification';
create index if not exists idx_lab_results_critical
  on lab_results(tenant_id, flag, release_status)
  where flag in ('critical_high','critical_low');
create index if not exists idx_lab_results_performed
  on lab_results(tenant_id, reported_at desc);

drop trigger if exists trg_lab_results_updated_at on lab_results;
create trigger trg_lab_results_updated_at
  before update on lab_results
  for each row execute function fn_set_updated_at();

-- Back-fill lab_order_items.result_id FK
alter table lab_order_items
  add constraint fk_lab_order_items_result
  foreign key (result_id) references lab_results(id) on delete set null;

-- ---------------------------------------------------------------------
-- fn_autoflag_lab_result  (BEFORE INSERT)
-- Sets flag from value_numeric against the constituent lab_tests reference
-- ranges. Gender-aware via patients.gender. Critical thresholds override
-- normal ranges.
-- ---------------------------------------------------------------------
create or replace function fn_autoflag_lab_result() returns trigger
language plpgsql
as $$
declare
  v_test         record;
  v_gender       varchar(1);
  v_ref_min      numeric(12,4);
  v_ref_max      numeric(12,4);
  v_crit_low     numeric(12,4);
  v_crit_high    numeric(12,4);
begin
  if new.value_numeric is null then
    -- Non-numeric results stay at the explicit/default flag value.
    return new;
  end if;

  select t.ref_min_male, t.ref_max_male, t.ref_min_female, t.ref_max_female,
         t.critical_low, t.critical_high,
         p.gender
    into v_test
    from lab_order_items oi
    join lab_tests       t on t.id = oi.lab_test_id
    join lab_orders      lo on lo.id = oi.lab_order_id
    join patients        p  on p.id = lo.patient_id
   where oi.id = new.lab_order_item_id;

  if v_test is null then
    return new;
  end if;

  v_gender    := v_test.gender;
  v_crit_low  := v_test.critical_low;
  v_crit_high := v_test.critical_high;

  if v_gender = 'F' then
    v_ref_min := v_test.ref_min_female;
    v_ref_max := v_test.ref_max_female;
  else
    v_ref_min := v_test.ref_min_male;
    v_ref_max := v_test.ref_max_male;
  end if;

  -- Critical thresholds win over normal/high/low.
  if v_crit_low is not null and new.value_numeric < v_crit_low then
    new.flag := 'critical_low';
  elsif v_crit_high is not null and new.value_numeric > v_crit_high then
    new.flag := 'critical_high';
  elsif v_ref_min is not null and new.value_numeric < v_ref_min then
    new.flag := 'low';
  elsif v_ref_max is not null and new.value_numeric > v_ref_max then
    new.flag := 'high';
  else
    new.flag := 'normal';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_lab_results_autoflag on lab_results;
create trigger trg_lab_results_autoflag
  before insert on lab_results
  for each row execute function fn_autoflag_lab_result();

-- ---------------------------------------------------------------------
-- fn_critical_lab_alert  (AFTER INSERT)
-- Creates a notifications row when flag is critical_high/critical_low.
-- ---------------------------------------------------------------------
create or replace function fn_critical_lab_alert() returns trigger
language plpgsql
as $$
declare
  v_doctor_id  uuid;
  v_patient_id uuid;
  v_test_name  varchar(200);
begin
  if new.flag not in ('critical_high','critical_low') then
    return null;
  end if;

  select lo.doctor_id, lo.patient_id, t.test_name
    into v_doctor_id, v_patient_id, v_test_name
    from lab_order_items oi
    join lab_orders      lo on lo.id = oi.lab_order_id
    join lab_tests       t  on t.id = oi.lab_test_id
   where oi.id = new.lab_order_item_id;

  insert into notifications
    (user_id, type, title, body, link, priority, ack_required, ack_sla_minutes)
  values
    (v_doctor_id,
     'lab_result_critical',
     'CRITICAL lab value: ' || coalesce(v_test_name, 'Unknown test'),
     'A critical ' || new.flag || ' result has been recorded. Please review immediately.',
     '/doctor/lab-results/' || new.id::text,
     'urgent',
     true,
     30);

  -- Also fire a domain event for downstream subscribers.
  insert into domain_events (tenant_id, aggregate_type, aggregate_id, event_type, payload)
  values (new.tenant_id, 'lab_result', new.id, 'LabResultCriticallyAbnormal',
          jsonb_build_object('flag', new.flag,
                             'lab_order_item_id', new.lab_order_item_id,
                             'doctor_id', v_doctor_id,
                             'patient_id', v_patient_id));
  return null;
end;
$$;

drop trigger if exists trg_lab_results_critical_alert on lab_results;
create trigger trg_lab_results_critical_alert
  after insert on lab_results
  for each row execute function fn_critical_lab_alert();

-- ---------------------------------------------------------------------
-- fn_lab_release_event  (AFTER UPDATE OF release_status)
-- Emits a LabResultReleased domain event when status moves to released.
-- ---------------------------------------------------------------------
create or replace function fn_lab_release_event() returns trigger
language plpgsql
as $$
begin
  if new.release_status in ('verified','override_released')
     and old.release_status is distinct from new.release_status
  then
    insert into domain_events
      (tenant_id, aggregate_type, aggregate_id, event_type, payload)
    values
      (new.tenant_id, 'lab_result', new.id, 'LabResultReleased',
       jsonb_build_object('release_status', new.release_status,
                          'is_override_release', new.is_override_release,
                          'lab_order_item_id', new.lab_order_item_id));
  end if;
  return null;
end;
$$;

drop trigger if exists trg_lab_results_release_event on lab_results;
create trigger trg_lab_results_release_event
  after update of release_status on lab_results
  for each row execute function fn_lab_release_event();
