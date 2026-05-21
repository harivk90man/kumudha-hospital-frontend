-- ============================================================
-- V55__create_drug_stock_ledger.sql
-- Append-only stock movement ledger. Every quantity change on
-- any drug_stock batch writes one row here.
-- UPDATE and DELETE are blocked by fn_drug_stock_ledger_append_only_guard();
-- corrections must be entered as new 'adjustment' rows.
-- Forward FKs pharmacy_sale_item_id and pharmacy_return_item_id
-- are left as plain uuid columns here; the FK constraints are
-- added in the pharmacy module migration (Module 15).
-- 7-year retention mandated by CDSCO.
-- Append-only audit (no updated_by/at, no deleted_at/by).
-- ============================================================

-- ── Custom append-only guard ──────────────────────────────────
-- A domain-specific error message is preferable to the generic
-- fn_append_only_guard() message so operators understand they
-- must insert an adjustment row rather than correcting in-place.

CREATE OR REPLACE FUNCTION fn_drug_stock_ledger_append_only_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'drug_stock_ledger is append-only — correct stock by inserting an adjustment row'
        USING ERRCODE = '42501';
END;
$$;

-- ── Table ─────────────────────────────────────────────────────

CREATE TABLE drug_stock_ledger (

    id                          uuid        NOT NULL DEFAULT uuidv7(),

    -- The specific batch whose quantity changed
    drug_stock_id               uuid        NOT NULL,

    -- Nature of the stock movement
    movement_type               text        NOT NULL,

    -- Batch quantity immediately before this movement
    quantity_before             int         NOT NULL,

    -- Batch quantity immediately after this movement
    quantity_after              int         NOT NULL,

    -- Set for purchase_in movements; links to the GRN line item
    purchase_order_item_id      uuid,

    -- Set for sale_out movements; FK constraint added in Module 15
    pharmacy_sale_item_id       uuid,

    -- Set for return_in / return_writeoff movements; FK added in Module 15
    pharmacy_return_item_id     uuid,

    -- Free-text reason — mandatory for adjustment movements (>= 10 chars)
    adjustment_reason           text,

    -- Links the two legs of a transfer (transfer_in ↔ transfer_out)
    transfer_counterpart_id     uuid,

    -- Staff member who performed or authorised this movement
    performed_by                uuid        NOT NULL,

    notes                       text,

    -- ── Append-only audit block ───────────────────────────────
    created_by                  uuid        NOT NULL,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    version                     int         NOT NULL DEFAULT 0,

    -- ── Constraints ──────────────────────────────────────────
    CONSTRAINT pk_drug_stock_ledger
        PRIMARY KEY (id),

    CONSTRAINT fk_drug_stock_ledger_stock
        FOREIGN KEY (drug_stock_id) REFERENCES drug_stock(id) ON DELETE RESTRICT,

    CONSTRAINT fk_drug_stock_ledger_po_item
        FOREIGN KEY (purchase_order_item_id) REFERENCES purchase_order_items(id) ON DELETE RESTRICT,

    -- Self-FK: links both legs of a transfer movement
    CONSTRAINT fk_drug_stock_ledger_transfer
        FOREIGN KEY (transfer_counterpart_id) REFERENCES drug_stock_ledger(id) ON DELETE RESTRICT,

    CONSTRAINT fk_drug_stock_ledger_performed_by
        FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE RESTRICT,

    CONSTRAINT chk_drug_stock_ledger_type
        CHECK (movement_type IN (
            'purchase_in','sale_out','return_in','return_writeoff',
            'adjustment','expiry_writeoff','ward_use','transfer_in','transfer_out'
        )),

    CONSTRAINT chk_drug_stock_ledger_qty
        CHECK (quantity_before >= 0 AND quantity_after >= 0),

    -- Every ledger row must represent a real quantity change
    CONSTRAINT chk_drug_stock_ledger_nonzero
        CHECK (quantity_before <> quantity_after),

    -- At most one source reference per movement
    CONSTRAINT chk_drug_stock_ledger_one_source
        CHECK (
            num_nonnulls(
                purchase_order_item_id,
                pharmacy_sale_item_id,
                pharmacy_return_item_id,
                transfer_counterpart_id
            ) <= 1
        ),

    -- purchase_in movements must have a PO item reference and vice versa
    CONSTRAINT chk_drug_stock_ledger_purchase_in
        CHECK ((movement_type = 'purchase_in') = (purchase_order_item_id IS NOT NULL)),

    -- sale_out movements must have a pharmacy sale item reference and vice versa
    CONSTRAINT chk_drug_stock_ledger_sale_out
        CHECK ((movement_type = 'sale_out') = (pharmacy_sale_item_id IS NOT NULL)),

    -- return movements must have a pharmacy return item reference and vice versa
    CONSTRAINT chk_drug_stock_ledger_return
        CHECK (
            (movement_type IN ('return_in','return_writeoff')) = (pharmacy_return_item_id IS NOT NULL)
        ),

    -- adjustment movements require a substantive reason (>= 10 chars)
    CONSTRAINT chk_drug_stock_ledger_adjustment_reason
        CHECK (
            (movement_type = 'adjustment') = (
                adjustment_reason IS NOT NULL AND char_length(adjustment_reason) >= 10
            )
        )
);

-- ── Indexes ───────────────────────────────────────────────────

-- Batch movement history, newest first (stock ledger drill-down)
CREATE INDEX ix_drug_stock_ledger_batch
    ON drug_stock_ledger (drug_stock_id, created_at DESC);

-- Movement type reporting and reconciliation
CREATE INDEX ix_drug_stock_ledger_type
    ON drug_stock_ledger (movement_type, created_at DESC);

-- Pharmacy sale item reverse-lookup (partial — only populated rows)
CREATE INDEX ix_drug_stock_ledger_sale_item
    ON drug_stock_ledger (pharmacy_sale_item_id)
    WHERE pharmacy_sale_item_id IS NOT NULL;

-- PO item reverse-lookup (partial — only populated rows)
CREATE INDEX ix_drug_stock_ledger_po_item
    ON drug_stock_ledger (purchase_order_item_id)
    WHERE purchase_order_item_id IS NOT NULL;

-- ── Triggers ──────────────────────────────────────────────────

-- Append-only guard: block UPDATE and DELETE on this table
CREATE TRIGGER tr_drug_stock_ledger_bud_guard
    BEFORE UPDATE OR DELETE ON drug_stock_ledger
    FOR EACH ROW EXECUTE FUNCTION fn_drug_stock_ledger_append_only_guard();

-- Layer 3: full-row audit trail (INSERT only — UPDATE/DELETE are blocked above)
CREATE TRIGGER tr_drug_stock_ledger_au_audit
    AFTER INSERT ON drug_stock_ledger
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  drug_stock_ledger IS 'Append-only stock movement ledger. Every quantity change writes one row. UPDATE/DELETE are blocked — corrections are new adjustment rows. 7-year retention (CDSCO compliance).';
COMMENT ON COLUMN drug_stock_ledger.drug_stock_id           IS 'The specific batch whose quantity changed. FK → drug_stock(id) RESTRICT.';
COMMENT ON COLUMN drug_stock_ledger.movement_type           IS 'Nature of the movement: purchase_in | sale_out | return_in | return_writeoff | adjustment | expiry_writeoff | ward_use | transfer_in | transfer_out.';
COMMENT ON COLUMN drug_stock_ledger.quantity_before         IS 'Batch quantity_available immediately before this movement. Must be >= 0.';
COMMENT ON COLUMN drug_stock_ledger.quantity_after          IS 'Batch quantity_available immediately after this movement. Must differ from quantity_before.';
COMMENT ON COLUMN drug_stock_ledger.purchase_order_item_id  IS 'Set for purchase_in movements. Mutual with movement_type = purchase_in (chk_drug_stock_ledger_purchase_in).';
COMMENT ON COLUMN drug_stock_ledger.pharmacy_sale_item_id   IS 'FK → pharmacy_sale_items(id) RESTRICT — constraint added in pharmacy module migration (Module 15).';
COMMENT ON COLUMN drug_stock_ledger.pharmacy_return_item_id IS 'FK → pharmacy_return_items(id) RESTRICT — constraint added in pharmacy module migration (Module 15).';
COMMENT ON COLUMN drug_stock_ledger.adjustment_reason       IS 'Mandatory for adjustment movements; must be >= 10 characters. NULL for all other movement types.';
COMMENT ON COLUMN drug_stock_ledger.transfer_counterpart_id IS 'Self-FK that links the two legs of a transfer (transfer_in row ↔ transfer_out row).';
COMMENT ON COLUMN drug_stock_ledger.performed_by            IS 'Staff member who performed or authorised this stock movement.';
COMMENT ON COLUMN drug_stock_ledger.version                 IS 'Append-only version counter — starts at 0 and never incremented (no updates allowed).';
