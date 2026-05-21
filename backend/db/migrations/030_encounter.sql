-- =====================================================================
-- 030_encounter.sql
-- op_visits + patient_queue + back-fills for patient_journey_events.
--
-- Spec: docs/03-schema/v2/modules/10-encounter.html
-- TSD : docs/05-tsd/06-opd-encounters.md
--
-- NOTE: op_visits.appointment_id has NO FK because the appointments
-- module is out of scope for this doctor-flow migration. Marked as
-- nullable uuid; FK can be added in a later migration.
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- 1. op_visits
-- ---------------------------------------------------------------------
create table if not exists op_visits (
  id                   uuid         primary key default gen_random_uuid(),
  tenant_id            uuid         not null references tenants(id) on delete restrict,
  op_number            varchar(32)  not null,
  patient_id           uuid         not null references patients(id) on delete restrict,
  appointment_id       uuid,                                            -- FK target lives outside doctor-flow scope
  doctor_id            uuid         not null references users(id) on delete restrict,
  visit_date           date         not null,
  token_number         varchar(32)  not null,
  chief_complaint      text,
  is_emergency         boolean      not null default false,
  emergency_triage     varchar(16),
  current_state_code   int          references patient_states(code) on delete restrict,
  is_mlc               boolean      not null default false,
  mlc_number           varchar(64),
  created_by           uuid         references users(id) on delete set null,
  created_at           timestamptz  not null default now(),
  updated_by           uuid         references users(id) on delete set null,
  updated_at           timestamptz  not null default now(),
  version              int          not null default 0,
  constraint chk_op_visits_emergency_triage
    check (emergency_triage is null or emergency_triage in ('red','yellow','green')),
  constraint uq_op_visits_op_number unique (op_number)
);
comment on table  op_visits is
  'One outpatient visit. OP number, doctor, chief complaint, current state — entry point for OP workflow. is_mlc flag for medico-legal cases.';
comment on column op_visits.current_state_code is
  'Denormalized from patient_journey_events (latest to_state_code). Synced by trigger — do not write from app code.';

create index if not exists idx_op_visits_doctor
  on op_visits(tenant_id, doctor_id, visit_date, current_state_code);
create index if not exists idx_op_visits_patient
  on op_visits(tenant_id, patient_id, visit_date desc);
create index if not exists idx_op_visits_emergency
  on op_visits(tenant_id, is_emergency, visit_date) where is_emergency = true;

drop trigger if exists trg_op_visits_updated_at on op_visits;
create trigger trg_op_visits_updated_at
  before update on op_visits
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------
-- Back-fill: patient_journey_events.op_visit_id FK now that op_visits exists.
-- ---------------------------------------------------------------------
alter table patient_journey_events
  add constraint fk_journey_events_op_visit
  foreign key (op_visit_id) references op_visits(id) on delete restrict;

-- ---------------------------------------------------------------------
-- 2. patient_queue
-- ---------------------------------------------------------------------
create table if not exists patient_queue (
  id                       uuid         primary key default gen_random_uuid(),
  tenant_id                uuid         not null references tenants(id) on delete restrict,
  patient_id               uuid         not null references patients(id) on delete restrict,
  op_visit_id              uuid         references op_visits(id) on delete cascade,
  parent_queue_id          uuid         references patient_queue(id) on delete set null,
  station_id               int          not null references stations(code) on delete restrict,
  state_code               int          references patient_states(code) on delete restrict,
  status                   varchar(32)  not null default 'waiting',
  priority                 varchar(16)  not null default 'normal',
  token_number             varchar(32)  not null,
  queue_position           int,
  referred_by_user_id      uuid         references users(id) on delete set null,
  referral_reason          varchar(120),
  return_to_station_id     int          references stations(code) on delete set null,
  return_to_provider_id    uuid         references users(id) on delete set null,
  metadata                 jsonb,
  entered_at               timestamptz  not null default now(),
  called_at                timestamptz,
  completed_at             timestamptz,
  constraint chk_patient_queue_status check (
    status in ('waiting','in_service','paused','completed','returned_for_review','left')
  ),
  constraint chk_patient_queue_priority check (priority in ('normal','urgent','emergency'))
);
comment on table patient_queue is
  'Live queue rows — where every active patient is right now. Side-trip support via parent_queue_id self-FK.';

create index if not exists idx_patient_queue_station_status
  on patient_queue(tenant_id, station_id, status, queue_position);
create index if not exists idx_patient_queue_visit
  on patient_queue(op_visit_id);
create index if not exists idx_patient_queue_review_provider
  on patient_queue(tenant_id, return_to_provider_id) where return_to_provider_id is not null;

-- ---------------------------------------------------------------------
-- fn_sync_op_visit_state  (AFTER INSERT on patient_journey_events)
-- Sets op_visits.current_state_code to the latest to_state_code for the visit.
-- (Defined here because the function body references op_visits which only
-- now exists.)
-- ---------------------------------------------------------------------
create or replace function fn_sync_op_visit_state() returns trigger
language plpgsql
as $$
begin
  if new.op_visit_id is not null then
    update op_visits
       set current_state_code = new.to_state_code,
           updated_at         = now()
     where id = new.op_visit_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_journey_events_sync_op_visit on patient_journey_events;
create trigger trg_journey_events_sync_op_visit
  after insert on patient_journey_events
  for each row execute function fn_sync_op_visit_state();
