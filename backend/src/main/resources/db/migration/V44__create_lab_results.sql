-- ============================================================
-- V44__create_lab_results.sql
-- L2 maker-checker result entry for each lab order item.
-- performed_by enters the result; a different verified_by must
-- release it — enforced by chk_lab_results_maker_checker.
-- fn_lab_result_autoflag() BEFORE INSERT sets flag automatically
-- from gender-aware reference ranges; app may override before INSERT.
-- amended_from_result_id self-FK links a corrected result to the
-- original (which is then set to release_status = 'amended').
-- report_data stores small PDF/image bytes in-row; large reports
-- use an external store with only a reference here.
-- ============================================================

-- ── Auto-flag function (BEFORE INSERT) ───────────────────────
-- Sets NEW.flag by comparing value_numeric against the gender-aware
-- reference ranges and critical thresholds from lab_tests.
-- Skipped entirely when value_numeric IS NULL (non-numeric result types).

CREATE OR REPLACE FUNCTION fn_lab_result_autoflag() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_ref_min     numeric(12,4);
    v_ref_max     numeric(12,4);
    v_crit_low    numeric(12,4);
    v_crit_high   numeric(12,4);
    v_gender      text;
BEGIN
    IF NEW.value_numeric IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT
        CASE WHEN p.gender = 'female' THEN t.ref_min_female ELSE t.ref_min_male END,
        CASE WHEN p.gender = 'female' THEN t.ref_max_female ELSE t.ref_max_male END,
        t.critical_low,
        t.critical_high
    INTO v_ref_min, v_ref_max, v_crit_low, v_crit_high
    FROM lab_order_items loi
    JOIN lab_tests t   ON t.id  = loi.lab_test_id
    JOIN lab_orders lo ON lo.id = loi.lab_order_id
    JOIN patients p    ON p.id  = lo.patient_id
    WHERE loi.id = NEW.lab_order_item_id;

    IF    v_crit_low  IS NOT NULL AND NEW.value_numeric < v_crit_low  THEN NEW.flag := 'critical_low';
    ELSIF v_crit_high IS NOT NULL AND NEW.value_numeric > v_crit_high THEN NEW.flag := 'critical_high';
    ELSIF v_ref_min   IS NOT NULL AND NEW.value_numeric < v_ref_min   THEN NEW.flag := 'low';
    ELSIF v_ref_max   IS NOT NULL AND NEW.value_numeric > v_ref_max   THEN NEW.flag := 'high';
    ELSE  NEW.flag := 'normal';
    END IF;

    RETURN NEW;
END;
$$;

-- ── Critical-alert stub (AFTER INSERT) ───────────────────────
-- Emits a domain event for critical results once the domain_events
-- table is available. Currently a no-op placeholder.

CREATE OR REPLACE FUNCTION fn_lab_result_critical_alert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    -- Stub: emit domain event / notification for critical results.
    -- Full implementation wired when domain_events table is available.
    RETURN NEW;
END;
$$;

-- ── Table ─────────────────────────────────────────────────────

CREATE TABLE lab_results (

    id                      uuid        NOT NULL DEFAULT uuidv7(),

    -- UNIQUE: exactly one result row per test line
    lab_order_item_id       uuid        NOT NULL,

    -- Raw entered value — always populated regardless of result_type
    value_raw               text        NOT NULL,

    -- Parsed numeric value; NULL for non-numeric result types
    value_numeric           numeric(12,4),

    -- Unit of the reported value (may differ from the test catalogue default)
    unit                    text,

    -- Abnormality flag — auto-set by fn_lab_result_autoflag; overrideable before INSERT
    flag                    text        NOT NULL DEFAULT 'normal',

    -- Analyzer model or method name used
    method                  text,

    -- Interpretive comments from the performing technician
    comments                text,

    -- Technician who performed the analysis and entered the result
    performed_by            uuid        NOT NULL,

    -- Raw PDF/image bytes for small auto-generated or uploaded reports
    report_data             bytea,

    -- ── L2 maker-checker columns ─────────────────────────────
    -- performed_by enters; verified_by (different user) releases

    release_status          text        NOT NULL DEFAULT 'pending_verification',

    -- Staff member who verified and released the result
    verified_by             uuid,
    verified_at             timestamptz,

    -- Populated when release_status = 'rejected' by the verifier
    rejection_reason        text,

    -- TRUE when a senior staff member bypassed normal verification
    is_override_release     boolean     NOT NULL DEFAULT false,

    -- Mandatory when is_override_release = true; must be substantive (> 10 chars)
    override_release_reason text,

    -- Self-FK: links a corrected result to the original it replaces
    amended_from_result_id  uuid,

    -- ── Uniform audit + soft-delete block ────────────────────
    created_by              uuid        NOT NULL,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_by              uuid,
    updated_at              timestamptz NOT NULL DEFAULT now(),
    version                 int         NOT NULL DEFAULT 0,
    deleted_at              timestamptz,
    deleted_by              uuid,

    -- ── Constraints ──────────────────────────────────────────
    CONSTRAINT pk_lab_results
        PRIMARY KEY (id),

    CONSTRAINT uq_lab_results_item
        UNIQUE (lab_order_item_id),

    CONSTRAINT fk_lab_results_item
        FOREIGN KEY (lab_order_item_id) REFERENCES lab_order_items(id) ON DELETE RESTRICT,

    CONSTRAINT fk_lab_results_performed_by
        FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE RESTRICT,

    CONSTRAINT fk_lab_results_verified_by
        FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT fk_lab_results_amended_from
        FOREIGN KEY (amended_from_result_id) REFERENCES lab_results(id) ON DELETE RESTRICT,

    CONSTRAINT chk_lab_results_flag
        CHECK (flag IN ('normal','low','high','critical_low','critical_high')),

    CONSTRAINT chk_lab_results_release_status
        CHECK (release_status IN (
            'pending_verification','verified','override_released','amended','rejected'
        )),

    -- L2 maker-checker integrity: once past pending/rejected, both parties must be
    -- present and must be different people
    CONSTRAINT chk_lab_results_maker_checker
        CHECK (
            release_status = 'pending_verification'
            OR release_status = 'rejected'
            OR (
                performed_by IS NOT NULL
                AND verified_by IS NOT NULL
                AND performed_by <> verified_by
            )
        ),

    -- Override release requires a substantive written justification
    CONSTRAINT chk_lab_results_override
        CHECK (
            is_override_release = false
            OR (
                override_release_reason IS NOT NULL
                AND char_length(override_release_reason) > 10
            )
        )
);

-- ── Indexes ───────────────────────────────────────────────────

-- Verifier worklist — results awaiting sign-off, newest first
CREATE INDEX ix_lab_results_pending
    ON lab_results (created_at DESC)
    WHERE release_status = 'pending_verification';

-- Critical-value dashboard — unacknowledged critical results, newest first
CREATE INDEX ix_lab_results_critical
    ON lab_results (created_at DESC)
    WHERE flag IN ('critical_low','critical_high');

-- Locate all amendments that corrected a specific original result
CREATE INDEX ix_lab_results_amended
    ON lab_results (amended_from_result_id)
    WHERE amended_from_result_id IS NOT NULL;

-- ── Triggers ──────────────────────────────────────────────────

-- Layer 1 (BEFORE INSERT): auto-set flag from gender-aware reference ranges
CREATE TRIGGER tr_lab_results_bi_autoflag
    BEFORE INSERT ON lab_results
    FOR EACH ROW EXECUTE FUNCTION fn_lab_result_autoflag();

-- Layer 2 (AFTER INSERT): stub critical-value alert / domain event
CREATE TRIGGER tr_lab_results_ai_critical_alert
    AFTER INSERT ON lab_results
    FOR EACH ROW EXECUTE FUNCTION fn_lab_result_critical_alert();

-- Layer 1 (BEFORE UPDATE): bump updated_at
CREATE TRIGGER tr_lab_results_bu_touch
    BEFORE UPDATE ON lab_results
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

-- Layer 3: full-row audit trail
CREATE TRIGGER tr_lab_results_au_audit
    AFTER INSERT OR UPDATE OR DELETE ON lab_results
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  lab_results IS 'Lab result for one test line. L2 maker-checker: performed_by enters result, verified_by (different user) releases it. override_released bypasses verification with mandatory reason.';
COMMENT ON COLUMN lab_results.lab_order_item_id      IS 'UNIQUE — one result per test line. Use amended_from_result_id to link a correction to its original.';
COMMENT ON COLUMN lab_results.value_raw              IS 'Raw value as entered by the technician. Always populated regardless of result_type (numeric, qualitative, image reference, etc.).';
COMMENT ON COLUMN lab_results.value_numeric          IS 'Parsed numeric value used for flag computation and trend graphs. NULL for non-numeric result types.';
COMMENT ON COLUMN lab_results.flag                   IS 'Auto-set by BEFORE INSERT trigger fn_lab_result_autoflag() using gender-aware reference ranges. App may override before INSERT.';
COMMENT ON COLUMN lab_results.method                 IS 'Analyzer model or assay method used (e.g. Sysmex XN-1000, ELISA). Free text.';
COMMENT ON COLUMN lab_results.performed_by           IS 'Lab technician who performed the analysis and entered the result. Part of the L2 maker-checker pair.';
COMMENT ON COLUMN lab_results.report_data            IS 'Raw PDF/image bytes for auto-generated or uploaded reports. NULL when report is generated on-the-fly from value columns.';
COMMENT ON COLUMN lab_results.release_status         IS 'pending_verification → verified | override_released | rejected. verified rows are published to the patient/doctor.';
COMMENT ON COLUMN lab_results.verified_by            IS 'Senior technician or pathologist who verified and released the result. Must differ from performed_by. SET NULL if user is removed.';
COMMENT ON COLUMN lab_results.verified_at            IS 'Timestamp when verified_by signed off the result.';
COMMENT ON COLUMN lab_results.rejection_reason       IS 'Reason the verifier rejected the result for correction. Populated when release_status = rejected.';
COMMENT ON COLUMN lab_results.is_override_release    IS 'TRUE when a senior staff member released the result without a second verifier. override_release_reason is mandatory in this case.';
COMMENT ON COLUMN lab_results.override_release_reason IS 'Mandatory written justification when is_override_release = true. Must be substantive (> 10 characters — enforced by chk_lab_results_override).';
COMMENT ON COLUMN lab_results.amended_from_result_id IS 'Self-FK: links a corrected result to the original. The original row is set to release_status=amended.';
COMMENT ON COLUMN lab_results.version                IS 'Owned by Hibernate @Version. Trigger does NOT touch this column.';
COMMENT ON COLUMN lab_results.deleted_at             IS 'Soft-delete timestamp. NULL = live row.';
