-- ============================================================
-- V9__create_role_permissions.sql
-- Schema ref: docs/03-schema/v3/modules/01c-rbac.html#role_permissions
-- ============================================================

CREATE TABLE role_permissions (
    role_id     uuid        NOT NULL,
    table_name  text        NOT NULL,
    action      text        NOT NULL,
    granted_by  uuid        NOT NULL,
    granted_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT pk_role_permissions PRIMARY KEY (role_id, table_name, action),
    CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT,
    CONSTRAINT chk_role_permissions_action CHECK (action IN ('CREATE','READ','UPDATE','DELETE'))
);

CREATE INDEX ix_role_permissions_role ON role_permissions (role_id);

COMMENT ON TABLE  role_permissions IS 'CRUD-per-table permission grants per role.';
COMMENT ON COLUMN role_permissions.action IS 'CREATE | READ | UPDATE | DELETE';
