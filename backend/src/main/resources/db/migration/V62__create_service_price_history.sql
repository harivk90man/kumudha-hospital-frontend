-- ============================================================
-- V62__create_service_price_history.sql
-- Immutable price audit trail for the services catalogue.
-- One open row per service (effective_to IS NULL = current price).
-- Price changes are written here automatically by
-- fn_services_price_history() defined in V61.
-- DELETE is permanently blocked by trigger.
-- UPDATE is guarded: only period-close (setting effective_to)
-- is allowed on an open row; all other mutations are rejected.
-- ============================================================

-- ── Guard function 1: immutable row — only period-close allowed ──

CREATE OR REPLACE FUNCTION fn_service_price_history_update_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    -- Only allowed update: set effective_to on a currently open row
    IF OLD.effective_to IS NULL
       AND NEW.effective_to IS NOT NULL
       AND NEW.price          = OLD.price
       AND NEW.effective_from = OLD.effective_from
       AND NEW.service_id     = OLD.service_id
    THEN
        RETURN NEW;  -- allow the period-close update
    END IF;

    RAISE EXCEPTION 'service_price_history row % is immutable — only effective_to may be set on an open row', OLD.id
        USING ERRCODE = '42501';
END;
$$;

-- ── Guard function 2: DELETE permanently blocked ───────────────

CREATE OR REPLACE FUNCTION fn_service_price_history_delete_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'service_price_history is a permanent audit table — DELETE is not permitted on row %', OLD.id
        USING ERRCODE = '42501';
END;
$$;

-- ── Table ──────────────────────────────────────────────────────

CREATE TABLE service_price_history (

    id              uuid        NOT NULL DEFAULT uuidv7(),

    service_id      uuid        NOT NULL,

    -- Price that was effective during [effective_from, effective_to)
    price           numeric(14,2) NOT NULL,

    -- Date the price became effective (inclusive); set to current_date by trigger
    effective_from  date        NOT NULL,

    -- Date the price ceased to be effective (exclusive); NULL = currently active
    effective_to    date,

    -- User who triggered the price change (from services.updated_by at time of change)
    changed_by      uuid,

    -- Optional administrative reason for the price change
    reason          text,

    -- ── Uniform audit + soft-delete block ────────────────────
    created_by      uuid        NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_by      uuid,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    version         int         NOT NULL DEFAULT 0,
    deleted_at      timestamptz,
    deleted_by      uuid,

    -- ── Constraints ──────────────────────────────────────────
    CONSTRAINT pk_service_price_history
        PRIMARY KEY (id),

    CONSTRAINT chk_service_price_history_price
        CHECK (price >= 0),

    CONSTRAINT chk_service_price_history_period
        CHECK (effective_to IS NULL OR effective_to > effective_from),

    CONSTRAINT fk_service_price_history_service
        FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT,

    CONSTRAINT fk_service_price_history_changed_by
        FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ── Indexes ───────────────────────────────────────────────────

-- At most one open price window per service at any time
CREATE UNIQUE INDEX uq_service_price_history_active
    ON service_price_history (service_id)
    WHERE effective_to IS NULL AND deleted_at IS NULL;

-- Full price timeline for a service, newest first
CREATE INDEX ix_service_price_history_service
    ON service_price_history (service_id, effective_from DESC);

-- ── Triggers ──────────────────────────────────────────────────

-- Guard: reject all updates except period-close on an open row
CREATE TRIGGER tr_service_price_history_bu_guard
    BEFORE UPDATE ON service_price_history
    FOR EACH ROW EXECUTE FUNCTION fn_service_price_history_update_guard();

-- Guard: permanently block all deletes
CREATE TRIGGER tr_service_price_history_bd_guard
    BEFORE DELETE ON service_price_history
    FOR EACH ROW EXECUTE FUNCTION fn_service_price_history_delete_guard();

-- Layer 3: full-row audit trail (INSERT and allowed UPDATE only;
-- DELETE never reaches the AFTER trigger because bd_guard raises first)
CREATE TRIGGER tr_service_price_history_au_audit
    AFTER INSERT OR UPDATE ON service_price_history
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  service_price_history IS 'Immutable price audit trail. One open row per service (effective_to IS NULL = current price). Price changes from services trigger close the open row and insert a new one. DELETE is permanently blocked. UPDATE is guarded to allow only period-close (setting effective_to).';
COMMENT ON COLUMN service_price_history.service_id      IS 'FK → services(id) RESTRICT. Each row belongs to exactly one service.';
COMMENT ON COLUMN service_price_history.price           IS 'Price that was effective during [effective_from, effective_to). Must be >= 0.';
COMMENT ON COLUMN service_price_history.effective_from  IS 'Date the price became effective (inclusive). Driven by the services trigger — equals current_date at time of price change.';
COMMENT ON COLUMN service_price_history.effective_to    IS 'Date the price ceased to be effective (exclusive). NULL = current/active price. Set by fn_services_price_history() when a newer price replaces this row.';
COMMENT ON COLUMN service_price_history.changed_by      IS 'User who triggered the price change, copied from services.updated_by at change time. NULL for system-initiated changes.';
COMMENT ON COLUMN service_price_history.reason          IS 'Optional free-text reason for the price change (e.g. annual revision, GST rate update).';
COMMENT ON COLUMN service_price_history.version         IS 'Owned by Hibernate @Version. Trigger does NOT touch this column.';
COMMENT ON COLUMN service_price_history.deleted_at      IS 'Soft-delete timestamp. NULL = live row. Present for schema uniformity; logically this table is never soft-deleted.';
COMMENT ON INDEX uq_service_price_history_active IS 'Enforces at most one open price window per service. Two open windows for the same service would be a data integrity error.';
