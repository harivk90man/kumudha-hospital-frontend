-- ============================================================
-- V11__create_user_preferences.sql
-- Schema ref: docs/03-schema/v3/modules/01d-operational-config.html#user_preferences
-- ============================================================

CREATE TABLE user_preferences (
    id                uuid        NOT NULL DEFAULT uuidv7(),
    user_id           uuid        NOT NULL,
    preference_key    text        NOT NULL,
    preference_value  text        NOT NULL,
    created_by        uuid        NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_by        uuid,
    updated_at        timestamptz NOT NULL DEFAULT now(),
    version           int         NOT NULL DEFAULT 0,
    deleted_at        timestamptz,
    deleted_by        uuid,

    CONSTRAINT pk_user_preferences PRIMARY KEY (id),
    CONSTRAINT fk_user_preferences_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX uq_user_preferences_user_key
    ON user_preferences (user_id, preference_key) WHERE deleted_at IS NULL;

CREATE TRIGGER tr_user_preferences_bu_touch
    BEFORE UPDATE ON user_preferences
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

COMMENT ON TABLE user_preferences IS 'Per-user UI preferences (theme, default department, etc.).';
COMMENT ON COLUMN user_preferences.version IS 'Owned by Hibernate @Version.';
