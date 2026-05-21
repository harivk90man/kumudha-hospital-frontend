-- =====================================================================
-- 015_platform_lookups.sql
-- allergies_lookup + chronic_conditions_lookup (clinical picklists).
--
-- Spec: docs/03-schema/v2/modules/06-platform-lookups.html
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- allergies_lookup
-- ---------------------------------------------------------------------
create table if not exists allergies_lookup (
  id                uuid         primary key default gen_random_uuid(),
  tenant_id         uuid         not null references tenants(id) on delete restrict,
  allergen_name     varchar(120) not null,
  allergen_class    varchar(32)  not null,
  drug_class_code   varchar(64),
  description       text,
  is_active         boolean      not null default true,
  created_by        uuid         references users(id) on delete set null,
  created_at        timestamptz  not null default now(),
  updated_at        timestamptz  not null default now(),
  constraint chk_allergies_class check (allergen_class in ('drug','food','environmental','other')),
  constraint uq_allergies_name   unique (tenant_id, allergen_name)
);
comment on table  allergies_lookup is
  'Allergen picklist with drug_class_code — used at patient registration AND at prescribe time for drug-class allergy alerts.';
comment on column allergies_lookup.drug_class_code is
  'Matches medicines.drug_class for prescribe-time alert.';

create index if not exists idx_allergies_lookup_drug_class
  on allergies_lookup(tenant_id, drug_class_code) where drug_class_code is not null;

drop trigger if exists trg_allergies_lookup_updated_at on allergies_lookup;
create trigger trg_allergies_lookup_updated_at
  before update on allergies_lookup
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------
-- chronic_conditions_lookup
-- ---------------------------------------------------------------------
create table if not exists chronic_conditions_lookup (
  id              uuid         primary key default gen_random_uuid(),
  tenant_id       uuid         not null references tenants(id) on delete restrict,
  condition_name  varchar(200) not null,
  icd10_code      varchar(16),
  description     text,
  is_active       boolean      not null default true,
  created_by      uuid         references users(id) on delete set null,
  created_at      timestamptz  not null default now(),
  updated_at      timestamptz  not null default now(),
  constraint uq_chronic_conditions_name unique (tenant_id, condition_name)
);
comment on table chronic_conditions_lookup is
  'Chronic condition picklist with ICD-10 — used at patient registration AND consultation HPI for analytics cohorts.';

create index if not exists idx_chronic_conditions_icd
  on chronic_conditions_lookup(tenant_id, icd10_code) where icd10_code is not null;

drop trigger if exists trg_chronic_conditions_updated_at on chronic_conditions_lookup;
create trigger trg_chronic_conditions_updated_at
  before update on chronic_conditions_lookup
  for each row execute function fn_set_updated_at();
