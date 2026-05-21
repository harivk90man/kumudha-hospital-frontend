-- ============================================================
-- V36__create_prescription_items.sql
-- Line items on a prescription. CASCADE child of prescriptions.
-- medicine_id column is present; FK → medicines(id) is deferred
-- until the inventory module migration (Module 14) so this
-- migration does not depend on medicines being created first.
-- medicine_name_snapshot captures the name at prescription time
-- so pharmacy displays the correct name even if the medicine
-- catalogue entry is later renamed or merged.
-- ============================================================

CREATE TABLE prescription_items (

    id                      uuid        NOT NULL DEFAULT uuidv7(),

    prescription_id         uuid        NOT NULL,

    -- FK constraint to medicines(id) added in inventory module migration
    medicine_id             uuid        NOT NULL,

    -- Snapshot of medicine name at prescription time
    medicine_name_snapshot  text        NOT NULL,

    -- Dosage description (e.g. '500 mg', '5 ml')
    dosage                  text        NOT NULL,

    -- Frequency code / description (e.g. 'TID', 'OD', 'BD after meals')
    frequency               text        NOT NULL,

    duration_days           int         NOT NULL,

    instructions            text,

    quantity_prescribed     int         NOT NULL,

    -- Display order within the prescription (1-based)
    sequence_no             int         NOT NULL,

    -- ── Uniform audit + soft-delete block ────────────────────
    created_by              uuid        NOT NULL,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_by              uuid,
    updated_at              timestamptz NOT NULL DEFAULT now(),
    version                 int         NOT NULL DEFAULT 0,
    deleted_at              timestamptz,
    deleted_by              uuid,

    -- ── Constraints ──────────────────────────────────────────
    CONSTRAINT pk_prescription_items
        PRIMARY KEY (id),

    CONSTRAINT fk_prescription_items_prescription
        FOREIGN KEY (prescription_id) REFERENCES prescriptions(id) ON DELETE CASCADE,

    CONSTRAINT chk_prescription_items_duration
        CHECK (duration_days > 0),

    CONSTRAINT chk_prescription_items_qty_prescribed
        CHECK (quantity_prescribed > 0),

    CONSTRAINT chk_prescription_items_sequence
        CHECK (sequence_no > 0),

    -- sequence_no must be unique within a prescription
    CONSTRAINT uq_prescription_items_sequence
        UNIQUE (prescription_id, sequence_no)
);

-- ── Indexes ───────────────────────────────────────────────────

-- Fetch all line items for a prescription (primary access pattern)
CREATE INDEX ix_prescription_items_prescription
    ON prescription_items (prescription_id)
    WHERE deleted_at IS NULL;

-- Cross-prescription lookup by medicine (dispensing history, drug interaction checks)
CREATE INDEX ix_prescription_items_medicine
    ON prescription_items (medicine_id)
    WHERE deleted_at IS NULL;

-- ── Triggers ──────────────────────────────────────────────────

-- Layer 1: bump updated_at on every UPDATE
CREATE TRIGGER tr_prescription_items_bu_touch
    BEFORE UPDATE ON prescription_items
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

-- Layer 3: full-row audit trail
CREATE TRIGGER tr_prescription_items_au_audit
    AFTER INSERT OR UPDATE OR DELETE ON prescription_items
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  prescription_items IS 'One row per medicine line on a prescription. CASCADE child of prescriptions. medicine_id FK to medicines(id) added in the inventory module migration.';
COMMENT ON COLUMN prescription_items.prescription_id        IS 'Parent prescription. ON DELETE CASCADE — items are removed when the prescription is deleted.';
COMMENT ON COLUMN prescription_items.medicine_id            IS 'FK → medicines(id) RESTRICT — constraint added in the inventory module migration (V__create_medicines).';
COMMENT ON COLUMN prescription_items.medicine_name_snapshot IS 'Snapshot of medicine name at prescription time. Pharmacy displays this even if the medicine catalogue entry is later renamed or merged.';
COMMENT ON COLUMN prescription_items.dosage                 IS 'Dose per administration (e.g. 500 mg, 5 ml, 1 tablet).';
COMMENT ON COLUMN prescription_items.frequency              IS 'Administration frequency (e.g. OD, BD, TID, QID, SOS). Free text to accommodate local conventions.';
COMMENT ON COLUMN prescription_items.duration_days          IS 'Number of days for which the medicine is prescribed. Must be > 0.';
COMMENT ON COLUMN prescription_items.instructions           IS 'Additional patient-facing instructions (e.g. take after meals, avoid sunlight).';
COMMENT ON COLUMN prescription_items.quantity_prescribed    IS 'Total quantity to dispense. Must be > 0. Derived by the service layer from frequency × duration_days × dose units.';
COMMENT ON COLUMN prescription_items.sequence_no            IS '1-based display order within the prescription. Unique per prescription_id — enforced by uq_prescription_items_sequence.';
COMMENT ON COLUMN prescription_items.version                IS 'Optimistic-lock counter — owned by Hibernate @Version. Trigger does NOT touch this column.';
COMMENT ON COLUMN prescription_items.deleted_at             IS 'Soft-delete timestamp. NULL = live row.';
