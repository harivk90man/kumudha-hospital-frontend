-- ============================================================
-- V6__create_user_sessions.sql
-- Schema ref: docs/03-schema/v3/modules/01a-identity-and-auth.html#user_sessions
-- ============================================================

CREATE TABLE user_sessions (
    id                      uuid        NOT NULL DEFAULT uuidv7(),
    user_id                 uuid        NOT NULL,
    token_hash              text        NOT NULL,
    expires_at              timestamptz NOT NULL,
    revoked_at              timestamptz,
    rotated_from_session_id uuid,
    ip_address              text,
    user_agent              text,
    created_by              uuid        NOT NULL,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_by              uuid,
    updated_at              timestamptz NOT NULL DEFAULT now(),
    version                 int         NOT NULL DEFAULT 0,
    deleted_at              timestamptz,
    deleted_by              uuid,

    CONSTRAINT pk_user_sessions PRIMARY KEY (id),
    CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_user_sessions_rotated FOREIGN KEY (rotated_from_session_id) REFERENCES user_sessions(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX uq_user_sessions_token_hash
    ON user_sessions (token_hash) WHERE revoked_at IS NULL;

CREATE INDEX ix_user_sessions_user
    ON user_sessions (user_id, expires_at DESC) WHERE revoked_at IS NULL;

CREATE TRIGGER tr_user_sessions_bu_touch
    BEFORE UPDATE ON user_sessions
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

COMMENT ON TABLE  user_sessions IS 'Active and revoked login sessions. token_hash stores a hashed refresh token.';
COMMENT ON COLUMN user_sessions.version IS 'Owned by Hibernate @Version.';
