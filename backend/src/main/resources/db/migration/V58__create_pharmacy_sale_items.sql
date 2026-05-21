-- ============================================================
-- V58__create_pharmacy_sale_items.sql
-- Pharmacy sale line items. CASCADE child of pharmacy_sales.
-- No soft-delete — rows are immutable once the parent sale is dispensed.
-- Four triggers fire on INSERT:
--   BEFORE INSERT fn_check_sale_batch_availability() — rejects blocked
--     or expired batches before the row lands.
--   AFTER INSERT  fn_decrement_stock()               — atomically
--     decrements drug_stock.quantity_available; raises if insufficient.
--   AFTER INSERT  fn_log_sale_movement()             — writes a
--     sale_out row to drug_stock_ledger.
--   AFTER INSERT  fn_check_narcotic_register_pair()  — stub; service
--     layer inserts the narcotic_register row in the same transaction.
-- Also wires deferred FK from drug_stock_ledger.pharmacy_sale_item_id.
-- No deleted_at/deleted_by (no-soft-delete audit).
-- ============================================================

-- ── Trigger functions ─────────────────────────────────────────

-- Validate the batch is not blocked and has not expired (BEFORE INSERT)
CREATE OR REPLACE FUNCTION fn_check_sale_batch_availability() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_is_blocked  boolean;
    v_expiry_date date;
BEGIN
    SELECT is_blocked, expiry_date
    INTO   v_is_blocked, v_expiry_date
    FROM   drug_stock
    WHERE  id = NEW.drug_stock_id;

    IF v_is_blocked THEN
        RAISE EXCEPTION 'drug_stock batch % is blocked and cannot be dispensed', NEW.drug_stock_id
            USING ERRCODE = '23514';
    END IF;

    IF v_expiry_date < current_date THEN
        RAISE EXCEPTION 'drug_stock batch % expired on % — cannot be dispensed', NEW.drug_stock_id, v_expiry_date
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

-- Atomically decrement quantity_available; raise if stock insufficient (AFTER INSERT)
CREATE OR REPLACE FUNCTION fn_decrement_stock() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_available int;
BEGIN
    SELECT quantity_available INTO v_available
    FROM   drug_stock
    WHERE  id = NEW.drug_stock_id
    FOR UPDATE;

    IF v_available < NEW.quantity THEN
        RAISE EXCEPTION 'Insufficient stock: drug_stock % has % units available, requested %',
            NEW.drug_stock_id, v_available, NEW.quantity
            USING ERRCODE = '23514';
    END IF;

    UPDATE drug_stock
       SET quantity_available = quantity_available - NEW.quantity
     WHERE id = NEW.drug_stock_id;

    RETURN NEW;
END;
$$;

-- Write a sale_out row to drug_stock_ledger (AFTER INSERT)
-- quantity_available has already been decremented by fn_decrement_stock()
CREATE OR REPLACE FUNCTION fn_log_sale_movement() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_qty_after int;
BEGIN
    -- quantity_available already decremented by fn_decrement_stock()
    SELECT quantity_available INTO v_qty_after
    FROM   drug_stock
    WHERE  id = NEW.drug_stock_id;

    INSERT INTO drug_stock_ledger (
        id, drug_stock_id, movement_type,
        quantity_before, quantity_after,
        pharmacy_sale_item_id, performed_by,
        created_by, created_at, version
    ) VALUES (
        uuidv7(), NEW.drug_stock_id, 'sale_out',
        v_qty_after + NEW.quantity, v_qty_after,
        NEW.id, NEW.created_by,
        NEW.created_by, now(), 0
    );

    RETURN NEW;
END;
$$;

-- Stub: service layer inserts narcotic_register row in the same transaction (AFTER INSERT)
CREATE OR REPLACE FUNCTION fn_check_narcotic_register_pair() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_is_narcotic boolean;
BEGIN
    SELECT is_narcotic INTO v_is_narcotic
    FROM   drug_catalogue
    WHERE  id = NEW.drug_id;

    -- Service layer is responsible for inserting narcotic_register row in the same transaction.
    -- Stub: future enhancement can validate with advisory lock or deferred constraint.
    RETURN NEW;
END;
$$;

-- ── Table ─────────────────────────────────────────────────────

CREATE TABLE pharmacy_sale_items (

    id                      uuid            NOT NULL DEFAULT uuidv7(),

    pharmacy_sale_id        uuid            NOT NULL,

    -- Drug from the master catalogue
    drug_id                 uuid            NOT NULL,

    -- Specific batch dispensed — drives FEFO accounting and stock ledger entry
    drug_stock_id           uuid            NOT NULL,

    -- Links to the prescription line this dispense fulfils; NULL for OTC / walk-in
    prescription_item_id    uuid,

    -- Quantity dispensed in dispensing units
    quantity                int             NOT NULL,

    -- Price per dispensing unit at time of sale (excluding discount and tax)
    unit_price              numeric(14,2)   NOT NULL,

    -- Line-level discount
    line_discount_pct       numeric(4,2)    NOT NULL DEFAULT 0,
    line_discount_amount    numeric(14,2)   NOT NULL DEFAULT 0,

    -- CGST and SGST apply for intra-state sales
    cgst_pct                numeric(4,2)    NOT NULL DEFAULT 0,
    cgst_amount             numeric(14,2)   NOT NULL DEFAULT 0,
    sgst_pct                numeric(4,2)    NOT NULL DEFAULT 0,
    sgst_amount             numeric(14,2)   NOT NULL DEFAULT 0,

    -- IGST applies for inter-state sales (mutually exclusive with CGST+SGST)
    igst_pct                numeric(4,2)    NOT NULL DEFAULT 0,
    igst_amount             numeric(14,2)   NOT NULL DEFAULT 0,

    -- Total line value including applicable GST and after discount
    total_price             numeric(14,2)   NOT NULL,

    -- ── No-soft-delete audit block ────────────────────────────
    created_by      uuid        NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_by      uuid,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    version         int         NOT NULL DEFAULT 0,

    -- ── Constraints ──────────────────────────────────────────
    CONSTRAINT pk_pharmacy_sale_items
        PRIMARY KEY (id),

    CONSTRAINT fk_pharmacy_sale_items_sale
        FOREIGN KEY (pharmacy_sale_id) REFERENCES pharmacy_sales(id) ON DELETE CASCADE,

    CONSTRAINT fk_pharmacy_sale_items_drug
        FOREIGN KEY (drug_id) REFERENCES drug_catalogue(id) ON DELETE RESTRICT,

    CONSTRAINT fk_pharmacy_sale_items_stock
        FOREIGN KEY (drug_stock_id) REFERENCES drug_stock(id) ON DELETE RESTRICT,

    CONSTRAINT fk_pharmacy_sale_items_rx_item
        FOREIGN KEY (prescription_item_id) REFERENCES prescription_items(id) ON DELETE RESTRICT,

    -- One row per (sale, drug, batch) — service layer must merge duplicate batches
    CONSTRAINT uq_pharmacy_sale_items_batch
        UNIQUE (pharmacy_sale_id, drug_id, drug_stock_id),

    CONSTRAINT chk_pharmacy_sale_items_qty
        CHECK (quantity > 0),

    CONSTRAINT chk_pharmacy_sale_items_price
        CHECK (unit_price > 0 AND total_price >= 0),

    CONSTRAINT chk_pharmacy_sale_items_discount
        CHECK (line_discount_pct >= 0 AND line_discount_amount >= 0),

    CONSTRAINT chk_pharmacy_sale_items_gst
        CHECK (cgst_pct >= 0 AND sgst_pct >= 0 AND igst_pct >= 0),

    -- IGST and CGST+SGST are mutually exclusive GST regimes
    CONSTRAINT chk_pharmacy_sale_items_gst_exclusive
        CHECK ((igst_pct = 0) OR (cgst_pct = 0 AND sgst_pct = 0))
);

-- ── Indexes ───────────────────────────────────────────────────

-- Fetch all line items for a sale (primary access pattern)
CREATE INDEX ix_pharmacy_sale_items_sale
    ON pharmacy_sale_items (pharmacy_sale_id);

-- Prescription fulfilment verification — partial; only populated rows
CREATE INDEX ix_pharmacy_sale_items_rx_item
    ON pharmacy_sale_items (prescription_item_id)
    WHERE prescription_item_id IS NOT NULL;

-- Batch-level dispense history (stock ledger linkage + FEFO audit)
CREATE INDEX ix_pharmacy_sale_items_stock
    ON pharmacy_sale_items (drug_stock_id);

-- ── Triggers ──────────────────────────────────────────────────

-- Layer 1: bump updated_at on every UPDATE
CREATE TRIGGER tr_pharmacy_sale_items_bu_touch
    BEFORE UPDATE ON pharmacy_sale_items
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

-- BEFORE INSERT: reject blocked or expired batches before the row lands
CREATE TRIGGER tr_pharmacy_sale_items_bi_check_batch
    BEFORE INSERT ON pharmacy_sale_items
    FOR EACH ROW EXECUTE FUNCTION fn_check_sale_batch_availability();

-- AFTER INSERT: atomically decrement quantity_available; raise if insufficient
CREATE TRIGGER tr_pharmacy_sale_items_ai_decrement_stock
    AFTER INSERT ON pharmacy_sale_items
    FOR EACH ROW EXECUTE FUNCTION fn_decrement_stock();

-- AFTER INSERT: write sale_out row to drug_stock_ledger
CREATE TRIGGER tr_pharmacy_sale_items_ai_log_movement
    AFTER INSERT ON pharmacy_sale_items
    FOR EACH ROW EXECUTE FUNCTION fn_log_sale_movement();

-- AFTER INSERT: stub — service layer inserts narcotic_register row in same transaction
CREATE TRIGGER tr_pharmacy_sale_items_ai_narcotic_check
    AFTER INSERT ON pharmacy_sale_items
    FOR EACH ROW EXECUTE FUNCTION fn_check_narcotic_register_pair();

-- Layer 3: full-row audit trail
CREATE TRIGGER tr_pharmacy_sale_items_au_audit
    AFTER INSERT OR UPDATE OR DELETE ON pharmacy_sale_items
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  pharmacy_sale_items IS 'Pharmacy sale line items. CASCADE child of pharmacy_sales. No soft-delete — immutable once dispensed. BEFORE INSERT validates batch availability; AFTER INSERT decrements stock and logs movement.';
COMMENT ON COLUMN pharmacy_sale_items.pharmacy_sale_id     IS 'Parent sale. ON DELETE CASCADE — items are removed when the sale is deleted.';
COMMENT ON COLUMN pharmacy_sale_items.drug_id              IS 'Drug from the master catalogue. One row per (sale, drug, batch) — enforced by uq_pharmacy_sale_items_batch.';
COMMENT ON COLUMN pharmacy_sale_items.drug_stock_id        IS 'Specific batch dispensed. Drives FEFO accounting and stock ledger entry.';
COMMENT ON COLUMN pharmacy_sale_items.prescription_item_id IS 'Links to the prescription line this dispense fulfils. NULL for OTC or walk-in sales.';
COMMENT ON COLUMN pharmacy_sale_items.quantity             IS 'Number of dispensing units dispensed. Must be > 0.';
COMMENT ON COLUMN pharmacy_sale_items.unit_price           IS 'Price per dispensing unit at time of sale, excluding discount and tax. Must be > 0.';
COMMENT ON COLUMN pharmacy_sale_items.line_discount_pct    IS 'Line-level discount percentage. 0 means no discount applied.';
COMMENT ON COLUMN pharmacy_sale_items.line_discount_amount IS 'Flat line-level discount amount derived from line_discount_pct.';
COMMENT ON COLUMN pharmacy_sale_items.cgst_pct             IS 'Central GST rate applied for intra-state sales. 0 when IGST is used instead.';
COMMENT ON COLUMN pharmacy_sale_items.cgst_amount          IS 'Central GST amount (quantity × unit_price × cgst_pct / 100).';
COMMENT ON COLUMN pharmacy_sale_items.sgst_pct             IS 'State GST rate applied for intra-state sales. 0 when IGST is used instead.';
COMMENT ON COLUMN pharmacy_sale_items.sgst_amount          IS 'State GST amount (quantity × unit_price × sgst_pct / 100).';
COMMENT ON COLUMN pharmacy_sale_items.igst_pct             IS 'Integrated GST rate applied for inter-state sales. 0 when CGST+SGST are used instead.';
COMMENT ON COLUMN pharmacy_sale_items.igst_amount          IS 'Integrated GST amount (quantity × unit_price × igst_pct / 100).';
COMMENT ON COLUMN pharmacy_sale_items.total_price          IS 'Total line value including applicable GST and after discount. Must be >= 0.';
COMMENT ON COLUMN pharmacy_sale_items.version              IS 'Optimistic-lock counter — owned by Hibernate @Version. Trigger does NOT touch this column.';

-- ── Deferred FK from drug_stock_ledger ────────────────────────
-- drug_stock_ledger.pharmacy_sale_item_id was left as a plain uuid column in V55
-- (pharmacy_sale_items did not exist at that point). Wire it now.

ALTER TABLE drug_stock_ledger
    ADD CONSTRAINT fk_drug_stock_ledger_sale_item
    FOREIGN KEY (pharmacy_sale_item_id) REFERENCES pharmacy_sale_items(id) ON DELETE RESTRICT;
