-- =====================================================================
-- 031_08_journey.sql
-- Module 08 — Patient Journey
-- Tables: stations (stage registry; FK target for patient_states.station_id in Module 10)
-- Spec: docs/03-schema/v3/modules/08-journey.html
-- =====================================================================

set search_path = public;

create table if not exists stations (
  id              uuid         primary key default uuidv7(),
  display_name    text         not null,
  station_type    text         not null,
  display_order   int          not null,
  sla_minutes     int,
  color           text,
  -- uniform block
  created_by      uuid         references users(id) on delete set null,
  created_at      timestamptz  not null default now(),
  updated_by      uuid         references users(id) on delete set null,
  updated_at      timestamptz  not null default now(),
  version         int          not null default 0,
  deleted_at      timestamptz,
  deleted_by      uuid         references users(id) on delete set null,
  constraint chk_stations_type check (station_type in ('front_desk','vitals','doctor','billing','lab_collection','lab_processing','radiology','pharmacy')),
  constraint chk_stations_sla  check (sla_minutes is null or sla_minutes > 0)
);

comment on table stations is 'Registry of every physical stage a patient can be at. Flyway-seeded; FK target for patient_states.station_id (Module 10).';

create unique index if not exists uq_stations_type  on stations (station_type)  where deleted_at is null;
create index        if not exists ix_stations_order on stations (display_order) where deleted_at is null;

drop trigger if exists tr_stations_bu_touch on stations;
create trigger tr_stations_bu_touch
  before update on stations
  for each row execute function fn_touch_updated();

drop trigger if exists tr_stations_au_audit on stations;
create trigger tr_stations_au_audit
  after insert or update or delete on stations
  for each row execute function fn_audit_row();
