-- ============================================================
-- V4__create_departments.sql
-- Schema ref: docs/03-schema/v3/modules/01b-organisation.html#departments
-- ============================================================

CREATE TABLE departments (
    id                uuid        NOT NULL DEFAULT uuidv7(),
    department_code   text        NOT NULL,
    department_name   text        NOT NULL,
    description       text,
    created_by        uuid        NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_by        uuid,
    updated_at        timestamptz NOT NULL DEFAULT now(),
    version           int         NOT NULL DEFAULT 0,
    deleted_at        timestamptz,
    deleted_by        uuid,

    CONSTRAINT pk_departments PRIMARY KEY (id),
    CONSTRAINT chk_departments_code_len CHECK (char_length(department_code) BETWEEN 2 AND 20)
);

CREATE UNIQUE INDEX uq_departments_code
    ON departments (department_code) WHERE deleted_at IS NULL;

CREATE TRIGGER tr_departments_bu_touch
    BEFORE UPDATE ON departments
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

-- Wire FK from users.department_id now that departments exists
ALTER TABLE users
    ADD CONSTRAINT fk_users_department
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT;

COMMENT ON TABLE  departments IS 'Hospital departments — OPD, Lab, Radiology, Pharmacy, Admin, etc.';
COMMENT ON COLUMN departments.version IS 'Owned by Hibernate @Version.';
