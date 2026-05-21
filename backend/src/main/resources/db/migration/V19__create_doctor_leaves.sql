-- ============================================================
-- V19__create_doctor_leaves.sql
-- Individual doctor leave / unavailability days.
-- Used by appointment slot generator to block a doctor's slots
-- on leave dates — distinct from hospital-wide holidays.
-- ============================================================

CREATE TABLE doctor_leaves (
    id              uuid        NOT NULL DEFAULT uuidv7(),
    doctor_id       uuid        NOT NULL,
    leave_date      date        NOT NULL,
    leave_type      text        NOT NULL,
    reason          text,
    approved_by     uuid,
    created_by      uuid        NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_by      uuid,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    version         int         NOT NULL DEFAULT 0,
    deleted_at      timestamptz,
    deleted_by      uuid,

    CONSTRAINT pk_doctor_leaves PRIMARY KEY (id),
    CONSTRAINT fk_doctor_leaves_doctor FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_doctor_leaves_approver FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_doctor_leaves_type CHECK (leave_type IN ('sick','vacation','conference','emergency','other'))
);

-- One leave entry per doctor per date (no duplicate leave records)
CREATE UNIQUE INDEX uq_doctor_leaves_doctor_date
    ON doctor_leaves (doctor_id, leave_date) WHERE deleted_at IS NULL;

-- Appointment slot generator query: is doctor available on date X?
CREATE INDEX ix_doctor_leaves_doctor_date
    ON doctor_leaves (doctor_id, leave_date) WHERE deleted_at IS NULL;

CREATE TRIGGER tr_doctor_leaves_bu_touch
    BEFORE UPDATE ON doctor_leaves
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

COMMENT ON TABLE  doctor_leaves IS 'Individual doctor leave days — distinct from hospital-wide holidays. Blocks appointment slot generation for the doctor on these dates.';
COMMENT ON COLUMN doctor_leaves.leave_type IS 'sick | vacation | conference | emergency | other';
COMMENT ON COLUMN doctor_leaves.approved_by IS 'Who approved the leave (department head or admin). NULL = self-reported / auto-approved.';
COMMENT ON COLUMN doctor_leaves.version IS 'Owned by Hibernate @Version.';
