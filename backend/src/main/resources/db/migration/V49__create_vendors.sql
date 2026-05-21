-- ============================================================
-- V49__create_vendors.sql
-- Medicine supplier/vendor master.
-- drug_licence_number is required for Schedule H/H1/X drugs.
-- is_narcotic_supplier gates narcotic purchase orders.
-- Soft-delete via deleted_at (full 7 audit).
-- ============================================================

CREATE TABLE vendors (

    id                      uuid        NOT NULL DEFAULT uuidv7(),

    -- Short, human-readable supplier code (e.g. VND-001)
    vendor_code             text        NOT NULL,

    vendor_name             text        NOT NULL,

    -- Full address as structured JSON (street, city, state, pin, country)
    address                 jsonb,

    -- GST Identification Number — 15-char alphanumeric when present
    gstin                   text,

    -- Permanent Account Number — 10-char alphanumeric when present
    pan                     text,

    -- Drug licence number — mandatory for Schedule H/H1/X narcotic suppliers
    drug_licence_number     text,

    -- Standard payment window in days; defaults to 30
    payment_terms_days      int         NOT NULL DEFAULT 30,

    -- When true, this vendor is authorised to supply narcotic drugs
    is_narcotic_supplier    boolean     NOT NULL DEFAULT false,

    -- ── Uniform audit + soft-delete block ────────────────────
    created_by              uuid        NOT NULL,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_by              uuid,
    updated_at              timestamptz NOT NULL DEFAULT now(),
    version                 int         NOT NULL DEFAULT 0,
    deleted_at              timestamptz,
    deleted_by              uuid,

    -- ── Constraints ──────────────────────────────────────────
    CONSTRAINT pk_vendors
        PRIMARY KEY (id),

    CONSTRAINT chk_vendors_code_len
        CHECK (char_length(vendor_code) BETWEEN 2 AND 20),

    CONSTRAINT chk_vendors_gstin_len
        CHECK (gstin IS NULL OR char_length(gstin) = 15),

    CONSTRAINT chk_vendors_pan_len
        CHECK (pan IS NULL OR char_length(pan) = 10),

    CONSTRAINT chk_vendors_payment_terms
        CHECK (payment_terms_days > 0)
);

-- ── Indexes ───────────────────────────────────────────────────

-- Partial unique: vendor_code must be unique among live (non-deleted) rows
CREATE UNIQUE INDEX uq_vendors_code
    ON vendors (vendor_code)
    WHERE deleted_at IS NULL;

-- Active vendor name search (admin / purchase order creation)
CREATE INDEX ix_vendors_active
    ON vendors (vendor_name)
    WHERE deleted_at IS NULL;

-- ── Triggers ──────────────────────────────────────────────────

-- Layer 1: bump updated_at on every UPDATE
CREATE TRIGGER tr_vendors_bu_touch
    BEFORE UPDATE ON vendors
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

-- Layer 3: full-row audit trail
CREATE TRIGGER tr_vendors_au_audit
    AFTER INSERT OR UPDATE OR DELETE ON vendors
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  vendors IS 'Medicine supplier/vendor master. drug_licence_number required for Schedule H/H1/X drugs. is_narcotic_supplier gates narcotic purchase orders.';
COMMENT ON COLUMN vendors.vendor_code          IS 'Short human-readable supplier code (e.g. VND-001). 2–20 characters. Unique among live rows.';
COMMENT ON COLUMN vendors.vendor_name          IS 'Full legal or trade name of the supplier.';
COMMENT ON COLUMN vendors.address              IS 'Structured address JSON (street, city, state, pin, country). NULL when not yet captured.';
COMMENT ON COLUMN vendors.gstin               IS 'GST Identification Number — exactly 15 characters when present. NULL for unregistered vendors.';
COMMENT ON COLUMN vendors.pan                 IS 'Permanent Account Number — exactly 10 characters when present. Required for TDS deduction above threshold.';
COMMENT ON COLUMN vendors.drug_licence_number IS 'Drug licence number issued by the state FDA. Mandatory for vendors supplying Schedule H/H1/X controlled drugs.';
COMMENT ON COLUMN vendors.payment_terms_days  IS 'Standard credit period in days (e.g. 30, 45, 60). Must be > 0.';
COMMENT ON COLUMN vendors.is_narcotic_supplier IS 'TRUE when this vendor is authorised to supply narcotic / NDPS drugs. Gates narcotic purchase order creation.';
COMMENT ON COLUMN vendors.version              IS 'Optimistic-lock counter — owned by Hibernate @Version. Trigger does NOT touch this column.';
COMMENT ON COLUMN vendors.deleted_at           IS 'Soft-delete timestamp. NULL = live row.';
