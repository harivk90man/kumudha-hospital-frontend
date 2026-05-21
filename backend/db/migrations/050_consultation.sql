-- =====================================================================
-- 050_consultation.sql
-- vitals, consultations, diagnosis_templates, prescriptions,
-- prescription_items, doctor_recommendations, consultation_drafts.
--
-- Spec: docs/03-schema/v2/modules/11-consultation.html
-- TSD : docs/05-tsd/07-clinical-consultation.md
--
-- NOTE: doctor_recommendations.lab_order_id and radiology_order_id FKs
-- are wired up in 060_lab.sql / 061_radiology.sql once those tables exist.
-- doctor_recommendations.follow_up_appointment_id has no FK because
-- appointments is out of scope.
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- 1. vitals
-- ---------------------------------------------------------------------
create table if not exists vitals (
  id                   uuid          primary key default gen_random_uuid(),
  tenant_id            uuid          not null references tenants(id) on delete restrict,
  patient_id           uuid          not null references patients(id) on delete restrict,
  op_visit_id          uuid          references op_visits(id) on delete set null,
  ip_admission_id      uuid,                                          -- phase 2
  temperature_f        numeric(4,1),
  weight_kg            numeric(5,2),
  height_cm            numeric(5,2),
  bmi                  numeric(5,2)
                          generated always as
                          (case
                             when height_cm is not null and weight_kg is not null and height_cm > 0
                             then weight_kg / nullif((height_cm/100.0)^2, 0)
                             else null
                           end) stored,
  bp_systolic          int,
  bp_diastolic         int,
  spo2                 int,
  pulse_rate           int,
  respiratory_rate     int,
  blood_sugar_random   numeric(6,2),
  blood_sugar_fasting  numeric(6,2),
  pain_score           int,
  notes                text,
  recorded_by          uuid          not null references users(id) on delete restrict,
  recorded_at          timestamptz   not null default now(),
  created_at           timestamptz   not null default now(),
  updated_at           timestamptz   not null default now(),
  constraint chk_vitals_spo2 check (spo2 is null or (spo2 between 0 and 100)),
  constraint chk_vitals_pain check (pain_score is null or (pain_score between 0 and 10))
);
comment on table vitals is
  'Vitals readings — temp, BP, SpO2, pulse, RR, sugar, BMI generated. OP visit, IP, or standalone.';

create index if not exists idx_vitals_visit
  on vitals(op_visit_id, recorded_at desc) where op_visit_id is not null;
create index if not exists idx_vitals_patient
  on vitals(patient_id, recorded_at desc);

drop trigger if exists trg_vitals_updated_at on vitals;
create trigger trg_vitals_updated_at
  before update on vitals
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------
-- 2. consultations
-- ---------------------------------------------------------------------
create table if not exists consultations (
  id                          uuid         primary key default gen_random_uuid(),
  tenant_id                   uuid         not null references tenants(id) on delete restrict,
  op_visit_id                 uuid         not null unique references op_visits(id) on delete restrict,
  patient_id                  uuid         not null references patients(id) on delete restrict,
  doctor_id                   uuid         not null references users(id) on delete restrict,
  chief_complaint             text,
  history_of_present_illness  text,
  past_history                text,
  examination_findings        jsonb,
  diagnoses                   jsonb[]      not null default '{}',
  symptoms                    text,
  clinical_notes              text,
  advice                      text,
  vitals_snapshot             jsonb,
  next_action                 varchar(32)  not null,
  follow_up_required          boolean      not null default false,
  follow_up_date              date,
  admission_required          boolean      not null default false,
  surgery_required            boolean      not null default false,
  physio_required             boolean      not null default false,
  locked_at                   timestamptz,
  created_by                  uuid         references users(id) on delete set null,
  created_at                  timestamptz  not null default now(),
  updated_by                  uuid         references users(id) on delete set null,
  updated_at                  timestamptz  not null default now(),
  version                     int          not null default 0,
  constraint chk_consultations_next_action check (
    next_action in ('prescription_only','lab_ordered','radiology_ordered','admit_ip',
                    'surgery_referral','follow_up','referred_external','no_action')
  )
);
comment on table consultations is
  'One doctor encounter — complaint, exam, diagnoses, advice, next action. Locked after sign-off.';

-- GIN on diagnoses for ICD-10 search across visits
create index if not exists idx_consultations_diagnoses_gin
  on consultations using gin (diagnoses);
create index if not exists idx_consultations_doctor
  on consultations(tenant_id, doctor_id, created_at desc);
create index if not exists idx_consultations_follow_up
  on consultations(tenant_id, follow_up_required, follow_up_date)
  where follow_up_required = true;

drop trigger if exists trg_consultations_updated_at on consultations;
create trigger trg_consultations_updated_at
  before update on consultations
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------
-- fn_consultations_lock_guard  (BEFORE UPDATE)
-- Once locked_at is set, blocks subsequent updates EXCEPT the lock-toggle
-- and the standard housekeeping columns (updated_at, updated_by, version).
-- App-level amendment endpoint must clear locked_at before any other edit.
-- ---------------------------------------------------------------------
create or replace function fn_consultations_lock_guard() returns trigger
language plpgsql
as $$
begin
  if old.locked_at is not null then
    -- Allow only housekeeping changes; reject any clinical edit.
    if (new.chief_complaint            is distinct from old.chief_complaint)
       or (new.history_of_present_illness is distinct from old.history_of_present_illness)
       or (new.past_history             is distinct from old.past_history)
       or (new.examination_findings     is distinct from old.examination_findings)
       or (new.diagnoses                is distinct from old.diagnoses)
       or (new.symptoms                 is distinct from old.symptoms)
       or (new.clinical_notes           is distinct from old.clinical_notes)
       or (new.advice                   is distinct from old.advice)
       or (new.vitals_snapshot          is distinct from old.vitals_snapshot)
       or (new.next_action              is distinct from old.next_action)
       or (new.follow_up_required       is distinct from old.follow_up_required)
       or (new.follow_up_date           is distinct from old.follow_up_date)
       or (new.admission_required       is distinct from old.admission_required)
       or (new.surgery_required         is distinct from old.surgery_required)
       or (new.physio_required          is distinct from old.physio_required)
    then
      raise exception 'consultation % is locked; clinical fields cannot be updated', old.id
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_consultations_lock_guard on consultations;
create trigger trg_consultations_lock_guard
  before update on consultations
  for each row execute function fn_consultations_lock_guard();

-- ---------------------------------------------------------------------
-- 3. diagnosis_templates
-- ---------------------------------------------------------------------
create table if not exists diagnosis_templates (
  id                       uuid         primary key default gen_random_uuid(),
  tenant_id                uuid         not null references tenants(id) on delete restrict,
  template_name            varchar(200) not null,
  department_id            uuid         references departments(id) on delete set null,
  specialty                varchar(120),
  icd10_code               varchar(16),
  diagnosis_text           text         not null,
  template_json            jsonb        not null,
  default_advice           text,
  default_followup_days    int,
  created_by               uuid         references users(id) on delete set null,
  is_active                boolean      not null default true,
  created_at               timestamptz  not null default now(),
  updated_at               timestamptz  not null default now()
);
comment on table diagnosis_templates is
  'Pre-built diagnosis bundles — exam, common meds, common tests. Speeds up frequent presentations.';

create index if not exists idx_diagnosis_templates_dept
  on diagnosis_templates(tenant_id, department_id, is_active);
create index if not exists idx_diagnosis_templates_name
  on diagnosis_templates(tenant_id, lower(template_name));

drop trigger if exists trg_diagnosis_templates_updated_at on diagnosis_templates;
create trigger trg_diagnosis_templates_updated_at
  before update on diagnosis_templates
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------
-- 4. prescriptions
-- ---------------------------------------------------------------------
create table if not exists prescriptions (
  id                uuid         primary key default gen_random_uuid(),
  tenant_id         uuid         not null references tenants(id) on delete restrict,
  consultation_id   uuid         not null unique references consultations(id) on delete restrict,
  patient_id        uuid         not null references patients(id) on delete restrict,
  doctor_id         uuid         not null references users(id) on delete restrict,
  status            varchar(32)  not null default 'draft',
  locked_at         timestamptz,
  created_by        uuid         references users(id) on delete set null,
  created_at        timestamptz  not null default now(),
  updated_by        uuid         references users(id) on delete set null,
  updated_at        timestamptz  not null default now(),
  version           int          not null default 0,
  constraint chk_prescriptions_status check (
    status in ('draft','active','dispensed','partially_dispensed','cancelled')
  )
);
comment on table prescriptions is
  'Prescription header per consultation. Tracks dispensing status across pharmacy.';

create index if not exists idx_prescriptions_patient
  on prescriptions(tenant_id, patient_id, created_at desc);
create index if not exists idx_prescriptions_status
  on prescriptions(tenant_id, status, created_at desc)
  where status in ('active','partially_dispensed');

drop trigger if exists trg_prescriptions_updated_at on prescriptions;
create trigger trg_prescriptions_updated_at
  before update on prescriptions
  for each row execute function fn_set_updated_at();

-- Now wire narcotic_register.prescription_id FK
alter table narcotic_register
  add constraint fk_narcotic_register_prescription
  foreign key (prescription_id) references prescriptions(id) on delete set null;

-- ---------------------------------------------------------------------
-- 5. prescription_items
-- ---------------------------------------------------------------------
create table if not exists prescription_items (
  id                       uuid         primary key default gen_random_uuid(),
  prescription_id          uuid         not null references prescriptions(id) on delete cascade,
  medicine_id              uuid         not null references medicines(id) on delete restrict,
  medicine_name_snapshot   varchar(200) not null,
  dosage                   varchar(64)  not null,
  frequency                varchar(32)  not null,
  duration_days            int          not null,
  instructions             text,
  quantity_prescribed      int          not null,
  dispensed_qty            int          not null default 0,
  sequence_no              int          not null,
  created_at               timestamptz  not null default now(),
  constraint chk_prescription_items_qty_prescribed check (quantity_prescribed > 0),
  constraint chk_prescription_items_dispensed      check (dispensed_qty >= 0),
  constraint uq_prescription_items_sequence        unique (prescription_id, sequence_no)
);
comment on table prescription_items is
  'One drug per row — dosage, frequency, duration, qty prescribed vs dispensed. Stable display order via sequence_no.';

create index if not exists idx_prescription_items_medicine
  on prescription_items(prescription_id, medicine_id);

-- ---------------------------------------------------------------------
-- 6. doctor_recommendations
-- ---------------------------------------------------------------------
create table if not exists doctor_recommendations (
  id                          uuid         primary key default gen_random_uuid(),
  tenant_id                   uuid         not null references tenants(id) on delete restrict,
  consultation_id             uuid         not null references consultations(id) on delete cascade,
  patient_id                  uuid         not null references patients(id) on delete restrict,
  recommendation_type         varchar(32)  not null,
  physio_session_id           uuid,                                  -- phase 2
  surgery_schedule_id         uuid,                                  -- phase 2
  ip_admission_id             uuid,                                  -- phase 2
  follow_up_appointment_id    uuid,                                  -- appointments module out of scope
  lab_order_id                uuid,                                  -- FK added in 060_lab.sql
  radiology_order_id          uuid,                                  -- FK added in 061_radiology.sql
  external_referral_id        uuid,
  notes                       text,
  priority                    varchar(16)  not null default 'routine',
  status                      varchar(16)  not null default 'open',
  created_by                  uuid         references users(id) on delete set null,
  created_at                  timestamptz  not null default now(),
  updated_at                  timestamptz  not null default now(),
  constraint chk_doctor_recommendations_type check (
    recommendation_type in ('physio','surgery','admission','follow_up','lab','radiology','specialist_referral')
  ),
  constraint chk_doctor_recommendations_priority check (priority in ('routine','urgent','stat')),
  constraint chk_doctor_recommendations_status   check (
    status in ('open','scheduled','completed','cancelled','declined')
  ),
  constraint chk_doctor_recommendations_one_fk check (
    num_nonnulls(physio_session_id, surgery_schedule_id, ip_admission_id,
                 follow_up_appointment_id, lab_order_id, radiology_order_id,
                 external_referral_id) <= 1
  ),
  constraint chk_doctor_recommendations_external_referral check (
    recommendation_type = 'specialist_referral' or external_referral_id is null
  )
);
comment on table doctor_recommendations is
  'Non-Rx outputs — physio, surgery, admission, follow-up, lab, radiology, specialist referral. At-most-one-non-null FK.';

create index if not exists idx_doctor_rec_worklist
  on doctor_recommendations(tenant_id, status, recommendation_type, priority);
create index if not exists idx_doctor_rec_consultation
  on doctor_recommendations(consultation_id);
create index if not exists idx_doctor_rec_patient
  on doctor_recommendations(patient_id, status, created_at desc);
create index if not exists idx_doctor_rec_lab_order
  on doctor_recommendations(lab_order_id) where lab_order_id is not null;
create index if not exists idx_doctor_rec_radiology_order
  on doctor_recommendations(radiology_order_id) where radiology_order_id is not null;

drop trigger if exists trg_doctor_recommendations_updated_at on doctor_recommendations;
create trigger trg_doctor_recommendations_updated_at
  before update on doctor_recommendations
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------
-- 7. consultation_drafts
-- ---------------------------------------------------------------------
create table if not exists consultation_drafts (
  id                uuid         primary key default gen_random_uuid(),
  tenant_id         uuid         not null references tenants(id) on delete restrict,
  doctor_id         uuid         not null references users(id) on delete cascade,
  patient_id        uuid         not null references patients(id) on delete cascade,
  op_visit_id       uuid         references op_visits(id) on delete cascade,
  ip_admission_id   uuid,                          -- phase 2
  draft_data        jsonb        not null,
  autosave_count    int          not null default 0,
  last_saved_at     timestamptz  not null default now(),
  expires_at        timestamptz  not null default (now() + interval '7 days'),
  restored_at       timestamptz
);
comment on table consultation_drafts is
  'Auto-saved in-progress consultation data. Restores work if browser/session is lost. 7-day TTL.';

create unique index if not exists uq_consultation_drafts_visit
  on consultation_drafts(doctor_id, op_visit_id) where op_visit_id is not null;
create index if not exists idx_consultation_drafts_expiry
  on consultation_drafts(expires_at) where restored_at is null;
create index if not exists idx_consultation_drafts_data_gin
  on consultation_drafts using gin (draft_data);
