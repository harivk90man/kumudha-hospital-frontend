-- ============================================================
-- V32__create_vitals.sql
-- Vital signs recorded per visit. One or more rows may exist per
-- op_visit (e.g. triage vitals, mid-consultation re-check).
-- bmi is a GENERATED column — never written by the application.
-- ============================================================

CREATE TABLE vitals (

    id                  uuid        NOT NULL DEFAULT uuidv7(),

    patient_id          uuid        NOT NULL,

    -- Optional: triage vitals captured before a visit is opened have no op_visit yet
    op_visit_id         uuid,

    -- ── Clinical measurements ────────────────────────────────
    bp_systolic         int,
    bp_diastolic        int,
    pulse_rate          int,
    spo2                int,
    temperature       numeric(4,1),
    respiratory_rate    int,
    weight_kg           numeric(5,2),
    height_cm           numeric(5,2),

    -- Auto-computed from weight_kg and height_cm; never set by app
    bmi                 numeric(5,1) GENERATED ALWAYS AS (
                            weight_kg / NULLIF((height_cm / 100.0) ^ 2, 0)
                        ) STORED,

    blood_sugar_mg_dl   int,
    pain_score          int,
    notes               text,

    -- ── Uniform audit + soft-delete block ────────────────────
    created_by          uuid        NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_by          uuid,
    updated_at          timestamptz NOT NULL DEFAULT now(),
    version             int         NOT NULL DEFAULT 0,
    deleted_at          timestamptz,
    deleted_by          uuid,

    -- ── Constraints ──────────────────────────────────────────
    CONSTRAINT pk_vitals
        PRIMARY KEY (id),

    CONSTRAINT fk_vitals_patient
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE RESTRICT,

    CONSTRAINT fk_vitals_visit
        FOREIGN KEY (op_visit_id) REFERENCES op_visits(id) ON DELETE RESTRICT,

    CONSTRAINT chk_vitals_bp_systolic
        CHECK (bp_systolic IS NULL OR bp_systolic BETWEEN 60 AND 300),

    CONSTRAINT chk_vitals_bp_diastolic
        CHECK (bp_diastolic IS NULL OR bp_diastolic BETWEEN 30 AND 200),

    CONSTRAINT chk_vitals_pulse
        CHECK (pulse_rate IS NULL OR pulse_rate BETWEEN 20 AND 300),

    CONSTRAINT chk_vitals_spo2
        CHECK (spo2 IS NULL OR spo2 BETWEEN 0 AND 100),

    CONSTRAINT chk_vitals_temp
        CHECK (temperature IS NULL OR temperature BETWEEN 90.0 AND 115.0),

    CONSTRAINT chk_vitals_rr
        CHECK (respiratory_rate IS NULL OR respiratory_rate BETWEEN 5 AND 60),

    CONSTRAINT chk_vitals_weight
        CHECK (weight_kg IS NULL OR weight_kg BETWEEN 0.5 AND 500),

    CONSTRAINT chk_vitals_height
        CHECK (height_cm IS NULL OR height_cm BETWEEN 10 AND 300),

    CONSTRAINT chk_vitals_bsl
        CHECK (blood_sugar_mg_dl IS NULL OR blood_sugar_mg_dl BETWEEN 10 AND 1500),

    CONSTRAINT chk_vitals_pain
        CHECK (pain_score IS NULL OR pain_score BETWEEN 0 AND 10)
);

-- ── Indexes ───────────────────────────────────────────────────

-- Fetch all vitals for a visit in reverse chronological order
CREATE INDEX ix_vitals_visit
    ON vitals (op_visit_id, created_at DESC)
    WHERE op_visit_id IS NOT NULL;

-- Patient vitals history (timeline view, excludes soft-deleted)
CREATE INDEX ix_vitals_patient
    ON vitals (patient_id, created_at DESC)
    WHERE deleted_at IS NULL;

-- ── Triggers ──────────────────────────────────────────────────

-- Layer 1: bump updated_at on every UPDATE
CREATE TRIGGER tr_vitals_bu_touch
    BEFORE UPDATE ON vitals
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

-- Layer 3: full-row audit trail
CREATE TRIGGER tr_vitals_au_audit
    AFTER INSERT OR UPDATE OR DELETE ON vitals
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  vitals IS 'Vital signs per visit. bmi is GENERATED from weight_kg and height_cm — never written by app.';
COMMENT ON COLUMN vitals.op_visit_id        IS 'Links to the OP visit. NULL for triage vitals captured before the visit record is created.';
COMMENT ON COLUMN vitals.bp_systolic        IS 'Systolic blood pressure in mmHg. Valid range 60–300.';
COMMENT ON COLUMN vitals.bp_diastolic       IS 'Diastolic blood pressure in mmHg. Valid range 30–200.';
COMMENT ON COLUMN vitals.pulse_rate         IS 'Pulse / heart rate in beats per minute. Valid range 20–300.';
COMMENT ON COLUMN vitals.spo2               IS 'Peripheral oxygen saturation in percent. Valid range 0–100.';
COMMENT ON COLUMN vitals.temperature      IS 'Body temperature in degrees Fahrenheit. Valid range 90.0–115.0.';
COMMENT ON COLUMN vitals.respiratory_rate   IS 'Breaths per minute. Valid range 5–60.';
COMMENT ON COLUMN vitals.weight_kg          IS 'Patient weight in kilograms. Valid range 0.5–500.';
COMMENT ON COLUMN vitals.height_cm          IS 'Patient height in centimetres. Valid range 10–300.';
COMMENT ON COLUMN vitals.bmi               IS 'GENERATED ALWAYS AS (weight_kg / NULLIF((height_cm/100.0)^2, 0)) STORED. NULL when weight or height is missing.';
COMMENT ON COLUMN vitals.blood_sugar_mg_dl  IS 'Blood glucose level in mg/dL. Valid range 10–1500.';
COMMENT ON COLUMN vitals.pain_score         IS 'Numeric pain scale (0 = no pain, 10 = worst imaginable). Valid range 0–10.';
COMMENT ON COLUMN vitals.version            IS 'Optimistic-lock counter — owned by Hibernate @Version. Trigger does NOT touch this column.';
COMMENT ON COLUMN vitals.deleted_at         IS 'Soft-delete timestamp. NULL = live row.';
