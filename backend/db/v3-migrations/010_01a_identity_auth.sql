-- =====================================================================
-- 010_01a_identity_auth.sql
-- Module 01A — Identity & Auth Core
-- Tables: hospital_profile (singleton), users, user_sessions
-- Spec: docs/03-schema/v3/modules/01a-identity-and-auth.html
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- hospital_profile  (singleton — exactly one row)
-- ---------------------------------------------------------------------
create table if not exists hospital_profile (
  id                      uuid         primary key default uuidv7(),
  hospital_code           text         not null,
  hospital_name           text         not null,
  address                 jsonb        not null default '{}'::jsonb,
  gst_number              text,
  license_number          text,
  logo_path               text,
  timezone                text         not null default 'Asia/Kolkata',
  uhid_prefix             text         not null default 'UHID',
  uhid_separator          text         not null default '-',
  uhid_sequence_padding   int          not null default 6,
  uhid_include_year       boolean      not null default true,
  -- uniform block (FKs to users(id) wired below after users exists)
  created_by              uuid,
  created_at              timestamptz  not null default now(),
  updated_by              uuid,
  updated_at              timestamptz  not null default now(),
  version                 int          not null default 0,
  deleted_at              timestamptz,
  deleted_by              uuid
);

comment on table  hospital_profile is 'Singleton — exactly one row. Hospital identity + UHID format. App reads SELECT * FROM hospital_profile LIMIT 1 at startup.';
comment on column hospital_profile.hospital_code is 'Short hospital code, e.g. KH (Kumudha Hospital).';
comment on column hospital_profile.address       is 'Structured address as JSONB. Required keys: line1, city, state, country (ISO-3166-1 alpha-2).';
comment on column hospital_profile.timezone      is 'IANA timezone — drives all local-date interpretations.';

alter table hospital_profile
  add constraint chk_hospital_profile_hospital_code_len  check (char_length(hospital_code) between 2 and 10),
  add constraint chk_hospital_profile_gst_len            check (gst_number is null or char_length(gst_number) = 15),
  add constraint chk_hospital_profile_uhid_sep_len       check (char_length(uhid_separator) = 1),
  add constraint chk_hospital_profile_uhid_padding       check (uhid_sequence_padding between 3 and 10),
  add constraint chk_hospital_profile_address            check (fn_validate_hospital_address(address));

create unique index if not exists uq_hospital_profile_code
  on hospital_profile (hospital_code)
  where deleted_at is null;

create unique index if not exists uq_hospital_profile_singleton
  on hospital_profile ((true))
  where deleted_at is null;

drop trigger if exists tr_hospital_profile_bu_touch on hospital_profile;
create trigger tr_hospital_profile_bu_touch
  before update on hospital_profile
  for each row execute function fn_touch_updated();

drop trigger if exists tr_hospital_profile_au_audit on hospital_profile;
create trigger tr_hospital_profile_au_audit
  after insert or update or delete on hospital_profile
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- users  (auth + HR, single table)
-- department_id FK is added in 011 once departments exists.
-- ---------------------------------------------------------------------
create table if not exists users (
  id                       uuid         primary key default uuidv7(),
  -- HR identity
  employee_id              text         not null,
  full_name                text         not null,
  department_id            uuid,                                    -- FK wired in 011
  designation              text,
  joining_date             date,
  profile_data             jsonb        not null default '{"type":"admin"}'::jsonb,
  -- Auth — login identifiers
  username                 text         not null,
  mobile                   text         not null,
  email                    text,
  -- Auth — credentials & security state
  password_hash            text         not null,
  password_changed_at      timestamptz  not null default now(),
  must_change_password     boolean      not null default false,
  failed_attempts          int          not null default 0,
  locked_until             timestamptz,
  mfa_enabled              boolean      not null default false,
  mfa_secret               text,
  status                   text         not null default 'active',
  -- Telemetry
  last_login_at            timestamptz,
  last_login_ip            text,
  last_login_user_agent    text,
  notes                    text,
  profile_picture          bytea,
  -- uniform block
  created_by               uuid,                                    -- self-FK wired below
  created_at               timestamptz  not null default now(),
  updated_by               uuid,
  updated_at               timestamptz  not null default now(),
  version                  int          not null default 0,
  deleted_at               timestamptz,
  deleted_by               uuid
);

comment on table users is 'All staff accounts — admin, doctors, nurses, receptionists, pharmacists, lab/radio techs. Auth (password, MFA, lockout) + HR (employee_id, department, designation, joining_date) in one row. Doctor-specific extensions live in doctor_profiles (Module 01B).';

-- self-FK for created_by / updated_by / deleted_by
alter table users
  add constraint fk_users_created_by foreign key (created_by) references users(id) on delete set null,
  add constraint fk_users_updated_by foreign key (updated_by) references users(id) on delete set null,
  add constraint fk_users_deleted_by foreign key (deleted_by) references users(id) on delete set null;

-- now wire hospital_profile's audit-block FKs to users
alter table hospital_profile
  add constraint fk_hospital_profile_created_by foreign key (created_by) references users(id) on delete set null,
  add constraint fk_hospital_profile_updated_by foreign key (updated_by) references users(id) on delete set null,
  add constraint fk_hospital_profile_deleted_by foreign key (deleted_by) references users(id) on delete set null;

alter table users
  add constraint chk_users_mobile_len          check (char_length(mobile) between 10 and 15),
  add constraint chk_users_username_len        check (char_length(username) between 3 and 64),
  add constraint chk_users_failed_attempts     check (failed_attempts >= 0),
  add constraint chk_users_status              check (status in ('active','inactive','suspended')),
  add constraint chk_users_mfa_secret_present  check (mfa_enabled = false or mfa_secret is not null),
  add constraint chk_users_profile_data        check (fn_validate_user_profile_data(profile_data));

create unique index if not exists uq_users_employee_id on users (employee_id) where deleted_at is null;
create unique index if not exists uq_users_username    on users (username)    where deleted_at is null;
create unique index if not exists uq_users_mobile      on users (mobile)      where deleted_at is null;
create unique index if not exists uq_users_email       on users (email)       where email is not null and deleted_at is null;

create index if not exists ix_users_department    on users (department_id) where department_id is not null and deleted_at is null;
create index if not exists ix_users_status_active on users (status)        where deleted_at is null;
create index if not exists ix_users_locked        on users (locked_until)  where locked_until is not null;

drop trigger if exists tr_users_bu_touch on users;
create trigger tr_users_bu_touch
  before update on users
  for each row execute function fn_touch_updated();

drop trigger if exists tr_users_au_audit on users;
create trigger tr_users_au_audit
  after insert or update or delete on users
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- user_sessions  (refresh-side DB state; access tokens are stateless JWTs)
-- ---------------------------------------------------------------------
create table if not exists user_sessions (
  id                        uuid         primary key default uuidv7(),
  user_id                   uuid         not null references users(id) on delete restrict,
  refresh_hash              text,
  rotated_from_session_id   uuid         references user_sessions(id) on delete set null,
  ip_address                text,
  user_agent                text,
  issued_at                 timestamptz  not null default now(),
  expires_at                timestamptz  not null,
  last_active_at            timestamptz  not null default now(),
  -- uniform block
  created_by                uuid         references users(id) on delete set null,
  created_at                timestamptz  not null default now(),
  updated_by                uuid         references users(id) on delete set null,
  updated_at                timestamptz  not null default now(),
  version                   int          not null default 0,
  deleted_at                timestamptz,
  deleted_by                uuid         references users(id) on delete set null,
  constraint chk_user_sessions_expiry check (expires_at > issued_at)
);

comment on table user_sessions is 'Active & soft-deleted login sessions. Stores SHA-256 of refresh JWT (long-lived). Access tokens are stateless JWTs — verified by signature, not stored. "Revoked" = deleted_at IS NOT NULL.';

create unique index if not exists uq_user_sessions_refresh_hash
  on user_sessions (refresh_hash)
  where refresh_hash is not null and deleted_at is null;

create index if not exists ix_user_sessions_user_active
  on user_sessions (user_id, expires_at desc)
  where deleted_at is null;

create index if not exists ix_user_sessions_cleanup
  on user_sessions (expires_at)
  where deleted_at is null;

create index if not exists ix_user_sessions_idle
  on user_sessions (last_active_at)
  where deleted_at is null;

drop trigger if exists tr_user_sessions_bu_touch on user_sessions;
create trigger tr_user_sessions_bu_touch
  before update on user_sessions
  for each row execute function fn_touch_updated();

-- user_sessions is Tier-3 audit-excluded (token churn) — no fn_audit_row trigger.
