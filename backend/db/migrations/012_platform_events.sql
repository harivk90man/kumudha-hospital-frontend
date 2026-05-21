-- =====================================================================
-- 012_platform_events.sql
-- Append-only domain_events bus.
--
-- Spec: docs/03-schema/v2/modules/03-platform-events.html
-- TSD : docs/05-tsd/02-audit-events-notifications.md §4.2
-- =====================================================================

set search_path = public;

create table if not exists domain_events (
  id              bigserial    primary key,
  tenant_id       uuid         not null references tenants(id) on delete restrict,
  aggregate_type  varchar(64)  not null,
  aggregate_id    uuid         not null,
  event_type      varchar(120) not null,
  payload         jsonb        not null,
  occurred_at     timestamptz  not null default now(),
  processed_by    jsonb,
  created_by      uuid         references users(id) on delete set null
);
comment on table  domain_events is
  'Append-only business event stream — BillFinalized, AdmissionCreated, LabResultCriticallyAbnormal …. Subscribers fan out async work. 3-year retention.';
comment on column domain_events.aggregate_type is 'bill | admission | lab_result | radiology_report | …';
comment on column domain_events.event_type     is 'BillFinalized | PaymentAllocated | LabResultReleased | …';
comment on column domain_events.processed_by   is 'Subscriber list / processing metadata.';

create index if not exists idx_domain_events_tenant_type
  on domain_events(tenant_id, event_type, occurred_at desc);
create index if not exists idx_domain_events_aggregate
  on domain_events(aggregate_type, aggregate_id, occurred_at desc);

-- Append-only enforcement
drop trigger if exists trg_domain_events_append_only on domain_events;
create trigger trg_domain_events_append_only
  before update or delete on domain_events
  for each row execute function fn_append_only_guard();
