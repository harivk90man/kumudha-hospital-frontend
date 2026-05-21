-- ============================================================
-- V10__create_system_config.sql
-- Schema ref: docs/03-schema/v3/modules/01d-operational-config.html#system_config
-- ============================================================

CREATE TABLE system_config (
    id                uuid        NOT NULL DEFAULT uuidv7(),
    config_key        text        NOT NULL,
    config_value      jsonb       NOT NULL DEFAULT '{}',
    description       text,
    sensitive         boolean     NOT NULL DEFAULT FALSE,
    -- L2 maker-checker
    approval_status   text        NOT NULL DEFAULT 'approved',
    approved_by       uuid,
    approved_at       timestamptz,
    rejection_reason  text,
    created_by        uuid        NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_by        uuid,
    updated_at        timestamptz NOT NULL DEFAULT now(),
    version           int         NOT NULL DEFAULT 0,
    deleted_at        timestamptz,
    deleted_by        uuid,

    CONSTRAINT pk_system_config PRIMARY KEY (id),
    CONSTRAINT chk_system_config_approval CHECK (approval_status IN ('pending_approval','approved','rejected')),
    CONSTRAINT chk_system_config_sod CHECK (created_by <> approved_by OR approved_by IS NULL)
);

CREATE UNIQUE INDEX uq_system_config_key
    ON system_config (config_key) WHERE deleted_at IS NULL;

CREATE TRIGGER tr_system_config_bu_touch
    BEFORE UPDATE ON system_config
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

COMMENT ON TABLE  system_config IS 'Hospital-wide configuration. Sensitive entries require L2 approval before taking effect.';
COMMENT ON COLUMN system_config.config_value IS 'jsonb — shape varies by key; consumers cast to their typed POJO.';
COMMENT ON COLUMN system_config.version IS 'Owned by Hibernate @Version.';
