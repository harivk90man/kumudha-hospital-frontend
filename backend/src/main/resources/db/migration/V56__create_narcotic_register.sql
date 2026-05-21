-- ============================================================
-- V56__create_narcotic_register.sql
-- NDPS-mandated narcotic movement register. Append-only with
-- 7-year legal retention.
-- Two-person rule: performed_by ≠ witnessed_by, enforced by
-- chk_narcotic_register_sod_witness.
-- quantity_before is auto-set by fn_narcotic_register_validate()
-- BEFORE INSERT from the previous row for the same drug.
-- fn_narcotic_register_validate() also verifies that the drug
-- is flagged is_narcotic = true in drug_catalogue.
-- wastage and adjustment entries require L2 approval:
-- approved_by must be set (chk_narcotic_register_wastage_approval).
-- dispense_out entries require prescriber and recipient fields
-- (chk_narcotic_register_dispense_fields).
-- Forward FK pharmacy_sale_id deferred to Module 15 migration.
-- Append-only audit (no updated_by/at, no deleted_at/by).
-- ============================================================

-- ── Validation trigger function (BEFORE INSERT) ───────────────
-- 1. Rejects inserts when the drug is not flagged as narcotic.
-- 2. Auto-sets quantity_before from the previous row for this drug
--    so the application layer does not need to manage running balances.

CREATE OR REPLACE FUNCTION fn_narcotic_register_validate() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_is_narcotic boolean;
    v_prev_qty    int;
BEGIN
    -- Validate the drug is marked as narcotic in the catalogue
    SELECT is_narcotic INTO v_is_narcotic
    FROM   drug_catalogue
    WHERE  id = NEW.drug_id;

    IF NOT COALESCE(v_is_narcotic, false) THEN
        RAISE EXCEPTION 'narcotic_register: drug % is not a narcotic — only narcotic drugs may be entered', NEW.drug_id
            USING ERRCODE = '23514';
    END IF;

    -- Auto-set quantity_before from the last row for this drug
    SELECT quantity_after INTO v_prev_qty
    FROM   narcotic_register
    WHERE  drug_id = NEW.drug_id
    ORDER  BY created_at DESC
    LIMIT  1;

    NEW.quantity_before := COALESCE(v_prev_qty, 0);
    RETURN NEW;
END;
$$;

-- ── Custom append-only guard ──────────────────────────────────

CREATE OR REPLACE FUNCTION fn_narcotic_register_append_only_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'narcotic_register is append-only — correct by inserting an adjustment row'
        USING ERRCODE = '42501';
END;
$$;

-- ── Table ─────────────────────────────────────────────────────

CREATE TABLE narcotic_register (

    id                  uuid        NOT NULL DEFAULT uuidv7(),

    -- Narcotic drug from the master catalogue
    drug_id             uuid        NOT NULL,

    -- Specific batch involved; NULL for opening-balance entries
    drug_stock_id       uuid,

    -- Nature of the NDPS movement
    transaction_type    text        NOT NULL,

    -- Running balance before this entry — auto-set by BEFORE INSERT trigger
    quantity_before     int         NOT NULL DEFAULT 0,

    -- Running balance after this entry
    quantity_after      int         NOT NULL,

    -- FK → pharmacy_sales(id) added in Module 15 migration
    pharmacy_sale_id    uuid,

    -- Required prescription for dispense_out movements
    prescription_id     uuid,

    -- Prescribing doctor's name (free text for non-system prescribers)
    prescriber_name     text,

    -- Prescribing doctor's registration number
    prescriber_reg_no   text,

    -- Patient or authorised recipient's name
    recipient_name      text,

    -- Relationship of the recipient to the patient
    recipient_relation  text,

    -- Government-issued ID proof presented by the recipient
    recipient_id_proof  text,

    -- Staff member who dispensed or handled the narcotic
    performed_by        uuid        NOT NULL,

    -- Second staff member who witnessed the transaction (must differ from performed_by)
    witnessed_by        uuid        NOT NULL,

    notes               text,

    -- ── L2 approval columns (wastage / adjustment only) ───────
    -- Default 'approved' for non-wastage/adjustment transaction types;
    -- wastage and adjustment must have explicit approved_by set

    approval_status     text        NOT NULL DEFAULT 'approved',

    approved_by         uuid,

    approved_at         timestamptz,

    rejection_reason    text,

    -- ── Append-only audit block ───────────────────────────────
    created_by          uuid        NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    version             int         NOT NULL DEFAULT 0,

    -- ── Constraints ──────────────────────────────────────────
    CONSTRAINT pk_narcotic_register
        PRIMARY KEY (id),

    CONSTRAINT fk_narcotic_register_drug
        FOREIGN KEY (drug_id) REFERENCES drug_catalogue(id) ON DELETE RESTRICT,

    CONSTRAINT fk_narcotic_register_stock
        FOREIGN KEY (drug_stock_id) REFERENCES drug_stock(id) ON DELETE RESTRICT,

    CONSTRAINT fk_narcotic_register_prescription
        FOREIGN KEY (prescription_id) REFERENCES prescriptions(id) ON DELETE RESTRICT,

    CONSTRAINT fk_narcotic_register_performed
        FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE RESTRICT,

    CONSTRAINT fk_narcotic_register_witnessed
        FOREIGN KEY (witnessed_by) REFERENCES users(id) ON DELETE RESTRICT,

    CONSTRAINT fk_narcotic_register_approved
        FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE RESTRICT,

    CONSTRAINT chk_narcotic_register_type
        CHECK (transaction_type IN (
            'opening_balance','purchase_in','dispense_out','wastage',
            'transfer_in','transfer_out','return','expired_writeoff','adjustment'
        )),

    CONSTRAINT chk_narcotic_register_qty
        CHECK (quantity_before >= 0 AND quantity_after >= 0),

    -- Every register entry must represent a real quantity change
    CONSTRAINT chk_narcotic_register_nonzero
        CHECK (quantity_before <> quantity_after),

    -- Two-person rule: performer and witness must be different staff members
    CONSTRAINT chk_narcotic_register_sod_witness
        CHECK (performed_by <> witnessed_by),

    -- dispense_out requires prescriber and recipient identification
    CONSTRAINT chk_narcotic_register_dispense_fields
        CHECK (
            (transaction_type <> 'dispense_out')
            OR (
                prescriber_name IS NOT NULL
                AND recipient_name IS NOT NULL
                AND recipient_id_proof IS NOT NULL
            )
        ),

    -- wastage and adjustment must have been explicitly approved
    CONSTRAINT chk_narcotic_register_wastage_approval
        CHECK (
            (transaction_type NOT IN ('wastage','adjustment'))
            OR (approval_status = 'approved' AND approved_by IS NOT NULL)
        ),

    CONSTRAINT chk_narcotic_register_recipient_relation
        CHECK (
            recipient_relation IS NULL
            OR recipient_relation IN ('self','mother','father','spouse','sibling','child','attender','other')
        ),

    CONSTRAINT chk_narcotic_register_approval_status
        CHECK (approval_status IN ('pending_approval','approved','rejected'))
);

-- ── Indexes ───────────────────────────────────────────────────

-- Per-drug chronological register view (primary NDPS audit query)
CREATE INDEX ix_narcotic_register_drug
    ON narcotic_register (drug_id, created_at DESC);

-- Dispense log for regulatory reporting
CREATE INDEX ix_narcotic_register_dispense
    ON narcotic_register (created_at DESC)
    WHERE transaction_type = 'dispense_out';

-- Prescription-based narcotic lookup
CREATE INDEX ix_narcotic_register_prescription
    ON narcotic_register (prescription_id)
    WHERE prescription_id IS NOT NULL;

-- ── Triggers ──────────────────────────────────────────────────

-- BEFORE INSERT: validate drug is narcotic + auto-set quantity_before
CREATE TRIGGER tr_narcotic_register_bi_validate
    BEFORE INSERT ON narcotic_register
    FOR EACH ROW EXECUTE FUNCTION fn_narcotic_register_validate();

-- Append-only guard: block UPDATE and DELETE on this table
CREATE TRIGGER tr_narcotic_register_bud_guard
    BEFORE UPDATE OR DELETE ON narcotic_register
    FOR EACH ROW EXECUTE FUNCTION fn_narcotic_register_append_only_guard();

-- Layer 3: full-row audit trail (INSERT only — UPDATE/DELETE are blocked above)
CREATE TRIGGER tr_narcotic_register_au_audit
    AFTER INSERT ON narcotic_register
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  narcotic_register IS 'NDPS-mandated narcotic movement register. Append-only with 7-year legal retention. Two-person rule: performed_by ≠ witnessed_by. quantity_before auto-set by BEFORE INSERT trigger from previous row.';
COMMENT ON COLUMN narcotic_register.drug_id            IS 'Narcotic drug from the master catalogue. Must have is_narcotic = true — validated by fn_narcotic_register_validate().';
COMMENT ON COLUMN narcotic_register.drug_stock_id      IS 'Specific batch involved in the movement. NULL for opening-balance entries.';
COMMENT ON COLUMN narcotic_register.transaction_type   IS 'NDPS movement type: opening_balance | purchase_in | dispense_out | wastage | transfer_in | transfer_out | return | expired_writeoff | adjustment.';
COMMENT ON COLUMN narcotic_register.quantity_before    IS 'Auto-set by fn_narcotic_register_validate() BEFORE INSERT trigger from the previous row for this drug. App should not set this column.';
COMMENT ON COLUMN narcotic_register.quantity_after     IS 'Running balance after this entry. The difference (quantity_after − quantity_before) reflects the signed movement quantity.';
COMMENT ON COLUMN narcotic_register.pharmacy_sale_id   IS 'FK → pharmacy_sales(id) RESTRICT — constraint added in pharmacy module migration (Module 15).';
COMMENT ON COLUMN narcotic_register.prescription_id    IS 'Linked prescription for dispense_out movements. FK → prescriptions(id) RESTRICT.';
COMMENT ON COLUMN narcotic_register.prescriber_name    IS 'Name of the prescribing doctor. Free text to accommodate non-system prescribers. Mandatory for dispense_out.';
COMMENT ON COLUMN narcotic_register.prescriber_reg_no  IS 'Medical Council registration number of the prescriber.';
COMMENT ON COLUMN narcotic_register.recipient_name     IS 'Full name of the person receiving the narcotic. Mandatory for dispense_out.';
COMMENT ON COLUMN narcotic_register.recipient_relation IS 'Relationship to the patient: self | mother | father | spouse | sibling | child | attender | other. NULL for non-dispense movements.';
COMMENT ON COLUMN narcotic_register.recipient_id_proof IS 'Government-issued ID reference (type + number) presented by the recipient. Mandatory for dispense_out.';
COMMENT ON COLUMN narcotic_register.performed_by       IS 'Staff member who dispensed or handled the narcotic. Must differ from witnessed_by (chk_narcotic_register_sod_witness).';
COMMENT ON COLUMN narcotic_register.witnessed_by       IS 'Second staff member who physically witnessed the transaction. Must differ from performed_by.';
COMMENT ON COLUMN narcotic_register.approval_status    IS 'L2 approval for wastage/adjustment entries: pending_approval | approved | rejected. Defaults to approved for all other transaction types.';
COMMENT ON COLUMN narcotic_register.approved_by        IS 'Senior staff member who approved the wastage or adjustment entry. Mandatory for wastage/adjustment (chk_narcotic_register_wastage_approval).';
COMMENT ON COLUMN narcotic_register.approved_at        IS 'Timestamp of the approval or rejection decision.';
COMMENT ON COLUMN narcotic_register.rejection_reason   IS 'Reason the approver rejected a wastage/adjustment entry.';
COMMENT ON COLUMN narcotic_register.version            IS 'Append-only version counter — starts at 0 and never incremented (no updates allowed).';
