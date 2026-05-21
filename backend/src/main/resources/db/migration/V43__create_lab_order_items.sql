-- ============================================================
-- V43__create_lab_order_items.sql
-- Individual test line items within a lab order.
-- CASCADE child of lab_orders — deleting an order removes all
-- its item rows automatically.
-- group_id identifies when the item was added as part of a panel.
-- sample_id links to the physical specimen once collected.
-- sequence_no controls the print order on result reports.
-- ============================================================

CREATE TABLE lab_order_items (

    id              uuid        NOT NULL DEFAULT uuidv7(),

    -- Parent order (CASCADE — items are owned by the order)
    lab_order_id    uuid        NOT NULL,

    -- The specific test being performed
    lab_test_id     uuid        NOT NULL,

    -- Non-NULL when this item was added as part of a panel; NULL for individually ordered tests
    group_id        uuid,

    -- Linked to the physical specimen once sample collection is completed
    sample_id       uuid,

    -- Per-item lifecycle (more granular than the order header status)
    status          text        NOT NULL DEFAULT 'pending',

    -- 1-based position controlling print order on result reports
    sequence_no     int         NOT NULL,

    -- ── Uniform audit + soft-delete block ────────────────────
    created_by      uuid        NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_by      uuid,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    version         int         NOT NULL DEFAULT 0,
    deleted_at      timestamptz,
    deleted_by      uuid,

    -- ── Constraints ──────────────────────────────────────────
    CONSTRAINT pk_lab_order_items
        PRIMARY KEY (id),

    CONSTRAINT fk_lab_order_items_order
        FOREIGN KEY (lab_order_id) REFERENCES lab_orders(id) ON DELETE CASCADE,

    CONSTRAINT fk_lab_order_items_test
        FOREIGN KEY (lab_test_id) REFERENCES lab_tests(id) ON DELETE RESTRICT,

    CONSTRAINT fk_lab_order_items_group
        FOREIGN KEY (group_id) REFERENCES lab_test_groups(id) ON DELETE RESTRICT,

    CONSTRAINT fk_lab_order_items_sample
        FOREIGN KEY (sample_id) REFERENCES lab_samples(id) ON DELETE RESTRICT,

    CONSTRAINT chk_lab_order_items_status
        CHECK (status IN (
            'pending','sample_collected','rejected','recollection_pending',
            'in_progress','reported','verified','released','cancelled'
        )),

    CONSTRAINT chk_lab_order_items_sequence
        CHECK (sequence_no > 0),

    -- A test cannot appear twice on the same order (soft-delete-aware)
    CONSTRAINT uq_lab_order_items_test
        UNIQUE NULLS NOT DISTINCT (lab_order_id, lab_test_id)
);

-- ── Indexes ───────────────────────────────────────────────────

-- All items for an order (order detail view, result entry screen)
CREATE INDEX ix_lab_order_items_order
    ON lab_order_items (lab_order_id)
    WHERE deleted_at IS NULL;

-- All items linked to a sample (sample details — what was tested on this tube)
CREATE INDEX ix_lab_order_items_sample
    ON lab_order_items (sample_id)
    WHERE sample_id IS NOT NULL;

-- Soft-delete-aware unique index: one test per order per active row
CREATE UNIQUE INDEX uq_lab_order_items_test_active
    ON lab_order_items (lab_order_id, lab_test_id)
    WHERE deleted_at IS NULL;

-- ── Triggers ──────────────────────────────────────────────────

-- Layer 1: bump updated_at on every UPDATE
CREATE TRIGGER tr_lab_order_items_bu_touch
    BEFORE UPDATE ON lab_order_items
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

-- Layer 3: full-row audit trail
CREATE TRIGGER tr_lab_order_items_au_audit
    AFTER INSERT OR UPDATE OR DELETE ON lab_order_items
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  lab_order_items IS 'One test line per lab order item. CASCADE child of lab_orders. sample_id links to the physical specimen once collected.';
COMMENT ON COLUMN lab_order_items.lab_order_id  IS 'Parent lab order. ON DELETE CASCADE — removing the order also removes all its line items.';
COMMENT ON COLUMN lab_order_items.lab_test_id   IS 'The specific test being performed on this line. ON DELETE RESTRICT — a test in use by an order cannot be deleted.';
COMMENT ON COLUMN lab_order_items.group_id       IS 'Non-NULL when this item was added as part of a panel. NULL for individually ordered tests. ON DELETE RESTRICT.';
COMMENT ON COLUMN lab_order_items.sample_id      IS 'Physical specimen collected for this test line. NULL until sample collection is completed and the sample row is linked.';
COMMENT ON COLUMN lab_order_items.status         IS 'pending → sample_collected → in_progress → reported → verified → released. recollection_pending and rejected reflect sample-level problems. cancelled is a terminal state.';
COMMENT ON COLUMN lab_order_items.sequence_no    IS '1-based display position on the printed result report. Must be > 0.';
COMMENT ON COLUMN lab_order_items.version        IS 'Optimistic-lock counter — owned by Hibernate @Version. Trigger does NOT touch this column.';
COMMENT ON COLUMN lab_order_items.deleted_at     IS 'Soft-delete timestamp. NULL = live row.';
