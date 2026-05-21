-- =====================================================================
-- 034_11_consultation.sql
-- Module 11 — Clinical Consultation
-- Tables: vitals, consultations, diagnosis_templates, prescriptions,
--         prescription_items, doctor_recommendations
--
-- Cross-module FKs:
--   * prescription_items.medicine_id  → drug_catalogue(id) — Module 14
--   * doctor_recommendations.lab_order_id     → lab_orders(id) — Module 12
--   * doctor_recommendations.radiology_order_id → radiology_orders(id) — Module 13
--   * doctor_recommendations.follow_up_appointment_id → appointments(id) — already exists
-- All wired in 099_cross_module_fks.sql (the appointments one wired here).
-- Spec: docs/03-schema/v3/modules/11-consultation.html
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- vitals
-- ---------------------------------------------------------------------
create table if not exists vitals (
  id                  uuid         primary key default uuidv7(),
  patient_id          uuid         not null references patients(id)  on delete restrict,
  op_visit_id         uuid         references op_visits(id) on delete restrict,
  bp_systolic         int,
  bp_diastolic        int,
  pulse_rate          int,
  spo2                int,
  temperature_f       numeric(4,1),
  respiratory_rate    int,
  weight_kg           numeric(5,2),
  height_cm           numeric(5,2),
  bmi                 numeric(6,2) generated always as (weight_kg / nullif((height_cm/100)^2, 0)) stored,
  blood_sugar_mg_dl   int,
  pain_score          int,
  notes               text,
  -- uniform block
  created_by          uuid         not null references users(id) on delete set null,
  created_at          timestamptz  not null default now(),
  updated_by          uuid         references users(id) on delete set null,
  updated_at          timestamptz  not null default now(),
  version             int          not null default 0,
  deleted_at          timestamptz,
  deleted_by          uuid         references users(id) on delete set null,
  constraint chk_vitals_bp_systolic  check (bp_systolic       is null or bp_systolic       between 60  and 300),
  constraint chk_vitals_bp_diastolic check (bp_diastolic      is null or bp_diastolic      between 30  and 200),
  constraint chk_vitals_pulse        check (pulse_rate        is null or pulse_rate        between 20  and 300),
  constraint chk_vitals_spo2         check (spo2              is null or spo2              between 0   and 100),
  constraint chk_vitals_temp         check (temperature_f     is null or temperature_f     between 90.0 and 115.0),
  constraint chk_vitals_rr           check (respiratory_rate  is null or respiratory_rate  between 5   and 60),
  constraint chk_vitals_weight       check (weight_kg         is null or weight_kg         between 0.5 and 500),
  constraint chk_vitals_height       check (height_cm         is null or height_cm         between 10  and 300),
  constraint chk_vitals_bsl          check (blood_sugar_mg_dl is null or blood_sugar_mg_dl between 10  and 1500),
  constraint chk_vitals_pain         check (pain_score        is null or pain_score        between 0   and 10)
);

comment on table vitals is 'Vital signs snapshot — captured by the nurse before consultation. Multiple rows per visit allowed (e.g. BP recheck). created_by = recording nurse.';

create index if not exists ix_vitals_visit   on vitals (op_visit_id, created_at desc) where op_visit_id is not null;
create index if not exists ix_vitals_patient on vitals (patient_id, created_at desc)  where deleted_at is null;

drop trigger if exists tr_vitals_bu_touch on vitals;
create trigger tr_vitals_bu_touch
  before update on vitals
  for each row execute function fn_touch_updated();

drop trigger if exists tr_vitals_au_audit on vitals;
create trigger tr_vitals_au_audit
  after insert or update or delete on vitals
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- consultations
-- ---------------------------------------------------------------------
create table if not exists consultations (
  id                            uuid         primary key default uuidv7(),
  op_visit_id                   uuid         not null references op_visits(id) on delete restrict,
  status                        text         not null default 'draft',
  patient_id                    uuid         not null references patients(id) on delete restrict,
  doctor_id                     uuid         not null references users(id)    on delete restrict,
  chief_complaint               text,
  history_of_present_illness    text,
  past_history                  text,
  examination_findings          jsonb,
  diagnoses                     jsonb        not null default '[]'::jsonb,
  symptoms                      text,
  clinical_notes                text,
  advice                        text,
  next_action                   text         not null,
  follow_up_required            boolean      not null default false,
  follow_up_date                date,
  locked_at                     timestamptz,
  -- uniform block
  created_by                    uuid         not null references users(id) on delete set null,
  created_at                    timestamptz  not null default now(),
  updated_by                    uuid         references users(id) on delete set null,
  updated_at                    timestamptz  not null default now(),
  version                       int          not null default 0,
  deleted_at                    timestamptz,
  deleted_by                    uuid         references users(id) on delete set null,
  constraint chk_consultations_status      check (status in ('draft','locked')),
  constraint chk_consultations_next_action check (next_action in ('prescription_only','lab_ordered','radiology_ordered','admit_ip','surgery_referral','follow_up','referred_external','no_action')),
  constraint chk_consultations_follow_up   check (follow_up_required = true or follow_up_date is null)
);

comment on table consultations is 'Doctor''s full clinical record for one OP visit. status=draft while doctor typing (autosave updates this row); status=locked when complete (row read-only thereafter via tr_consultations_bu_lock_guard).';

create unique index if not exists uq_consultations_visit       on consultations (op_visit_id);
create index        if not exists ix_consultations_patient     on consultations (patient_id, created_at desc) where deleted_at is null;
create index        if not exists ix_consultations_doctor      on consultations (doctor_id,  created_at desc) where deleted_at is null;
create index        if not exists ix_consultations_follow_up   on consultations (follow_up_date) where follow_up_required = true and deleted_at is null;
create index        if not exists ix_consultations_diagnoses   on consultations using gin (diagnoses);

-- lock-guard trigger: once status = 'locked', clinical columns cannot change
create or replace function fn_consultations_lock_guard()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'locked' then
    if  new.chief_complaint            is distinct from old.chief_complaint
     or new.history_of_present_illness is distinct from old.history_of_present_illness
     or new.past_history               is distinct from old.past_history
     or new.examination_findings       is distinct from old.examination_findings
     or new.diagnoses                  is distinct from old.diagnoses
     or new.symptoms                   is distinct from old.symptoms
     or new.clinical_notes             is distinct from old.clinical_notes
     or new.advice                     is distinct from old.advice
     or new.next_action                is distinct from old.next_action
     or new.follow_up_required         is distinct from old.follow_up_required
     or new.follow_up_date             is distinct from old.follow_up_date
    then
      raise exception 'consultation % is locked — clinical fields cannot be modified', old.id
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tr_consultations_bu_touch on consultations;
create trigger tr_consultations_bu_touch
  before update on consultations
  for each row execute function fn_touch_updated();

drop trigger if exists tr_consultations_bu_lock_guard on consultations;
create trigger tr_consultations_bu_lock_guard
  before update on consultations
  for each row execute function fn_consultations_lock_guard();

drop trigger if exists tr_consultations_au_audit on consultations;
create trigger tr_consultations_au_audit
  after insert or update or delete on consultations
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- diagnosis_templates
-- ---------------------------------------------------------------------
create table if not exists diagnosis_templates (
  id                       uuid         primary key default uuidv7(),
  template_name            text         not null,
  department_id            uuid         references departments(id) on delete restrict,
  specialty                text,
  icd10_code               text,
  diagnosis_text           text         not null,
  template_json            jsonb        not null,
  default_advice           text,
  default_followup_days    int,
  -- uniform block
  created_by               uuid         not null references users(id) on delete set null,
  created_at               timestamptz  not null default now(),
  updated_by               uuid         references users(id) on delete set null,
  updated_at               timestamptz  not null default now(),
  version                  int          not null default 0,
  deleted_at               timestamptz,
  deleted_by               uuid         references users(id) on delete set null,
  constraint chk_diagnosis_templates_followup check (default_followup_days is null or default_followup_days > 0)
);

comment on table diagnosis_templates is 'Reusable consultation templates per specialty / diagnosis. Auto-fills examination structure, common meds, routine tests into the consultation form.';

create index if not exists ix_diagnosis_templates_department on diagnosis_templates (department_id)        where deleted_at is null;
create index if not exists ix_diagnosis_templates_specialty  on diagnosis_templates (specialty)            where deleted_at is null;
create index if not exists ix_diagnosis_templates_name       on diagnosis_templates (lower(template_name)) where deleted_at is null;

drop trigger if exists tr_diagnosis_templates_bu_touch on diagnosis_templates;
create trigger tr_diagnosis_templates_bu_touch
  before update on diagnosis_templates
  for each row execute function fn_touch_updated();

drop trigger if exists tr_diagnosis_templates_au_audit on diagnosis_templates;
create trigger tr_diagnosis_templates_au_audit
  after insert or update or delete on diagnosis_templates
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- prescriptions
-- ---------------------------------------------------------------------
create table if not exists prescriptions (
  id               uuid         primary key default uuidv7(),
  consultation_id  uuid         not null references consultations(id) on delete restrict,
  patient_id       uuid         not null references patients(id)      on delete restrict,
  doctor_id        uuid         not null references users(id)         on delete restrict,
  status           text         not null default 'draft',
  locked_at        timestamptz,
  -- uniform block
  created_by       uuid         not null references users(id) on delete set null,
  created_at       timestamptz  not null default now(),
  updated_by       uuid         references users(id) on delete set null,
  updated_at       timestamptz  not null default now(),
  version          int          not null default 0,
  deleted_at       timestamptz,
  deleted_by       uuid         references users(id) on delete set null,
  constraint chk_prescriptions_status check (status in ('draft','active','partially_dispensed','dispensed','cancelled'))
);

comment on table prescriptions is 'Prescription header — one per consultation. status drives pharmacy fulfilment workflow.';

create unique index if not exists uq_prescriptions_consultation on prescriptions (consultation_id);
create index        if not exists ix_prescriptions_patient      on prescriptions (patient_id, created_at desc) where deleted_at is null;
create index        if not exists ix_prescriptions_pharmacy     on prescriptions (status, created_at) where status in ('active','partially_dispensed') and deleted_at is null;

drop trigger if exists tr_prescriptions_bu_touch on prescriptions;
create trigger tr_prescriptions_bu_touch
  before update on prescriptions
  for each row execute function fn_touch_updated();

drop trigger if exists tr_prescriptions_au_audit on prescriptions;
create trigger tr_prescriptions_au_audit
  after insert or update or delete on prescriptions
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- prescription_items  (medicine_id FK to drug_catalogue added in 099)
-- ---------------------------------------------------------------------
create table if not exists prescription_items (
  id                       uuid         primary key default uuidv7(),
  prescription_id          uuid         not null references prescriptions(id) on delete cascade,
  medicine_id              uuid         not null,   -- FK to drug_catalogue(id) added in 099
  medicine_name_snapshot   text         not null,
  dosage                   text         not null,
  frequency                text         not null,
  duration_days            int          not null,
  instructions             text,
  quantity_prescribed      int          not null,
  sequence_no              int          not null,
  -- uniform block
  created_by               uuid         not null references users(id) on delete set null,
  created_at               timestamptz  not null default now(),
  updated_by               uuid         references users(id) on delete set null,
  updated_at               timestamptz  not null default now(),
  version                  int          not null default 0,
  deleted_at               timestamptz,
  deleted_by               uuid         references users(id) on delete set null,
  constraint chk_prescription_items_duration       check (duration_days       > 0),
  constraint chk_prescription_items_qty_prescribed check (quantity_prescribed > 0),
  constraint chk_prescription_items_sequence       check (sequence_no         > 0)
);

comment on table prescription_items is 'Individual drug line on a prescription. medicine_name_snapshot freezes the name at prescribe time. Actual dispensing tracked in pharmacy_sale_items (Module 15) — not here.';

create unique index if not exists uq_prescription_items_sequence    on prescription_items (prescription_id, sequence_no);
create index        if not exists ix_prescription_items_prescription on prescription_items (prescription_id) where deleted_at is null;
create index        if not exists ix_prescription_items_medicine    on prescription_items (medicine_id)      where deleted_at is null;

drop trigger if exists tr_prescription_items_bu_touch on prescription_items;
create trigger tr_prescription_items_bu_touch
  before update on prescription_items
  for each row execute function fn_touch_updated();

drop trigger if exists tr_prescription_items_au_audit on prescription_items;
create trigger tr_prescription_items_au_audit
  after insert or update or delete on prescription_items
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- doctor_recommendations
-- ---------------------------------------------------------------------
create table if not exists doctor_recommendations (
  id                          uuid         primary key default uuidv7(),
  consultation_id             uuid         not null references consultations(id) on delete restrict,
  patient_id                  uuid         not null references patients(id)      on delete restrict,
  recommendation_type         text         not null,
  follow_up_appointment_id    uuid         references appointments(id) on delete restrict,
  lab_order_id                uuid,        -- FK to lab_orders(id)        added in 099
  radiology_order_id          uuid,        -- FK to radiology_orders(id)  added in 099
  referral_notes              text,
  notes                       text,
  priority                    text         not null default 'routine',
  status                      text         not null default 'open',
  -- uniform block
  created_by                  uuid         not null references users(id) on delete set null,
  created_at                  timestamptz  not null default now(),
  updated_by                  uuid         references users(id) on delete set null,
  updated_at                  timestamptz  not null default now(),
  version                     int          not null default 0,
  deleted_at                  timestamptz,
  deleted_by                  uuid         references users(id) on delete set null,
  constraint chk_doctor_recommendations_type     check (recommendation_type in ('follow_up','lab','radiology','specialist_referral','physio','surgery','admission')),
  constraint chk_doctor_recommendations_priority check (priority in ('routine','urgent','stat')),
  constraint chk_doctor_recommendations_status   check (status   in ('open','scheduled','completed','cancelled','declined'))
);

comment on table doctor_recommendations is 'Non-prescription outputs of a consultation — follow-up appointments, lab orders, radiology, referrals, physio/surgery/admission planning. Phase 2 FKs (physio/surgery/IP) deferred.';

create index if not exists ix_doctor_recommendations_consultation on doctor_recommendations (consultation_id)       where deleted_at is null;
create index if not exists ix_doctor_recommendations_patient      on doctor_recommendations (patient_id, created_at desc) where deleted_at is null;
create index if not exists ix_doctor_recommendations_open         on doctor_recommendations (recommendation_type, priority) where status = 'open' and deleted_at is null;

drop trigger if exists tr_doctor_recommendations_bu_touch on doctor_recommendations;
create trigger tr_doctor_recommendations_bu_touch
  before update on doctor_recommendations
  for each row execute function fn_touch_updated();

drop trigger if exists tr_doctor_recommendations_au_audit on doctor_recommendations;
create trigger tr_doctor_recommendations_au_audit
  after insert or update or delete on doctor_recommendations
  for each row execute function fn_audit_row();
