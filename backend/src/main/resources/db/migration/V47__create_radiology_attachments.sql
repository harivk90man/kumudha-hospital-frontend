-- ============================================================
-- V47__create_radiology_attachments.sql
-- DICOM images and PDFs attached to a radiology order.
-- CASCADE child of radiology_orders — deleting an order removes
-- all its attachment rows automatically.
-- file_data stores raw bytes in-row; a future migration adds
-- file_url text for S3 / object-store migration path.
-- sequence_no controls the display order in the image viewer.
-- ============================================================

CREATE TABLE radiology_attachments (

    id                  uuid        NOT NULL DEFAULT uuidv7(),

    -- Parent order (CASCADE — attachments are owned by the order)
    radiology_order_id  uuid        NOT NULL,

    -- Original filename as uploaded or exported from the PACS
    file_name           text        NOT NULL,

    -- MIME type of the stored file
    file_type           text        NOT NULL,

    -- Raw file bytes stored in the database
    -- Migration path: add file_url text column for S3 presigned URL reference
    file_data           bytea       NOT NULL,

    -- Size of the stored file in bytes; must be > 0
    file_size_bytes     int         NOT NULL,

    -- Optional human-readable label for the image (e.g. 'AP view', 'lateral view')
    caption             text,

    -- 1-based position controlling display order in the image viewer
    sequence_no         int         NOT NULL DEFAULT 1,

    -- ── Uniform audit + soft-delete block ────────────────────
    created_by      uuid        NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_by      uuid,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    version         int         NOT NULL DEFAULT 0,
    deleted_at      timestamptz,
    deleted_by      uuid,

    -- ── Constraints ──────────────────────────────────────────
    CONSTRAINT pk_radiology_attachments
        PRIMARY KEY (id),

    CONSTRAINT fk_radiology_attachments_order
        FOREIGN KEY (radiology_order_id) REFERENCES radiology_orders(id) ON DELETE CASCADE,

    CONSTRAINT chk_radiology_attachments_file_type
        CHECK (file_type IN ('image/jpeg','image/png','application/pdf')),

    CONSTRAINT chk_radiology_attachments_file_size
        CHECK (file_size_bytes > 0),

    CONSTRAINT chk_radiology_attachments_seq
        CHECK (sequence_no > 0)
);

-- ── Indexes ───────────────────────────────────────────────────

-- All attachments for an order in display order (image viewer, report generation)
CREATE INDEX ix_radiology_attachments_order
    ON radiology_attachments (radiology_order_id, sequence_no)
    WHERE deleted_at IS NULL;

-- ── Triggers ──────────────────────────────────────────────────

-- Layer 1: bump updated_at on every UPDATE
CREATE TRIGGER tr_radiology_attachments_bu_touch
    BEFORE UPDATE ON radiology_attachments
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

-- Layer 3: full-row audit trail
CREATE TRIGGER tr_radiology_attachments_au_audit
    AFTER INSERT OR UPDATE OR DELETE ON radiology_attachments
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  radiology_attachments IS 'DICOM images and PDFs attached to a radiology order. CASCADE child of radiology_orders. file_data stores raw bytes; future migration adds file_url text column for S3/object-store migration path.';
COMMENT ON COLUMN radiology_attachments.radiology_order_id IS 'Parent radiology order. ON DELETE CASCADE — removing the order also removes all its attachments.';
COMMENT ON COLUMN radiology_attachments.file_name          IS 'Original filename as uploaded or exported from the PACS system (e.g. chest_pa_20260516.dcm).';
COMMENT ON COLUMN radiology_attachments.file_type          IS 'MIME type of the stored file: image/jpeg | image/png | application/pdf.';
COMMENT ON COLUMN radiology_attachments.file_data          IS 'Raw file bytes. For large PACS files, replace with file_url (S3 presigned URL) in a future migration.';
COMMENT ON COLUMN radiology_attachments.file_size_bytes    IS 'Size of the stored file in bytes. Must be > 0. Used for storage quota reporting.';
COMMENT ON COLUMN radiology_attachments.caption            IS 'Optional human-readable label for the image (e.g. AP view, lateral view, pre-contrast). Free text.';
COMMENT ON COLUMN radiology_attachments.sequence_no        IS '1-based display position in the image viewer and report. Must be > 0. Default 1 for single-attachment orders.';
COMMENT ON COLUMN radiology_attachments.version            IS 'Optimistic-lock counter — owned by Hibernate @Version. Trigger does NOT touch this column.';
COMMENT ON COLUMN radiology_attachments.deleted_at         IS 'Soft-delete timestamp. NULL = live row.';
