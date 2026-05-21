-- ============================================================
-- V63__create_invoices.sql
-- Billing invoice header. One row per invoice raised against a
-- patient visit (OP, IP interim, IP final, pharmacy direct,
-- lab direct, radiology direct, or other).
-- Two GENERATED ALWAYS AS STORED columns:
--   total_discount = total_line_discount + bill_discount_amount
--   balance        = total_amount - amount_paid
-- L2 maker-checker: approval_status / approved_by / approved_at /
--   rejection_reason guard bill-level discounts before finalisation.
-- ip_admission_id column is present; FK to ip_admissions(id) is
--   wired in the IP module migration.
-- Also wires deferred invoice_id FKs on tokens, lab_orders,
--   radiology_orders, and pharmacy_sales.
-- ============================================================

CREATE TABLE invoices (

    id                      uuid            NOT NULL DEFAULT uuidv7(),

    -- Human-readable invoice reference (e.g. INV-2026-00042)
    invoice_number          text            NOT NULL,

    -- Determines the billing workflow and reporting bucket
    invoice_type            text            NOT NULL,

    patient_id              uuid            NOT NULL,

    -- OP visit context — NULL for direct-counter invoices (lab, pharmacy, radiology)
    op_visit_id             uuid,

    -- IP admission context — FK to ip_admissions(id) wired in IP module migration
    ip_admission_id         uuid,

    invoice_date            date            NOT NULL DEFAULT current_date,

    -- ── Amount columns ───────────────────────────────────────────
    -- Sum of (quantity × unit_price) across all line items; maintained
    -- by fn_recompute_invoice_totals() in invoice_items trigger (V64).
    subtotal                numeric(14,2)   NOT NULL DEFAULT 0,

    -- Sum of line_discount_amount across all line items; maintained
    -- by fn_recompute_invoice_totals().
    total_line_discount     numeric(14,2)   NOT NULL DEFAULT 0,

    -- Bill-level percentage discount (mutually exclusive use with bill_discount_amount
    -- is a business rule; both may be non-zero only when explicitly authorised).
    bill_discount_pct       numeric(4,2),

    -- Absolute bill-level discount (e.g. management waiver, camp subsidy)
    bill_discount_amount    numeric(14,2)   NOT NULL DEFAULT 0,

    -- Free text reason; mandatory whenever any discount is applied (chk_invoices_discount_reason)
    bill_discount_reason    text,

    -- Auditable category for reporting and compliance
    bill_discount_category  text,

    -- GENERATED: total_discount = total_line_discount + bill_discount_amount
    total_discount          numeric(14,2)   NOT NULL
        GENERATED ALWAYS AS (total_line_discount + bill_discount_amount) STORED,

    -- GST and other taxes; maintained by fn_recompute_invoice_totals()
    total_tax               numeric(14,2)   NOT NULL DEFAULT 0,

    -- Net payable after discounts and tax; maintained by fn_recompute_invoice_totals()
    total_amount            numeric(14,2)   NOT NULL DEFAULT 0,

    -- Cumulative payments posted against this invoice
    amount_paid             numeric(14,2)   NOT NULL DEFAULT 0,

    -- GENERATED: balance = total_amount - amount_paid
    balance                 numeric(14,2)   NOT NULL
        GENERATED ALWAYS AS (total_amount - amount_paid) STORED,

    -- Lifecycle status of the invoice
    payment_status          text            NOT NULL DEFAULT 'draft',

    -- ── Insurance split ──────────────────────────────────────────
    -- Portion payable by the insurer (TPA / corporate)
    insurance_covered_amount numeric(14,2)  NOT NULL DEFAULT 0,

    -- Portion payable directly by the patient after insurance
    patient_copay_amount    numeric(14,2)   NOT NULL DEFAULT 0,

    -- Timestamp at which the invoice was locked and sent to the patient
    finalized_at            timestamptz,

    -- Client-supplied UUID for idempotent creation on retries
    idempotency_key         uuid,

    -- ── L2 Maker-checker ─────────────────────────────────────────
    -- Required for invoices carrying bill-level discounts or manual overrides
    approval_status         text            NOT NULL DEFAULT 'pending_approval',
    approved_by             uuid,
    approved_at             timestamptz,
    rejection_reason        text,

    -- ── Uniform audit + soft-delete block ────────────────────────
    created_by              uuid            NOT NULL,
    created_at              timestamptz     NOT NULL DEFAULT now(),
    updated_by              uuid,
    updated_at              timestamptz     NOT NULL DEFAULT now(),
    version                 int             NOT NULL DEFAULT 0,
    deleted_at              timestamptz,
    deleted_by              uuid,

    -- ── Constraints ──────────────────────────────────────────────
    CONSTRAINT pk_invoices
        PRIMARY KEY (id),

    CONSTRAINT uq_invoices_number
        UNIQUE (invoice_number),

    CONSTRAINT fk_invoices_patient
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE RESTRICT,

    CONSTRAINT fk_invoices_visit
        FOREIGN KEY (op_visit_id) REFERENCES op_visits(id) ON DELETE RESTRICT,

    CONSTRAINT fk_invoices_approved_by
        FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE RESTRICT,

    CONSTRAINT chk_invoices_number_len
        CHECK (char_length(invoice_number) BETWEEN 5 AND 30),

    CONSTRAINT chk_invoices_type
        CHECK (invoice_type IN (
            'op','ip_interim','ip_final','pharmacy',
            'lab_direct','radiology_direct','other'
        )),

    CONSTRAINT chk_invoices_status
        CHECK (payment_status IN (
            'draft','finalized','paid','partially_paid','refunded','cancelled'
        )),

    CONSTRAINT chk_invoices_discount_pct
        CHECK (bill_discount_pct IS NULL OR (bill_discount_pct > 0 AND bill_discount_pct <= 100)),

    CONSTRAINT chk_invoices_discount_category
        CHECK (bill_discount_category IS NULL OR bill_discount_category IN (
            'senior_citizen','staff','camp','corporate','charity','management','special'
        )),

    -- Discount reason is mandatory whenever any discount (line or bill-level) is applied
    CONSTRAINT chk_invoices_discount_reason
        CHECK ((total_line_discount = 0 AND bill_discount_amount = 0) OR bill_discount_reason IS NOT NULL),

    CONSTRAINT chk_invoices_amounts
        CHECK (subtotal >= 0 AND total_tax >= 0 AND total_amount >= 0 AND amount_paid >= 0),

    CONSTRAINT chk_invoices_amount_paid
        CHECK (amount_paid <= total_amount),

    -- Segregation of duties: creator and approver must differ
    CONSTRAINT chk_invoices_sod
        CHECK (created_by <> approved_by OR approved_by IS NULL),

    -- At most one visit context (OP or IP); direct-counter invoices have neither
    CONSTRAINT chk_invoices_context
        CHECK (num_nonnulls(op_visit_id, ip_admission_id) <= 1),

    CONSTRAINT chk_invoices_approval_status
        CHECK (approval_status IN ('pending_approval','approved','rejected'))
);

-- ── Indexes ───────────────────────────────────────────────────

-- Partial unique index: idempotency_key only meaningful when non-NULL
CREATE UNIQUE INDEX uq_invoices_idempotency
    ON invoices (idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- Patient billing history — most recent first
CREATE INDEX ix_invoices_patient
    ON invoices (patient_id, invoice_date DESC)
    WHERE deleted_at IS NULL;

-- Finance / cashier workflow by status and date
CREATE INDEX ix_invoices_status
    ON invoices (payment_status, invoice_date)
    WHERE deleted_at IS NULL;

-- Overdue receivables dashboard — open balances on non-terminal invoices
CREATE INDEX ix_invoices_overdue
    ON invoices (payment_status, balance)
    WHERE balance > 0
      AND payment_status NOT IN ('cancelled','draft')
      AND deleted_at IS NULL;

-- Resolve invoice from a visit
CREATE INDEX ix_invoices_visit
    ON invoices (op_visit_id)
    WHERE op_visit_id IS NOT NULL AND deleted_at IS NULL;

-- ── Triggers ──────────────────────────────────────────────────

-- Layer 1: bump updated_at on every UPDATE
CREATE TRIGGER tr_invoices_bu_touch
    BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

-- Layer 3: full-row audit trail
CREATE TRIGGER tr_invoices_au_audit
    AFTER INSERT OR UPDATE OR DELETE ON invoices
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  invoices IS 'Billing invoice header. GENERATED columns: total_discount = total_line_discount + bill_discount_amount; balance = total_amount - amount_paid. L2 maker-checker for discount approval.';
COMMENT ON COLUMN invoices.invoice_number          IS 'Human-readable invoice reference (e.g. INV-2026-00042). 5–30 characters. Globally unique.';
COMMENT ON COLUMN invoices.invoice_type            IS 'op | ip_interim | ip_final | pharmacy | lab_direct | radiology_direct | other. Determines billing workflow and reporting bucket.';
COMMENT ON COLUMN invoices.patient_id              IS 'Patient being billed. FK → patients(id) RESTRICT.';
COMMENT ON COLUMN invoices.op_visit_id             IS 'OP visit this invoice belongs to. NULL for IP or direct-counter invoices. FK → op_visits(id) RESTRICT.';
COMMENT ON COLUMN invoices.ip_admission_id         IS 'FK → ip_admissions(id) RESTRICT — constraint added in IP module migration. NULL for OP invoices.';
COMMENT ON COLUMN invoices.invoice_date            IS 'Calendar date of invoice raising. Defaults to current_date at creation.';
COMMENT ON COLUMN invoices.subtotal                IS 'Sum of (quantity × unit_price) across all line items. Maintained by fn_recompute_invoice_totals() on invoice_items.';
COMMENT ON COLUMN invoices.total_line_discount     IS 'Sum of line_discount_amount across all line items. Maintained by fn_recompute_invoice_totals().';
COMMENT ON COLUMN invoices.bill_discount_pct       IS 'Bill-level percentage discount. NULL when not applicable. Must be > 0 and ≤ 100 when set.';
COMMENT ON COLUMN invoices.bill_discount_amount    IS 'Absolute bill-level discount amount (e.g. management waiver, charity subsidy). 0 when not applicable.';
COMMENT ON COLUMN invoices.bill_discount_reason    IS 'Free-text reason for any discount applied. Mandatory whenever total_line_discount > 0 or bill_discount_amount > 0 (chk_invoices_discount_reason).';
COMMENT ON COLUMN invoices.bill_discount_category  IS 'senior_citizen | staff | camp | corporate | charity | management | special. NULL when no bill-level discount.';
COMMENT ON COLUMN invoices.total_discount          IS 'GENERATED ALWAYS AS (total_line_discount + bill_discount_amount) STORED — never written by app.';
COMMENT ON COLUMN invoices.total_tax               IS 'Sum of all GST amounts across line items. Maintained by fn_recompute_invoice_totals().';
COMMENT ON COLUMN invoices.total_amount            IS 'Net payable after discounts and tax. Maintained by fn_recompute_invoice_totals().';
COMMENT ON COLUMN invoices.amount_paid             IS 'Cumulative payments posted against this invoice. Updated by the payments module.';
COMMENT ON COLUMN invoices.balance                 IS 'GENERATED ALWAYS AS (total_amount - amount_paid) STORED — never written by app.';
COMMENT ON COLUMN invoices.payment_status          IS 'draft | finalized | paid | partially_paid | refunded | cancelled. Terminal states: paid, refunded, cancelled.';
COMMENT ON COLUMN invoices.insurance_covered_amount IS 'Portion of total_amount to be claimed from insurer / TPA / corporate. 0 for self-pay invoices.';
COMMENT ON COLUMN invoices.patient_copay_amount    IS 'Portion payable directly by the patient after insurance coverage. Equals total_amount when self-pay.';
COMMENT ON COLUMN invoices.finalized_at            IS 'Timestamp at which the invoice was locked (payment_status → finalized). NULL while in draft.';
COMMENT ON COLUMN invoices.idempotency_key         IS 'Client UUID to prevent duplicate invoice creation on retries.';
COMMENT ON COLUMN invoices.approval_status         IS 'pending_approval | approved | rejected. L2 maker-checker gate for bill-level discounts.';
COMMENT ON COLUMN invoices.approved_by             IS 'User who approved or rejected the invoice. Must differ from created_by (chk_invoices_sod). FK → users(id) RESTRICT.';
COMMENT ON COLUMN invoices.approved_at             IS 'Timestamp of approval or rejection decision.';
COMMENT ON COLUMN invoices.rejection_reason        IS 'Free-text reason recorded when approval_status = rejected.';
COMMENT ON COLUMN invoices.version                 IS 'Owned by Hibernate @Version. Trigger does NOT touch this column.';
COMMENT ON COLUMN invoices.deleted_at              IS 'Soft-delete timestamp. NULL = live row.';
COMMENT ON CONSTRAINT chk_invoices_discount_reason ON invoices IS 'Discount reason is mandatory whenever any discount (line or bill-level) is applied.';

-- ── Wire all deferred invoice_id FKs now that invoices exists ─

ALTER TABLE tokens
    ADD CONSTRAINT fk_tokens_invoice
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT;

ALTER TABLE lab_orders
    ADD CONSTRAINT fk_lab_orders_invoice
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT;

ALTER TABLE radiology_orders
    ADD CONSTRAINT fk_radiology_orders_invoice
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT;

ALTER TABLE pharmacy_sales
    ADD CONSTRAINT fk_pharmacy_sales_invoice
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT;
