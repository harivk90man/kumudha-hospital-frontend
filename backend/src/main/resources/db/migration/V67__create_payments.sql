-- ============================================================
-- V67__create_payments.sql
-- Payment transaction table. One row per payment event (in or out).
-- Every payment is attached to a cash session for daily reconciliation.
-- Either patient_id (registered patient) or walk_in_name (anonymous)
-- must be set — never both, never neither.
-- idempotency_key prevents duplicate recording on client retries.
-- pharmacy_return_id links refund payments to their return transaction.
-- ============================================================

CREATE TABLE payments (

    id                  uuid            NOT NULL DEFAULT uuidv7(),

    -- Registered patient; NULL for walk-in / anonymous payments
    patient_id          uuid,

    -- Walk-in patient name; NULL when patient_id is set
    walk_in_name        text,

    -- Walk-in patient mobile (optional, 10–15 chars)
    walk_in_mobile      text,

    -- Direction of the payment relative to the hospital
    payment_direction   text            NOT NULL,

    -- Payment instrument used
    payment_mode        text            NOT NULL,

    -- Amount collected or refunded; always positive
    amount              numeric(14,2)   NOT NULL,

    -- External reference (UPI transaction ID, card auth code, cheque number, etc.)
    transaction_ref     text,

    -- Staff member at the counter who received or processed this payment
    received_by         uuid            NOT NULL,

    -- Cash session this payment belongs to (mandatory for reconciliation)
    cash_session_id     uuid            NOT NULL,

    -- Client-generated UUID preventing duplicate payment recording on retries
    idempotency_key     uuid,

    -- Set for refund payments (direction=out) linked to a pharmacy return
    pharmacy_return_id  uuid,

    -- Free-text notes
    notes               text,

    -- ── Uniform audit + soft-delete block ────────────────────
    created_by      uuid        NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_by      uuid,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    version         int         NOT NULL DEFAULT 0,
    deleted_at      timestamptz,
    deleted_by      uuid,

    -- ── Constraints ──────────────────────────────────────────
    CONSTRAINT pk_payments
        PRIMARY KEY (id),

    CONSTRAINT fk_payments_patient
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE RESTRICT,

    CONSTRAINT fk_payments_received_by
        FOREIGN KEY (received_by) REFERENCES users(id) ON DELETE RESTRICT,

    CONSTRAINT fk_payments_session
        FOREIGN KEY (cash_session_id) REFERENCES cash_sessions(id) ON DELETE RESTRICT,

    CONSTRAINT fk_payments_pharmacy_return
        FOREIGN KEY (pharmacy_return_id) REFERENCES pharmacy_returns(id) ON DELETE RESTRICT,

    CONSTRAINT chk_payments_direction
        CHECK (payment_direction IN ('in','out')),

    CONSTRAINT chk_payments_mode
        CHECK (payment_mode IN ('cash','card','upi','cheque','net_banking','other')),

    CONSTRAINT chk_payments_amount
        CHECK (amount > 0),

    CONSTRAINT chk_payments_walk_in_mobile_len
        CHECK (walk_in_mobile IS NULL OR char_length(walk_in_mobile) BETWEEN 10 AND 15),

    -- At least one identity must be provided
    CONSTRAINT chk_payments_has_identity
        CHECK (patient_id IS NOT NULL OR walk_in_name IS NOT NULL),

    -- patient_id and walk_in_name are mutually exclusive
    CONSTRAINT chk_payments_not_both_identity
        CHECK (patient_id IS NULL OR walk_in_name IS NULL),

    -- pharmacy_return_id only meaningful for outbound (refund) payments
    CONSTRAINT chk_payments_pharmacy_return
        CHECK (pharmacy_return_id IS NULL OR payment_direction = 'out')
);

-- ── Indexes ───────────────────────────────────────────────────

-- Patient payment history — newest first (partial: registered patients only)
CREATE INDEX ix_payments_patient
    ON payments (patient_id, created_at DESC)
    WHERE patient_id IS NOT NULL AND deleted_at IS NULL;

-- Session reconciliation — all payments in a session, newest first
CREATE INDEX ix_payments_session
    ON payments (cash_session_id, created_at DESC);

-- Direction reporting (daily in/out totals)
CREATE INDEX ix_payments_direction_date
    ON payments (payment_direction, created_at DESC)
    WHERE deleted_at IS NULL;

-- Mode reporting (cash vs UPI vs card breakdown)
CREATE INDEX ix_payments_mode
    ON payments (payment_mode, created_at DESC)
    WHERE deleted_at IS NULL;

-- Partial unique index — idempotency key uniqueness only when present
CREATE UNIQUE INDEX uq_payments_idempotency
    ON payments (idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- ── Triggers ──────────────────────────────────────────────────

-- Layer 1: bump updated_at on every UPDATE
CREATE TRIGGER tr_payments_bu_touch
    BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

-- Layer 3: full-row audit trail
CREATE TRIGGER tr_payments_au_audit
    AFTER INSERT OR UPDATE OR DELETE ON payments
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  payments IS 'Payment transaction. payment_direction=in for receipts, out for refunds. Every payment belongs to a cash session for daily reconciliation. Either patient_id OR walk_in_name — never both, never neither.';
COMMENT ON COLUMN payments.patient_id         IS 'Registered patient linked to this payment. NULL for anonymous walk-in payments.';
COMMENT ON COLUMN payments.walk_in_name       IS 'Full name of a walk-in patient who has no patients row. NULL when patient_id is set.';
COMMENT ON COLUMN payments.walk_in_mobile     IS 'Contact mobile number of the walk-in patient. 10–15 characters when present.';
COMMENT ON COLUMN payments.payment_direction  IS 'in = money received by the hospital; out = money refunded to the patient.';
COMMENT ON COLUMN payments.payment_mode       IS 'Instrument used: cash | card | upi | cheque | net_banking | other.';
COMMENT ON COLUMN payments.amount             IS 'Amount of this payment transaction. Always positive — direction is captured in payment_direction.';
COMMENT ON COLUMN payments.transaction_ref    IS 'External reference from the payment instrument (UPI transaction ID, card auth code, cheque number, etc.).';
COMMENT ON COLUMN payments.received_by        IS 'Staff member at the counter who received or processed this payment. FK → users(id) RESTRICT.';
COMMENT ON COLUMN payments.cash_session_id    IS 'Cash session this payment belongs to. Mandatory for daily reconciliation. FK → cash_sessions(id) RESTRICT.';
COMMENT ON COLUMN payments.idempotency_key    IS 'Client UUID preventing duplicate payment recording on retries.';
COMMENT ON COLUMN payments.pharmacy_return_id IS 'Set for refund payments (direction=out) linked to a pharmacy return transaction.';
COMMENT ON COLUMN payments.version            IS 'Optimistic-lock counter — owned by Hibernate @Version. Trigger does NOT touch this column.';
COMMENT ON COLUMN payments.deleted_at         IS 'Soft-delete timestamp. NULL = live payment.';
