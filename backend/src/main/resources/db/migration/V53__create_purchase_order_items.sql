-- ============================================================
-- V53__create_purchase_order_items.sql
-- Line items on a purchase order. CASCADE child of purchase_orders.
-- No soft-delete — items are physically deleted with their PO.
-- GST split: CGST+SGST for intra-state, IGST for inter-state
-- (mutually exclusive, enforced by chk_purchase_order_items_gst_exclusive).
-- fn_recompute_po_totals() AFTER INSERT OR UPDATE OR DELETE
-- keeps purchase_orders.total_amount and includes_narcotics in sync.
-- No deleted_at/deleted_by (no-soft-delete audit).
-- ============================================================

-- ── Recompute trigger function ────────────────────────────────
-- Recalculates total_amount and includes_narcotics on the parent
-- purchase_orders row whenever a line item is inserted, updated,
-- or deleted.

CREATE OR REPLACE FUNCTION fn_recompute_po_totals() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_po_id        uuid;
    v_total        numeric(14,2);
    v_has_narcotic boolean;
BEGIN
    v_po_id := COALESCE(NEW.purchase_order_id, OLD.purchase_order_id);

    SELECT
        COALESCE(SUM(poi.total_price), 0),
        EXISTS (
            SELECT 1
            FROM   purchase_order_items poi2
            JOIN   drug_catalogue dc ON dc.id = poi2.drug_id
            WHERE  poi2.purchase_order_id = v_po_id
              AND  dc.is_narcotic = true
        )
    INTO v_total, v_has_narcotic
    FROM purchase_order_items poi
    WHERE poi.purchase_order_id = v_po_id;

    UPDATE purchase_orders
       SET total_amount       = v_total,
           includes_narcotics = v_has_narcotic
     WHERE id = v_po_id;

    RETURN NEW;
END;
$$;

-- ── Table ─────────────────────────────────────────────────────

CREATE TABLE purchase_order_items (

    id                  uuid            NOT NULL DEFAULT uuidv7(),

    purchase_order_id   uuid            NOT NULL,

    drug_id             uuid            NOT NULL,

    -- Quantity originally ordered (in dispensing units)
    quantity_ordered    int             NOT NULL,

    -- Quantity actually received via GRN; incremented on each receipt
    quantity_received   int             NOT NULL DEFAULT 0,

    -- Negotiated price per dispensing unit (excluding tax)
    unit_price          numeric(14,2)   NOT NULL,

    -- CGST and SGST apply for intra-state purchases
    cgst_pct            numeric(4,2)    NOT NULL DEFAULT 0,
    cgst_amount         numeric(14,2)   NOT NULL DEFAULT 0,
    sgst_pct            numeric(4,2)    NOT NULL DEFAULT 0,
    sgst_amount         numeric(14,2)   NOT NULL DEFAULT 0,

    -- IGST applies for inter-state purchases (mutually exclusive with CGST+SGST)
    igst_pct            numeric(4,2)    NOT NULL DEFAULT 0,
    igst_amount         numeric(14,2)   NOT NULL DEFAULT 0,

    -- Total line value including applicable GST
    total_price         numeric(14,2)   NOT NULL,

    -- ── No-soft-delete audit block ────────────────────────────
    created_by          uuid            NOT NULL,
    created_at          timestamptz     NOT NULL DEFAULT now(),
    updated_by          uuid,
    updated_at          timestamptz     NOT NULL DEFAULT now(),
    version             int             NOT NULL DEFAULT 0,

    -- ── Constraints ──────────────────────────────────────────
    CONSTRAINT pk_purchase_order_items
        PRIMARY KEY (id),

    CONSTRAINT fk_purchase_order_items_po
        FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,

    CONSTRAINT fk_purchase_order_items_drug
        FOREIGN KEY (drug_id) REFERENCES drug_catalogue(id) ON DELETE RESTRICT,

    -- One line per drug per PO — duplicate drugs must be merged by the service layer
    CONSTRAINT uq_purchase_order_items_drug
        UNIQUE (purchase_order_id, drug_id),

    CONSTRAINT chk_purchase_order_items_qty
        CHECK (quantity_ordered > 0 AND quantity_received >= 0),

    CONSTRAINT chk_purchase_order_items_unit_price
        CHECK (unit_price > 0),

    CONSTRAINT chk_purchase_order_items_gst
        CHECK (cgst_pct >= 0 AND sgst_pct >= 0 AND igst_pct >= 0),

    -- IGST and CGST+SGST are mutually exclusive GST regimes
    CONSTRAINT chk_purchase_order_items_gst_exclusive
        CHECK ((igst_pct = 0) OR (cgst_pct = 0 AND sgst_pct = 0)),

    CONSTRAINT chk_purchase_order_items_total
        CHECK (total_price > 0)
);

-- ── Indexes ───────────────────────────────────────────────────

-- Fetch all line items for a PO (primary access pattern)
CREATE INDEX ix_purchase_order_items_po
    ON purchase_order_items (purchase_order_id);

-- Cross-PO lookup by drug (procurement history, reorder analysis)
CREATE INDEX ix_purchase_order_items_drug
    ON purchase_order_items (drug_id);

-- ── Triggers ──────────────────────────────────────────────────

-- Layer 1: bump updated_at on every UPDATE
CREATE TRIGGER tr_purchase_order_items_bu_touch
    BEFORE UPDATE ON purchase_order_items
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

-- Recompute parent PO totals whenever a line item changes
CREATE TRIGGER tr_purchase_order_items_au_recompute
    AFTER INSERT OR UPDATE OR DELETE ON purchase_order_items
    FOR EACH ROW EXECUTE FUNCTION fn_recompute_po_totals();

-- Layer 3: full-row audit trail
CREATE TRIGGER tr_purchase_order_items_au_audit
    AFTER INSERT OR UPDATE OR DELETE ON purchase_order_items
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  purchase_order_items IS 'Line items on a purchase order. CASCADE child of purchase_orders. No soft-delete — items are deleted with their PO. GST split: CGST+SGST for intra-state, IGST for inter-state (mutually exclusive, chk_purchase_order_items_gst_exclusive).';
COMMENT ON COLUMN purchase_order_items.purchase_order_id IS 'Parent purchase order. ON DELETE CASCADE — items are removed when the PO is deleted.';
COMMENT ON COLUMN purchase_order_items.drug_id           IS 'Drug being ordered. One line per drug per PO — enforced by uq_purchase_order_items_drug.';
COMMENT ON COLUMN purchase_order_items.quantity_ordered  IS 'Number of dispensing units ordered from the vendor. Must be > 0.';
COMMENT ON COLUMN purchase_order_items.quantity_received IS 'Cumulative units received via GRN. Incremented by the receiving workflow. Starts at 0.';
COMMENT ON COLUMN purchase_order_items.unit_price        IS 'Negotiated price per dispensing unit excluding tax. Must be > 0.';
COMMENT ON COLUMN purchase_order_items.cgst_pct          IS 'Central GST rate applied for intra-state purchases. 0 when IGST is used instead.';
COMMENT ON COLUMN purchase_order_items.cgst_amount       IS 'Central GST amount (quantity_ordered × unit_price × cgst_pct / 100).';
COMMENT ON COLUMN purchase_order_items.sgst_pct          IS 'State GST rate applied for intra-state purchases. 0 when IGST is used instead.';
COMMENT ON COLUMN purchase_order_items.sgst_amount       IS 'State GST amount (quantity_ordered × unit_price × sgst_pct / 100).';
COMMENT ON COLUMN purchase_order_items.igst_pct          IS 'Integrated GST rate applied for inter-state purchases. 0 when CGST+SGST are used instead.';
COMMENT ON COLUMN purchase_order_items.igst_amount       IS 'Integrated GST amount (quantity_ordered × unit_price × igst_pct / 100).';
COMMENT ON COLUMN purchase_order_items.total_price       IS 'Total line value including applicable GST. Must be > 0. Used by fn_recompute_po_totals() to maintain purchase_orders.total_amount.';
COMMENT ON COLUMN purchase_order_items.version           IS 'Optimistic-lock counter — owned by Hibernate @Version. Trigger does NOT touch this column.';
