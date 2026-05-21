-- ============================================================
-- V3__create_hospital_profile.sql
-- Singleton hospital identity and UHID format config.
-- Schema ref: docs/03-schema/v3/modules/01a-identity-and-auth.html#hospital_profile
-- ============================================================

CREATE TABLE hospital_profile (
    id                      uuid        NOT NULL DEFAULT uuidv7(),
    hospital_code           text        NOT NULL,
    hospital_name           text        NOT NULL,
    address                 jsonb       NOT NULL DEFAULT '{}',
    gst_number              text,
    license_number          text,
    logo_path               text,
    timezone                text        NOT NULL DEFAULT 'Asia/Kolkata',
    uhid_prefix             text        NOT NULL DEFAULT 'UHID',
    uhid_separator          text        NOT NULL DEFAULT '-',
    uhid_sequence_padding   int         NOT NULL DEFAULT 6,
    uhid_include_year       boolean     NOT NULL DEFAULT TRUE,
    created_by              uuid        NOT NULL,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_by              uuid,
    updated_at              timestamptz NOT NULL DEFAULT now(),
    version                 int         NOT NULL DEFAULT 0,
    deleted_at              timestamptz,
    deleted_by              uuid,

    CONSTRAINT pk_hospital_profile PRIMARY KEY (id),
    CONSTRAINT uq_hospital_profile_code UNIQUE (hospital_code),
    CONSTRAINT chk_hospital_profile_code_len CHECK (char_length(hospital_code) BETWEEN 2 AND 10),
    CONSTRAINT chk_hospital_profile_gst CHECK (gst_number IS NULL OR char_length(gst_number) = 15),
    CONSTRAINT chk_hospital_profile_separator CHECK (char_length(uhid_separator) = 1),
    CONSTRAINT chk_hospital_profile_padding CHECK (uhid_sequence_padding BETWEEN 3 AND 10)
);

-- One-row invariant
CREATE UNIQUE INDEX uq_hospital_profile_singleton
    ON hospital_profile ((true)) WHERE deleted_at IS NULL;

CREATE TRIGGER tr_hospital_profile_bu_touch
    BEFORE UPDATE ON hospital_profile
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

COMMENT ON TABLE  hospital_profile IS 'Singleton. Hospital identity and UHID format config. One live row enforced by partial unique index.';
COMMENT ON COLUMN hospital_profile.version IS 'Owned by Hibernate @Version — trigger does NOT touch this column.';
