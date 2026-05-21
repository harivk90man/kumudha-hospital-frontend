-- ============================================================
-- V5__create_doctor_profiles.sql
-- Schema ref: docs/03-schema/v3/modules/01b-organisation.html#doctor_profiles
-- ============================================================

CREATE TABLE doctor_profiles (
    id                      uuid            NOT NULL DEFAULT uuidv7(),
    user_id                 uuid            NOT NULL,
    qualification           text,
    registration_number     text,
    specialization          text,
    consultation_fee        numeric(14,2)   NOT NULL DEFAULT 0,
    follow_up_fee           numeric(14,2)   NOT NULL DEFAULT 0,
    follow_up_window_days   int             NOT NULL DEFAULT 7,
    available_days          jsonb           NOT NULL DEFAULT '{}',
    digital_signature       bytea,
    created_by              uuid            NOT NULL,
    created_at              timestamptz     NOT NULL DEFAULT now(),
    updated_by              uuid,
    updated_at              timestamptz     NOT NULL DEFAULT now(),
    version                 int             NOT NULL DEFAULT 0,
    deleted_at              timestamptz,
    deleted_by              uuid,

    CONSTRAINT pk_doctor_profiles PRIMARY KEY (id),
    CONSTRAINT fk_doctor_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT chk_doctor_profiles_fees CHECK (consultation_fee >= 0 AND follow_up_fee >= 0),
    CONSTRAINT chk_doctor_profiles_window CHECK (follow_up_window_days > 0)
);

CREATE UNIQUE INDEX uq_doctor_profiles_user
    ON doctor_profiles (user_id) WHERE deleted_at IS NULL;

CREATE TRIGGER tr_doctor_profiles_bu_touch
    BEFORE UPDATE ON doctor_profiles
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

COMMENT ON TABLE  doctor_profiles IS 'Doctor-specific extension — one row per user with a doctor role.';
COMMENT ON COLUMN doctor_profiles.consultation_fee IS 'Source of truth for consultation pricing — not the services table.';
COMMENT ON COLUMN doctor_profiles.available_days   IS 'jsonb: {"mon":[{"from":"HH:MM","to":"HH:MM"}], ...}';
COMMENT ON COLUMN doctor_profiles.version          IS 'Owned by Hibernate @Version.';
