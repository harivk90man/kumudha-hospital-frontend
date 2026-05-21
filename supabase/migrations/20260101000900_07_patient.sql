-- =====================================================================
-- 030_07_patient.sql
-- Module 07 — Patient
-- Tables: patients, patient_govt_ids, patient_merges (L2 maker-checker),
--         patient_allergies, patient_chronic_conditions, uhid_sequences
-- Spec: docs/03-schema/v3/modules/07-patient.html
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- patients
-- ---------------------------------------------------------------------
create table if not exists patients (
  id                            uuid         primary key default uuidv7(),
  uhid                          text         not null,
  first_name                    text         not null,
  last_name                     text         not null,
  date_of_birth                 date         not null,
  gender                        text         not null,
  blood_group                   text,
  mobile                        text,
  alt_mobile                    text,
  email                         text,
  address                       jsonb,
  address_city                  text         generated always as ((address->>'city'))    stored,
  address_pincode               text         generated always as ((address->>'pincode')) stored,
  emergency_contact_name        text,
  emergency_contact_mobile      text,
  emergency_contact_relation    text,
  created_via                   text         not null default 'web',
  is_deceased                   boolean      not null default false,
  deceased_at                   date,
  -- uniform block
  created_by                    uuid         not null references users(id) on delete set null,
  created_at                    timestamptz  not null default now(),
  updated_by                    uuid         references users(id) on delete set null,
  updated_at                    timestamptz  not null default now(),
  version                       int          not null default 0,
  deleted_at                    timestamptz,
  deleted_by                    uuid         references users(id) on delete set null,
  constraint chk_patients_first_name_len      check (char_length(first_name) between 1 and 60),
  constraint chk_patients_last_name_len       check (char_length(last_name)  between 1 and 60),
  constraint chk_patients_dob                 check (date_of_birth <= current_date),
  constraint chk_patients_gender              check (gender in ('m','f','o')),
  constraint chk_patients_blood_group         check (blood_group is null or blood_group in ('A+','A-','B+','B-','AB+','AB-','O+','O-','unknown')),
  constraint chk_patients_mobile_len          check (mobile is null or char_length(mobile) between 10 and 15),
  constraint chk_patients_alt_mobile_len      check (alt_mobile is null or char_length(alt_mobile) between 10 and 15),
  constraint chk_patients_emergency_mobile_len check (emergency_contact_mobile is null or char_length(emergency_contact_mobile) between 10 and 15),
  constraint chk_patients_created_via         check (created_via in ('web','android','ios','api','migration')),
  constraint chk_patients_deceased            check (deceased_at is null or (is_deceased = true and deceased_at <= current_date))
);

comment on table patients is 'Core clinical entity — one row per patient. UHID generated at registration from hospital_profile UHID format. Allergies + chronic conditions live in child tables (no text[] columns).';

create unique index if not exists uq_patients_uhid       on patients (uhid)       where deleted_at is null;
create index        if not exists ix_patients_mobile     on patients (mobile)     where mobile is not null and deleted_at is null;
create index        if not exists ix_patients_first_name on patients (first_name text_pattern_ops) where deleted_at is null;
create index        if not exists ix_patients_last_name  on patients (last_name  text_pattern_ops) where deleted_at is null;
create index        if not exists ix_patients_city       on patients (address_city) where address_city is not null and deleted_at is null;

drop trigger if exists tr_patients_bu_touch on patients;
create trigger tr_patients_bu_touch
  before update on patients
  for each row execute function fn_touch_updated();

drop trigger if exists tr_patients_au_audit on patients;
create trigger tr_patients_au_audit
  after insert or update or delete on patients
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- patient_govt_ids
-- ---------------------------------------------------------------------
create table if not exists patient_govt_ids (
  id            uuid         primary key default uuidv7(),
  patient_id    uuid         not null references patients(id) on delete cascade,
  id_type       text         not null,
  id_number     text         not null,
  -- uniform block
  created_by    uuid         not null references users(id) on delete set null,
  created_at    timestamptz  not null default now(),
  updated_by    uuid         references users(id) on delete set null,
  updated_at    timestamptz  not null default now(),
  version       int          not null default 0,
  deleted_at    timestamptz,
  deleted_by    uuid         references users(id) on delete set null,
  constraint chk_patient_govt_ids_type       check (id_type in ('aadhaar','pan','voter_id','passport','driving_licence','ration_card','other')),
  constraint chk_patient_govt_ids_number_len check (char_length(id_number) between 1 and 50)
);

comment on table patient_govt_ids is 'Government-issued identity documents per patient. One row per (patient × id_type). Aadhaar must be stored masked (last 4 digits visible) — enforced by the app, not the schema.';

create unique index if not exists uq_patient_govt_ids_type    on patient_govt_ids (patient_id, id_type) where deleted_at is null;
create index        if not exists ix_patient_govt_ids_patient on patient_govt_ids (patient_id)         where deleted_at is null;

drop trigger if exists tr_patient_govt_ids_bu_touch on patient_govt_ids;
create trigger tr_patient_govt_ids_bu_touch
  before update on patient_govt_ids
  for each row execute function fn_touch_updated();

drop trigger if exists tr_patient_govt_ids_au_audit on patient_govt_ids;
create trigger tr_patient_govt_ids_au_audit
  after insert or update or delete on patient_govt_ids
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- patient_merges  (L2 maker-checker)
-- ---------------------------------------------------------------------
create table if not exists patient_merges (
  id                      uuid         primary key default uuidv7(),
  primary_patient_id      uuid         not null references patients(id) on delete restrict,
  secondary_patient_id    uuid         not null references patients(id) on delete restrict,
  merge_reason            text,
  before_state            jsonb        not null,
  -- L2 maker-checker
  approval_status         text         not null default 'pending',
  approved_by             uuid         references users(id) on delete set null,
  approved_at             timestamptz,
  rejection_reason        text,
  -- uniform block
  created_by              uuid         not null references users(id) on delete set null,
  created_at              timestamptz  not null default now(),
  updated_by              uuid         references users(id) on delete set null,
  updated_at              timestamptz  not null default now(),
  version                 int          not null default 0,
  deleted_at              timestamptz,
  deleted_by              uuid         references users(id) on delete set null,
  constraint chk_patient_merges_not_self          check (primary_patient_id <> secondary_patient_id),
  constraint chk_patient_merges_status            check (approval_status in ('pending','approved','rejected')),
  constraint chk_patient_merges_maker_checker     check (approval_status = 'pending' or (created_by is not null and approved_by is not null and created_by <> approved_by)),
  constraint chk_patient_merges_approval_consistency check (
    (approval_status = 'pending'  and approved_by is null and approved_at is null) or
    (approval_status = 'approved' and approved_by is not null and approved_at is not null) or
    (approval_status = 'rejected' and rejection_reason is not null)
  )
);

comment on table patient_merges is 'Duplicate-patient merge records. Primary survives, secondary is soft-deleted, clinical rows re-pointed to primary. before_state captures secondary row for unmerge. L2 maker-checker — created_by must differ from approved_by.';

create index if not exists ix_patient_merges_primary   on patient_merges (primary_patient_id)   where deleted_at is null;
create index if not exists ix_patient_merges_secondary on patient_merges (secondary_patient_id) where deleted_at is null;
create index if not exists ix_patient_merges_pending   on patient_merges (approval_status)      where approval_status = 'pending' and deleted_at is null;

drop trigger if exists tr_patient_merges_bu_touch on patient_merges;
create trigger tr_patient_merges_bu_touch
  before update on patient_merges
  for each row execute function fn_touch_updated();

drop trigger if exists tr_patient_merges_au_audit on patient_merges;
create trigger tr_patient_merges_au_audit
  after insert or update or delete on patient_merges
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- patient_allergies
-- ---------------------------------------------------------------------
create table if not exists patient_allergies (
  id            uuid         primary key default uuidv7(),
  patient_id    uuid         not null references patients(id) on delete cascade,
  allergy_id    uuid         not null references allergies_lookup(id) on delete restrict,
  severity      text         not null,
  reaction      text,
  onset_date    date,
  source        text         not null default 'patient_reported',
  notes         text,
  -- uniform block
  created_by    uuid         not null references users(id) on delete set null,
  created_at    timestamptz  not null default now(),
  updated_by    uuid         references users(id) on delete set null,
  updated_at    timestamptz  not null default now(),
  version       int          not null default 0,
  deleted_at    timestamptz,
  deleted_by    uuid         references users(id) on delete set null,
  constraint chk_patient_allergies_severity check (severity in ('mild','moderate','severe','life_threatening')),
  constraint chk_patient_allergies_onset    check (onset_date is null or onset_date <= current_date),
  constraint chk_patient_allergies_source   check (source in ('patient_reported','doctor_recorded','medical_records'))
);

comment on table patient_allergies is 'Active allergies per patient with clinical detail. Replaces v2 patients.allergies text[] column. Linked to allergies_lookup catalogue (Module 06).';

create unique index if not exists uq_patient_allergies_active   on patient_allergies (patient_id, allergy_id) where deleted_at is null;
create index        if not exists ix_patient_allergies_patient  on patient_allergies (patient_id)              where deleted_at is null;
create index        if not exists ix_patient_allergies_allergy  on patient_allergies (allergy_id)              where deleted_at is null;

drop trigger if exists tr_patient_allergies_bu_touch on patient_allergies;
create trigger tr_patient_allergies_bu_touch
  before update on patient_allergies
  for each row execute function fn_touch_updated();

drop trigger if exists tr_patient_allergies_au_audit on patient_allergies;
create trigger tr_patient_allergies_au_audit
  after insert or update or delete on patient_allergies
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- patient_chronic_conditions
-- ---------------------------------------------------------------------
create table if not exists patient_chronic_conditions (
  id                  uuid         primary key default uuidv7(),
  patient_id          uuid         not null references patients(id) on delete cascade,
  condition_id        uuid         not null references chronic_conditions_lookup(id) on delete restrict,
  diagnosed_date      date,
  severity            text,
  controlled_status   text         not null default 'unknown',
  is_resolved         boolean      not null default false,
  resolved_date       date,
  notes               text,
  -- uniform block
  created_by          uuid         not null references users(id) on delete set null,
  created_at          timestamptz  not null default now(),
  updated_by          uuid         references users(id) on delete set null,
  updated_at          timestamptz  not null default now(),
  version             int          not null default 0,
  deleted_at          timestamptz,
  deleted_by          uuid         references users(id) on delete set null,
  constraint chk_patient_chronic_conditions_diagnosed  check (diagnosed_date is null or diagnosed_date <= current_date),
  constraint chk_patient_chronic_conditions_severity   check (severity is null or severity in ('mild','moderate','severe')),
  constraint chk_patient_chronic_conditions_controlled check (controlled_status in ('controlled','partially_controlled','uncontrolled','unknown')),
  constraint chk_patient_chronic_conditions_resolved   check (
    (is_resolved = false and resolved_date is null) or
    (is_resolved = true  and resolved_date is not null and resolved_date <= current_date)
  )
);

comment on table patient_chronic_conditions is 'Active chronic conditions per patient. Replaces v2 patients.chronic_conditions text[] column. is_resolved preserves history (vs soft-delete).';

create unique index if not exists uq_patient_chronic_conditions_active   on patient_chronic_conditions (patient_id, condition_id) where deleted_at is null;
create index        if not exists ix_patient_chronic_conditions_patient  on patient_chronic_conditions (patient_id)                where deleted_at is null;
create index        if not exists ix_patient_chronic_conditions_condition on patient_chronic_conditions (condition_id)              where deleted_at is null;

drop trigger if exists tr_patient_chronic_conditions_bu_touch on patient_chronic_conditions;
create trigger tr_patient_chronic_conditions_bu_touch
  before update on patient_chronic_conditions
  for each row execute function fn_touch_updated();

drop trigger if exists tr_patient_chronic_conditions_au_audit on patient_chronic_conditions;
create trigger tr_patient_chronic_conditions_au_audit
  after insert or update or delete on patient_chronic_conditions
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- uhid_sequences  (per-year atomic counter)
-- ---------------------------------------------------------------------
create table if not exists uhid_sequences (
  year      int          primary key,
  last_seq  bigint       not null default 0
);

comment on table uhid_sequences is 'Per-year atomic UHID counter. Service increments via INSERT … ON CONFLICT DO UPDATE RETURNING — safe under concurrent registrations. Formatted UHID is assembled in UhidService using hospital_profile UHID columns.';
