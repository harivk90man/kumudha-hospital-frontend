-- ============================================================
-- V24__create_patient_chronic_conditions.sql
-- Chronic conditions per patient, linked to chronic_conditions_lookup.
-- Replaces v2 patients.chronic_conditions text[].
-- A resolved condition is marked is_resolved = true rather than
-- soft-deleted, so medical history is always visible on the chart.
-- Schema ref: docs/03-schema/v3/modules/07-patient.html#patient_chronic_conditions
-- ============================================================

CREATE TABLE patient_chronic_conditions (

    id                uuid        NOT NULL DEFAULT uuidv7(),
    patient_id        uuid        NOT NULL,
    condition_id      uuid        NOT NULL,
    diagnosed_date    date,
    severity          text,
    controlled_status text        NOT NULL DEFAULT 'unknown',
    is_resolved       boolean     NOT NULL DEFAULT false,
    resolved_date     date,
    notes             text,

    -- ── Uniform audit + soft-delete block ────────────────────
    created_by        uuid        NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_by        uuid,
    updated_at        timestamptz NOT NULL DEFAULT now(),
    version           int         NOT NULL DEFAULT 0,
    deleted_at        timestamptz,
    deleted_by        uuid,

    -- ── Constraints ──────────────────────────────────────────
    CONSTRAINT pk_patient_chronic_conditions
        PRIMARY KEY (id),

    CONSTRAINT fk_patient_chronic_conditions_patient
        FOREIGN KEY (patient_id)   REFERENCES patients(id)                  ON DELETE CASCADE,

    CONSTRAINT fk_patient_chronic_conditions_condition
        FOREIGN KEY (condition_id) REFERENCES chronic_conditions_lookup(id)  ON DELETE RESTRICT,

    CONSTRAINT chk_patient_chronic_conditions_diagnosed
        CHECK (diagnosed_date IS NULL OR diagnosed_date <= current_date),

    CONSTRAINT chk_patient_chronic_conditions_severity
        CHECK (severity IS NULL OR severity IN ('mild','moderate','severe')),

    CONSTRAINT chk_patient_chronic_conditions_controlled
        CHECK (controlled_status IN ('controlled','partially_controlled','uncontrolled','unknown')),

    -- resolved_date must be present iff is_resolved = true
    CONSTRAINT chk_patient_chronic_conditions_resolved
        CHECK (
            (is_resolved = false AND resolved_date IS NULL)
            OR (is_resolved = true  AND resolved_date IS NOT NULL AND resolved_date <= current_date)
        )
);

-- ── Indexes ───────────────────────────────────────────────────

-- One active row per condition per patient
CREATE UNIQUE INDEX uq_patient_chronic_conditions_active
    ON patient_chronic_conditions (patient_id, condition_id)
    WHERE deleted_at IS NULL;

-- Load condition list on patient chart
CREATE INDEX ix_patient_chronic_conditions_patient
    ON patient_chronic_conditions (patient_id)
    WHERE deleted_at IS NULL;

-- Population-level condition reports
CREATE INDEX ix_patient_chronic_conditions_condition
    ON patient_chronic_conditions (condition_id)
    WHERE deleted_at IS NULL;

-- ── Triggers ──────────────────────────────────────────────────

CREATE TRIGGER tr_patient_chronic_conditions_bu_touch
    BEFORE UPDATE ON patient_chronic_conditions
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

CREATE TRIGGER tr_patient_chronic_conditions_au_audit
    AFTER INSERT OR UPDATE OR DELETE ON patient_chronic_conditions
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  patient_chronic_conditions IS 'Chronic conditions per patient. Resolved conditions are marked is_resolved = true (not soft-deleted) so full medical history is always visible. Replaces v2 patients.chronic_conditions text[].';
COMMENT ON COLUMN patient_chronic_conditions.patient_id        IS 'Parent patient. CASCADE: patient hard-delete removes all their condition rows.';
COMMENT ON COLUMN patient_chronic_conditions.condition_id      IS 'FK to chronic_conditions_lookup. RESTRICT: cannot delete a catalogue entry while patients reference it.';
COMMENT ON COLUMN patient_chronic_conditions.diagnosed_date    IS 'Date of formal diagnosis. NULL when only approximate year is known.';
COMMENT ON COLUMN patient_chronic_conditions.severity          IS 'mild | moderate | severe. NULL when severity grading does not apply.';
COMMENT ON COLUMN patient_chronic_conditions.controlled_status IS 'controlled | partially_controlled | uncontrolled | unknown — updated at each consultation review.';
COMMENT ON COLUMN patient_chronic_conditions.is_resolved       IS 'True when condition is in remission or resolved. Row is kept for medical history — do NOT soft-delete resolved conditions.';
COMMENT ON COLUMN patient_chronic_conditions.resolved_date     IS 'Date resolution was confirmed. Must be NULL when is_resolved = false.';
COMMENT ON COLUMN patient_chronic_conditions.notes             IS 'Clinical context — stage, comorbidity notes, management plan summary.';
COMMENT ON COLUMN patient_chronic_conditions.version           IS 'Optimistic-lock counter — owned by Hibernate @Version.';
COMMENT ON COLUMN patient_chronic_conditions.deleted_at        IS 'Soft-delete timestamp. NULL = active row. Use is_resolved for clinical resolution — not soft-delete.';
