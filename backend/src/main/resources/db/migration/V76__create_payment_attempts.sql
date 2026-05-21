-- ============================================================
-- V77__create_payment_attempts.sql
-- Pre-payment gateway idempotency tracking.
-- One row per payment attempt across all billable service types
-- (appointments, lab orders, radiology orders, pharmacy sales).
-- Exactly one source FK must be non-null.
-- Only status='success' rows link to payments via payment_id.
-- Failed/expired attempts leave no trace in the financial ledger.
-- No soft-delete: attempt rows are permanent audit records.
-- ============================================================

CREATE TABLE payment_attempts (

    id                      uuid            NOT NULL DEFAULT uuidv7(),

    -- Source — exactly one must be non-null (chk_payment_attempts_source)
    appointment_id          uuid,
    lab_order_id            uuid,
    radiology_order_id      uuid,
    pharmacy_sale_id        uuid,

    -- App-generated key sent to gateway; same key re-sent on timeout retry
    gateway_idempotency_key uuid            NOT NULL,

    amount                  numeric(14,2)   NOT NULL,

    payment_mode            text            NOT NULL,

    -- initiated → success | failed | expired
    status                  text            NOT NULL DEFAULT 'initiated',

    -- Set atomically with the payments INSERT on success; NULL otherwise
    payment_id              uuid,

    -- External gateway reference (UPI txn ID, card RRN, NEFT UTR, etc.)
    gateway_ref             text,

    -- Full gateway response payload stored for dispute resolution
    gateway_response        jsonb,

    -- ── Reduced L1 audit (no soft-delete) ────────────────────────
    created_by              uuid            NOT NULL,
    created_at              timestamptz     NOT NULL DEFAULT now(),
    updated_by              uuid,
    updated_at              timestamptz     NOT NULL DEFAULT now(),
    version                 int             NOT NULL DEFAULT 0,

    -- ── Constraints ──────────────────────────────────────────────
    CONSTRAINT pk_payment_attempts
        PRIMARY KEY (id),

    CONSTRAINT fk_payment_attempts_appointment
        FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE RESTRICT,

    CONSTRAINT fk_payment_attempts_lab_order
        FOREIGN KEY (lab_order_id) REFERENCES lab_orders(id) ON DELETE RESTRICT,

    CONSTRAINT fk_payment_attempts_radiology_order
        FOREIGN KEY (radiology_order_id) REFERENCES radiology_orders(id) ON DELETE RESTRICT,

    CONSTRAINT fk_payment_attempts_pharmacy_sale
        FOREIGN KEY (pharmacy_sale_id) REFERENCES pharmacy_sales(id) ON DELETE RESTRICT,

    CONSTRAINT fk_payment_attempts_payment
        FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE RESTRICT,

    CONSTRAINT chk_payment_attempts_source
        CHECK (num_nonnulls(appointment_id, lab_order_id, radiology_order_id, pharmacy_sale_id) = 1),

    CONSTRAINT chk_payment_attempts_mode
        CHECK (payment_mode IN ('cash','card','upi','cheque','net_banking','other')),

    CONSTRAINT chk_payment_attempts_status
        CHECK (status IN ('initiated','success','failed','expired')),

    CONSTRAINT chk_payment_attempts_amount
        CHECK (amount > 0),

    -- payment_id is only valid when the attempt succeeded
    CONSTRAINT chk_payment_attempts_payment_id
        CHECK ((payment_id IS NULL) OR (status = 'success'))
);

-- ── Indexes ───────────────────────────────────────────────────

-- Globally unique gateway idempotency key
CREATE UNIQUE INDEX uq_payment_attempts_gateway_key
    ON payment_attempts (gateway_idempotency_key);

-- One in-flight attempt per source at a time
CREATE UNIQUE INDEX uq_payment_attempts_appt_active
    ON payment_attempts (appointment_id)
    WHERE appointment_id IS NOT NULL AND status = 'initiated';

CREATE UNIQUE INDEX uq_payment_attempts_lab_active
    ON payment_attempts (lab_order_id)
    WHERE lab_order_id IS NOT NULL AND status = 'initiated';

CREATE UNIQUE INDEX uq_payment_attempts_radiology_active
    ON payment_attempts (radiology_order_id)
    WHERE radiology_order_id IS NOT NULL AND status = 'initiated';

CREATE UNIQUE INDEX uq_payment_attempts_pharmacy_active
    ON payment_attempts (pharmacy_sale_id)
    WHERE pharmacy_sale_id IS NOT NULL AND status = 'initiated';

-- All attempts for a source (history lookup)
CREATE INDEX ix_payment_attempts_appointment
    ON payment_attempts (appointment_id)
    WHERE appointment_id IS NOT NULL;

CREATE INDEX ix_payment_attempts_lab
    ON payment_attempts (lab_order_id)
    WHERE lab_order_id IS NOT NULL;

CREATE INDEX ix_payment_attempts_radiology
    ON payment_attempts (radiology_order_id)
    WHERE radiology_order_id IS NOT NULL;

CREATE INDEX ix_payment_attempts_pharmacy
    ON payment_attempts (pharmacy_sale_id)
    WHERE pharmacy_sale_id IS NOT NULL;

-- Ops dashboard: find in-flight and expired attempts
CREATE INDEX ix_payment_attempts_status_date
    ON payment_attempts (status, created_at DESC);

-- ── Triggers ──────────────────────────────────────────────────

CREATE TRIGGER tr_payment_attempts_bu_touch
    BEFORE UPDATE ON payment_attempts
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

CREATE TRIGGER tr_payment_attempts_au_audit
    AFTER INSERT OR UPDATE OR DELETE ON payment_attempts
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  payment_attempts IS 'Pre-payment gateway idempotency tracking. One row per attempt. Only status=success rows link to payments via payment_id. Failed and expired rows carry no financial weight.';
COMMENT ON COLUMN payment_attempts.appointment_id          IS 'OPD consultation fee attempt. Exactly one source FK is non-null (chk_payment_attempts_source).';
COMMENT ON COLUMN payment_attempts.lab_order_id            IS 'Lab order fee attempt. Exactly one source FK is non-null.';
COMMENT ON COLUMN payment_attempts.radiology_order_id      IS 'Radiology procedure fee attempt. Exactly one source FK is non-null.';
COMMENT ON COLUMN payment_attempts.pharmacy_sale_id        IS 'Pharmacy sale attempt. Exactly one source FK is non-null.';
COMMENT ON COLUMN payment_attempts.gateway_idempotency_key IS 'App-generated UUID sent to the payment gateway. Re-sent unchanged on timeout retry so the gateway deduplicates without double-charging.';
COMMENT ON COLUMN payment_attempts.amount                  IS 'Amount attempted. Always positive. Copied from the source entity fee at initiation time.';
COMMENT ON COLUMN payment_attempts.payment_mode            IS 'cash | card | upi | cheque | net_banking | other. Matches payments.payment_mode values.';
COMMENT ON COLUMN payment_attempts.status                  IS 'initiated = in-progress. success = gateway confirmed; payment_id set. failed = definitively declined; no payments row. expired = cleaned up after unresolved timeout.';
COMMENT ON COLUMN payment_attempts.payment_id              IS 'FK to payments row created atomically on success. NULL for non-success rows. If non-null, payment was already processed — return existing data on retry.';
COMMENT ON COLUMN payment_attempts.gateway_ref             IS 'External reference on success: UPI txn ID, card RRN, NEFT UTR. Copied to payments.transaction_ref. NULL for cash and non-success rows.';
COMMENT ON COLUMN payment_attempts.gateway_response        IS 'Full gateway response payload for dispute resolution. NULL for cash payments. Kept even on failure for charge-back investigation.';
COMMENT ON COLUMN payment_attempts.version                 IS 'Owned by Hibernate @Version. Trigger does NOT touch this column.';
