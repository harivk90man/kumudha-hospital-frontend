-- =====================================================================
-- 014_platform_attachments.sql
-- document_templates + file_attachments.
--
-- Spec: docs/03-schema/v2/modules/05-platform-attachments.html
-- TSD : docs/05-tsd/02-audit-events-notifications.md §§4.5, 4.6
--
-- NOTE: file_attachments references patients(id) which lives in 020_patient.sql.
-- We add that FK in 020_patient.sql AFTER patients exists.
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- document_templates
-- ---------------------------------------------------------------------
create table if not exists document_templates (
  id                   uuid         primary key default gen_random_uuid(),
  tenant_id            uuid         not null references tenants(id) on delete restrict,
  template_type        varchar(32)  not null,
  name                 varchar(200) not null,
  category             varchar(64),
  department_id        uuid         references departments(id) on delete set null,
  icd10_code           varchar(16),
  content              jsonb        not null,
  applicable_role_ids  uuid[],
  version              int          not null default 1,
  usage_count          int          not null default 0,
  is_active            boolean      not null default true,
  created_by           uuid         references users(id) on delete set null,
  created_at           timestamptz  not null default now(),
  updated_at           timestamptz  not null default now(),
  constraint chk_document_templates_type
    check (template_type in ('consultation','discharge_summary','prescription','lab_report',
                              'inventory_request','op_notes','receipt'))
);
comment on table  document_templates is 'Reusable rendering templates — consultation notes, discharge summaries, prescriptions, lab reports. Versioned per edit.';
comment on column document_templates.content is 'Structure varies by template_type.';

create index if not exists idx_document_templates_tenant_type
  on document_templates(tenant_id, template_type, is_active);

drop trigger if exists trg_document_templates_updated_at on document_templates;
create trigger trg_document_templates_updated_at
  before update on document_templates
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------
-- file_attachments
-- patient_id FK is added in 020_patient.sql after patients exists.
-- ---------------------------------------------------------------------
create table if not exists file_attachments (
  id              uuid         primary key default gen_random_uuid(),
  tenant_id       uuid         not null references tenants(id) on delete restrict,
  patient_id      uuid,                                       -- FK added in 020
  entity_table    varchar(120) not null,
  entity_id       uuid         not null,
  file_name       varchar(255) not null,
  file_type       varchar(64),
  file_path       text         not null,
  mime_type       varchar(120),
  size_bytes      bigint,
  uploaded_by     uuid         references users(id) on delete set null,
  uploaded_at     timestamptz  not null default now()
);
comment on table  file_attachments is
  'Polymorphic blob storage. Any business entity may attach files (consultations, lab results, radiology reports, govt-ID scans). Nightly orphan-check job.';
comment on column file_attachments.entity_table is
  'Target table name (polymorphic — DB cannot enforce FK).';

create index if not exists idx_file_attachments_entity
  on file_attachments(tenant_id, entity_table, entity_id);
create index if not exists idx_file_attachments_uploader
  on file_attachments(uploaded_by);
