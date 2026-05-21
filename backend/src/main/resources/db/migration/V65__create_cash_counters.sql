-- ============================================================
-- V65__create_cash_counters.sql
-- Physical cash counter registry. One row per counter.
-- Seeded at deployment; rarely changed during live operation.
-- Soft-deleted via deleted_at — counters are never hard-deleted.
-- ============================================================

CREATE TABLE cash_counters (

    id              uuid        NOT NULL DEFAULT uuidv7(),

    -- Short code used in session numbers and reports (e.g. "OPD1", "PHARM")
    counter_code    text        NOT NULL,

    -- Human-readable name shown in the UI (e.g. "OPD Counter 1")
    counter_name    text        NOT NULL,

    -- Physical or wing location of this counter (e.g. "Ground Floor – OPD Wing")
    location        text,

    -- ── Uniform audit + soft-delete block ────────────────────
    created_by      uuid        NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_by      uuid,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    version         int         NOT NULL DEFAULT 0,
    deleted_at      timestamptz,
    deleted_by      uuid,

    -- ── Constraints ──────────────────────────────────────────
    CONSTRAINT pk_cash_counters
        PRIMARY KEY (id),

    CONSTRAINT chk_cash_counters_code_len
        CHECK (char_length(counter_code) BETWEEN 2 AND 10)
);

-- ── Indexes ───────────────────────────────────────────────────

-- Partial unique index — code must be unique among live (non-deleted) counters
CREATE UNIQUE INDEX uq_cash_counters_code
    ON cash_counters (counter_code)
    WHERE deleted_at IS NULL;

-- Name search / dropdown list for active counters only
CREATE INDEX ix_cash_counters_active
    ON cash_counters (counter_name)
    WHERE deleted_at IS NULL;

-- ── Triggers ──────────────────────────────────────────────────

-- Layer 1: bump updated_at on every UPDATE
CREATE TRIGGER tr_cash_counters_bu_touch
    BEFORE UPDATE ON cash_counters
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

-- Layer 3: full-row audit trail
CREATE TRIGGER tr_cash_counters_au_audit
    AFTER INSERT OR UPDATE OR DELETE ON cash_counters
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  cash_counters IS 'Physical billing/pharmacy cash counter registry. One row per counter. Seeded at deployment; rarely changed.';
COMMENT ON COLUMN cash_counters.counter_code IS 'Short alphanumeric code identifying the counter (2–10 characters). Unique among live counters.';
COMMENT ON COLUMN cash_counters.counter_name IS 'Human-readable display name shown in the UI (e.g. "OPD Counter 1").';
COMMENT ON COLUMN cash_counters.location     IS 'Optional free-text description of the physical location of this counter.';
COMMENT ON COLUMN cash_counters.version      IS 'Optimistic-lock counter — owned by Hibernate @Version. Trigger does NOT touch this column.';
COMMENT ON COLUMN cash_counters.deleted_at   IS 'Soft-delete timestamp. NULL = live counter.';
