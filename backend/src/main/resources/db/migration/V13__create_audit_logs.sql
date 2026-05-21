-- ============================================================
-- V13__create_audit_logs.sql
-- Append-only forensic audit trail. Written only by fn_audit_row() trigger.
-- Schema ref: docs/03-schema/v3/modules/02-platform-audit.html#audit_logs
-- ============================================================

CREATE TABLE audit_logs (
    id            uuid        NOT NULL DEFAULT uuidv7(),
    entity_table  text        NOT NULL,
    entity_id     uuid        NOT NULL,
    action        text        NOT NULL,
    before_state  jsonb,
    after_state   jsonb,
    changed_fields text[],
    actor_id      uuid        NOT NULL,
    occurred_at   timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT pk_audit_logs PRIMARY KEY (id, occurred_at),
    CONSTRAINT chk_audit_logs_action CHECK (action IN ('INSERT','UPDATE','DELETE'))
) PARTITION BY RANGE (occurred_at);

-- Create initial monthly partitions for current and next month
CREATE TABLE audit_logs_2026_05 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE TABLE audit_logs_2026_06 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

CREATE INDEX ix_audit_logs_entity ON audit_logs (entity_table, entity_id, occurred_at DESC);
CREATE INDEX ix_audit_logs_actor  ON audit_logs (actor_id, occurred_at DESC);

-- Append-only guard — no UPDATE or DELETE permitted
CREATE OR REPLACE FUNCTION fn_audit_row() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO audit_logs (entity_table, entity_id, action, before_state, after_state, changed_fields, actor_id)
    VALUES (
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        TG_OP,
        CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
        CASE WHEN TG_OP = 'UPDATE' THEN ARRAY(
            SELECT key FROM jsonb_each(to_jsonb(NEW))
            WHERE to_jsonb(NEW)->key IS DISTINCT FROM to_jsonb(OLD)->key
        ) ELSE NULL END,
        COALESCE(NEW.updated_by, NEW.created_by, OLD.created_by, '00000000-0000-0000-0000-000000000000')
    );
    RETURN NEW;
END;
$$;

COMMENT ON TABLE  audit_logs IS 'Append-only forensic audit trail. Written by fn_audit_row() trigger only. Never written by application code.';
COMMENT ON COLUMN audit_logs.action IS 'INSERT | UPDATE | DELETE';
