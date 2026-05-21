-- ============================================================
-- V8__create_user_roles.sql
-- Schema ref: docs/03-schema/v3/modules/01c-rbac.html#user_roles
-- ============================================================

CREATE TABLE user_roles (
    user_id     uuid        NOT NULL,
    role_id     uuid        NOT NULL,
    created_by  uuid        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT pk_user_roles PRIMARY KEY (user_id, role_id),
    CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT
);

CREATE INDEX ix_user_roles_user ON user_roles (user_id);
CREATE INDEX ix_user_roles_role ON user_roles (role_id);

COMMENT ON TABLE user_roles IS 'M:N assignment of roles to users. No soft-delete — removing a role is a hard delete (audit trigger captures it).';
