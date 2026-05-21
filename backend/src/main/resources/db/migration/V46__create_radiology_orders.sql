-- ============================================================
-- V46__create_radiology_orders.sql
-- Radiology order header. One row per imaging order raised by
-- a doctor.
-- order_number is app-generated (e.g. RD-2026-00123).
-- status tracks the full lifecycle: ordered → imaging →
-- reporting → release.
-- ip_admission_id FK to ip_admissions(id) deferred to IP module.
-- invoice_id FK to invoices(id) deferred to billing module (Module 17).
-- Also wires deferred FKs from tokens and doctor_recommendations.
-- ============================================================

CREATE TABLE radiology_orders (

    id                      uuid        NOT NULL DEFAULT uuidv7(),

    -- Human-readable reference printed on request forms and reports
    order_number            text        NOT NULL,

    patient_id              uuid        NOT NULL,

    -- NULL for orders raised outside a formal OP visit
    op_visit_id             uuid,

    -- NULL for OP orders; column present, FK added in IP module migration
    ip_admission_id         uuid,

    -- NULL when the order is not linked to a consultation note
    consultation_id         uuid,

    -- Ordering clinician
    doctor_id               uuid        NOT NULL,

    -- Imaging procedure being requested
    radiology_procedure_id  uuid        NOT NULL,

    -- Clinical context to guide radiologist interpretation
    clinical_question       text,

    -- Urgency level drives worklist ordering and SLA targets
    priority                text        NOT NULL DEFAULT 'routine',

    -- Billing reference — FK to invoices(id) added in billing module migration (Module 17)
    invoice_id              uuid,

    -- Full lifecycle state machine
    status                  text        NOT NULL DEFAULT 'ordered',

    -- Populated when the imaging acquisition is completed
    imaging_completed_at    timestamptz,

    -- Populated when the final report is released to the requesting doctor
    released_at             timestamptz,

    -- ── Uniform audit + soft-delete block ────────────────────
    created_by      uuid        NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_by      uuid,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    version         int         NOT NULL DEFAULT 0,
    deleted_at      timestamptz,
    deleted_by      uuid,

    -- ── Constraints ──────────────────────────────────────────
    CONSTRAINT pk_radiology_orders
        PRIMARY KEY (id),

    CONSTRAINT uq_radiology_orders_number
        UNIQUE (order_number),

    CONSTRAINT fk_radiology_orders_patient
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE RESTRICT,

    CONSTRAINT fk_radiology_orders_visit
        FOREIGN KEY (op_visit_id) REFERENCES op_visits(id) ON DELETE RESTRICT,

    CONSTRAINT fk_radiology_orders_consultation
        FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE RESTRICT,

    CONSTRAINT fk_radiology_orders_doctor
        FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE RESTRICT,

    CONSTRAINT fk_radiology_orders_procedure
        FOREIGN KEY (radiology_procedure_id) REFERENCES radiology_procedures(id) ON DELETE RESTRICT,

    CONSTRAINT chk_radiology_orders_number_len
        CHECK (char_length(order_number) BETWEEN 5 AND 30),

    CONSTRAINT chk_radiology_orders_priority
        CHECK (priority IN ('routine','urgent','stat')),

    CONSTRAINT chk_radiology_orders_status
        CHECK (status IN (
            'ordered','awaiting_payment','paid','imaging_pending',
            'imaging_in_progress','imaging_completed','reporting_pending',
            'reported','released','cancelled'
        )),

    -- An order cannot belong to both an OP visit and an IP admission simultaneously
    CONSTRAINT chk_radiology_orders_context
        CHECK (num_nonnulls(op_visit_id, ip_admission_id) <= 1)
);

-- ── Indexes ───────────────────────────────────────────────────

-- Patient radiology history ordered by most recent first
CREATE INDEX ix_radiology_orders_patient
    ON radiology_orders (patient_id, created_at DESC)
    WHERE deleted_at IS NULL;

-- Imaging worklist — active orders sorted by urgency then arrival time
CREATE INDEX ix_radiology_orders_worklist
    ON radiology_orders (status, priority, created_at)
    WHERE deleted_at IS NULL AND status NOT IN ('released','cancelled');

-- Lookup all radiology orders for a consultation
CREATE INDEX ix_radiology_orders_consultation
    ON radiology_orders (consultation_id)
    WHERE consultation_id IS NOT NULL AND deleted_at IS NULL;

-- Lookup orders tied to an invoice (billing reconciliation)
CREATE INDEX ix_radiology_orders_invoice
    ON radiology_orders (invoice_id)
    WHERE invoice_id IS NOT NULL AND deleted_at IS NULL;

-- ── Triggers ──────────────────────────────────────────────────

-- Layer 1: bump updated_at on every UPDATE
CREATE TRIGGER tr_radiology_orders_bu_touch
    BEFORE UPDATE ON radiology_orders
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

-- Layer 3: full-row audit trail
CREATE TRIGGER tr_radiology_orders_au_audit
    AFTER INSERT OR UPDATE OR DELETE ON radiology_orders
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  radiology_orders IS 'Radiology order header. ip_admission_id FK added in IP module. invoice_id FK added in billing module. status tracks full lifecycle from ordering to report release.';
COMMENT ON COLUMN radiology_orders.order_number           IS 'Human-readable reference printed on request forms and reports (e.g. RD-2026-00123). Globally unique. Generated by service layer.';
COMMENT ON COLUMN radiology_orders.patient_id             IS 'Patient for whom the radiology order was raised.';
COMMENT ON COLUMN radiology_orders.op_visit_id            IS 'OP visit that triggered the order. NULL for orders raised outside a formal visit.';
COMMENT ON COLUMN radiology_orders.ip_admission_id        IS 'FK → ip_admissions(id) RESTRICT — constraint added in the IP module migration. NULL for OP orders.';
COMMENT ON COLUMN radiology_orders.consultation_id        IS 'Consultation note that generated this order. NULL when raised without a consultation.';
COMMENT ON COLUMN radiology_orders.doctor_id              IS 'Clinician who ordered the imaging. Required for all orders (request form must carry a doctor signature).';
COMMENT ON COLUMN radiology_orders.radiology_procedure_id IS 'Imaging procedure being requested from the radiology catalogue.';
COMMENT ON COLUMN radiology_orders.clinical_question      IS 'Clinical question from requesting doctor — guides radiologist interpretation.';
COMMENT ON COLUMN radiology_orders.priority               IS 'routine | urgent | stat. Drives worklist ordering and SLA targets.';
COMMENT ON COLUMN radiology_orders.invoice_id             IS 'FK → invoices(id) RESTRICT — constraint added in the billing module migration (Module 17).';
COMMENT ON COLUMN radiology_orders.status                 IS 'ordered → awaiting_payment → paid → imaging_pending → imaging_in_progress → imaging_completed → reporting_pending → reported → released. cancelled is a terminal state.';
COMMENT ON COLUMN radiology_orders.imaging_completed_at   IS 'Timestamp when the imaging acquisition was marked complete and images are ready for reporting. NULL while imaging is pending or in progress.';
COMMENT ON COLUMN radiology_orders.released_at            IS 'Timestamp when the final report was released to the requesting doctor and patient. NULL until status = released.';
COMMENT ON COLUMN radiology_orders.version                IS 'Optimistic-lock counter — owned by Hibernate @Version. Trigger does NOT touch this column.';
COMMENT ON COLUMN radiology_orders.deleted_at             IS 'Soft-delete timestamp. NULL = live row.';

-- ── Wire deferred FKs now that radiology_orders exists ────────

-- tokens.radiology_order_id was left without an FK in its original
-- migration because radiology_orders did not exist yet. Wire it now.
ALTER TABLE tokens
    ADD CONSTRAINT fk_tokens_radiology_order
    FOREIGN KEY (radiology_order_id) REFERENCES radiology_orders(id) ON DELETE RESTRICT;

-- doctor_recommendations.radiology_order_id was left without an FK
-- for the same reason. Wire it now.
ALTER TABLE doctor_recommendations
    ADD CONSTRAINT fk_doctor_recommendations_radiology_order
    FOREIGN KEY (radiology_order_id) REFERENCES radiology_orders(id) ON DELETE RESTRICT;
