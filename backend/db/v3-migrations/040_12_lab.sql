-- =====================================================================
-- 040_12_lab.sql
-- Module 12 — Lab
-- Tables: lab_tests, lab_test_groups, lab_test_group_items, lab_orders,
--         lab_order_items, lab_samples, lab_results (L2 maker-checker)
--
-- Cross-module FKs deferred to 099_cross_module_fks.sql:
--   * lab_orders.invoice_id  → invoices(id) — Module 17 (051)
-- Spec: docs/03-schema/v3/modules/12-lab.html
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- lab_tests
-- ---------------------------------------------------------------------
create table if not exists lab_tests (
  id                       uuid         primary key default uuidv7(),
  test_code                text         not null,
  test_name                text         not null,
  category                 text         not null,
  sample_type              text         not null,
  sample_volume_ml         numeric(4,1),
  department_id            uuid         references departments(id) on delete restrict,
  service_id               uuid         not null,    -- FK to services(id) added in 099 (Module 16 in 050)
  unit                     text,
  result_type              text         not null default 'numeric',
  ref_min_male             numeric(12,4),
  ref_max_male             numeric(12,4),
  ref_min_female           numeric(12,4),
  ref_max_female           numeric(12,4),
  reference_description    text,
  critical_low             numeric(12,4),
  critical_high            numeric(12,4),
  tat_hours                int,
  requires_fasting         boolean      not null default false,
  -- uniform block
  created_by               uuid         references users(id) on delete set null,
  created_at               timestamptz  not null default now(),
  updated_by               uuid         references users(id) on delete set null,
  updated_at               timestamptz  not null default now(),
  version                  int          not null default 0,
  deleted_at               timestamptz,
  deleted_by               uuid         references users(id) on delete set null,
  constraint chk_lab_tests_code_len    check (char_length(test_code) between 2 and 20),
  constraint chk_lab_tests_category    check (category in ('hematology','biochemistry','microbiology','serology','pathology','endocrinology','immunology')),
  constraint chk_lab_tests_result_type check (result_type in ('numeric','positive_negative','reactive_nonreactive','grade','free_text','image')),
  constraint chk_lab_tests_volume      check (sample_volume_ml is null or sample_volume_ml > 0),
  constraint chk_lab_tests_tat         check (tat_hours is null or tat_hours > 0)
);

comment on table lab_tests is 'Reference catalogue of every diagnostic test the lab can perform. Reference ranges and critical thresholds drive the auto-flag trigger on lab_results. service_id (Module 16) is the pricing source — no per-test price stored here.';

create unique index if not exists uq_lab_tests_code     on lab_tests (test_code);
create index        if not exists ix_lab_tests_category on lab_tests (category) where deleted_at is null;

drop trigger if exists tr_lab_tests_bu_touch on lab_tests;
create trigger tr_lab_tests_bu_touch
  before update on lab_tests
  for each row execute function fn_touch_updated();

drop trigger if exists tr_lab_tests_au_audit on lab_tests;
create trigger tr_lab_tests_au_audit
  after insert or update or delete on lab_tests
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- lab_test_groups  (panel / package definitions)
-- ---------------------------------------------------------------------
create table if not exists lab_test_groups (
  id            uuid         primary key default uuidv7(),
  panel_code    text         not null,
  panel_name    text         not null,
  service_id    uuid         not null,   -- FK to services(id) added in 099 (Module 16)
  description   text,
  -- uniform block
  created_by    uuid         references users(id) on delete set null,
  created_at    timestamptz  not null default now(),
  updated_by    uuid         references users(id) on delete set null,
  updated_at    timestamptz  not null default now(),
  version       int          not null default 0,
  deleted_at    timestamptz,
  deleted_by    uuid         references users(id) on delete set null,
  constraint chk_lab_test_groups_code_len check (char_length(panel_code) between 2 and 20)
);

comment on table lab_test_groups is 'Panel and package definitions — bundles of individual tests sold together at a package price. Doctor orders the panel; the system fans out to individual lab_order_items.';

create unique index if not exists uq_lab_test_groups_code on lab_test_groups (panel_code) where deleted_at is null;

drop trigger if exists tr_lab_test_groups_bu_touch on lab_test_groups;
create trigger tr_lab_test_groups_bu_touch
  before update on lab_test_groups
  for each row execute function fn_touch_updated();

drop trigger if exists tr_lab_test_groups_au_audit on lab_test_groups;
create trigger tr_lab_test_groups_au_audit
  after insert or update or delete on lab_test_groups
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- lab_test_group_items  (constituent tests per group)
-- ---------------------------------------------------------------------
create table if not exists lab_test_group_items (
  id            uuid         primary key default uuidv7(),
  group_id      uuid         not null references lab_test_groups(id) on delete cascade,
  lab_test_id   uuid         not null references lab_tests(id)       on delete restrict,
  sequence_no   int          not null,
  -- uniform block
  created_by    uuid         references users(id) on delete set null,
  created_at    timestamptz  not null default now(),
  updated_by    uuid         references users(id) on delete set null,
  updated_at    timestamptz  not null default now(),
  version       int          not null default 0,
  deleted_at    timestamptz,
  deleted_by    uuid         references users(id) on delete set null,
  constraint chk_lab_test_group_items_sequence check (sequence_no > 0)
);

comment on table lab_test_group_items is 'One row per constituent test in a group. Maps each lab_test_groups row to its individual lab_tests rows; replaces the v2 test_ids UUID[]. sequence_no controls display order on the printed report.';

create unique index if not exists uq_lab_test_group_items_test on lab_test_group_items (group_id, lab_test_id) where deleted_at is null;
create unique index if not exists uq_lab_test_group_items_seq  on lab_test_group_items (group_id, sequence_no) where deleted_at is null;
create index        if not exists ix_lab_test_group_items_group on lab_test_group_items (group_id)    where deleted_at is null;
create index        if not exists ix_lab_test_group_items_test  on lab_test_group_items (lab_test_id) where deleted_at is null;

drop trigger if exists tr_lab_test_group_items_bu_touch on lab_test_group_items;
create trigger tr_lab_test_group_items_bu_touch
  before update on lab_test_group_items
  for each row execute function fn_touch_updated();

drop trigger if exists tr_lab_test_group_items_au_audit on lab_test_group_items;
create trigger tr_lab_test_group_items_au_audit
  after insert or update or delete on lab_test_group_items
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- lab_orders  (invoice_id FK added in 099 — Module 17)
-- ---------------------------------------------------------------------
create table if not exists lab_orders (
  id                uuid         primary key default uuidv7(),
  order_number      text         not null,
  patient_id        uuid         not null references patients(id)      on delete restrict,
  op_visit_id       uuid         references op_visits(id)              on delete restrict,
  consultation_id   uuid         references consultations(id)          on delete restrict,
  doctor_id         uuid         not null references users(id)         on delete restrict,
  priority          text         not null default 'routine',
  status            text         not null default 'ordered',
  invoice_id        uuid,        -- FK to invoices(id) added in 099 (Module 17)
  completed_at      timestamptz,
  -- uniform block
  created_by        uuid         not null references users(id) on delete set null,
  created_at        timestamptz  not null default now(),
  updated_by        uuid         references users(id) on delete set null,
  updated_at        timestamptz  not null default now(),
  version           int          not null default 0,
  deleted_at        timestamptz,
  deleted_by        uuid         references users(id) on delete set null,
  constraint chk_lab_orders_priority check (priority in ('routine','urgent','stat')),
  constraint chk_lab_orders_status   check (status in ('ordered','paid','sample_collection','sample_collected','in_progress','partially_reported','reported','released','cancelled'))
);

comment on table lab_orders is 'Order header — one per ordering event. Status tracks the order through the full lab workflow from creation through release. created_at = order timestamp.';

create unique index if not exists uq_lab_orders_number   on lab_orders (order_number);
create index        if not exists ix_lab_orders_patient  on lab_orders (patient_id, created_at desc) where deleted_at is null;
create index        if not exists ix_lab_orders_worklist on lab_orders (status, priority, created_at) where deleted_at is null;
create index        if not exists ix_lab_orders_visit    on lab_orders (op_visit_id) where op_visit_id is not null and deleted_at is null;

drop trigger if exists tr_lab_orders_bu_touch on lab_orders;
create trigger tr_lab_orders_bu_touch
  before update on lab_orders
  for each row execute function fn_touch_updated();

drop trigger if exists tr_lab_orders_au_audit on lab_orders;
create trigger tr_lab_orders_au_audit
  after insert or update or delete on lab_orders
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- lab_samples  (created before lab_order_items because lab_order_items
-- references sample_id; lab_samples references lab_orders only)
-- ---------------------------------------------------------------------
create table if not exists lab_samples (
  id                   uuid         primary key default uuidv7(),
  sample_barcode       text         not null,
  patient_id           uuid         not null references patients(id)   on delete restrict,
  lab_order_id         uuid         not null references lab_orders(id) on delete restrict,
  sample_type          text         not null,
  status               text         not null default 'collected',
  collected_by         uuid         not null references users(id)      on delete restrict,
  received_at          timestamptz,
  rejected_at          timestamptz,
  rejected_by          uuid         references users(id)               on delete set null,
  rejection_reason     text,
  disposed_at          timestamptz,
  replaces_sample_id   uuid         references lab_samples(id)         on delete restrict,
  notes                text,
  -- uniform block
  created_by           uuid         not null references users(id) on delete set null,
  created_at           timestamptz  not null default now(),
  updated_by           uuid         references users(id) on delete set null,
  updated_at           timestamptz  not null default now(),
  version              int          not null default 0,
  deleted_at           timestamptz,
  deleted_by           uuid         references users(id) on delete set null,
  constraint chk_lab_samples_status    check (status in ('collected','received','rejected','processing','processed','disposed')),
  constraint chk_lab_samples_rejection check ((status = 'rejected') = (rejection_reason is not null))
);

comment on table lab_samples is 'One row per physical sample collected. A single sample can serve multiple tests (multiple lab_order_items with same sample_id). Recollection chain via self-FK replaces_sample_id. created_at = collection timestamp.';

create unique index if not exists uq_lab_samples_barcode  on lab_samples (sample_barcode);
create index        if not exists ix_lab_samples_order    on lab_samples (lab_order_id);
create index        if not exists ix_lab_samples_replaces on lab_samples (replaces_sample_id) where replaces_sample_id is not null;
create index        if not exists ix_lab_samples_status   on lab_samples (status, created_at)  where status in ('collected','received');

drop trigger if exists tr_lab_samples_bu_touch on lab_samples;
create trigger tr_lab_samples_bu_touch
  before update on lab_samples
  for each row execute function fn_touch_updated();

drop trigger if exists tr_lab_samples_au_audit on lab_samples;
create trigger tr_lab_samples_au_audit
  after insert or update or delete on lab_samples
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- lab_order_items
-- ---------------------------------------------------------------------
create table if not exists lab_order_items (
  id              uuid         primary key default uuidv7(),
  lab_order_id    uuid         not null references lab_orders(id)      on delete cascade,
  lab_test_id     uuid         not null references lab_tests(id)       on delete restrict,
  group_id        uuid         references lab_test_groups(id)          on delete restrict,
  sample_id       uuid         references lab_samples(id)              on delete restrict,
  status          text         not null default 'pending',
  sequence_no     int          not null,
  -- uniform block
  created_by      uuid         not null references users(id) on delete set null,
  created_at      timestamptz  not null default now(),
  updated_by      uuid         references users(id) on delete set null,
  updated_at      timestamptz  not null default now(),
  version         int          not null default 0,
  deleted_at      timestamptz,
  deleted_by      uuid         references users(id) on delete set null,
  constraint chk_lab_order_items_status   check (status in ('pending','sample_collected','rejected','recollection_pending','in_progress','reported','verified','released','cancelled')),
  constraint chk_lab_order_items_sequence check (sequence_no > 0)
);

comment on table lab_order_items is 'One row per individual test within an order. Group fan-out shares group_id; each item independently tracks its own sample, status, and result.';

create unique index if not exists uq_lab_order_items_test    on lab_order_items (lab_order_id, lab_test_id) where deleted_at is null;
create index        if not exists ix_lab_order_items_order   on lab_order_items (lab_order_id) where deleted_at is null;
create index        if not exists ix_lab_order_items_sample  on lab_order_items (sample_id)    where sample_id is not null;

drop trigger if exists tr_lab_order_items_bu_touch on lab_order_items;
create trigger tr_lab_order_items_bu_touch
  before update on lab_order_items
  for each row execute function fn_touch_updated();

drop trigger if exists tr_lab_order_items_au_audit on lab_order_items;
create trigger tr_lab_order_items_au_audit
  after insert or update or delete on lab_order_items
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- lab_results  (L2 maker-checker)
-- ---------------------------------------------------------------------
create table if not exists lab_results (
  id                          uuid         primary key default uuidv7(),
  lab_order_item_id           uuid         not null references lab_order_items(id) on delete restrict,
  value_raw                   text         not null,
  value_numeric               numeric(12,4),
  unit                        text,
  flag                        text         not null default 'normal',
  method                      text,
  comments                    text,
  performed_by                uuid         not null references users(id) on delete restrict,
  report_data                 bytea,
  -- L2 maker-checker
  release_status              text         not null default 'pending_verification',
  approval_status             text         not null default 'pending_approval',
  verified_by                 uuid         references users(id) on delete set null,
  verified_at                 timestamptz,
  rejection_reason            text,
  is_override_release         boolean      not null default false,
  override_release_reason     text,
  amended_from_result_id      uuid         references lab_results(id) on delete restrict,
  -- uniform block
  created_by                  uuid         not null references users(id) on delete set null,
  created_at                  timestamptz  not null default now(),
  updated_by                  uuid         references users(id) on delete set null,
  updated_at                  timestamptz  not null default now(),
  version                     int          not null default 0,
  deleted_at                  timestamptz,
  deleted_by                  uuid         references users(id) on delete set null,
  constraint chk_lab_results_flag             check (flag in ('normal','low','high','critical_low','critical_high')),
  constraint chk_lab_results_release_status   check (release_status in ('pending_verification','verified','override_released','amended','rejected')),
  constraint chk_lab_results_approval_status  check (approval_status in ('pending_approval','approved','rejected')),
  constraint chk_lab_results_maker_checker    check (approval_status = 'pending_approval' or (created_by is not null and verified_by is not null and created_by <> verified_by)),
  constraint chk_lab_results_override         check (is_override_release = false or (override_release_reason is not null and char_length(override_release_reason) > 10))
);

comment on table lab_results is 'One row per test result. L2 maker-checker — lab tech enters, senior reviewer verifies. Auto-flag trigger compares value_numeric against lab_tests reference ranges. Critical values raise immediate alert. Amendments chain via amended_from_result_id.';

create unique index if not exists uq_lab_results_item     on lab_results (lab_order_item_id);
create index        if not exists ix_lab_results_pending  on lab_results (created_at desc) where release_status = 'pending_verification';
create index        if not exists ix_lab_results_critical on lab_results (created_at desc) where flag in ('critical_low','critical_high');
create index        if not exists ix_lab_results_amended  on lab_results (amended_from_result_id) where amended_from_result_id is not null;

drop trigger if exists tr_lab_results_bu_touch on lab_results;
create trigger tr_lab_results_bu_touch
  before update on lab_results
  for each row execute function fn_touch_updated();

drop trigger if exists tr_lab_results_au_audit on lab_results;
create trigger tr_lab_results_au_audit
  after insert or update or delete on lab_results
  for each row execute function fn_audit_row();
