-- ============================================================
-- V23__create_patient_allergies.sql
-- Active allergies per patient, linked to allergies_lookup.
-- Replaces v2 patients.allergies text[] — each row carries
-- clinical detail (severity, reaction, onset, source).
-- Schema ref: docs/03-schema/v3/modules/07-patient.html#patient_allergies
-- ============================================================

CREATE TABLE patient_allergies (

    id          uuid        NOT NULL DEFAULT uuidv7(),
    patient_id  uuid        NOT NULL,
    allergy_id  uuid        NOT NULL,
    severity    text        NOT NULL,
    reaction    text,
    onset_date  date,
    source      text        NOT NULL DEFAULT 'patient_reported',
    notes       text,

    -- ── Uniform audit + soft-delete block ────────────────────
    created_by  uuid        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_by  uuid,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    version     int         NOT NULL DEFAULT 0,
    deleted_at  timestamptz,
    deleted_by  uuid,

    -- ── Constraints ──────────────────────────────────────────
    CONSTRAINT pk_patient_allergies
        PRIMARY KEY (id),

    CONSTRAINT fk_patient_allergies_patient
        FOREIGN KEY (patient_id)  REFERENCES patients(id)        ON DELETE CASCADE,

    CONSTRAINT fk_patient_allergies_allergy
        FOREIGN KEY (allergy_id)  REFERENCES allergies_lookup(id) ON DELETE RESTRICT,

    CONSTRAINT chk_patient_allergies_severity
        CHECK (severity IN ('mild','moderate','severe','life_threatening')),

    CONSTRAINT chk_patient_allergies_onset
        CHECK (onset_date IS NULL OR onset_date <= current_date),

    CONSTRAINT chk_patient_allergies_source
        CHECK (source IN ('patient_reported','doctor_recorded','medical_records'))
);

-- ── Indexes ───────────────────────────────────────────────────

-- One active row per allergy per patient; soft-deleted row does not block re-adding
CREATE UNIQUE INDEX uq_patient_allergies_active
    ON patient_allergies (patient_id, allergy_id)
    WHERE deleted_at IS NULL;

-- Load allergy list on patient chart
CREATE INDEX ix_patient_allergies_patient
    ON patient_allergies (patient_id)
    WHERE deleted_at IS NULL;

-- Find all patients with a given allergy (drug-safety check at prescribing time)
CREATE INDEX ix_patient_allergies_allergy
    ON patient_allergies (allergy_id)
    WHERE deleted_at IS NULL;

-- ── Triggers ──────────────────────────────────────────────────

CREATE TRIGGER tr_patient_allergies_bu_touch
    BEFORE UPDATE ON patient_allergies
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

CREATE TRIGGER tr_patient_allergies_au_audit
    AFTER INSERT OR UPDATE OR DELETE ON patient_allergies
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  patient_allergies IS 'Active allergies per patient. Soft-deleting a row records that the allergy was removed; history is preserved for audit. Replaces v2 patients.allergies text[].';
COMMENT ON COLUMN patient_allergies.patient_id  IS 'Parent patient. CASCADE: patient hard-delete removes all their allergy rows.';
COMMENT ON COLUMN patient_allergies.allergy_id  IS 'FK to allergies_lookup. RESTRICT: cannot delete a catalogue entry while patients reference it.';
COMMENT ON COLUMN patient_allergies.severity    IS 'mild | moderate | severe | life_threatening';
COMMENT ON COLUMN patient_allergies.reaction    IS 'Observed reaction description (e.g. "hives and rash", "anaphylactic shock").';
COMMENT ON COLUMN patient_allergies.onset_date  IS 'Approximate date the allergy was first observed or diagnosed. NULL when unknown.';
COMMENT ON COLUMN patient_allergies.source      IS 'patient_reported | doctor_recorded | medical_records';
COMMENT ON COLUMN patient_allergies.notes       IS 'Additional clinical context — cross-reactivity warnings, management instructions.';
COMMENT ON COLUMN patient_allergies.version     IS 'Optimistic-lock counter — owned by Hibernate @Version.';
COMMENT ON COLUMN patient_allergies.deleted_at  IS 'Soft-delete timestamp. NULL = active allergy. Deleted rows are preserved for audit.';
