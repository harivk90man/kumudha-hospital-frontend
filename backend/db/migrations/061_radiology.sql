-- =====================================================================
-- 061_radiology.sql
-- radiology_procedures (catalog), radiology_orders, radiology_studies,
-- radiology_reports.
--
-- Spec: docs/03-schema/v2/modules/13-radiology.html
-- TSD : docs/05-tsd/09-radiology.md
--
-- NOTE: radiology_orders.invoice_id has NO FK (billing module out of scope).
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- 1. radiology_procedures
-- (The user message refers to "radiology_tests" — schema v8 names the
-- table radiology_procedures, which is what we use.)
-- ---------------------------------------------------------------------
create table if not exists radiology_procedures (
  id                              uuid          primary key default gen_random_uuid(),
  tenant_id                       uuid          not null references tenants(id) on delete restrict,
  procedure_code                  varchar(64)   not null,
  test_name                       varchar(200)  not null,
  modality                        varchar(32)   not null,
  body_part                       varchar(64),
  with_contrast                   boolean       not null default false,
  default_price                   numeric(10,2) not null,
  typical_duration_mins           int,
  requires_fasting                boolean       not null default false,
  requires_radiologist_presence   boolean       not null default false,
  is_active                       boolean       not null default true,
  created_by                      uuid          references users(id) on delete set null,
  created_at                      timestamptz   not null default now(),
  updated_by                      uuid          references users(id) on delete set null,
  updated_at                      timestamptz   not null default now(),
  version                         int           not null default 0,
  constraint chk_radiology_procedures_modality check (
    modality in ('xray','ultrasound','ct','mri','mammography','dexa','fluoroscopy','nuclear','other')
  ),
  constraint uq_radiology_procedures_code unique (tenant_id, procedure_code)
);
comment on table radiology_procedures is
  'Procedure catalog — code, name, modality (xray/ct/mri/ultrasound), body part, default price, contrast/fasting/radiologist requirements.';

create index if not exists idx_radiology_procedures_modality
  on radiology_procedures(tenant_id, modality, is_active);

drop trigger if exists trg_radiology_procedures_updated_at on radiology_procedures;
create trigger trg_radiology_procedures_updated_at
  before update on radiology_procedures
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------
-- 2. radiology_orders
-- ---------------------------------------------------------------------
create table if not exists radiology_orders (
  id                                uuid          primary key default gen_random_uuid(),
  tenant_id                         uuid          not null references tenants(id) on delete restrict,
  order_number                      varchar(32)   not null unique,
  patient_id                        uuid          not null references patients(id) on delete restrict,
  op_visit_id                       uuid          references op_visits(id) on delete set null,
  ip_admission_id                   uuid,                                         -- phase 2
  consultation_id                   uuid          references consultations(id) on delete set null,
  doctor_id                         uuid          not null references users(id) on delete restrict,
  radiology_procedure_id            uuid          not null references radiology_procedures(id) on delete restrict,
  with_contrast                     boolean,                                       -- order-level override
  clinical_question                 text,
  priority                          varchar(16)   not null default 'routine',
  invoice_id                        uuid,                                          -- billing module out of scope
  payment_required_before_service   boolean       not null default true,
  status                            varchar(32)   not null default 'ordered',
  ordered_at                        timestamptz   not null default now(),
  imaging_completed_at              timestamptz,
  released_at                       timestamptz,
  created_by                        uuid          references users(id) on delete set null,
  created_at                        timestamptz   not null default now(),
  updated_by                        uuid          references users(id) on delete set null,
  updated_at                        timestamptz   not null default now(),
  version                           int           not null default 0,
  constraint chk_radiology_orders_priority check (priority in ('routine','urgent','stat')),
  constraint chk_radiology_orders_status check (
    status in ('ordered','awaiting_payment','paid','imaging_pending','imaging_in_progress',
               'imaging_completed','reporting_pending','reported','released','cancelled')
  )
);
comment on table radiology_orders is
  'Imaging order header — patient, doctor, procedure, priority, payment gate, lifecycle status.';

create index if not exists idx_radiology_orders_patient
  on radiology_orders(tenant_id, patient_id, ordered_at desc);
create index if not exists idx_radiology_orders_worklist
  on radiology_orders(tenant_id, status, priority, ordered_at);
create index if not exists idx_radiology_orders_consultation
  on radiology_orders(consultation_id);

drop trigger if exists trg_radiology_orders_updated_at on radiology_orders;
create trigger trg_radiology_orders_updated_at
  before update on radiology_orders
  for each row execute function fn_set_updated_at();

-- Back-fill: doctor_recommendations.radiology_order_id FK
alter table doctor_recommendations
  add constraint fk_doctor_rec_radiology_order
  foreign key (radiology_order_id) references radiology_orders(id) on delete set null;

-- ---------------------------------------------------------------------
-- 3. radiology_studies
-- ---------------------------------------------------------------------
create table if not exists radiology_studies (
  id                      uuid         primary key default gen_random_uuid(),
  tenant_id               uuid         not null references tenants(id) on delete restrict,
  radiology_order_id      uuid         not null references radiology_orders(id) on delete restrict,
  study_uid               varchar(128) not null unique,
  accession_number        varchar(64)  not null unique,
  modality_snapshot       varchar(32)  not null,
  body_part_snapshot      varchar(64),
  technique               text,
  images_count            int          not null default 0,
  images_url              text[]       not null default '{}',
  pacs_archive_status     varchar(32)  not null default 'pending',
  technician_id           uuid         not null references users(id) on delete restrict,
  study_started_at        timestamptz  not null default now(),
  study_completed_at      timestamptz,
  created_by              uuid         references users(id) on delete set null,
  created_at              timestamptz  not null default now(),
  updated_by              uuid         references users(id) on delete set null,
  updated_at              timestamptz  not null default now(),
  version                 int          not null default 0,
  constraint chk_radiology_studies_pacs check (
    pacs_archive_status in ('pending','archived','retrieval_failed')
  )
);
comment on table radiology_studies is
  'Captured study record — DICOM UID, accession number, image URLs, technician, completion time. PACS bridge.';

create index if not exists idx_radiology_studies_order
  on radiology_studies(radiology_order_id);

drop trigger if exists trg_radiology_studies_updated_at on radiology_studies;
create trigger trg_radiology_studies_updated_at
  before update on radiology_studies
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------
-- 4. radiology_reports
-- ---------------------------------------------------------------------
create table if not exists radiology_reports (
  id                            uuid         primary key default gen_random_uuid(),
  tenant_id                     uuid         not null references tenants(id) on delete restrict,
  radiology_order_id            uuid         not null references radiology_orders(id) on delete restrict,
  study_id                      uuid         references radiology_studies(id) on delete set null,
  findings                      text,
  impression                    text,
  recommendation                text,
  reported_by_radiologist_id    uuid         references users(id) on delete restrict,
  dictated_at                   timestamptz,
  release_status                varchar(32)  not null default 'pending_verification',
  approval_status               varchar(16)  not null default 'pending',
  approved_by                   uuid         references users(id) on delete set null,
  approved_at                   timestamptz,
  rejection_reason              text,
  amended_from_report_id        uuid         references radiology_reports(id) on delete set null,
  amendment_reason              text,
  file_attachment_id            uuid         references file_attachments(id) on delete set null,
  report_pdf_url                text,
  uploaded_by                   uuid         not null references users(id) on delete restrict,
  uploaded_at                   timestamptz  not null default now(),
  created_by                    uuid         references users(id) on delete set null,
  created_at                    timestamptz  not null default now(),
  updated_by                    uuid         references users(id) on delete set null,
  updated_at                    timestamptz  not null default now(),
  version                       int          not null default 0,
  constraint chk_radiology_reports_release_status check (
    release_status in ('pending_verification','verified','released','amended','rejected')
  ),
  constraint chk_radiology_reports_approval_status check (
    approval_status in ('pending','approved','rejected')
  ),
  constraint chk_radiology_reports_amendment_reason check (
    amended_from_report_id is null
    or (amendment_reason is not null and length(amendment_reason) > 10)
  ),
  constraint chk_radiology_reports_released_when_approved check (
    (release_status = 'released') = (approval_status = 'approved' and approved_by is not null)
  )
  -- NOTE: separation-of-duties (created_by <> approved_by) intentionally omitted —
  -- single-radiologist tenants would be blocked. Enforce via tenant-config flag
  -- 'radiology.require_dual_signoff' in app code (TSD-09 §6 open item).
);
comment on table radiology_reports is
  'Radiologist findings + impression + recommendation for a study. Layer 2 maker-checker (junior reads, senior verifies). Amendment chain via amended_from_report_id.';

create index if not exists idx_radiology_reports_pending
  on radiology_reports(tenant_id, release_status, dictated_at desc)
  where release_status = 'pending_verification';
create index if not exists idx_radiology_reports_order
  on radiology_reports(radiology_order_id);
create index if not exists idx_radiology_reports_radiologist
  on radiology_reports(reported_by_radiologist_id, dictated_at desc);

drop trigger if exists trg_radiology_reports_updated_at on radiology_reports;
create trigger trg_radiology_reports_updated_at
  before update on radiology_reports
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------
-- fn_radiology_release_event  (AFTER UPDATE OF release_status)
-- Emits a RadiologyReportReleased event when status moves to released.
-- ---------------------------------------------------------------------
create or replace function fn_radiology_release_event() returns trigger
language plpgsql
as $$
begin
  if new.release_status = 'released'
     and old.release_status is distinct from new.release_status
  then
    insert into domain_events
      (tenant_id, aggregate_type, aggregate_id, event_type, payload)
    values
      (new.tenant_id, 'radiology_report', new.id, 'RadiologyReportReleased',
       jsonb_build_object('radiology_order_id', new.radiology_order_id,
                          'reported_by', new.reported_by_radiologist_id));
  end if;
  return null;
end;
$$;

drop trigger if exists trg_radiology_reports_release_event on radiology_reports;
create trigger trg_radiology_reports_release_event
  after update of release_status on radiology_reports
  for each row execute function fn_radiology_release_event();
