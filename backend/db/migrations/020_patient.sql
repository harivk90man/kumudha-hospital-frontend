-- =====================================================================
-- 020_patient.sql
-- patients, patient_govt_ids, patient_merges, patient_mergeable_tables,
-- uhid_sequences, patient_family_history.
--
-- Spec: docs/03-schema/v2/modules/07-patient.html
-- TSD : docs/05-tsd/03-patient-master.md
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- 1. patients
-- ---------------------------------------------------------------------
create table if not exists patients (
  id                       uuid         primary key default gen_random_uuid(),
  tenant_id                uuid         not null references tenants(id) on delete restrict,
  uhid                     varchar(32)  not null,
  registration_status      varchar(16)  not null default 'provisional',
  merged_into_patient_id   uuid         references patients(id) on delete set null,
  first_name               varchar(120) not null,
  last_name                varchar(120) not null,
  gender                   varchar(1)   not null,
  dob                      date         not null,
  age                      int          not null,
  mobile                   varchar(20)  not null,
  alt_mobile               varchar(20),
  address                  jsonb,
  -- GENERATED columns from address jsonb
  address_pincode          varchar(16)  generated always as ((address->>'pincode')) stored,
  address_city             varchar(120) generated always as ((address->>'city')) stored,
  blood_group              varchar(8),
  marital_status           varchar(32),
  allergies                text[]       not null default '{}',
  chronic_conditions       text[]       not null default '{}',
  emergency_contact        jsonb,
  is_active                boolean      not null default true,
  created_by               uuid         references users(id) on delete set null,
  created_at               timestamptz  not null default now(),
  updated_by               uuid         references users(id) on delete set null,
  updated_at               timestamptz  not null default now(),
  version                  int          not null default 0,
  constraint chk_patients_gender             check (gender in ('M','F','O')),
  constraint chk_patients_registration_status check (registration_status in ('provisional','complete','merged')),
  constraint uq_patients_uhid                unique (uhid)
);
comment on table  patients is 'Master patient identity. UHID, demographics, allergies — referenced by every clinical & billing row.';
comment on column patients.uhid is 'UHID or TEMP- prefix.';

create index if not exists idx_patients_tenant         on patients(tenant_id, is_active);
create index if not exists idx_patients_mobile         on patients(tenant_id, mobile);
create index if not exists idx_patients_name_trgm      on patients using gin ((first_name || ' ' || last_name) gin_trgm_ops);
create index if not exists idx_patients_allergies_gin  on patients using gin (allergies);
create index if not exists idx_patients_chronic_gin    on patients using gin (chronic_conditions);
create index if not exists idx_patients_pincode        on patients(tenant_id, address_pincode);
create index if not exists idx_patients_city           on patients(tenant_id, address_city);

drop trigger if exists trg_patients_updated_at on patients;
create trigger trg_patients_updated_at
  before update on patients
  for each row execute function fn_set_updated_at();

-- Now that patients exists, add the deferred FK on file_attachments.patient_id.
alter table file_attachments
  add constraint fk_file_attachments_patient
  foreign key (patient_id) references patients(id) on delete set null;

-- ---------------------------------------------------------------------
-- 2. patient_govt_ids
-- ---------------------------------------------------------------------
create table if not exists patient_govt_ids (
  id                       uuid         primary key default gen_random_uuid(),
  tenant_id                uuid         not null references tenants(id) on delete restrict,
  patient_id               uuid         not null references patients(id) on delete cascade,
  id_type                  varchar(16)  not null,
  id_value_encrypted       bytea        not null,
  id_value_hash            varchar(128) not null,
  id_value_last4           varchar(8),
  issuing_authority        varchar(120),
  holder_name_on_id        varchar(200),
  verified                 boolean      not null default false,
  verified_at              timestamptz,
  verified_by              uuid         references users(id) on delete set null,
  verification_method      varchar(16),
  verification_notes       text,
  document_attachment_id   uuid         references file_attachments(id) on delete set null,
  is_active                boolean      not null default true,
  created_by               uuid         references users(id) on delete set null,
  created_at               timestamptz  not null default now(),
  updated_at               timestamptz  not null default now(),
  constraint chk_patient_govt_ids_type
    check (id_type in ('aadhaar','pan','passport','voter','dl','other')),
  constraint chk_patient_govt_ids_verification_method
    check (verification_method is null or verification_method in ('manual','digilocker','ocr'))
);
comment on table patient_govt_ids is
  'Encrypted KYC storage (Aadhaar, PAN, passport, voter ID, DL) with hash + last4 for dedup. RLS-protected; required for Phase 2 insurance/TPA.';

create index if not exists idx_patient_govt_ids_patient
  on patient_govt_ids(patient_id, is_active);
create index if not exists idx_patient_govt_ids_hash
  on patient_govt_ids(tenant_id, id_type, id_value_hash);

drop trigger if exists trg_patient_govt_ids_updated_at on patient_govt_ids;
create trigger trg_patient_govt_ids_updated_at
  before update on patient_govt_ids
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------
-- 3. patient_merges
-- ---------------------------------------------------------------------
create table if not exists patient_merges (
  id                   uuid         primary key default gen_random_uuid(),
  tenant_id            uuid         not null references tenants(id) on delete restrict,
  source_patient_id    uuid         not null references patients(id) on delete restrict,
  target_patient_id    uuid         not null references patients(id) on delete restrict,
  reason               text         not null,
  rows_repointed       jsonb,
  merged_by            uuid         not null references users(id) on delete restrict,
  merged_at            timestamptz  not null default now(),
  unmerged_at          timestamptz,
  unmerged_by          uuid         references users(id) on delete set null,
  unmerge_reason       text,
  approval_status      varchar(16)  not null default 'approved',
  approved_by          uuid         references users(id) on delete set null,
  approved_at          timestamptz,
  rejection_reason     text,
  constraint chk_patient_merges_approval check (approval_status in ('pending','approved','rejected')),
  constraint chk_patient_merges_distinct check (source_patient_id <> target_patient_id)
);
comment on table patient_merges is
  'Audit of duplicate-record consolidations. Source patient is hidden, child rows repointed to target. Layer 2 maker-checker for unmerge.';

create index if not exists idx_patient_merges_target on patient_merges(target_patient_id, merged_at desc);
create index if not exists idx_patient_merges_source on patient_merges(source_patient_id);

-- ---------------------------------------------------------------------
-- 4. patient_mergeable_tables  (registry — driven by sp_merge_patients)
-- ---------------------------------------------------------------------
create table if not exists patient_mergeable_tables (
  id           uuid         primary key default gen_random_uuid(),
  module       varchar(64)  not null,
  table_name   varchar(120) not null,
  fk_column    varchar(64)  not null default 'patient_id',
  merge_order  int          not null,
  is_active    boolean      not null default true,
  notes        text,
  added_at     timestamptz  not null default now(),
  added_by     uuid         references users(id) on delete set null,
  constraint uq_mergeable_tables unique (table_name)
);
comment on table patient_mergeable_tables is
  'Registry of every table with patient_id FK — read by sp_merge_patients to dynamically repoint child rows. 21+ entries.';

-- ---------------------------------------------------------------------
-- 5. uhid_sequences  (per-tenant, per-year counter)
-- ---------------------------------------------------------------------
create table if not exists uhid_sequences (
  tenant_id      uuid not null references tenants(id) on delete cascade,
  year           int  not null,
  last_sequence  int  not null default 0,
  constraint pk_uhid_sequences primary key (tenant_id, year)
);
comment on table uhid_sequences is
  'Per-tenant, per-year UHID counter. Source of truth for the next sequence number.';

-- ---------------------------------------------------------------------
-- 6. patient_family_history
-- ---------------------------------------------------------------------
create table if not exists patient_family_history (
  id                      uuid         primary key default gen_random_uuid(),
  tenant_id               uuid         not null references tenants(id) on delete restrict,
  patient_id              uuid         not null references patients(id) on delete cascade,
  relationship            varchar(32)  not null,
  relationship_specific   varchar(64),
  condition_name          varchar(200) not null,
  icd10_code              varchar(16),
  age_of_onset            int,
  is_deceased             boolean      not null default false,
  age_at_death            int,
  cause_of_death          text,
  notes                   text,
  is_active               boolean      not null default true,
  created_by              uuid         references users(id) on delete set null,
  created_at              timestamptz  not null default now(),
  updated_at              timestamptz  not null default now(),
  constraint chk_family_history_relationship
    check (relationship in ('father','mother','sibling','child','grandparent','other'))
);
comment on table patient_family_history is
  'First-degree relatives'' chronic conditions for hereditary-risk assessment by doctors.';

create index if not exists idx_family_history_patient
  on patient_family_history(patient_id, is_active);

drop trigger if exists trg_patient_family_history_updated_at on patient_family_history;
create trigger trg_patient_family_history_updated_at
  before update on patient_family_history
  for each row execute function fn_set_updated_at();
