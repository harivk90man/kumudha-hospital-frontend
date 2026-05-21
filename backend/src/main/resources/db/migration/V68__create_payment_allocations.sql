-- ============================================================
-- V68__create_payment_allocations.sql
-- Immutable allocation of payments to billing targets.
-- UPDATE and DELETE are blocked — corrections insert a reversal row.
-- Targets: invoice | pharmacy_sale | ip_advance | refund | on_account.
-- ip_admission_id is a plain uuid column here; the FK constraint
-- is added in the IP module migration when ip_admissions exists.
-- on_account rows have no FK target — funds held for future allocation.
-- No soft-delete columns (append-only; hard corrections via reversal).
-- ============================================================

-- ── Custom append-only guard ──────────────────────────────────
-- A domain-specific message ensures operators understand that
-- corrections require a reversal row, not an in-place update.

CREATE OR REPLACE FUNCTION fn_payment_allocations_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'payment_allocations rows are immutable — insert a reversal row instead'
        USING ERRCODE = '42501';
END;
$$;

-- ── Table ─────────────────────────────────────────────────────

CREATE TABLE payment_allocations (

    id                  uuid            NOT NULL DEFAULT uuidv7(),

    -- The payment being allocated
    payment_id          uuid            NOT NULL,

    -- Nature of the allocation target
    allocation_type     text            NOT NULL,

    -- Set when allocation_type = 'invoice'
    invoice_id          uuid,

    -- Set when allocation_type = 'pharmacy_sale'
    pharmacy_sale_id    uuid,

    -- Set when allocation_type = 'ip_advance'; FK added in IP module migration
    ip_admission_id     uuid,

    -- Amount allocated from the payment to this target; always positive
    amount              numeric(14,2)   NOT NULL,

    -- Optional free-text notes
    notes               text,

    -- ── No-soft-delete audit block ────────────────────────────
    created_by      uuid        NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_by      uuid,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    version         int         NOT NULL DEFAULT 0,

    -- ── Constraints ──────────────────────────────────────────
    CONSTRAINT pk_payment_allocations
        PRIMARY KEY (id),

    CONSTRAINT fk_payment_allocations_payment
        FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE RESTRICT,

    CONSTRAINT fk_payment_allocations_invoice
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT,

    CONSTRAINT fk_payment_allocations_pharmacy_sale
        FOREIGN KEY (pharmacy_sale_id) REFERENCES pharmacy_sales(id) ON DELETE RESTRICT,

    CONSTRAINT chk_payment_allocations_type
        CHECK (allocation_type IN ('invoice','pharmacy_sale','ip_advance','refund','on_account')),

    CONSTRAINT chk_payment_allocations_amount
        CHECK (amount > 0),

    -- At most one billing target FK may be set per row
    CONSTRAINT chk_payment_allocations_max_one_fk
        CHECK (num_nonnulls(invoice_id, pharmacy_sale_id, ip_admission_id) <= 1),

    -- invoice_id present ↔ allocation_type = 'invoice'
    CONSTRAINT chk_payment_allocations_invoice_fk
        CHECK ((allocation_type = 'invoice') = (invoice_id IS NOT NULL)),

    -- pharmacy_sale_id present ↔ allocation_type = 'pharmacy_sale'
    CONSTRAINT chk_payment_allocations_pharmacy_fk
        CHECK ((allocation_type = 'pharmacy_sale') = (pharmacy_sale_id IS NOT NULL)),

    -- on_account rows must have no FK target at all
    CONSTRAINT chk_payment_allocations_on_account
        CHECK ((allocation_type = 'on_account') = (num_nonnulls(invoice_id, pharmacy_sale_id, ip_admission_id) = 0))
);

-- ── Indexes ───────────────────────────────────────────────────

-- All allocations for a given payment
CREATE INDEX ix_payment_allocations_payment
    ON payment_allocations (payment_id);

-- Reverse-lookup: which payments are allocated against a given invoice
CREATE INDEX ix_payment_allocations_invoice
    ON payment_allocations (invoice_id)
    WHERE invoice_id IS NOT NULL;

-- Reverse-lookup: which payments are allocated against a given pharmacy sale
CREATE INDEX ix_payment_allocations_pharmacy_sale
    ON payment_allocations (pharmacy_sale_id)
    WHERE pharmacy_sale_id IS NOT NULL;

-- ── Triggers ──────────────────────────────────────────────────

-- Append-only guard: block UPDATE and DELETE on this table
CREATE TRIGGER tr_payment_allocations_bu_block
    BEFORE UPDATE OR DELETE ON payment_allocations
    FOR EACH ROW EXECUTE FUNCTION fn_payment_allocations_append_only();

-- Layer 3: full-row audit trail (INSERT, UPDATE, DELETE — UPDATE/DELETE blocked above)
CREATE TRIGGER tr_payment_allocations_au_audit
    AFTER INSERT OR UPDATE OR DELETE ON payment_allocations
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  payment_allocations IS 'Immutable allocation of payments to their billing targets. UPDATE/DELETE blocked — corrections insert a reversal (negative-equivalent) row. ip_admission_id FK added in IP module.';
COMMENT ON COLUMN payment_allocations.payment_id        IS 'The payment being split across billing targets. FK → payments(id) RESTRICT.';
COMMENT ON COLUMN payment_allocations.allocation_type   IS 'invoice | pharmacy_sale | ip_advance | refund | on_account. on_account rows have no FK target — funds held for future allocation.';
COMMENT ON COLUMN payment_allocations.invoice_id        IS 'Set when allocation_type = invoice. FK → invoices(id) RESTRICT.';
COMMENT ON COLUMN payment_allocations.pharmacy_sale_id  IS 'Set when allocation_type = pharmacy_sale. FK → pharmacy_sales(id) RESTRICT.';
COMMENT ON COLUMN payment_allocations.ip_admission_id   IS 'FK → ip_admissions(id) RESTRICT — constraint added in IP module migration. Used for IP advance/deposit allocations.';
COMMENT ON COLUMN payment_allocations.amount            IS 'Amount allocated from the payment to this target. Always positive.';
COMMENT ON COLUMN payment_allocations.version           IS 'Append-only version counter — starts at 0 and never incremented (no updates allowed).';
