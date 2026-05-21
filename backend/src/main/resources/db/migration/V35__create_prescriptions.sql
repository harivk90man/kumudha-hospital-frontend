-- ============================================================
-- V35__create_prescriptions.sql
-- Pharmacy fulfilment header. One per consultation.
-- status lifecycle: draft → active → partially_dispensed →
--   dispensed | cancelled.
-- locked_at is set by the service layer when the doctor signs
-- the prescription (status → active).
-- Line items live in prescription_items (V36).
-- ============================================================

CREATE TABLE prescriptions (

    id                  uuid        NOT NULL DEFAULT uuidv7(),

    -- One prescription per consultation — enforced by UNIQUE constraint below
    consultation_id     uuid        NOT NULL,

    patient_id          uuid        NOT NULL,
    doctor_id           uuid        NOT NULL,

    status              text        NOT NULL DEFAULT 'draft',

    -- Set by service layer when doctor signs (status → active)
    locked_at           timestamptz,

    -- ── Uniform audit + soft-delete block ────────────────────
    created_by          uuid        NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_by          uuid,
    updated_at          timestamptz NOT NULL DEFAULT now(),
    version             int         NOT NULL DEFAULT 0,
    deleted_at          timestamptz,
    deleted_by          uuid,

    -- ── Constraints ──────────────────────────────────────────
    CONSTRAINT pk_prescriptions
        PRIMARY KEY (id),

    CONSTRAINT uq_prescriptions_consultation
        UNIQUE (consultation_id),

    CONSTRAINT fk_prescriptions_consultation
        FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE RESTRICT,

    CONSTRAINT fk_prescriptions_patient
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE RESTRICT,

    CONSTRAINT fk_prescriptions_doctor
        FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE RESTRICT,

    CONSTRAINT chk_prescriptions_status
        CHECK (status IN ('draft','active','partially_dispensed','dispensed','cancelled'))
);

-- ── Indexes ───────────────────────────────────────────────────

-- Patient prescription history
CREATE INDEX ix_prescriptions_patient
    ON prescriptions (patient_id, created_at DESC)
    WHERE deleted_at IS NULL;

-- Pharmacy workqueue — active and partially-dispensed prescriptions
CREATE INDEX ix_prescriptions_pharmacy
    ON prescriptions (status, created_at)
    WHERE status IN ('active','partially_dispensed') AND deleted_at IS NULL;

-- ── Triggers ──────────────────────────────────────────────────

-- Layer 1: bump updated_at on every UPDATE
CREATE TRIGGER tr_prescriptions_bu_touch
    BEFORE UPDATE ON prescriptions
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

-- Layer 3: full-row audit trail
CREATE TRIGGER tr_prescriptions_au_audit
    AFTER INSERT OR UPDATE OR DELETE ON prescriptions
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  prescriptions IS 'Pharmacy fulfilment header. One per consultation. status lifecycle: draft→active→partially_dispensed→dispensed|cancelled. locked_at set when doctor signs (status→active).';
COMMENT ON COLUMN prescriptions.consultation_id IS 'One-to-one link to the consultation. UNIQUE constraint enforces at most one prescription per consultation.';
COMMENT ON COLUMN prescriptions.status          IS 'draft | active | partially_dispensed | dispensed | cancelled. Pharmacy sees active and partially_dispensed prescriptions in their workqueue.';
COMMENT ON COLUMN prescriptions.locked_at       IS 'Timestamp when the doctor signed the prescription (status → active). Subsequent status transitions are driven by pharmacy dispensing events.';
COMMENT ON COLUMN prescriptions.version         IS 'Optimistic-lock counter — owned by Hibernate @Version. Trigger does NOT touch this column.';
COMMENT ON COLUMN prescriptions.deleted_at      IS 'Soft-delete timestamp. NULL = live row.';
