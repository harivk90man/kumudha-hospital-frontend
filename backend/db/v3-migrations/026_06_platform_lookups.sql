-- =====================================================================
-- 026_06_platform_lookups.sql
-- Module 06 — Platform Lookups
-- Tables: allergies_lookup, chronic_conditions_lookup
-- Spec: docs/03-schema/v3/modules/06-platform-lookups.html
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- allergies_lookup
-- ---------------------------------------------------------------------
create table if not exists allergies_lookup (
  id            uuid         primary key default uuidv7(),
  allergy_code  text         not null,
  allergy_name  text         not null,
  category      text         not null,
  description   text,
  -- uniform block
  created_by    uuid         references users(id) on delete set null,
  created_at    timestamptz  not null default now(),
  updated_by    uuid         references users(id) on delete set null,
  updated_at    timestamptz  not null default now(),
  version       int          not null default 0,
  deleted_at    timestamptz,
  deleted_by    uuid         references users(id) on delete set null,
  constraint chk_allergies_lookup_code_len  check (char_length(allergy_code) between 2 and 40),
  constraint chk_allergies_lookup_category  check (category in ('drug','food','environmental','other'))
);

comment on table allergies_lookup is 'Standard allergy catalogue. Flyway seeds common allergens; admin can add hospital-specific entries. Referenced by patient_allergies.allergy_id (Module 07).';

create unique index if not exists uq_allergies_lookup_code     on allergies_lookup (allergy_code) where deleted_at is null;
create index        if not exists ix_allergies_lookup_category on allergies_lookup (category)     where deleted_at is null;

drop trigger if exists tr_allergies_lookup_bu_touch on allergies_lookup;
create trigger tr_allergies_lookup_bu_touch
  before update on allergies_lookup
  for each row execute function fn_touch_updated();

drop trigger if exists tr_allergies_lookup_au_audit on allergies_lookup;
create trigger tr_allergies_lookup_au_audit
  after insert or update or delete on allergies_lookup
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- chronic_conditions_lookup
-- ---------------------------------------------------------------------
create table if not exists chronic_conditions_lookup (
  id              uuid         primary key default uuidv7(),
  condition_code  text         not null,
  condition_name  text         not null,
  icd10_code      text,
  category        text         not null,
  description     text,
  -- uniform block
  created_by      uuid         references users(id) on delete set null,
  created_at      timestamptz  not null default now(),
  updated_by      uuid         references users(id) on delete set null,
  updated_at      timestamptz  not null default now(),
  version         int          not null default 0,
  deleted_at      timestamptz,
  deleted_by      uuid         references users(id) on delete set null,
  constraint chk_chronic_conditions_lookup_code_len check (char_length(condition_code) between 2 and 40),
  constraint chk_chronic_conditions_lookup_category check (category in ('endocrine','cardiovascular','respiratory','neurological','musculoskeletal','renal','gastrointestinal','other'))
);

comment on table chronic_conditions_lookup is 'Standard chronic-condition catalogue with ICD-10 codes for interoperability (ABDM, insurance, health exchanges). Referenced by patient_chronic_conditions.condition_id (Module 07).';

create unique index if not exists uq_chronic_conditions_lookup_code     on chronic_conditions_lookup (condition_code) where deleted_at is null;
create index        if not exists ix_chronic_conditions_lookup_category on chronic_conditions_lookup (category)       where deleted_at is null;

drop trigger if exists tr_chronic_conditions_lookup_bu_touch on chronic_conditions_lookup;
create trigger tr_chronic_conditions_lookup_bu_touch
  before update on chronic_conditions_lookup
  for each row execute function fn_touch_updated();

drop trigger if exists tr_chronic_conditions_lookup_au_audit on chronic_conditions_lookup;
create trigger tr_chronic_conditions_lookup_au_audit
  after insert or update or delete on chronic_conditions_lookup
  for each row execute function fn_audit_row();
