-- ============================================================
-- V40__create_lab_test_group_items.sql
-- Individual test slots within a lab test panel.
-- CASCADE child of lab_test_groups — deleting a panel removes
-- all its items automatically.
-- sequence_no controls print/display order on result reports.
-- ============================================================

CREATE TABLE lab_test_group_items (

    id              uuid        NOT NULL DEFAULT uuidv7(),

    -- Parent panel
    group_id        uuid        NOT NULL,

    -- The specific test included in this panel slot
    lab_test_id     uuid        NOT NULL,

    -- 1-based position controlling print and display order
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
    CONSTRAINT pk_lab_test_group_items
        PRIMARY KEY (id),

    CONSTRAINT fk_lab_test_group_items_group
        FOREIGN KEY (group_id) REFERENCES lab_test_groups(id) ON DELETE CASCADE,

    CONSTRAINT fk_lab_test_group_items_test
        FOREIGN KEY (lab_test_id) REFERENCES lab_tests(id) ON DELETE RESTRICT,

    CONSTRAINT chk_lab_test_group_items_sequence
        CHECK (sequence_no > 0)
);

-- ── Indexes ───────────────────────────────────────────────────

-- All items for a panel (panel detail view, report ordering)
CREATE INDEX ix_lab_test_group_items_group
    ON lab_test_group_items (group_id)
    WHERE deleted_at IS NULL;

-- Panels containing a specific test (impact analysis on test changes)
CREATE INDEX ix_lab_test_group_items_test
    ON lab_test_group_items (lab_test_id)
    WHERE deleted_at IS NULL;

-- Prevent the same test appearing twice in one panel (soft-delete-aware)
CREATE UNIQUE INDEX uq_lab_test_group_items_test
    ON lab_test_group_items (group_id, lab_test_id)
    WHERE deleted_at IS NULL;

-- Prevent two items sharing the same print position in one panel (soft-delete-aware)
CREATE UNIQUE INDEX uq_lab_test_group_items_seq
    ON lab_test_group_items (group_id, sequence_no)
    WHERE deleted_at IS NULL;

-- ── Triggers ──────────────────────────────────────────────────

-- Layer 1: bump updated_at on every UPDATE
CREATE TRIGGER tr_lab_test_group_items_bu_touch
    BEFORE UPDATE ON lab_test_group_items
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

-- Layer 3: full-row audit trail
CREATE TRIGGER tr_lab_test_group_items_au_audit
    AFTER INSERT OR UPDATE OR DELETE ON lab_test_group_items
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  lab_test_group_items IS 'Tests included in a panel (CASCADE child of lab_test_groups). sequence_no controls the print/display order on reports.';
COMMENT ON COLUMN lab_test_group_items.group_id      IS 'Parent panel. ON DELETE CASCADE — removing the panel also removes all its item rows.';
COMMENT ON COLUMN lab_test_group_items.lab_test_id   IS 'The individual lab test included at this panel slot. ON DELETE RESTRICT — a test in use by a panel cannot be deleted.';
COMMENT ON COLUMN lab_test_group_items.sequence_no   IS '1-based display position within the panel. Controls column ordering on printed result reports. Must be > 0 and unique within the panel (soft-delete-aware).';
COMMENT ON COLUMN lab_test_group_items.version       IS 'Optimistic-lock counter — owned by Hibernate @Version. Trigger does NOT touch this column.';
COMMENT ON COLUMN lab_test_group_items.deleted_at    IS 'Soft-delete timestamp. NULL = live row.';
