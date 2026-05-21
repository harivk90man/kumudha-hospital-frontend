-- ============================================================
-- V50__create_vendor_contacts.sql
-- Contacts for a vendor. CASCADE child of vendors.
-- Exactly one contact per vendor may have is_primary = true,
-- enforced by the partial unique index uq_vendor_contacts_primary.
-- At least one of mobile / phone / email must be non-null,
-- enforced by chk_vendor_contacts_has_contact.
-- Soft-delete via deleted_at (full 7 audit).
-- ============================================================

CREATE TABLE vendor_contacts (

    id              uuid        NOT NULL DEFAULT uuidv7(),

    vendor_id       uuid        NOT NULL,

    contact_name    text        NOT NULL,

    -- Functional role of this contact at the vendor
    role            text        NOT NULL,

    -- Mobile number — 10 to 15 digits when present
    mobile          text,

    -- Landline / office phone
    phone           text,

    email           text,

    -- At most one contact per vendor may be flagged primary
    is_primary      boolean     NOT NULL DEFAULT false,

    -- ── Uniform audit + soft-delete block ────────────────────
    created_by      uuid        NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_by      uuid,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    version         int         NOT NULL DEFAULT 0,
    deleted_at      timestamptz,
    deleted_by      uuid,

    -- ── Constraints ──────────────────────────────────────────
    CONSTRAINT pk_vendor_contacts
        PRIMARY KEY (id),

    CONSTRAINT fk_vendor_contacts_vendor
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,

    CONSTRAINT chk_vendor_contacts_role
        CHECK (role IN ('sales_rep','delivery','accounts','support','other')),

    CONSTRAINT chk_vendor_contacts_mobile_len
        CHECK (mobile IS NULL OR char_length(mobile) BETWEEN 10 AND 15),

    -- At least one reachable contact channel must be provided
    CONSTRAINT chk_vendor_contacts_has_contact
        CHECK (num_nonnulls(mobile, phone, email) >= 1)
);

-- ── Indexes ───────────────────────────────────────────────────

-- Primary access pattern: all live contacts for a vendor
CREATE INDEX ix_vendor_contacts_vendor
    ON vendor_contacts (vendor_id)
    WHERE deleted_at IS NULL;

-- Partial unique: only one primary contact per vendor among live rows
CREATE UNIQUE INDEX uq_vendor_contacts_primary
    ON vendor_contacts (vendor_id)
    WHERE is_primary = true AND deleted_at IS NULL;

-- ── Triggers ──────────────────────────────────────────────────

-- Layer 1: bump updated_at on every UPDATE
CREATE TRIGGER tr_vendor_contacts_bu_touch
    BEFORE UPDATE ON vendor_contacts
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

-- Layer 3: full-row audit trail
CREATE TRIGGER tr_vendor_contacts_au_audit
    AFTER INSERT OR UPDATE OR DELETE ON vendor_contacts
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  vendor_contacts IS 'Contacts for a vendor. Exactly one may be is_primary = true (partial unique index).';
COMMENT ON COLUMN vendor_contacts.vendor_id    IS 'Parent vendor. ON DELETE CASCADE — contacts are removed when the vendor is deleted.';
COMMENT ON COLUMN vendor_contacts.contact_name IS 'Full name of the contact person.';
COMMENT ON COLUMN vendor_contacts.role         IS 'Functional role: sales_rep | delivery | accounts | support | other.';
COMMENT ON COLUMN vendor_contacts.mobile       IS 'Mobile number — 10 to 15 characters. At least one of mobile / phone / email must be non-null.';
COMMENT ON COLUMN vendor_contacts.phone        IS 'Landline or office phone. At least one of mobile / phone / email must be non-null.';
COMMENT ON COLUMN vendor_contacts.email        IS 'Email address. At least one of mobile / phone / email must be non-null.';
COMMENT ON COLUMN vendor_contacts.is_primary   IS 'TRUE for the main point of contact. At most one live contact per vendor may be primary (uq_vendor_contacts_primary).';
COMMENT ON COLUMN vendor_contacts.version      IS 'Optimistic-lock counter — owned by Hibernate @Version. Trigger does NOT touch this column.';
COMMENT ON COLUMN vendor_contacts.deleted_at   IS 'Soft-delete timestamp. NULL = live row.';
