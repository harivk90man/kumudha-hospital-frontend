-- =====================================================================
-- 025_05_document_templates.sql
-- Module 05 — Document Templates
-- Spec: docs/03-schema/v3/modules/05-document-templates.html
-- =====================================================================

set search_path = public;

create table if not exists document_templates (
  id              uuid         primary key default uuidv7(),
  template_code   text         not null,
  template_name   text         not null,
  template_type   text         not null,
  entity_table    text,
  content         text         not null,
  variables       jsonb        not null default '{}'::jsonb,
  -- uniform block
  created_by      uuid         references users(id) on delete set null,
  created_at      timestamptz  not null default now(),
  updated_by      uuid         references users(id) on delete set null,
  updated_at      timestamptz  not null default now(),
  version         int          not null default 0,
  deleted_at      timestamptz,
  deleted_by      uuid         references users(id) on delete set null,
  constraint chk_document_templates_code_len check (char_length(template_code) between 2 and 80),
  constraint chk_document_templates_type     check (template_type in ('pdf','html','sms','email'))
);

comment on table document_templates is 'Admin-managed HTML / text templates rendered at print or send time — prescription PDFs, invoice PDFs, SMS notifications. The app fetches by template_code, injects {{variable}} placeholders, and produces the output. Soft-delete safe: already-rendered docs are static files.';

create unique index if not exists uq_document_templates_code on document_templates (template_code) where deleted_at is null;
create index        if not exists ix_document_templates_type on document_templates (template_type) where deleted_at is null;

drop trigger if exists tr_document_templates_bu_touch on document_templates;
create trigger tr_document_templates_bu_touch
  before update on document_templates
  for each row execute function fn_touch_updated();

drop trigger if exists tr_document_templates_au_audit on document_templates;
create trigger tr_document_templates_au_audit
  after insert or update or delete on document_templates
  for each row execute function fn_audit_row();
