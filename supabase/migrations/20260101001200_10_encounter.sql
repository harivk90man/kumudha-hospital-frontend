-- =====================================================================
-- 033_10_encounter.sql
-- Module 10 — OPD Encounter
-- Tables: op_visits, patient_states
--
-- Cross-module FK (op_visits.appointment_id → appointments(id)) is
-- added below since appointments already exists at this point (032).
-- Tokens.op_visit_id FK to op_visits is added at the end of this file.
-- Spec: docs/03-schema/v3/modules/10-encounter.html
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- op_visits
-- ---------------------------------------------------------------------
create table if not exists op_visits (
  id                    uuid         primary key default uuidv7(),
  op_number             text         not null,
  patient_id            uuid         not null references patients(id) on delete restrict,
  appointment_id        uuid         references appointments(id) on delete restrict,
  doctor_id             uuid         not null references users(id) on delete restrict,
  visit_date            date         not null,
  chief_complaint       text,
  closed_at             timestamptz,
  is_emergency          boolean      not null default false,
  emergency_triage      text,
  is_mlc                boolean      not null default false,
  mlc_number            text,
  -- uniform block
  created_by            uuid         not null references users(id) on delete set null,
  created_at            timestamptz  not null default now(),
  updated_by            uuid         references users(id) on delete set null,
  updated_at            timestamptz  not null default now(),
  version               int          not null default 0,
  deleted_at            timestamptz,
  deleted_by            uuid         references users(id) on delete set null,
  constraint chk_op_visits_triage                check (emergency_triage is null or emergency_triage in ('red','yellow','green')),
  constraint chk_op_visits_emergency_consistency check (is_emergency = true or emergency_triage is null),
  constraint chk_op_visits_mlc_consistency       check (is_mlc = true or mlc_number is null)
);

comment on table op_visits is 'One row per outpatient encounter. Aggregate root — consultations, vitals, prescriptions, lab/radiology orders, invoices all FK back here. Current stage derived from patient_states (no status column).';

create unique index if not exists uq_op_visits_number     on op_visits (op_number) where deleted_at is null;
create index        if not exists ix_op_visits_patient    on op_visits (patient_id, visit_date desc) where deleted_at is null;
create index        if not exists ix_op_visits_doctor     on op_visits (doctor_id,  visit_date)      where deleted_at is null;
create index        if not exists ix_op_visits_date       on op_visits (visit_date)                  where deleted_at is null;
create index        if not exists ix_op_visits_emergency  on op_visits (visit_date)                  where is_emergency = true and deleted_at is null;

drop trigger if exists tr_op_visits_bu_touch on op_visits;
create trigger tr_op_visits_bu_touch
  before update on op_visits
  for each row execute function fn_touch_updated();

drop trigger if exists tr_op_visits_au_audit on op_visits;
create trigger tr_op_visits_au_audit
  after insert or update or delete on op_visits
  for each row execute function fn_audit_row();

-- now wire tokens.op_visit_id (forward-declared in 032)
alter table tokens
  add constraint fk_tokens_op_visit foreign key (op_visit_id) references op_visits(id) on delete restrict;

-- ---------------------------------------------------------------------
-- patient_states  (append log of every stage; left_at IS NULL = active)
-- ---------------------------------------------------------------------
create table if not exists patient_states (
  id            uuid         primary key default uuidv7(),
  patient_id    uuid         not null references patients(id)  on delete restrict,
  op_visit_id   uuid         not null references op_visits(id) on delete restrict,
  station_id    uuid         not null references stations(id)  on delete restrict,
  entered_at    timestamptz  not null default now(),
  left_at       timestamptz,
  metadata      jsonb        not null default '{}'::jsonb,
  -- uniform block
  created_by    uuid         not null references users(id) on delete set null,
  created_at    timestamptz  not null default now(),
  updated_by    uuid         references users(id) on delete set null,
  updated_at    timestamptz  not null default now(),
  version       int          not null default 0,
  deleted_at    timestamptz,
  deleted_by    uuid         references users(id) on delete set null
);

comment on table patient_states is 'Append log of every stage a patient passes through after payment. left_at = NULL means currently here. uq_patient_states_one_active rejects a second active row per visit at the DB layer.';

create unique index if not exists uq_patient_states_one_active
  on patient_states (op_visit_id)
  where left_at is null;

create index if not exists ix_patient_states_visit          on patient_states (op_visit_id, entered_at asc);
create index if not exists ix_patient_states_station_active on patient_states (station_id, entered_at asc) where left_at is null;
create index if not exists ix_patient_states_patient_active on patient_states (patient_id) where left_at is null;

drop trigger if exists tr_patient_states_bu_touch on patient_states;
create trigger tr_patient_states_bu_touch
  before update on patient_states
  for each row execute function fn_touch_updated();

drop trigger if exists tr_patient_states_au_audit on patient_states;
create trigger tr_patient_states_au_audit
  after insert or update or delete on patient_states
  for each row execute function fn_audit_row();
