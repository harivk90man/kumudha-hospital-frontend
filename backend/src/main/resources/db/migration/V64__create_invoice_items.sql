-- ============================================================
-- V64__create_invoice_items.sql
-- Invoice line items. CASCADE child of invoices.
-- No soft-delete — corrections require cancelling and re-raising
-- the parent invoice; no deleted_at/deleted_by columns.
-- Polymorphic source: at most one of the six source FK columns
-- is non-NULL per row (chk_invoice_items_one_source).
-- bed_assignment_id and surgery_schedule_id columns are present;
-- FKs to bed_assignments(id) and surgery_schedules(id) are wired
-- in the IP module migration.
-- fn_recompute_invoice_totals() (AFTER INSERT OR UPDATE OR DELETE)
-- keeps invoices.subtotal / total_line_discount / total_tax /
-- total_amount in sync whenever a line item changes.
-- ============================================================

-- ── Recompute trigger function ────────────────────────────────
-- Recalculates the parent invoice totals whenever a line item
-- is inserted, updated, or deleted. updated_at on the parent row
-- is touched here rather than re-firing the touch trigger.

CREATE OR REPLACE FUNCTION fn_recompute_invoice_totals() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_invoice_id   uuid;
    v_subtotal     numeric(14,2);
    v_line_disc    numeric(14,2);
    v_total_tax    numeric(14,2);
    v_total_amount numeric(14,2);
BEGIN
    v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);

    SELECT
        COALESCE(SUM(ii.quantity * ii.unit_price), 0),
        COALESCE(SUM(ii.line_discount_amount), 0),
        COALESCE(SUM(ii.cgst_amount + ii.sgst_amount + ii.igst_amount), 0),
        COALESCE(SUM(ii.total_price), 0)
    INTO v_subtotal, v_line_disc, v_total_tax, v_total_amount
    FROM invoice_items ii
    WHERE ii.invoice_id = v_invoice_id;

    UPDATE invoices
       SET subtotal            = v_subtotal,
           total_line_discount = v_line_disc,
           total_tax           = v_total_tax,
           total_amount        = v_total_amount,
           updated_at          = now()
     WHERE id = v_invoice_id;

    RETURN NEW;
END;
$$;

-- ── Table ─────────────────────────────────────────────────────

CREATE TABLE invoice_items (

    id                      uuid            NOT NULL DEFAULT uuidv7(),

    invoice_id              uuid            NOT NULL,

    -- Optional link to the service catalogue for this line item
    service_id              uuid,

    -- Determines the billing workflow and the expected source FK column
    item_type               text            NOT NULL,

    -- Snapshot of service name at billing time — preserved even if the
    -- catalogue entry is later renamed or deleted
    item_name               text            NOT NULL,

    -- Display order within the invoice; unique per invoice
    sequence_no             int             NOT NULL,

    -- ── Polymorphic clinical source — at most one non-NULL ───────
    -- consultation_id: non-NULL when item_type = 'consultation'
    consultation_id         uuid,
    -- lab_order_item_id: non-NULL when item_type IN ('lab_test','lab_panel')
    lab_order_item_id       uuid,
    -- radiology_order_id: non-NULL when item_type = 'radiology'
    radiology_order_id      uuid,
    -- pharmacy_sale_item_id: non-NULL when item_type = 'drug'
    pharmacy_sale_item_id   uuid,
    -- bed_assignment_id: non-NULL for IP room charges; FK wired in IP module migration
    bed_assignment_id       uuid,
    -- surgery_schedule_id: non-NULL for surgery items; FK wired in IP module migration
    surgery_schedule_id     uuid,

    -- ── Pricing ──────────────────────────────────────────────────
    quantity                int             NOT NULL DEFAULT 1,

    -- Price per unit excluding discount and tax
    unit_price              numeric(14,2)   NOT NULL,

    -- Percentage and absolute line-level discount
    line_discount_pct       numeric(4,2)    NOT NULL DEFAULT 0,
    line_discount_amount    numeric(14,2)   NOT NULL DEFAULT 0,

    -- Free-text reason; mandatory when line_discount_amount > 0
    line_discount_reason    text,

    -- User who approved the line-level discount (L1 discount approval)
    line_discount_approved_by uuid,

    -- ── GST split: CGST+SGST for intra-state, IGST for inter-state ──
    cgst_pct                numeric(4,2)    NOT NULL DEFAULT 0,
    cgst_amount             numeric(14,2)   NOT NULL DEFAULT 0,
    sgst_pct                numeric(4,2)    NOT NULL DEFAULT 0,
    sgst_amount             numeric(14,2)   NOT NULL DEFAULT 0,

    -- IGST applies for inter-state (mutually exclusive with CGST+SGST)
    igst_pct                numeric(4,2)    NOT NULL DEFAULT 0,
    igst_amount             numeric(14,2)   NOT NULL DEFAULT 0,

    -- Net line value after discount and including applicable GST
    total_price             numeric(14,2)   NOT NULL,

    -- ── No-soft-delete audit block ────────────────────────────────
    created_by              uuid            NOT NULL,
    created_at              timestamptz     NOT NULL DEFAULT now(),
    updated_by              uuid,
    updated_at              timestamptz     NOT NULL DEFAULT now(),
    version                 int             NOT NULL DEFAULT 0,

    -- ── Constraints ──────────────────────────────────────────────
    CONSTRAINT pk_invoice_items
        PRIMARY KEY (id),

    CONSTRAINT fk_invoice_items_invoice
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,

    CONSTRAINT fk_invoice_items_service
        FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT,

    CONSTRAINT fk_invoice_items_consultation
        FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE RESTRICT,

    CONSTRAINT fk_invoice_items_lab_order_item
        FOREIGN KEY (lab_order_item_id) REFERENCES lab_order_items(id) ON DELETE RESTRICT,

    CONSTRAINT fk_invoice_items_radiology_order
        FOREIGN KEY (radiology_order_id) REFERENCES radiology_orders(id) ON DELETE RESTRICT,

    CONSTRAINT fk_invoice_items_pharmacy_sale_item
        FOREIGN KEY (pharmacy_sale_item_id) REFERENCES pharmacy_sale_items(id) ON DELETE RESTRICT,

    CONSTRAINT fk_invoice_items_discount_approver
        FOREIGN KEY (line_discount_approved_by) REFERENCES users(id) ON DELETE RESTRICT,

    -- Sequence number must be positive and unique within an invoice
    CONSTRAINT uq_invoice_items_seq
        UNIQUE (invoice_id, sequence_no),

    CONSTRAINT chk_invoice_items_type
        CHECK (item_type IN (
            'consultation','lab_test','lab_panel','radiology','drug',
            'room_charge','nursing','procedure','surgery',
            'consumable','ambulance','other'
        )),

    CONSTRAINT chk_invoice_items_seq
        CHECK (sequence_no > 0),

    CONSTRAINT chk_invoice_items_qty
        CHECK (quantity > 0),

    -- At most one clinical source per line item
    CONSTRAINT chk_invoice_items_one_source
        CHECK (num_nonnulls(
            consultation_id, lab_order_item_id, radiology_order_id,
            pharmacy_sale_item_id, bed_assignment_id, surgery_schedule_id
        ) <= 1),

    -- item_type ↔ source FK cross-checks
    CONSTRAINT chk_invoice_items_consultation
        CHECK ((item_type = 'consultation') = (consultation_id IS NOT NULL)),

    CONSTRAINT chk_invoice_items_lab
        CHECK ((item_type IN ('lab_test','lab_panel')) = (lab_order_item_id IS NOT NULL)),

    CONSTRAINT chk_invoice_items_radiology
        CHECK ((item_type = 'radiology') = (radiology_order_id IS NOT NULL)),

    CONSTRAINT chk_invoice_items_drug
        CHECK ((item_type = 'drug') = (pharmacy_sale_item_id IS NOT NULL)),

    -- IGST and CGST+SGST are mutually exclusive GST regimes
    CONSTRAINT chk_invoice_items_gst_exclusive
        CHECK ((igst_pct = 0) OR (cgst_pct = 0 AND sgst_pct = 0)),

    -- Line discount reason is mandatory when a discount is applied
    CONSTRAINT chk_invoice_items_discount_reason
        CHECK (line_discount_amount = 0 OR line_discount_reason IS NOT NULL),

    CONSTRAINT chk_invoice_items_prices
        CHECK (unit_price > 0 AND total_price >= 0)
);

-- ── Indexes ───────────────────────────────────────────────────

-- Fetch all line items for an invoice in display order (primary access pattern)
CREATE INDEX ix_invoice_items_invoice
    ON invoice_items (invoice_id, sequence_no);

-- Reverse-lookup: find invoice item from the source consultation
CREATE INDEX ix_invoice_items_consultation
    ON invoice_items (consultation_id)
    WHERE consultation_id IS NOT NULL;

-- Reverse-lookup: find invoice item from the source lab order item
CREATE INDEX ix_invoice_items_lab_order_item
    ON invoice_items (lab_order_item_id)
    WHERE lab_order_item_id IS NOT NULL;

-- Reverse-lookup: find invoice item from the source radiology order
CREATE INDEX ix_invoice_items_radiology_order
    ON invoice_items (radiology_order_id)
    WHERE radiology_order_id IS NOT NULL;

-- Reverse-lookup: find invoice item from the source pharmacy sale item
CREATE INDEX ix_invoice_items_pharmacy_sale_item
    ON invoice_items (pharmacy_sale_item_id)
    WHERE pharmacy_sale_item_id IS NOT NULL;

-- ── Triggers ──────────────────────────────────────────────────

-- Layer 1: bump updated_at on every UPDATE
CREATE TRIGGER tr_invoice_items_bu_touch
    BEFORE UPDATE ON invoice_items
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

-- Recompute parent invoice totals whenever a line item changes
CREATE TRIGGER tr_invoice_items_au_recompute
    AFTER INSERT OR UPDATE OR DELETE ON invoice_items
    FOR EACH ROW EXECUTE FUNCTION fn_recompute_invoice_totals();

-- Layer 3: full-row audit trail
CREATE TRIGGER tr_invoice_items_au_audit
    AFTER INSERT OR UPDATE OR DELETE ON invoice_items
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  invoice_items IS 'Invoice line items. CASCADE child of invoices. No soft-delete — corrections cancel and re-raise. fn_recompute_invoice_totals() keeps invoices.subtotal/total_tax/total_amount in sync.';
COMMENT ON COLUMN invoice_items.invoice_id              IS 'Parent invoice. ON DELETE CASCADE — items are removed when the invoice is deleted.';
COMMENT ON COLUMN invoice_items.service_id              IS 'Optional link to the service catalogue. FK → services(id) RESTRICT. NULL when the item is not catalogue-backed.';
COMMENT ON COLUMN invoice_items.item_type               IS 'consultation | lab_test | lab_panel | radiology | drug | room_charge | nursing | procedure | surgery | consumable | ambulance | other. Determines the expected source FK column.';
COMMENT ON COLUMN invoice_items.item_name               IS 'Snapshot of service name at billing time — preserves display even if service is later renamed.';
COMMENT ON COLUMN invoice_items.sequence_no             IS 'Display order within the invoice. Must be > 0. Unique per invoice (uq_invoice_items_seq).';
COMMENT ON COLUMN invoice_items.consultation_id         IS 'Non-NULL when item_type = consultation. FK → consultations(id) RESTRICT.';
COMMENT ON COLUMN invoice_items.lab_order_item_id       IS 'Non-NULL when item_type IN (lab_test, lab_panel). FK → lab_order_items(id) RESTRICT.';
COMMENT ON COLUMN invoice_items.radiology_order_id      IS 'Non-NULL when item_type = radiology. FK → radiology_orders(id) RESTRICT.';
COMMENT ON COLUMN invoice_items.pharmacy_sale_item_id   IS 'Non-NULL when item_type = drug. FK → pharmacy_sale_items(id) RESTRICT.';
COMMENT ON COLUMN invoice_items.bed_assignment_id       IS 'FK → bed_assignments(id) RESTRICT — constraint added in IP module migration.';
COMMENT ON COLUMN invoice_items.surgery_schedule_id     IS 'FK → surgery_schedules(id) RESTRICT — constraint added in IP module migration.';
COMMENT ON COLUMN invoice_items.quantity                IS 'Number of units billed. Must be > 0.';
COMMENT ON COLUMN invoice_items.unit_price              IS 'Price per unit excluding discount and tax. Must be > 0.';
COMMENT ON COLUMN invoice_items.line_discount_pct       IS 'Percentage discount applied at line level (informational; line_discount_amount is authoritative).';
COMMENT ON COLUMN invoice_items.line_discount_amount    IS 'Absolute discount deducted from this line. 0 when no discount. Reason mandatory when > 0.';
COMMENT ON COLUMN invoice_items.line_discount_reason    IS 'Free-text reason for the line-level discount. Mandatory when line_discount_amount > 0.';
COMMENT ON COLUMN invoice_items.line_discount_approved_by IS 'User who approved the line-level discount (L1 approval). FK → users(id) RESTRICT.';
COMMENT ON COLUMN invoice_items.cgst_pct                IS 'Central GST rate for intra-state services. 0 when IGST is used instead.';
COMMENT ON COLUMN invoice_items.cgst_amount             IS 'Central GST amount for this line.';
COMMENT ON COLUMN invoice_items.sgst_pct                IS 'State GST rate for intra-state services. 0 when IGST is used instead.';
COMMENT ON COLUMN invoice_items.sgst_amount             IS 'State GST amount for this line.';
COMMENT ON COLUMN invoice_items.igst_pct                IS 'Integrated GST rate for inter-state services. 0 when CGST+SGST are used instead.';
COMMENT ON COLUMN invoice_items.igst_amount             IS 'Integrated GST amount for this line.';
COMMENT ON COLUMN invoice_items.total_price             IS 'Net line value = (quantity × unit_price) − line_discount_amount + applicable GST. Used by fn_recompute_invoice_totals().';
COMMENT ON COLUMN invoice_items.version                 IS 'Optimistic-lock counter — owned by Hibernate @Version. Trigger does NOT touch this column.';
COMMENT ON CONSTRAINT chk_invoice_items_one_source ON invoice_items IS 'At most one clinical source per line item (consultation, lab, radiology, drug, bed, surgery).';
