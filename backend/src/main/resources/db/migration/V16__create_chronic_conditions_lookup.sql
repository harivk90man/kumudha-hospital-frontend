-- ============================================================
-- V16__create_chronic_conditions_lookup.sql
-- Schema ref: docs/03-schema/v3/modules/06-platform-lookups.html#chronic_conditions_lookup
-- ============================================================

CREATE TABLE chronic_conditions_lookup (
    id              uuid        NOT NULL DEFAULT uuidv7(),
    condition_code  text        NOT NULL,
    condition_name  text        NOT NULL,
    icd_code        text,
    category        text,
    created_by      uuid        NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_by      uuid,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    version         int         NOT NULL DEFAULT 0,
    deleted_at      timestamptz,
    deleted_by      uuid,

    CONSTRAINT pk_chronic_conditions_lookup PRIMARY KEY (id)
);

CREATE UNIQUE INDEX uq_chronic_conditions_lookup_code
    ON chronic_conditions_lookup (condition_code) WHERE deleted_at IS NULL;

CREATE TRIGGER tr_chronic_conditions_lookup_bu_touch
    BEFORE UPDATE ON chronic_conditions_lookup
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

COMMENT ON TABLE  chronic_conditions_lookup IS 'Reference catalogue of chronic conditions. Seeded by migration.';
COMMENT ON COLUMN chronic_conditions_lookup.icd_code IS 'ICD-10 code for interoperability.';
COMMENT ON COLUMN chronic_conditions_lookup.version  IS 'Owned by Hibernate @Version.';
