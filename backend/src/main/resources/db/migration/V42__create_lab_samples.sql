-- ============================================================
-- V42__create_lab_samples.sql
-- Physical specimen collected for a lab order.
-- One sample per collection event; a rejected sample triggers a
-- new collection, with the replacement row pointing back via
-- replaces_sample_id (self-FK recollection chain).
-- chk_lab_samples_rejection enforces that rejection_reason is
-- present if and only if status = 'rejected'.
-- ============================================================

CREATE TABLE lab_samples (

    id                  uuid        NOT NULL DEFAULT uuidv7(),

    -- Barcode printed on the sample container / tube
    sample_barcode      text        NOT NULL,

    patient_id          uuid        NOT NULL,
    lab_order_id        uuid        NOT NULL,

    -- Actual specimen type collected (may differ from the test's expected type)
    sample_type         text        NOT NULL,

    -- Collection-to-disposal lifecycle state
    status              text        NOT NULL DEFAULT 'collected',

    -- Staff member who collected the specimen
    collected_by        uuid        NOT NULL,

    -- Timestamps for key lifecycle transitions
    received_at         timestamptz,
    rejected_at         timestamptz,

    -- Staff member who rejected the sample (SET NULL when the user is removed)
    rejected_by         uuid,

    -- Mandatory when status = 'rejected'; absent otherwise (enforced by check)
    rejection_reason    text,

    disposed_at         timestamptz,

    -- Self-FK: replacement sample points back to the rejected original
    replaces_sample_id  uuid,

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
    CONSTRAINT pk_lab_samples
        PRIMARY KEY (id),

    CONSTRAINT uq_lab_samples_barcode
        UNIQUE (sample_barcode),

    CONSTRAINT fk_lab_samples_patient
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE RESTRICT,

    CONSTRAINT fk_lab_samples_order
        FOREIGN KEY (lab_order_id) REFERENCES lab_orders(id) ON DELETE RESTRICT,

    CONSTRAINT fk_lab_samples_collected_by
        FOREIGN KEY (collected_by) REFERENCES users(id) ON DELETE RESTRICT,

    CONSTRAINT fk_lab_samples_rejected_by
        FOREIGN KEY (rejected_by) REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT fk_lab_samples_replaces
        FOREIGN KEY (replaces_sample_id) REFERENCES lab_samples(id) ON DELETE RESTRICT,

    CONSTRAINT chk_lab_samples_status
        CHECK (status IN (
            'collected','received','rejected','processing','processed','disposed'
        )),

    -- rejection_reason is mandatory when status = 'rejected', absent otherwise
    CONSTRAINT chk_lab_samples_rejection
        CHECK ((status = 'rejected') = (rejection_reason IS NOT NULL))
);

-- ── Indexes ───────────────────────────────────────────────────

-- All samples for an order (order detail view, sample tracking)
CREATE INDEX ix_lab_samples_order
    ON lab_samples (lab_order_id);

-- Locate the replacement sample(s) of a rejected specimen
CREATE INDEX ix_lab_samples_replaces
    ON lab_samples (replaces_sample_id)
    WHERE replaces_sample_id IS NOT NULL;

-- Accessioning worklist — freshly collected / received samples awaiting processing
CREATE INDEX ix_lab_samples_status
    ON lab_samples (status, created_at)
    WHERE status IN ('collected','received');

-- ── Triggers ──────────────────────────────────────────────────

-- Layer 1: bump updated_at on every UPDATE
CREATE TRIGGER tr_lab_samples_bu_touch
    BEFORE UPDATE ON lab_samples
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

-- Layer 3: full-row audit trail
CREATE TRIGGER tr_lab_samples_au_audit
    AFTER INSERT OR UPDATE OR DELETE ON lab_samples
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  lab_samples IS 'Physical sample for a lab order. replaces_sample_id self-FK links a recollected sample back to the rejected original. rejection_reason is required when status=rejected.';
COMMENT ON COLUMN lab_samples.sample_barcode     IS 'Barcode label printed on the sample container. Must be globally unique across all collections.';
COMMENT ON COLUMN lab_samples.sample_type        IS 'Actual specimen type collected (e.g. EDTA whole blood, serum). May differ from the expected type declared on the lab test.';
COMMENT ON COLUMN lab_samples.status             IS 'collected | received | rejected | processing | processed | disposed. Terminal states: processed, disposed.';
COMMENT ON COLUMN lab_samples.collected_by       IS 'Phlebotomist or nurse who performed the collection.';
COMMENT ON COLUMN lab_samples.received_at        IS 'Timestamp when the sample arrived and was logged at the lab receiving desk.';
COMMENT ON COLUMN lab_samples.rejected_at        IS 'Timestamp when the sample was rejected (haemolysis, insufficient volume, wrong tube, etc.).';
COMMENT ON COLUMN lab_samples.rejected_by        IS 'Lab staff member who rejected the sample. SET NULL if the user account is later removed.';
COMMENT ON COLUMN lab_samples.rejection_reason   IS 'Mandatory description of why the sample was rejected. NULL unless status = rejected (enforced by chk_lab_samples_rejection).';
COMMENT ON COLUMN lab_samples.disposed_at        IS 'Timestamp when the specimen was disposed of per biohazard protocol.';
COMMENT ON COLUMN lab_samples.replaces_sample_id IS 'Self-FK: when a sample is rejected and a new one collected, the replacement row points here. Enables recollection audit chain.';
COMMENT ON COLUMN lab_samples.notes              IS 'Free-text notes from the collector (e.g. difficult venepuncture, patient fasting status confirmed).';
COMMENT ON CONSTRAINT chk_lab_samples_rejection ON lab_samples IS 'Rejection reason is mandatory when status = rejected, absent otherwise.';
COMMENT ON COLUMN lab_samples.version            IS 'Optimistic-lock counter — owned by Hibernate @Version. Trigger does NOT touch this column.';
COMMENT ON COLUMN lab_samples.deleted_at         IS 'Soft-delete timestamp. NULL = live row.';
