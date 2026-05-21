-- ============================================================
-- V54__create_drug_stock.sql
-- Per-batch physical inventory. One row per received batch.
-- No soft-delete — is_blocked = true gates dispensing instead.
-- FEFO (First Expiry First Out) ordering is guided by the
-- ix_drug_stock_fefo index used by the pharmacy dispensing query.
-- selling_price must not exceed mrp (chk_drug_stock_prices).
-- blocked_reason is mandatory when is_blocked = true
-- (chk_drug_stock_blocked).
-- No deleted_at/deleted_by (no-soft-delete audit).
-- ============================================================

CREATE TABLE drug_stock (

    id                  uuid            NOT NULL DEFAULT uuidv7(),

    drug_id             uuid            NOT NULL,

    -- Manufacturer's batch/lot number
    batch_number        text            NOT NULL,

    -- Manufacturing date; NULL when not printed on the pack
    mfg_date            date,

    -- Expiry date — must be after mfg_date when mfg_date is known
    expiry_date         date            NOT NULL,

    -- Purchase price per dispensing unit (from the GRN)
    purchase_price      numeric(14,2)   NOT NULL,

    -- Maximum Retail Price printed on the pack
    mrp                 numeric(14,2)   NOT NULL,

    -- Actual sale price — must not exceed mrp
    selling_price       numeric(14,2)   NOT NULL,

    -- Total units received in this batch
    quantity_received   int             NOT NULL,

    -- Units currently available for dispensing
    quantity_available  int             NOT NULL,

    vendor_id           uuid            NOT NULL,

    -- Purchase order that generated this stock receipt; NULL for
    -- opening-balance entries or non-PO receipts
    purchase_order_id   uuid,

    -- Date the batch was physically received into the store
    received_date       date            NOT NULL,

    -- When true this batch is quarantined and cannot be dispensed
    is_blocked          boolean         NOT NULL DEFAULT false,

    -- Mandatory when is_blocked = true; describes the block cause
    blocked_reason      text,

    -- ── No-soft-delete audit block ────────────────────────────
    created_by          uuid            NOT NULL,
    created_at          timestamptz     NOT NULL DEFAULT now(),
    updated_by          uuid,
    updated_at          timestamptz     NOT NULL DEFAULT now(),
    version             int             NOT NULL DEFAULT 0,

    -- ── Constraints ──────────────────────────────────────────
    CONSTRAINT pk_drug_stock
        PRIMARY KEY (id),

    -- A drug+batch+vendor combination is physically unique
    CONSTRAINT uq_drug_stock_batch
        UNIQUE (drug_id, batch_number, vendor_id),

    CONSTRAINT fk_drug_stock_drug
        FOREIGN KEY (drug_id) REFERENCES drug_catalogue(id) ON DELETE RESTRICT,

    CONSTRAINT fk_drug_stock_vendor
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE RESTRICT,

    CONSTRAINT fk_drug_stock_po
        FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE RESTRICT,

    -- Expiry must be after manufacture date when both are known
    CONSTRAINT chk_drug_stock_expiry
        CHECK (mfg_date IS NULL OR expiry_date > mfg_date),

    -- Price integrity: purchase_price >= 0, mrp > 0,
    -- selling_price must be positive and must not exceed mrp
    CONSTRAINT chk_drug_stock_prices
        CHECK (
            purchase_price >= 0
            AND mrp > 0
            AND selling_price > 0
            AND selling_price <= mrp
        ),

    CONSTRAINT chk_drug_stock_qty
        CHECK (quantity_received > 0 AND quantity_available >= 0),

    -- blocked_reason must be NULL when not blocked and NOT NULL when blocked
    CONSTRAINT chk_drug_stock_blocked
        CHECK (
            (is_blocked = false AND blocked_reason IS NULL)
            OR (is_blocked = true AND blocked_reason IS NOT NULL)
        ),

    CONSTRAINT chk_drug_stock_blocked_reason_val
        CHECK (blocked_reason IS NULL OR blocked_reason IN ('expired','recalled','damaged','quality_hold'))
);

-- ── Indexes ───────────────────────────────────────────────────

-- FEFO dispensing: order by expiry_date ASC to dispense soonest-expiring
-- batches first; filters out zero-stock and blocked batches
CREATE INDEX ix_drug_stock_fefo
    ON drug_stock (drug_id, expiry_date)
    WHERE quantity_available > 0 AND is_blocked = false;

-- Expiry alert dashboard: active batches ordered by expiry date.
-- The 30-day window is applied at query time (current_date is not IMMUTABLE
-- and cannot be used in an index predicate).
CREATE INDEX ix_drug_stock_expiry_alert
    ON drug_stock (expiry_date)
    WHERE is_blocked = false;

-- Stock-level view by drug for low-stock alerts
CREATE INDEX ix_drug_stock_stock
    ON drug_stock (drug_id, quantity_available)
    WHERE is_blocked = false;

-- ── Triggers ──────────────────────────────────────────────────

-- Layer 1: bump updated_at on every UPDATE
CREATE TRIGGER tr_drug_stock_bu_touch
    BEFORE UPDATE ON drug_stock
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

-- Layer 3: full-row audit trail
CREATE TRIGGER tr_drug_stock_au_audit
    AFTER INSERT OR UPDATE OR DELETE ON drug_stock
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  drug_stock IS 'Per-batch inventory. No soft-delete — is_blocked = true gates dispensing. FEFO (First Expiry First Out) ordering via ix_drug_stock_fefo index.';
COMMENT ON COLUMN drug_stock.drug_id            IS 'Drug from the master catalogue. One stock row per received batch.';
COMMENT ON COLUMN drug_stock.batch_number       IS 'Manufacturer batch/lot number. Unique per drug+vendor combination.';
COMMENT ON COLUMN drug_stock.mfg_date           IS 'Manufacturing date. NULL when not printed on the pack.';
COMMENT ON COLUMN drug_stock.expiry_date        IS 'Expiry date — must be after mfg_date when mfg_date is known. Used for FEFO ordering and expiry alerts.';
COMMENT ON COLUMN drug_stock.purchase_price     IS 'Purchase price per dispensing unit from the GRN. Used for COGS calculation.';
COMMENT ON COLUMN drug_stock.mrp               IS 'Maximum Retail Price printed on the pack. selling_price must not exceed this.';
COMMENT ON COLUMN drug_stock.selling_price      IS 'Must not exceed mrp. May be lower than mrp during promotions or generic substitution.';
COMMENT ON COLUMN drug_stock.quantity_received  IS 'Total units received in this batch (immutable after GRN confirmation).';
COMMENT ON COLUMN drug_stock.quantity_available IS 'Units currently available for dispensing. Decremented by drug_stock_ledger entries.';
COMMENT ON COLUMN drug_stock.vendor_id          IS 'Supplying vendor for this batch. Part of the unique batch key.';
COMMENT ON COLUMN drug_stock.purchase_order_id  IS 'Source PO for this receipt. NULL for opening-balance entries or emergency purchases without a PO.';
COMMENT ON COLUMN drug_stock.received_date      IS 'Date the batch was physically received and entered into the store.';
COMMENT ON COLUMN drug_stock.is_blocked         IS 'true when batch is expired, recalled, damaged, or quality-held. Blocks pharmacy dispensing. Set by nightly expiry job or manual quality action.';
COMMENT ON COLUMN drug_stock.blocked_reason     IS 'Mandatory when is_blocked = true: expired | recalled | damaged | quality_hold.';
COMMENT ON COLUMN drug_stock.version            IS 'Optimistic-lock counter — owned by Hibernate @Version. Trigger does NOT touch this column.';
