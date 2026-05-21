-- ============================================================
-- V14__create_audit_excluded_tables.sql
-- Tables exempt from Layer 3 audit (high volume, low forensic value).
-- ============================================================

CREATE TABLE audit_excluded_tables (
    id          uuid        NOT NULL DEFAULT uuidv7(),
    table_name  text        NOT NULL,
    reason      text        NOT NULL,
    created_by  uuid        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT pk_audit_excluded_tables PRIMARY KEY (id),
    CONSTRAINT uq_audit_excluded_tables_name UNIQUE (table_name)
);

-- Seed: patient_journey_events excluded — high volume, low forensic value
INSERT INTO audit_excluded_tables (id, table_name, reason, created_by, created_at)
VALUES (uuidv7(), 'patient_journey_events',
        'High-volume station transition events — forensic value covered by op_visits audit.',
        '00000000-0000-0000-0000-000000000000', now());

COMMENT ON TABLE audit_excluded_tables IS 'Tables excluded from fn_audit_row() trigger. Seeded by migrations.';
