-- ============================================================
-- V15__create_allergies_lookup.sql
-- Schema ref: docs/03-schema/v3/modules/06-platform-lookups.html#allergies_lookup
-- ============================================================

CREATE TABLE allergies_lookup (
    id            uuid        NOT NULL DEFAULT uuidv7(),
    allergy_code  text        NOT NULL,
    allergy_name  text        NOT NULL,
    category      text        NOT NULL,
    standard_code text,
    created_by    uuid        NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_by    uuid,
    updated_at    timestamptz NOT NULL DEFAULT now(),
    version       int         NOT NULL DEFAULT 0,
    deleted_at    timestamptz,
    deleted_by    uuid,

    CONSTRAINT pk_allergies_lookup PRIMARY KEY (id),
    CONSTRAINT chk_allergies_lookup_category CHECK (category IN ('food','drug','environmental','other'))
);

CREATE UNIQUE INDEX uq_allergies_lookup_code
    ON allergies_lookup (allergy_code) WHERE deleted_at IS NULL;

CREATE TRIGGER tr_allergies_lookup_bu_touch
    BEFORE UPDATE ON allergies_lookup
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

COMMENT ON TABLE  allergies_lookup IS 'Reference catalogue of known allergies. Seeded by migration; additions via data-entry UI.';
COMMENT ON COLUMN allergies_lookup.standard_code IS 'SNOMED / ICD code for interoperability.';
COMMENT ON COLUMN allergies_lookup.version IS 'Owned by Hibernate @Version.';
