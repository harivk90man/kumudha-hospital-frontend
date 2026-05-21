-- =====================================================================
-- 013_platform_notifications.sql
-- notifications + notification_acknowledgments.
--
-- Spec: docs/03-schema/v2/modules/04-platform-notifications.html
-- TSD : docs/05-tsd/02-audit-events-notifications.md §§4.3, 4.4
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------
create table if not exists notifications (
  id                uuid         primary key default gen_random_uuid(),
  user_id           uuid         references users(id) on delete cascade,
  role_id           uuid         references roles(id) on delete cascade,
  type              varchar(64)  not null,
  title             varchar(200) not null,
  body              text,
  link              varchar(255),
  priority          varchar(16)  not null default 'normal',
  ack_required      boolean      not null default false,
  ack_sla_minutes   int,
  escalation_chain  jsonb,
  escalated_at      timestamptz,
  escalated_to      uuid         references users(id) on delete set null,
  read_at           timestamptz,
  created_at        timestamptz  not null default now(),
  constraint chk_notifications_priority check (priority in ('normal','high','urgent')),
  -- A notification must address at least one of user_id, role_id (otherwise it goes nowhere).
  constraint chk_notifications_recipient check (user_id is not null or role_id is not null)
);
comment on table  notifications is 'In-app/email/SMS alerts to users or roles. Critical alerts require ACK with SLA + escalation chain.';
comment on column notifications.escalation_chain is 'Ordered array e.g. ["doctor","hod","oncall"].';

create index if not exists idx_notifications_user_unread
  on notifications(user_id, read_at, priority desc) where user_id is not null;
create index if not exists idx_notifications_role_unread
  on notifications(role_id, read_at) where role_id is not null;
create index if not exists idx_notifications_escalation
  on notifications(ack_required, escalated_at, created_at)
  where ack_required = true and read_at is null;

-- ---------------------------------------------------------------------
-- notification_acknowledgments
-- ---------------------------------------------------------------------
create table if not exists notification_acknowledgments (
  id               uuid        primary key default gen_random_uuid(),
  notification_id  uuid        not null references notifications(id) on delete cascade,
  acked_by         uuid        not null references users(id) on delete restrict,
  acked_at         timestamptz not null default now(),
  action_taken     text,
  sla_minutes      int,
  breached_sla     boolean     not null default false,
  constraint uq_notification_ack unique (notification_id, acked_by)
);
comment on table notification_acknowledgments is
  'Records who ACKed a critical alert and whether the ACK met SLA. Required for compliance/malpractice defence.';

create index if not exists idx_notification_ack_breached
  on notification_acknowledgments(breached_sla, acked_at desc) where breached_sla = true;
