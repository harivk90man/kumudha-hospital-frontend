-- ============================================================
-- V17__create_document_templates.sql
-- Schema ref: docs/03-schema/v3/modules/05-document-templates.html
-- ============================================================

CREATE TABLE document_templates (
    id             uuid        NOT NULL DEFAULT uuidv7(),
    template_type  text        NOT NULL,
    template_name  text        NOT NULL,
    version_no     int         NOT NULL DEFAULT 1,
    body           text        NOT NULL,
    active         boolean     NOT NULL DEFAULT TRUE,
    created_by     uuid        NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_by     uuid,
    updated_at     timestamptz NOT NULL DEFAULT now(),
    version        int         NOT NULL DEFAULT 0,
    deleted_at     timestamptz,
    deleted_by     uuid,

    CONSTRAINT pk_document_templates PRIMARY KEY (id),
    CONSTRAINT chk_document_templates_type CHECK (
        template_type IN ('prescription','invoice','lab_report','discharge_summary','receipt')
    ),
    CONSTRAINT chk_document_templates_version CHECK (version_no > 0)
);

-- At most one active template per type
CREATE UNIQUE INDEX uq_document_templates_active_type
    ON document_templates (template_type) WHERE active = TRUE AND deleted_at IS NULL;

CREATE TRIGGER tr_document_templates_bu_touch
    BEFORE UPDATE ON document_templates
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

COMMENT ON TABLE  document_templates IS 'Versioned print templates. body uses {{placeholder}} tokens resolved at render time.';
COMMENT ON COLUMN document_templates.active     IS 'Only one active template per type — enforced by partial unique index.';
COMMENT ON COLUMN document_templates.version_no IS 'Template content version (monotonically increasing per type).';
COMMENT ON COLUMN document_templates.version    IS 'Owned by Hibernate @Version.';
