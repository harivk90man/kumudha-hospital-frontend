-- ============================================================
-- V39__create_lab_test_groups.sql
-- Lab test panel definitions (e.g. LFT, CBC, Lipid Profile).
-- A panel is a named bundle of related tests ordered and priced
-- as a single unit. Individual tests within the panel are
-- stored in lab_test_group_items (V40).
-- service_id FK to services(id) deferred to pricing module (Module 16).
-- ============================================================

CREATE TABLE lab_test_groups (

    id              uuid        NOT NULL DEFAULT uuidv7(),

    -- Short unique code for the panel (e.g. LFT, CBC, LIPID)
    panel_code      text        NOT NULL,

    panel_name      text        NOT NULL,

    -- Pricing link — FK to services(id) added in pricing module migration (Module 16)
    service_id      uuid        NOT NULL,

    description     text,

    -- ── Uniform audit + soft-delete block ────────────────────
    created_by      uuid        NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_by      uuid,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    version         int         NOT NULL DEFAULT 0,
    deleted_at      timestamptz,
    deleted_by      uuid,

    -- ── Constraints ──────────────────────────────────────────
    CONSTRAINT pk_lab_test_groups
        PRIMARY KEY (id),

    CONSTRAINT chk_lab_test_groups_code_len
        CHECK (char_length(panel_code) BETWEEN 2 AND 20)
);

-- ── Indexes ───────────────────────────────────────────────────

-- Soft-delete-aware unique panel code — allows code reuse after deletion
CREATE UNIQUE INDEX uq_lab_test_groups_code
    ON lab_test_groups (panel_code)
    WHERE deleted_at IS NULL;

-- ── Triggers ──────────────────────────────────────────────────

-- Layer 1: bump updated_at on every UPDATE
CREATE TRIGGER tr_lab_test_groups_bu_touch
    BEFORE UPDATE ON lab_test_groups
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

-- Layer 3: full-row audit trail
CREATE TRIGGER tr_lab_test_groups_au_audit
    AFTER INSERT OR UPDATE OR DELETE ON lab_test_groups
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  lab_test_groups IS 'Test panel definitions (LFT, CBC, Lipid Profile, etc.). service_id FK added in pricing module.';
COMMENT ON COLUMN lab_test_groups.panel_code    IS 'Short unique code for the panel (e.g. LFT, CBC, LIPID). 2–20 characters. Unique among non-deleted panels.';
COMMENT ON COLUMN lab_test_groups.panel_name    IS 'Human-readable display name shown to clinicians and patients.';
COMMENT ON COLUMN lab_test_groups.service_id    IS 'FK → services(id) RESTRICT — constraint added in the pricing module migration.';
COMMENT ON COLUMN lab_test_groups.description   IS 'Optional clinical description of the panel purpose and when to order it.';
COMMENT ON COLUMN lab_test_groups.version       IS 'Optimistic-lock counter — owned by Hibernate @Version. Trigger does NOT touch this column.';
COMMENT ON COLUMN lab_test_groups.deleted_at    IS 'Soft-delete timestamp. NULL = live row.';
