-- =====================================================================
-- 012_01c_rbac.sql
-- Module 01C — RBAC
-- Tables: roles, user_roles (M:M, composite PK), role_permissions (CRUD-per-table, composite PK)
-- Spec: docs/03-schema/v3/modules/01c-rbac.html
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- roles
-- ---------------------------------------------------------------------
create table if not exists roles (
  id              uuid         primary key default uuidv7(),
  role_code       text         not null,
  role_name       text         not null,
  description     text,
  category        text         not null,
  is_system_role  boolean      not null default false,
  -- uniform block
  created_by      uuid         references users(id) on delete set null,
  created_at      timestamptz  not null default now(),
  updated_by      uuid         references users(id) on delete set null,
  updated_at      timestamptz  not null default now(),
  version         int          not null default 0,
  deleted_at      timestamptz,
  deleted_by      uuid         references users(id) on delete set null,
  constraint chk_roles_role_code_len check (char_length(role_code) between 2 and 32),
  constraint chk_roles_role_name_len check (char_length(role_name) between 2 and 64),
  constraint chk_roles_category      check (category in ('admin','clinical','support'))
);

comment on table roles is 'Coarse functional buckets a user can hold (admin, doctor, pharmacist, …). Flat — no hierarchy. Sub-grading like junior_consultant lives in department_heads.role_type.';

create unique index if not exists uq_roles_role_code         on roles (role_code) where deleted_at is null;
create index        if not exists ix_roles_category_active   on roles (category)  where deleted_at is null;

drop trigger if exists tr_roles_bu_touch on roles;
create trigger tr_roles_bu_touch
  before update on roles
  for each row execute function fn_touch_updated();

drop trigger if exists tr_roles_au_audit on roles;
create trigger tr_roles_au_audit
  after insert or update or delete on roles
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- user_roles  (M:M bridge — composite PK)
-- ---------------------------------------------------------------------
create table if not exists user_roles (
  user_id      uuid         not null references users(id) on delete cascade,
  role_id      uuid         not null references roles(id) on delete restrict,
  is_primary   boolean      not null default false,
  -- uniform block (created_by doubles as "assigned by")
  created_by   uuid         references users(id) on delete set null,
  created_at   timestamptz  not null default now(),
  updated_by   uuid         references users(id) on delete set null,
  updated_at   timestamptz  not null default now(),
  version      int          not null default 0,
  deleted_at   timestamptz,
  deleted_by   uuid         references users(id) on delete set null,
  primary key (user_id, role_id)
);

comment on table user_roles is 'M:M bridge between users and roles. is_primary = the single role that drives login response + UI portal routing. Composite PK per CONVENTIONS.md §2.';

create unique index if not exists uq_user_roles_primary
  on user_roles (user_id)
  where is_primary = true and deleted_at is null;

create index if not exists ix_user_roles_role
  on user_roles (role_id)
  where deleted_at is null;

drop trigger if exists tr_user_roles_bu_touch on user_roles;
create trigger tr_user_roles_bu_touch
  before update on user_roles
  for each row execute function fn_touch_updated();

drop trigger if exists tr_user_roles_au_audit on user_roles;
create trigger tr_user_roles_au_audit
  after insert or update or delete on user_roles
  for each row execute function fn_audit_row();

-- ---------------------------------------------------------------------
-- role_permissions  (CRUD-per-table; composite PK on (role_id, table_name))
-- ---------------------------------------------------------------------
create table if not exists role_permissions (
  role_id       uuid         not null references roles(id) on delete cascade,
  table_name    text         not null,
  can_create    boolean      not null default false,
  can_read      boolean      not null default false,
  can_update    boolean      not null default false,
  can_delete    boolean      not null default false,
  -- uniform block (created_by doubles as "granted by")
  created_by    uuid         references users(id) on delete set null,
  created_at    timestamptz  not null default now(),
  updated_by    uuid         references users(id) on delete set null,
  updated_at    timestamptz  not null default now(),
  version       int          not null default 0,
  deleted_at    timestamptz,
  deleted_by    uuid         references users(id) on delete set null,
  primary key (role_id, table_name),
  constraint chk_role_permissions_at_least_one check (can_create or can_read or can_update or can_delete)
);

comment on table role_permissions is 'CRUD-per-table grants. One row per (role × table). State-transition gates (sign prescription, approve lab result, narcotic dispense) are NOT here — they live in DB triggers + Layer-2 maker-checker CHECKs.';

create index if not exists ix_role_permissions_table
  on role_permissions (table_name)
  where deleted_at is null;

drop trigger if exists tr_role_permissions_bu_touch on role_permissions;
create trigger tr_role_permissions_bu_touch
  before update on role_permissions
  for each row execute function fn_touch_updated();

drop trigger if exists tr_role_permissions_au_audit on role_permissions;
create trigger tr_role_permissions_au_audit
  after insert or update or delete on role_permissions
  for each row execute function fn_audit_row();
