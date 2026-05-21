-- =====================================================================
-- 021_journey.sql
-- patient_states (catalog), stations (physical service points),
-- patient_journey_events (append-only ledger).
--
-- Spec: docs/03-schema/v2/modules/08-journey.html
-- TSD : docs/05-tsd/04-patient-journey.md
--
-- NOTE: patient_journey_events.op_visit_id FKs op_visits which lives in
-- 030_encounter.sql — that FK is added there. We also add the
-- fn_sync_op_visit_state trigger in 030_encounter.sql for the same
-- reason (it updates op_visits.current_state_code).
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- 1. patient_states  (catalog, int PK, tenant-agnostic)
-- ---------------------------------------------------------------------
create table if not exists patient_states (
  code                 int          primary key,
  phase                int          not null,
  phase_label          varchar(120) not null,
  slug                 varchar(64)  not null unique,
  display_name         varchar(120) not null,
  description          text,
  owning_dept          varchar(32),
  derived_from         varchar(32),
  is_blocking          boolean      not null default false,
  is_terminal          boolean      not null default false,
  sla_minutes          int,
  next_possible_codes  int[]        not null default '{}',
  display_color        varchar(16),
  is_active            boolean      not null default true,
  constraint chk_patient_states_owning_dept
    check (owning_dept is null or owning_dept in
           ('front_desk','nursing','doctor','lab','radiology','pharmacy','ward','er','billing','inpatient','surgery','opd','ipd'))
);
comment on table patient_states is
  'Catalog of every state in the patient journey (100..710). Drives the state machine and analytics.';

create index if not exists idx_patient_states_phase on patient_states(phase, code);

-- ---------------------------------------------------------------------
-- 2. stations  (int PK per HTML schema v8)
-- ---------------------------------------------------------------------
create table if not exists stations (
  code                       int          primary key,
  tenant_id                  uuid         not null references tenants(id) on delete restrict,
  slug                       varchar(64)  not null,
  display_name               varchar(120) not null,
  phase                      int          not null,
  station_type               varchar(32)  not null,
  owning_dept                varchar(32)  not null,
  physical_location          varchar(200),
  avg_service_time_minutes   int,
  is_active                  boolean      not null default true,
  constraint chk_stations_type
    check (station_type in (
      'front_desk','billing','vitals','doctor','lab_collection','lab_processing',
      'radiology','pharmacy','er_triage','ip_ward','lab','ward')),
  constraint uq_stations_tenant_slug unique (tenant_id, slug)
);
comment on table stations is
  'Physical service points (front desk, billing, vitals, doctor rooms, lab, pharmacy, radiology). Patients move between stations.';

create index if not exists idx_stations_type
  on stations(tenant_id, station_type, is_active);

-- ---------------------------------------------------------------------
-- 3. patient_journey_events  (append-only ledger)
-- ---------------------------------------------------------------------
create table if not exists patient_journey_events (
  id                                uuid         primary key default gen_random_uuid(),
  tenant_id                         uuid         not null references tenants(id) on delete restrict,
  patient_id                        uuid         not null references patients(id) on delete restrict,
  op_visit_id                       uuid,                                       -- FK to op_visits added in 030
  ip_admission_id                   uuid,                                       -- Phase 2
  from_state_code                   int          references patient_states(code) on delete restrict,
  to_state_code                     int          not null references patient_states(code) on delete restrict,
  station_id                        int          references stations(code) on delete restrict,
  duration_in_prev_state_seconds    int,
  triggered_by_user_id              uuid         references users(id) on delete set null,
  reason                            text,
  metadata                          jsonb,
  occurred_at                       timestamptz  not null default now()
);
comment on table patient_journey_events is
  'Append-only state-transition log per patient. Source of truth for journey analytics. Monthly partitioning, 7-year retention.';

create index if not exists idx_journey_events_patient
  on patient_journey_events(patient_id, occurred_at desc);
create index if not exists idx_journey_events_visit
  on patient_journey_events(op_visit_id, occurred_at desc) where op_visit_id is not null;
create index if not exists idx_journey_events_to_state
  on patient_journey_events(tenant_id, to_state_code, occurred_at desc);
create index if not exists idx_journey_events_tenant_occurred
  on patient_journey_events(tenant_id, occurred_at);

-- Append-only enforcement
drop trigger if exists trg_journey_events_append_only on patient_journey_events;
create trigger trg_journey_events_append_only
  before update or delete on patient_journey_events
  for each row execute function fn_append_only_guard();

-- ---------------------------------------------------------------------
-- fn_compute_prev_duration  (BEFORE INSERT)
-- Fills duration_in_prev_state_seconds from the previous event for this
-- visit. NULL for first event (no previous row).
-- ---------------------------------------------------------------------
create or replace function fn_compute_prev_duration() returns trigger
language plpgsql
as $$
declare
  prev_occurred timestamptz;
begin
  if new.op_visit_id is not null then
    select max(occurred_at) into prev_occurred
      from patient_journey_events
     where op_visit_id = new.op_visit_id;
  else
    select max(occurred_at) into prev_occurred
      from patient_journey_events
     where patient_id = new.patient_id
       and op_visit_id is null
       and ip_admission_id is null;
  end if;

  if prev_occurred is not null and new.duration_in_prev_state_seconds is null then
    new.duration_in_prev_state_seconds :=
      greatest(0, extract(epoch from (new.occurred_at - prev_occurred))::int);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_journey_events_prev_duration on patient_journey_events;
create trigger trg_journey_events_prev_duration
  before insert on patient_journey_events
  for each row execute function fn_compute_prev_duration();
