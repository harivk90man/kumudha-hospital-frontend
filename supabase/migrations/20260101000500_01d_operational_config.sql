-- =====================================================================
-- 013_01d_operational_config.sql
-- Module 01D — Operational Config
-- Tables: system_config, user_preferences (1:1 shared-PK), holidays
-- Spec: docs/03-schema/v3/modules/01d-operational-config.html
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- system_config  (deployment-level key-value settings)
-- ---------------------------------------------------------------------
create table if not exists system_config (
  id              uuid         primary key default uuidv7(),
  config_key      text         not null,
  config_value    jsonb        not null,
  value_type      text         not null,
  category        text         not null,
  description     text,
  default_value   jsonb        not null,
  is_secret       boolean      not null default false,
  -- uniform block
  created_by      uuid         references users(id) on delete set null,
  created_at      timestamptz  not null default now(),
  updated_by      uuid         references users(id) on delete set null,
  updated_at      timestamptz  not null default now(),
  version         int          not null default 0,
  deleted_at      timestamptz,
  deleted_by      uuid         references users(id) on delete set null,
  constraint chk_system_config_key_len     check (char_length(config_key) between 3 and 120),
  constraint chk_system_config_value_type  check (value_type in ('integer','boolean','string','decimal','array','object')),
  constraint chk_system_config_category    check (category in ('auth','billing','pharmacy','radiology','patient','workflow','integration','ui','clinical'))
);

comment on table system_config is 'Deployment-level key-value settings read by the app at runtime. Values are jsonb so a single column holds ints, booleans, strings, arrays, objects.';

create unique index if not exists uq_system_config_key
  on system_config (config_key) where deleted_at is null;

create index if not exists ix_system_config_category
  on system_config (category) where deleted_at is null;

drop trigger if exists tr_system_config_bu_touch on system_config;
create trigger tr_system_config_bu_touch
  before update on system_config
  for each row execute function fn_touch_updated();

drop trigger if exists tr_system_config_au_audit on system_config;
create trigger tr_system_config_au_audit
  after insert or update or delete on system_config
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- user_preferences  (1:1 shared-PK extension of users)
-- ---------------------------------------------------------------------
create table if not exists user_preferences (
  user_id         uuid         primary key references users(id) on delete cascade,
  language        text         not null default 'en',
  theme           text         not null default 'system',
  rows_per_page   int          not null default 25,
  notifications   jsonb        not null default '{"sms":true,"email":true,"inApp":true}'::jsonb,
  -- uniform block
  created_by      uuid         references users(id) on delete set null,
  created_at      timestamptz  not null default now(),
  updated_by      uuid         references users(id) on delete set null,
  updated_at      timestamptz  not null default now(),
  version         int          not null default 0,
  deleted_at      timestamptz,
  deleted_by      uuid         references users(id) on delete set null,
  constraint chk_user_preferences_language       check (language in ('en','ta','hi','te','kn','ml')),
  constraint chk_user_preferences_theme          check (theme in ('light','dark','system')),
  constraint chk_user_preferences_rows_per_page  check (rows_per_page between 10 and 100),
  constraint chk_user_preferences_notifications  check (fn_validate_user_notifications(notifications))
);

comment on table user_preferences is 'Per-user UI + notification preferences. Lazy 1:1 extension of users — only inserted when a user changes a default. Shared-PK pattern (user_id is both PK and FK).';

drop trigger if exists tr_user_preferences_bu_touch on user_preferences;
create trigger tr_user_preferences_bu_touch
  before update on user_preferences
  for each row execute function fn_touch_updated();

drop trigger if exists tr_user_preferences_au_audit on user_preferences;
create trigger tr_user_preferences_au_audit
  after insert or update or delete on user_preferences
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- holidays  (hospital closure dates)
-- ---------------------------------------------------------------------
create table if not exists holidays (
  id              uuid         primary key default uuidv7(),
  holiday_date    date         not null,
  name            text         not null,
  holiday_type    text         not null,
  description     text,
  -- uniform block
  created_by      uuid         not null references users(id) on delete set null,
  created_at      timestamptz  not null default now(),
  updated_by      uuid         references users(id) on delete set null,
  updated_at      timestamptz  not null default now(),
  version         int          not null default 0,
  deleted_at      timestamptz,
  deleted_by      uuid         references users(id) on delete set null,
  constraint chk_holidays_name_len check (char_length(name) between 2 and 120),
  constraint chk_holidays_type     check (holiday_type in ('national','state','local'))
);

comment on table holidays is 'Hospital closure dates — used by appointment slot generator and payroll. One row per actual date; admin adds new rows per year.';

create unique index if not exists uq_holidays_date on holidays (holiday_date) where deleted_at is null;
create index        if not exists ix_holidays_year on holidays (holiday_date) where deleted_at is null;

drop trigger if exists tr_holidays_bu_touch on holidays;
create trigger tr_holidays_bu_touch
  before update on holidays
  for each row execute function fn_touch_updated();

drop trigger if exists tr_holidays_au_audit on holidays;
create trigger tr_holidays_au_audit
  after insert or update or delete on holidays
  for each row execute function fn_audit_row();
