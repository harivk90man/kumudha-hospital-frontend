-- ============================================================
-- V48__create_radiology_reports.sql
-- Radiology report with L2 maker-checker. One row per report
-- attempt; a radiologist dictates (reported_by_radiologist_id)
-- and a different user approves (approved_by).
-- amended_from_report_id self-FK links a corrected report to
-- the original (which is then set to release_status = 'amended').
-- chk_radiology_reports_sod enforces separation of duties:
-- the dictating radiologist cannot approve their own report.
-- chk_radiology_reports_release_approved keeps release_status
-- and approval_status in sync.
-- fn_radiology_report_release_event() stub fires AFTER UPDATE OF
-- release_status; full domain-event wiring deferred until
-- domain_events table is available.
-- ============================================================

-- ── Release domain-event stub (AFTER UPDATE) ─────────────────
-- Emits a RadiologyReportReleased domain event when the report
-- transitions to released. Full implementation wired when the
-- domain_events table is available.

CREATE OR REPLACE FUNCTION fn_radiology_report_release_event() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    -- Stub: emit RadiologyReportReleased domain event when report is released.
    -- Full implementation wired when domain_events table is available.
    RETURN NEW;
END;
$$;

-- ── Table ─────────────────────────────────────────────────────

CREATE TABLE radiology_reports (

    id                          uuid        NOT NULL DEFAULT uuidv7(),

    -- The imaging order this report belongs to
    radiology_order_id          uuid        NOT NULL,

    -- Radiologist's structured findings (free text or structured template)
    findings                    text,

    -- Radiologist's diagnostic conclusion
    impression                  text,

    -- Suggested follow-up or next steps from the radiologist
    recommendation              text,

    -- Radiologist who dictated / authored the report
    reported_by_radiologist_id  uuid        NOT NULL,

    -- Timestamp when the radiologist completed dictation
    dictated_at                 timestamptz,

    -- Verification and publication lifecycle
    release_status              text        NOT NULL DEFAULT 'pending_verification',

    -- Optional PDF/image bytes for the formatted report
    report_data                 bytea,

    -- Self-FK: when a released report is corrected, a new row is inserted
    -- pointing here; the original row release_status is set to 'amended'
    amended_from_report_id      uuid,

    -- Mandatory substantive reason when this row amends a prior report
    amendment_reason            text,

    -- ── L2 maker-checker columns ─────────────────────────────
    -- reported_by_radiologist_id dictates; approved_by (different user) releases

    approval_status             text        NOT NULL DEFAULT 'pending_approval',

    -- Senior radiologist or QA officer who approved and released the report
    approved_by                 uuid,

    approved_at                 timestamptz,

    -- Reason provided when approval_status = 'rejected'
    rejection_reason            text,

    -- ── Uniform audit + soft-delete block ────────────────────
    created_by      uuid        NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_by      uuid,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    version         int         NOT NULL DEFAULT 0,
    deleted_at      timestamptz,
    deleted_by      uuid,

    -- ── Constraints ──────────────────────────────────────────
    CONSTRAINT pk_radiology_reports
        PRIMARY KEY (id),

    CONSTRAINT fk_radiology_reports_order
        FOREIGN KEY (radiology_order_id) REFERENCES radiology_orders(id) ON DELETE RESTRICT,

    CONSTRAINT fk_radiology_reports_radiologist
        FOREIGN KEY (reported_by_radiologist_id) REFERENCES users(id) ON DELETE RESTRICT,

    CONSTRAINT fk_radiology_reports_amended_from
        FOREIGN KEY (amended_from_report_id) REFERENCES radiology_reports(id) ON DELETE RESTRICT,

    CONSTRAINT fk_radiology_reports_approved_by
        FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE RESTRICT,

    CONSTRAINT chk_radiology_reports_release_status
        CHECK (release_status IN (
            'pending_verification','verified','released','amended','rejected'
        )),

    CONSTRAINT chk_radiology_reports_approval_status
        CHECK (approval_status IN ('pending_approval','approved','rejected')),

    -- release_status=released if and only if approval_status=approved with an approver set
    CONSTRAINT chk_radiology_reports_release_approved
        CHECK (
            (release_status = 'released') = (approval_status = 'approved' AND approved_by IS NOT NULL)
        ),

    -- amendment_reason is mandatory and substantive when this amends a prior report
    CONSTRAINT chk_radiology_reports_amendment_reason
        CHECK (
            (amended_from_report_id IS NULL)
            OR (amendment_reason IS NOT NULL AND char_length(amendment_reason) >= 10)
        ),

    -- Separation of duties: the dictating radiologist cannot approve their own report
    CONSTRAINT chk_radiology_reports_sod
        CHECK (created_by <> approved_by OR approved_by IS NULL)
);

-- ── Indexes ───────────────────────────────────────────────────

-- Verifier / QA worklist — reports awaiting review, newest dictation first
CREATE INDEX ix_radiology_reports_pending
    ON radiology_reports (release_status, dictated_at DESC)
    WHERE release_status = 'pending_verification' AND deleted_at IS NULL;

-- All reports for a radiology order (order detail view, amendment chain)
CREATE INDEX ix_radiology_reports_order
    ON radiology_reports (radiology_order_id)
    WHERE deleted_at IS NULL;

-- Radiologist's personal report history, newest first
CREATE INDEX ix_radiology_reports_radiologist
    ON radiology_reports (reported_by_radiologist_id, dictated_at DESC)
    WHERE deleted_at IS NULL;

-- ── Triggers ──────────────────────────────────────────────────

-- Layer 1: bump updated_at on every UPDATE
CREATE TRIGGER tr_radiology_reports_bu_touch
    BEFORE UPDATE ON radiology_reports
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

-- Layer 3: full-row audit trail
CREATE TRIGGER tr_radiology_reports_au_audit
    AFTER INSERT OR UPDATE OR DELETE ON radiology_reports
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- Domain-event stub: fires only when release_status column changes
CREATE TRIGGER tr_radiology_reports_au_release
    AFTER UPDATE OF release_status ON radiology_reports
    FOR EACH ROW EXECUTE FUNCTION fn_radiology_report_release_event();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  radiology_reports IS 'Radiology report. L2 maker-checker: reported_by_radiologist_id dictates, approved_by (different user) releases. Self-FK amendment chain via amended_from_report_id.';
COMMENT ON COLUMN radiology_reports.radiology_order_id         IS 'Imaging order this report belongs to. ON DELETE RESTRICT — a report cannot be orphaned from its order.';
COMMENT ON COLUMN radiology_reports.findings                   IS 'Radiologist structured findings — free text or populated from a structured reporting template.';
COMMENT ON COLUMN radiology_reports.impression                 IS 'Radiologist diagnostic conclusion derived from the findings.';
COMMENT ON COLUMN radiology_reports.recommendation             IS 'Suggested follow-up, additional imaging, or clinical action from the radiologist.';
COMMENT ON COLUMN radiology_reports.reported_by_radiologist_id IS 'Radiologist who dictated and authored this report. Part of the L2 maker-checker pair (maker).';
COMMENT ON COLUMN radiology_reports.dictated_at                IS 'Timestamp when the radiologist completed dictation and submitted the report for verification.';
COMMENT ON COLUMN radiology_reports.release_status             IS 'pending_verification → verified → released | rejected | amended. released = report visible to requesting doctor and patient.';
COMMENT ON COLUMN radiology_reports.report_data                IS 'Optional raw PDF/image bytes of the formatted report. NULL when the report is rendered on-the-fly from findings/impression columns.';
COMMENT ON COLUMN radiology_reports.amended_from_report_id     IS 'Self-FK: when a released report is corrected, a new row is created pointing here. Original row release_status is set to amended.';
COMMENT ON COLUMN radiology_reports.amendment_reason           IS 'Mandatory substantive reason (≥ 10 characters) when this report amends a prior released report. NULL for first-issue reports.';
COMMENT ON COLUMN radiology_reports.approval_status            IS 'pending_approval → approved | rejected. Drives the L2 checker workflow independently of release_status.';
COMMENT ON COLUMN radiology_reports.approved_by                IS 'Must differ from created_by — enforced by chk_radiology_reports_sod. SET NULL not allowed (RESTRICT) so approver identity is preserved for audit.';
COMMENT ON COLUMN radiology_reports.approved_at                IS 'Timestamp when approved_by signed off the report and triggered release.';
COMMENT ON COLUMN radiology_reports.rejection_reason           IS 'Reason the approver rejected the report for correction. Populated when approval_status = rejected.';
COMMENT ON COLUMN radiology_reports.version                    IS 'Owned by Hibernate @Version. Trigger does NOT touch this column.';
COMMENT ON COLUMN radiology_reports.deleted_at                 IS 'Soft-delete timestamp. NULL = live row.';
COMMENT ON CONSTRAINT chk_radiology_reports_sod ON radiology_reports IS 'Separation of duties: radiologist who dictated cannot approve their own report. Relaxable per system_config radiology.allow_self_approval for single-radiologist deployments.';
