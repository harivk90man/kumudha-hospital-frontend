-- ============================================================
-- V34__create_diagnosis_templates.sql
-- Doctor / department shortcut templates for common diagnoses.
-- Doctors select a template to prefill consultation fields;
-- template_json carries default diagnoses, advice, and follow-up
-- instructions in the same shape as consultations.diagnoses.
-- ============================================================

CREATE TABLE diagnosis_templates (

    id                      uuid        NOT NULL DEFAULT uuidv7(),

    template_name           text        NOT NULL,

    -- NULL = hospital-wide template; non-NULL = department-specific
    department_id           uuid,

    -- Free-text specialty tag (e.g. 'Cardiology', 'General Medicine')
    specialty               text,

    -- ICD-10 primary code for the template (e.g. 'J06.9')
    icd10_code              text,

    diagnosis_text          text        NOT NULL,

    -- Default diagnoses array + advice + follow-up payload
    -- Shape mirrors consultations.diagnoses for direct prefill
    template_json           jsonb       NOT NULL,

    default_advice          text,

    -- Suggested follow-up interval in days; NULL = no default follow-up
    default_followup_days   int,

    -- ── Uniform audit + soft-delete block ────────────────────
    created_by              uuid        NOT NULL,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_by              uuid,
    updated_at              timestamptz NOT NULL DEFAULT now(),
    version                 int         NOT NULL DEFAULT 0,
    deleted_at              timestamptz,
    deleted_by              uuid,

    -- ── Constraints ──────────────────────────────────────────
    CONSTRAINT pk_diagnosis_templates
        PRIMARY KEY (id),

    CONSTRAINT fk_diagnosis_templates_dept
        FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT,

    CONSTRAINT chk_diagnosis_templates_followup
        CHECK (default_followup_days IS NULL OR default_followup_days > 0)
);

-- ── Indexes ───────────────────────────────────────────────────

-- Filter templates by department (department picker in UI)
CREATE INDEX ix_diagnosis_templates_department
    ON diagnosis_templates (department_id)
    WHERE deleted_at IS NULL;

-- Filter templates by specialty
CREATE INDEX ix_diagnosis_templates_specialty
    ON diagnosis_templates (specialty)
    WHERE deleted_at IS NULL;

-- Case-insensitive template name search (typeahead lookup)
CREATE INDEX ix_diagnosis_templates_name
    ON diagnosis_templates (lower(template_name))
    WHERE deleted_at IS NULL;

-- ── Triggers ──────────────────────────────────────────────────

-- Layer 1: bump updated_at on every UPDATE
CREATE TRIGGER tr_diagnosis_templates_bu_touch
    BEFORE UPDATE ON diagnosis_templates
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

-- Layer 3: full-row audit trail
CREATE TRIGGER tr_diagnosis_templates_au_audit
    AFTER INSERT OR UPDATE OR DELETE ON diagnosis_templates
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  diagnosis_templates IS 'Shortcut templates for common diagnoses. Doctors select a template to prefill consultation fields. template_json carries default diagnoses, advice, and follow-up instructions.';
COMMENT ON COLUMN diagnosis_templates.department_id         IS 'Department the template belongs to. NULL = hospital-wide template visible to all departments.';
COMMENT ON COLUMN diagnosis_templates.specialty             IS 'Free-text specialty tag for grouping/filtering (e.g. Cardiology, Paediatrics). Not a FK — avoids coupling to a specialty reference table.';
COMMENT ON COLUMN diagnosis_templates.icd10_code            IS 'Primary ICD-10 code for the template (e.g. J06.9). Informational — the canonical codes live inside template_json.';
COMMENT ON COLUMN diagnosis_templates.diagnosis_text        IS 'Human-readable diagnosis description shown in the template picker.';
COMMENT ON COLUMN diagnosis_templates.template_json         IS 'Default payload prefilled into the consultation form. Shape mirrors consultations.diagnoses — array of ICD-10 coded entries plus default advice and follow-up instructions.';
COMMENT ON COLUMN diagnosis_templates.default_advice        IS 'Default advice text prefilled into consultations.advice when this template is selected.';
COMMENT ON COLUMN diagnosis_templates.default_followup_days IS 'Suggested follow-up interval in days. Service layer translates this to consultations.follow_up_date = today + default_followup_days. NULL = no default follow-up.';
COMMENT ON COLUMN diagnosis_templates.version               IS 'Optimistic-lock counter — owned by Hibernate @Version. Trigger does NOT touch this column.';
COMMENT ON COLUMN diagnosis_templates.deleted_at            IS 'Soft-delete timestamp. NULL = live row.';
