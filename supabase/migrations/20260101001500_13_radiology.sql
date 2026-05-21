-- =====================================================================
-- 041_13_radiology.sql
-- Module 13 — Radiology
-- Tables: radiology_procedures, radiology_orders, radiology_attachments,
--         radiology_reports (L2 maker-checker)
--
-- Cross-module FKs deferred to 099_cross_module_fks.sql:
--   * radiology_procedures.service_id → services(id)        — Module 16 (050)
--   * radiology_orders.invoice_id     → invoices(id)        — Module 17 (051)
--   * radiology_orders.ip_admission_id → ip_admissions(id)  — Phase 2 (not yet defined)
-- Spec: docs/03-schema/v3/modules/13-radiology.html
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- radiology_procedures
-- ---------------------------------------------------------------------
create table if not exists radiology_procedures (
  id                              uuid         primary key default uuidv7(),
  procedure_code                  text         not null,
  procedure_name                  text         not null,
  modality                        text         not null,
  body_part                       text,
  department_id                   uuid         references departments(id) on delete restrict,
  service_id                      uuid         not null,   -- FK to services(id) added in 099 (Module 16)
  typical_duration_mins           int,
  requires_fasting                boolean      not null default false,
  requires_radiologist_presence   boolean      not null default false,
  sac_code                        text,
  description                     text,
  -- uniform block
  created_by                      uuid         references users(id) on delete set null,
  created_at                      timestamptz  not null default now(),
  updated_by                      uuid         references users(id) on delete set null,
  updated_at                      timestamptz  not null default now(),
  version                         int          not null default 0,
  deleted_at                      timestamptz,
  deleted_by                      uuid         references users(id) on delete set null,
  constraint chk_radiology_procedures_code_len check (char_length(procedure_code) between 2 and 20),
  constraint chk_radiology_procedures_modality check (modality in ('xray','ultrasound','ct','mri','mammography','dexa','fluoroscopy','nuclear','other')),
  constraint chk_radiology_procedures_duration check (typical_duration_mins is null or typical_duration_mins > 0)
);

comment on table radiology_procedures is 'Reference catalogue of every imaging procedure the hospital performs. Drives order-creation UI and pricing via service_id (Module 16).';

create unique index if not exists uq_radiology_procedures_code     on radiology_procedures (procedure_code) where deleted_at is null;
create index        if not exists ix_radiology_procedures_modality on radiology_procedures (modality)       where deleted_at is null;
create index        if not exists ix_radiology_procedures_dept     on radiology_procedures (department_id)  where deleted_at is null;

drop trigger if exists tr_radiology_procedures_bu_touch on radiology_procedures;
create trigger tr_radiology_procedures_bu_touch
  before update on radiology_procedures
  for each row execute function fn_touch_updated();

drop trigger if exists tr_radiology_procedures_au_audit on radiology_procedures;
create trigger tr_radiology_procedures_au_audit
  after insert or update or delete on radiology_procedures
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- radiology_orders
-- ---------------------------------------------------------------------
create table if not exists radiology_orders (
  id                       uuid         primary key default uuidv7(),
  order_number             text         not null,
  patient_id               uuid         not null references patients(id) on delete restrict,
  op_visit_id              uuid         references op_visits(id)         on delete restrict,
  ip_admission_id          uuid,        -- FK to ip_admissions(id) deferred (Phase 2 module)
  consultation_id          uuid         references consultations(id)     on delete restrict,
  doctor_id                uuid         not null references users(id)    on delete restrict,
  radiology_procedure_id   uuid         not null references radiology_procedures(id) on delete restrict,
  clinical_question        text,
  priority                 text         not null default 'routine',
  invoice_id               uuid,        -- FK to invoices(id) added in 099 (Module 17)
  status                   text         not null default 'ordered',
  imaging_completed_at     timestamptz,
  released_at              timestamptz,
  -- uniform block
  created_by               uuid         not null references users(id) on delete set null,
  created_at               timestamptz  not null default now(),
  updated_by               uuid         references users(id) on delete set null,
  updated_at               timestamptz  not null default now(),
  version                  int          not null default 0,
  deleted_at               timestamptz,
  deleted_by               uuid         references users(id) on delete set null,
  constraint chk_radiology_orders_number_len check (char_length(order_number) between 5 and 30),
  constraint chk_radiology_orders_priority   check (priority in ('routine','urgent','stat')),
  constraint chk_radiology_orders_status     check (status in ('ordered','awaiting_payment','paid','imaging_pending','imaging_in_progress','imaging_completed','reporting_pending','reported','released','cancelled')),
  constraint chk_radiology_orders_context    check (num_nonnulls(op_visit_id, ip_admission_id) <= 1)
);

comment on table radiology_orders is 'One order = one act of ordering one imaging procedure. Multi-procedure requests are separate radiology_orders rows — matches radiology worklists and DICOM accession-number assignment.';

create unique index if not exists uq_radiology_orders_number       on radiology_orders (order_number);
create index        if not exists ix_radiology_orders_patient      on radiology_orders (patient_id, created_at desc);
create index        if not exists ix_radiology_orders_worklist     on radiology_orders (status, priority, created_at) where deleted_at is null and status not in ('released','cancelled');
create index        if not exists ix_radiology_orders_consultation on radiology_orders (consultation_id) where consultation_id is not null;
create index        if not exists ix_radiology_orders_invoice      on radiology_orders (invoice_id)      where invoice_id is not null;

drop trigger if exists tr_radiology_orders_bu_touch on radiology_orders;
create trigger tr_radiology_orders_bu_touch
  before update on radiology_orders
  for each row execute function fn_touch_updated();

drop trigger if exists tr_radiology_orders_au_audit on radiology_orders;
create trigger tr_radiology_orders_au_audit
  after insert or update or delete on radiology_orders
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- radiology_attachments
-- ---------------------------------------------------------------------
create table if not exists radiology_attachments (
  id                  uuid         primary key default uuidv7(),
  radiology_order_id  uuid         not null references radiology_orders(id) on delete cascade,
  file_name           text         not null,
  file_type           text         not null,
  file_data           bytea        not null,
  file_size_bytes     int          not null,
  caption             text,
  sequence_no         int          not null default 1,
  -- uniform block
  created_by          uuid         not null references users(id) on delete set null,
  created_at          timestamptz  not null default now(),
  updated_by          uuid         references users(id) on delete set null,
  updated_at          timestamptz  not null default now(),
  version             int          not null default 0,
  deleted_at          timestamptz,
  deleted_by          uuid         references users(id) on delete set null,
  constraint chk_radiology_attachments_file_type check (file_type in ('image/jpeg','image/png','application/pdf')),
  constraint chk_radiology_attachments_file_size check (file_size_bytes > 0),
  constraint chk_radiology_attachments_seq       check (sequence_no > 0)
);

comment on table radiology_attachments is 'Files uploaded by the radiology technician against a radiology order — X-ray images, PDFs, scanned documents. Replaces TSD radiology_studies; technician uploads directly via app UI (no PACS bridge).';

create index if not exists ix_radiology_attachments_order on radiology_attachments (radiology_order_id, sequence_no) where deleted_at is null;

drop trigger if exists tr_radiology_attachments_bu_touch on radiology_attachments;
create trigger tr_radiology_attachments_bu_touch
  before update on radiology_attachments
  for each row execute function fn_touch_updated();

drop trigger if exists tr_radiology_attachments_au_audit on radiology_attachments;
create trigger tr_radiology_attachments_au_audit
  after insert or update or delete on radiology_attachments
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- radiology_reports  (L2 maker-checker)
-- ---------------------------------------------------------------------
create table if not exists radiology_reports (
  id                            uuid         primary key default uuidv7(),
  radiology_order_id            uuid         not null references radiology_orders(id) on delete restrict,
  findings                      text,
  impression                    text,
  recommendation                text,
  reported_by_radiologist_id    uuid         not null references users(id) on delete restrict,
  dictated_at                   timestamptz,
  release_status                text         not null default 'pending_verification',
  report_data                   bytea,
  amended_from_report_id        uuid         references radiology_reports(id) on delete restrict,
  amendment_reason              text,
  -- L2 maker-checker
  approval_status               text         not null default 'pending_approval',
  approved_by                   uuid         references users(id) on delete restrict,
  approved_at                   timestamptz,
  rejection_reason              text,
  -- uniform block
  created_by                    uuid         not null references users(id) on delete set null,
  created_at                    timestamptz  not null default now(),
  updated_by                    uuid         references users(id) on delete set null,
  updated_at                    timestamptz  not null default now(),
  version                       int          not null default 0,
  deleted_at                    timestamptz,
  deleted_by                    uuid         references users(id) on delete set null,
  constraint chk_radiology_reports_release_status   check (release_status in ('pending_verification','verified','released','amended','rejected')),
  constraint chk_radiology_reports_approval_status  check (approval_status in ('pending_approval','approved','rejected')),
  constraint chk_radiology_reports_release_approved check ((release_status = 'released') = (approval_status = 'approved' and approved_by is not null)),
  constraint chk_radiology_reports_amendment_reason check ((amended_from_report_id is null) or (amendment_reason is not null and char_length(amendment_reason) >= 10)),
  constraint chk_radiology_reports_sod              check (approved_by is null or created_by <> approved_by)
);

comment on table radiology_reports is 'Radiologist findings, impression, recommendations. L2 maker-checker — radiologist dictates, consultant approves and releases. Amendments chain via amended_from_report_id self-FK.';

create index if not exists ix_radiology_reports_pending      on radiology_reports (release_status, dictated_at desc) where release_status = 'pending_verification';
create index if not exists ix_radiology_reports_order        on radiology_reports (radiology_order_id);
create index if not exists ix_radiology_reports_radiologist  on radiology_reports (reported_by_radiologist_id, dictated_at desc);

drop trigger if exists tr_radiology_reports_bu_touch on radiology_reports;
create trigger tr_radiology_reports_bu_touch
  before update on radiology_reports
  for each row execute function fn_touch_updated();

drop trigger if exists tr_radiology_reports_au_audit on radiology_reports;
create trigger tr_radiology_reports_au_audit
  after insert or update or delete on radiology_reports
  for each row execute function fn_audit_row();
