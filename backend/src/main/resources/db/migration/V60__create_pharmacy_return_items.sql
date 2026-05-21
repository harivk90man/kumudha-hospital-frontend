-- ============================================================
-- V60__create_pharmacy_return_items.sql
-- Pharmacy return line items. CASCADE child of pharmacy_returns.
-- No soft-delete — rows are immutable once the return is processed.
-- fn_log_return_movement() AFTER INSERT reinstates stock on the
-- returned batch and writes a return_in row to drug_stock_ledger.
-- Also wires deferred FK from drug_stock_ledger.pharmacy_return_item_id.
-- No deleted_at/deleted_by (no-soft-delete audit).
-- ============================================================

-- ── Trigger function ──────────────────────────────────────────

-- Reinstate quantity_available on the returned batch and write a
-- return_in row to drug_stock_ledger (AFTER INSERT)
CREATE OR REPLACE FUNCTION fn_log_return_movement() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_qty_before int;
BEGIN
    SELECT quantity_available INTO v_qty_before
    FROM   drug_stock
    WHERE  id = NEW.drug_stock_id;

    -- Reinstate stock
    UPDATE drug_stock
       SET quantity_available = quantity_available + NEW.quantity_returned
     WHERE id = NEW.drug_stock_id;

    -- Log movement
    INSERT INTO drug_stock_ledger (
        id, drug_stock_id, movement_type,
        quantity_before, quantity_after,
        pharmacy_return_item_id, performed_by,
        created_by, created_at, version
    ) VALUES (
        uuidv7(), NEW.drug_stock_id, 'return_in',
        v_qty_before, v_qty_before + NEW.quantity_returned,
        NEW.id, NEW.created_by,
        NEW.created_by, now(), 0
    );

    RETURN NEW;
END;
$$;

-- ── Table ─────────────────────────────────────────────────────

CREATE TABLE pharmacy_return_items (

    id                      uuid            NOT NULL DEFAULT uuidv7(),

    pharmacy_return_id      uuid            NOT NULL,

    -- The original sale line item being reversed
    pharmacy_sale_item_id   uuid            NOT NULL,

    -- Drug from the master catalogue (denormalised from the sale item for reporting)
    drug_id                 uuid            NOT NULL,

    -- The specific batch being returned — stock quantity reinstated by trigger
    drug_stock_id           uuid            NOT NULL,

    -- Number of dispensing units being returned
    quantity_returned       int             NOT NULL,

    -- Unit price at time of original sale (used to compute refund amount)
    unit_price              numeric(14,2)   NOT NULL,

    -- Refund amount for this line (may include partial discount reversal)
    return_amount           numeric(14,2)   NOT NULL DEFAULT 0,

    -- Optional notes about the condition of returned goods
    notes                   text,

    -- ── No-soft-delete audit block ────────────────────────────
    created_by      uuid        NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_by      uuid,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    version         int         NOT NULL DEFAULT 0,

    -- ── Constraints ──────────────────────────────────────────
    CONSTRAINT pk_pharmacy_return_items
        PRIMARY KEY (id),

    CONSTRAINT fk_pharmacy_return_items_return
        FOREIGN KEY (pharmacy_return_id) REFERENCES pharmacy_returns(id) ON DELETE CASCADE,

    CONSTRAINT fk_pharmacy_return_items_sale_item
        FOREIGN KEY (pharmacy_sale_item_id) REFERENCES pharmacy_sale_items(id) ON DELETE RESTRICT,

    CONSTRAINT fk_pharmacy_return_items_drug
        FOREIGN KEY (drug_id) REFERENCES drug_catalogue(id) ON DELETE RESTRICT,

    CONSTRAINT fk_pharmacy_return_items_stock
        FOREIGN KEY (drug_stock_id) REFERENCES drug_stock(id) ON DELETE RESTRICT,

    -- One return-item row per (return, original sale item) — prevents duplicate reversals
    CONSTRAINT uq_pharmacy_return_items
        UNIQUE (pharmacy_return_id, pharmacy_sale_item_id),

    CONSTRAINT chk_pharmacy_return_items_qty
        CHECK (quantity_returned > 0),

    CONSTRAINT chk_pharmacy_return_items_prices
        CHECK (unit_price > 0 AND return_amount >= 0)
);

-- ── Indexes ───────────────────────────────────────────────────

-- Fetch all return lines for a return header (primary access pattern)
CREATE INDEX ix_pharmacy_return_items_return
    ON pharmacy_return_items (pharmacy_return_id);

-- Reverse-lookup from a sale item to all return lines that reference it
CREATE INDEX ix_pharmacy_return_items_sale_item
    ON pharmacy_return_items (pharmacy_sale_item_id);

-- ── Triggers ──────────────────────────────────────────────────

-- Layer 1: bump updated_at on every UPDATE
CREATE TRIGGER tr_pharmacy_return_items_bu_touch
    BEFORE UPDATE ON pharmacy_return_items
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

-- AFTER INSERT: reinstate stock on the returned batch and log movement
CREATE TRIGGER tr_pharmacy_return_items_ai_stock_movement
    AFTER INSERT ON pharmacy_return_items
    FOR EACH ROW EXECUTE FUNCTION fn_log_return_movement();

-- Layer 3: full-row audit trail
CREATE TRIGGER tr_pharmacy_return_items_au_audit
    AFTER INSERT OR UPDATE OR DELETE ON pharmacy_return_items
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  pharmacy_return_items IS 'Pharmacy return line items. CASCADE child of pharmacy_returns. No soft-delete — immutable once processed. AFTER INSERT trigger reinstates stock and writes drug_stock_ledger row.';
COMMENT ON COLUMN pharmacy_return_items.pharmacy_return_id    IS 'Parent return header. ON DELETE CASCADE — items are removed when the return is deleted.';
COMMENT ON COLUMN pharmacy_return_items.pharmacy_sale_item_id IS 'The original sale line item being reversed. Uniqueness per (return, sale item) prevents duplicate reversal.';
COMMENT ON COLUMN pharmacy_return_items.drug_id               IS 'Denormalised from the original sale item. Enables direct drug-level return reporting without joining through sale items.';
COMMENT ON COLUMN pharmacy_return_items.drug_stock_id         IS 'The specific batch being returned. Stock quantity reinstated by fn_log_return_movement() AFTER INSERT trigger.';
COMMENT ON COLUMN pharmacy_return_items.quantity_returned      IS 'Number of dispensing units being returned. Must be > 0 and <= original quantity (validated by service layer).';
COMMENT ON COLUMN pharmacy_return_items.unit_price            IS 'Unit price at time of original sale. Used to compute return_amount. Must be > 0.';
COMMENT ON COLUMN pharmacy_return_items.return_amount         IS 'Refund amount for this line. May reflect partial discount reversal; computed by service layer.';
COMMENT ON COLUMN pharmacy_return_items.notes                 IS 'Optional notes about the condition of the returned goods (e.g. unopened, partial strip).';
COMMENT ON COLUMN pharmacy_return_items.version               IS 'Optimistic-lock counter — owned by Hibernate @Version. Trigger does NOT touch this column.';

-- ── Deferred FK from drug_stock_ledger ────────────────────────
-- drug_stock_ledger.pharmacy_return_item_id was left as a plain uuid column in V55
-- (pharmacy_return_items did not exist at that point). Wire it now.

ALTER TABLE drug_stock_ledger
    ADD CONSTRAINT fk_drug_stock_ledger_return_item
    FOREIGN KEY (pharmacy_return_item_id) REFERENCES pharmacy_return_items(id) ON DELETE RESTRICT;
