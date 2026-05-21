-- ============================================================
-- V33__create_consultations.sql
-- One consultation note per OP visit. Written by the treating doctor.
-- status=draft allows free editing; status=locked makes clinical
-- columns immutable — enforced by fn_consultation_lock_guard().
-- diagnoses stores an array of ICD-10 coded entries as jsonb.
-- ============================================================

CREATE TABLE consultations (

    id                          uuid        NOT NULL DEFAULT uuidv7(),

    -- One consultation per visit — enforced by UNIQUE constraint below
    op_visit_id                 uuid        NOT NULL,

    status                      text        NOT NULL DEFAULT 'draft',

    patient_id                  uuid        NOT NULL,
    doctor_id                   uuid        NOT NULL,

    -- ── Clinical narrative ───────────────────────────────────
    chief_complaint             text,
    history_of_present_illness  text,
    past_history                text,

    -- Structured physical examination findings (system-by-system JSON)
    examination_findings        jsonb,

    -- Array of ICD-10 coded diagnosis entries; empty array when none yet
    diagnoses                   jsonb       NOT NULL DEFAULT '[]',

    symptoms                    text,
    clinical_notes              text,
    advice                      text,

    -- ── Disposition ──────────────────────────────────────────
    next_action                 text        NOT NULL DEFAULT 'no_action',
    follow_up_required          boolean     NOT NULL DEFAULT false,
    follow_up_date              date,

    -- Set by the service layer when the doctor locks the consultation
    locked_at                   timestamptz,

    -- ── Uniform audit + soft-delete block ────────────────────
    created_by                  uuid        NOT NULL,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_by                  uuid,
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    version                     int         NOT NULL DEFAULT 0,
    deleted_at                  timestamptz,
    deleted_by                  uuid,

    -- ── Constraints ──────────────────────────────────────────
    CONSTRAINT pk_consultations
        PRIMARY KEY (id),

    CONSTRAINT uq_consultations_visit
        UNIQUE (op_visit_id),

    CONSTRAINT fk_consultations_visit
        FOREIGN KEY (op_visit_id) REFERENCES op_visits(id) ON DELETE RESTRICT,

    CONSTRAINT fk_consultations_patient
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE RESTRICT,

    CONSTRAINT fk_consultations_doctor
        FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE RESTRICT,

    CONSTRAINT chk_consultations_status
        CHECK (status IN ('draft','locked')),

    CONSTRAINT chk_consultations_next_action
        CHECK (next_action IN (
            'prescription_only','lab_ordered','radiology_ordered',
            'admit_ip','surgery_referral','follow_up','referred_external','no_action'
        )),

    -- follow_up_date is only meaningful when follow_up_required is true
    CONSTRAINT chk_consultations_follow_up
        CHECK (follow_up_required = true OR follow_up_date IS NULL)
);

-- ── Indexes ───────────────────────────────────────────────────

-- Patient consultation history
CREATE INDEX ix_consultations_patient
    ON consultations (patient_id, created_at DESC)
    WHERE deleted_at IS NULL;

-- Doctor's consultation list
CREATE INDEX ix_consultations_doctor
    ON consultations (doctor_id, created_at DESC)
    WHERE deleted_at IS NULL;

-- Follow-up worklist — upcoming follow-up consultations
CREATE INDEX ix_consultations_follow_up
    ON consultations (follow_up_date)
    WHERE follow_up_required = true AND deleted_at IS NULL;

-- ICD-10 / diagnosis containment queries (@> operator)
CREATE INDEX ix_consultations_diagnoses
    ON consultations USING GIN (diagnoses)
    WHERE deleted_at IS NULL;

-- ── Lock-guard trigger function ───────────────────────────────

-- Prevents mutation of clinical columns once status = 'locked'.
-- Non-clinical administrative columns (follow_up_required, follow_up_date,
-- updated_by, updated_at, deleted_at, deleted_by) remain editable after locking.
CREATE OR REPLACE FUNCTION fn_consultation_lock_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status = 'locked' AND (
        NEW.chief_complaint            IS DISTINCT FROM OLD.chief_complaint            OR
        NEW.history_of_present_illness IS DISTINCT FROM OLD.history_of_present_illness OR
        NEW.past_history               IS DISTINCT FROM OLD.past_history               OR
        NEW.examination_findings       IS DISTINCT FROM OLD.examination_findings       OR
        NEW.diagnoses                  IS DISTINCT FROM OLD.diagnoses                  OR
        NEW.symptoms                   IS DISTINCT FROM OLD.symptoms                   OR
        NEW.clinical_notes             IS DISTINCT FROM OLD.clinical_notes             OR
        NEW.advice                     IS DISTINCT FROM OLD.advice                     OR
        NEW.next_action                IS DISTINCT FROM OLD.next_action
    ) THEN
        RAISE EXCEPTION 'consultation % is locked — clinical columns cannot be modified', OLD.id
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

-- ── Triggers ──────────────────────────────────────────────────

-- Layer 1: bump updated_at on every UPDATE
CREATE TRIGGER tr_consultations_bu_touch
    BEFORE UPDATE ON consultations
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

-- Layer 2: prevent clinical column changes once status = 'locked'
CREATE TRIGGER tr_consultations_bu_lock_guard
    BEFORE UPDATE ON consultations
    FOR EACH ROW EXECUTE FUNCTION fn_consultation_lock_guard();

-- Layer 3: full-row audit trail
CREATE TRIGGER tr_consultations_au_audit
    AFTER INSERT OR UPDATE OR DELETE ON consultations
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  consultations IS 'One consultation note per OP visit. status=draft allows editing; status=locked is immutable for clinical columns — enforced by trigger. diagnoses is a jsonb array of ICD-10 coded entries.';
COMMENT ON COLUMN consultations.op_visit_id                 IS 'One-to-one link to the OP visit. UNIQUE constraint enforces at most one consultation per visit.';
COMMENT ON COLUMN consultations.status                      IS 'draft | locked. Clinical columns become immutable once status transitions to locked (enforced by fn_consultation_lock_guard trigger).';
COMMENT ON COLUMN consultations.examination_findings        IS 'Structured physical examination data keyed by body system (e.g. {"cardiovascular": "S1 S2 heard, no murmur"}). Schema is flexible jsonb.';
COMMENT ON COLUMN consultations.diagnoses                   IS 'jsonb array of ICD-10 coded diagnosis entries, e.g. [{"code":"J06.9","description":"Acute upper respiratory infection"}]. Empty array when no diagnoses recorded.';
COMMENT ON COLUMN consultations.next_action                 IS 'prescription_only | lab_ordered | radiology_ordered | admit_ip | surgery_referral | follow_up | referred_external | no_action.';
COMMENT ON COLUMN consultations.follow_up_required          IS 'TRUE when the doctor has scheduled a follow-up visit. follow_up_date must be non-NULL when this is true.';
COMMENT ON COLUMN consultations.follow_up_date              IS 'Target date for the follow-up visit. NULL unless follow_up_required = true.';
COMMENT ON COLUMN consultations.locked_at                   IS 'Timestamp when the doctor locked the consultation (status → locked). Set by service layer.';
COMMENT ON COLUMN consultations.version                     IS 'Optimistic-lock counter — owned by Hibernate @Version. Trigger does NOT touch this column.';
COMMENT ON COLUMN consultations.deleted_at                  IS 'Soft-delete timestamp. NULL = live row.';
