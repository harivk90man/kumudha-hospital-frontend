-- ============================================================
-- V7__create_roles.sql
-- Schema ref: docs/03-schema/v3/modules/01c-rbac.html#roles
-- ============================================================

CREATE TABLE roles (
    id            uuid        NOT NULL DEFAULT uuidv7(),
    role_code     text        NOT NULL,
    display_name  text        NOT NULL,
    description   text,
    system_role   boolean     NOT NULL DEFAULT FALSE,
    created_by    uuid        NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_by    uuid,
    updated_at    timestamptz NOT NULL DEFAULT now(),
    version       int         NOT NULL DEFAULT 0,
    deleted_at    timestamptz,
    deleted_by    uuid,

    CONSTRAINT pk_roles PRIMARY KEY (id),
    CONSTRAINT chk_roles_code_len CHECK (char_length(role_code) BETWEEN 2 AND 50)
);

CREATE UNIQUE INDEX uq_roles_code
    ON roles (role_code) WHERE deleted_at IS NULL;

CREATE TRIGGER tr_roles_bu_touch
    BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

-- Seed system roles
INSERT INTO roles (id, role_code, display_name, system_role, created_by, created_at, updated_at)
VALUES
    (uuidv7(), 'admin',          'Administrator',      TRUE, '00000000-0000-0000-0000-000000000000', now(), now()),
    (uuidv7(), 'doctor',         'Doctor',             TRUE, '00000000-0000-0000-0000-000000000000', now(), now()),
    (uuidv7(), 'nurse',          'Nurse',              TRUE, '00000000-0000-0000-0000-000000000000', now(), now()),
    (uuidv7(), 'receptionist',   'Receptionist',       TRUE, '00000000-0000-0000-0000-000000000000', now(), now()),
    (uuidv7(), 'lab_technician', 'Lab Technician',     TRUE, '00000000-0000-0000-0000-000000000000', now(), now()),
    (uuidv7(), 'pharmacist',     'Pharmacist',         TRUE, '00000000-0000-0000-0000-000000000000', now(), now()),
    (uuidv7(), 'cashier',        'Cashier',            TRUE, '00000000-0000-0000-0000-000000000000', now(), now());

COMMENT ON TABLE  roles IS 'RBAC roles. System roles cannot be soft-deleted.';
COMMENT ON COLUMN roles.system_role IS 'TRUE = seeded by migration; deletion blocked at application layer.';
