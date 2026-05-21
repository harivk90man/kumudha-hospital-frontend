-- ============================================================
-- V22__create_patient_merges.sql
-- Duplicate-patient merge records. Layer 2 maker-checker.
-- Primary patient survives; secondary is soft-deleted on approval.
-- before_state snapshot enables unmerge if merge was made in error.
-- Schema ref: docs/03-schema/v3/modules/07-patient.html#patient_merges
-- ============================================================

CREATE TABLE patient_merges (

    id                    uuid        NOT NULL DEFAULT uuidv7(),
    primary_patient_id    uuid        NOT NULL,
    secondary_patient_id  uuid        NOT NULL,
    merge_reason          text,
    before_state          jsonb       NOT NULL,

    -- ── Layer 2 — maker-checker ───────────────────────────────
    approval_status       text        NOT NULL DEFAULT 'pending',
    approved_by           uuid,
    approved_at           timestamptz,
    rejection_reason      text,

    -- ── Uniform audit + soft-delete block ────────────────────
    created_by            uuid        NOT NULL,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_by            uuid,
    updated_at            timestamptz NOT NULL DEFAULT now(),
    version               int         NOT NULL DEFAULT 0,
    deleted_at            timestamptz,
    deleted_by            uuid,

    -- ── Constraints ──────────────────────────────────────────
    CONSTRAINT pk_patient_merges
        PRIMARY KEY (id),

    CONSTRAINT fk_patient_merges_primary
        FOREIGN KEY (primary_patient_id)   REFERENCES patients(id) ON DELETE RESTRICT,

    CONSTRAINT fk_patient_merges_secondary
        FOREIGN KEY (secondary_patient_id) REFERENCES patients(id) ON DELETE RESTRICT,

    CONSTRAINT fk_patient_merges_approver
        FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT chk_patient_merges_not_self
        CHECK (primary_patient_id <> secondary_patient_id),

    CONSTRAINT chk_patient_merges_status
        CHECK (approval_status IN ('pending','approved','rejected')),

    -- Separation of duties: the submitter cannot approve their own merge request
    CONSTRAINT chk_patient_merges_maker_checker
        CHECK (
            approval_status = 'pending'
            OR (created_by IS NOT NULL AND approved_by IS NOT NULL AND created_by <> approved_by)
        ),

    -- Approval fields must be internally consistent
    CONSTRAINT chk_patient_merges_approval_consistency
        CHECK (
            (approval_status = 'pending'  AND approved_by IS NULL     AND approved_at IS NULL)
            OR (approval_status = 'approved' AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
            OR (approval_status = 'rejected' AND rejection_reason IS NOT NULL)
        )
);

-- ── Indexes ───────────────────────────────────────────────────

CREATE INDEX ix_patient_merges_primary
    ON patient_merges (primary_patient_id)
    WHERE deleted_at IS NULL;

CREATE INDEX ix_patient_merges_secondary
    ON patient_merges (secondary_patient_id)
    WHERE deleted_at IS NULL;

-- Admin "pending approvals" dashboard
CREATE INDEX ix_patient_merges_pending
    ON patient_merges (approval_status)
    WHERE approval_status = 'pending' AND deleted_at IS NULL;

-- ── Triggers ──────────────────────────────────────────────────

CREATE TRIGGER tr_patient_merges_bu_touch
    BEFORE UPDATE ON patient_merges
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

CREATE TRIGGER tr_patient_merges_au_audit
    AFTER INSERT OR UPDATE OR DELETE ON patient_merges
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  patient_merges IS 'Duplicate-patient merge records. Layer 2 maker-checker: submitter cannot approve their own request. before_state snapshot enables unmerge.';
COMMENT ON COLUMN patient_merges.primary_patient_id   IS 'The surviving patient. RESTRICT: cannot delete primary while a merge record references it.';
COMMENT ON COLUMN patient_merges.secondary_patient_id IS 'The duplicate being merged in. Soft-deleted by the merge service on approval.';
COMMENT ON COLUMN patient_merges.before_state         IS 'Full to_jsonb() snapshot of the secondary patient row captured before soft-delete. Used by the unmerge operation.';
COMMENT ON COLUMN patient_merges.approval_status      IS 'pending | approved | rejected';
COMMENT ON COLUMN patient_merges.approved_by          IS 'Must differ from created_by — enforced by chk_patient_merges_maker_checker. SET NULL if approver user is deactivated.';
COMMENT ON COLUMN patient_merges.version              IS 'Optimistic-lock counter — owned by Hibernate @Version.';
COMMENT ON COLUMN patient_merges.deleted_at           IS 'Soft-delete timestamp. NULL = live row.';
