-- ============================================================
-- V77__session_constraint_and_payment_trigger.sql
-- Two related changes that complete the Option A payment flow:
--
-- 1. cash_sessions: partial unique index — one open session per
--    cashier at a time (same principle as uq_patient_states_one_active).
--
-- 2. payment_allocations: fn_update_invoice_paid_amount trigger
--    auto-maintains invoices.amount_paid and payment_status on
--    every allocation INSERT — same principle as fn_recompute_invoice_totals
--    on invoice_items.
-- ============================================================

-- ── 1. cash_sessions: one open session per cashier ────────

CREATE UNIQUE INDEX uq_cash_sessions_cashier_active
    ON cash_sessions (opened_by)
    WHERE status = 'open';

COMMENT ON INDEX uq_cash_sessions_cashier_active IS 'One cashier, one open session at a time. A cashier cannot open a second session until the first is closed.';

-- ── 2. fn_update_invoice_paid_amount trigger ──────────────

CREATE OR REPLACE FUNCTION fn_update_invoice_paid_amount()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_paid  numeric(14,2);
    v_total numeric(14,2);
BEGIN
    IF NEW.invoice_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT COALESCE(SUM(amount), 0)
    INTO   v_paid
    FROM   payment_allocations
    WHERE  invoice_id = NEW.invoice_id;

    SELECT total_amount
    INTO   v_total
    FROM   invoices
    WHERE  id = NEW.invoice_id;

    UPDATE invoices
    SET    amount_paid    = v_paid,
           payment_status = CASE
               WHEN v_paid <= 0            THEN 'draft'
               WHEN v_paid >= v_total      THEN 'paid'
               ELSE                             'partially_paid'
           END
    WHERE  id = NEW.invoice_id;

    RETURN NEW;
END;
$$;

CREATE TRIGGER tr_payment_allocations_ai_invoice_paid
    AFTER INSERT ON payment_allocations
    FOR EACH ROW EXECUTE FUNCTION fn_update_invoice_paid_amount();

COMMENT ON FUNCTION fn_update_invoice_paid_amount() IS 'Recomputes invoices.amount_paid (SUM of active allocations) and payment_status on every payment_allocations INSERT. App never writes amount_paid directly.';
